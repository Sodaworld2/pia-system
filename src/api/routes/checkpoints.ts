import { Router, Request, Response } from 'express';
import { getCheckpointManager } from '../../checkpoint/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('CheckpointsAPI');
const router = Router();

/**
 * GET /api/checkpoints
 * List all checkpoints (optionally filter by status or machine)
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const manager = getCheckpointManager();
    const { status, machine_id } = req.query;

    let checkpoints;

    if (machine_id) {
      checkpoints = manager.getCheckpointsForMachine(machine_id as string);
    } else if (status === 'interrupted') {
      checkpoints = manager.getInterruptedCheckpoints();
    } else {
      // Get all by getting interrupted + completed
      checkpoints = manager.getInterruptedCheckpoints();
    }

    res.json(checkpoints);
  } catch (error) {
    logger.error(`Failed to list checkpoints: ${error}`);
    res.status(500).json({ error: 'Failed to list checkpoints' });
  }
});

/**
 * GET /api/checkpoints/interrupted
 * Get all interrupted checkpoints (sessions that can be resumed)
 */
router.get('/interrupted', (_req: Request, res: Response) => {
  try {
    const manager = getCheckpointManager();
    const checkpoints = manager.getInterruptedCheckpoints();
    res.json(checkpoints);
  } catch (error) {
    logger.error(`Failed to get interrupted checkpoints: ${error}`);
    res.status(500).json({ error: 'Failed to get interrupted checkpoints' });
  }
});

/**
 * GET /api/checkpoints/:sessionId
 * Get a specific checkpoint
 */
router.get('/:sessionId', (req: Request, res: Response) => {
  try {
    const manager = getCheckpointManager();
    const sessionId = req.params.sessionId as string;
    const checkpoint = manager.getCheckpoint(sessionId);

    if (!checkpoint) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    res.json(checkpoint);
  } catch (error) {
    logger.error(`Failed to get checkpoint: ${error}`);
    res.status(500).json({ error: 'Failed to get checkpoint' });
  }
});

/**
 * GET /api/checkpoints/:sessionId/handoff
 * Get a handoff prompt for resuming a session
 */
router.get('/:sessionId/handoff', (req: Request, res: Response) => {
  try {
    const manager = getCheckpointManager();
    const sessionId = req.params.sessionId as string;
    const checkpoint = manager.getCheckpoint(sessionId);

    if (!checkpoint) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    const prompt = manager.generateHandoffPrompt(checkpoint);

    res.json({
      checkpoint,
      handoffPrompt: prompt,
    });
  } catch (error) {
    logger.error(`Failed to generate handoff: ${error}`);
    res.status(500).json({ error: 'Failed to generate handoff' });
  }
});

/**
 * POST /api/checkpoints/:sessionId/resume
 * Mark a checkpoint as resumed and get the handoff prompt
 * Body: { newSessionId: string }
 */
router.post('/:sessionId/resume', (req: Request, res: Response) => {
  try {
    const manager = getCheckpointManager();
    const sessionId = req.params.sessionId as string;
    const { newSessionId } = req.body;

    if (!newSessionId) {
      res.status(400).json({ error: 'newSessionId is required' });
      return;
    }

    const checkpoint = manager.getCheckpoint(sessionId);

    if (!checkpoint) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    // Generate handoff prompt
    const prompt = manager.generateHandoffPrompt(checkpoint);

    // Mark as resumed
    manager.markAsResumed(sessionId, newSessionId);

    logger.info(`Checkpoint ${sessionId.substring(0, 8)} resumed by ${newSessionId.substring(0, 8)}`);

    res.json({
      success: true,
      handoffPrompt: prompt,
      checkpoint,
    });
  } catch (error) {
    logger.error(`Failed to resume checkpoint: ${error}`);
    res.status(500).json({ error: 'Failed to resume checkpoint' });
  }
});

/**
 * DELETE /api/checkpoints/cleanup
 * Clean up old checkpoints
 * Query: { maxAgeDays?: number }
 */
router.delete('/cleanup', (req: Request, res: Response) => {
  try {
    const manager = getCheckpointManager();
    const maxAgeDays = parseInt(req.query.maxAgeDays as string) || 7;

    const cleaned = manager.cleanupOldCheckpoints(maxAgeDays);

    res.json({
      success: true,
      cleaned,
      message: `Removed ${cleaned} checkpoints older than ${maxAgeDays} days`,
    });
  } catch (error) {
    logger.error(`Failed to cleanup checkpoints: ${error}`);
    res.status(500).json({ error: 'Failed to cleanup checkpoints' });
  }
});

export default router;
