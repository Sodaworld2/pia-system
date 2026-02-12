/**
 * AI Module - Cost-Optimized Multi-Model Integration
 *
 * Provides:
 * - Cost routing: Ollama (FREE) → Claude Haiku (CHEAP) → Claude Sonnet (MEDIUM)
 * - Multi-model review panels
 * - Budget tracking and enforcement
 */

// Primary providers
export { OllamaClient, getOllamaClient, initOllamaClient } from './ollama-client.js';
export { ClaudeClient, getClaudeClient, initClaudeClient, CLAUDE_MODELS } from './claude-client.js';

// Core systems
export { AIRouter, getAIRouter } from './ai-router.js';
export { MultiModelPanel, getMultiModelPanel } from './multi-model-panel.js';
export { CostTracker, getCostTracker } from './cost-tracker.js';

// Ollama types
export type { OllamaModel, OllamaMessage, OllamaChatResponse, OllamaGenerateResponse } from './ollama-client.js';

// Claude types
export type { ClaudeModel, ClaudeMessage, ClaudeResponse, ClaudeModelInfo } from './claude-client.js';

// Router types
export type { AIProvider, AIRequest, AIResponse, RoutingDecision, TaskComplexity, TaskType } from './ai-router.js';

// Panel types
export type { ReviewFinding, ModelReview, PanelResult } from './multi-model-panel.js';

// Cost types
export type { UsageRecord, DailyCost, Budget, CostSummary } from './cost-tracker.js';
