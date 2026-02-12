/**
 * Network Sentinel Security API Routes
 *
 * GET    /api/security/stats           - Security overview + connection stats
 * GET    /api/security/events          - Security events (filterable)
 * GET    /api/security/connections     - All tracked connections
 * POST   /api/security/block           - Manually block an IP
 * POST   /api/security/unblock         - Unblock an IP
 * POST   /api/security/allow-ip        - Add IP to Tailscale allowlist
 * DELETE /api/security/allow-ip        - Remove IP from allowlist
 * GET    /api/security/allowed-ips     - List allowed IPs
 */

import { Router, Request, Response } from 'express';
import { getNetworkSentinel } from '../../security/network-sentinel.js';
const router = Router();

// GET /api/security/stats
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getNetworkSentinel().getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// GET /api/security/events?type=brute_force_blocked&severity=critical&limit=100
router.get('/events', (req: Request, res: Response) => {
  try {
    const { type, severity, limit } = req.query;
    const events = getNetworkSentinel().getEvents({
      type: type as string | undefined,
      severity: severity as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ count: events.length, events });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// GET /api/security/connections
router.get('/connections', (_req: Request, res: Response) => {
  try {
    const stats = getNetworkSentinel().getStats();
    res.json({ connections: stats.connections });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// POST /api/security/block { ip, reason }
router.post('/block', (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      res.status(400).json({ error: 'ip is required' });
      return;
    }
    // Record enough failed auths to trigger block
    const sentinel = getNetworkSentinel();
    for (let i = 0; i < 10; i++) sentinel.recordFailedAuth(ip);
    res.json({ blocked: true, ip });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// POST /api/security/unblock { ip }
router.post('/unblock', (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      res.status(400).json({ error: 'ip is required' });
      return;
    }
    const result = getNetworkSentinel().unblockIP(ip);
    res.json({ unblocked: result, ip });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// POST /api/security/allow-ip { ip }
router.post('/allow-ip', (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      res.status(400).json({ error: 'ip is required' });
      return;
    }
    getNetworkSentinel().addAllowedIP(ip);
    res.json({ allowed: true, ip, allAllowed: getNetworkSentinel().getAllowedIPs() });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// DELETE /api/security/allow-ip { ip }
router.delete('/allow-ip', (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      res.status(400).json({ error: 'ip is required' });
      return;
    }
    getNetworkSentinel().removeAllowedIP(ip);
    res.json({ removed: true, ip, allAllowed: getNetworkSentinel().getAllowedIPs() });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

// GET /api/security/allowed-ips
router.get('/allowed-ips', (_req: Request, res: Response) => {
  try {
    res.json({ allowedIPs: getNetworkSentinel().getAllowedIPs() });
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});

export default router;
