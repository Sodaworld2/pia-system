/**
 * Webhook API Routes
 *
 * POST   /api/webhooks/register        - Register a webhook
 * DELETE /api/webhooks/:id             - Unregister a webhook
 * PUT    /api/webhooks/:id/active      - Enable/disable a webhook
 * GET    /api/webhooks                 - List all webhooks
 * GET    /api/webhooks/stats           - Webhook statistics
 * GET    /api/webhooks/deliveries      - Delivery history
 * POST   /api/webhooks/incoming/:source - Receive external webhook
 * GET    /api/webhooks/incoming        - View incoming webhook log
 * POST   /api/webhooks/test/:id        - Test fire a webhook
 */

import { Router, Request, Response } from 'express';
import { getWebhookManager } from '../../comms/webhooks.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('WebhooksAPI');

// POST /api/webhooks/register
router.post('/register', (req: Request, res: Response) => {
  try {
    const { name, url, events, secret, repoName } = req.body;
    if (!name || !url || !events?.length) {
      res.status(400).json({ error: 'name, url, and events[] are required' });
      return;
    }
    const hook = getWebhookManager().register({ name, url, events, secret, repoName });
    res.status(201).json(hook);
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// DELETE /api/webhooks/:id
router.delete('/:id', (req: Request, res: Response) => {
  const removed = getWebhookManager().unregister(req.params.id as string);
  res.json({ removed });
});

// PUT /api/webhooks/:id/active
router.put('/:id/active', (req: Request, res: Response) => {
  getWebhookManager().setActive(req.params.id as string, req.body.active !== false);
  res.json({ status: 'updated' });
});

// GET /api/webhooks
router.get('/', (_req: Request, res: Response) => {
  res.json({ webhooks: getWebhookManager().getAll() });
});

// GET /api/webhooks/stats
router.get('/stats', (_req: Request, res: Response) => {
  res.json(getWebhookManager().getStats());
});

// GET /api/webhooks/deliveries
router.get('/deliveries', (req: Request, res: Response) => {
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
  const webhookId = typeof req.query.webhookId === 'string' ? req.query.webhookId : undefined;
  res.json({ deliveries: getWebhookManager().getDeliveries({ webhookId, limit }) });
});

// POST /api/webhooks/incoming/:source - External services push events here
router.post('/incoming/:source', (req: Request, res: Response) => {
  try {
    const source = req.params.source as string;
    const event = (req.body.event as string) || 'generic';
    const payload = req.body.payload || req.body;

    const evt = getWebhookManager().handleIncoming(source, event, payload);
    logger.info(`Incoming webhook from ${source}: ${event}`);
    res.status(201).json(evt);
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// GET /api/webhooks/incoming
router.get('/incoming', (req: Request, res: Response) => {
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
  res.json({ events: getWebhookManager().getIncomingLog(limit) });
});

// POST /api/webhooks/test/:id - Test fire
router.post('/test/:id', async (req: Request, res: Response) => {
  try {
    const hook = getWebhookManager().getById(req.params.id as string);
    if (!hook) { res.status(404).json({ error: 'Webhook not found' }); return; }

    const deliveries = await getWebhookManager().fire('test', 'pia-hub', {
      message: 'Test webhook from PIA',
      timestamp: Date.now(),
    });

    res.json({ tested: true, deliveries });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

export default router;
