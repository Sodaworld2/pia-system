/**
 * Orchestrator API Routes
 * Control the master Claude and its descendants
 */

import { Router, Request, Response } from 'express';
import { getOrchestrator } from '../../comms/orchestrator.js';
import { getDiscordBot } from '../../comms/discord-bot.js';
import { createLogger } from '../../utils/logger.js';

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

export default router;
