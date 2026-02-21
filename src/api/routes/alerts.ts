import { Router, Request, Response } from 'express';
import {
  getAllAlerts,
  getAlertById,
  getUnacknowledgedAlerts,
  getAlertsByMachine,
  getAlertsByAgent,
  createAlert,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  getAlertCounts,
  AlertInput,
} from '../../db/queries/alerts.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('AlertsAPI');

// GET /api/alerts - List alerts
router.get('/', (req: Request, res: Response) => {
  try {
    const { machine, agent, unacknowledged, limit } = req.query;

    let alerts;

    if (unacknowledged === 'true') {
      alerts = getUnacknowledgedAlerts();
    } else if (machine && typeof machine === 'string') {
      alerts = getAlertsByMachine(machine);
    } else if (agent && typeof agent === 'string') {
      alerts = getAlertsByAgent(agent);
    } else {
      const l = limit ? parseInt(limit as string, 10) : 100;
      alerts = getAllAlerts(l);
    }

    res.json(alerts);
  } catch (error) {
    logger.error(`Failed to get alerts: ${error}`);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// GET /api/alerts/counts - Get alert counts by type
router.get('/counts', (_req: Request, res: Response) => {
  try {
    const counts = getAlertCounts();
    res.json(counts);
  } catch (error) {
    logger.error(`Failed to get alert counts: ${error}`);
    res.status(500).json({ error: 'Failed to get alert counts' });
  }
});

// GET /api/alerts/:id - Get alert by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }

    const alert = getAlertById(id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    res.json(alert);
  } catch (error) {
    logger.error(`Failed to get alert: ${error}`);
    res.status(500).json({ error: 'Failed to get alert' });
  }
});

// POST /api/alerts - Create new alert
router.post('/', async (req: Request, res: Response) => {
  try {
    const { machine_id, agent_id, type, message } = req.body as AlertInput;

    if (!type || !message) {
      res.status(400).json({ error: 'type and message are required' });
      return;
    }

    const alert = createAlert({ machine_id, agent_id, type, message });
    logger.info(`Alert created: ${type} - ${message}`);

    // Notify via WebSocket
    try {
      const { getWebSocketServer } = await import('../../tunnel/websocket-server.js');
      const ws = getWebSocketServer();
      ws.sendAlert({
        id: alert.id,
        type: alert.type,
        message: alert.message,
        machine_id: alert.machine_id,
        agent_id: alert.agent_id,
        created_at: alert.created_at,
      });
    } catch {
      // WebSocket not available
    }

    res.status(201).json(alert);
  } catch (error) {
    logger.error(`Failed to create alert: ${error}`);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// POST /api/alerts/:id/ack - Acknowledge alert
router.post('/:id/ack', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }

    const alert = getAlertById(id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    acknowledgeAlert(id);
    logger.info(`Alert acknowledged: ${id}`);

    res.json({ status: 'acknowledged' });
  } catch (error) {
    logger.error(`Failed to acknowledge alert: ${error}`);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// POST /api/alerts/ack-all - Acknowledge all alerts
router.post('/ack-all', (_req: Request, res: Response) => {
  try {
    acknowledgeAllAlerts();
    logger.info('All alerts acknowledged');
    res.json({ status: 'all acknowledged' });
  } catch (error) {
    logger.error(`Failed to acknowledge all alerts: ${error}`);
    res.status(500).json({ error: 'Failed to acknowledge all alerts' });
  }
});

export default router;
