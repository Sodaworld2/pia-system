/**
 * Orchestrator API Routes
 * Control the master Claude and its descendants
 */

import { Router, Request, Response } from 'express';
import { getOrchestrator } from '../../comms/orchestrator.js';
import { getDiscordBot } from '../../comms/discord-bot.js';
import { createLogger } from '../../utils/logger.js';
import { runAutonomousTask, getActiveTasks, cancelTask, WorkerResult } from '../../orchestrator/autonomous-worker.js';
import { nanoid } from 'nanoid';

const router = Router();
const logger = createLogger('OrchestratorAPI');

/**
 * GET /api/orchestrator/status
 * Get orchestrator status and all instances
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const orchestrator = getOrchestrator();
    const discord = getDiscordBot();

    res.json({
      status: 'online',
      instances: orchestrator.getInstances(),
      discord: discord?.getStatus() || { ready: false },
      report: orchestrator.getStatusReport(),
    });
  } catch (error) {
    logger.error(`Failed to get status: ${error}`);
    res.status(500).json({ error: 'Failed to get orchestrator status' });
  }
});

/**
 * GET /api/orchestrator/instances
 * List all Claude instances
 */
router.get('/instances', (_req: Request, res: Response) => {
  try {
    const orchestrator = getOrchestrator();
    res.json(orchestrator.getInstances());
  } catch (error) {
    logger.error(`Failed to list instances: ${error}`);
    res.status(500).json({ error: 'Failed to list instances' });
  }
});

/**
 * POST /api/orchestrator/spawn
 * Spawn a new Claude instance
 */
router.post('/spawn', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, purpose, machineId = 'local', initialPrompt } = req.body;

    if (!purpose) {
      res.status(400).json({ error: 'purpose is required' });
      return;
    }

    const orchestrator = getOrchestrator();
    const instance = await orchestrator.spawnClaudeInstance(
      name || `Claude-${Date.now()}`,
      purpose,
      machineId,
      initialPrompt
    );

    logger.info(`Spawned instance via API: ${instance.name}`);
    res.status(201).json(instance);
  } catch (error) {
    logger.error(`Failed to spawn instance: ${error}`);
    res.status(500).json({ error: 'Failed to spawn Claude instance' });
  }
});

/**
 * POST /api/orchestrator/send/:instanceId
 * Send a message to a specific Claude instance
 */
router.post('/send/:instanceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const instanceId = req.params.instanceId as string;
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const orchestrator = getOrchestrator();
    const instance = orchestrator.getInstance(instanceId);

    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    await orchestrator.sendToInstance(instanceId, message);
    res.json({ success: true, sentTo: instance.name, message });
  } catch (error) {
    logger.error(`Failed to send message: ${error}`);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /api/orchestrator/broadcast
 * Broadcast a message to all Claude instances
 */
router.post('/broadcast', async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const orchestrator = getOrchestrator();
    await orchestrator.broadcast(message);

    res.json({ success: true, message: 'Broadcast sent to all instances' });
  } catch (error) {
    logger.error(`Failed to broadcast: ${error}`);
    res.status(500).json({ error: 'Failed to broadcast message' });
  }
});

/**
 * POST /api/orchestrator/message
 * Send a message as if from human (processes through orchestrator logic)
 */
router.post('/message', async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const orchestrator = getOrchestrator();
    const response = await orchestrator.handleHumanMessage(message);

    res.json({ response });
  } catch (error) {
    logger.error(`Failed to process message: ${error}`);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// ---------------------------------------------------------------------------
// Autonomous Worker Endpoints (the new brain)
// ---------------------------------------------------------------------------

// Store results for polling
const taskResults = new Map<string, WorkerResult>();

/**
 * POST /api/orchestrator/run
 * Run an autonomous task — the key endpoint.
 * Claude API tool loop with no permission prompts.
 *
 * Body: { task: string, model?: string, maxBudgetUsd?: number, projectDir?: string }
 * Returns immediately with taskId, polls via GET /api/orchestrator/task/:id
 */
router.post('/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const { task, model, maxBudgetUsd, maxTurns, projectDir, soulId } = req.body;

    if (!task) {
      res.status(400).json({ error: 'task description is required' });
      return;
    }

    const taskId = nanoid();

    logger.info(`Autonomous task submitted: ${task.substring(0, 100)} (id: ${taskId})${soulId ? ` [soul: ${soulId}]` : ''}`);

    // Start the task in the background
    runAutonomousTask({
      id: taskId,
      description: task,
      model,
      maxBudgetUsd,
      maxTurns,
      projectDir,
      soulId,
    }).then(result => {
      taskResults.set(taskId, result);
      logger.info(`Autonomous task completed: ${taskId} (success: ${result.success})`);
    }).catch(err => {
      taskResults.set(taskId, {
        taskId,
        success: false,
        summary: `Worker error: ${err.message}`,
        toolCalls: 0,
        totalTokens: 0,
        costUsd: 0,
        durationMs: 0,
        log: [],
      });
    });

    // Return immediately
    res.status(202).json({
      taskId,
      status: 'running',
      message: `Task started. Poll GET /api/orchestrator/task/${taskId} for progress.`,
    });
  } catch (error) {
    logger.error(`Failed to start autonomous task: ${error}`);
    res.status(500).json({ error: 'Failed to start task' });
  }
});

/**
 * POST /api/orchestrator/run-sync
 * Run an autonomous task and wait for the result.
 * Useful for simple tasks; blocks until done.
 */
router.post('/run-sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const { task, model, maxBudgetUsd, maxTurns, projectDir, soulId } = req.body;

    if (!task) {
      res.status(400).json({ error: 'task description is required' });
      return;
    }

    const taskId = nanoid();
    logger.info(`Autonomous task (sync): ${task.substring(0, 100)} (id: ${taskId})${soulId ? ` [soul: ${soulId}]` : ''}`);

    const result = await runAutonomousTask({
      id: taskId,
      description: task,
      model,
      maxBudgetUsd,
      maxTurns,
      projectDir,
      soulId,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Sync task failed: ${error}`);
    res.status(500).json({ error: 'Task failed' });
  }
});

/**
 * GET /api/orchestrator/task/:id
 * Get the status/result of an autonomous task
 */
router.get('/task/:id', (req: Request, res: Response): void => {
  const taskId = req.params.id as string;
  const result = taskResults.get(taskId);

  if (result) {
    res.json({ status: 'completed', result });
  } else if (getActiveTasks().includes(taskId)) {
    res.json({ status: 'running', taskId });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

/**
 * GET /api/orchestrator/active
 * List all currently running autonomous tasks
 */
router.get('/active', (_req: Request, res: Response) => {
  res.json({
    activeTasks: getActiveTasks(),
    recentResults: Array.from(taskResults.entries()).slice(-10).map(([id, r]) => ({
      taskId: id,
      success: r.success,
      summary: r.summary.substring(0, 200),
      toolCalls: r.toolCalls,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
    })),
  });
});

/**
 * POST /api/orchestrator/cancel/:id
 * Cancel a running autonomous task
 */
router.post('/cancel/:id', (req: Request, res: Response): void => {
  const taskId = req.params.id as string;
  const cancelled = cancelTask(taskId);

  if (cancelled) {
    res.json({ success: true, message: `Task ${taskId} cancellation requested` });
  } else {
    res.status(404).json({ error: 'Task not found or already completed' });
  }
});

export default router;
