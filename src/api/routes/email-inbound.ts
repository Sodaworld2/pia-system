/**
 * Email Inbound Route
 * POST /api/email/inbound — receives emails from Mailgun or Cloudflare Email Workers
 * Parses the email and creates a calendar_events entry for Fisher2050
 *
 * Auth: x-api-token header OR ?token query param (Mailgun/Cloudflare may not support custom headers)
 * Mailgun format:  multipart/form-data  — fields: sender, subject, body-plain, body-html, recipient, timestamp
 * Cloudflare format: application/json  — fields: from, to, subject, text, html
 */

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { getDatabase } from '../../db/database.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('EmailInbound');

// ---------------------------------------------------------------------------
// Auth middleware — accepts x-api-token header OR ?token query param
// Mailgun webhooks cannot send arbitrary headers, so query param is the fallback.
// ---------------------------------------------------------------------------
const EMAIL_INBOUND_TOKEN =
  process.env.EMAIL_INBOUND_TOKEN || 'pia-email-inbound-2024';

function authMiddleware(req: Request, res: Response, next: () => void): void {
  const headerToken = req.headers['x-api-token'] as string | undefined;
  const queryToken = req.query['token'] as string | undefined;

  if (headerToken === EMAIL_INBOUND_TOKEN || queryToken === EMAIL_INBOUND_TOKEN) {
    next();
    return;
  }

  logger.warn(`Rejected inbound email — bad token. IP: ${req.ip}`);
  res.status(401).json({ error: 'Unauthorized: invalid or missing token' });
}

// ---------------------------------------------------------------------------
// POST /api/email/inbound
// ---------------------------------------------------------------------------
router.post('/inbound', authMiddleware, (req: Request, res: Response): void => {
  try {
    const body = req.body as Record<string, unknown>;

    // ------------------------------------------------------------------
    // 1. Parse sender / subject / text — support both Mailgun and Cloudflare
    // ------------------------------------------------------------------
    // Mailgun: sender, subject, body-plain, body-html, recipient, timestamp
    // Cloudflare Email Workers: from, to, subject, text, html
    const from: string =
      (body['sender'] as string) ||
      (body['from'] as string) ||
      'unknown@unknown';

    const subject: string =
      (body['subject'] as string) || '(no subject)';

    const emailBody: string =
      (body['body-plain'] as string) ||   // Mailgun plain text
      (body['text'] as string) ||          // Cloudflare plain text
      (body['body-html'] as string) ||     // Mailgun HTML fallback
      (body['html'] as string) ||          // Cloudflare HTML fallback
      '';

    // ------------------------------------------------------------------
    // 2. Allowed-sender check
    // EMAIL_ALLOWED_SENDERS is a comma-separated list e.g. "mic@sodalabs.ai,team@sodalabs.ai"
    // If the env var is not set (or empty), all senders are allowed.
    // ------------------------------------------------------------------
    const allowedSenders = process.env.EMAIL_ALLOWED_SENDERS
      ? process.env.EMAIL_ALLOWED_SENDERS.split(',').map((s) => s.trim().toLowerCase())
      : [];

    if (allowedSenders.length > 0) {
      const fromLower = from.toLowerCase();
      const isAllowed = allowedSenders.some((allowed) => fromLower.includes(allowed));
      if (!isAllowed) {
        logger.warn(`Inbound email from disallowed sender "${from}" — dropping`);
        // Return 200 so Mailgun/Cloudflare does not retry; we simply ignore it.
        res.json({ received: true, ignored: true, reason: 'sender_not_allowed' });
        return;
      }
    } else {
      logger.info(`EMAIL_ALLOWED_SENDERS not set — accepting email from "${from}"`);
    }

    // ------------------------------------------------------------------
    // 3. Build the calendar_events task description
    // Truncate body to 2 000 chars to keep the task readable.
    // ------------------------------------------------------------------
    const bodySnippet = emailBody.substring(0, 2000);
    const task = `Email from ${from}: ${subject}\n\n${bodySnippet}`;

    const contextJson = JSON.stringify({
      from,
      subject,
      body: emailBody,
      receivedAt: Date.now(),
    });

    // Schedule 60 seconds from now — gives Fisher2050 a moment to process.
    const scheduledAt = Math.floor(Date.now() / 1000) + 60;

    // ------------------------------------------------------------------
    // 4. Insert into calendar_events
    // ------------------------------------------------------------------
    const db = getDatabase();
    const id = nanoid();

    db.prepare(`
      INSERT INTO calendar_events (id, agent, task, context_json, scheduled_at, created_by, soul_id)
      VALUES (?, ?, ?, ?, ?, ?, 'fisher2050')
    `).run(id, 'fisher2050', task, contextJson, scheduledAt, 'email_inbound');

    logger.info(`Inbound email queued — id: ${id}, from: "${from}", subject: "${subject}"`);

    res.json({ received: true, taskId: id });
  } catch (err) {
    logger.error(`Email inbound error: ${err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
