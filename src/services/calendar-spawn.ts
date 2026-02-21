import cron, { ScheduledTask } from 'node-cron';
import { getDatabase } from '../db/database.js';
import { getAgentSessionManager } from '../mission-control/agent-session.js';
import { getSoulEngine } from '../souls/soul-engine.js';
import { createLogger } from '../utils/logger.js';
import { nanoid } from 'nanoid';

const logger = createLogger('CalendarSpawn');

export class CalendarSpawnService {
  private cronJob: ScheduledTask | null = null;

  start(): void {
    // Check every minute for pending calendar events that are due
    this.cronJob = cron.schedule('* * * * *', () => {
      this.checkAndSpawn().catch((err) => {
        logger.error(`Calendar spawn check failed: ${err}`);
      });
    });
    logger.info('CalendarSpawnService started — checking every minute');
  }

  stop(): void {
    this.cronJob?.stop();
    this.cronJob = null;
    logger.info('CalendarSpawnService stopped');
  }

  private async checkAndSpawn(): Promise<void> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    // Find events due within the last 5 minutes (in case of missed ticks) that are still pending
    const due = db.prepare(`
      SELECT * FROM calendar_events
      WHERE status = 'pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
      LIMIT 5
    `).all(now) as any[];

    for (const event of due) {
      logger.info(`Spawning ${event.agent} for calendar event ${event.id}`);

      // Mark as running immediately to prevent double-spawn
      db.prepare(`UPDATE calendar_events SET status = 'running', started_at = ? WHERE id = ?`)
        .run(now, event.id);

      try {
        const soulEngine = getSoulEngine();
        const soul = soulEngine.getSoul(event.agent);

        const context = JSON.parse(event.context_json || '{}') as Record<string, any>;
        const task = event.task + (context.brief ? `\n\nContext:\n${context.brief}` : '');

        const manager = getAgentSessionManager();
        const session = manager.spawn({
          machineId: 'local',
          mode: 'sdk',
          task,
          cwd: process.cwd(),
          approvalMode: 'auto',
          model: (soul?.config?.model as string | undefined) || 'claude-sonnet-4-6',
        });

        // Don't mark completed immediately — session is still running.
        // Listen for completion/error events on the session.
        const eventId = event.id;
        const onComplete = (evt: { sessionId: string }) => {
          if (evt.sessionId !== session.id) return;
          db.prepare(`UPDATE calendar_events SET status = 'completed', completed_at = ? WHERE id = ?`)
            .run(Math.floor(Date.now() / 1000), eventId);
          manager.off('complete', onComplete);
          manager.off('error', onError);
          logger.info(`Calendar event ${eventId} completed (session ${session.id})`);
        };
        const onError = (evt: { sessionId: string }) => {
          if (evt.sessionId !== session.id) return;
          db.prepare(`UPDATE calendar_events SET status = 'failed' WHERE id = ?`).run(eventId);
          manager.off('complete', onComplete);
          manager.off('error', onError);
          logger.info(`Calendar event ${eventId} failed (session ${session.id})`);
        };
        manager.on('complete', onComplete);
        manager.on('error', onError);

        logger.info(`Calendar event ${event.id} → session ${session.id} (waiting for completion)`);
      } catch (err) {
        logger.error(`Failed to spawn for calendar event ${event.id}: ${err}`);
        db.prepare(`UPDATE calendar_events SET status = 'failed' WHERE id = ?`).run(event.id);
      }
    }
  }

  /** Fisher2050 calls this to schedule an agent */
  scheduleAgent(agent: string, task: string, scheduledAt: Date, context: Record<string, any> = {}): string {
    const db = getDatabase();
    const id = nanoid();
    db.prepare(`
      INSERT INTO calendar_events (id, agent, task, context_json, scheduled_at, created_by)
      VALUES (?, ?, ?, ?, ?, 'fisher2050')
    `).run(id, agent, task, JSON.stringify(context), Math.floor(scheduledAt.getTime() / 1000));
    logger.info(`Scheduled ${agent} at ${scheduledAt.toISOString()} — event ${id}`);
    return id;
  }
}

let instance: CalendarSpawnService | null = null;

export function getCalendarSpawnService(): CalendarSpawnService {
  if (!instance) instance = new CalendarSpawnService();
  return instance;
}
