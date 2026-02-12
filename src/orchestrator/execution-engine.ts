/**
 * Execution Engine - The Brain of PIA
 *
 * Pulls tasks from the TaskQueue, routes them through the AI system,
 * and reports results. This is the main execution loop that makes
 * agents actually DO work.
 *
 * Flow:
 *   TaskQueue.dequeue()
 *     → CostRouter.route() (pick model)
 *     → AIRouter.execute() (call AI)
 *     → TaskQueue.complete() (store result)
 *     → CostTracker.recordUsage() (track spend)
 *     → AgentBus.send() (notify)
 */

import { createLogger } from '../utils/logger.js';
import { getTaskQueue, TaskRecord } from './task-queue.js';
// Agent factory and cost router available for future task-to-agent matching
// import { getAgentFactory } from '../agents/agent-factory.js';
// import { getCostRouter } from '../agents/cost-router.js';
import { getAIRouter } from '../ai/ai-router.js';
import { getCostTracker } from '../ai/cost-tracker.js';
import { getAgentBus } from '../comms/agent-bus.js';
import { getDoctor } from '../agents/doctor.js';
import { updateAgentStatus } from '../db/queries/agents.js';

const logger = createLogger('ExecutionEngine');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionConfig {
  pollIntervalMs: number;
  maxConcurrent: number;
  autoStart: boolean;
  enableDoctor: boolean;
}

export interface ExecutionResult {
  taskId: string;
  success: boolean;
  output: string;
  provider: string;
  model: string;
  cost: number;
  durationMs: number;
  tokens?: number;
}

export interface EngineStats {
  running: boolean;
  tasksProcessed: number;
  tasksSucceeded: number;
  tasksFailed: number;
  totalCost: number;
  avgDurationMs: number;
  activeTasks: number;
  uptime: number;
}

// ---------------------------------------------------------------------------
// Execution Engine
// ---------------------------------------------------------------------------

export class ExecutionEngine {
  private config: ExecutionConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private activeTasks: Set<string> = new Set();
  private stats = {
    tasksProcessed: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    totalCost: 0,
    totalDuration: 0,
    startedAt: 0,
  };

  constructor(config?: Partial<ExecutionConfig>) {
    this.config = {
      pollIntervalMs: config?.pollIntervalMs ?? 5000,
      maxConcurrent: config?.maxConcurrent ?? 3,
      autoStart: config?.autoStart ?? false,
      enableDoctor: config?.enableDoctor ?? true,
    };

    logger.info(`ExecutionEngine initialized (poll: ${this.config.pollIntervalMs}ms, maxConcurrent: ${this.config.maxConcurrent})`);

    if (this.config.autoStart) {
      this.start();
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the execution loop
   */
  start(): void {
    if (this.running) {
      logger.warn('ExecutionEngine already running');
      return;
    }

    this.running = true;
    this.stats.startedAt = Date.now();

    // Start the Doctor if enabled
    if (this.config.enableDoctor) {
      try {
        const doctor = getDoctor();
        if (!doctor.isRunning()) {
          doctor.start(60000);
        }
      } catch (err) {
        logger.error(`Failed to start Doctor: ${err}`);
      }
    }

    // Start polling
    this.intervalId = setInterval(() => {
      this.tick().catch(err => {
        logger.error(`Execution tick error: ${err}`);
      });
    }, this.config.pollIntervalMs);

    logger.info('ExecutionEngine started');

    // Run immediately
    this.tick().catch(err => logger.error(`Initial tick error: ${err}`));
  }

  /**
   * Stop the execution loop
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('ExecutionEngine stopped');
  }

  /**
   * Single tick of the execution loop
   */
  private async tick(): Promise<void> {
    // Don't exceed max concurrent
    if (this.activeTasks.size >= this.config.maxConcurrent) {
      return;
    }

    const queue = getTaskQueue();
    const slotsAvailable = this.config.maxConcurrent - this.activeTasks.size;

    // Pull up to slotsAvailable tasks
    for (let i = 0; i < slotsAvailable; i++) {
      const task = queue.dequeue();
      if (!task) break; // No more pending tasks

      // Don't re-process active tasks
      if (this.activeTasks.has(task.id)) continue;

      // Execute asynchronously (don't block the loop)
      this.executeTask(task).catch(err => {
        logger.error(`Task execution error for ${task.id}: ${err}`);
      });
    }
  }

  // -------------------------------------------------------------------------
  // Task Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a single task through the AI pipeline
   */
  async executeTask(task: TaskRecord): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.activeTasks.add(task.id);

    const queue = getTaskQueue();
    const bus = getAgentBus();
    const costTracker = getCostTracker();
    const aiRouter = getAIRouter();

    // Mark as in_progress
    queue.assign(task.id, task.agent_id || 'orchestrator');

    // Update agent status if assigned
    if (task.agent_id) {
      try {
        updateAgentStatus(task.agent_id, 'working', {
          current_task: task.title,
          progress: 10,
        });
      } catch { /* agent may not exist */ }
    }

    logger.info(`Executing task: ${task.title} (priority: ${task.priority})`);

    // Broadcast that we're working on this
    bus.broadcast('orchestrator', `Starting task: ${task.title}`, {
      taskId: task.id,
      event: 'task_started',
    });

    try {
      // Classify complexity
      const complexity = await aiRouter.classifyTask(task.title + ' ' + (task.description || ''));

      // Determine task type from title/description
      const taskType = this.inferTaskType(task.title, task.description || '');

      // Build the prompt
      const prompt = this.buildPrompt(task);

      // Execute via AI Router (handles waterfall routing)
      const response = await aiRouter.execute({
        prompt,
        taskType,
        complexity,
        preferLocal: task.priority <= 2, // Low priority = prefer free local
      });

      const durationMs = Date.now() - startTime;

      // Record the cost
      costTracker.recordUsage({
        provider: response.provider,
        model: response.model,
        taskType,
        inputTokens: response.tokens ? Math.floor(response.tokens * 0.6) : Math.floor(prompt.length / 4),
        outputTokens: response.tokens ? Math.floor(response.tokens * 0.4) : Math.floor(response.content.length / 4),
        totalTokens: response.tokens || Math.floor((prompt.length + response.content.length) / 4),
        costUsd: response.cost,
        durationMs,
        agentId: task.agent_id || undefined,
        success: true,
      });

      // Complete the task
      queue.complete(task.id, response.content);

      // Update agent status
      if (task.agent_id) {
        try {
          updateAgentStatus(task.agent_id, 'idle', {
            current_task: null,
            progress: 100,
            last_output: response.content.substring(0, 500),
          });
        } catch { /* agent may not exist */ }
      }

      // Broadcast completion
      bus.broadcast('orchestrator', `Task completed: ${task.title}`, {
        taskId: task.id,
        event: 'task_completed',
        provider: response.provider,
        model: response.model,
        cost: response.cost,
        duration: durationMs,
      });

      // Update stats
      this.stats.tasksProcessed++;
      this.stats.tasksSucceeded++;
      this.stats.totalCost += response.cost;
      this.stats.totalDuration += durationMs;

      logger.info(`Task completed: ${task.title} via ${response.provider}/${response.model} ($${response.cost.toFixed(4)}, ${durationMs}ms)`);

      const result: ExecutionResult = {
        taskId: task.id,
        success: true,
        output: response.content,
        provider: response.provider,
        model: response.model,
        cost: response.cost,
        durationMs,
        tokens: response.tokens,
      };

      this.activeTasks.delete(task.id);
      return result;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Fail the task
      queue.fail(task.id, errorMsg);

      // Update agent status
      if (task.agent_id) {
        try {
          updateAgentStatus(task.agent_id, 'error', {
            current_task: null,
            progress: 0,
            last_output: `Error: ${errorMsg}`,
          });
        } catch { /* agent may not exist */ }
      }

      // Broadcast failure
      bus.broadcast('orchestrator', `Task failed: ${task.title} - ${errorMsg}`, {
        taskId: task.id,
        event: 'task_failed',
        error: errorMsg,
      });

      // Update stats
      this.stats.tasksProcessed++;
      this.stats.tasksFailed++;
      this.stats.totalDuration += durationMs;

      logger.error(`Task failed: ${task.title} - ${errorMsg}`);

      this.activeTasks.delete(task.id);

      return {
        taskId: task.id,
        success: false,
        output: errorMsg,
        provider: 'none',
        model: 'none',
        cost: 0,
        durationMs,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Task Building
  // -------------------------------------------------------------------------

  /**
   * Build a prompt for the AI from a task record
   */
  private buildPrompt(task: TaskRecord): string {
    const parts: string[] = [];

    parts.push(`Task: ${task.title}`);

    if (task.description) {
      parts.push('');
      parts.push(`Details: ${task.description}`);
    }

    parts.push('');
    parts.push('Instructions:');
    parts.push('- Provide a clear, actionable response');
    parts.push('- If this is a coding task, provide working code');
    parts.push('- If this is a review task, list specific findings with severity');
    parts.push('- Be concise and practical');

    return parts.join('\n');
  }

  /**
   * Infer the task type from title and description
   */
  private inferTaskType(title: string, description: string): 'code' | 'review' | 'security' | 'chat' | 'analysis' {
    const text = (title + ' ' + description).toLowerCase();

    if (text.includes('security') || text.includes('vulnerab') || text.includes('audit')) {
      return 'security';
    }
    if (text.includes('review') || text.includes('check') || text.includes('inspect')) {
      return 'review';
    }
    if (text.includes('analyze') || text.includes('report') || text.includes('summarize')) {
      return 'analysis';
    }
    if (text.includes('code') || text.includes('implement') || text.includes('build') || text.includes('fix') || text.includes('create')) {
      return 'code';
    }

    return 'code'; // Default
  }

  // -------------------------------------------------------------------------
  // Status & Stats
  // -------------------------------------------------------------------------

  /**
   * Get engine statistics
   */
  getStats(): EngineStats {
    return {
      running: this.running,
      tasksProcessed: this.stats.tasksProcessed,
      tasksSucceeded: this.stats.tasksSucceeded,
      tasksFailed: this.stats.tasksFailed,
      totalCost: this.stats.totalCost,
      avgDurationMs: this.stats.tasksProcessed > 0
        ? Math.round(this.stats.totalDuration / this.stats.tasksProcessed)
        : 0,
      activeTasks: this.activeTasks.size,
      uptime: this.stats.startedAt > 0 ? Date.now() - this.stats.startedAt : 0,
    };
  }

  /**
   * Is the engine running?
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current config
   */
  getConfig(): ExecutionConfig {
    return { ...this.config };
  }

  /**
   * Update config (takes effect on next tick)
   */
  updateConfig(updates: Partial<ExecutionConfig>): void {
    Object.assign(this.config, updates);

    // If poll interval changed and running, restart the timer
    if (updates.pollIntervalMs && this.running && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        this.tick().catch(err => logger.error(`Execution tick error: ${err}`));
      }, this.config.pollIntervalMs);
    }

    logger.info(`ExecutionEngine config updated: ${JSON.stringify(updates)}`);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let engine: ExecutionEngine | null = null;

export function getExecutionEngine(): ExecutionEngine {
  if (!engine) {
    engine = new ExecutionEngine();
  }
  return engine;
}

export function initExecutionEngine(config?: Partial<ExecutionConfig>): ExecutionEngine {
  engine = new ExecutionEngine(config);
  return engine;
}
