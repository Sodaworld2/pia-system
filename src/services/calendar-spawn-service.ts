/**
 * Calendar Spawn Service — The Automation Engine
 *
 * Polls calendar_events every 60 seconds. When a pending event's scheduled_at
 * arrives, spawns the correct agent (SDK mode, soul injected, preferred_model applied).
 *
 * Post-completion pipeline:
 *   Farcake/Andy/Bird Fountain/Wingspan → Ziggi review (auto-created, +2 min)
 *   Ziggi score < 7 → re-do task created (auto-created, +30 min)
 *
 * Machine: M1 (hub) only.
 */

import { nanoid } from 'nanoid';
import { getDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';
import { getAgentSessionManager } from '../mission-control/agent-session.js';
import config from '../config.js';

const logger = createLogger('CalendarSpawn');

// Agents whose output triggers an automatic Ziggi quality review
const REVIEW_AGENTS = new Set(['farcake', 'andy', 'bird_fountain', 'wingspan', 'coder_machine']);

interface CalendarEvent {
  id: string;
  agent: string;
  task: string;
  context_json: string;
  scheduled_at: number;
  status: string;
  soul_id: string | null;
  created_by: string | null;
}

interface CompleteEvent {
  sessionId: string;
  result: {
    success: boolean;
    summary: string;
    costUsd: number;
    toolCalls: number;
  };
}

class CalendarSpawnService {
  private started = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  // Maps AgentSession.id → calendar_event.id so we can close the loop on completion
  private pendingSessions = new Map<string, string>();

  start(): void {
    if (this.started) return;
    this.started = true;

    this.attachCompletionListener();

    // Poll immediately, then every 60 seconds
    this.pollCalendar().catch((err) => logger.error(`Initial calendar poll failed: ${err}`));
    this.pollInterval = setInterval(() => {
      this.pollCalendar().catch((err) => logger.error(`Calendar poll failed: ${err}`));
    }, 60_000);

    logger.info('CalendarSpawnService started — polling every 60s');
  }

  stop(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.started = false;
    logger.info('CalendarSpawnService stopped');
  }

  private attachCompletionListener(): void {
    const mgr = getAgentSessionManager();
    // SDK mode emits { sessionId } with no result field.
    // API mode emits { sessionId, result }. Normalise here.
    mgr.on('complete', (evt: Partial<CompleteEvent> & { sessionId: string }) => {
      const eventId = this.pendingSessions.get(evt.sessionId);
      if (!eventId) return;
      this.pendingSessions.delete(evt.sessionId);
      // Build a safe result — SDK sessions have no structured result, so default to success
      // (the session completed without throwing, which is considered a pass at this level)
      const result: CompleteEvent['result'] = evt.result ?? {
        success: true,
        summary: '',
        costUsd: 0,
        toolCalls: 0,
      };
      this.handleSessionComplete(eventId, evt.sessionId, result).catch((err) =>
        logger.error(`Post-completion handler failed for event ${eventId}: ${err}`),
      );
    });
  }

  private async pollCalendar(): Promise<void> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const pending = db.prepare(`
      SELECT * FROM calendar_events
      WHERE status = 'pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
      LIMIT 5
    `).all(now) as CalendarEvent[];

    for (const event of pending) {
      await this.spawnForEvent(event);
    }
  }

  private async spawnForEvent(event: CalendarEvent): Promise<void> {
    const db = getDatabase();

    // Atomic claim — prevents double-spawn if two polls overlap
    const claim = db.prepare(
      `UPDATE calendar_events SET status = 'running', started_at = unixepoch()
       WHERE id = ? AND status = 'pending'`,
    ).run(event.id);

    if (claim.changes === 0) return; // Already claimed by another poll cycle

    try {
      const mgr = getAgentSessionManager();
      const context = JSON.parse(event.context_json || '{}') as Record<string, unknown>;

      const session = mgr.spawn({
        mode: 'sdk',
        task: event.task,
        cwd: (context.cwd as string) || process.cwd(),
        approvalMode: 'auto',
        soulId: event.soul_id || event.agent,
        machineId: config.hub.machineName,
        maxBudgetUsd: (context.maxBudgetUsd as number) || 2.0,
        maxTurns: (context.maxTurns as number) || 30,
      });

      this.pendingSessions.set(session.id, event.id);
      logger.info(`Spawned: ${event.agent} (soul=${event.soul_id || event.agent}) for event ${event.id} [session ${session.id}]`);
    } catch (err) {
      db.prepare(
        `UPDATE calendar_events SET status = 'failed', completed_at = unixepoch() WHERE id = ?`,
      ).run(event.id);
      logger.error(`Spawn failed for event ${event.id}: ${err}`);
    }
  }

  private async handleSessionComplete(
    eventId: string,
    sessionId: string,
    result: CompleteEvent['result'],
  ): Promise<void> {
    const db = getDatabase();
    const success = result?.success !== false;

    db.prepare(
      `UPDATE calendar_events SET status = ?, completed_at = unixepoch() WHERE id = ?`,
    ).run(success ? 'completed' : 'failed', eventId);

    const event = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(eventId) as CalendarEvent | undefined;
    if (!event) return;

    logger.info(`Event ${eventId} (${event.agent}) ${success ? 'completed ✓' : 'failed ✗'}`);

    if (success && REVIEW_AGENTS.has(event.agent)) {
      await this.createZiggiReview(event, sessionId, result);
    }

    if (event.agent === 'ziggi') {
      await this.handleZiggiVerdict(event, result);
    }
  }

  private async createZiggiReview(
    sourceEvent: CalendarEvent,
    sessionId: string,
    result: CompleteEvent['result'],
  ): Promise<void> {
    const db = getDatabase();
    const scheduledAt = Math.floor(Date.now() / 1000) + 120; // 2 min — gives Tim Buc time to file

    const task = `Quality review: ${sourceEvent.agent} completed task:
"${sourceEvent.task.substring(0, 200)}"

Session ID: ${sessionId}
Agent summary: ${(result?.summary || 'No summary provided').substring(0, 400)}

Rate the output 1-10. Cite specific issues. If score < 7, state exact re-do instructions.
File verdict to Records DB. Notify Fisher2050 of the verdict.`;

    db.prepare(`
      INSERT INTO calendar_events (id, agent, task, context_json, scheduled_at, status, created_by, soul_id)
      VALUES (?, 'ziggi', ?, ?, ?, 'pending', ?, 'ziggi')
    `).run(
      nanoid(),
      task,
      JSON.stringify({
        sourceEventId: sourceEvent.id,
        sourceAgent: sourceEvent.agent,
        sessionId,
        maxBudgetUsd: 1.0,
        maxTurns: 15,
      }),
      scheduledAt,
      sourceEvent.agent,
    );

    logger.info(`Ziggi review scheduled in 2min for ${sourceEvent.agent} event ${sourceEvent.id}`);
  }

  private async handleZiggiVerdict(
    event: CalendarEvent,
    result: CompleteEvent['result'],
  ): Promise<void> {
    const summary = result?.summary || '';
    const scoreMatch = summary.match(/(\d+)\s*\/\s*10/);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    logger.info(`Ziggi verdict for event ${event.id} — score: ${score ?? 'not parsed'}`);

    if (score !== null && score < 7) {
      const context = JSON.parse(event.context_json || '{}') as Record<string, unknown>;
      const sourceEventId = context.sourceEventId as string | undefined;
      if (sourceEventId) {
        await this.scheduleRedo(sourceEventId, score, summary);
      }
    }
  }

  private async scheduleRedo(
    sourceEventId: string,
    score: number,
    verdict: string,
  ): Promise<void> {
    const db = getDatabase();
    const sourceEvent = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(sourceEventId) as CalendarEvent & { redo_count?: number } | undefined;
    if (!sourceEvent) return;

    // Max 3 re-dos per original task to prevent infinite loops
    const MAX_REDOS = 3;
    const redoCount = (sourceEvent.redo_count ?? 0) + 1;
    if (redoCount > MAX_REDOS) {
      logger.warn(`Re-do limit reached for ${sourceEvent.agent} event ${sourceEventId} — ${MAX_REDOS} attempts made. Escalating to agent_messages inbox.`);
      // Write to Fisher2050 inbox for human review
      db.prepare(`
        INSERT INTO agent_messages (id, to_agent, from_agent, subject, body, read, expires_at, created_at)
        VALUES (?, 'fisher2050', 'ziggi', ?, ?, 0, unixepoch('now', '+7 days'), unixepoch())
      `).run(
        nanoid(),
        `⚠️ Re-do limit hit: ${sourceEvent.agent} scored ${score}/10 after ${MAX_REDOS} attempts`,
        `Agent: ${sourceEvent.agent}\nTask: ${sourceEvent.task.substring(0, 300)}\nLast Ziggi verdict: ${verdict.substring(0, 500)}\n\nAction required: manual review or task cancellation.`,
      );
      return;
    }

    const scheduledAt = Math.floor(Date.now() / 1000) + 1800; // 30 min
    const sourceCtx = JSON.parse(sourceEvent.context_json || '{}') as Record<string, unknown>;

    db.prepare(`
      INSERT INTO calendar_events (id, agent, task, context_json, scheduled_at, status, created_by, soul_id, redo_count)
      VALUES (?, ?, ?, ?, ?, 'pending', 'ziggi', ?, ?)
    `).run(
      nanoid(),
      sourceEvent.agent,
      `RE-DO ${redoCount}/${MAX_REDOS} (Ziggi ${score}/10): ${sourceEvent.task.substring(0, 150)}`,
      JSON.stringify({
        ...sourceCtx,
        isRedo: true,
        redoAttempt: redoCount,
        ziggiVerdict: verdict.substring(0, 300),
        redoScore: score,
      }),
      scheduledAt,
      sourceEvent.soul_id,
      redoCount,
    );

    logger.info(`Re-do ${redoCount}/${MAX_REDOS} scheduled for ${sourceEvent.agent} in 30min (Ziggi score ${score}/10)`);
  }

  /** Manually create a calendar event (used by Fisher2050 or tests) */
  createEvent(params: {
    agent: string;
    task: string;
    scheduledAt: number;
    context?: Record<string, unknown>;
    soulId?: string;
    createdBy?: string;
  }): string {
    const db = getDatabase();
    const id = nanoid();
    db.prepare(`
      INSERT INTO calendar_events (id, agent, task, context_json, scheduled_at, status, created_by, soul_id)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      params.agent,
      params.task,
      JSON.stringify(params.context || {}),
      params.scheduledAt,
      params.createdBy || 'system',
      params.soulId || params.agent,
    );
    logger.info(`Event created: ${params.agent} scheduled at ${new Date(params.scheduledAt * 1000).toISOString()}`);
    return id;
  }
}

let instance: CalendarSpawnService | null = null;

export function getCalendarSpawnService(): CalendarSpawnService {
  if (!instance) instance = new CalendarSpawnService();
  return instance;
}

export function startCalendarSpawn(): void {
  getCalendarSpawnService().start();
}
