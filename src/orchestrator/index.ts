/**
 * Orchestrator Module
 *
 * Task queue + Execution engine + Heartbeat = agents that DO work
 */

export { TaskQueue, getTaskQueue } from './task-queue.js';
export { ExecutionEngine, getExecutionEngine, initExecutionEngine } from './execution-engine.js';
export { HeartbeatService, getHeartbeatService } from './heartbeat.js';

export type { TaskInput, TaskRecord } from './task-queue.js';
export type { ExecutionConfig, ExecutionResult, EngineStats } from './execution-engine.js';
export type { SystemResources, HeartbeatPayload } from './heartbeat.js';
