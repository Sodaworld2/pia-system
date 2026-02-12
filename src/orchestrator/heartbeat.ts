/**
 * Heartbeat Service
 *
 * Reports local machine health to the database on an interval.
 * Detects system resources (CPU, memory, disk) and keeps
 * the machine's last_seen timestamp fresh.
 */

import { createLogger } from '../utils/logger.js';
import {
  getMachineByHostname,
  createMachine,
  updateMachineHeartbeat,
} from '../db/queries/machines.js';
import { getAllAgents } from '../db/queries/agents.js';
import * as os from 'os';

const logger = createLogger('Heartbeat');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemResources {
  cpuCount: number;
  cpuModel: string;
  cpuUsage: number;
  memoryTotalMb: number;
  memoryFreeMb: number;
  memoryUsedPercent: number;
  uptimeHours: number;
  platform: string;
  hostname: string;
  nodeVersion: string;
}

export interface HeartbeatPayload {
  machineId: string;
  hostname: string;
  resources: SystemResources;
  agentCount: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Heartbeat Service
// ---------------------------------------------------------------------------

export class HeartbeatService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private machineId: string | null = null;
  private lastPayload: HeartbeatPayload | null = null;
  private cpuUsageCache = 0;

  constructor() {
    logger.info('HeartbeatService initialized');
  }

  /**
   * Start sending heartbeats
   */
  start(intervalMs = 30000): void {
    if (this.running) {
      logger.warn('HeartbeatService already running');
      return;
    }

    this.running = true;

    // Ensure local machine is registered
    this.ensureLocalMachine();

    // Start interval
    this.intervalId = setInterval(() => {
      try {
        this.beat();
      } catch (err) {
        logger.error(`Heartbeat error: ${err}`);
      }
    }, intervalMs);

    logger.info(`HeartbeatService started (interval: ${intervalMs}ms)`);

    // Beat immediately
    try { this.beat(); } catch { /* first beat may fail */ }
  }

  /**
   * Stop heartbeats
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('HeartbeatService stopped');
  }

  /**
   * Send a single heartbeat
   */
  beat(): HeartbeatPayload {
    if (!this.machineId) {
      this.ensureLocalMachine();
    }

    const resources = this.getSystemResources();
    const agents = getAllAgents().filter(a =>
      a.machine_id === this.machineId && (a.status === 'working' || a.status === 'idle')
    );

    const payload: HeartbeatPayload = {
      machineId: this.machineId!,
      hostname: os.hostname(),
      resources,
      agentCount: agents.length,
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Update database
    updateMachineHeartbeat(this.machineId!, {
      resources,
      agentCount: agents.length,
      lastHeartbeat: payload.timestamp,
    });

    this.lastPayload = payload;
    return payload;
  }

  /**
   * Get latest heartbeat payload
   */
  getLastPayload(): HeartbeatPayload | null {
    return this.lastPayload;
  }

  /**
   * Get system resources
   */
  getSystemResources(): SystemResources {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Simple CPU usage estimate based on load average (or idle times)
    const cpuUsage = this.estimateCpuUsage(cpus);

    return {
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model || 'unknown',
      cpuUsage: Math.round(cpuUsage * 100) / 100,
      memoryTotalMb: Math.round(totalMem / (1024 * 1024)),
      memoryFreeMb: Math.round(freeMem / (1024 * 1024)),
      memoryUsedPercent: Math.round((usedMem / totalMem) * 100),
      uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
      platform: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
      nodeVersion: process.version,
    };
  }

  /**
   * Is the heartbeat service running?
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the local machine ID
   */
  getMachineId(): string | null {
    return this.machineId;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private ensureLocalMachine(): void {
    const hostname = os.hostname();

    // Check if this machine is already registered
    let machine = getMachineByHostname(hostname);

    if (!machine) {
      // Register it
      machine = createMachine({
        name: `Local (${hostname})`,
        hostname,
        ip_address: this.getLocalIp(),
        capabilities: {
          platform: os.platform(),
          arch: os.arch(),
          cpuCount: os.cpus().length,
          memoryMb: Math.round(os.totalmem() / (1024 * 1024)),
          enrolledAt: Math.floor(Date.now() / 1000),
        },
      });
      logger.info(`Registered local machine: ${machine.name} (${machine.id})`);
    }

    this.machineId = machine.id;
  }

  private getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  private estimateCpuUsage(cpus: os.CpuInfo[]): number {
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as Record<string, number>)[type];
      }
      totalIdle += cpu.times.idle;
    }

    const usage = 100 - (totalIdle / totalTick * 100);

    // Smooth with previous reading
    const smoothed = this.cpuUsageCache === 0
      ? usage
      : (this.cpuUsageCache * 0.3 + usage * 0.7);

    this.cpuUsageCache = smoothed;
    return smoothed;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let heartbeat: HeartbeatService | null = null;

export function getHeartbeatService(): HeartbeatService {
  if (!heartbeat) {
    heartbeat = new HeartbeatService();
  }
  return heartbeat;
}
