import { EventEmitter } from 'events';
import type { BusEvent } from '../../../types/foundation';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// EventBus — Singleton, in-process event bus
//
// Wraps EventEmitter today. The interface is designed so that swapping to
// BullMQ (or any durable queue) later requires no call-site changes.
// ---------------------------------------------------------------------------

export type BusHandler = (event: BusEvent) => void | Promise<void>;

class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Allow a large number of listeners during development; modules
    // subscribe to many event types.
    this.emitter.setMaxListeners(200);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Publish an event. A `timestamp` and `correlation_id` are added
   * automatically if not already present.
   */
  emit(event: Omit<BusEvent, 'timestamp'> & { timestamp?: string }): void {
    const full: BusEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
      correlation_id: event.correlation_id ?? randomUUID(),
    };

    this.log('emit', full);
    this.emitter.emit(full.type, full);
    // Also emit on the wildcard channel so global listeners can observe all traffic
    this.emitter.emit('*', full);
  }

  /**
   * Subscribe to events of `eventType`. Use `'*'` to receive every event.
   */
  on(eventType: string, handler: BusHandler): void {
    this.emitter.on(eventType, handler);
  }

  /**
   * Unsubscribe a previously registered handler.
   */
  off(eventType: string, handler: BusHandler): void {
    this.emitter.off(eventType, handler);
  }

  /**
   * Subscribe to a single occurrence of `eventType`, then auto-unsubscribe.
   */
  once(eventType: string, handler: BusHandler): void {
    this.emitter.once(eventType, handler);
  }

  /**
   * Return the number of listeners for a given event type.
   */
  listenerCount(eventType: string): number {
    return this.emitter.listenerCount(eventType);
  }

  /**
   * Remove all listeners, optionally limited to a specific event type.
   * Useful in tests or during graceful shutdown.
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.emitter.removeAllListeners(eventType);
    } else {
      this.emitter.removeAllListeners();
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private log(action: string, event: BusEvent): void {
    if (process.env.BUS_LOG === 'true' || process.env.NODE_ENV === 'development') {
      console.log(
        `[Bus] ${action} | type=${event.type} | source=${event.source}` +
          (event.dao_id ? ` | dao=${event.dao_id}` : '') +
          (event.correlation_id ? ` | cid=${event.correlation_id}` : ''),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/** The single, shared event bus instance for the entire process. */
export const bus = new EventBus();

export default bus;
