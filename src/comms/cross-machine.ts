/**
 * Cross-Machine Communication Relay
 *
 * Unified message router that works across all channels:
 * - Direct WebSocket (LAN / Tailscale)
 * - Ngrok tunnel (public internet)
 * - Discord bot (async chat)
 * - REST API (HTTP polling)
 *
 * Each remote machine connects via WebSocket and identifies itself.
 * Messages are relayed between machines in real-time.
 */

import { WebSocket } from 'ws';
import { createLogger } from '../utils/logger.js';
import { getAgentBus } from './agent-bus.js';
import { nanoid } from 'nanoid';

const logger = createLogger('CrossMachine');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoteMachine {
  id: string;
  name: string;
  hostname: string;
  project?: string;          // e.g. "DAO", "PIA", etc.
  tailscaleIp?: string;
  ngrokUrl?: string;
  connectedAt: number;
  lastSeen: number;
  ws?: WebSocket;            // live WebSocket connection (if connected)
  channels: ('websocket' | 'tailscale' | 'ngrok' | 'discord' | 'api')[];
}

export interface CrossMachineMessage {
  id: string;
  from: { machineId: string; machineName: string };
  to: { machineId: string; machineName: string } | '*';   // '*' = broadcast
  channel: 'websocket' | 'tailscale' | 'ngrok' | 'discord' | 'api';
  type: 'chat' | 'command' | 'status' | 'file' | 'task' | 'heartbeat';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// CrossMachineRelay Class
// ---------------------------------------------------------------------------

export class CrossMachineRelay {
  private machines: Map<string, RemoteMachine> = new Map();
  private messageLog: CrossMachineMessage[] = [];
  private subscribers: Set<(msg: CrossMachineMessage) => void> = new Set();
  private thisId: string;
  private thisName: string;

  constructor(machineId: string, machineName: string) {
    this.thisId = machineId;
    this.thisName = machineName;
    logger.info(`CrossMachineRelay initialized as "${machineName}" (${machineId})`);
  }

  // -------------------------------------------------------------------------
  // Machine Registration
  // -------------------------------------------------------------------------

  registerMachine(machine: Omit<RemoteMachine, 'connectedAt' | 'lastSeen'>): RemoteMachine {
    const now = Date.now();
    const existing = this.machines.get(machine.id);

    const record: RemoteMachine = {
      ...machine,
      connectedAt: existing?.connectedAt || now,
      lastSeen: now,
    };

    this.machines.set(machine.id, record);
    logger.info(`Machine registered: ${machine.name} (${machine.id}) [${machine.channels.join(', ')}]`);

    // Notify all subscribers about the new machine
    this.notifySubscribers({
      id: nanoid(),
      from: { machineId: machine.id, machineName: machine.name },
      to: '*',
      channel: 'websocket',
      type: 'status',
      content: `Machine "${machine.name}" connected`,
      metadata: { event: 'machine:connect', project: machine.project },
      timestamp: now,
    });

    return record;
  }

  unregisterMachine(machineId: string): void {
    const machine = this.machines.get(machineId);
    if (machine) {
      this.machines.delete(machineId);
      logger.info(`Machine unregistered: ${machine.name}`);
    }
  }

  getMachine(machineId: string): RemoteMachine | undefined {
    return this.machines.get(machineId);
  }

  getAllMachines(): RemoteMachine[] {
    return Array.from(this.machines.values()).map(m => ({
      ...m,
      ws: undefined, // Don't expose WebSocket in API responses
    }));
  }

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  /**
   * Send a message to a specific machine or broadcast to all.
   */
  send(
    toMachineId: string | '*',
    content: string,
    type: CrossMachineMessage['type'] = 'chat',
    channel: CrossMachineMessage['channel'] = 'websocket',
    metadata?: Record<string, unknown>,
  ): CrossMachineMessage {
    const msg: CrossMachineMessage = {
      id: nanoid(),
      from: { machineId: this.thisId, machineName: this.thisName },
      to: toMachineId === '*'
        ? '*'
        : { machineId: toMachineId, machineName: this.machines.get(toMachineId)?.name || 'unknown' },
      channel,
      type,
      content,
      metadata,
      timestamp: Date.now(),
    };

    this.messageLog.push(msg);
    if (this.messageLog.length > 5000) {
      this.messageLog.splice(0, this.messageLog.length - 5000);
    }

    // Route the message
    if (toMachineId === '*') {
      // Broadcast to all connected machines
      for (const [id, machine] of this.machines) {
        if (id !== this.thisId) {
          this.deliverToMachine(machine, msg);
        }
      }
    } else {
      const target = this.machines.get(toMachineId);
      if (target) {
        this.deliverToMachine(target, msg);
      } else {
        logger.warn(`Target machine not found: ${toMachineId}`);
      }
    }

    // Also notify local subscribers
    this.notifySubscribers(msg);

    // Also post to the agent bus so local agents see cross-machine messages
    const bus = getAgentBus();
    bus.send(
      `machine:${this.thisId}`,
      toMachineId === '*' ? '*' : `machine:${toMachineId}`,
      content,
      'direct',
      { ...metadata, crossMachine: true, channel },
    );

    logger.info(`Message sent via ${channel}: ${this.thisName} → ${toMachineId === '*' ? 'ALL' : toMachineId}`);
    return msg;
  }

  /**
   * Handle an incoming message from a remote machine.
   */
  handleIncoming(msg: CrossMachineMessage): void {
    this.messageLog.push(msg);
    this.notifySubscribers(msg);

    // Forward to agent bus
    const bus = getAgentBus();
    const fromId = msg.from.machineId;
    bus.send(
      `machine:${fromId}`,
      `machine:${this.thisId}`,
      msg.content,
      'direct',
      { crossMachine: true, channel: msg.channel, originalId: msg.id },
    );

    // Update last seen
    const machine = this.machines.get(fromId);
    if (machine) {
      machine.lastSeen = Date.now();
    }

    logger.info(`Message received via ${msg.channel}: ${msg.from.machineName} → ${this.thisName}`);
  }

  /**
   * Get message history, optionally filtered.
   */
  getMessages(opts?: {
    machineId?: string;
    type?: CrossMachineMessage['type'];
    channel?: CrossMachineMessage['channel'];
    since?: number;
    limit?: number;
  }): CrossMachineMessage[] {
    let msgs = [...this.messageLog];

    if (opts?.machineId) {
      msgs = msgs.filter(m =>
        m.from.machineId === opts.machineId ||
        (typeof m.to === 'object' && m.to.machineId === opts.machineId)
      );
    }
    if (opts?.type) {
      msgs = msgs.filter(m => m.type === opts.type);
    }
    if (opts?.channel) {
      msgs = msgs.filter(m => m.channel === opts.channel);
    }
    if (opts?.since) {
      const since = opts.since;
      msgs = msgs.filter(m => m.timestamp >= since);
    }

    msgs.sort((a, b) => b.timestamp - a.timestamp);

    if (opts?.limit) {
      msgs = msgs.slice(0, opts.limit);
    }

    return msgs;
  }

  // -------------------------------------------------------------------------
  // Subscriptions (real-time)
  // -------------------------------------------------------------------------

  subscribe(callback: (msg: CrossMachineMessage) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats(): {
    thisMachine: { id: string; name: string };
    connectedMachines: number;
    totalMessages: number;
    channels: Record<string, number>;
    machines: Array<{ id: string; name: string; project?: string; lastSeen: number; channels: string[] }>;
  } {
    const channels: Record<string, number> = {};
    for (const msg of this.messageLog) {
      channels[msg.channel] = (channels[msg.channel] || 0) + 1;
    }

    return {
      thisMachine: { id: this.thisId, name: this.thisName },
      connectedMachines: this.machines.size,
      totalMessages: this.messageLog.length,
      channels,
      machines: this.getAllMachines().map(m => ({
        id: m.id,
        name: m.name,
        project: m.project,
        lastSeen: m.lastSeen,
        channels: m.channels,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private deliverToMachine(machine: RemoteMachine, msg: CrossMachineMessage): void {
    // Try WebSocket first (fastest)
    if (machine.ws && machine.ws.readyState === WebSocket.OPEN) {
      machine.ws.send(JSON.stringify({
        type: 'relay:message',
        payload: msg,
      }));
      return;
    }

    // Fallback: HTTP POST to remote machine's relay/incoming endpoint
    const targetUrl = machine.tailscaleIp
      ? `http://${machine.tailscaleIp}:3000/api/relay/incoming`
      : machine.ngrokUrl
        ? `${machine.ngrokUrl}/api/relay/incoming`
        : null;

    if (targetUrl) {
      this.httpDeliver(targetUrl, msg, machine.name).catch(() => {
        logger.warn(`HTTP delivery failed to ${machine.name}, message stored for polling`);
      });
    } else {
      logger.debug(`Machine ${machine.name} not connected via WS and no IP, message queued for API polling`);
    }
  }

  private async httpDeliver(url: string, msg: CrossMachineMessage, machineName: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Token': process.env.PIA_SECRET_TOKEN || 'pia-local-dev-token-2024',
        },
        body: JSON.stringify(msg),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        logger.info(`HTTP delivered to ${machineName}`);
      } else {
        logger.warn(`HTTP delivery to ${machineName} returned ${response.status}`);
      }
    } catch (err) {
      logger.warn(`HTTP delivery to ${machineName} failed: ${err}`);
    }
  }

  private notifySubscribers(msg: CrossMachineMessage): void {
    for (const cb of this.subscribers) {
      try { cb(msg); } catch { /* subscriber error */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let relay: CrossMachineRelay | null = null;

export function initCrossMachineRelay(machineId: string, machineName: string): CrossMachineRelay {
  relay = new CrossMachineRelay(machineId, machineName);
  return relay;
}

export function getCrossMachineRelay(): CrossMachineRelay {
  if (!relay) {
    throw new Error('CrossMachineRelay not initialized. Call initCrossMachineRelay first.');
  }
  return relay;
}
