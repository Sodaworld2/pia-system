/**
 * Cortex Data Collector
 *
 * Pulls telemetry from all existing PIA systems on a configurable interval:
 * - HeartbeatService (CPU, memory, disk, uptime)
 * - Doctor (health reports, stuck agents, errors)
 * - Database queries (machines, agents, alerts)
 * - CostTracker (spend data)
 * - HubAggregator (connection status)
 *
 * Stores snapshots in the Cortex database and records timeline events.
 */

import { createLogger } from '../utils/logger.js';
import { getCortexDatabase, pruneOldData } from './cortex-db.js';
import { getHeartbeatService, type SystemResources } from '../orchestrator/heartbeat.js';
import { getAllMachines } from '../db/queries/machines.js';
import { getAllAgents } from '../db/queries/agents.js';

const logger = createLogger('CortexCollector');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TelemetrySnapshot {
  machine_id: string;
  machine_name: string;
  hostname: string;
  status: string;
  cpu_usage: number;
  cpu_count: number;
  memory_total_mb: number;
  memory_free_mb: number;
  memory_used_percent: number;
  uptime_hours: number;
  agent_count: number;
  agents_working: number;
  agents_idle: number;
  agents_error: number;
  error_count: number;
  cost_today_usd: number;
  platform: string;
  node_version: string;
  collected_at?: number;
}

export interface FleetOverview {
  machines: MachineOverview[];
  totals: {
    machinesOnline: number;
    machinesOffline: number;
    machinesTotal: number;
    agentsTotal: number;
    agentsWorking: number;
    agentsIdle: number;
    agentsError: number;
    totalCostToday: number;
    avgCpuUsage: number;
    avgMemoryPercent: number;
  };
  healthScore: number;
  collectedAt: number;
}

export interface MachineOverview {
  id: string;
  name: string;
  hostname: string;
  status: string;
  cpu_usage: number;
  memory_used_percent: number;
  agent_count: number;
  agents_working: number;
  uptime_hours: number;
  last_seen: number | null;
}

// ---------------------------------------------------------------------------
// Data Collector
// ---------------------------------------------------------------------------

export class CortexDataCollector {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pruneIntervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastOverview: FleetOverview | null = null;
  private collectionCount = 0;

  start(intervalMs = 60000): void {
    if (this.running) {
      logger.warn('CortexDataCollector already running');
      return;
    }

    this.running = true;

    // Collect immediately
    try { this.collect(); } catch (err) { logger.error(`First collection failed: ${err}`); }

    // Then on interval
    this.intervalId = setInterval(() => {
      try {
        this.collect();
      } catch (err) {
        logger.error(`Collection error: ${err}`);
      }
    }, intervalMs);

    // Prune old data every hour
    this.pruneIntervalId = setInterval(() => {
      try { pruneOldData(); } catch (err) { logger.error(`Prune error: ${err}`); }
    }, 3600000);

    logger.info(`CortexDataCollector started (interval: ${intervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.pruneIntervalId) {
      clearInterval(this.pruneIntervalId);
      this.pruneIntervalId = null;
    }
    this.running = false;
    logger.info('CortexDataCollector stopped');
  }

  /**
   * Run a single collection cycle: gather data from all systems, store snapshot.
   */
  collect(): FleetOverview {
    const db = getCortexDatabase();
    const now = Math.floor(Date.now() / 1000);

    // Pull data from existing systems
    const machines = getAllMachines();
    const allAgents = getAllAgents();
    const heartbeat = getHeartbeatService();
    const localResources = heartbeat.getLastPayload()?.resources || heartbeat.getSystemResources();

    // Build per-machine snapshots
    const machineOverviews: MachineOverview[] = [];

    const insertSnapshot = db.prepare(`
      INSERT INTO telemetry_snapshots (
        machine_id, machine_name, hostname, status,
        cpu_usage, cpu_count, memory_total_mb, memory_free_mb, memory_used_percent,
        uptime_hours, agent_count, agents_working, agents_idle, agents_error,
        error_count, cost_today_usd, platform, node_version, collected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const machine of machines) {
      const machineAgents = allAgents.filter(a => a.machine_id === machine.id);
      const working = machineAgents.filter(a => a.status === 'working').length;
      const idle = machineAgents.filter(a => a.status === 'idle').length;
      const errored = machineAgents.filter(a => a.status === 'error').length;

      // Use local resources for local machine, capabilities for remote
      const isLocal = machine.hostname === localResources.hostname;
      const resources = isLocal ? localResources : parseCapabilities(machine.capabilities);

      const snapshot: TelemetrySnapshot = {
        machine_id: machine.id,
        machine_name: machine.name,
        hostname: machine.hostname,
        status: machine.status,
        cpu_usage: resources.cpuUsage,
        cpu_count: resources.cpuCount,
        memory_total_mb: resources.memoryTotalMb,
        memory_free_mb: resources.memoryFreeMb,
        memory_used_percent: resources.memoryUsedPercent,
        uptime_hours: resources.uptimeHours,
        agent_count: machineAgents.length,
        agents_working: working,
        agents_idle: idle,
        agents_error: errored,
        error_count: errored,
        cost_today_usd: 0, // filled by cost tracker integration
        platform: resources.platform || '',
        node_version: resources.nodeVersion || '',
      };

      // Insert into Cortex DB
      insertSnapshot.run(
        snapshot.machine_id, snapshot.machine_name, snapshot.hostname, snapshot.status,
        snapshot.cpu_usage, snapshot.cpu_count,
        snapshot.memory_total_mb, snapshot.memory_free_mb, snapshot.memory_used_percent,
        snapshot.uptime_hours, snapshot.agent_count,
        snapshot.agents_working, snapshot.agents_idle, snapshot.agents_error,
        snapshot.error_count, snapshot.cost_today_usd,
        snapshot.platform, snapshot.node_version, now
      );

      machineOverviews.push({
        id: machine.id,
        name: machine.name,
        hostname: machine.hostname,
        status: machine.status,
        cpu_usage: snapshot.cpu_usage,
        memory_used_percent: snapshot.memory_used_percent,
        agent_count: machineAgents.length,
        agents_working: working,
        uptime_hours: snapshot.uptime_hours,
        last_seen: machine.last_seen,
      });
    }

    // Build fleet totals
    const online = machineOverviews.filter(m => m.status === 'online').length;
    const offline = machineOverviews.filter(m => m.status !== 'online').length;
    const totalAgents = allAgents.length;
    const totalWorking = allAgents.filter(a => a.status === 'working').length;
    const totalIdle = allAgents.filter(a => a.status === 'idle').length;
    const totalError = allAgents.filter(a => a.status === 'error').length;
    const avgCpu = machineOverviews.length > 0
      ? machineOverviews.reduce((sum, m) => sum + m.cpu_usage, 0) / machineOverviews.length
      : 0;
    const avgMem = machineOverviews.length > 0
      ? machineOverviews.reduce((sum, m) => sum + m.memory_used_percent, 0) / machineOverviews.length
      : 0;

    // Calculate health score (0-100)
    const healthScore = this.calculateHealthScore(online, offline, totalError, avgCpu, avgMem);

    const overview: FleetOverview = {
      machines: machineOverviews,
      totals: {
        machinesOnline: online,
        machinesOffline: offline,
        machinesTotal: machines.length,
        agentsTotal: totalAgents,
        agentsWorking: totalWorking,
        agentsIdle: totalIdle,
        agentsError: totalError,
        totalCostToday: 0,
        avgCpuUsage: Math.round(avgCpu * 100) / 100,
        avgMemoryPercent: Math.round(avgMem),
      },
      healthScore,
      collectedAt: now,
    };

    this.lastOverview = overview;
    this.collectionCount++;

    if (this.collectionCount % 10 === 0) {
      logger.info(`Collection #${this.collectionCount}: ${online}/${machines.length} machines online, health=${healthScore}`);
    }

    return overview;
  }

  /**
   * Get the latest fleet overview (cached from last collection).
   */
  getLatestOverview(): FleetOverview | null {
    return this.lastOverview;
  }

  /**
   * Get historical snapshots for a machine.
   */
  getMachineHistory(machineId: string, hours = 24): TelemetrySnapshot[] {
    const db = getCortexDatabase();
    const cutoff = Math.floor(Date.now() / 1000) - (hours * 3600);
    return db.prepare(
      'SELECT * FROM telemetry_snapshots WHERE machine_id = ? AND collected_at > ? ORDER BY collected_at ASC'
    ).all(machineId, cutoff) as TelemetrySnapshot[];
  }

  /**
   * Get fleet-wide timeline of recent snapshots.
   */
  getFleetTimeline(hours = 24, limit = 500): TelemetrySnapshot[] {
    const db = getCortexDatabase();
    const cutoff = Math.floor(Date.now() / 1000) - (hours * 3600);
    return db.prepare(
      'SELECT * FROM telemetry_snapshots WHERE collected_at > ? ORDER BY collected_at DESC LIMIT ?'
    ).all(cutoff, limit) as TelemetrySnapshot[];
  }

  /**
   * Record a timeline event (significant occurrence).
   */
  recordTimelineEvent(event: {
    event_type: string;
    machine_id?: string;
    machine_name?: string;
    agent_id?: string;
    title: string;
    detail?: string;
    data?: Record<string, unknown>;
  }): void {
    const db = getCortexDatabase();
    db.prepare(`
      INSERT INTO fleet_timeline (event_type, machine_id, machine_name, agent_id, title, detail, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.event_type,
      event.machine_id || null,
      event.machine_name || null,
      event.agent_id || null,
      event.title,
      event.detail || null,
      JSON.stringify(event.data || {}),
    );
  }

  /**
   * Get recent timeline events.
   */
  getTimelineEvents(limit = 50, since?: number): Array<Record<string, unknown>> {
    const db = getCortexDatabase();
    if (since) {
      return db.prepare(
        'SELECT * FROM fleet_timeline WHERE created_at > ? ORDER BY created_at DESC LIMIT ?'
      ).all(since, limit) as Array<Record<string, unknown>>;
    }
    return db.prepare(
      'SELECT * FROM fleet_timeline ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as Array<Record<string, unknown>>;
  }

  isRunning(): boolean {
    return this.running;
  }

  getCollectionCount(): number {
    return this.collectionCount;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private calculateHealthScore(
    online: number, offline: number, errors: number,
    avgCpu: number, avgMem: number,
  ): number {
    let score = 100;
    const total = online + offline;

    // Offline machines penalty (up to -40)
    if (total > 0) {
      score -= (offline / total) * 40;
    }

    // Error agents penalty (up to -20)
    if (errors > 0) {
      score -= Math.min(errors * 5, 20);
    }

    // High CPU penalty (up to -20)
    if (avgCpu > 80) score -= 20;
    else if (avgCpu > 60) score -= 10;
    else if (avgCpu > 40) score -= 5;

    // High memory penalty (up to -20)
    if (avgMem > 90) score -= 20;
    else if (avgMem > 80) score -= 10;
    else if (avgMem > 70) score -= 5;

    return Math.max(0, Math.round(score));
  }
}

/**
 * Parse capabilities from a remote machine's stored data into resource format.
 */
function parseCapabilities(capabilities: Record<string, unknown> | null): SystemResources {
  if (!capabilities) {
    return {
      cpuCount: 0, cpuModel: 'unknown', cpuUsage: 0,
      memoryTotalMb: 0, memoryFreeMb: 0, memoryUsedPercent: 0,
      uptimeHours: 0, platform: 'unknown', hostname: 'unknown', nodeVersion: '',
    };
  }

  // HeartbeatService stores resources directly or inside a 'resources' key
  const res = (capabilities.resources || capabilities) as Record<string, unknown>;

  return {
    cpuCount: (res.cpuCount as number) || 0,
    cpuModel: (res.cpuModel as string) || 'unknown',
    cpuUsage: (res.cpuUsage as number) || 0,
    memoryTotalMb: (res.memoryTotalMb as number) || (res.memoryMb as number) || 0,
    memoryFreeMb: (res.memoryFreeMb as number) || 0,
    memoryUsedPercent: (res.memoryUsedPercent as number) || 0,
    uptimeHours: (res.uptimeHours as number) || 0,
    platform: (res.platform as string) || 'unknown',
    hostname: (res.hostname as string) || 'unknown',
    nodeVersion: (res.nodeVersion as string) || '',
  };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let collector: CortexDataCollector | null = null;

export function getCortexCollector(): CortexDataCollector {
  if (!collector) {
    collector = new CortexDataCollector();
  }
  return collector;
}
