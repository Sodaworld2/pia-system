/**
 * Webhook System - Direct repo-to-repo callbacks
 *
 * Repos register webhook URLs. When events happen (task completed,
 * status change, new message), PIA fires webhooks to all subscribers.
 * Works even for repos that aren't connected via WebSocket.
 *
 * Also supports incoming webhooks - external services can push
 * events into PIA (GitHub, Vercel, CI/CD, etc.)
 */

import { createLogger } from '../utils/logger.js';
import { nanoid } from 'nanoid';
import http from 'http';
import https from 'https';

const logger = createLogger('Webhooks');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookRegistration {
  id: string;
  name: string;                    // "dao-deploy-hook", "farcake-on-task"
  url: string;                     // http://100.102.217.69:3100/webhook
  events: string[];                // ["repo:task", "job:completed", "*"]
  secret?: string;                 // HMAC signing secret
  repoName?: string;               // Which repo registered this
  createdAt: number;
  lastFired?: number;
  lastStatus?: number;             // HTTP status of last fire
  totalFired: number;
  totalFailed: number;
  active: boolean;
}

export interface WebhookEvent {
  id: string;
  event: string;                   // "repo:task", "job:completed", "message:new"
  source: string;                  // Who triggered it
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  url: string;
  status: number | null;
  response?: string;
  duration: number;
  success: boolean;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// WebhookManager Class
// ---------------------------------------------------------------------------

export class WebhookManager {
  private hooks: Map<string, WebhookRegistration> = new Map();
  private deliveries: WebhookDelivery[] = [];
  private incomingLog: WebhookEvent[] = [];

  constructor() {
    logger.info('WebhookManager initialized');
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  register(opts: {
    name: string;
    url: string;
    events: string[];
    secret?: string;
    repoName?: string;
  }): WebhookRegistration {
    const hook: WebhookRegistration = {
      id: nanoid(),
      name: opts.name,
      url: opts.url,
      events: opts.events,
      secret: opts.secret,
      repoName: opts.repoName,
      createdAt: Date.now(),
      totalFired: 0,
      totalFailed: 0,
      active: true,
    };

    this.hooks.set(hook.id, hook);
    logger.info(`Webhook registered: ${hook.name} → ${hook.url} [${hook.events.join(', ')}]`);
    return hook;
  }

  unregister(hookId: string): boolean {
    const removed = this.hooks.delete(hookId);
    if (removed) logger.info(`Webhook unregistered: ${hookId}`);
    return removed;
  }

  setActive(hookId: string, active: boolean): void {
    const hook = this.hooks.get(hookId);
    if (hook) hook.active = active;
  }

  getAll(): WebhookRegistration[] {
    return Array.from(this.hooks.values());
  }

  getById(hookId: string): WebhookRegistration | undefined {
    return this.hooks.get(hookId);
  }

  // -------------------------------------------------------------------------
  // Firing Webhooks (Outgoing)
  // -------------------------------------------------------------------------

  /**
   * Fire an event to all matching webhook subscribers.
   */
  async fire(event: string, source: string, payload: Record<string, unknown>): Promise<WebhookDelivery[]> {
    const webhookEvent: WebhookEvent = {
      id: nanoid(),
      event,
      source,
      payload,
      timestamp: Date.now(),
    };

    const matchingHooks = Array.from(this.hooks.values()).filter(h =>
      h.active && (h.events.includes('*') || h.events.includes(event))
    );

    if (matchingHooks.length === 0) return [];

    logger.info(`Firing "${event}" to ${matchingHooks.length} webhook(s)`);

    const deliveries = await Promise.all(
      matchingHooks.map(hook => this.deliver(hook, webhookEvent))
    );

    return deliveries;
  }

  private async deliver(hook: WebhookRegistration, event: WebhookEvent): Promise<WebhookDelivery> {
    const start = Date.now();
    let status: number | null = null;
    let response = '';
    let success = false;

    try {
      const result = await this.httpPost(hook.url, {
        event: event.event,
        source: event.source,
        payload: event.payload,
        timestamp: event.timestamp,
        webhookId: hook.id,
      }, hook.secret);

      status = result.status;
      response = result.body.substring(0, 500);
      success = status !== null && status >= 200 && status < 300;
    } catch (err) {
      response = err instanceof Error ? err.message : String(err);
      success = false;
    }

    const duration = Date.now() - start;

    // Update hook stats
    hook.totalFired++;
    hook.lastFired = Date.now();
    hook.lastStatus = status ?? undefined;
    if (!success) hook.totalFailed++;

    const delivery: WebhookDelivery = {
      id: nanoid(),
      webhookId: hook.id,
      event,
      url: hook.url,
      status,
      response,
      duration,
      success,
      timestamp: Date.now(),
    };

    this.deliveries.push(delivery);
    if (this.deliveries.length > 5000) {
      this.deliveries.splice(0, this.deliveries.length - 5000);
    }

    logger.info(`Webhook ${hook.name}: ${success ? 'OK' : 'FAIL'} (${status}) ${duration}ms`);
    return delivery;
  }

  // -------------------------------------------------------------------------
  // Incoming Webhooks (External → PIA)
  // -------------------------------------------------------------------------

  /**
   * Handle an incoming webhook from an external service.
   */
  handleIncoming(source: string, event: string, payload: Record<string, unknown>): WebhookEvent {
    const evt: WebhookEvent = {
      id: nanoid(),
      event: `incoming:${event}`,
      source,
      payload,
      timestamp: Date.now(),
    };

    this.incomingLog.push(evt);
    if (this.incomingLog.length > 2000) {
      this.incomingLog.splice(0, this.incomingLog.length - 2000);
    }

    logger.info(`Incoming webhook from ${source}: ${event}`);

    // Auto-fire to subscribers of incoming events
    this.fire(`incoming:${event}`, source, payload);

    return evt;
  }

  // -------------------------------------------------------------------------
  // History & Stats
  // -------------------------------------------------------------------------

  getDeliveries(opts?: { webhookId?: string; success?: boolean; limit?: number }): WebhookDelivery[] {
    let list = [...this.deliveries];
    if (opts?.webhookId) list = list.filter(d => d.webhookId === opts.webhookId);
    if (opts?.success !== undefined) list = list.filter(d => d.success === opts.success);
    list.sort((a, b) => b.timestamp - a.timestamp);
    if (opts?.limit) list = list.slice(0, opts.limit);
    return list;
  }

  getIncomingLog(limit = 50): WebhookEvent[] {
    return [...this.incomingLog].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  getStats(): {
    totalHooks: number;
    activeHooks: number;
    totalDeliveries: number;
    successRate: number;
    totalIncoming: number;
    hooks: Array<{ id: string; name: string; url: string; events: string[]; active: boolean; totalFired: number; totalFailed: number; lastStatus: number | null }>;
  } {
    const active = Array.from(this.hooks.values()).filter(h => h.active).length;
    const successful = this.deliveries.filter(d => d.success).length;

    return {
      totalHooks: this.hooks.size,
      activeHooks: active,
      totalDeliveries: this.deliveries.length,
      successRate: this.deliveries.length > 0 ? Math.round((successful / this.deliveries.length) * 100) : 100,
      totalIncoming: this.incomingLog.length,
      hooks: this.getAll().map(h => ({
        id: h.id,
        name: h.name,
        url: h.url,
        events: h.events,
        active: h.active,
        totalFired: h.totalFired,
        totalFailed: h.totalFailed,
        lastStatus: h.lastStatus || null,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // HTTP Helper
  // -------------------------------------------------------------------------

  private httpPost(url: string, body: unknown, _secret?: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const mod = isHttps ? https : http;

      const data = JSON.stringify(body);

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'PIA-Webhook/1.0',
          'X-PIA-Event': (body as Record<string, unknown>).event as string || 'unknown',
        },
        timeout: 10000,
      };

      const req = mod.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => resolve({ status: res.statusCode || 0, body: responseBody }));
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(data);
      req.end();
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let manager: WebhookManager | null = null;

export function getWebhookManager(): WebhookManager {
  if (!manager) {
    manager = new WebhookManager();
  }
  return manager;
}
