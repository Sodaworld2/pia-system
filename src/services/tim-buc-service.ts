/**
 * Tim Buc Service — Session Archivist
 *
 * Listens for every agent session completion across the fleet.
 * On completion: reads session output + metadata, writes a structured
 * row to agent_records (migration 047), and pings Eliyahu if significant.
 *
 * Trigger:  AgentSessionManager 'complete' event
 * Output:   agent_records table row
 * Machine:  M1 (hub) — collects records from all machines
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('TimBuc');

interface SessionCompleteEvent {
  sessionId: string;
  result: {
    success: boolean;
    summary: string;
    costUsd: number;
    toolCalls: number;
    inputTokens?: number;
    outputTokens?: number;
    entries?: Array<{ type: string; output?: string; tool?: string; input?: unknown }>;
  };
}

interface AgentRecordInput {
  session_id: string;
  agent: string;
  machine_id: string;
  project: string;
  task_summary: string;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  tool_calls: number;
  quality_score: number | null;
  quality_verdict: string | null;
  produced_files: string;   // JSON array
  consumed_files: string;   // JSON array
  summary: string;
  filed_by: string;
}

class TimBucService {
  private started = false;
  private sessionCount = 0;

  start(): void {
    if (this.started) return;
    this.started = true;

    // Attach listener to AgentSessionManager
    this.attachListener();
    logger.info('Tim Buc is watching — every session end will be filed');
  }

  private async attachListener(): Promise<void> {
    try {
      const { getAgentSessionManager } = await import('../mission-control/agent-session.js');
      const mgr = getAgentSessionManager();

      mgr.on('complete', (evt: SessionCompleteEvent) => {
        this.fileSession(evt).catch((err) => {
          logger.error(`Tim Buc filing failed for ${evt.sessionId}: ${err}`);
        });
      });

      logger.info('Tim Buc attached to AgentSessionManager complete events');
    } catch (err) {
      logger.error(`Tim Buc failed to attach listener: ${err}`);
    }
  }

  private async fileSession(evt: SessionCompleteEvent): Promise<void> {
    try {
      const { getAgentSessionManager } = await import('../mission-control/agent-session.js');
      const { getDatabase } = await import('../db/database.js');

      const mgr = getAgentSessionManager();
      const session = mgr.getSession(evt.sessionId);
      if (!session) {
        logger.warn(`Tim Buc: session ${evt.sessionId} not found — skipping`);
        return;
      }

      const db = getDatabase();

      // Resolve result — SDK mode fires 'complete' without a result object.
      // Fall back to session-level tracking in that case.
      const result = evt.result || {
        success: session.status === 'idle',
        summary: session.outputBuffer.substring(0, 500) || 'SDK session completed',
        costUsd: session.cost || 0,
        toolCalls: session.toolCalls || 0,
        inputTokens: session.tokensIn,
        outputTokens: session.tokensOut,
        entries: undefined,
      };

      // Extract produced and consumed files from journal entries (API mode only)
      const produced: string[] = [];
      const consumed: string[] = [];

      if (result.entries) {
        for (const entry of result.entries) {
          if (entry.type === 'tool_call' && entry.tool) {
            const inp = entry.input as Record<string, unknown> | undefined;
            if ((entry.tool === 'Write' || entry.tool === 'NotebookEdit') && inp?.file_path) {
              produced.push(String(inp.file_path));
            }
            if (entry.tool === 'Read' && inp?.file_path) {
              consumed.push(String(inp.file_path));
            }
            if (entry.tool === 'Bash' && entry.output) {
              // Detect file writes in bash output
              const writeMatch = String(entry.output).match(/wrote.*?([^\s]+\.(ts|js|json|md|html|css))/gi);
              if (writeMatch) produced.push(...writeMatch);
            }
          }
        }
      }

      // Derive project from cwd
      const cwd = session.config.cwd || '';
      const project = cwd.split(/[/\\]/).filter(Boolean).pop() || 'unknown';

      // Agent name: prefer soul ID, else task preview
      const agentName = (session.config as any).soulId
        || session.config.task?.substring(0, 50)
        || session.id;

      // Quality score: pre-Ziggi heuristic based on session signals
      // Ziggi is the authoritative reviewer — this is Tim Buc's preliminary filing score only
      let qualityScore: number | null = null;
      let qualityVerdict: string | null = null;
      if (result.success) {
        // Score components (each adds to base 60):
        //   +15 if produced files (agent actually made something)
        //   +10 if tool_calls >= 3 (agent did real work, not just text)
        //   +10 if cost_usd > 0 (tokens were consumed — real session)
        //   +5  if session has a summary (agent reported back)
        let score = 60;
        if (produced.length > 0) score += 15;
        if ((result.toolCalls ?? 0) >= 3) score += 10;
        if ((result.costUsd ?? 0) > 0) score += 10;
        if (result.summary && result.summary.length > 50) score += 5;
        qualityScore = Math.min(score, 100);
        qualityVerdict = qualityScore >= 75 ? 'PASS' : 'PASS_LOW';
      } else {
        // Failed sessions: differentiate between crash (0) and partial work
        const partialWork = produced.length > 0 || (result.toolCalls ?? 0) > 0;
        qualityScore = partialWork ? 35 : 15;
        qualityVerdict = 'FAIL';
      }

      const record: AgentRecordInput = {
        session_id: evt.sessionId,
        agent: agentName,
        machine_id: session.config.machineId || 'local',
        project,
        task_summary: session.config.task?.substring(0, 200) || '',
        cost_usd: result.costUsd || 0,
        tokens_in: session.tokensIn || 0,
        tokens_out: session.tokensOut || 0,
        tool_calls: result.toolCalls || 0,
        quality_score: qualityScore,
        quality_verdict: qualityVerdict,
        produced_files: JSON.stringify([...new Set(produced)]),
        consumed_files: JSON.stringify([...new Set(consumed)]),
        summary: result.summary || (result.success ? 'Session completed successfully' : 'Session failed'),
        filed_by: 'tim_buc',
      };

      // Write to agent_records (migration 047)
      db.prepare(`
        INSERT OR REPLACE INTO agent_records
          (session_id, agent, machine_id, project, task_summary,
           cost_usd, tokens_in, tokens_out, tool_calls,
           quality_score, quality_verdict,
           produced_files, consumed_files, summary, filed_by)
        VALUES
          (@session_id, @agent, @machine_id, @project, @task_summary,
           @cost_usd, @tokens_in, @tokens_out, @tool_calls,
           @quality_score, @quality_verdict,
           @produced_files, @consumed_files, @summary, @filed_by)
      `).run(record);

      this.sessionCount++;
      logger.info(`Tim Buc filed: ${evt.sessionId} [${project}/${record.agent}] cost=$${(result.costUsd ?? 0).toFixed(4)} verdict=${qualityVerdict}`);

      // Ping Eliyahu if 3+ sessions filed this run
      if (this.sessionCount % 3 === 0) {
        this.pingEliyahu(this.sessionCount).catch(() => {});
      }

    } catch (err) {
      logger.error(`Tim Buc filing error: ${err}`);
    }
  }

  private async pingEliyahu(count: number): Promise<void> {
    try {
      const { getAgentBus } = await import('../comms/agent-bus.js');
      getAgentBus().broadcast(
        'tim_buc',
        `Filed: ${count} sessions. Index updated. Eliyahu pinged.`,
        { count, timestamp: Date.now() },
      );
      logger.info(`Tim Buc: Eliyahu pinged (${count} sessions filed)`);
    } catch {
      // AgentBus may not be available — non-fatal
    }
  }

  /** Get recent records for dashboard or Eliyahu */
  async getRecentRecords(limit = 20): Promise<unknown[]> {
    try {
      const { getDatabase } = await import('../db/database.js');
      const db = getDatabase();
      return db.prepare(`
        SELECT * FROM agent_records
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    } catch {
      return [];
    }
  }
}

let timBucInstance: TimBucService | null = null;

export function getTimBucService(): TimBucService {
  if (!timBucInstance) timBucInstance = new TimBucService();
  return timBucInstance;
}

export function startTimBuc(): void {
  getTimBucService().start();
}
