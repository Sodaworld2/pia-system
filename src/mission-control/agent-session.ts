/**
 * Agent Session Manager — Wraps Claude in API or PTY mode
 *
 * API mode:  Drives Claude API directly via autonomous-worker, pausing on tool approval
 * PTY mode:  Spawns real `claude` CLI process, parses output for prompts
 *
 * Events emitted:
 *   'output'     — terminal output or agent text
 *   'prompt'     — agent needs user input (Prompt object)
 *   'tool_call'  — agent called a tool
 *   'status'     — status changed
 *   'complete'   — agent finished
 *   'error'      — something went wrong
 */

import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { getDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';
import { getPromptManager } from './prompt-manager.js';
import { ptyManager, PTYWrapper } from '../tunnel/pty-wrapper.js';
import { runAutonomousTask, cancelTask, WorkerResult } from '../orchestrator/autonomous-worker.js';

const logger = createLogger('AgentSession');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentSessionConfig {
  id?: string;
  machineId: string;
  mode: 'api' | 'pty';
  task: string;
  cwd: string;
  approvalMode: 'manual' | 'auto';
  model?: string;
  maxBudgetUsd?: number;
}

export type AgentStatus = 'starting' | 'working' | 'waiting_for_input' | 'idle' | 'done' | 'error';

export interface JournalEntry {
  id: number;
  agentId: string;
  type: string;
  content: string;
  metadata: unknown;
  createdAt: number;
}

export interface AgentSession {
  id: string;
  config: AgentSessionConfig;
  status: AgentStatus;
  createdAt: number;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  outputBuffer: string;
  errorMessage?: string;
  claudeSessionId?: string;  // Claude CLI session ID for --resume
}

// ---------------------------------------------------------------------------
// AgentSessionManager
// ---------------------------------------------------------------------------

export class AgentSessionManager extends EventEmitter {
  private sessions: Map<string, AgentSession> = new Map();
  private ptyInstances: Map<string, PTYWrapper> = new Map();

  constructor() {
    super();
    // Prevent unhandled 'error' event crashes — log instead
    this.on('error', (evt) => {
      logger.error(`AgentSession error: ${JSON.stringify(evt)}`);
    });
  }

  spawn(cfg: AgentSessionConfig): AgentSession {
    const id = cfg.id || nanoid();
    const session: AgentSession = {
      id,
      config: { ...cfg, id },
      status: 'starting',
      createdAt: Date.now(),
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      toolCalls: 0,
      outputBuffer: '',
    };

    this.sessions.set(id, session);

    // Persist to database
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO mc_agent_sessions (id, machine_id, mode, task, cwd, approval_mode, model, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, cfg.machineId, cfg.mode, cfg.task, cfg.cwd, cfg.approvalMode, cfg.model || 'claude-sonnet-4-5-20250929', 'starting');
    } catch (err) {
      logger.error(`Failed to persist session: ${err}`);
    }

    const pm = getPromptManager();
    pm.addJournalEntry(id, 'output', `Agent session created (mode: ${cfg.mode}, approval: ${cfg.approvalMode})`);

    if (cfg.mode === 'api') {
      this.runApiMode(session);
    } else {
      this.runPtyMode(session);
    }

    logger.info(`Agent session ${id} spawned (mode: ${cfg.mode})`);
    return session;
  }

  // -----------------------------------------------------------------------
  // API Mode — uses autonomous-worker.ts
  // -----------------------------------------------------------------------

  private async runApiMode(session: AgentSession): Promise<void> {
    this.setStatus(session, 'working');
    const pm = getPromptManager();

    try {
      const result: WorkerResult = await runAutonomousTask({
        id: session.id,
        description: session.config.task,
        model: session.config.model || 'claude-sonnet-4-5-20250929',
        maxBudgetUsd: session.config.maxBudgetUsd || 5.00,
        projectDir: session.config.cwd,
      });

      // Update session with results
      session.cost = result.costUsd;
      session.tokensIn = result.totalTokens; // autonomous-worker tracks combined
      session.toolCalls = result.toolCalls;

      // Log each entry to journal
      for (const entry of result.log) {
        const entryType = entry.type === 'tool_call' ? 'tool_call' :
          entry.type === 'tool_result' ? 'output' :
            entry.type === 'done' ? 'output' : entry.type;
        const content = entry.tool
          ? `${entry.tool}: ${typeof entry.input === 'string' ? entry.input : (JSON.stringify(entry.input) || '').substring(0, 500)}`
          : (entry.output || '').substring(0, 2000);

        pm.addJournalEntry(session.id, entryType, content);

        // Emit output events
        if (entry.output) {
          session.outputBuffer += entry.output + '\n';
          this.emit('output', { sessionId: session.id, data: entry.output });
        }
        if (entry.type === 'tool_call') {
          this.emit('tool_call', { sessionId: session.id, tool: entry.tool, input: entry.input });
        }
      }

      if (result.success) {
        this.setStatus(session, 'done');
        pm.addJournalEntry(session.id, 'output', `Task completed. Cost: $${result.costUsd.toFixed(4)}, Tools: ${result.toolCalls}`);
      } else {
        session.errorMessage = result.summary;
        this.setStatus(session, 'error');
        pm.addJournalEntry(session.id, 'error', result.summary);
      }

      // Persist final state
      this.persistSession(session);
      this.emit('complete', { sessionId: session.id, result });

    } catch (err) {
      const msg = (err as Error).message;
      session.errorMessage = msg;
      this.setStatus(session, 'error');
      pm.addJournalEntry(session.id, 'error', msg);
      this.persistSession(session);
      this.emit('error', { sessionId: session.id, error: msg });
    }
  }

  // -----------------------------------------------------------------------
  // PTY Mode — spawns real claude CLI
  // -----------------------------------------------------------------------

  private runPtyMode(session: AgentSession): void {
    this.setStatus(session, 'working');
    const pm = getPromptManager();

    try {
      // Spawn Claude in print mode with stream-json for clean, parseable output
      const ptyWrapper = ptyManager.create(session.id, {
        command: 'claude',
        args: ['-p', session.config.task, '--output-format', 'stream-json', '--verbose'],
        cwd: session.config.cwd,
        cols: 16000, // Wide to avoid line wrapping in JSON
      });

      this.ptyInstances.set(session.id, ptyWrapper);

      // JSON parsing pipeline — accumulate lines, parse JSON events
      let jsonBuffer = '';
      let jsonAccumulator = '';

      ptyWrapper.on('output', (rawData: string) => {
        // Strip ANSI escape codes
        const data = rawData
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
          .replace(/\x1b\]\d*;?[^\x07]*\x07/g, '')
          .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
          .replace(/\x1b[()][A-Z0-9]/g, '')
          .replace(/\x1b\[<[a-z]/g, '')
          .replace(/[\x00-\x08\x0e-\x1f]/g, '');

        jsonBuffer += data;
        const lines = jsonBuffer.split('\n');
        jsonBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (jsonAccumulator) {
            jsonAccumulator += trimmed;
          } else if (trimmed.startsWith('{')) {
            jsonAccumulator = trimmed;
          } else {
            continue;
          }

          try {
            const event = JSON.parse(jsonAccumulator);
            jsonAccumulator = '';
            const cleanText = this.handlePtyEvent(session, event);
            if (cleanText) {
              session.outputBuffer += cleanText + '\n';
              this.emit('output', { sessionId: session.id, data: cleanText });
            }
          } catch {
            // Incomplete JSON — keep accumulating, but cap at 100KB
            if (jsonAccumulator.length > 100000) {
              jsonAccumulator = '';
            }
          }
        }
      });

      ptyWrapper.on('exit', (code: number) => {
        this.ptyInstances.delete(session.id);
        if (code === 0) {
          // Set to idle instead of done — keeps session alive for follow-up messages via --resume
          this.setStatus(session, 'idle');
          pm.addJournalEntry(session.id, 'output', `Claude finished. Type a follow-up message to continue the conversation.`);
        } else {
          session.errorMessage = `Claude CLI exited with code ${code}`;
          this.setStatus(session, 'error');
          pm.addJournalEntry(session.id, 'error', `Claude CLI exited with code ${code}`);
        }
        this.persistSession(session);
        this.emit('complete', { sessionId: session.id, code });
      });

      ptyWrapper.on('error', (error: Error) => {
        session.errorMessage = error.message;
        this.setStatus(session, 'error');
        pm.addJournalEntry(session.id, 'error', error.message);
        this.persistSession(session);
        this.emit('error', { sessionId: session.id, error: error.message });
      });

      pm.addJournalEntry(session.id, 'output', 'Claude CLI spawned (print mode + stream-json)');

    } catch (err) {
      const msg = (err as Error).message;
      session.errorMessage = msg;
      this.setStatus(session, 'error');
      pm.addJournalEntry(session.id, 'error', `Failed to spawn PTY: ${msg}`);
      this.persistSession(session);
      this.emit('error', { sessionId: session.id, error: msg });
    }
  }

  private handlePtyEvent(session: AgentSession, event: Record<string, unknown>): string {
    const pm = getPromptManager();

    // Capture Claude CLI session ID from init or result events (needed for --resume)
    if (event.session_id && typeof event.session_id === 'string') {
      session.claudeSessionId = event.session_id;
    }

    // Skip system init events — they don't contain user-visible output
    if (event.type === 'system') return '';

    // stream-json events from claude CLI
    if (event.type === 'assistant' && event.subtype === 'tool_use') {
      session.toolCalls++;
      const toolName = String(event.tool || 'unknown');
      const inputStr = JSON.stringify(event.input).substring(0, 500);
      pm.addJournalEntry(session.id, 'tool_call', `${toolName}: ${inputStr}`);
      return `${toolName}: ${inputStr}`;
    }

    if (event.type === 'assistant') {
      // Extract text from content array or direct text field
      let text = '';
      if (event.message && typeof event.message === 'object') {
        const msg = event.message as Record<string, unknown>;
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'text') {
              text += String((block as Record<string, unknown>).text || '');
            }
          }
        }
      }
      if (!text && event.text) {
        text = String(event.text);
      }
      if (text) {
        pm.addJournalEntry(session.id, 'output', text.substring(0, 2000));
        return text;
      }
    }

    if (event.type === 'result') {
      // Extract cost info — accumulate across follow-up turns
      const totalCost = event.total_cost_usd as number | undefined;
      if (totalCost !== undefined) {
        session.cost += totalCost;
      }
      const usage = event.usage as Record<string, unknown> | undefined;
      if (usage) {
        const inputTokens = (usage.input_tokens as number || 0) +
          (usage.cache_read_input_tokens as number || 0) +
          (usage.cache_creation_input_tokens as number || 0);
        session.tokensIn += inputTokens;
        session.tokensOut += (usage.output_tokens as number || 0);
      }
      this.persistSession(session);
      // Don't return result text — it duplicates the assistant message text
      return '';
    }

    return '';
  }

  // -----------------------------------------------------------------------
  // Session control
  // -----------------------------------------------------------------------

  respond(sessionId: string, response: string | number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`respond: session ${sessionId} not found`);
      return;
    }

    if (session.config.mode === 'pty') {
      const existingPty = this.ptyInstances.get(sessionId);
      if (existingPty) {
        // PTY still running — send raw input
        existingPty.write(String(response) + '\n');
        logger.info(`Sent response to PTY session ${sessionId}: ${response}`);
      } else {
        // PTY finished — spawn a new claude with --resume to continue conversation
        // Note: For --resume we might need to rethink if we want interactive mode there too?
        // But for now let's just fix the active PTY case.
        this.continueConversation(session, String(response));
      }
    }
    // For API mode, prompts are handled via PromptManager callbacks
  }

  private continueConversation(session: AgentSession, message: string): void {
    const pm = getPromptManager();
    this.setStatus(session, 'working');

    // Log user message to journal (frontend already shows it in terminal)
    pm.addJournalEntry(session.id, 'output', `> ${message}`);

    // Build args — need session ID for --resume with -p
    const args = ['-p', message, '--output-format', 'stream-json', '--verbose'];
    if (session.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
    }

    const ptyWrapper = ptyManager.create(session.id + '-cont-' + Date.now(), {
      command: 'claude',
      args,
      cwd: session.config.cwd,
      cols: 16000,
    });

    this.ptyInstances.set(session.id, ptyWrapper);

    let jsonBuffer = '';
    let jsonAccumulator = '';

    ptyWrapper.on('output', (rawData: string) => {
      const data = rawData
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\x1b\]\d*;?[^\x07]*\x07/g, '')
        .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
        .replace(/\x1b[()][A-Z0-9]/g, '')
        .replace(/\x1b\[<[a-z]/g, '')
        .replace(/[\x00-\x08\x0e-\x1f]/g, '');

      jsonBuffer += data;
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (jsonAccumulator) {
          jsonAccumulator += trimmed;
        } else if (trimmed.startsWith('{')) {
          jsonAccumulator = trimmed;
        } else {
          continue;
        }
        try {
          const event = JSON.parse(jsonAccumulator);
          jsonAccumulator = '';
          const cleanText = this.handlePtyEvent(session, event);
          if (cleanText) {
            session.outputBuffer += cleanText + '\n';
            this.emit('output', { sessionId: session.id, data: cleanText });
          }
        } catch {
          if (jsonAccumulator.length > 100000) {
            jsonAccumulator = '';
          }
        }
      }
    });

    ptyWrapper.on('exit', (code: number) => {
      this.ptyInstances.delete(session.id);
      if (code === 0) {
        this.setStatus(session, 'idle');
        pm.addJournalEntry(session.id, 'output', `Ready for follow-up messages.`);
      } else {
        session.errorMessage = `Claude CLI exited with code ${code}`;
        this.setStatus(session, 'error');
        pm.addJournalEntry(session.id, 'error', `Follow-up failed (exit code ${code})`);
      }
      this.persistSession(session);
      this.emit('complete', { sessionId: session.id, code });
    });

    ptyWrapper.on('error', (error: Error) => {
      session.errorMessage = error.message;
      this.setStatus(session, 'error');
      pm.addJournalEntry(session.id, 'error', error.message);
      this.persistSession(session);
      this.emit('error', { sessionId: session.id, error: error.message });
    });

    logger.info(`Continued conversation for ${session.id} (claude session: ${session.claudeSessionId}): ${message.substring(0, 80)}`);
  }

  setMode(sessionId: string, mode: 'manual' | 'auto'): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.config.approvalMode = mode;
      const pm = getPromptManager();
      pm.addJournalEntry(sessionId, 'output', `Approval mode changed to: ${mode}`);
      this.emit('status', { sessionId, approvalMode: mode });
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Kill PTY if applicable
    const pty = this.ptyInstances.get(sessionId);
    if (pty) {
      pty.kill();
      this.ptyInstances.delete(sessionId);
    }

    // Cancel API task if applicable
    if (session.config.mode === 'api') {
      try {
        cancelTask(sessionId);
      } catch { /* may not be running */ }
    }

    this.setStatus(session, 'done');
    session.errorMessage = 'Killed by user';

    const pm = getPromptManager();
    pm.addJournalEntry(sessionId, 'output', 'Agent session killed by user');
    this.persistSession(session);

    this.emit('complete', { sessionId, killed: true });
    logger.info(`Agent session ${sessionId} killed`);
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  getJournal(sessionId: string): JournalEntry[] {
    return getPromptManager().getJournal(sessionId);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private setStatus(session: AgentSession, status: AgentStatus): void {
    const oldStatus = session.status;
    session.status = status;

    // Update database
    try {
      const db = getDatabase();
      const completedAt = (status === 'done' || status === 'error') ? Math.floor(Date.now() / 1000) : null;
      db.prepare(`
        UPDATE mc_agent_sessions SET status = ?, error_message = ?, completed_at = ?
        WHERE id = ?
      `).run(status, session.errorMessage || null, completedAt, session.id);
    } catch (err) {
      logger.error(`Failed to update session status: ${err}`);
    }

    this.emit('status', { sessionId: session.id, status, oldStatus });
    logger.info(`Agent ${session.id}: ${oldStatus} → ${status}`);
  }

  private persistSession(session: AgentSession): void {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE mc_agent_sessions
        SET cost_usd = ?, tokens_in = ?, tokens_out = ?, tool_calls = ?,
            error_message = ?, status = ?,
            completed_at = CASE WHEN ? IN ('done', 'error') THEN unixepoch() ELSE completed_at END
        WHERE id = ?
      `).run(
        session.cost, session.tokensIn, session.tokensOut, session.toolCalls,
        session.errorMessage || null, session.status,
        session.status, session.id,
      );
    } catch (err) {
      logger.error(`Failed to persist session: ${err}`);
    }
  }
}

// Singleton
let sessionManager: AgentSessionManager | null = null;

export function getAgentSessionManager(): AgentSessionManager {
  if (!sessionManager) {
    sessionManager = new AgentSessionManager();
  }
  return sessionManager;
}
