/**
 * WhatsApp Bot API Routes
 *
 * GET  /api/whatsapp/status  - Connection status + phone number
 * GET  /api/whatsapp/qr      - Get current QR code (for pairing)
 * POST /api/whatsapp/send    - Send a message to a WhatsApp number
 * POST /api/whatsapp/start   - Start the WhatsApp bot
 * POST /api/whatsapp/stop    - Stop the WhatsApp bot
 */

import { Router, Request, Response } from 'express';
import { getWhatsAppBot, createWhatsAppBot } from '../../comms/whatsapp-bot.js';
import { handleWhatsAppCommand } from '../../services/whatsapp-command-bridge.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('WhatsAppAPI');

// GET /status - WhatsApp connection status
router.get('/status', (_req: Request, res: Response) => {
  const bot = getWhatsAppBot();
  if (!bot) {
    res.json({ enabled: false, ready: false, qrPending: false });
    return;
  }
  res.json({ enabled: true, ...bot.getStatus() });
});

// GET /qr - Get current QR code string (for displaying in UI)
router.get('/qr', (_req: Request, res: Response) => {
  const bot = getWhatsAppBot();
  if (!bot) {
    res.status(404).json({ error: 'WhatsApp bot not initialized' });
    return;
  }
  const qr = bot.getQR();
  if (!qr) {
    res.json({ qr: null, message: bot.getStatus().ready ? 'Already connected' : 'No QR code available yet' });
    return;
  }
  res.json({ qr });
});

// POST /send - Send a message to a WhatsApp chat
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      res.status(400).json({ error: 'to and message are required' });
      return;
    }

    const bot = getWhatsAppBot();
    if (!bot) {
      res.status(503).json({ error: 'WhatsApp bot not initialized' });
      return;
    }

    // Ensure the number ends with @s.whatsapp.net for Baileys (individual chats)
    const chatId = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    await bot.sendMessage(chatId, message);

    logger.info(`WhatsApp message sent to ${chatId}`);
    res.json({ status: 'sent', to: chatId });
  } catch (error) {
    logger.error(`Failed to send WhatsApp message: ${error}`);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /start - Start the WhatsApp bot
router.post('/start', async (_req: Request, res: Response) => {
  try {
    let bot = getWhatsAppBot();
    if (!bot) {
      bot = createWhatsAppBot();

      // Wire to SDK agent system via WhatsApp Command Bridge
      bot.onMessage(async (message, userId, respond) => {
        logger.info(`WhatsApp message from ${userId}: ${message.substring(0, 50)}...`);
        await handleWhatsAppCommand(message, userId, respond);
      });
    }

    if (bot.getStatus().ready) {
      res.json({ status: 'already_connected', ...bot.getStatus() });
      return;
    }

    // Start async — QR code will appear in server logs
    bot.start().catch(err => logger.error(`WhatsApp start failed: ${err}`));

    res.json({ status: 'starting', message: 'Check server logs for QR code, or poll GET /api/whatsapp/qr' });
  } catch (error) {
    logger.error(`Failed to start WhatsApp: ${error}`);
    res.status(500).json({ error: 'Failed to start WhatsApp bot' });
  }
});

// POST /stop - Stop the WhatsApp bot
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    const bot = getWhatsAppBot();
    if (!bot) {
      res.json({ status: 'not_running' });
      return;
    }

    await bot.stop();
    res.json({ status: 'stopped' });
  } catch (error) {
    logger.error(`Failed to stop WhatsApp: ${error}`);
    res.status(500).json({ error: 'Failed to stop WhatsApp bot' });
  }
});

export default router;
