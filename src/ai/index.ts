/**
 * AI Module - Cost-Optimized Multi-Model Integration
 *
 * Provides:
 * - Cost routing (FREE → CHEAP → MEDIUM → PREMIUM)
 * - Multi-model review panels
 * - Budget tracking and enforcement
 */

export { OllamaClient, getOllamaClient, initOllamaClient } from './ollama-client.js';
export { GeminiClient, getGeminiClient, initGeminiClient } from './gemini-client.js';
export { OpenAIClient, getOpenAIClient, initOpenAIClient } from './openai-client.js';
export { GrokClient, getGrokClient, initGrokClient } from './grok-client.js';
export { AIRouter, getAIRouter } from './ai-router.js';
export { MultiModelPanel, getMultiModelPanel } from './multi-model-panel.js';
export { CostTracker, getCostTracker } from './cost-tracker.js';

export type { OllamaModel, OllamaMessage, OllamaChatResponse, OllamaGenerateResponse } from './ollama-client.js';
export type { GeminiMessage, GeminiResponse, ThinkingLevel } from './gemini-client.js';
export type { OpenAIModel, OpenAIMessage, OpenAIResponse } from './openai-client.js';
export type { GrokModel, GrokMessage, GrokResponse } from './grok-client.js';
export type { AIProvider, AIRequest, AIResponse, RoutingDecision, TaskComplexity, TaskType } from './ai-router.js';
export type { ReviewFinding, ModelReview, PanelResult } from './multi-model-panel.js';
export type { UsageRecord, DailyCost, Budget, CostSummary } from './cost-tracker.js';
