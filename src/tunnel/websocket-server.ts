import { WebSocketServer, WebSocket } from 'ws';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { ptyManager, PTYWrapper } from './pty-wrapper.js';
import { appendSessionOutput, getSessionBuffer } from '../db/queries/sessions.js';

const logger = createLogger('WebSocket');

interface Client {
  ws: WebSocket;
  sessionId: string | null;
  authenticated: boolean;
  subscriptions: Set<string>;
}

interface IncomingMessage {
  type: 'auth' | 'subscribe' | 'unsubscribe' | 'input' | 'resize' | 'ping' |
        'machine:register' | 'machine:heartbeat' | 'machine:status' |
        'agent:register' | 'agent:update' | 'agent:remove' | 'pong';
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
  };
}

interface OutgoingMessage {
  type: 'auth' | 'output' | 'buffer' | 'exit' | 'error' | 'pong' | 'agent:update' | 'alert' | 'machine:update' | 'command';
  success?: boolean;
  payload?: unknown;
  sessionId?: string;
}

export class TunnelWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, Client> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
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
      };
      this.clients.set(ws, client);
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
        // Response to our ping, connection is alive
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
        this.handleHubMessage(msg.type, msg.payload);
        break;
    }
  }

  private handleHubMessage(type: string, payload: IncomingMessage['payload']): void {
    // Lazy import to avoid circular dependency
    try {
      const { getAggregator } = require('../hub/aggregator.js');
      const aggregator = getAggregator();

      switch (type) {
        case 'machine:register':
          if (payload?.id && payload?.name && payload?.hostname) {
            aggregator.handleMachineRegister({
              id: payload.id,
              name: payload.name,
              hostname: payload.hostname,
              capabilities: payload.capabilities,
            });
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
            aggregator.handleAgentRegister({
              machineId: payload.machineId,
              agent: payload.agent as {
                id: string;
                name: string;
                type: string;
                status: string;
                progress: number;
                current_task?: string;
                last_output?: string;
              },
            });
          }
          break;

        case 'agent:update':
          if (payload?.machineId && payload?.agentId) {
            aggregator.handleAgentUpdate({
              machineId: payload.machineId,
              agentId: payload.agentId,
              status: payload.status,
              progress: payload.progress,
              current_task: payload.current_task,
              last_output: payload.last_output,
            });
          }
          break;

        case 'agent:remove':
          if (payload?.machineId && payload?.agentId) {
            aggregator.handleAgentRemove({
              machineId: payload.machineId,
              agentId: payload.agentId,
            });
          }
          break;
      }
    } catch (error) {
      logger.error(`Failed to handle hub message: ${error}`);
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
    this.heartbeatInterval = setInterval(() => {
      for (const [ws, _client] of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          // Check if connection is still alive
          ws.ping();
        } else {
          this.clients.delete(ws);
        }
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
