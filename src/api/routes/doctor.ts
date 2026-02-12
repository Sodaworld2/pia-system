/**
 * Doctor (Self-Healer) API Routes
 *
 * GET  /api/doctor/health     - Run health check
 * GET  /api/doctor/status     - Get last report
 * POST /api/doctor/heal/:id   - Manually heal agent
 * GET  /api/doctor/log        - Get action log
 * POST /api/doctor/start      - Start auto-healing
 * POST /api/doctor/stop       - Stop auto-healing
 */

import { Router, Request, Response } from 'express';
import { getDoctor } from '../../agents/doctor.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('DoctorAPI');

// GET /api/doctor/health - Run a health check now
router.get('/health', (_req: Request, res: Response) => {
  try {
    const doctor = getDoctor();
    const report = doctor.checkHealth();
    res.json(report);
  } catch (error) {
    logger.error(`Health check failed: ${error}`);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// GET /api/doctor/status - Get last health report + running state
router.get('/status', (_req: Request, res: Response) => {
  try {
    const doctor = getDoctor();
    res.json({
      running: doctor.isRunning(),
      lastReport: doctor.getHealthReport(),
      recentActions: doctor.getActionLog().slice(-10),
    });
  } catch (error) {
    logger.error(`Failed to get status: ${error}`);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// POST /api/doctor/heal/:id - Manually heal an agent
router.post('/heal/:id', (req: Request, res: Response) => {
  try {
    const { action } = req.body;
    if (!action || !['restart', 'kill'].includes(action)) {
      res.status(400).json({ error: 'action must be "restart" or "kill"' });
      return;
    }

    const doctor = getDoctor();
    const result = doctor.healAgent(req.params.id as string, action);

    logger.info(`Manual heal: ${action} on ${req.params.id}`);
    res.json(result);
  } catch (error) {
    logger.error(`Heal failed: ${error}`);
    res.status(500).json({ error: 'Failed to heal agent' });
  }
});

// GET /api/doctor/log - Get action log
router.get('/log', (_req: Request, res: Response) => {
  try {
    const doctor = getDoctor();
    const log = doctor.getActionLog();
    res.json({ count: log.length, actions: log });
  } catch (error) {
    logger.error(`Failed to get log: ${error}`);
    res.status(500).json({ error: 'Failed to get action log' });
  }
});

// POST /api/doctor/start - Start auto-healing
router.post('/start', (req: Request, res: Response) => {
  try {
    const { intervalMs } = req.body;
    const doctor = getDoctor();
    doctor.start(intervalMs || 60000);

    res.json({ status: 'started', intervalMs: intervalMs || 60000 });
  } catch (error) {
    logger.error(`Failed to start: ${error}`);
    res.status(500).json({ error: 'Failed to start doctor' });
  }
});

// POST /api/doctor/stop - Stop auto-healing
router.post('/stop', (_req: Request, res: Response) => {
  try {
    const doctor = getDoctor();
    doctor.stop();
    res.json({ status: 'stopped' });
  } catch (error) {
    logger.error(`Failed to stop: ${error}`);
    res.status(500).json({ error: 'Failed to stop doctor' });
  }
});

export default router;
