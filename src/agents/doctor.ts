/**
 * Doctor - Self-healing agent health monitor
 *
 * Monitors agent and machine health, detects stuck/crashed/errored
 * agents, and auto-heals them. Runs on a configurable interval.
 */

import { createLogger } from '../utils/logger.js';
import {
  getAllAgents,
  getStuckAgents,
  updateAgentStatus,
} from '../db/queries/agents.js';
import {
  getAllMachines,
  getOfflineMachines,
  updateMachineStatus,
} from '../db/queries/machines.js';
import { createAlert } from '../db/queries/alerts.js';

const logger = createLogger('Doctor');

const MAX_ACTION_LOG = 100;
const DEFAULT_STUCK_THRESHOLD = 300; // 5 minutes
const DEFAULT_OFFLINE_THRESHOLD = 120; // 2 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealAction {
  type: 'restart' | 'alert' | 'escalate' | 'kill';
  targetId: string;
  targetName: string;
  reason: string;
  timestamp: number;
  success: boolean;
}

export interface HealthReport {
  timestamp: number;
  agents: {
    total: number;
    healthy: number;
    stuck: number;
    errored: number;
    warnings: string[];
  };
  machines: {
    total: number;
    online: number;
    offline: number;
    warnings: string[];
  };
  actions: HealAction[];
}

// ---------------------------------------------------------------------------
// Doctor Class
// ---------------------------------------------------------------------------

export class Doctor {
  private actionLog: HealAction[] = [];
  private lastReport: HealthReport | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  // Dedup: track last alert time per (type:targetId) — don't re-alert within 10 minutes
  private lastAlertedAt: Map<string, number> = new Map();

  constructor() {
    logger.info('Doctor initialized');
  }

  /**
   * Start the auto-healing interval.
   */
  start(intervalMs = 60000): void {
    if (this.intervalId) {
      logger.warn('Doctor already running');
      return;
    }

    this.running = true;
    this.intervalId = setInterval(() => {
      try {
        this.checkHealth();
      } catch (err) {
        logger.error(`Health check error: ${err}`);
      }
    }, intervalMs);

    logger.info(`Doctor started (interval: ${intervalMs}ms)`);

    // Run immediately
    try { this.checkHealth(); } catch { /* ignore first run errors */ }
  }

  /**
   * Stop the auto-healing interval.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('Doctor stopped');
  }

  /**
   * Run a full health check.
   */
  checkHealth(): HealthReport {
    const actions: HealAction[] = [];
    const agentWarnings: string[] = [];
    const machineWarnings: string[] = [];

    // --- Agent Health ---
    const allAgents = getAllAgents();
    const stuckAgents = getStuckAgents(DEFAULT_STUCK_THRESHOLD);
    const erroredAgents = allAgents.filter(a => a.status === 'error');
    const workingAgents = allAgents.filter(a => a.status === 'working' || a.status === 'idle');

    const now = Math.floor(Date.now() / 1000);
    const ALERT_DEDUP_TTL = 600; // Don't re-alert same issue within 10 minutes

    // Auto-heal stuck agents
    for (const agent of stuckAgents) {
      agentWarnings.push(`Agent ${agent.name} stuck for >5min`);

      const action = this.healAgent(agent.id, 'restart');
      actions.push(action);

      const dedupKey = `agent_stuck:${agent.id}`;
      const lastAlerted = this.lastAlertedAt.get(dedupKey) || 0;
      if (now - lastAlerted > ALERT_DEDUP_TTL) {
        createAlert({
          agent_id: agent.id,
          machine_id: agent.machine_id,
          type: 'agent_stuck',
          message: `Auto-restarted stuck agent: ${agent.name}`,
        });
        this.lastAlertedAt.set(dedupKey, now);
      }
    }

    // Alert on errored agents
    for (const agent of erroredAgents) {
      agentWarnings.push(`Agent ${agent.name} in error state`);

      actions.push({
        type: 'alert',
        targetId: agent.id,
        targetName: agent.name,
        reason: 'Agent in error state',
        timestamp: now,
        success: true,
      });

      const dedupKey = `agent_error:${agent.id}`;
      const lastAlerted = this.lastAlertedAt.get(dedupKey) || 0;
      if (now - lastAlerted > ALERT_DEDUP_TTL) {
        createAlert({
          agent_id: agent.id,
          machine_id: agent.machine_id,
          type: 'agent_error',
          message: `Agent in error state: ${agent.name}`,
        });
        this.lastAlertedAt.set(dedupKey, now);
      }
    }

    // --- Machine Health ---
    const allMachines = getAllMachines();
    const offlineMachines = getOfflineMachines(DEFAULT_OFFLINE_THRESHOLD);
    const onlineMachines = allMachines.filter(m => m.status === 'online');

    for (const machine of offlineMachines) {
      machineWarnings.push(`Machine ${machine.name} offline >2min`);

      updateMachineStatus(machine.id, 'offline');

      actions.push({
        type: 'alert',
        targetId: machine.id,
        targetName: machine.name,
        reason: 'Machine went offline',
        timestamp: now,
        success: true,
      });

      const dedupKey = `machine_offline:${machine.id}`;
      const lastAlerted = this.lastAlertedAt.get(dedupKey) || 0;
      if (now - lastAlerted > ALERT_DEDUP_TTL) {
        createAlert({
          machine_id: machine.id,
          type: 'machine_offline',
          message: `Machine offline: ${machine.name} (${machine.hostname})`,
        });
        this.lastAlertedAt.set(dedupKey, now);
      }
    }

    // Build report
    const report: HealthReport = {
      timestamp: Math.floor(Date.now() / 1000),
      agents: {
        total: allAgents.length,
        healthy: workingAgents.length,
        stuck: stuckAgents.length,
        errored: erroredAgents.length,
        warnings: agentWarnings,
      },
      machines: {
        total: allMachines.length,
        online: onlineMachines.length,
        offline: offlineMachines.length,
        warnings: machineWarnings,
      },
      actions,
    };

    // Store
    this.lastReport = report;
    this.actionLog.push(...actions);
    if (this.actionLog.length > MAX_ACTION_LOG) {
      this.actionLog.splice(0, this.actionLog.length - MAX_ACTION_LOG);
    }

    if (actions.length > 0) {
      logger.info(`Health check: ${actions.length} actions taken`);
    }

    return report;
  }

  /**
   * Manually heal an agent.
   */
  healAgent(agentId: string, action: 'restart' | 'kill'): HealAction {
    const allAgents = getAllAgents();
    const agent = allAgents.find(a => a.id === agentId);
    const name = agent?.name || agentId;

    try {
      if (action === 'restart') {
        updateAgentStatus(agentId, 'idle', { progress: 0 });
        logger.info(`Restarted agent: ${name}`);
      } else {
        updateAgentStatus(agentId, 'completed', {
          current_task: null,
          progress: 100,
          last_output: `Killed by Doctor at ${new Date().toISOString()}`,
        });
        logger.info(`Killed agent: ${name}`);
      }

      const healAction: HealAction = {
        type: action,
        targetId: agentId,
        targetName: name,
        reason: action === 'restart' ? 'Manual/auto restart' : 'Manual kill',
        timestamp: Math.floor(Date.now() / 1000),
        success: true,
      };

      this.actionLog.push(healAction);
      return healAction;
    } catch (err) {
      const healAction: HealAction = {
        type: action,
        targetId: agentId,
        targetName: name,
        reason: `Failed: ${err}`,
        timestamp: Math.floor(Date.now() / 1000),
        success: false,
      };

      this.actionLog.push(healAction);
      return healAction;
    }
  }

  /**
   * Get the last health report.
   */
  getHealthReport(): HealthReport | null {
    return this.lastReport;
  }

  /**
   * Get the action log.
   */
  getActionLog(): HealAction[] {
    return [...this.actionLog];
  }

  /**
   * Is the doctor currently running?
   */
  isRunning(): boolean {
    return this.running;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let doctor: Doctor | null = null;

export function getDoctor(): Doctor {
  if (!doctor) {
    doctor = new Doctor();
  }
  return doctor;
}
