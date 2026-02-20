/**
 * Email Service — Outbound email via SendGrid
 *
 * Thin wrapper used by Eliyahu (morning briefings), Fisher2050 (summaries),
 * and any agent that needs to send email.
 *
 * Env vars required:
 *   SENDGRID_API_KEY   — SendGrid API key
 *   EMAIL_FROM         — sender address (default: fisher2050@sodalabs.ai)
 *   EMAIL_FROM_NAME    — sender name (default: PIA System)
 *
 * Falls back to console.log if SENDGRID_API_KEY is not set (dev mode).
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('EmailService');

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private apiKey: string;
  private fromAddress: string;
  private fromName: string;
  private devMode: boolean;

  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY || '';
    this.fromAddress = process.env.EMAIL_FROM || 'fisher2050@sodalabs.ai';
    this.fromName = process.env.EMAIL_FROM_NAME || 'PIA System';
    this.devMode = !this.apiKey;

    if (this.devMode) {
      logger.warn('SENDGRID_API_KEY not set — email will be logged to console only (dev mode)');
    } else {
      logger.info(`Email service ready — from: ${this.fromName} <${this.fromAddress}>`);
    }
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const from = options.from || this.fromAddress;
    const fromName = options.fromName || this.fromName;

    if (this.devMode) {
      logger.info(`[DEV EMAIL] To: ${recipients.join(', ')} | Subject: ${options.subject}`);
      logger.info(`[DEV EMAIL] Body preview: ${options.text || options.html.replace(/<[^>]+>/g, '').substring(0, 100)}...`);
      return { success: true, messageId: `dev-${Date.now()}` };
    }

    try {
      const payload = {
        personalizations: recipients.map(to => ({ to: [{ email: to }] })),
        from: { email: from, name: fromName },
        subject: options.subject,
        content: [
          ...(options.text ? [{ type: 'text/plain', value: options.text }] : []),
          { type: 'text/html', value: options.html },
        ],
        ...(options.replyTo ? { reply_to: { email: options.replyTo } } : {}),
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const messageId = response.headers.get('X-Message-Id') || `sg-${Date.now()}`;
        logger.info(`Email sent: "${options.subject}" → ${recipients.join(', ')} (${messageId})`);
        return { success: true, messageId };
      } else {
        const errorText = await response.text();
        logger.error(`SendGrid error ${response.status}: ${errorText}`);
        return { success: false, error: `SendGrid ${response.status}: ${errorText}` };
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error(`Email send failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /** Convenience: send a morning briefing from Eliyahu */
  async sendBriefing(to: string, subject: string, htmlBody: string): Promise<EmailResult> {
    return this.send({
      to,
      subject,
      html: htmlBody,
      from: process.env.EMAIL_ELIYAHU || 'eliyahu@sodalabs.ai',
      fromName: 'Eliyahu — PIA Intelligence',
      replyTo: this.fromAddress,
    });
  }

  /** Convenience: send a Fisher2050 standup or summary */
  async sendFisherUpdate(to: string, subject: string, htmlBody: string): Promise<EmailResult> {
    return this.send({
      to,
      subject,
      html: htmlBody,
      from: this.fromAddress,
      fromName: 'Fisher2050 — PIA Scheduler',
    });
  }

  isReady(): boolean {
    return !this.devMode;
  }
}

let instance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!instance) instance = new EmailService();
  return instance;
}
