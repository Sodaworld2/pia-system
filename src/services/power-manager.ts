/**
 * Power Manager — Wake-on-LAN + SSH Bootstrap for remote machine control
 * Zero new npm dependencies: uses built-in `dgram` (UDP) and `child_process` (SSH)
 */

import dgram from 'dgram';
import net from 'net';
import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PowerManager');
const execFileAsync = promisify(execFile);

export type PowerState = 'off' | 'awake' | 'online' | 'unknown';

export interface PowerEvent {
  machineId: string;
  machineName: string;
  step: string;
  state: PowerState;
  message: string;
  progress: number; // 0-100
  error?: string;
}

export interface MachineConfig {
  macAddress: string;
  tailscaleIp: string;
  sshUser: string;
  sshPort: number;
  piaPath: string;
}

/**
 * Send Wake-on-LAN magic packet.
 * Magic packet: 6 bytes of 0xFF followed by target MAC repeated 16 times.
 * Broadcast to 255.255.255.255:9 (standard WOL port).
 */
export function sendWakeOnLan(mac: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Parse MAC address (supports AA-BB-CC-DD-EE-FF and AA:BB:CC:DD:EE:FF)
    const macBytes = mac
      .replace(/[-:]/g, '')
      .match(/.{2}/g);

    if (!macBytes || macBytes.length !== 6) {
      reject(new Error(`Invalid MAC address: ${mac}`));
      return;
    }

    const macBuffer = Buffer.from(macBytes.map(b => parseInt(b, 16)));

    // Magic packet: 6x 0xFF + 16x MAC
    const magicPacket = Buffer.alloc(6 + 16 * 6);
    magicPacket.fill(0xFF, 0, 6);
    for (let i = 0; i < 16; i++) {
      macBuffer.copy(magicPacket, 6 + i * 6);
    }

    const socket = dgram.createSocket('udp4');

    socket.once('error', (err) => {
      socket.close();
      reject(err);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', (err) => {
        socket.close();
        if (err) {
          reject(err);
        } else {
          logger.info(`WOL magic packet sent to ${mac}`);
          resolve();
        }
      });
    });
  });
}

/**
 * TCP probe — check if a port is open on a remote host.
 * Used to detect if a machine is awake (probe RDP port 3389).
 */
export function tcpProbe(ip: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, ip);
  });
}

/**
 * Check if PIA's /api/health endpoint responds on the given IP.
 * Reuses the same pattern as tailscale-discovery.ts probePIA().
 */
export function probePIA(ip: string, port = 3000): Promise<{ running: boolean; mode?: string }> {
  return new Promise((resolve) => {
    const req = http.get(`http://${ip}:${port}/api/health`, { timeout: 3000 }, (res) => {
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
 * Determine the power state of a remote machine:
 * - 'online': PIA /api/health responds ok
 * - 'awake': TCP probe to RDP (3389) succeeds, but PIA not running
 * - 'off': No TCP response at all
 * - 'unknown': Error during probing
 */
export async function getPowerState(ip: string): Promise<PowerState> {
  try {
    // Check PIA first (most useful state)
    const piaResult = await probePIA(ip);
    if (piaResult.running) return 'online';

    // PIA not running — check if machine is awake via RDP port
    const awake = await tcpProbe(ip, 3389, 3000);
    if (awake) return 'awake';

    return 'off';
  } catch (err) {
    logger.error(`Power state check failed for ${ip}: ${err}`);
    return 'unknown';
  }
}

/**
 * SSH into a remote machine and start PIA.
 * Uses `start /B cmd /c` to detach PIA so it survives SSH disconnect.
 */
export async function sshBootstrapPIA(
  ip: string,
  user: string,
  piaPath: string,
  sshPort = 22,
): Promise<{ success: boolean; output: string }> {
  // Normalize path for Windows SSH (backslashes are fine in cmd /c)
  const cmd = `cd /d "${piaPath}" && start /B cmd /c "npm run dev > pia-startup.log 2>&1"`;

  try {
    const { stdout, stderr } = await execFileAsync('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      '-p', String(sshPort),
      `${user}@${ip}`,
      cmd,
    ], { timeout: 30000 });

    logger.info(`SSH bootstrap to ${user}@${ip}: success`);
    return { success: true, output: stdout + stderr };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`SSH bootstrap to ${user}@${ip} failed: ${msg}`);
    return { success: false, output: msg };
  }
}

/**
 * PowerManager orchestrates the full wake+bootstrap flow with progress events.
 * It broadcasts PowerEvent messages via a callback so the caller can push them
 * to the WebSocket for the dashboard.
 */
export class PowerManager {
  private onEvent: (event: PowerEvent) => void;

  constructor(onEvent: (event: PowerEvent) => void) {
    this.onEvent = onEvent;
  }

  private emit(machineId: string, machineName: string, step: string, state: PowerState, message: string, progress: number, error?: string): void {
    const event: PowerEvent = { machineId, machineName, step, state, message, progress, error };
    this.onEvent(event);
  }

  /**
   * Wake a machine: send WOL, poll until awake (TCP 3389 responds).
   * Returns the final power state.
   */
  async wake(machineId: string, machineName: string, config: MachineConfig): Promise<PowerState> {
    this.emit(machineId, machineName, 'wol_sending', 'off', 'Sending Wake-on-LAN packet...', 10);

    try {
      await sendWakeOnLan(config.macAddress);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit(machineId, machineName, 'wol_failed', 'off', `WOL failed: ${msg}`, 10, msg);
      return 'off';
    }

    this.emit(machineId, machineName, 'wol_sent', 'off', 'Magic packet sent. Waiting for machine to boot...', 20);

    // Poll for machine awake (up to 120 seconds)
    const maxAttempts = 24;
    const intervalMs = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      await sleep(intervalMs);
      const progress = 20 + Math.floor((i / maxAttempts) * 60);

      const state = await getPowerState(config.tailscaleIp);
      if (state === 'online') {
        this.emit(machineId, machineName, 'already_online', 'online', 'Machine is online with PIA running!', 100);
        return 'online';
      }
      if (state === 'awake') {
        this.emit(machineId, machineName, 'awake', 'awake', 'Machine is awake! PIA not yet running.', 80);
        return 'awake';
      }

      this.emit(machineId, machineName, 'waiting_boot', 'off', `Waiting for boot... (${(i + 1) * 5}s)`, progress);
    }

    this.emit(machineId, machineName, 'wake_timeout', 'off', 'Machine did not respond after 120s', 80, 'Timeout');
    return 'off';
  }

  /**
   * Bootstrap PIA on an awake machine via SSH.
   * Returns the final power state.
   */
  async bootstrap(machineId: string, machineName: string, config: MachineConfig): Promise<PowerState> {
    this.emit(machineId, machineName, 'ssh_connecting', 'awake', 'Connecting via SSH...', 85);

    const result = await sshBootstrapPIA(config.tailscaleIp, config.sshUser, config.piaPath, config.sshPort);

    if (!result.success) {
      this.emit(machineId, machineName, 'ssh_failed', 'awake', `SSH failed: ${result.output}`, 85, result.output);
      return 'awake';
    }

    this.emit(machineId, machineName, 'ssh_started', 'awake', 'PIA starting... waiting for health check.', 90);

    // Poll for PIA online (up to 60 seconds)
    const maxAttempts = 12;
    const intervalMs = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      await sleep(intervalMs);
      const progress = 90 + Math.floor((i / maxAttempts) * 10);

      const piaResult = await probePIA(config.tailscaleIp);
      if (piaResult.running) {
        this.emit(machineId, machineName, 'online', 'online', 'PIA is online!', 100);
        return 'online';
      }

      this.emit(machineId, machineName, 'waiting_pia', 'awake', `Waiting for PIA to start... (${(i + 1) * 5}s)`, progress);
    }

    this.emit(machineId, machineName, 'bootstrap_timeout', 'awake', 'PIA did not start within 60s', 95, 'Timeout');
    return 'awake';
  }

  /**
   * Full wake + bootstrap flow: WOL → wait for awake → SSH start PIA → wait for online.
   */
  async wakeAndBootstrap(machineId: string, machineName: string, config: MachineConfig): Promise<PowerState> {
    const afterWake = await this.wake(machineId, machineName, config);
    if (afterWake === 'online') return 'online';
    if (afterWake !== 'awake') return afterWake;

    return this.bootstrap(machineId, machineName, config);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract MachineConfig from a machine's capabilities JSON.
 * Returns null if required fields are missing.
 */
export function getMachineConfig(capabilities: Record<string, unknown> | null): MachineConfig | null {
  if (!capabilities) return null;

  const mac = capabilities.macAddress as string;
  const ip = capabilities.tailscaleIp as string;
  if (!mac || !ip) return null;

  return {
    macAddress: mac,
    tailscaleIp: ip,
    sshUser: (capabilities.sshUser as string) || 'User',
    sshPort: (capabilities.sshPort as number) || 22,
    piaPath: (capabilities.piaPath as string) || 'C:\\Users\\User\\Downloads\\pia-system',
  };
}
