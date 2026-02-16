/**
 * Prompt Manager — Routes agent permission prompts to user or auto-approves
 *
 * Manual mode: queues prompts, broadcasts via WebSocket, waits for user response
 * Auto mode: evaluates basic safety rules, auto-approves safe ops, escalates risky ones
 */

import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { getDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PromptManager');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Prompt {
  id: string;
  agentId: string;
  timestamp: number;
  question: string;
  options: string[];
  type: 'tool_approval' | 'user_question' | 'confirmation';
  status: 'pending' | 'responded' | 'auto_approved' | 'auto_denied';
  response?: string;
  respondedAt?: number;
  autoReason?: string;
}

interface AutoEvalResult {
  auto: boolean;
  response?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Auto-approval rules (basic for Phase 1)
// ---------------------------------------------------------------------------

const SAFE_COMMANDS = [
  'npm test', 'npx tsc', 'npx vitest', 'npm run',
  'git status', 'git diff', 'git log', 'git branch', 'git add', 'git commit',
  'ls', 'dir', 'cat', 'type', 'head', 'tail', 'find', 'wc',
  'echo', 'pwd', 'whoami', 'which', 'where',
  'cp ', 'copy ', 'mv ', 'move ', 'mkdir ', 'md ',
  'node ', 'python ', 'npx ',
  'cd ', 'tree', 'sort', 'uniq', 'diff ',
];

const DANGEROUS_PATTERNS = [
  'rm -rf', 'rm -r /', 'del /s', 'rmdir /s',
  'format ', 'mkfs', 'dd if=',
  'npm publish', 'npm unpublish',
  'git push --force', 'git reset --hard',
  'deploy', 'kubectl', 'docker push',
  'shutdown', 'reboot',
];

function evaluateForAutoResponse(prompt: Prompt): AutoEvalResult {
  const q = prompt.question.toLowerCase();

  // Tool approval prompts — parse what tool/command is being requested
  if (prompt.type === 'tool_approval') {
    // Dangerous patterns — always deny and escalate
    for (const danger of DANGEROUS_PATTERNS) {
      if (q.includes(danger)) {
        return { auto: false, reason: `Dangerous pattern detected: ${danger}` };
      }
    }

    // Read operations are always safe
    if (q.includes('read') || q.includes('glob') || q.includes('grep') || q.includes('search')) {
      return { auto: true, response: '1', reason: 'Read operation — auto-approved' };
    }

    // Write / Edit operations — safe (agent is working on user's project)
    if (q.includes('write') || q.includes('edit')) {
      return { auto: true, response: '1', reason: 'File write/edit — auto-approved' };
    }

    // Safe commands
    for (const safe of SAFE_COMMANDS) {
      if (q.includes(safe)) {
        return { auto: true, response: '1', reason: `Safe command (${safe}) — auto-approved` };
      }
    }

    // Bash commands that aren't in the dangerous list — approve them
    if (q.includes('bash')) {
      return { auto: true, response: '1', reason: 'Bash command (not in deny list) — auto-approved' };
    }

    // Default for tool_approval in auto mode: approve unless dangerous
    return { auto: true, response: '1', reason: 'Auto mode — approved (no dangerous patterns detected)' };
  }

  // Non-tool prompts — escalate to human
  return { auto: false, reason: 'Non-tool prompt — escalating to human' };
}

// ---------------------------------------------------------------------------
// PromptManager
// ---------------------------------------------------------------------------

export class PromptManager extends EventEmitter {
  private pendingCallbacks: Map<string, (response: string) => void> = new Map();

  addPrompt(
    agentId: string,
    question: string,
    options: string[],
    type: Prompt['type'] = 'tool_approval',
    approvalMode: 'manual' | 'auto' = 'manual',
  ): Prompt {
    const prompt: Prompt = {
      id: nanoid(),
      agentId,
      timestamp: Date.now(),
      question,
      options,
      type,
      status: 'pending',
    };

    // Persist to database
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO mc_prompts (id, agent_id, question, options, type, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(prompt.id, prompt.agentId, prompt.question, JSON.stringify(prompt.options), prompt.type, prompt.status);
    } catch (err) {
      logger.error(`Failed to persist prompt: ${err}`);
    }

    // Auto mode — try to evaluate
    if (approvalMode === 'auto') {
      const evalResult = evaluateForAutoResponse(prompt);
      if (evalResult.auto && evalResult.response) {
        prompt.status = 'auto_approved';
        prompt.response = evalResult.response;
        prompt.autoReason = evalResult.reason;
        prompt.respondedAt = Date.now();

        this.updatePromptInDb(prompt);
        this.addJournalEntry(agentId, 'auto_approved', `Auto-approved: ${question.substring(0, 200)}`, { reason: evalResult.reason });

        logger.info(`[Agent ${agentId}] Auto-approved prompt: ${evalResult.reason}`);
        this.emit('auto_response', prompt);
        this.emit('new_prompt', prompt);  // Show in UI feed (already resolved, won't block)
        return prompt;
      }
      // If not auto-approvable, fall through to manual queue
      if (evalResult.reason) {
        this.addJournalEntry(agentId, 'prompt', `Escalated to human: ${evalResult.reason}`, { question: question.substring(0, 200) });
      }
    }

    logger.info(`[Agent ${agentId}] New prompt queued: ${question.substring(0, 100)}`);
    this.emit('new_prompt', prompt);
    return prompt;
  }

  /**
   * Add a prompt and return a promise that resolves when the user responds.
   * Used by agent-session to pause execution until input arrives.
   */
  addPromptAndWait(
    agentId: string,
    question: string,
    options: string[],
    type: Prompt['type'] = 'tool_approval',
    approvalMode: 'manual' | 'auto' = 'manual',
  ): Promise<string> {
    const prompt = this.addPrompt(agentId, question, options, type, approvalMode);

    // If auto-approved, resolve immediately
    if (prompt.status === 'auto_approved' && prompt.response) {
      return Promise.resolve(prompt.response);
    }

    // Otherwise wait for human response
    return new Promise<string>((resolve) => {
      this.pendingCallbacks.set(prompt.id, resolve);
    });
  }

  respond(promptId: string, choice: number | string): void {
    const response = String(choice);

    // Update database
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE mc_prompts SET status = 'responded', response = ?, responded_at = unixepoch()
        WHERE id = ? AND status = 'pending'
      `).run(response, promptId);
    } catch (err) {
      logger.error(`Failed to update prompt response: ${err}`);
    }

    // Resolve waiting callback
    const callback = this.pendingCallbacks.get(promptId);
    if (callback) {
      this.pendingCallbacks.delete(promptId);
      callback(response);
      logger.info(`Prompt ${promptId} responded with: ${response}`);
    } else {
      logger.warn(`No pending callback for prompt ${promptId}`);
    }

    this.emit('response', { promptId, response });
  }

  getPending(): Prompt[] {
    try {
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT id, agent_id as agentId, question, options, type, status, created_at as timestamp
        FROM mc_prompts WHERE status = 'pending' ORDER BY created_at ASC
      `).all() as Array<{
        id: string; agentId: string; question: string; options: string;
        type: string; status: string; timestamp: number;
      }>;
      return rows.map(r => ({
        ...r,
        options: JSON.parse(r.options || '[]'),
        type: r.type as Prompt['type'],
        status: r.status as Prompt['status'],
      }));
    } catch (err) {
      logger.error(`Failed to get pending prompts: ${err}`);
      return [];
    }
  }

  getAll(agentId?: string): Prompt[] {
    try {
      const db = getDatabase();
      const sql = agentId
        ? `SELECT id, agent_id as agentId, question, options, type, status, response, auto_reason as autoReason, created_at as timestamp, responded_at as respondedAt
           FROM mc_prompts WHERE agent_id = ? ORDER BY created_at DESC`
        : `SELECT id, agent_id as agentId, question, options, type, status, response, auto_reason as autoReason, created_at as timestamp, responded_at as respondedAt
           FROM mc_prompts ORDER BY created_at DESC`;
      const rows = (agentId ? db.prepare(sql).all(agentId) : db.prepare(sql).all()) as Array<{
        id: string; agentId: string; question: string; options: string;
        type: string; status: string; response?: string; autoReason?: string;
        timestamp: number; respondedAt?: number;
      }>;
      return rows.map(r => ({
        ...r,
        options: JSON.parse(r.options || '[]'),
        type: r.type as Prompt['type'],
        status: r.status as Prompt['status'],
      }));
    } catch (err) {
      logger.error(`Failed to get prompts: ${err}`);
      return [];
    }
  }

  private updatePromptInDb(prompt: Prompt): void {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE mc_prompts SET status = ?, response = ?, auto_reason = ?, responded_at = unixepoch()
        WHERE id = ?
      `).run(prompt.status, prompt.response, prompt.autoReason, prompt.id);
    } catch (err) {
      logger.error(`Failed to update prompt in db: ${err}`);
    }
  }

  addJournalEntry(agentId: string, type: string, content: string, metadata?: Record<string, unknown>): void {
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO mc_journal (agent_id, type, content, metadata)
        VALUES (?, ?, ?, ?)
      `).run(agentId, type, content, metadata ? JSON.stringify(metadata) : null);
    } catch (err) {
      logger.error(`Failed to add journal entry: ${err}`);
    }
  }

  getJournal(agentId: string): Array<{ id: number; agentId: string; type: string; content: string; metadata: unknown; createdAt: number }> {
    try {
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT id, agent_id as agentId, type, content, metadata, created_at as createdAt
        FROM mc_journal WHERE agent_id = ? ORDER BY created_at ASC
      `).all(agentId) as Array<{
        id: number; agentId: string; type: string; content: string; metadata: string | null; createdAt: number;
      }>;
      return rows.map(r => ({
        ...r,
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
      }));
    } catch (err) {
      logger.error(`Failed to get journal: ${err}`);
      return [];
    }
  }
}

// Singleton
let promptManager: PromptManager | null = null;

export function getPromptManager(): PromptManager {
  if (!promptManager) {
    promptManager = new PromptManager();
  }
  return promptManager;
}
