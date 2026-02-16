/**
 * Machine Message Board API Routes
 *
 * Persistent machine-to-machine messaging with database storage.
 *
 * GET    /api/machine-board            - Get messages (query filters)
 * GET    /api/machine-board/unread/:machineId - Unread messages for a machine
 * POST   /api/machine-board/send       - Send a message (via relay + persist)
 * POST   /api/machine-board/:messageId/read - Mark message as read
 * POST   /api/machine-board/read-all/:machineId - Mark all read for a machine
 * GET    /api/machine-board/stats      - Message board statistics
 * DELETE /api/machine-board/cleanup    - Delete old read messages
 */

import { Router, Request, Response } from 'express';
import { getCrossMachineRelay } from '../../comms/cross-machine.js';
import {
  getMachineMessages,
  getUnreadMessages,
  markMessageRead,
  markAllRead,
  getMessageStats,
  deleteOldMessages,
} from '../../db/queries/machine-messages.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('MachineBoardAPI');

// GET / - Get messages with optional filters
router.get('/', (req: Request, res: Response) => {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
    const unread = req.query.unread === 'true';
    const since = typeof req.query.since === 'string' ? parseInt(req.query.since, 10) : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;

    const messages = getMachineMessages({ from, to, type, channel, unread, since, limit });
    res.json({ count: messages.length, messages });
  } catch (error) {
    logger.error(`Failed to get messages: ${error}`);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// GET /stats - Message board statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    res.json(getMessageStats());
  } catch (error) {
    logger.error(`Failed to get stats: ${error}`);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /unread/:machineId - Unread messages for a machine
router.get('/unread/:machineId', (req: Request, res: Response) => {
  try {
    const messages = getUnreadMessages(req.params.machineId as string);
    res.json({ machineId: req.params.machineId, unread: messages.length, messages });
  } catch (error) {
    logger.error(`Failed to get unread messages: ${error}`);
    res.status(500).json({ error: 'Failed to get unread messages' });
  }
});

// POST /send - Send a message via relay (persists automatically)
router.post('/send', (req: Request, res: Response) => {
  try {
    const { to, content, type, metadata } = req.body;

    if (!to || !content) {
      res.status(400).json({ error: 'to and content are required' });
      return;
    }

    const relay = getCrossMachineRelay();
    const msg = relay.send(to, content, type || 'chat', 'api', metadata);

    logger.info(`Machine board message sent to ${to}`);
    res.status(201).json(msg);
  } catch (error) {
    logger.error(`Failed to send message: ${error}`);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /:messageId/read - Mark a message as read
router.post('/:messageId/read', (req: Request, res: Response) => {
  try {
    markMessageRead(req.params.messageId as string);
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error(`Failed to mark read: ${error}`);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// POST /read-all/:machineId - Mark all messages read for a machine
router.post('/read-all/:machineId', (req: Request, res: Response) => {
  try {
    markAllRead(req.params.machineId as string);
    res.json({ status: 'ok', machineId: req.params.machineId });
  } catch (error) {
    logger.error(`Failed to mark all read: ${error}`);
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

// DELETE /cleanup - Delete old read messages
router.delete('/cleanup', (req: Request, res: Response) => {
  try {
    const days = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : 30;
    const deleted = deleteOldMessages(days);
    logger.info(`Cleaned up ${deleted} old machine messages`);
    res.json({ deleted, daysOld: days });
  } catch (error) {
    logger.error(`Failed to cleanup: ${error}`);
    res.status(500).json({ error: 'Failed to cleanup messages' });
  }
});

export default router;
