/**
 * Agent Messaging API Routes
 *
 * POST /api/messages/send         - Send direct message
 * POST /api/messages/broadcast    - Broadcast to all agents
 * GET  /api/messages/stats        - Messaging statistics
 * GET  /api/messages/:agentId     - Get messages for an agent
 * POST /api/messages/:messageId/read - Mark message as read
 */

import { Router, Request, Response } from 'express';
import { getAgentBus } from '../../comms/agent-bus.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('MessagesAPI');

// POST /api/messages/send - Send a direct message
router.post('/send', (req: Request, res: Response) => {
  try {
    const { from, to, content, type, metadata } = req.body;

    if (!from || !to || !content) {
      res.status(400).json({ error: 'from, to, and content are required' });
      return;
    }

    const bus = getAgentBus();
    const msg = bus.send(from, to, content, type, metadata);

    logger.info(`Message sent: ${from} → ${to}`);
    res.status(201).json(msg);
  } catch (error) {
    logger.error(`Failed to send message: ${error}`);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/messages/broadcast - Broadcast to all agents
router.post('/broadcast', (req: Request, res: Response) => {
  try {
    const { from, content, metadata } = req.body;

    if (!from || !content) {
      res.status(400).json({ error: 'from and content are required' });
      return;
    }

    const bus = getAgentBus();
    const msg = bus.broadcast(from, content, metadata);

    logger.info(`Broadcast from: ${from}`);
    res.status(201).json(msg);
  } catch (error) {
    logger.error(`Failed to broadcast: ${error}`);
    res.status(500).json({ error: 'Failed to broadcast message' });
  }
});

// GET /api/messages/stats - Get messaging statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const bus = getAgentBus();
    res.json(bus.getStats());
  } catch (error) {
    logger.error(`Failed to get stats: ${error}`);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/messages/:agentId - Get messages for an agent
router.get('/:agentId', (req: Request, res: Response) => {
  try {
    const unread = req.query.unread === 'true';
    const bus = getAgentBus();
    const messages = bus.getMessages(req.params.agentId as string, unread);

    res.json({ agentId: req.params.agentId, count: messages.length, messages });
  } catch (error) {
    logger.error(`Failed to get messages: ${error}`);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST /api/messages/:messageId/read - Mark a message as read
router.post('/:messageId/read', (req: Request, res: Response) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      res.status(400).json({ error: 'agentId is required' });
      return;
    }

    const bus = getAgentBus();
    bus.markRead(req.params.messageId as string, agentId);

    res.json({ status: 'ok' });
  } catch (error) {
    logger.error(`Failed to mark read: ${error}`);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

export default router;
