/**
 * PIA Alert Monitor
 * Automatically detects and creates alerts for various conditions
 */

import { createLogger } from '../utils/logger.js';
import { createAlert, deleteOldAlerts, getUnacknowledgedAlerts, AlertType } from '../db/queries/alerts.js';
import { getAgentsByMachine, Agent } from '../db/queries/agents.js';
import { getAllMachines } from '../db/queries/machines.js';
import { getWebSocketServer } from '../tunnel/websocket-server.js';

const logger = createLogger('AlertMonitor');

interface AgentState {
  lastStatusChange: number;
  lastProgress: number;
  alertedStuck: boolean;
}

export class AlertMonitor {
  private agentStates: Map<string, AgentState> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly STUCK_THRESHOLD = 5 * 60 * 1000; // 5 minutes without progress
  private readonly WAITING_ALERT_INTERVAL = 2 * 60 * 1000; // Re-alert every 2 minutes

  start(): void {
    logger.info('Alert Monitor started');

    // Check for stuck agents every 30 seconds
    this.monitorInterval = setInterval(() => {
      this.checkAgents();
      this.checkMachines();
    }, 30000);

    // Clean up old alerts daily
    this.cleanupInterval = setInterval(() => {
      const deleted = deleteOldAlerts(30); // Delete alerts older than 30 days
      if (deleted > 0) {
        logger.info(`Cleaned up ${deleted} old alerts`);
      }
    }, 24 * 60 * 60 * 1000);

    // Initial check
    this.checkAgents();
    this.checkMachines();
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    logger.info('Alert Monitor stopped');
  }

  // Track agent updates
  trackAgentUpdate(agent: Agent): void {
    const state = this.agentStates.get(agent.id) || {
      lastStatusChange: Date.now(),
      lastProgress: 0,
      alertedStuck: false,
    };

    // Check if progress changed
    if (agent.progress !== state.lastProgress) {
      state.lastStatusChange = Date.now();
      state.lastProgress = agent.progress;
      state.alertedStuck = false; // Reset stuck alert
    }

    this.agentStates.set(agent.id, state);
  }

  // Create and broadcast an alert
  private createAndBroadcast(type: AlertType, message: string, machineId?: string, agentId?: string): void {
    const alert = createAlert({
      type,
      message,
      machine_id: machineId,
      agent_id: agentId,
    });

    logger.warn(`Alert created: ${type} - ${message}`);

    // Broadcast to dashboard
    try {
      const ws = getWebSocketServer();
      ws.sendAlert({
        id: alert.id,
        type: alert.type,
        message: alert.message,
        machine_id: alert.machine_id,
        agent_id: alert.agent_id,
        created_at: alert.created_at,
      });
    } catch {
      // WebSocket not available
    }
  }

  // Check all agents for issues
  private checkAgents(): void {
    const machines = getAllMachines();
    const now = Date.now();

    for (const machine of machines) {
      if (machine.status !== 'online') continue;

      const agents = getAgentsByMachine(machine.id);

      for (const agent of agents) {
        const state = this.agentStates.get(agent.id);

        if (!state) {
          // First time seeing this agent, initialize state
          this.agentStates.set(agent.id, {
            lastStatusChange: now,
            lastProgress: agent.progress,
            alertedStuck: false,
          });
          continue;
        }

        // Check for stuck agents (working but no progress)
        if (
          agent.status === 'working' &&
          now - state.lastStatusChange > this.STUCK_THRESHOLD &&
          !state.alertedStuck
        ) {
          this.createAndBroadcast(
            'agent_stuck',
            `Agent ${agent.name} has been working for 5+ minutes with no progress`,
            machine.id,
            agent.id
          );
          state.alertedStuck = true;
        }

        // Check for agents waiting too long
        if (
          agent.status === 'waiting' &&
          now - state.lastStatusChange > this.WAITING_ALERT_INTERVAL
        ) {
          this.createAndBroadcast(
            'agent_waiting',
            `Agent ${agent.name} has been waiting for input for 2+ minutes`,
            machine.id,
            agent.id
          );
          state.lastStatusChange = now; // Reset to not spam alerts
        }
      }
    }
  }

  // Check machines for resource issues
  private checkMachines(): void {
    const machines = getAllMachines();

    for (const machine of machines) {
      if (machine.status !== 'online') continue;

      const capabilities = machine.capabilities as {
        cpuUsage?: number;
        memoryUsage?: number;
        gpuUsage?: number;
      } | null;

      if (!capabilities) continue;

      // Check CPU usage
      if (capabilities.cpuUsage && capabilities.cpuUsage > 90) {
        this.createAndBroadcast(
          'resource_high',
          `Machine ${machine.name} CPU usage is at ${capabilities.cpuUsage}%`,
          machine.id
        );
      }

      // Check memory usage
      if (capabilities.memoryUsage && capabilities.memoryUsage > 90) {
        this.createAndBroadcast(
          'resource_high',
          `Machine ${machine.name} memory usage is at ${capabilities.memoryUsage}%`,
          machine.id
        );
      }

      // Check GPU usage (if available)
      if (capabilities.gpuUsage && capabilities.gpuUsage > 95) {
        this.createAndBroadcast(
          'resource_high',
          `Machine ${machine.name} GPU usage is at ${capabilities.gpuUsage}%`,
          machine.id
        );
      }
    }
  }

  // Get current alert summary
  getSummary(): {
    total: number;
    byType: Record<string, number>;
    recent: Array<{ type: string; message: string; created_at: number }>;
  } {
    const unacked = getUnacknowledgedAlerts();

    const byType: Record<string, number> = {};
    for (const alert of unacked) {
      byType[alert.type] = (byType[alert.type] || 0) + 1;
    }

    return {
      total: unacked.length,
      byType,
      recent: unacked.slice(0, 10).map(a => ({
        type: a.type,
        message: a.message,
        created_at: a.created_at,
      })),
    };
  }
}

// Singleton
let alertMonitor: AlertMonitor | null = null;

export function getAlertMonitor(): AlertMonitor {
  if (!alertMonitor) {
    alertMonitor = new AlertMonitor();
  }
  return alertMonitor;
}

export function initAlertMonitor(): AlertMonitor {
  const monitor = getAlertMonitor();
  monitor.start();
  return monitor;
}
