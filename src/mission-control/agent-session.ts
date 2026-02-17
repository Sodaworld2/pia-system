/**
 * Agent Session Manager — Wraps Claude in API, PTY, or SDK mode
 *
 * SDK mode:  Uses Claude Agent SDK (query API) — clean events, no terminal hacks
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
import * as fs from 'fs';
import { spawn as cpSpawn } from 'child_process';
import { nanoid } from 'nanoid';
import { getDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';
import { getPromptManager } from './prompt-manager.js';
import { ptyManager, PTYWrapper } from '../tunnel/pty-wrapper.js';
import { runAutonomousTask, cancelTask, WorkerResult } from '../orchestrator/autonomous-worker.js';
import { getNodeSpawnEnv } from '../electron-paths.js';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Query, SDKMessage, SDKAssistantMessage, SDKResultMessage,
  SDKSystemMessage, SDKToolProgressMessage, SDKToolUseSummaryMessage,
  SDKStatusMessage, PermissionResult } from '@anthropic-ai/claude-agent-sdk';

const logger = createLogger('AgentSession');

// ---------------------------------------------------------------------------
// Network Policy — inspired by gh-aw Agent Workflow Firewall
// ---------------------------------------------------------------------------

export interface NetworkPolicy {
  allowedDomains?: string[];   // Only these domains may be reached
  blockedDomains?: string[];   // These domains are always blocked
  ecosystems?: string[];       // Presets: 'npm', 'pip', 'github', 'anthropic'
}

const ECOSYSTEM_DOMAINS: Record<string, string[]> = {
  npm:       ['registry.npmjs.org', 'npmjs.com', 'registry.yarnpkg.com'],
  pip:       ['pypi.org', 'files.pythonhosted.org'],
  github:    ['api.github.com', 'github.com', 'raw.githubusercontent.com'],
  anthropic: ['api.anthropic.com'],
};

/** Check a Bash command for URLs that violate the network policy */
function checkNetworkPolicy(cmd: string, policy: NetworkPolicy): string | null {
  const urlMatches = cmd.match(/https?:\/\/([^\s\/'"]+)/g);
  if (!urlMatches) return null;

  // Build allowed set from ecosystems + explicit domains
  const allowed = new Set<string>();
  for (const eco of policy.ecosystems || []) {
    for (const d of ECOSYSTEM_DOMAINS[eco] || []) allowed.add(d);
  }
  for (const d of policy.allowedDomains || []) allowed.add(d);

  for (const rawUrl of urlMatches) {
    try {
      const domain = new URL(rawUrl).hostname;
      // Blocked domains always take priority
      if (policy.blockedDomains?.some(b => domain === b || domain.endsWith('.' + b))) {
        return `Domain ${domain} is blocked by network policy`;
      }
      // If an allowlist is active, domain must be in it
      if (allowed.size > 0 && !allowed.has(domain)) {
        return `Domain ${domain} not in network allowlist`;
      }
    } catch { /* unparseable URL, skip */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Secret masking — collect env var values that look like secrets
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i;
const secretValues: string[] = [];

// Collect on startup — only values 6+ chars to avoid false positives
for (const [key, val] of Object.entries(process.env)) {
  if (val && val.length >= 6 && SECRET_PATTERNS.test(key)) {
    secretValues.push(val);
  }
}

/** Mask known secret values and strip XSS vectors from output */
function sanitizeOutput(text: string): string {
  let result = text;

  // Mask secret values (show first 3 chars + asterisks)
  for (const secret of secretValues) {
    if (result.includes(secret)) {
      const masked = secret.substring(0, 3) + '*'.repeat(Math.min(secret.length - 3, 20));
      result = result.split(secret).join(masked);
    }
  }

  // Strip XSS vectors — <script> tags, event handlers
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '[script-removed]');
  result = result.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '[event-removed]');

  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentSessionConfig {
  id?: string;
  machineId: string;
  mode: 'api' | 'pty' | 'sdk';
  task: string;
  cwd: string;
  approvalMode: 'manual' | 'auto' | 'yolo' | 'plan';
  model?: string;
  maxBudgetUsd?: number;
  effort?: 'low' | 'medium' | 'high' | 'max';
  systemPrompt?: string;
  maxTurns?: number;
  disallowedTools?: string[];
  allowedTools?: string[];           // If set, ONLY these tools are permitted (allowlist > blocklist)
  additionalDirectories?: string[];
  networkPolicy?: NetworkPolicy;
  mcpServers?: Array<{
    name: string;
    transport: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    url?: string;
  }>;
  fallbackModel?: string;
  enableCheckpointing?: boolean;
  loadProjectSettings?: boolean;
  autoRestart?: boolean;
  maxRestarts?: number;
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
  restartCount: number;
}

// ---------------------------------------------------------------------------
// AgentSessionManager
// ---------------------------------------------------------------------------

export class AgentSessionManager extends EventEmitter {
  private sessions: Map<string, AgentSession> = new Map();
  private ptyInstances: Map<string, PTYWrapper> = new Map();
  private sdkQueries: Map<string, Query> = new Map();
  private processedMessageIds: Set<string> = new Set(); // Deduplicate cost tracking

  constructor() {
    super();
    // Prevent unhandled 'error' event crashes — log instead
    this.on('error', (evt) => {
      logger.error(`AgentSession error: ${JSON.stringify(evt)}`);
    });
  }

  /** Override emit to sanitize all output before broadcasting */
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'output' && args[0] && typeof args[0] === 'object') {
      const evt = args[0] as Record<string, unknown>;
      if (typeof evt.data === 'string') {
        evt.data = sanitizeOutput(evt.data);
      }
    }
    return super.emit(event, ...args);
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
      restartCount: 0,
    };

    this.sessions.set(id, session);

    // Persist to database
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO mc_agent_sessions (id, machine_id, mode, task, cwd, approval_mode, model, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, cfg.machineId, cfg.mode, cfg.task, cfg.cwd, cfg.approvalMode, cfg.model || 'claude-opus-4-6', 'starting');
    } catch (err) {
      logger.error(`Failed to persist session: ${err}`);
    }

    const pm = getPromptManager();
    pm.addJournalEntry(id, 'output', `Agent session created (mode: ${cfg.mode}, approval: ${cfg.approvalMode})`);

    // If no task provided, start idle and wait for first message
    if (!cfg.task || !cfg.task.trim()) {
      this.setStatus(session, 'idle');
      pm.addJournalEntry(id, 'output', `Ready — type a message to start working on ${cfg.cwd}`);
      this.emit('output', { sessionId: id, data: `Ready — type a message to start working on ${cfg.cwd}` });
    } else if (cfg.mode === 'sdk') {
      this.runSdkMode(session);
    } else if (cfg.mode === 'api') {
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
        model: session.config.model || 'claude-opus-4-6',
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
  // SDK Mode — uses @anthropic-ai/claude-agent-sdk
  // -----------------------------------------------------------------------

  private async runSdkMode(session: AgentSession): Promise<void> {
    this.setStatus(session, 'working');
    const pm = getPromptManager();

    try {
      // canUseTool bridges SDK permission requests → PromptManager → UI
      const canUseTool = async (
        toolName: string,
        input: Record<string, unknown>,
        _options: { signal: AbortSignal; toolUseID: string; agentID?: string },
      ): Promise<PermissionResult> => {
        const inputStr = JSON.stringify(input).substring(0, 1000);
        const question = `${toolName}: ${inputStr}`;

        // --- Policy checks (run before any approval mode) ---

        // Tool allowlist — if defined, only these tools can run
        if (session.config.allowedTools?.length) {
          if (!session.config.allowedTools.includes(toolName)) {
            pm.addJournalEntry(session.id, 'blocked', `Tool ${toolName} not in allowlist`);
            return { behavior: 'deny', message: `Tool "${toolName}" blocked by allowlist policy` };
          }
        }

        // Network policy — check Bash commands for disallowed domains
        if (toolName === 'Bash' && session.config.networkPolicy) {
          const cmd = String(input.command || '');
          const violation = checkNetworkPolicy(cmd, session.config.networkPolicy);
          if (violation) {
            pm.addJournalEntry(session.id, 'blocked', `Network: ${violation}`);
            return { behavior: 'deny', message: violation };
          }
        }

        // Yolo mode — approve everything, no questions asked
        if (session.config.approvalMode === 'yolo') {
          pm.addJournalEntry(session.id, 'auto_approved', `Yolo: ${question.substring(0, 200)}`);
          session.toolCalls++;
          return { behavior: 'allow' };
        }

        // In auto mode, try auto-approval first
        if (session.config.approvalMode === 'auto') {
          const prompt = pm.addPrompt(session.id, question, ['Allow', 'Deny'], 'tool_approval', 'auto');
          if (prompt.status === 'auto_approved') {
            return { behavior: 'allow' };
          }
          // Not auto-approved — fall through to manual queue
        }

        // Manual mode (or auto-escalated) — queue and wait for human
        this.setStatus(session, 'waiting_for_input');
        const approvalForPrompt = (session.config.approvalMode === 'auto' || session.config.approvalMode === 'manual')
          ? session.config.approvalMode : 'manual';
        const response = await pm.addPromptAndWait(
          session.id, question, ['Allow', 'Deny'], 'tool_approval',
          approvalForPrompt,
        );
        this.setStatus(session, 'working');

        if (response === '1' || response.toLowerCase() === 'allow') {
          return { behavior: 'allow' };
        }
        return { behavior: 'deny', message: `User denied: ${response}` };
      };

      // Permission mode — map PIA approval modes to SDK permission modes
      // The SDK has its OWN permission layer that runs independently of canUseTool.
      // In 'acceptEdits' mode, the SDK blocks Bash commands even when canUseTool approves them
      // because it can't prompt a human in headless mode.
      // Fix: Use 'bypassPermissions' for auto + yolo so the SDK doesn't independently block.
      // PIA's canUseTool callback still enforces dangerous pattern checks for auto mode.
      // Only 'manual' uses 'acceptEdits' — the user approves via the dashboard UI.
      const permissionMode = (() => {
        switch (session.config.approvalMode) {
          case 'plan': return 'plan' as const;
          case 'manual': return 'acceptEdits' as const;
          default: return 'bypassPermissions' as const;  // auto + yolo
        }
      })();

      // Build query options
      // Remove CLAUDECODE env var to prevent "nested session" detection
      // Also use forward slashes for cwd on Windows
      const cleanEnv = { ...process.env, ...getNodeSpawnEnv() };
      delete cleanEnv.CLAUDECODE;
      delete cleanEnv.CLAUDE_CODE_SESSION;
      // Keep ANTHROPIC_API_KEY — worker machines may only have API key auth (no OAuth).
      // The subprocess needs this to authenticate with the Anthropic API.
      delete cleanEnv.CLAUDE_CODE_OAUTH_TOKEN;
      delete cleanEnv.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
      delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;

      // File checkpointing requires env var too (per official docs)
      if (session.config.enableCheckpointing !== false) {
        cleanEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';
      }

      const queryOptions: Record<string, unknown> = {
        cwd: session.config.cwd,
        model: session.config.model || 'claude-opus-4-6',
        maxBudgetUsd: session.config.maxBudgetUsd || 5.00,
        permissionMode,
        canUseTool: session.config.approvalMode !== 'plan' ? canUseTool : undefined,
        env: cleanEnv,
        spawnClaudeCodeProcess: (config: { command: string; args: string[]; cwd: string; env: Record<string, string> }) => {
          const spawn = cpSpawn;
          const spawnEnv = { ...process.env, ...(config.env || {}), ...getNodeSpawnEnv() };
          delete spawnEnv.CLAUDECODE;
          delete spawnEnv.CLAUDE_CODE_SESSION;
          // Keep ANTHROPIC_API_KEY — worker machines may only have API key auth (no OAuth)
          // delete spawnEnv.ANTHROPIC_API_KEY;
          delete spawnEnv.CLAUDE_CODE_OAUTH_TOKEN;
          delete spawnEnv.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
          delete spawnEnv.CLAUDE_CODE_ENTRYPOINT;
          if (session.config.enableCheckpointing !== false) {
            spawnEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';
          }
          // process.execPath is the Electron binary in packaged mode.
          // With ELECTRON_RUN_AS_NODE=1 (from getNodeSpawnEnv()), it acts as Node.js.
          // Use our own stored cwd — the SDK strips backslashes from config.cwd on Windows
          const spawnCwd = session.config.cwd || config.cwd || process.cwd();
          const child = spawn(process.execPath, config.args || [], {
            cwd: spawnCwd,
            env: spawnEnv,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          child.on('error', (err: Error) => {
            logger.error(`Child process error: ${err.message} (code: ${(err as any).code})`);
          });
          return child;
        },
        // Real-time streaming: get character-by-character output like the CLI terminal
        includePartialMessages: true,
        // Load CLAUDE.md + project settings for context.
        // Auto + Yolo use bypassPermissions so settings permission rules don't interfere.
        // Only skip if explicitly disabled or yolo (yolo agents should be zero-friction).
        settingSources: (session.config.approvalMode === 'yolo' || session.config.loadProjectSettings === false) ? [] : ['project'],
        // Stability: File checkpointing for rewindFiles() rollback
        enableFileCheckpointing: session.config.enableCheckpointing !== false,
        // Stability: Auto-fallback to cheaper model on errors/rate limits
        fallbackModel: (() => {
          const main = session.config.model || 'claude-opus-4-6';
          const fb = session.config.fallbackModel || 'claude-sonnet-4-5-20250929';
          return fb !== main ? fb : (main === 'claude-sonnet-4-5-20250929' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5-20250929');
        })(),
        // Safety: prevent runaway loops — agents never timeout on their own
        maxTurns: session.config.maxTurns || 100,
      };

      // Auto + Yolo: bypass SDK's internal permission checks
      // PIA's canUseTool callback still enforces dangerous pattern detection for auto mode
      if (permissionMode === 'bypassPermissions') {
        queryOptions.allowDangerouslySkipPermissions = true;
      }

      // Effort level
      if (session.config.effort) {
        queryOptions.effort = session.config.effort;
      }

      // System prompt — always use claude_code preset, append user's custom prompt if any
      queryOptions.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: session.config.systemPrompt || '',
      };

      // Disallowed tools
      if (session.config.disallowedTools?.length) {
        queryOptions.disallowedTools = session.config.disallowedTools;
      }

      // Additional directories the agent can access
      if (session.config.additionalDirectories?.length) {
        queryOptions.additionalDirectories = session.config.additionalDirectories;
      }

      // MCP servers — attach external tool servers to the agent
      // SDK expects Record<string, McpServerConfig>, our API accepts an array with name field
      if (session.config.mcpServers?.length) {
        const mcpRecord: Record<string, Record<string, unknown>> = {};
        // In packaged Electron, MCP servers spawned with process.execPath need
        // ELECTRON_RUN_AS_NODE=1 so the Electron binary acts as Node.js.
        const mcpEnvExtras = getNodeSpawnEnv();
        for (const srv of session.config.mcpServers) {
          mcpRecord[srv.name] = {
            type: srv.transport || 'stdio',
            ...(srv.command ? { command: srv.command } : {}),
            ...(srv.args ? { args: srv.args } : {}),
            ...(srv.url ? { url: srv.url } : {}),
            // Inject ELECTRON_RUN_AS_NODE for packaged mode MCP server spawning
            ...(Object.keys(mcpEnvExtras).length > 0 ? { env: mcpEnvExtras } : {}),
          };
        }
        queryOptions.mcpServers = mcpRecord;
      }

      // Resume previous session if we have a session ID (for follow-ups)
      if (session.claudeSessionId) {
        queryOptions.resume = session.claudeSessionId;
      }

      const q = query({
        prompt: session.config.task,
        options: queryOptions as any,
      });

      // Store reference for kill/interrupt
      this.sdkQueries.set(session.id, q);

      // Consume the async generator — main event loop
      for await (const message of q) {
        this.handleSdkMessage(session, message);
      }

      // Generator completed — session is idle, ready for follow-ups
      this.setStatus(session, 'idle');
      pm.addJournalEntry(session.id, 'output', 'Task completed. Ready for follow-up messages.');
      this.persistSession(session);
      this.emit('complete', { sessionId: session.id });

    } catch (err) {
      const msg = (err as Error).message;
      const maxRestarts = session.config.maxRestarts ?? 2;

      // Auto-restart on transient errors (not user-killed, not budget exceeded)
      if (session.config.autoRestart !== false &&
          session.restartCount < maxRestarts &&
          !msg.includes('budget') && !msg.includes('Killed by user')) {
        session.restartCount++;
        const delay = Math.min(2000 * Math.pow(2, session.restartCount - 1), 30000); // exponential backoff, max 30s
        pm.addJournalEntry(session.id, 'error', `Error: ${msg} — auto-restarting in ${delay / 1000}s (attempt ${session.restartCount}/${maxRestarts})`);
        this.emit('output', { sessionId: session.id, data: `[Error: ${msg}] Restarting in ${delay / 1000}s (attempt ${session.restartCount}/${maxRestarts})...` });
        this.persistSession(session);

        setTimeout(() => {
          if (session.status !== 'done') { // not killed while waiting
            this.runSdkMode(session);
          }
        }, delay);
        return;
      }

      session.errorMessage = msg;
      this.setStatus(session, 'error');
      pm.addJournalEntry(session.id, 'error', msg);
      this.persistSession(session);
      this.emit('error', { sessionId: session.id, error: msg });
    } finally {
      this.sdkQueries.delete(session.id);
    }
  }

  private handleSdkMessage(session: AgentSession, message: SDKMessage): void {
    const pm = getPromptManager();

    switch (message.type) {
      case 'system': {
        const sysMsg = message as SDKSystemMessage | SDKStatusMessage;
        if ('subtype' in sysMsg && sysMsg.subtype === 'init') {
          const initMsg = sysMsg as SDKSystemMessage;
          session.claudeSessionId = initMsg.session_id;
          const text = `[SDK] Model: ${initMsg.model}, Tools: ${initMsg.tools.length}, v${initMsg.claude_code_version}`;
          session.outputBuffer += text + '\n';
          this.emit('output', { sessionId: session.id, data: text });
          pm.addJournalEntry(session.id, 'output', text);
        }
        if ('subtype' in sysMsg && sysMsg.subtype === 'status') {
          const statusMsg = sysMsg as SDKStatusMessage;
          if (statusMsg.status === 'compacting') {
            this.emit('output', { sessionId: session.id, data: '[Compacting context...]' });
          }
        }
        break;
      }

      // Real-time streaming: character-by-character text and tool status
      case 'stream_event': {
        const streamMsg = message as any;
        const event = streamMsg.event;
        if (!event) break;

        // Text being typed in real-time
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text || '';
          if (text) {
            session.outputBuffer += text;
            this.emit('output', { sessionId: session.id, data: text, streaming: true });
          }
        }

        // Tool call starting
        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          const toolName = event.content_block.name || 'unknown';
          const toolText = `\n[Using ${toolName}...] `;
          this.emit('output', { sessionId: session.id, data: toolText, streaming: true });
        }

        // Tool call / content block finished
        if (event.type === 'content_block_stop') {
          // Add a newline after completed blocks
          this.emit('output', { sessionId: session.id, data: '\n', streaming: true });
        }

        // Thinking deltas (if thinking is enabled)
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
          const text = event.delta.thinking || '';
          if (text) {
            this.emit('output', { sessionId: session.id, data: text, streaming: true });
          }
        }
        break;
      }

      case 'assistant': {
        const assistantMsg = message as SDKAssistantMessage;
        session.claudeSessionId = assistantMsg.session_id;

        // Deduplicate: skip if we already processed this message
        const msgId = (assistantMsg.message as any)?.id;
        if (msgId && this.processedMessageIds.has(msgId)) break;
        if (msgId) this.processedMessageIds.add(msgId);

        if (assistantMsg.message?.content && Array.isArray(assistantMsg.message.content)) {
          for (const block of assistantMsg.message.content) {
            if (block.type === 'text' && 'text' in block) {
              const text = String((block as any).text);
              // Filter empty "(no content)" blocks that appear before thinking
              if (!text || text === '(no content)') continue;
              // Don't re-emit to output since stream_event already showed it character by character
              // Just journal it for the record
              pm.addJournalEntry(session.id, 'output', text.substring(0, 2000));
            }
            if (block.type === 'tool_use' && 'name' in block) {
              session.toolCalls++;
              const name = String((block as any).name);
              const toolInput = JSON.stringify((block as any).input).substring(0, 500);
              this.emit('tool_call', { sessionId: session.id, tool: name, input: (block as any).input });
              pm.addJournalEntry(session.id, 'tool_call', `${name}: ${toolInput}`);
            }
          }
        }

        // Update usage from assistant message (deduplicated by message ID above)
        if (assistantMsg.message?.usage) {
          const usage = assistantMsg.message.usage;
          session.tokensIn += (usage.input_tokens || 0);
          session.tokensOut += (usage.output_tokens || 0);
        }
        break;
      }

      case 'result': {
        const resultMsg = message as SDKResultMessage;
        session.cost = resultMsg.total_cost_usd;

        if (resultMsg.usage) {
          session.tokensIn = (resultMsg.usage.input_tokens || 0) +
            (resultMsg.usage.cache_read_input_tokens || 0) +
            (resultMsg.usage.cache_creation_input_tokens || 0);
          session.tokensOut = resultMsg.usage.output_tokens || 0;
        }

        const costText = `\n[Result] Cost: $${resultMsg.total_cost_usd.toFixed(4)}, Turns: ${resultMsg.num_turns}, Duration: ${(resultMsg.duration_ms / 1000).toFixed(1)}s`;
        this.emit('output', { sessionId: session.id, data: costText });
        pm.addJournalEntry(session.id, 'cost', costText);

        if (resultMsg.is_error) {
          const errorMsg = resultMsg as any;
          session.errorMessage = errorMsg.errors?.join('; ') || resultMsg.subtype;
        }

        this.persistSession(session);
        break;
      }

      case 'tool_progress': {
        const progressMsg = message as SDKToolProgressMessage;
        const progressText = `[${progressMsg.tool_name}] running... (${progressMsg.elapsed_time_seconds}s)`;
        this.emit('output', { sessionId: session.id, data: progressText });
        break;
      }

      case 'tool_use_summary': {
        const summaryMsg = message as SDKToolUseSummaryMessage;
        this.emit('output', { sessionId: session.id, data: summaryMsg.summary });
        pm.addJournalEntry(session.id, 'output', summaryMsg.summary);
        break;
      }

      // user messages echoed back, auth_status, etc.
      case 'user':
        // Capture checkpoint UUID for file rewind
        if ('uuid' in (message as any) && (message as any).uuid) {
          (session as any).lastCheckpointId = (message as any).uuid;
        }
        break;

      default:
        logger.debug(`[${session.id}] Unhandled SDK message type: ${message.type}`);
        break;
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
      // Spawn Claude in Interactive Mode (Verbose for debugging)
      const ptyWrapper = ptyManager.create(session.id, {
        command: 'claude',
        args: ['--verbose'],
        cwd: session.config.cwd,
        cols: 120,
      });

      this.ptyInstances.set(session.id, ptyWrapper);

      let hasSentInitialTask = false;
      const initialTask = session.config.task;

      ptyWrapper.on('output', (rawData: string) => {
        // debug log
        try { fs.appendFileSync('pty_debug.log', `[${session.id}] ${JSON.stringify(rawData)}\n`); } catch (e) { }

        // Strip ANSI escape codes but KEEP prompts and meaningful symbols
        const text = rawData
          // Replace Cursor Forward (e.g. \x1b[1C) with spaces to preserve layout
          .replace(/\x1b\[(\d*)C/g, (_, p1) => ' '.repeat(p1 ? parseInt(p1, 10) : 1))
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
          .replace(/\x1b\]\d*;?[^\x07]*\x07/g, '')
          .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
          .replace(/\x1b[()][A-Z0-9]/g, '')
          .replace(/\x1b\[<[a-z]/g, '')
          .replace(/[\x00-\x08\x0e-\x1f]/g, '');

        // Broadcast to UI
        session.outputBuffer += text;
        this.emit('output', { sessionId: session.id, data: text });

        // 1. Initial Task Injection
        // Wait for the prompt "❯" before sending the task
        if (!hasSentInitialTask && (text.includes('❯') || text.includes('>'))) {
          if (initialTask && initialTask.trim().length > 0) {
            hasSentInitialTask = true;
            // Add a small delay to ensure stdin is ready
            setTimeout(() => {
              ptyWrapper.write(initialTask + '\r\n');
              pm.addJournalEntry(session.id, 'output', `> ${initialTask}`);
            }, 500);
          } else {
            hasSentInitialTask = true; // No task to send
          }
        }

        // 2. Auto-Approval (The "Magic" Fix)
        if (session.config.approvalMode === 'auto') {
          // Detect permission prompts like "Allow ...? (y/n)"
          const isPrompt = /\(y\/n\)/i.test(text) || /Do you want to run/i.test(text);

          if (isPrompt) {
            // Double check it's not just an echo of our own command
            if (!text.includes(initialTask)) {
              setTimeout(() => {
                ptyWrapper.write('y\r\n');
                this.emit('output', { sessionId: session.id, data: ' [Auto-Approved]\r\n' });
                pm.addJournalEntry(session.id, 'action', 'Auto-approved permission request');
              }, 1000); // Slight delay to look natural and avoid races
            }
          }
        }
      });

      ptyWrapper.on('exit', (code: number) => {
        this.ptyInstances.delete(session.id);
        if (code === 0) {
          this.setStatus(session, 'idle'); // Session ended normally
        } else {
          this.setStatus(session, 'error');
          session.errorMessage = `Exited with code ${code}`;
        }
        this.persistSession(session);
        this.emit('complete', { sessionId: session.id, code });
      });

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

    // Capture Claude CLI session ID to persist
    if (event.session_id && typeof event.session_id === 'string') {
      session.claudeSessionId = event.session_id;
    }

    // Skip system init hook messages
    if (event.type === 'system') return '';

    // Handle text content
    if (event.content && typeof event.content === 'string') {
      const trimmed = event.content.trim();

      // Filter out double-echoed input if needed, but KEEP the prompt
      // if (trimmed === '>' || trimmed === '❯') return ''; // <-- REMOVING THIS FILTER

      // Filter out hook progress bars
      if (trimmed.includes('█') || trimmed.includes('░')) return '';

      return event.content; // Return raw content including the prompt ❯
    }

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

    if (session.config.mode === 'sdk') {
      // SDK follow-up: if session is idle, start new query with resume
      if (session.status === 'idle' || session.status === 'done') {
        const pm = getPromptManager();
        pm.addJournalEntry(session.id, 'output', `> ${String(response)}`);
        session.config.task = String(response);
        this.runSdkMode(session);
      }
      // If working/waiting, permission responses flow through PromptManager.respond()
      return;
    }

    if (session.config.mode === 'pty') {
      const existingPty = this.ptyInstances.get(sessionId);
      if (existingPty) {
        existingPty.write(String(response) + '\n');
        logger.info(`Sent response to PTY session ${sessionId}: ${response}`);
      } else {
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

  setMode(sessionId: string, mode: 'manual' | 'auto' | 'yolo' | 'plan'): void {
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

    // Kill SDK query if applicable
    const sdkQuery = this.sdkQueries.get(sessionId);
    if (sdkQuery) {
      sdkQuery.close();
      this.sdkQueries.delete(sessionId);
    }

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

  /** Kill ALL active sessions — called on server shutdown to prevent orphan Claude processes */
  killAll(): void {
    logger.info(`Killing all ${this.sessions.size} agent sessions (server shutdown)...`);

    // Close all SDK queries
    for (const [id, q] of this.sdkQueries.entries()) {
      try { q.close(); } catch { /* ignore */ }
      this.sdkQueries.delete(id);
    }

    // Kill all PTY instances
    for (const [id, pty] of this.ptyInstances.entries()) {
      try { pty.kill(); } catch { /* ignore */ }
      this.ptyInstances.delete(id);
    }

    // Cancel all API tasks
    for (const session of this.sessions.values()) {
      if (session.config.mode === 'api' && (session.status === 'working' || session.status === 'starting')) {
        try { cancelTask(session.id); } catch { /* ignore */ }
      }
      if (session.status === 'working' || session.status === 'starting') {
        session.status = 'done';
        session.errorMessage = 'Server shutdown';
        this.persistSession(session);
      }
    }

    logger.info('All agent sessions terminated.');
  }

  /** Health check — returns stats for all active sessions */
  getHealth(): { total: number; working: number; idle: number; error: number; totalCost: number; totalRestarts: number } {
    let working = 0, idle = 0, error = 0, totalCost = 0, totalRestarts = 0;
    for (const s of this.sessions.values()) {
      if (s.status === 'working' || s.status === 'starting') working++;
      else if (s.status === 'idle') idle++;
      else if (s.status === 'error') error++;
      totalCost += s.cost;
      totalRestarts += s.restartCount;
    }
    return { total: this.sessions.size, working, idle, error, totalCost, totalRestarts };
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

    // Prevent orphan Claude processes on server shutdown
    const cleanup = () => {
      if (sessionManager) {
        sessionManager.killAll();
      }
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
  return sessionManager;
}
