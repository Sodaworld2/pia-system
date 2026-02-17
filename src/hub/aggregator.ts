/**
 * PIA Hub Aggregator
 * Handles incoming connections from PIA Local services and aggregates data
 */

import { createLogger } from '../utils/logger.js';
import {
  createMachine,
  getMachineById,
  getMachineByHostname,
  updateMachineHeartbeat,
  updateMachineStatus,
  Machine,
} from '../db/queries/machines.js';
import {
  createAgent,
  getAgentById,
  updateAgentStatus,
  deleteAgent,
  Agent,
} from '../db/queries/agents.js';
import { createAlert } from '../db/queries/alerts.js';
import { getWebSocketServer } from '../tunnel/websocket-server.js';
import { config } from '../config.js';
import { getAlertMonitor } from './alert-monitor.js';
import { getDatabase } from '../db/database.js';

const logger = createLogger('Aggregator');

interface MachineConnection {
  machineId: string;
  lastSeen: number;
  connected: boolean;
}

export class HubAggregator {
  private connections: Map<string, MachineConnection> = new Map();
  private clientToDbId: Map<string, string> = new Map(); // spoke's local ID → DB ID
  private checkInterval: NodeJS.Timeout | null = null;

  start(): void {
    logger.info('Hub Aggregator started');
    this.startHealthCheck();
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    logger.info('Hub Aggregator stopped');
  }

  // Handle machine registration
  handleMachineRegister(data: {
    id: string;
    name: string;
    hostname: string;
    capabilities?: Record<string, unknown>;
  }): Machine {
    logger.info(`Machine registering: ${data.name} (${data.id})`);

    // Check if machine already exists
    let machine = getMachineById(data.id);

    if (!machine) {
      // Check by hostname
      machine = getMachineByHostname(data.hostname);
    }

    if (machine) {
      // Update existing machine — refresh name, capabilities, and heartbeat
      updateMachineHeartbeat(machine.id, data.capabilities);
      if (data.name && data.name !== machine.name) {
        const db = getDatabase();
        db.prepare('UPDATE machines SET name = ? WHERE id = ?').run(data.name, machine.id);
        logger.info(`Machine name updated: ${machine.name} → ${data.name}`);
      }
      machine = getMachineById(machine.id)!;
      logger.info(`Machine reconnected: ${machine.name}`);
    } else {
      // Create new machine
      machine = createMachine({
        name: data.name,
        hostname: data.hostname,
        capabilities: data.capabilities,
      });
      logger.info(`New machine registered: ${machine.name}`);
    }

    // Track connection
    this.connections.set(machine.id, {
      machineId: machine.id,
      lastSeen: Date.now(),
      connected: true,
    });

    // Map client's local ID → DB ID so heartbeats resolve correctly
    if (machine.id !== data.id) {
      this.clientToDbId.set(data.id, machine.id);
      logger.info(`Mapped client ID ${data.id} → DB ID ${machine.id}`);
    }

    // Notify dashboard
    this.broadcastMachineUpdate(machine);

    return machine;
  }

  // Handle machine heartbeat
  handleMachineHeartbeat(data: {
    id: string;
    agents?: Array<{
      id: string;
      status: string;
      progress?: number;
      last_output?: string;
    }>;
    resources?: {
      cpuUsage?: number;
      memoryUsage?: number;
      gpuUsage?: number;
    };
  }): void {
    // Resolve client ID → DB ID (they may differ if machine was matched by hostname)
    const dbId = this.clientToDbId.get(data.id) || data.id;

    const conn = this.connections.get(dbId);
    if (conn) {
      conn.lastSeen = Date.now();
      conn.connected = true;
    }

    // Update machine in database using the correct DB ID
    updateMachineHeartbeat(dbId);

    // Update agents if provided
    if (data.agents) {
      for (const agentData of data.agents) {
        const agent = getAgentById(agentData.id);
        if (agent) {
          updateAgentStatus(agent.id, agentData.status as Agent['status'], {
            progress: agentData.progress,
            last_output: agentData.last_output,
          });
        }
      }
    }
  }

  // Handle agent registration from local service
  handleAgentRegister(data: {
    machineId: string;
    agent: {
      id: string;
      name: string;
      type: string;
      status: string;
      progress: number;
      current_task?: string;
      last_output?: string;
    };
  }): Agent {
    logger.info(`Agent registering: ${data.agent.name} on machine ${data.machineId}`);

    // Check if agent already exists
    let agent = getAgentById(data.agent.id);

    if (!agent) {
      agent = createAgent({
        machine_id: data.machineId,
        name: data.agent.name,
        type: data.agent.type,
      });
    }

    // Update status
    updateAgentStatus(agent.id, data.agent.status as Agent['status'], {
      progress: data.agent.progress,
      current_task: data.agent.current_task,
      last_output: data.agent.last_output,
    });

    agent = getAgentById(agent.id)!;

    // Notify dashboard
    this.broadcastAgentUpdate(agent);

    return agent;
  }

  // Handle agent update from local service
  handleAgentUpdate(data: {
    machineId: string;
    agentId: string;
    status?: string;
    progress?: number;
    current_task?: string;
    last_output?: string;
  }): void {
    const agent = getAgentById(data.agentId);
    if (!agent) {
      logger.warn(`Agent not found for update: ${data.agentId}`);
      return;
    }

    updateAgentStatus(
      agent.id,
      (data.status as Agent['status']) || agent.status,
      {
        progress: data.progress,
        current_task: data.current_task,
        last_output: data.last_output,
      }
    );

    // Check for alerts
    if (data.status === 'waiting') {
      createAlert({
        machine_id: data.machineId,
        agent_id: data.agentId,
        type: 'agent_waiting',
        message: `Agent ${agent.name} is waiting for input`,
      });
    } else if (data.status === 'error') {
      createAlert({
        machine_id: data.machineId,
        agent_id: data.agentId,
        type: 'agent_error',
        message: `Agent ${agent.name} encountered an error`,
      });
    }

    // Notify dashboard
    const updated = getAgentById(agent.id);
    if (updated) {
      this.broadcastAgentUpdate(updated);
      // Track for alert monitoring
      try {
        getAlertMonitor().trackAgentUpdate(updated);
      } catch {
        // Alert monitor may not be initialized
      }
    }
  }

  // Handle agent removal
  handleAgentRemove(data: { machineId: string; agentId: string }): void {
    logger.info(`Agent removed: ${data.agentId}`);
    deleteAgent(data.agentId);
  }

  // Health check - detect offline machines
  private startHealthCheck(): void {
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      const threshold = config.features.heartbeatInterval * 3; // 3 missed heartbeats

      for (const [machineId, conn] of this.connections) {
        if (conn.connected && now - conn.lastSeen > threshold) {
          logger.warn(`Machine offline: ${machineId}`);
          conn.connected = false;

          // Update database
          updateMachineStatus(machineId, 'offline');

          // Create alert
          const machine = getMachineById(machineId);
          createAlert({
            machine_id: machineId,
            type: 'machine_offline',
            message: `Machine ${machine?.name || machineId} went offline`,
          });

          // Notify dashboard
          if (machine) {
            this.broadcastMachineUpdate({ ...machine, status: 'offline' });
          }
        }
      }
    }, config.features.heartbeatInterval);
  }

  private broadcastMachineUpdate(machine: Machine): void {
    try {
      const ws = getWebSocketServer();
      ws.broadcast({
        type: 'machine:update',
        payload: machine,
      });
    } catch {
      // WebSocket not available
    }
  }

  private broadcastAgentUpdate(agent: Agent): void {
    try {
      const ws = getWebSocketServer();
      ws.sendAgentUpdate(agent.id, {
        status: agent.status,
        progress: agent.progress,
        current_task: agent.current_task,
        last_output: agent.last_output?.substring(0, 200),
        machine_id: agent.machine_id,
      });
    } catch {
      // WebSocket not available
    }
  }

  // Get connection status
  getConnectionStatus(): Map<string, MachineConnection> {
    return this.connections;
  }

  isConnected(machineId: string): boolean {
    return this.connections.get(machineId)?.connected || false;
  }

  // Resolve a client-sent ID to the canonical DB ID
  resolveDbId(clientId: string): string {
    return this.clientToDbId.get(clientId) || clientId;
  }
}

// Singleton
let aggregator: HubAggregator | null = null;

export function getAggregator(): HubAggregator {
  if (!aggregator) {
    aggregator = new HubAggregator();
  }
  return aggregator;
}

export function initAggregator(): HubAggregator {
  const agg = getAggregator();
  agg.start();
  return agg;
}
