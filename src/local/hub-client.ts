/**
 * PIA Hub Client
 * Connects to the central PIA Hub and reports machine/agent status
 */

import WebSocket from 'ws';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { hostname, platform, cpus, totalmem, freemem } from 'os';
import { nanoid } from 'nanoid';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { getMachineIdPath } from '../electron-paths.js';
import { scanGitRepos, KnownProject } from '../utils/project-scanner.js';

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
  private pingTimeout: NodeJS.Timeout | null = null;
  private agents: Map<string, AgentStatus> = new Map();
  private connected: boolean = false;
  private reconnectAttempts: number = 0;

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
      this.ws = new WebSocket(hubUrl, {
        handshakeTimeout: 10000, // 10s handshake timeout (Context7 ws docs)
      });

      this.ws.on('open', () => {
        logger.info('Connected to Hub');
        this.connected = true;
        this.reconnectAttempts = 0; // Reset backoff on successful connection
        this.authenticate();
        this.register();
        this.startHeartbeat();
        this.resetPingTimeout(); // Start client-side dead-hub detection
      });

      // Client-side ping timeout — detect dead hub (Context7 ws heartbeat pattern)
      this.ws.on('ping', () => {
        this.resetPingTimeout();
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
        this.clearPingTimeout();
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

    // Scan for git repos on this machine
    let knownProjects: KnownProject[] = [];
    try {
      knownProjects = scanGitRepos();
      logger.info(`Found ${knownProjects.length} git repos: ${knownProjects.map(p => p.name).join(', ')}`);
    } catch (err) {
      logger.warn(`Failed to scan git repos: ${err}`);
    }

    return {
      platform: platform(),
      hostname: hostname(),
      cpuCount: cpuInfo.length,
      cpuModel: cpuInfo[0]?.model || 'Unknown',
      totalMemory: totalmem(),
      freeMemory: freemem(),
      gpu: process.env.PIA_HAS_GPU === 'true' ? 'RTX 5090' : null,
      ollama: process.env.PIA_OLLAMA_AVAILABLE === 'true',
      knownProjects,
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

      case 'list_directory':
        this.handleListDirectory(command.data as Record<string, unknown>);
        break;

      case 'search_directory':
        this.handleSearchDirectory(command.data as Record<string, unknown>);
        break;

      case 'set_env':
        this.handleSetEnv(command.data as Record<string, unknown>);
        break;

      case 'diagnose':
        this.handleDiagnose(command.data as Record<string, unknown>);
        break;

      default:
        logger.warn(`Unknown command: ${command.action}`);
    }
  }

  private async handleSpawnAgent(data: Record<string, unknown>): Promise<void> {
    const requestId = (data.requestId as string) || '';
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
        mcpServers: data.mcpServers as Array<{ name: string; transport: 'stdio' | 'sse' | 'http'; command?: string; args?: string[]; url?: string }> | undefined,
        fallbackModel: data.fallbackModel as string | undefined,
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
          requestId,
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
          requestId,
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

  private handleListDirectory(data: Record<string, unknown>): void {
    const requestId = (data.requestId as string) || '';
    try {
      const dirPath = data.path as string;
      if (!dirPath) {
        this.send({ type: 'command:result', payload: { action: 'list_directory', requestId, success: false, error: 'path is required' } });
        return;
      }

      if (!existsSync(dirPath)) {
        this.send({ type: 'command:result', payload: { action: 'list_directory', requestId, success: false, error: 'Directory not found' } });
        return;
      }

      const entries = readdirSync(dirPath, { withFileTypes: true });
      const items = entries.map(e => {
        try {
          const stat = statSync(path.join(dirPath, e.name));
          return { name: e.name, type: e.isDirectory() ? 'directory' : 'file', size: e.isFile() ? stat.size : undefined, mtime: stat.mtimeMs };
        } catch {
          return { name: e.name, type: e.isDirectory() ? 'directory' : 'file' };
        }
      });

      this.send({ type: 'command:result', payload: { action: 'list_directory', requestId, success: true, path: dirPath, items, count: items.length } });
      logger.debug(`Listed directory: ${dirPath} (${items.length} items)`);
    } catch (error) {
      this.send({ type: 'command:result', payload: { action: 'list_directory', requestId, success: false, error: `${error}` } });
    }
  }

  private handleSearchDirectory(data: Record<string, unknown>): void {
    const requestId = (data.requestId as string) || '';
    try {
      const query = ((data.q as string) || '').toLowerCase();
      const root = (data.root as string) || (platform() === 'win32' ? 'C:\\Users' : '/home');
      const maxDepth = (data.maxDepth as number) || 4;
      const maxResults = (data.maxResults as number) || 20;

      if (!query || query.length < 2) {
        this.send({ type: 'command:result', payload: { action: 'search_directory', requestId, success: false, error: 'q must be at least 2 characters' } });
        return;
      }

      if (!existsSync(root)) {
        this.send({ type: 'command:result', payload: { action: 'search_directory', requestId, success: false, error: 'Root directory not found' } });
        return;
      }

      const results: { name: string; path: string; depth: number }[] = [];
      const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
      const deadline = Date.now() + 12000; // 12s cap — must finish before hub's 15s timeout

      while (queue.length > 0 && results.length < maxResults) {
        if (Date.now() > deadline) {
          logger.warn(`Search timed out after 12s for "${query}" from ${root}`);
          break;
        }
        const { dir, depth } = queue.shift()!;
        if (depth > maxDepth) continue;
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$Recycle.Bin' || entry.name === 'AppData') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.name.toLowerCase().includes(query)) {
              results.push({ name: entry.name, path: fullPath, depth });
              if (results.length >= maxResults) break;
            }
            if (depth < maxDepth) queue.push({ dir: fullPath, depth: depth + 1 });
          }
        } catch { /* permission denied — skip */ }
      }

      this.send({ type: 'command:result', payload: { action: 'search_directory', requestId, success: true, query, root, results, count: results.length } });
      logger.debug(`Searched directories: "${query}" from ${root} (${results.length} results)`);
    } catch (error) {
      this.send({ type: 'command:result', payload: { action: 'search_directory', requestId, success: false, error: `${error}` } });
    }
  }

  private handleSetEnv(data: Record<string, unknown>): void {
    const requestId = (data.requestId as string) || '';
    try {
      const vars = data.vars as Record<string, string>;
      if (!vars || typeof vars !== 'object' || Object.keys(vars).length === 0) {
        this.send({ type: 'command:result', payload: { action: 'set_env', requestId, success: false, error: 'vars object is required' } });
        return;
      }

      // Find .env file relative to the PIA project root
      const envPath = path.resolve(process.cwd(), '.env');
      let existing = '';
      if (existsSync(envPath)) {
        existing = readFileSync(envPath, 'utf-8');
      }

      // Parse existing .env into lines
      const lines = existing.split(/\r?\n/);
      const updated: string[] = [];
      const keysSet = new Set<string>();

      for (const line of lines) {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
        if (match && match[1] in vars) {
          // Replace this line with new value
          updated.push(`${match[1]}=${vars[match[1]]}`);
          keysSet.add(match[1]);
        } else {
          updated.push(line);
        }
      }

      // Append any new keys that weren't in the file
      for (const [key, value] of Object.entries(vars)) {
        if (!keysSet.has(key)) {
          updated.push(`${key}=${value}`);
        }
      }

      // Write back
      writeFileSync(envPath, updated.join('\n'));

      // Also inject into running process so spawned agents pick up changes immediately
      for (const [key, value] of Object.entries(vars)) {
        process.env[key] = value;
      }

      const keyNames = Object.keys(vars).map(k => k.replace(/^(ANTHROPIC_API_KEY)$/, '$1 (masked)'));
      logger.info(`Updated .env and process.env: ${keyNames.join(', ')}`);

      this.send({ type: 'command:result', payload: { action: 'set_env', requestId, success: true, keys: Object.keys(vars), path: envPath } });
    } catch (error) {
      this.send({ type: 'command:result', payload: { action: 'set_env', requestId, success: false, error: `${error}` } });
    }
  }

  private handleDiagnose(data: Record<string, unknown>): void {
    const requestId = (data?.requestId as string) || '';
    try {
      const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
      const apiKeyPrefix = hasApiKey ? process.env.ANTHROPIC_API_KEY!.substring(0, 12) + '...' : 'NOT SET';
      const envPath = path.resolve(process.cwd(), '.env');
      const envExists = existsSync(envPath);
      let envHasKey = false;
      if (envExists) {
        const content = readFileSync(envPath, 'utf-8');
        envHasKey = content.includes('ANTHROPIC_API_KEY=');
      }

      // Check if SDK is importable
      let sdkAvailable = false;
      try {
        require.resolve('@anthropic-ai/claude-agent-sdk');
        sdkAvailable = true;
      } catch { sdkAvailable = false; }

      // Check if database is initialized
      let dbOk = false;
      try {
        const { getDatabase } = require('../db/database.js');
        getDatabase();
        dbOk = true;
      } catch { dbOk = false; }

      const result = {
        action: 'diagnose',
        requestId,
        success: true,
        hostname: process.env.COMPUTERNAME || require('os').hostname(),
        cwd: process.cwd(),
        nodeVersion: process.version,
        hasApiKey,
        apiKeyPrefix,
        envFileExists: envExists,
        envFileHasKey: envHasKey,
        sdkAvailable,
        databaseOk: dbOk,
        platform: process.platform,
        uptime: process.uptime(),
      };

      logger.info(`Diagnose result: ${JSON.stringify(result)}`);
      this.send({ type: 'command:result', payload: result });
    } catch (error) {
      this.send({ type: 'command:result', payload: { action: 'diagnose', requestId, success: false, error: `${error}` } });
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

  /** Client-side ping timeout — detect unresponsive hub (Context7 ws docs) */
  private resetPingTimeout(): void {
    this.clearPingTimeout();
    // Hub pings every 30s; allow 31s (30s + 1s latency buffer) before declaring dead
    this.pingTimeout = setTimeout(() => {
      logger.warn('Hub unresponsive (no ping in 31s), terminating connection');
      if (this.ws) this.ws.terminate();
    }, 31000);
  }

  private clearPingTimeout(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Exponential backoff: 5s, 10s, 20s, 40s, capped at 60s
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;

    logger.info(`Reconnecting to Hub in ${(delay / 1000).toFixed(0)}s (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
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
    this.clearPingTimeout();
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
