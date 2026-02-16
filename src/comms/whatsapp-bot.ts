/**
 * PIA WhatsApp Bot
 * Allows user to communicate with PIA through WhatsApp
 *
 * Uses Baileys (pure WebSocket, no browser needed — ~2MB vs 200MB for whatsapp-web.js).
 * First run: displays QR code in terminal — scan with WhatsApp to link.
 * Session is persisted in data/whatsapp-session/ so you only scan once.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
// @ts-ignore — no type declarations available
import qrcode from 'qrcode-terminal';
import { createLogger } from '../utils/logger.js';
import { getDataSubDir } from '../electron-paths.js';

const logger = createLogger('WhatsApp');

interface WhatsAppConfig {
  allowedNumbers?: string[];   // Phone numbers that can interact (e.g. '1234567890@s.whatsapp.net')
  sessionPath?: string;        // Where to store session data
}

type MessageHandler = (
  message: string,
  userId: string,
  respond: (text: string) => Promise<void>,
) => Promise<void>;

export class PIAWhatsAppBot {
  private sock: WASocket | null = null;
  private config: WhatsAppConfig;
  private messageHandler?: MessageHandler;
  private isReady = false;
  private currentQr: string | null = null;
  private phoneNumber: string | null = null;
  private authPath: string;
  private shouldReconnect = true;

  constructor(config: WhatsAppConfig = {}) {
    this.config = config;
    this.authPath = config.sessionPath || getDataSubDir('whatsapp-session');
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: P({ level: 'silent' }) as any,
      printQRInTerminal: false, // We handle QR ourselves
      getMessage: async () => undefined,
    });

    this.sock = sock;

    // Save credentials on every update
    sock.ev.on('creds.update', saveCreds);

    // Connection status
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.currentQr = qr;
        logger.info('WhatsApp QR code received — scan with your phone:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        this.isReady = true;
        this.currentQr = null;
        this.phoneNumber = sock.user?.id?.split(':')[0] || null;
        logger.info(`WhatsApp bot ready! Connected as ${this.phoneNumber || 'unknown'}`);
      }

      if (connection === 'close') {
        this.isReady = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          logger.warn('WhatsApp logged out. Delete session folder to re-authenticate.');
          this.shouldReconnect = false;
        } else if (this.shouldReconnect) {
          logger.info(`WhatsApp disconnected (code ${statusCode}). Reconnecting...`);
          setTimeout(() => this.connect(), 3000);
        }
      }
    });

    // Incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        // Skip messages sent by us
        if (msg.key.fromMe) continue;

        const jid = msg.key.remoteJid!;

        // Ignore status broadcasts
        if (jid === 'status@broadcast') continue;

        // Check allowed numbers (if set)
        if (this.config.allowedNumbers && this.config.allowedNumbers.length > 0) {
          if (!this.config.allowedNumbers.includes(jid)) {
            continue;
          }
        }

        // Extract text content
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          '';

        if (!text || !this.messageHandler) continue;

        const respond = async (replyText: string) => {
          const chunks = this.splitMessage(replyText, 4000);
          for (const chunk of chunks) {
            await sock.sendMessage(jid, { text: chunk }, { quoted: msg });
          }
        };

        try {
          logger.info(`WhatsApp message from ${jid}: ${text.substring(0, 80)}...`);
          await this.messageHandler(text, jid, respond);
        } catch (error) {
          logger.error(`Error handling WhatsApp message: ${error}`);
          await sock.sendMessage(jid, { text: 'Sorry, I encountered an error processing your message.' });
        }
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
    logger.info('WhatsApp bot starting... (pure WebSocket — no browser needed)');
    this.shouldReconnect = true;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.shouldReconnect = false;
    if (this.sock) {
      this.sock.ws.close();
      this.sock = null;
    }
    this.isReady = false;
    logger.info('WhatsApp bot stopped');
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp client not ready');
    }
    // Normalize JID format: Baileys uses @s.whatsapp.net, not @c.us
    const jid = chatId.replace('@c.us', '@s.whatsapp.net');
    const chunks = this.splitMessage(text);
    for (const chunk of chunks) {
      await this.sock.sendMessage(jid, { text: chunk });
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
