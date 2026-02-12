/**
 * MQTT-style PubSub API Routes
 *
 * POST   /api/pubsub/publish           - Publish a message to a topic
 * POST   /api/pubsub/subscribe         - Subscribe to a topic (returns sub ID)
 * DELETE /api/pubsub/subscribe/:id     - Unsubscribe
 * GET    /api/pubsub/topics            - List all active topics
 * GET    /api/pubsub/messages/:topic   - Get messages for a topic
 * GET    /api/pubsub/retained/:topic   - Get retained message
 * GET    /api/pubsub/subscriptions     - List all subscriptions
 * GET    /api/pubsub/stats             - PubSub statistics
 */

import { Router, Request, Response } from 'express';
import { getMQTTBroker } from '../../comms/mqtt-broker.js';
const router = Router();

// POST /api/pubsub/publish
router.post('/publish', (req: Request, res: Response) => {
  try {
    const { topic, payload, publisher, retain } = req.body;
    if (!topic || payload === undefined) {
      res.status(400).json({ error: 'topic and payload are required' });
      return;
    }

    const msg = getMQTTBroker().publish(topic, payload, publisher || 'api', retain === true);
    res.status(201).json(msg);
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// POST /api/pubsub/subscribe - HTTP-based subscription (returns sub ID for polling)
router.post('/subscribe', (req: Request, res: Response) => {
  try {
    const { topic, subscriber } = req.body;
    if (!topic || !subscriber) {
      res.status(400).json({ error: 'topic and subscriber are required' });
      return;
    }

    // For HTTP-based subscriptions, we store messages to be polled
    const messages: unknown[] = [];
    const subId = getMQTTBroker().subscribe(topic, subscriber, (msg) => {
      messages.push(msg);
      // Cap at 100 buffered messages
      if (messages.length > 100) messages.shift();
    });

    // Store the messages array reference for polling
    (globalThis as Record<string, unknown>)[`pubsub_${subId}`] = messages;

    res.status(201).json({ subscriptionId: subId, topic, subscriber });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// DELETE /api/pubsub/subscribe/:id
router.delete('/subscribe/:id', (req: Request, res: Response) => {
  const removed = getMQTTBroker().unsubscribe(req.params.id as string);
  delete (globalThis as Record<string, unknown>)[`pubsub_${req.params.id}`];
  res.json({ removed });
});

// GET /api/pubsub/poll/:id - Poll for messages on an HTTP subscription
router.get('/poll/:id', (req: Request, res: Response) => {
  const messages = (globalThis as Record<string, unknown>)[`pubsub_${req.params.id}`] as unknown[];
  if (!messages) {
    res.status(404).json({ error: 'Subscription not found' });
    return;
  }

  // Return and clear buffered messages
  const result = [...messages];
  messages.length = 0;
  res.json({ count: result.length, messages: result });
});

// GET /api/pubsub/topics
router.get('/topics', (_req: Request, res: Response) => {
  res.json({ topics: getMQTTBroker().getTopics() });
});

// GET /api/pubsub/messages/* - Get messages for a topic (supports slashes in URL)
router.get('/messages/*', (req: Request, res: Response) => {
  const topic = (req.params as Record<string, string>)[0] || '';
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
  res.json({ topic, messages: getMQTTBroker().getMessages(topic, limit) });
});

// GET /api/pubsub/retained/* - Get retained message
router.get('/retained/*', (req: Request, res: Response) => {
  const topic = (req.params as Record<string, string>)[0] || '';
  const msg = getMQTTBroker().getRetained(topic);
  res.json({ topic, message: msg || null });
});

// GET /api/pubsub/subscriptions
router.get('/subscriptions', (_req: Request, res: Response) => {
  res.json({ subscriptions: getMQTTBroker().getSubscriptions() });
});

// GET /api/pubsub/stats
router.get('/stats', (_req: Request, res: Response) => {
  res.json(getMQTTBroker().getStats());
});

export default router;
