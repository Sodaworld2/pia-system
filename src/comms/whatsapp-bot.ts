/**
 * PIA WhatsApp Bot
 * Allows user to communicate with PIA through WhatsApp
 *
 * Uses whatsapp-web.js (unofficial WhatsApp Web client).
 * First run: displays QR code in terminal — scan with WhatsApp to link.
 * Session is persisted in data/whatsapp-session/ so you only scan once.
 */

import pkg, { Message } from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
// @ts-ignore — no type declarations available
import qrcode from 'qrcode-terminal';
import { createLogger } from '../utils/logger.js';
import { join } from 'path';

const logger = createLogger('WhatsApp');

interface WhatsAppConfig {
  allowedNumbers?: string[];   // Phone numbers that can interact (e.g. '1234567890@c.us')
  sessionPath?: string;        // Where to store session data
}

type MessageHandler = (
  message: string,
  userId: string,
  respond: (text: string) => Promise<void>,
) => Promise<void>;

export class PIAWhatsAppBot {
  private client: InstanceType<typeof Client>;
  private config: WhatsAppConfig;
  private messageHandler?: MessageHandler;
  private isReady = false;
  private currentQr: string | null = null;
  private phoneNumber: string | null = null;

  constructor(config: WhatsAppConfig = {}) {
    this.config = config;

    const dataPath = config.sessionPath || join(process.cwd(), 'data', 'whatsapp-session');

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath }),
      puppeteer: {
        headless: true,
        executablePath: this.findChrome(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
        ],
      },
    });

    this.setupEventHandlers();
  }

  private findChrome(): string {
    // Common Chrome paths on Windows
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.CHROME_PATH || '',
    ].filter(Boolean);

    // On other platforms, let puppeteer find it
    if (process.platform !== 'win32') return '';

    for (const p of paths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(p)) return p;
      } catch { /* continue */ }
    }

    return paths[0]; // Fallback to default
  }

  private setupEventHandlers() {
    this.client.on('qr', (qr: string) => {
      this.currentQr = qr;
      logger.info('WhatsApp QR code received — scan with your phone:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.currentQr = null;
      const info = this.client.info;
      this.phoneNumber = info?.wid?.user || null;
      logger.info(`WhatsApp bot ready! Connected as ${this.phoneNumber || 'unknown'}`);
    });

    this.client.on('authenticated', () => {
      logger.info('WhatsApp authenticated successfully');
      this.currentQr = null;
    });

    this.client.on('auth_failure', (msg: string) => {
      logger.error(`WhatsApp auth failure: ${msg}`);
      this.isReady = false;
    });

    this.client.on('disconnected', (reason: string) => {
      logger.warn(`WhatsApp disconnected: ${reason}`);
      this.isReady = false;
    });

    this.client.on('message', async (msg: Message) => {
      // Ignore status broadcasts and group messages (optional — can enable groups later)
      if (msg.from === 'status@broadcast') return;

      // Check allowed numbers (if set)
      if (this.config.allowedNumbers && this.config.allowedNumbers.length > 0) {
        if (!this.config.allowedNumbers.includes(msg.from)) {
          return;
        }
      }

      if (this.messageHandler) {
        const respond = async (text: string) => {
          // WhatsApp has a ~65000 char limit per message, but split at 4000 for readability
          const chunks = this.splitMessage(text, 4000);
          for (const chunk of chunks) {
            await msg.reply(chunk);
          }
        };

        try {
          logger.info(`WhatsApp message from ${msg.from}: ${msg.body.substring(0, 80)}...`);
          await this.messageHandler(msg.body, msg.from, respond);
        } catch (error) {
          logger.error(`Error handling WhatsApp message: ${error}`);
          await msg.reply('Sorry, I encountered an error processing your message.');
        }
      }
    });

    this.client.on('message_create', (msg: Message) => {
      // Messages sent by the bot itself (for logging)
      if (msg.fromMe) {
        logger.debug(`WhatsApp sent: ${msg.body.substring(0, 80)}...`);
      }
    });
  }

  private splitMessage(text: string, maxLength = 4000): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    return chunks;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    logger.info('WhatsApp bot starting... (this may take a moment to launch browser)');
    await this.client.initialize();
  }

  async stop(): Promise<void> {
    await this.client.destroy();
    this.isReady = false;
    logger.info('WhatsApp bot stopped');
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.isReady) {
      throw new Error('WhatsApp client not ready');
    }
    const chunks = this.splitMessage(text);
    for (const chunk of chunks) {
      await this.client.sendMessage(chatId, chunk);
    }
  }

  getStatus(): { ready: boolean; phone?: string; qrPending: boolean } {
    return {
      ready: this.isReady,
      phone: this.phoneNumber || undefined,
      qrPending: this.currentQr !== null,
    };
  }

  getQR(): string | null {
    return this.currentQr;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let whatsappBot: PIAWhatsAppBot | null = null;

export function getWhatsAppBot(): PIAWhatsAppBot | null {
  return whatsappBot;
}

export function createWhatsAppBot(config?: WhatsAppConfig): PIAWhatsAppBot {
  if (whatsappBot) return whatsappBot;
  whatsappBot = new PIAWhatsAppBot(config);
  return whatsappBot;
}
