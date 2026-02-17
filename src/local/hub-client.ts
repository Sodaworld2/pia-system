/**
 * PIA Hub Client
 * Connects to the central PIA Hub and reports machine/agent status
 */

import WebSocket from 'ws';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { hostname, platform, cpus, totalmem, freemem } from 'os';
import { nanoid } from 'nanoid';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getMachineIdPath } from '../electron-paths.js';

const logger = createLogger('HubClient');

interface AgentStatus {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'working' | 'waiting' | 'error' | 'completed';
  progress: number;
  current_task?: string;
  last_output?: string;
}

interface HubMessage {
  type: string;
  payload?: unknown;
}

export class HubClient {
  private ws: WebSocket | null = null;
  private machineId: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private agents: Map<string, AgentStatus> = new Map();
  private connected: boolean = false;

  constructor() {
    this.machineId = this.getOrCreateMachineId();
  }

  private getOrCreateMachineId(): string {
    const idFile = getMachineIdPath();

    if (existsSync(idFile)) {
      return readFileSync(idFile, 'utf-8').trim();
    }

    const id = nanoid();
    try {
      writeFileSync(idFile, id);
    } catch {
      // May fail if data dir doesn't exist yet
    }
    return id;
  }

  connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    const hubUrl = config.hub.url.replace('http', 'ws').replace(':3000', ':3001');
    logger.info(`Connecting to Hub: ${hubUrl}`);

    try {
      this.ws = new WebSocket(hubUrl);

      this.ws.on('open', () => {
        logger.info('Connected to Hub');
        this.connected = true;
        this.authenticate();
        this.register();
        this.startHeartbeat();
      });

      this.ws.on('message', (data) => {
        try {
          const msg: HubMessage = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (error) {
          logger.error(`Invalid message from Hub: ${error}`);
        }
      });

      this.ws.on('close', () => {
        logger.warn('Disconnected from Hub');
        this.connected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        logger.error(`Hub connection error: ${error.message}`);
      });
    } catch (error) {
      logger.error(`Failed to connect to Hub: ${error}`);
      this.scheduleReconnect();
    }
  }

  private authenticate(): void {
    this.send({
      type: 'auth',
      payload: { token: config.security.secretToken },
    });
  }

  private register(): void {
    const capabilities = this.getCapabilities();

    this.send({
      type: 'machine:register',
      payload: {
        id: this.machineId,
        name: config.hub.machineName,
        hostname: hostname(),
        capabilities,
      },
    });

    logger.info(`Registered as: ${config.hub.machineName} (${this.machineId})`);
  }

  private getCapabilities(): Record<string, unknown> {
    const cpuInfo = cpus();

    return {
      platform: platform(),
      hostname: hostname(),
      cpuCount: cpuInfo.length,
      cpuModel: cpuInfo[0]?.model || 'Unknown',
      totalMemory: totalmem(),
      freeMemory: freemem(),
      // GPU detection would require additional libraries
      // For now, assume GPU presence based on config
      gpu: process.env.PIA_HAS_GPU === 'true' ? 'RTX 5090' : null,
      ollama: process.env.PIA_OLLAMA_AVAILABLE === 'true',
    };
  }

  private handleMessage(msg: HubMessage): void {
    switch (msg.type) {
      case 'auth':
        if ((msg as any).success || (msg.payload as any)?.success) {
          logger.info('Authenticated with Hub');
        } else {
          logger.error('Hub authentication failed');
        }
        break;

      case 'command':
        this.handleCommand(msg.payload as { action: string; data?: unknown });
        break;

      case 'ping':
        this.send({ type: 'pong' });
        break;

      default:
        logger.debug(`Unknown message type: ${msg.type}`);
    }
  }

  private handleCommand(command: { action: string; data?: unknown }): void {
    logger.info(`Received command: ${command.action}`);

    switch (command.action) {
      case 'spawn_agent':
        this.handleSpawnAgent(command.data as Record<string, unknown>);
        break;

      case 'kill_agent':
        this.handleKillAgent(command.data as Record<string, unknown>);
        break;

      case 'send_input':
        this.handleSendInput(command.data as Record<string, unknown>);
        break;

      case 'get_buffer':
        this.handleGetBuffer(command.data as Record<string, unknown>);
        break;

      case 'get_status':
        this.sendStatus();
        break;

      default:
        logger.warn(`Unknown command: ${command.action}`);
    }
  }

  private async handleSpawnAgent(data: Record<string, unknown>): Promise<void> {
    try {
      const { getAgentSessionManager } = await import('../mission-control/agent-session.js');
      const mgr = getAgentSessionManager();

      const session = mgr.spawn({
        id: data.id as string | undefined,
        machineId: this.machineId,
        mode: (data.mode as 'sdk' | 'api' | 'pty') || 'sdk',
        task: (data.task as string) || '',
        cwd: (data.cwd as string) || process.cwd(),
        approvalMode: (data.approvalMode as 'manual' | 'auto' | 'yolo' | 'plan') || 'auto',
        model: data.model as string | undefined,
        maxBudgetUsd: data.maxBudget as number | undefined,
        effort: data.effort as 'low' | 'medium' | 'high' | 'max' | undefined,
        systemPrompt: data.systemPrompt as string | undefined,
        maxTurns: data.maxTurns as number | undefined,
        disallowedTools: data.disallowedTools as string[] | undefined,
        allowedTools: data.allowedTools as string[] | undefined,
        additionalDirectories: data.additionalDirectories as string[] | undefined,
        enableCheckpointing: data.enableCheckpointing !== false,
        loadProjectSettings: data.loadProjectSettings !== false,
        autoRestart: data.autoRestart !== false,
      });

      // Register with hub
      this.registerAgent({
        id: session.id,
        name: session.config.task.substring(0, 50) || 'Remote Agent',
        type: session.config.mode,
        status: 'working',
        progress: 0,
        current_task: session.config.task.substring(0, 200),
      });

      // Send confirmation back to hub
      this.send({
        type: 'command:result',
        payload: {
          action: 'spawn_agent',
          success: true,
          machineId: this.machineId,
          agentId: session.id,
          message: `Agent ${session.id} spawned in ${session.config.mode} mode`,
        },
      });

      logger.info(`Remote agent spawned: ${session.id} (${session.config.mode})`);

      // Wire up output streaming to hub (real-time text deltas)
      mgr.on('output', (evt: { sessionId: string; data: string }) => {
        if (evt.sessionId === session.id) {
          this.send({
            type: 'agent:output',
            payload: { machineId: this.machineId, sessionId: session.id, data: evt.data },
          });
        }
      });

      // Wire up status updates to hub
      mgr.on('status', (evt: { sessionId: string; status: string }) => {
        if (evt.sessionId === session.id) {
          this.updateAgent(session.id, { status: evt.status as AgentStatus['status'] });
        }
      });

      mgr.on('complete', (evt: { sessionId: string }) => {
        if (evt.sessionId === session.id) {
          this.updateAgent(session.id, { status: 'completed' });
        }
      });

      mgr.on('error', (evt: { sessionId: string; error: string }) => {
        if (evt.sessionId === session.id) {
          this.updateAgent(session.id, { status: 'error', last_output: evt.error });
        }
      });
    } catch (error) {
      logger.error(`Failed to spawn remote agent: ${error}`);
      this.send({
        type: 'command:result',
        payload: {
          action: 'spawn_agent',
          success: false,
          machineId: this.machineId,
          error: `${error}`,
        },
      });
    }
  }

  private async handleKillAgent(data: Record<string, unknown>): Promise<void> {
    try {
      const agentId = data.agentId as string;
      if (!agentId) {
        logger.warn('kill_agent: no agentId provided');
        return;
      }

      const { getAgentSessionManager } = await import('../mission-control/agent-session.js');
      const mgr = getAgentSessionManager();
      mgr.kill(agentId);
      this.removeAgent(agentId);

      this.send({
        type: 'command:result',
        payload: {
          action: 'kill_agent',
          success: true,
          machineId: this.machineId,
          agentId,
        },
      });

      logger.info(`Remote agent killed: ${agentId}`);
    } catch (error) {
      logger.error(`Failed to kill remote agent: ${error}`);
    }
  }

  private async handleGetBuffer(data: Record<string, unknown>): Promise<void> {
    try {
      const agentId = data.agentId as string;
      if (!agentId) {
        logger.warn('get_buffer: no agentId provided');
        return;
      }

      const { getAgentSessionManager } = await import('../mission-control/agent-session.js');
      const mgr = getAgentSessionManager();
      const session = mgr.getSession(agentId);

      const buffer = session ? session.outputBuffer : '';

      this.send({
        type: 'agent:buffer',
        payload: {
          machineId: this.machineId,
          sessionId: agentId,
          buffer: buffer.substring(buffer.length - 50000), // last 50KB
        },
      });

      logger.debug(`Buffer sent for remote agent: ${agentId} (${buffer.length} chars)`);
    } catch (error) {
      logger.error(`Failed to get buffer for remote agent: ${error}`);
    }
  }

  private async handleSendInput(data: Record<string, unknown>): Promise<void> {
    try {
      const agentId = data.agentId as string;
      const input = data.input as string;
      if (!agentId || input === undefined) {
        logger.warn('send_input: missing agentId or input');
        return;
      }

      const { getAgentSessionManager } = await import('../mission-control/agent-session.js');
      const mgr = getAgentSessionManager();
      mgr.respond(agentId, input);

      logger.info(`Input sent to remote agent: ${agentId}`);
    } catch (error) {
      logger.error(`Failed to send input to remote agent: ${error}`);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, config.features.heartbeatInterval);

    // Send immediately
    this.sendHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    const resources = {
      cpuUsage: this.getCpuUsage(),
      memoryUsage: Math.round((1 - freemem() / totalmem()) * 100),
      // GPU usage would require nvidia-smi or similar
    };

    this.send({
      type: 'machine:heartbeat',
      payload: {
        id: this.machineId,
        agents: Array.from(this.agents.values()),
        resources,
      },
    });
  }

  private sendStatus(): void {
    this.send({
      type: 'machine:status',
      payload: {
        id: this.machineId,
        name: config.hub.machineName,
        agents: Array.from(this.agents.values()),
        capabilities: this.getCapabilities(),
      },
    });
  }

  private getCpuUsage(): number {
    // Simplified CPU usage calculation
    const cpuInfo = cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpuInfo) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    return Math.round((1 - totalIdle / totalTick) * 100);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      logger.info('Attempting to reconnect to Hub...');
      this.connect();
    }, 5000);
  }

  private send(msg: HubMessage): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // Public methods for managing agents

  registerAgent(agent: AgentStatus): void {
    this.agents.set(agent.id, agent);
    this.send({
      type: 'agent:register',
      payload: { machineId: this.machineId, agent },
    });
  }

  updateAgent(id: string, updates: Partial<AgentStatus>): void {
    const agent = this.agents.get(id);
    if (agent) {
      Object.assign(agent, updates);
      this.send({
        type: 'agent:update',
        payload: { machineId: this.machineId, agentId: id, ...updates },
      });
    }
  }

  removeAgent(id: string): void {
    this.agents.delete(id);
    this.send({
      type: 'agent:remove',
      payload: { machineId: this.machineId, agentId: id },
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

// Singleton instance
let hubClient: HubClient | null = null;

export function getHubClient(): HubClient {
  if (!hubClient) {
    hubClient = new HubClient();
  }
  return hubClient;
}

export function initHubClient(): HubClient {
  const client = getHubClient();
  client.connect();
  return client;
}
