/**
 * Tailscale Peer Discovery
 * Finds other PIA instances running on the Tailscale network
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import http from 'http';

const execFileAsync = promisify(execFile);

export interface TailscalePeer {
  name: string;           // hostname
  ip: string;             // Tailscale IP (100.x.x.x)
  os: string;             // OS type
  online: boolean;
  hasPIA?: boolean;       // true if /api/health responds
  piaPort?: number;       // port PIA is running on
  piaMode?: string;       // hub or local
}

/**
 * Get raw Tailscale status
 */
async function getTailscaleStatus(): Promise<any> {
  try {
    // Try `tailscale status --json` (works on Windows, macOS, Linux)
    const { stdout } = await execFileAsync('tailscale', ['status', '--json'], {
      timeout: 5000,
    });
    return JSON.parse(stdout);
  } catch (err) {
    // On Windows, tailscale CLI might be at a specific path
    try {
      const { stdout } = await execFileAsync(
        'C:\\Program Files\\Tailscale\\tailscale.exe',
        ['status', '--json'],
        { timeout: 5000 }
      );
      return JSON.parse(stdout);
    } catch {
      throw new Error(`Tailscale not found or not running: ${(err as Error).message}`);
    }
  }
}

/**
 * Probe a host:port for PIA's /api/health endpoint
 */
function probePIA(ip: string, port: number): Promise<{ running: boolean; mode?: string }> {
  return new Promise((resolve) => {
    const req = http.get(`http://${ip}:${port}/api/health`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ running: json.status === 'ok', mode: json.mode });
        } catch {
          resolve({ running: false });
        }
      });
    });
    req.on('error', () => resolve({ running: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ running: false });
    });
  });
}

/**
 * Discover PIA instances on the Tailscale network.
 * Returns list of peers with PIA status.
 */
export async function discoverTailscalePeers(): Promise<TailscalePeer[]> {
  const status = await getTailscaleStatus();
  const peers: TailscalePeer[] = [];

  // status.Peer is a map of node key -> peer info
  const peerMap = status.Peer || {};

  for (const [_key, peer] of Object.entries(peerMap)) {
    const p = peer as any;
    if (!p.Online) continue;

    const ip = p.TailscaleIPs?.[0] || p.Addrs?.[0]?.split(':')[0];
    if (!ip) continue;

    const peerInfo: TailscalePeer = {
      name: p.HostName || p.DNSName?.split('.')[0] || 'unknown',
      ip,
      os: p.OS || 'unknown',
      online: true,
    };

    // Probe common PIA ports
    for (const port of [3000, 3001, 3002, 3003, 3004, 3005]) {
      const result = await probePIA(ip, port);
      if (result.running) {
        peerInfo.hasPIA = true;
        peerInfo.piaPort = port;
        peerInfo.piaMode = result.mode;
        break;
      }
    }

    peers.push(peerInfo);
  }

  return peers;
}

/**
 * Quick check: is Tailscale installed and running?
 */
export async function isTailscaleAvailable(): Promise<boolean> {
  try {
    await getTailscaleStatus();
    return true;
  } catch {
    return false;
  }
}
