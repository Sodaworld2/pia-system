/**
 * Autonomous Worker - Claude API Tool Loop
 *
 * The missing brain on each machine. Receives a task description,
 * calls Claude API with tool definitions, and executes tools in a loop
 * until the job is done. NO permission prompts.
 *
 * Flow:
 *   Dashboard -> POST /api/orchestrator/run { task: "Fix the tests" }
 *   -> Worker sends task to Claude API with tools
 *   -> Claude says "use tool: run_command(npm test)"
 *   -> Worker runs the command locally
 *   -> Worker sends result back to Claude
 *   -> Claude says "use tool: write_file(...)"
 *   -> Worker writes the file
 *   -> Loop until Claude says "done"
 *   -> Worker reports result back to dashboard
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger.js';
import { getAgentBus } from '../comms/agent-bus.js';
import { getSoulEngine } from '../souls/soul-engine.js';

const execAsync = promisify(exec);
const logger = createLogger('AutonomousWorker');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface TextBlock {
  type: 'text';
  text: string;
}

type ContentBlock = ToolUseBlock | TextBlock;

interface APIMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export interface WorkerTask {
  id: string;
  description: string;
  machineIp?: string;     // Target machine (default: localhost)
  model?: string;          // Claude model to use
  maxBudgetUsd?: number;   // Max spend per task
  maxTurns?: number;       // Max tool-call rounds
  projectDir?: string;     // Working directory
  soulId?: string;         // Soul to load for personality/memory injection
}

export interface WorkerResult {
  taskId: string;
  success: boolean;
  summary: string;
  toolCalls: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  log: WorkerLogEntry[];
}

export interface WorkerLogEntry {
  timestamp: number;
  type: 'tool_call' | 'tool_result' | 'thinking' | 'error' | 'done';
  tool?: string;
  input?: unknown;
  output?: string;
}

// ---------------------------------------------------------------------------
// Safety Guardrails
// ---------------------------------------------------------------------------

const BLOCKED_COMMANDS = [
  'rm -rf /',
  'format ',
  'del /s /q C:\\',
  'shutdown',
  'reboot',
  'mkfs',
  ':(){:|:&};:',           // fork bomb
  'dd if=/dev/zero',
  '> /dev/sda',
];

// Allowed base directories for file operations
// const ALLOWED_BASE_DIRS = ['C:\\Users\\', 'C:\\Projects\\', '/home/', '/tmp/', '/var/'];

function isCommandSafe(command: string): boolean {
  const lower = command.toLowerCase();
  for (const blocked of BLOCKED_COMMANDS) {
    if (lower.includes(blocked.toLowerCase())) {
      return false;
    }
  }
  return true;
}

function isPathSafe(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  // Block writing to system directories
  const blockedPaths = ['C:\\Windows', 'C:\\Program Files', '/usr', '/bin', '/sbin', '/etc'];
  for (const blocked of blockedPaths) {
    if (normalized.startsWith(blocked)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOLS: ToolDefinition[] = [
  {
    name: 'run_command',
    description: 'Run a shell command on this machine and return stdout/stderr. Use for builds, tests, git operations, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        timeout: { type: 'number', description: 'Timeout in ms (default 60000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file on this machine.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file on this machine. Creates directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a given path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
      },
      required: ['path'],
    },
  },
  {
    name: 'report_progress',
    description: 'Report progress back to the PIA dashboard. Use this to give status updates during long tasks.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['working', 'completed', 'failed'], description: 'Current status' },
        message: { type: 'string', description: 'Status message to show on dashboard' },
      },
      required: ['status', 'message'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

async function executeTool(name: string, input: Record<string, unknown>, task: WorkerTask): Promise<string> {
  switch (name) {
    case 'run_command': {
      const command = input.command as string;
      const cwd = (input.cwd as string) || task.projectDir || process.cwd();
      const timeout = (input.timeout as number) || 60000;

      if (!isCommandSafe(command)) {
        return `ERROR: Command blocked by safety guardrails: "${command}"`;
      }

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          timeout,
          maxBuffer: 1024 * 1024, // 1MB
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
        });
        const result = (stdout || '') + (stderr ? `\nSTDERR: ${stderr}` : '');
        return result.substring(0, 50000); // Cap output
      } catch (err: unknown) {
        const error = err as { stdout?: string; stderr?: string; code?: number; message?: string };
        return `Command failed (exit ${error.code || 'unknown'}):\nSTDOUT: ${error.stdout || ''}\nSTDERR: ${error.stderr || error.message || ''}`.substring(0, 50000);
      }
    }

    case 'read_file': {
      const filePath = input.path as string;
      if (!isPathSafe(filePath)) {
        return `ERROR: Path blocked by safety guardrails: "${filePath}"`;
      }
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.substring(0, 100000); // Cap at 100KB
      } catch (err: unknown) {
        return `ERROR: Could not read file: ${(err as Error).message}`;
      }
    }

    case 'write_file': {
      const filePath = input.path as string;
      const content = input.content as string;
      if (!isPathSafe(filePath)) {
        return `ERROR: Path blocked by safety guardrails: "${filePath}"`;
      }
      try {
        // Create parent directories if needed
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf8');
        return `File written successfully: ${filePath} (${content.length} chars)`;
      } catch (err: unknown) {
        return `ERROR: Could not write file: ${(err as Error).message}`;
      }
    }

    case 'list_directory': {
      const dirPath = input.path as string;
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const list = entries.map(e =>
          `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`
        ).join('\n');
        return list || '(empty directory)';
      } catch (err: unknown) {
        return `ERROR: Could not list directory: ${(err as Error).message}`;
      }
    }

    case 'report_progress': {
      const status = input.status as string;
      const message = input.message as string;
      try {
        const bus = getAgentBus();
        bus.broadcast('autonomous-worker', `[${status.toUpperCase()}] ${message}`, {
          taskId: task.id,
          event: 'worker_progress',
          status,
        });
      } catch { /* bus may not be initialized */ }
      logger.info(`[Task ${task.id}] Progress: ${status} - ${message}`);
      return `Progress reported: ${status} - ${message}`;
    }

    default:
      return `ERROR: Unknown tool: ${name}`;
  }
}

// ---------------------------------------------------------------------------
// Cost Calculation
// ---------------------------------------------------------------------------

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs: Record<string, { input: number; output: number }> = {
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
    'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
    'claude-opus-4-6': { input: 15.00, output: 75.00 },
  };
  const rate = costs[model] || costs['claude-sonnet-4-5-20250929'];
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

// ---------------------------------------------------------------------------
// Main Worker Loop
// ---------------------------------------------------------------------------

function buildDefaultSystemPrompt(task: WorkerTask): string {
  return `You are a PIA autonomous worker agent running on machine "${process.env.PIA_MACHINE_NAME || 'local'}".
Your job is to complete the task given to you by using the tools available.

Available tools: run_command, read_file, write_file, list_directory, report_progress.

Rules:
- Execute the task step by step
- Use report_progress to give updates on long tasks
- If something fails, try to diagnose and fix it
- When done, use report_progress with status "completed"
- Be efficient — don't read files you don't need
- Working directory: ${task.projectDir || process.cwd()}
- Platform: ${process.platform === 'win32' ? 'Windows (use PowerShell syntax)' : 'Linux/Mac (use bash syntax)'}`;
}

// Track active tasks
const activeTasks = new Map<string, { cancel: boolean }>();

export function getActiveTasks(): string[] {
  return Array.from(activeTasks.keys());
}

export function cancelTask(taskId: string): boolean {
  const task = activeTasks.get(taskId);
  if (task) {
    task.cancel = true;
    return true;
  }
  return false;
}

export async function runAutonomousTask(task: WorkerTask): Promise<WorkerResult> {
  const startTime = Date.now();
  const apiKey = process.env.PIA_CLAUDE_API_KEY ||
                 process.env.ANTHROPIC_API_KEY ||
                 process.env.CLAUDE_API_KEY || '';

  if (!apiKey) {
    return {
      taskId: task.id,
      success: false,
      summary: 'No API key configured. Set ANTHROPIC_API_KEY in environment.',
      toolCalls: 0,
      totalTokens: 0,
      costUsd: 0,
      durationMs: Date.now() - startTime,
      log: [],
    };
  }

  const model = task.model || 'claude-sonnet-4-5-20250929';
  const maxTurns = task.maxTurns || 30;
  const maxBudget = task.maxBudgetUsd || 2.00;
  const log: WorkerLogEntry[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallCount = 0;
  let costSoFar = 0;

  // Track this task
  const taskControl = { cancel: false };
  activeTasks.set(task.id, taskControl);

  // Build system prompt — inject soul personality if soulId is provided
  let systemPrompt: string;
  if (task.soulId) {
    try {
      const engine = getSoulEngine();
      const soulPrompt = engine.generateSystemPrompt(task.soulId, `Running as autonomous worker on machine "${process.env.PIA_MACHINE_NAME || 'local'}".
Working directory: ${task.projectDir || process.cwd()}
Platform: ${process.platform === 'win32' ? 'Windows (use PowerShell syntax)' : 'Linux/Mac (use bash syntax)'}
Available tools: run_command, read_file, write_file, list_directory, report_progress.`);
      systemPrompt = soulPrompt + '\n\nRules:\n- Execute the task step by step\n- Use report_progress to give updates on long tasks\n- If something fails, try to diagnose and fix it\n- When done, use report_progress with status "completed"\n- Be efficient — don\'t read files you don\'t need\n- Stay in character as your soul personality at all times';

      // Record that this soul is working on a task
      engine.getMemoryManager().addMemory({
        soul_id: task.soulId,
        category: 'experience',
        content: `Started autonomous task: ${task.description.substring(0, 200)}`,
        importance: 5,
        context: `task_id: ${task.id}`,
      });
    } catch (err) {
      logger.warn(`Failed to load soul ${task.soulId}, using default prompt: ${(err as Error).message}`);
      systemPrompt = buildDefaultSystemPrompt(task);
    }
  } else {
    systemPrompt = buildDefaultSystemPrompt(task);
  }

  const messages: APIMessage[] = [
    { role: 'user', content: task.description },
  ];

  logger.info(`[Task ${task.id}] Starting autonomous task: ${task.description.substring(0, 100)}`);

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      // Check cancellation
      if (taskControl.cancel) {
        log.push({ timestamp: Date.now(), type: 'error', output: 'Task cancelled by user' });
        break;
      }

      // Check budget
      if (costSoFar >= maxBudget) {
        log.push({ timestamp: Date.now(), type: 'error', output: `Budget exceeded: $${costSoFar.toFixed(4)} >= $${maxBudget}` });
        break;
      }

      // Call Claude API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        log.push({ timestamp: Date.now(), type: 'error', output: `API error (${response.status}): ${errText}` });
        break;
      }

      const data = await response.json() as {
        content: ContentBlock[];
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
      };

      // Track tokens
      totalInputTokens += data.usage.input_tokens;
      totalOutputTokens += data.usage.output_tokens;
      costSoFar = calculateCost(model, totalInputTokens, totalOutputTokens);

      // Add assistant response to conversation
      messages.push({ role: 'assistant', content: data.content });

      // Check if we're done (no tool use)
      if (data.stop_reason === 'end_turn') {
        const textBlocks = data.content.filter((b): b is TextBlock => b.type === 'text');
        const summary = textBlocks.map(b => b.text).join('\n');
        log.push({ timestamp: Date.now(), type: 'done', output: summary });
        break;
      }

      // Process tool calls
      if (data.stop_reason === 'tool_use') {
        const toolBlocks = data.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
        const toolResults: ToolResultContent[] = [];

        for (const toolCall of toolBlocks) {
          toolCallCount++;
          log.push({
            timestamp: Date.now(),
            type: 'tool_call',
            tool: toolCall.name,
            input: toolCall.input,
          });

          logger.info(`[Task ${task.id}] Tool call #${toolCallCount}: ${toolCall.name}`);

          const result = await executeTool(toolCall.name, toolCall.input, task);

          log.push({
            timestamp: Date.now(),
            type: 'tool_result',
            tool: toolCall.name,
            output: result.substring(0, 2000),
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result,
          });
        }

        // Add tool results as user message
        messages.push({
          role: 'user',
          content: toolResults as unknown as ContentBlock[],
        });
      }
    }
  } catch (err: unknown) {
    log.push({ timestamp: Date.now(), type: 'error', output: `Worker error: ${(err as Error).message}` });
  }

  // Clean up
  activeTasks.delete(task.id);

  const totalTokens = totalInputTokens + totalOutputTokens;
  const durationMs = Date.now() - startTime;
  const lastLog = log[log.length - 1];
  const success = lastLog?.type === 'done';
  const summary = lastLog?.output || 'Task did not complete';

  logger.info(`[Task ${task.id}] Completed: success=${success}, tools=${toolCallCount}, cost=$${costSoFar.toFixed(4)}, duration=${durationMs}ms`);

  // Save completion memory for soul
  if (task.soulId) {
    try {
      getSoulEngine().getMemoryManager().addMemory({
        soul_id: task.soulId,
        category: success ? 'experience' : 'learning',
        content: `Task ${success ? 'completed' : 'failed'}: ${task.description.substring(0, 200)}. ${summary.substring(0, 300)}`,
        importance: success ? 5 : 7,
        context: `task_id: ${task.id}, cost: $${costSoFar.toFixed(4)}, tools: ${toolCallCount}`,
      });
    } catch { /* soul may not exist */ }
  }

  return {
    taskId: task.id,
    success,
    summary,
    toolCalls: toolCallCount,
    totalTokens,
    costUsd: costSoFar,
    durationMs,
    log,
  };
}
