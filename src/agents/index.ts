/**
 * Agents Module - Agent Factory & Cost Routing
 *
 * Provides:
 * - Agent templates (@local-coder, @researcher, @reviewer, @debug, @devops, @security)
 * - Cost-optimized model routing (FREE → CHEAP → MEDIUM)
 * - Dynamic agent lifecycle management (spawn, list, stop)
 */

export { AgentFactory, getAgentFactory } from './agent-factory.js';
export { CostRouter, getCostRouter } from './cost-router.js';

export type { TemplateName, AgentTemplate, SpawnOptions, SpawnResult, FactoryStatus } from './agent-factory.js';
export type { CostTier, TierConfig, RoutingResult } from './cost-router.js';
