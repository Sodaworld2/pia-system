import { WebSocketServer, WebSocket } from 'ws';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { ptyManager, PTYWrapper } from './pty-wrapper.js';
import { appendSessionOutput, getSessionBuffer } from '../db/queries/sessions.js';
import type { CrossMachineMessage } from '../comms/cross-machine.js';

const logger = createLogger('WebSocket');

interface Client {
  ws: WebSocket;
  sessionId: string | null;
  authenticated: boolean;
  subscriptions: Set<string>;
  isAlive: boolean;
}

interface IncomingMessage {
  type: 'auth' | 'subscribe' | 'unsubscribe' | 'input' | 'resize' | 'ping' |
        'machine:register' | 'machine:heartbeat' | 'machine:status' |
        'agent:register' | 'agent:update' | 'agent:remove' | 'agent:output' | 'agent:buffer' | 'pong' |
        'command:result' |
        'relay:register' | 'relay:send' | 'relay:broadcast' |
        'mc:subscribe' | 'mc:respond';
  payload?: {
    token?: string;
    sessionId?: string;
    data?: string;
    cols?: number;
    rows?: number;
    id?: string;
    name?: string;
    hostname?: string;
    capabilities?: Record<string, unknown>;
    agents?: unknown[];
    resources?: Record<string, unknown>;
    machineId?: string;
    agentId?: string;
    agent?: Record<string, unknown>;
    status?: string;
    progress?: number;
    current_task?: string;
    last_output?: string;
    promptId?: string;
    choice?: number | string;
  };
}

interface OutgoingMessage {
  type: 'auth' | 'output' | 'buffer' | 'exit' | 'error' | 'pong' | 'agent:update' | 'alert' | 'machine:update' | 'command' | 'relay:message' | 'relay:registered' |
        'mc:prompt' | 'mc:output' | 'mc:status' | 'mc:journal' | 'mc:agent_spawned' | 'mc:agent_killed' | 'mc:browser_status' | 'mc:power_event';
  success?: boolean;
  payload?: unknown;
  sessionId?: string;
}

interface BufferedCommand {
  msg: OutgoingMessage;
  timestamp: number;
}

const COMMAND_BUFFER_MAX = 100;
const COMMAND_BUFFER_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Debug: store last N command results for diagnostic endpoint
const commandResultLog: Array<{ timestamp: number; result: Record<string, unknown> }> = [];
const RESULT_LOG_MAX = 50;

export function getCommandResultLog() { return commandResultLog; }

export class TunnelWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, Client> = new Map();
  private mcSubscribers: Set<WebSocket> = new Set();
  private machineClients: Map<string, WebSocket> = new Map(); // machineId → WebSocket
  private clientToDbId: Map<string, string> = new Map(); // clientId → canonical DB ID
  private agentClientToDbId: Map<string, string> = new Map(); // spoke agentId → hub DB agentId
  private pendingRequests: Map<string, { resolve: (data: Record<string, unknown>) => void; timer: NodeJS.Timeout }> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private commandBuffer: Map<string, BufferedCommand[]> = new Map(); // machineId → buffered commands

  constructor(port: number) {
    this.wss = new WebSocketServer({
      port,
      maxPayload: 1048576, // 1MB max message size — prevents OOM from oversized messages (Context7 ws docs)
    });
    this.setupServer();
    this.startHeartbeat();
    logger.info(`WebSocket server started on port ${port}`);
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const client: Client = {
        ws,
        sessionId: null,
        authenticated: false,
        subscriptions: new Set(),
        isAlive: true,
      };
      this.clients.set(ws, client);

      // Track pong responses for dead connection detection (Context7 ws pattern)
      ws.on('pong', () => {
        const c = this.clients.get(ws);
        if (c) c.isAlive = true;
      });

      logger.info(`Client connected (${this.clients.size} total)`);

      ws.on('message', (data: Buffer) => {
        try {
          const msg: IncomingMessage = JSON.parse(data.toString());
          this.handleMessage(ws, msg);
        } catch (error) {
          logger.error(`Invalid message: ${error}`);
          this.send(ws, { type: 'error', payload: 'Invalid message format' });
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.mcSubscribers.delete(ws);
        // Remove from machine tracking
        for (const [machineId, machineWs] of this.machineClients) {
          if (machineWs === ws) {
            this.machineClients.delete(machineId);
            logger.info(`Machine ${machineId} disconnected`);
          }
        }
        logger.info(`Client disconnected (${this.clients.size} remaining)`);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error: ${error}`);
      });
    });
  }

  private handleMessage(ws: WebSocket, msg: IncomingMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (msg.type) {
      case 'auth':
        this.handleAuth(ws, client, msg.payload?.token);
        break;

      case 'subscribe':
        if (!client.authenticated) {
          this.send(ws, { type: 'error', payload: 'Not authenticated' });
          return;
        }
        this.handleSubscribe(ws, client, msg.payload?.sessionId);
        break;

      case 'unsubscribe':
        if (!client.authenticated) return;
        this.handleUnsubscribe(client, msg.payload?.sessionId);
        break;

      case 'input':
        if (!client.authenticated) {
          this.send(ws, { type: 'error', payload: 'Not authenticated' });
          return;
        }
        this.handleInput(msg.payload?.sessionId, msg.payload?.data);
        break;

      case 'resize':
        if (!client.authenticated) return;
        this.handleResize(msg.payload?.sessionId, msg.payload?.cols, msg.payload?.rows);
        break;

      case 'ping':
        this.send(ws, { type: 'pong' });
        break;

      case 'pong':
        // Application-level pong (from spoke hub-client). Also mark alive.
        if (client) client.isAlive = true;
        break;

      // Machine/Agent messages from PIA Local services
      case 'machine:register':
      case 'machine:heartbeat':
      case 'machine:status':
      case 'agent:register':
      case 'agent:update':
      case 'agent:remove':
        if (!client.authenticated) {
          this.send(ws, { type: 'error', payload: 'Not authenticated' });
          return;
        }
        // Track machine WebSocket connection for targeted commands
        if (msg.type === 'machine:register' && msg.payload?.id) {
          this.machineClients.set(msg.payload.id, ws);
          // Register with aggregator and get the canonical DB ID back
          this.handleHubMessage(msg.type, msg.payload).then((dbId) => {
            if (dbId && dbId !== msg.payload!.id) {
              this.machineClients.set(dbId, ws);
              this.clientToDbId.set(msg.payload!.id as string, dbId);
              logger.info(`Machine ${msg.payload!.name} tracked by client ID ${msg.payload!.id} and DB ID ${dbId}`);
              // Replay any buffered commands for this DB ID
              this.replayBufferedCommands(dbId);
            } else {
              logger.info(`Machine ${msg.payload!.id} (${msg.payload!.name}) connection tracked`);
            }
            // Replay any buffered commands for the client ID
            this.replayBufferedCommands(msg.payload!.id as string);
          });
        } else {
          // Translate client machineId to DB ID for agent messages
          if (msg.payload?.machineId && this.clientToDbId.has(msg.payload.machineId)) {
            msg.payload.machineId = this.clientToDbId.get(msg.payload.machineId);
          }
          this.handleHubMessage(msg.type, msg.payload);
        }
        break;

      // Remote agent output streaming (spoke → hub → dashboard)
      case 'agent:output':
        if (!client.authenticated) return;
        if (msg.payload) {
          const p = msg.payload as Record<string, unknown>;
          // Translate spoke sessionId to hub DB agent ID
          const resolvedSessionId = this.agentClientToDbId.get(p.sessionId as string) || p.sessionId;
          this.broadcastMc({
            type: 'mc:output',
            payload: { sessionId: resolvedSessionId, data: p.data },
          });
        }
        break;

      // Remote agent buffer response (spoke → hub, forwarded to requesting client)
      case 'agent:buffer':
        if (!client.authenticated) return;
        if (msg.payload) {
          const p = msg.payload as Record<string, unknown>;
          const resolvedSessionId = this.agentClientToDbId.get(p.sessionId as string) || p.sessionId;
          this.broadcastMc({
            type: 'mc:output',
            payload: {
              sessionId: resolvedSessionId,
              data: p.buffer,
              isBuffer: true,
            },
          });
        }
        break;

      // Command result from spoke (confirmation/error)
      case 'command:result':
        if (!client.authenticated) return;
        if (msg.payload) {
          const p = msg.payload as Record<string, unknown>;
          // Resolve pending async request if there's a requestId
          if (p.requestId && this.pendingRequests.has(p.requestId as string)) {
            const pending = this.pendingRequests.get(p.requestId as string)!;
            clearTimeout(pending.timer);
            this.pendingRequests.delete(p.requestId as string);
            pending.resolve(p);
          }
          if (p.action === 'spawn_agent' && p.success) {
            // Translate spoke IDs to hub DB IDs for the dashboard
            const resolvedMachineId = this.clientToDbId.get(p.machineId as string) || p.machineId;
            const resolvedAgentId = this.agentClientToDbId.get(p.agentId as string) || p.agentId;
            this.broadcastMc({
              type: 'mc:agent_spawned',
              payload: { machineId: resolvedMachineId, agentId: resolvedAgentId, message: p.message },
            });
          }
          // Store for diagnostic endpoint
          commandResultLog.push({ timestamp: Date.now(), result: p });
          if (commandResultLog.length > RESULT_LOG_MAX) commandResultLog.shift();
          logger.info(`Command result from spoke: ${JSON.stringify(p).substring(0, 200)}`);
        }
        break;

      // Mission Control messages
      case 'mc:subscribe':
        if (!client.authenticated) {
          this.send(ws, { type: 'error', payload: 'Not authenticated' });
          return;
        }
        this.mcSubscribers.add(ws);
        logger.info('Client subscribed to Mission Control events');
        break;

      case 'mc:respond':
        if (!client.authenticated) {
          this.send(ws, { type: 'error', payload: 'Not authenticated' });
          return;
        }
        this.handleMcRespond(msg.payload);
        break;

      // Cross-machine relay messages
      case 'relay:register':
      case 'relay:send':
      case 'relay:broadcast':
        if (!client.authenticated) {
          this.send(ws, { type: 'error', payload: 'Not authenticated' });
          return;
        }
        this.handleRelayMessage(ws, msg.type, msg.payload);
        break;
    }
  }

  private async handleHubMessage(type: string, payload: IncomingMessage['payload']): Promise<string | void> {
    // Lazy import to avoid circular dependency
    try {
      const { getAggregator } = await import('../hub/aggregator.js');
      const aggregator = getAggregator();

      switch (type) {
        case 'machine:register':
          if (payload?.id && payload?.name && payload?.hostname) {
            const machine = aggregator.handleMachineRegister({
              id: payload.id,
              name: payload.name,
              hostname: payload.hostname,
              capabilities: payload.capabilities,
            });
            return machine.id; // Return the canonical DB ID
          }
          break;

        case 'machine:heartbeat':
          if (payload?.id) {
            aggregator.handleMachineHeartbeat({
              id: payload.id,
              agents: payload.agents as Array<{ id: string; status: string; progress?: number; last_output?: string }>,
              resources: payload.resources as { cpuUsage?: number; memoryUsage?: number; gpuUsage?: number },
            });
          }
          break;

        case 'agent:register':
          if (payload?.machineId && payload?.agent) {
            const spokeAgent = payload.agent as {
              id: string;
              name: string;
              type: string;
              status: string;
              progress: number;
              current_task?: string;
              last_output?: string;
            };
            const dbAgent = aggregator.handleAgentRegister({
              machineId: payload.machineId,
              agent: spokeAgent,
            });
            // Map spoke agent ID → hub DB agent ID so updates resolve correctly
            if (dbAgent && dbAgent.id !== spokeAgent.id) {
              this.agentClientToDbId.set(spokeAgent.id, dbAgent.id);
              logger.info(`Mapped spoke agent ${spokeAgent.id} → DB agent ${dbAgent.id}`);
            }
          }
          break;

        case 'agent:update':
          if (payload?.machineId && payload?.agentId) {
            const resolvedAgentId = this.agentClientToDbId.get(payload.agentId) || payload.agentId;
            aggregator.handleAgentUpdate({
              machineId: payload.machineId,
              agentId: resolvedAgentId,
              status: payload.status,
              progress: payload.progress,
              current_task: payload.current_task,
              last_output: payload.last_output,
            });
          }
          break;

        case 'agent:remove':
          if (payload?.machineId && payload?.agentId) {
            const resolvedAgentId = this.agentClientToDbId.get(payload.agentId) || payload.agentId;
            aggregator.handleAgentRemove({
              machineId: payload.machineId,
              agentId: resolvedAgentId,
            });
            // Clean up mapping
            this.agentClientToDbId.delete(payload.agentId);
          }
          break;
      }
    } catch (error) {
      logger.error(`Failed to handle hub message: ${error}`);
    }
  }

  private async handleRelayMessage(ws: WebSocket, type: string, payload: IncomingMessage['payload']): Promise<void> {
    try {
      const { getCrossMachineRelay } = await import('../comms/cross-machine.js');
      const relay = getCrossMachineRelay();

      switch (type) {
        case 'relay:register':
          if (payload?.id && payload?.name) {
            const machine = relay.registerMachine({
              id: payload.id as string,
              name: payload.name as string,
              hostname: (payload.hostname as string) || 'unknown',
              project: (payload as Record<string, unknown>).project as string,
              tailscaleIp: (payload as Record<string, unknown>).tailscaleIp as string,
              channels: ['websocket'],
              ws,
            });

            // Subscribe this WS to relay messages
            relay.subscribe((msg) => {
              if (ws.readyState === WebSocket.OPEN) {
                this.send(ws, { type: 'relay:message', payload: msg });
              }
            });

            this.send(ws, {
              type: 'relay:registered',
              payload: {
                status: 'registered',
                hub: relay.getStats().thisMachine,
                machine: { ...machine, ws: undefined },
              },
            });
          }
          break;

        case 'relay:send':
          if (payload) {
            const p = payload as Record<string, unknown>;
            relay.send(
              p.to as string,
              p.content as string,
              ((p.type as string) || 'chat') as CrossMachineMessage['type'],
              'websocket',
              p.metadata as Record<string, unknown>,
            );
          }
          break;

        case 'relay:broadcast':
          if (payload) {
            const p = payload as Record<string, unknown>;
            relay.send(
              '*',
              p.content as string,
              ((p.type as string) || 'chat') as CrossMachineMessage['type'],
              'websocket',
              p.metadata as Record<string, unknown>,
            );
          }
          break;
      }
    } catch (error) {
      logger.error(`Failed to handle relay message: ${error}`);
      this.send(ws, { type: 'error', payload: `Relay error: ${error}` });
    }
  }

  private async handleMcRespond(payload: IncomingMessage['payload']): Promise<void> {
    if (!payload?.promptId || payload.choice === undefined) {
      logger.warn('mc:respond missing promptId or choice');
      return;
    }
    try {
      const { getPromptManager } = await import('../mission-control/prompt-manager.js');
      getPromptManager().respond(payload.promptId, payload.choice);
    } catch (error) {
      logger.error(`Failed to handle mc:respond: ${error}`);
    }
  }

  // Broadcast to all Mission Control subscribers
  broadcastMc(msg: OutgoingMessage): void {
    for (const ws of this.mcSubscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, msg);
      } else {
        this.mcSubscribers.delete(ws);
      }
    }
  }

  private handleAuth(ws: WebSocket, client: Client, token?: string): void {
    const isValid = token === config.security.secretToken;
    client.authenticated = isValid;

    this.send(ws, {
      type: 'auth',
      success: isValid,
      payload: isValid ? 'Authenticated successfully' : 'Invalid token',
    });

    if (isValid) {
      logger.info('Client authenticated');
    } else {
      logger.warn('Client authentication failed');
    }
  }

  private handleSubscribe(ws: WebSocket, client: Client, sessionId?: string): void {
    if (!sessionId) {
      this.send(ws, { type: 'error', payload: 'Session ID required' });
      return;
    }

    client.subscriptions.add(sessionId);
    client.sessionId = sessionId;

    // Send current buffer
    const ptyWrapper = ptyManager.get(sessionId);
    if (ptyWrapper) {
      const buffer = ptyWrapper.getBufferAsString();
      this.send(ws, {
        type: 'buffer',
        sessionId,
        payload: buffer,
      });
    } else {
      // Try to get from database
      try {
        const buffer = getSessionBuffer(sessionId);
        this.send(ws, {
          type: 'buffer',
          sessionId,
          payload: buffer,
        });
      } catch {
        // Session might not exist yet
        this.send(ws, {
          type: 'buffer',
          sessionId,
          payload: '',
        });
      }
    }

    logger.debug(`Client subscribed to session: ${sessionId}`);
  }

  private handleUnsubscribe(client: Client, sessionId?: string): void {
    if (sessionId) {
      client.subscriptions.delete(sessionId);
      if (client.sessionId === sessionId) {
        client.sessionId = null;
      }
    }
  }

  private handleInput(sessionId?: string, data?: string): void {
    if (!sessionId || !data) return;

    const ptyWrapper = ptyManager.get(sessionId);
    if (ptyWrapper) {
      ptyWrapper.write(data);
      logger.debug(`Input sent to session ${sessionId}: ${data.length} bytes`);
    } else {
      logger.warn(`Session not found for input: ${sessionId}`);
    }
  }

  private handleResize(sessionId?: string, cols?: number, rows?: number): void {
    if (!sessionId || !cols || !rows) return;

    const ptyWrapper = ptyManager.get(sessionId);
    if (ptyWrapper) {
      ptyWrapper.resize(cols, rows);
    }
  }

  private send(ws: WebSocket, msg: OutgoingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // Broadcast to all clients subscribed to a session
  broadcastToSession(sessionId: string, msg: OutgoingMessage): void {
    msg.sessionId = sessionId;

    for (const [ws, client] of this.clients) {
      if (client.authenticated && client.subscriptions.has(sessionId)) {
        this.send(ws, msg);
      }
    }
  }

  // Broadcast to all authenticated clients
  broadcast(msg: OutgoingMessage): void {
    for (const [ws, client] of this.clients) {
      if (client.authenticated) {
        this.send(ws, msg);
      }
    }
  }

  // Register a PTY session for broadcasting
  registerPTY(sessionId: string, ptyWrapper: PTYWrapper): void {
    ptyWrapper.on('output', (data: string) => {
      // Store in database
      try {
        appendSessionOutput(sessionId, data);
      } catch (error) {
        logger.error(`Failed to store session output: ${error}`);
      }

      // Broadcast to subscribers
      this.broadcastToSession(sessionId, {
        type: 'output',
        payload: data,
      });
    });

    ptyWrapper.on('exit', (code: number) => {
      this.broadcastToSession(sessionId, {
        type: 'exit',
        payload: { code },
      });
    });
  }

  // Send command to a specific machine by ID. Buffers if disconnected.
  sendToMachine(machineId: string, msg: OutgoingMessage): boolean {
    const ws = this.machineClients.get(machineId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(msg);
      logger.debug(`sendToMachine ${machineId}: ${json.substring(0, 300)}`);
      ws.send(json);
      return true;
    }
    // Buffer command for replay on reconnect (Risk Analysis Fix B — retry buffer)
    this.bufferCommand(machineId, msg);
    logger.warn(`Machine ${machineId} not connected — command buffered for replay`);
    return false;
  }

  private bufferCommand(machineId: string, msg: OutgoingMessage): void {
    if (!this.commandBuffer.has(machineId)) {
      this.commandBuffer.set(machineId, []);
    }
    const buf = this.commandBuffer.get(machineId)!;
    buf.push({ msg, timestamp: Date.now() });
    // Cap buffer size
    if (buf.length > COMMAND_BUFFER_MAX) {
      buf.splice(0, buf.length - COMMAND_BUFFER_MAX);
    }
  }

  private replayBufferedCommands(machineId: string): void {
    const buf = this.commandBuffer.get(machineId);
    if (!buf || buf.length === 0) return;

    const now = Date.now();
    // Filter out stale commands (older than TTL)
    const fresh = buf.filter(c => (now - c.timestamp) < COMMAND_BUFFER_TTL_MS);
    this.commandBuffer.delete(machineId);

    if (fresh.length === 0) return;

    logger.info(`Replaying ${fresh.length} buffered commands to machine ${machineId}`);
    const ws = this.machineClients.get(machineId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      for (const cmd of fresh) {
        ws.send(JSON.stringify(cmd.msg));
      }
    }
  }

  // Send command to a machine and wait for the response (with timeout)
  sendToMachineAsync(machineId: string, action: string, data: Record<string, unknown>, timeoutMs = 10000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Timeout waiting for response from machine ${machineId}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, timer });

      const sent = this.sendToMachine(machineId, {
        type: 'command',
        payload: { action, data: { ...data, requestId } },
      });

      if (!sent) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(new Error(`Machine ${machineId} is not connected`));
      }
    });
  }

  // Get list of connected machine IDs
  getConnectedMachines(): string[] {
    const connected: string[] = [];
    for (const [machineId, ws] of this.machineClients) {
      if (ws.readyState === WebSocket.OPEN) {
        connected.push(machineId);
      }
    }
    return connected;
  }

  // Send agent update to all clients
  sendAgentUpdate(agentId: string, update: Record<string, unknown>): void {
    this.broadcast({
      type: 'agent:update',
      payload: { id: agentId, ...update },
    });
  }

  // Send alert to all clients
  sendAlert(alert: Record<string, unknown>): void {
    this.broadcast({
      type: 'alert',
      payload: alert,
    });
  }

  private startHeartbeat(): void {
    // Ping/pong heartbeat per Context7 ws docs — detects silently broken connections
    this.heartbeatInterval = setInterval(() => {
      for (const [ws, client] of this.clients) {
        if (ws.readyState !== WebSocket.OPEN) {
          this.clients.delete(ws);
          this.mcSubscribers.delete(ws);
          continue;
        }
        if (!client.isAlive) {
          // No pong since last ping — connection is dead
          logger.warn(`Terminating unresponsive client (was alive: false)`);
          this.clients.delete(ws);
          this.mcSubscribers.delete(ws);
          // Clean up machine tracking
          for (const [machineId, machineWs] of this.machineClients) {
            if (machineWs === ws) {
              this.machineClients.delete(machineId);
              logger.info(`Machine ${machineId} removed (dead connection)`);
            }
          }
          ws.terminate();
          continue;
        }
        client.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getAuthenticatedClientCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.authenticated) count++;
    }
    return count;
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    // Graceful shutdown: notify all clients before closing (Context7 ws docs — code 1001 = Going Away)
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.wss.close();
    logger.info('WebSocket server closed');
  }
}

// Singleton instance (will be initialized in main)
export let wsServer: TunnelWebSocketServer | null = null;

export function initWebSocketServer(port: number): TunnelWebSocketServer {
  wsServer = new TunnelWebSocketServer(port);
  return wsServer;
}

export function getWebSocketServer(): TunnelWebSocketServer {
  if (!wsServer) {
    throw new Error('WebSocket server not initialized');
  }
  return wsServer;
}
