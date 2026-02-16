/**
 * Cross-Machine Relay API Routes
 *
 * POST /api/relay/send            - Send message to another machine
 * POST /api/relay/broadcast       - Broadcast to all machines
 * GET  /api/relay/machines        - List connected machines
 * GET  /api/relay/messages        - Get message history
 * GET  /api/relay/stats           - Relay statistics
 * POST /api/relay/register        - Register a remote machine (called by remote)
 * GET  /api/relay/poll/:machineId - Poll for messages (fallback for non-WS)
 */

import { Router, Request, Response } from 'express';
import { getCrossMachineRelay } from '../../comms/cross-machine.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('RelayAPI');

// POST /api/relay/register - Register a remote machine
router.post('/register', (req: Request, res: Response) => {
  try {
    const { id, name, hostname, project, tailscaleIp, ngrokUrl, channels } = req.body;

    if (!id || !name) {
      res.status(400).json({ error: 'id and name are required' });
      return;
    }

    const relay = getCrossMachineRelay();
    const machine = relay.registerMachine({
      id,
      name,
      hostname: hostname || 'unknown',
      project,
      tailscaleIp,
      ngrokUrl,
      channels: channels || ['api'],
    });

    logger.info(`Remote machine registered via API: ${name}`);
    res.status(201).json({
      status: 'registered',
      machine: { ...machine, ws: undefined },
      hub: relay.getStats().thisMachine,
    });
  } catch (error) {
    logger.error(`Failed to register machine: ${error}`);
    res.status(500).json({ error: 'Failed to register machine' });
  }
});

// POST /api/relay/send - Send a message to a specific machine
router.post('/send', (req: Request, res: Response) => {
  try {
    const { to, content, type, metadata } = req.body;

    if (!to || !content) {
      res.status(400).json({ error: 'to and content are required' });
      return;
    }

    const relay = getCrossMachineRelay();
    const msg = relay.send(to, content, type || 'chat', 'api', metadata);

    res.status(201).json(msg);
  } catch (error) {
    logger.error(`Failed to send relay message: ${error}`);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/relay/broadcast - Broadcast to all machines
router.post('/broadcast', (req: Request, res: Response) => {
  try {
    const { content, type, metadata } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const relay = getCrossMachineRelay();
    const msg = relay.send('*', content, type || 'chat', 'api', metadata);

    res.status(201).json(msg);
  } catch (error) {
    logger.error(`Failed to broadcast: ${error}`);
    res.status(500).json({ error: 'Failed to broadcast' });
  }
});

// GET /api/relay/machines - List connected machines
router.get('/machines', (_req: Request, res: Response) => {
  try {
    const relay = getCrossMachineRelay();
    res.json({
      hub: relay.getStats().thisMachine,
      machines: relay.getAllMachines(),
    });
  } catch (error) {
    logger.error(`Failed to list machines: ${error}`);
    res.status(500).json({ error: 'Failed to list machines' });
  }
});

// GET /api/relay/messages - Get message history
router.get('/messages', (req: Request, res: Response) => {
  try {
    const relay = getCrossMachineRelay();
    const machineId = typeof req.query.machineId === 'string' ? req.query.machineId : undefined;
    const msgType = typeof req.query.type === 'string' ? req.query.type as 'chat' | 'command' | 'status' | 'file' | 'task' | 'heartbeat' : undefined;
    const channel = typeof req.query.channel === 'string' ? req.query.channel as 'websocket' | 'tailscale' | 'ngrok' | 'discord' | 'whatsapp' | 'api' : undefined;
    const since = typeof req.query.since === 'string' ? parseInt(req.query.since, 10) : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;

    const messages = relay.getMessages({
      machineId,
      type: msgType,
      channel,
      since,
      limit,
    });

    res.json({ count: messages.length, messages });
  } catch (error) {
    logger.error(`Failed to get messages: ${error}`);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// GET /api/relay/poll/:machineId - Poll for new messages (for non-WS connections)
router.get('/poll/:machineId', (req: Request, res: Response) => {
  try {
    const relay = getCrossMachineRelay();
    const since = req.query.since ? parseInt(req.query.since as string, 10) : Date.now() - 60000;

    const messages = relay.getMessages({
      machineId: req.params.machineId as string,
      since,
    });

    res.json({ count: messages.length, messages, pollTimestamp: Date.now() });
  } catch (error) {
    logger.error(`Failed to poll: ${error}`);
    res.status(500).json({ error: 'Failed to poll messages' });
  }
});

// POST /api/relay/incoming - Receive a message from a remote machine
router.post('/incoming', (req: Request, res: Response) => {
  try {
    const msg = req.body;

    if (!msg || !msg.from || !msg.content) {
      res.status(400).json({ error: 'Invalid message format' });
      return;
    }

    const relay = getCrossMachineRelay();
    relay.handleIncoming(msg);

    logger.info(`Incoming message from ${msg.from.machineName || msg.from.machineId}: ${msg.content.substring(0, 80)}`);
    res.json({ status: 'received', messageId: msg.id });
  } catch (error) {
    logger.error(`Failed to handle incoming message: ${error}`);
    res.status(500).json({ error: 'Failed to handle incoming message' });
  }
});

// GET /api/relay/stats - Relay statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const relay = getCrossMachineRelay();
    res.json(relay.getStats());
  } catch (error) {
    logger.error(`Failed to get stats: ${error}`);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
