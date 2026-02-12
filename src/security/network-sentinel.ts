/**
 * Network Sentinel - Intrusion Detection & Connection Security
 *
 * Monitors all connections for:
 * - Unknown IP addresses (non-Tailscale)
 * - Brute force authentication attempts
 * - Port scanning behavior (rapid unique endpoint hits)
 * - Rate limit violations
 * - WebSocket message floods
 * - Traffic anomalies
 *
 * Provides Express middleware + WebSocket guards + API for the Visor Security tab.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';
import crypto from 'crypto';

const logger = createLogger('Sentinel');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SecurityEventType =
  | 'unknown_ip'
  | 'failed_auth'
  | 'brute_force_blocked'
  | 'port_scan_detected'
  | 'rate_limit_exceeded'
  | 'ws_flood_detected'
  | 'ip_blocked'
  | 'ip_unblocked'
  | 'connection_new'
  | 'connection_suspicious';

export interface SecurityEvent {
  id: string;
  timestamp: number;
  type: SecurityEventType;
  ip: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
}

interface IPState {
  ip: string;
  firstSeen: number;
  lastSeen: number;
  totalRequests: number;
  failedAuths: number;
  uniqueEndpoints: Set<string>;
  requestTimestamps: number[];
  blocked: boolean;
  blockedAt: number;
  blockedReason: string;
  wsMessageTimestamps: number[];
  isTailscale: boolean;
  isLocalhost: boolean;
  userAgent: string;
}

interface SentinelConfig {
  allowedIPs: Set<string>;
  maxFailedAuth: number;
  blockDurationMs: number;
  rateLimitPerSecond: number;
  portScanThreshold: number;
  wsMaxMessagesPerSecond: number;
}

// ---------------------------------------------------------------------------
// Network Sentinel
// ---------------------------------------------------------------------------

export class NetworkSentinel {
  private config: SentinelConfig;
  private ipStates: Map<string, IPState> = new Map();
  private events: SecurityEvent[] = [];
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<SentinelConfig>) {
    this.config = {
      allowedIPs: config?.allowedIPs || new Set(),
      maxFailedAuth: config?.maxFailedAuth || 5,
      blockDurationMs: config?.blockDurationMs || 15 * 60 * 1000,
      rateLimitPerSecond: config?.rateLimitPerSecond || 50,
      portScanThreshold: config?.portScanThreshold || 30,
      wsMaxMessagesPerSecond: config?.wsMaxMessagesPerSecond || 100,
    };

    this.startCleanup();
    logger.info('Network Sentinel initialized - watching all connections');
  }

  // -------------------------------------------------------------------------
  // IP State Management
  // -------------------------------------------------------------------------

  private normalizeIP(ip: string): string {
    // Strip IPv6 prefix from IPv4-mapped addresses
    if (ip.startsWith('::ffff:')) return ip.substring(7);
    return ip;
  }

  private getOrCreateIPState(ip: string, userAgent?: string): IPState {
    ip = this.normalizeIP(ip);
    let state = this.ipStates.get(ip);
    if (!state) {
      const isTailscale = this.config.allowedIPs.has(ip) || ip.startsWith('100.');
      const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';

      state = {
        ip,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalRequests: 0,
        failedAuths: 0,
        uniqueEndpoints: new Set(),
        requestTimestamps: [],
        blocked: false,
        blockedAt: 0,
        blockedReason: '',
        wsMessageTimestamps: [],
        isTailscale,
        isLocalhost,
        userAgent: userAgent || 'unknown',
      };
      this.ipStates.set(ip, state);

      // Alert on unknown (non-Tailscale, non-localhost) IP
      if (!isTailscale && !isLocalhost) {
        this.emitEvent({
          type: 'unknown_ip',
          ip,
          details: `Unknown IP address connected: ${ip} (UA: ${userAgent || 'none'})`,
          severity: 'warning',
        });
      } else {
        this.emitEvent({
          type: 'connection_new',
          ip,
          details: `New ${isTailscale ? 'Tailscale' : 'local'} connection: ${ip}`,
          severity: 'info',
        });
      }
    }
    return state;
  }

  // -------------------------------------------------------------------------
  // Detection: Brute Force
  // -------------------------------------------------------------------------

  recordFailedAuth(ip: string): void {
    ip = this.normalizeIP(ip);
    const state = this.getOrCreateIPState(ip);
    state.failedAuths++;

    this.emitEvent({
      type: 'failed_auth',
      ip,
      details: `Failed auth attempt #${state.failedAuths} from ${ip}`,
      severity: state.failedAuths >= 3 ? 'warning' : 'info',
    });

    if (state.failedAuths >= this.config.maxFailedAuth) {
      this.blockIP(state, 'brute_force_blocked',
        `${state.failedAuths} failed authentication attempts`);
    }
  }

  // -------------------------------------------------------------------------
  // Detection: Port Scanning
  // -------------------------------------------------------------------------

  private checkPortScan(state: IPState, endpoint: string): void {
    state.uniqueEndpoints.add(endpoint);
    // Never block localhost or Tailscale IPs for port scanning — dashboards hit many endpoints
    if (state.isLocalhost || state.isTailscale) return;
    if (state.uniqueEndpoints.size > this.config.portScanThreshold) {
      this.blockIP(state, 'port_scan_detected',
        `Hit ${state.uniqueEndpoints.size} unique endpoints rapidly`);
    }
  }

  // -------------------------------------------------------------------------
  // Detection: Rate Limiting
  // -------------------------------------------------------------------------

  private checkRateLimit(state: IPState): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    state.requestTimestamps = state.requestTimestamps.filter(t => t > oneSecondAgo);
    state.requestTimestamps.push(now);

    if (state.requestTimestamps.length > this.config.rateLimitPerSecond) {
      this.emitEvent({
        type: 'rate_limit_exceeded',
        ip: state.ip,
        details: `${state.requestTimestamps.length} requests in last second (limit: ${this.config.rateLimitPerSecond})`,
        severity: 'warning',
      });
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Detection: WebSocket Flood
  // -------------------------------------------------------------------------

  checkWebSocketFlood(ip: string): boolean {
    ip = this.normalizeIP(ip);
    const state = this.getOrCreateIPState(ip);
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    state.wsMessageTimestamps = state.wsMessageTimestamps.filter(t => t > oneSecondAgo);
    state.wsMessageTimestamps.push(now);

    if (state.wsMessageTimestamps.length > this.config.wsMaxMessagesPerSecond) {
      this.blockIP(state, 'ws_flood_detected',
        `${state.wsMessageTimestamps.length} WebSocket messages in last second`);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // IP Blocking
  // -------------------------------------------------------------------------

  private blockIP(state: IPState, eventType: SecurityEventType, reason: string): void {
    if (state.blocked) return;
    state.blocked = true;
    state.blockedAt = Date.now();
    state.blockedReason = reason;

    this.emitEvent({
      type: eventType,
      ip: state.ip,
      details: `BLOCKED: ${reason}`,
      severity: 'critical',
    });
  }

  private isBlocked(state: IPState): boolean {
    if (!state.blocked) return false;
    if (Date.now() - state.blockedAt > this.config.blockDurationMs) {
      state.blocked = false;
      state.failedAuths = 0;
      state.uniqueEndpoints.clear();
      this.emitEvent({
        type: 'ip_unblocked',
        ip: state.ip,
        details: 'Block expired after timeout',
        severity: 'info',
      });
      return false;
    }
    return true;
  }

  unblockIP(ip: string): boolean {
    ip = this.normalizeIP(ip);
    const state = this.ipStates.get(ip);
    if (state && state.blocked) {
      state.blocked = false;
      state.failedAuths = 0;
      state.uniqueEndpoints.clear();
      this.emitEvent({
        type: 'ip_unblocked',
        ip,
        details: 'Manually unblocked by admin',
        severity: 'info',
      });
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Express Middleware
  // -------------------------------------------------------------------------

  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const rawIP = req.ip || req.socket.remoteAddress || 'unknown';
      const ip = this.normalizeIP(rawIP);
      const ua = req.headers['user-agent'] || '';
      const state = this.getOrCreateIPState(ip, ua);

      state.lastSeen = Date.now();
      state.totalRequests++;

      // Check if blocked
      if (this.isBlocked(state)) {
        logger.warn(`Sentinel BLOCKED: ${ip} - ${state.blockedReason}`);
        res.status(403).json({ error: 'Access denied by security policy' });
        return;
      }

      // Check rate limit
      if (this.checkRateLimit(state)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // Check for port scanning behavior
      const endpoint = `${req.method} ${req.path}`;
      this.checkPortScan(state, endpoint);

      if (state.blocked) {
        res.status(403).json({ error: 'Access denied by security policy' });
        return;
      }

      // Attach sentinel context
      (req as any).sentinel = { ip, isTailscale: state.isTailscale, isLocalhost: state.isLocalhost };

      next();
    };
  }

  // -------------------------------------------------------------------------
  // Allowed IPs
  // -------------------------------------------------------------------------

  addAllowedIP(ip: string): void {
    this.config.allowedIPs.add(this.normalizeIP(ip));
    const state = this.ipStates.get(this.normalizeIP(ip));
    if (state) state.isTailscale = true;
  }

  removeAllowedIP(ip: string): void {
    this.config.allowedIPs.delete(this.normalizeIP(ip));
  }

  getAllowedIPs(): string[] {
    return Array.from(this.config.allowedIPs);
  }

  // -------------------------------------------------------------------------
  // Event System
  // -------------------------------------------------------------------------

  private emitEvent(partial: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    const event: SecurityEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...partial,
    };

    this.events.push(event);
    if (this.events.length > 10000) {
      this.events.splice(0, this.events.length - 10000);
    }

    if (event.severity === 'critical') {
      logger.error(`[CRITICAL] ${event.type}: ${event.details}`);
    } else if (event.severity === 'warning') {
      logger.warn(`[WARNING] ${event.type}: ${event.details}`);
    }
  }

  // -------------------------------------------------------------------------
  // Stats & Dashboard
  // -------------------------------------------------------------------------

  getStats(): {
    totalTrackedIPs: number;
    tailscaleIPs: number;
    unknownIPs: number;
    blockedIPs: number;
    totalEvents: number;
    criticalEvents: number;
    warningEvents: number;
    topRequesters: Array<{ ip: string; count: number; isTailscale: boolean; blocked: boolean }>;
    recentEvents: SecurityEvent[];
    connections: Array<{
      ip: string;
      firstSeen: number;
      lastSeen: number;
      requests: number;
      failedAuths: number;
      blocked: boolean;
      blockedReason: string;
      isTailscale: boolean;
      isLocalhost: boolean;
      userAgent: string;
    }>;
  } {
    const states = Array.from(this.ipStates.values());

    return {
      totalTrackedIPs: states.length,
      tailscaleIPs: states.filter(s => s.isTailscale).length,
      unknownIPs: states.filter(s => !s.isTailscale && !s.isLocalhost).length,
      blockedIPs: states.filter(s => s.blocked).length,
      totalEvents: this.events.length,
      criticalEvents: this.events.filter(e => e.severity === 'critical').length,
      warningEvents: this.events.filter(e => e.severity === 'warning').length,
      topRequesters: states
        .sort((a, b) => b.totalRequests - a.totalRequests)
        .slice(0, 10)
        .map(s => ({ ip: s.ip, count: s.totalRequests, isTailscale: s.isTailscale, blocked: s.blocked })),
      recentEvents: this.events.slice(-100).reverse(),
      connections: states.map(s => ({
        ip: s.ip,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
        requests: s.totalRequests,
        failedAuths: s.failedAuths,
        blocked: s.blocked,
        blockedReason: s.blockedReason,
        isTailscale: s.isTailscale,
        isLocalhost: s.isLocalhost,
        userAgent: s.userAgent,
      })),
    };
  }

  getEvents(opts?: { type?: string; severity?: string; limit?: number }): SecurityEvent[] {
    let filtered = [...this.events];
    if (opts?.type) filtered = filtered.filter(e => e.type === opts.type);
    if (opts?.severity) filtered = filtered.filter(e => e.severity === opts.severity);
    filtered.reverse();
    if (opts?.limit) filtered = filtered.slice(0, opts.limit);
    return filtered;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [ip, state] of this.ipStates) {
        if (state.lastSeen < cutoff && !state.blocked) {
          this.ipStates.delete(ip);
        }
      }
      // Reset endpoint tracking for port scan detection
      for (const state of this.ipStates.values()) {
        if (!state.blocked) {
          state.uniqueEndpoints.clear();
        }
      }
    }, 60000);
  }

  stop(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let sentinel: NetworkSentinel | null = null;

export function initNetworkSentinel(tailscaleIPs?: string[]): NetworkSentinel {
  const allowedIPs = new Set(tailscaleIPs || []);
  // Always allow our known Tailscale IPs
  allowedIPs.add('100.73.133.3');   // izzit7
  allowedIPs.add('100.102.217.69'); // soda-yeti

  sentinel = new NetworkSentinel({ allowedIPs });
  return sentinel;
}

export function getNetworkSentinel(): NetworkSentinel {
  if (!sentinel) {
    sentinel = new NetworkSentinel();
  }
  return sentinel;
}
