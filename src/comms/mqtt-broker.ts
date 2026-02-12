/**
 * MQTT-style Pub/Sub Broker
 *
 * Lightweight publish/subscribe messaging for always-on communication.
 * Works over the existing WebSocket connection - no external MQTT broker needed.
 *
 * Topics follow a hierarchy: machine/repo/event
 * Examples:
 *   pia/wingspan/task       - Task sent to wingspan
 *   pia/dao/status          - DAO status update
 *   pia/+/job/completed     - Any repo job completed (wildcard)
 *   pia/#                   - Everything (wildcard)
 *
 * Supports:
 *   - Topic-based routing with wildcards (+ single level, # multi level)
 *   - Retained messages (last message on a topic, sent to new subscribers)
 *   - QoS 0 (fire and forget, appropriate for LAN/Tailscale)
 *   - Persistent subscriptions across reconnects
 */

import { createLogger } from '../utils/logger.js';
import { nanoid } from 'nanoid';

const logger = createLogger('MQTTBroker');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PubSubMessage {
  id: string;
  topic: string;
  payload: unknown;
  publisher: string;              // machine/repo that published
  timestamp: number;
  retained: boolean;
}

export interface Subscription {
  id: string;
  topic: string;                  // Can include wildcards: + and #
  subscriber: string;             // machine/repo that subscribed
  callback?: (msg: PubSubMessage) => void;   // In-process callback
  createdAt: number;
}

// ---------------------------------------------------------------------------
// MQTTBroker Class
// ---------------------------------------------------------------------------

export class MQTTBroker {
  private subscriptions: Map<string, Subscription> = new Map();
  private retained: Map<string, PubSubMessage> = new Map();
  private messageLog: PubSubMessage[] = [];
  private totalPublished = 0;
  private totalDelivered = 0;

  constructor() {
    logger.info('MQTT-style PubSub Broker initialized');
  }

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  /**
   * Publish a message to a topic.
   */
  publish(topic: string, payload: unknown, publisher: string, retain = false): PubSubMessage {
    const msg: PubSubMessage = {
      id: nanoid(),
      topic,
      payload,
      publisher,
      timestamp: Date.now(),
      retained: retain,
    };

    // Store retained message
    if (retain) {
      this.retained.set(topic, msg);
    }

    // Log
    this.messageLog.push(msg);
    if (this.messageLog.length > 10000) {
      this.messageLog.splice(0, this.messageLog.length - 10000);
    }
    this.totalPublished++;

    // Deliver to matching subscribers
    let delivered = 0;
    for (const sub of this.subscriptions.values()) {
      if (this.topicMatches(sub.topic, topic)) {
        if (sub.callback) {
          try {
            sub.callback(msg);
            delivered++;
          } catch {
            // subscriber error
          }
        }
      }
    }

    this.totalDelivered += delivered;
    logger.debug(`Published to "${topic}" by ${publisher} → ${delivered} subscriber(s)`);

    return msg;
  }

  // -------------------------------------------------------------------------
  // Subscribing
  // -------------------------------------------------------------------------

  /**
   * Subscribe to a topic pattern. Returns a subscription ID.
   */
  subscribe(
    topic: string,
    subscriber: string,
    callback: (msg: PubSubMessage) => void,
  ): string {
    const sub: Subscription = {
      id: nanoid(),
      topic,
      subscriber,
      callback,
      createdAt: Date.now(),
    };

    this.subscriptions.set(sub.id, sub);
    logger.info(`Subscription: ${subscriber} → "${topic}" (${sub.id})`);

    // Send retained messages that match
    for (const [retainedTopic, msg] of this.retained) {
      if (this.topicMatches(topic, retainedTopic)) {
        try { callback(msg); } catch { /* subscriber error */ }
      }
    }

    return sub.id;
  }

  /**
   * Unsubscribe by subscription ID.
   */
  unsubscribe(subscriptionId: string): boolean {
    const removed = this.subscriptions.delete(subscriptionId);
    if (removed) logger.debug(`Unsubscribed: ${subscriptionId}`);
    return removed;
  }

  /**
   * Remove all subscriptions for a subscriber.
   */
  unsubscribeAll(subscriber: string): number {
    let count = 0;
    for (const [id, sub] of this.subscriptions) {
      if (sub.subscriber === subscriber) {
        this.subscriptions.delete(id);
        count++;
      }
    }
    if (count > 0) logger.info(`Unsubscribed all for ${subscriber}: ${count} subscription(s)`);
    return count;
  }

  // -------------------------------------------------------------------------
  // Topic Matching (MQTT-style wildcards)
  // -------------------------------------------------------------------------

  /**
   * Check if a subscription pattern matches a topic.
   *   + matches exactly one level
   *   # matches zero or more levels (must be last)
   */
  topicMatches(pattern: string, topic: string): boolean {
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      const p = patternParts[i];

      // # matches everything remaining
      if (p === '#') return true;

      // + matches exactly one level
      if (p === '+') {
        if (i >= topicParts.length) return false;
        continue;
      }

      // Exact match required
      if (i >= topicParts.length || p !== topicParts[i]) return false;
    }

    // Must have matched all parts
    return patternParts.length === topicParts.length;
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /**
   * Get messages for a topic (from log).
   */
  getMessages(topic: string, limit = 50): PubSubMessage[] {
    return this.messageLog
      .filter(m => this.topicMatches(topic, m.topic))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get retained message for a topic.
   */
  getRetained(topic: string): PubSubMessage | undefined {
    return this.retained.get(topic);
  }

  /**
   * List all active topics (from retained + recent messages).
   */
  getTopics(): string[] {
    const topics = new Set<string>();
    for (const topic of this.retained.keys()) topics.add(topic);
    // Also add recent unique topics
    for (const msg of this.messageLog.slice(-500)) topics.add(msg.topic);
    return Array.from(topics).sort();
  }

  /**
   * List all subscriptions.
   */
  getSubscriptions(): Array<{ id: string; topic: string; subscriber: string; createdAt: number }> {
    return Array.from(this.subscriptions.values()).map(s => ({
      id: s.id,
      topic: s.topic,
      subscriber: s.subscriber,
      createdAt: s.createdAt,
    }));
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats(): {
    totalPublished: number;
    totalDelivered: number;
    activeSubscriptions: number;
    retainedMessages: number;
    activeTopics: number;
    recentMessages: number;
    topSubscribers: Array<{ subscriber: string; count: number }>;
    topTopics: Array<{ topic: string; count: number }>;
  } {
    // Count by subscriber
    const subCounts: Record<string, number> = {};
    for (const sub of this.subscriptions.values()) {
      subCounts[sub.subscriber] = (subCounts[sub.subscriber] || 0) + 1;
    }

    // Count by topic
    const topicCounts: Record<string, number> = {};
    for (const msg of this.messageLog.slice(-1000)) {
      topicCounts[msg.topic] = (topicCounts[msg.topic] || 0) + 1;
    }

    return {
      totalPublished: this.totalPublished,
      totalDelivered: this.totalDelivered,
      activeSubscriptions: this.subscriptions.size,
      retainedMessages: this.retained.size,
      activeTopics: this.getTopics().length,
      recentMessages: this.messageLog.length,
      topSubscribers: Object.entries(subCounts)
        .map(([subscriber, count]) => ({ subscriber, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topTopics: Object.entries(topicCounts)
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let broker: MQTTBroker | null = null;

export function getMQTTBroker(): MQTTBroker {
  if (!broker) {
    broker = new MQTTBroker();
  }
  return broker;
}
