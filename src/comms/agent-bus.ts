/**
 * Agent Bus - Inter-agent communication system
 *
 * Message bus for agents to communicate with each other.
 * Supports direct messages, broadcasts, and real-time subscriptions.
 */

import { createLogger } from '../utils/logger.js';
import { nanoid } from 'nanoid';

const logger = createLogger('AgentBus');

const MAX_MESSAGES_PER_AGENT = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentMessage {
  id: string;
  from: string;
  to: string; // agentId or '*' for broadcast
  type: 'direct' | 'broadcast' | 'command' | 'status';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  read: boolean;
}

export type MessageCallback = (msg: AgentMessage) => void;

// ---------------------------------------------------------------------------
// AgentBus Class
// ---------------------------------------------------------------------------

export class AgentBus {
  private messages: Map<string, AgentMessage[]> = new Map();
  private subscribers: Map<string, Set<MessageCallback>> = new Map();
  private totalSent = 0;

  constructor() {
    logger.info('AgentBus initialized');
  }

  /**
   * Send a direct message to a specific agent.
   */
  send(
    from: string,
    to: string,
    content: string,
    type: AgentMessage['type'] = 'direct',
    metadata?: Record<string, unknown>,
  ): AgentMessage {
    const msg: AgentMessage = {
      id: nanoid(),
      from,
      to,
      type,
      content,
      metadata,
      timestamp: Math.floor(Date.now() / 1000),
      read: false,
    };

    // Store for recipient
    this.storeMessage(to, msg);
    this.totalSent++;

    // Notify subscribers
    this.notifySubscribers(to, msg);

    logger.debug(`Message ${from} → ${to}: ${content.substring(0, 80)}`);
    return msg;
  }

  /**
   * Broadcast a message to all agents.
   */
  broadcast(
    from: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): AgentMessage {
    const msg: AgentMessage = {
      id: nanoid(),
      from,
      to: '*',
      type: 'broadcast',
      content,
      metadata,
      timestamp: Math.floor(Date.now() / 1000),
      read: false,
    };

    // Store under broadcast key
    this.storeMessage('*', msg);
    this.totalSent++;

    // Notify all subscribers
    for (const [agentId, callbacks] of this.subscribers) {
      if (agentId !== from) {
        for (const cb of callbacks) {
          try { cb(msg); } catch { /* subscriber error */ }
        }
      }
    }

    logger.debug(`Broadcast from ${from}: ${content.substring(0, 80)}`);
    return msg;
  }

  /**
   * Get messages for an agent (direct + broadcasts).
   */
  getMessages(agentId: string, unreadOnly = false): AgentMessage[] {
    const direct = this.messages.get(agentId) || [];
    const broadcasts = (this.messages.get('*') || []).filter(m => m.from !== agentId);
    const all = [...direct, ...broadcasts].sort((a, b) => b.timestamp - a.timestamp);

    if (unreadOnly) {
      return all.filter(m => !m.read);
    }
    return all;
  }

  /**
   * Mark a message as read.
   */
  markRead(messageId: string, agentId: string): void {
    const msgs = this.messages.get(agentId) || [];
    const msg = msgs.find(m => m.id === messageId);
    if (msg) msg.read = true;

    // Also check broadcasts
    const broadcasts = this.messages.get('*') || [];
    const bMsg = broadcasts.find(m => m.id === messageId);
    if (bMsg) bMsg.read = true;
  }

  /**
   * Subscribe to messages for an agent. Returns an unsubscribe function.
   */
  subscribe(agentId: string, callback: MessageCallback): () => void {
    if (!this.subscribers.has(agentId)) {
      this.subscribers.set(agentId, new Set());
    }
    this.subscribers.get(agentId)!.add(callback);

    return () => {
      this.subscribers.get(agentId)?.delete(callback);
    };
  }

  /**
   * Get messaging statistics.
   */
  getStats(): {
    totalMessages: number;
    activeSubscribers: number;
    messagesByType: Record<string, number>;
    agentInboxes: number;
  } {
    const messagesByType: Record<string, number> = {};
    let totalStored = 0;

    for (const msgs of this.messages.values()) {
      for (const msg of msgs) {
        messagesByType[msg.type] = (messagesByType[msg.type] || 0) + 1;
        totalStored++;
      }
    }

    let activeSubscribers = 0;
    for (const subs of this.subscribers.values()) {
      activeSubscribers += subs.size;
    }

    return {
      totalMessages: totalStored,
      activeSubscribers,
      messagesByType,
      agentInboxes: this.messages.size,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private storeMessage(key: string, msg: AgentMessage): void {
    if (!this.messages.has(key)) {
      this.messages.set(key, []);
    }
    const inbox = this.messages.get(key)!;
    inbox.push(msg);

    // Cap at max
    if (inbox.length > MAX_MESSAGES_PER_AGENT) {
      inbox.splice(0, inbox.length - MAX_MESSAGES_PER_AGENT);
    }
  }

  private notifySubscribers(agentId: string, msg: AgentMessage): void {
    const callbacks = this.subscribers.get(agentId);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(msg); } catch { /* subscriber error */ }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let bus: AgentBus | null = null;

export function getAgentBus(): AgentBus {
  if (!bus) {
    bus = new AgentBus();
  }
  return bus;
}
