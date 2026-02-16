import type { BusEvent } from '../../../types/foundation';
export type BusHandler = (event: BusEvent) => void | Promise<void>;
declare class EventBus {
    private readonly emitter;
    constructor();
    /**
     * Publish an event. A `timestamp` and `correlation_id` are added
     * automatically if not already present.
     */
    emit(event: Omit<BusEvent, 'timestamp'> & {
        timestamp?: string;
    }): void;
    /**
     * Subscribe to events of `eventType`. Use `'*'` to receive every event.
     */
    on(eventType: string, handler: BusHandler): void;
    /**
     * Unsubscribe a previously registered handler.
     */
    off(eventType: string, handler: BusHandler): void;
    /**
     * Subscribe to a single occurrence of `eventType`, then auto-unsubscribe.
     */
    once(eventType: string, handler: BusHandler): void;
    /**
     * Return the number of listeners for a given event type.
     */
    listenerCount(eventType: string): number;
    /**
     * Remove all listeners, optionally limited to a specific event type.
     * Useful in tests or during graceful shutdown.
     */
    removeAllListeners(eventType?: string): void;
    private log;
}
/** The single, shared event bus instance for the entire process. */
export declare const bus: EventBus;
export default bus;
//# sourceMappingURL=bus.d.ts.map