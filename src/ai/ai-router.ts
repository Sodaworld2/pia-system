/**
 * AI Router - Cost-Optimized Model Selection
 * Routes tasks to the cheapest AI that can handle them
 *
 * Cost Waterfall:
 * Tier 0 (FREE):    Ollama (local GPU)
 * Tier 1 (CHEAP):   Gemini Flash
 * Tier 2 (MEDIUM):  Gemini Pro, GPT-4.1-mini
 * Tier 3 (PREMIUM): GPT-4.1, o3, Grok
 */

import { createLogger } from '../utils/logger.js';
import { getOllamaClient, OllamaClient } from './ollama-client.js';
import { getGeminiClient, GeminiClient } from './gemini-client.js';
import { getOpenAIClient, OpenAIClient } from './openai-client.js';
import { getGrokClient, GrokClient } from './grok-client.js';

const logger = createLogger('AIRouter');

export type TaskComplexity = 'simple' | 'medium' | 'complex' | 'security';
export type TaskType = 'code' | 'review' | 'security' | 'chat' | 'analysis';

export interface AIProvider {
  name: 'ollama' | 'gemini' | 'openai' | 'grok' | 'claude';
  tier: 0 | 1 | 2 | 3;
  costPer1KTokens: number;
  available: boolean;
}

export interface RoutingDecision {
  provider: AIProvider['name'];
  model: string;
  reason: string;
  estimatedCost: number;
  fallback?: AIProvider['name'];
}

export interface AIRequest {
  prompt: string;
  taskType: TaskType;
  complexity?: TaskComplexity;
  context?: string;
  preferLocal?: boolean;
  maxCost?: number;
}

export interface AIResponse {
  content: string;
  provider: AIProvider['name'];
  model: string;
  tokens?: number;
  cost: number;
  duration: number;
}

export class AIRouter {
  private ollama: OllamaClient;
  private gemini: GeminiClient;
  private openai: OpenAIClient;
  private grok: GrokClient;

  private providers: Map<AIProvider['name'], AIProvider> = new Map();

  constructor() {
    this.ollama = getOllamaClient();
    this.gemini = getGeminiClient();
    this.openai = getOpenAIClient();
    this.grok = getGrokClient();

    // Initialize provider info
    this.providers.set('ollama', {
      name: 'ollama',
      tier: 0,
      costPer1KTokens: 0,
      available: false,
    });
    this.providers.set('gemini', {
      name: 'gemini',
      tier: 1,
      costPer1KTokens: 0.001,
      available: this.gemini.isConfigured(),
    });
    this.providers.set('openai', {
      name: 'openai',
      tier: 2,
      costPer1KTokens: 0.01,
      available: this.openai.isConfigured(),
    });
    this.providers.set('grok', {
      name: 'grok',
      tier: 3,
      costPer1KTokens: 0.015,
      available: this.grok.isConfigured(),
    });
  }

  /**
   * Check which providers are available
   */
  async checkAvailability(): Promise<Map<AIProvider['name'], boolean>> {
    const availability = new Map<AIProvider['name'], boolean>();

    // Check Ollama
    const ollamaAvailable = await this.ollama.isAvailable();
    this.providers.get('ollama')!.available = ollamaAvailable;
    availability.set('ollama', ollamaAvailable);

    // Check others (just config check)
    availability.set('gemini', this.gemini.isConfigured());
    availability.set('openai', this.openai.isConfigured());
    availability.set('grok', this.grok.isConfigured());

    logger.info(`Provider availability: Ollama=${ollamaAvailable}, Gemini=${this.gemini.isConfigured()}, OpenAI=${this.openai.isConfigured()}, Grok=${this.grok.isConfigured()}`);

    return availability;
  }

  /**
   * Classify task complexity
   */
  async classifyTask(prompt: string): Promise<TaskComplexity> {
    // Quick heuristics first
    const lowerPrompt = prompt.toLowerCase();

    // Security tasks are always complex
    if (
      lowerPrompt.includes('security') ||
      lowerPrompt.includes('vulnerab') ||
      lowerPrompt.includes('exploit') ||
      lowerPrompt.includes('attack')
    ) {
      return 'security';
    }

    // Simple indicators
    const simplePatterns = [
      /fix\s*(typo|spelling)/i,
      /rename\s+\w+/i,
      /add\s+(log|comment)/i,
      /remove\s+(unused|dead)/i,
      /format/i,
    ];

    for (const pattern of simplePatterns) {
      if (pattern.test(prompt)) return 'simple';
    }

    // Complex indicators
    const complexPatterns = [
      /refactor/i,
      /architect/i,
      /redesign/i,
      /multi.?file/i,
      /entire\s+(system|codebase)/i,
      /migration/i,
    ];

    for (const pattern of complexPatterns) {
      if (pattern.test(prompt)) return 'complex';
    }

    // Use Ollama for more nuanced classification if available
    if (await this.ollama.isAvailable()) {
      try {
        return await this.ollama.classifyTask(prompt);
      } catch {
        // Fall back to medium
      }
    }

    return 'medium';
  }

  /**
   * Route a request to the appropriate AI
   */
  async route(request: AIRequest): Promise<RoutingDecision> {
    await this.checkAvailability();

    const complexity = request.complexity || await this.classifyTask(request.prompt);

    // Security tasks always use multi-model panel
    if (complexity === 'security' || request.taskType === 'security') {
      return {
        provider: 'openai', // Primary for security
        model: 'o3',
        reason: 'Security tasks require deep reasoning',
        estimatedCost: 0.10,
        fallback: 'gemini',
      };
    }

    // Try FREE tier first (Ollama)
    const ollamaProvider = this.providers.get('ollama')!;
    if (ollamaProvider.available && (complexity === 'simple' || request.preferLocal)) {
      return {
        provider: 'ollama',
        model: this.ollama.getDefaultModel(),
        reason: 'Using FREE local AI for simple task',
        estimatedCost: 0,
        fallback: 'gemini',
      };
    }

    // Medium tasks - try Gemini (cheaper than OpenAI)
    const geminiProvider = this.providers.get('gemini')!;
    if (geminiProvider.available && complexity !== 'complex') {
      return {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        reason: 'Using Gemini for medium complexity task',
        estimatedCost: 0.02,
        fallback: 'openai',
      };
    }

    // Complex tasks or Gemini unavailable - use OpenAI
    const openaiProvider = this.providers.get('openai')!;
    if (openaiProvider.available) {
      return {
        provider: 'openai',
        model: complexity === 'complex' ? 'o3' : 'gpt-4.1',
        reason: `Using OpenAI for ${complexity} task`,
        estimatedCost: complexity === 'complex' ? 0.15 : 0.05,
        fallback: 'grok',
      };
    }

    // Last resort - Grok
    const grokProvider = this.providers.get('grok')!;
    if (grokProvider.available) {
      return {
        provider: 'grok',
        model: 'grok-4-0709',
        reason: 'Using Grok as fallback',
        estimatedCost: 0.08,
      };
    }

    // No AI available
    throw new Error('No AI providers available');
  }

  /**
   * Execute a request using the router
   */
  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const decision = await this.route(request);

    logger.info(`Routing to ${decision.provider} (${decision.model}): ${decision.reason}`);

    try {
      let content: string;

      switch (decision.provider) {
        case 'ollama':
          const ollamaResponse = await this.ollama.chat([
            { role: 'user', content: request.prompt },
          ]);
          content = ollamaResponse.message.content;
          break;

        case 'gemini':
          content = await this.gemini.generate(request.prompt);
          break;

        case 'openai':
          content = await this.openai.generate(request.prompt, decision.model as any);
          break;

        case 'grok':
          content = await this.grok.generate(request.prompt);
          break;

        default:
          throw new Error(`Unknown provider: ${decision.provider}`);
      }

      const duration = Date.now() - startTime;

      return {
        content,
        provider: decision.provider,
        model: decision.model,
        cost: decision.estimatedCost,
        duration,
      };
    } catch (error) {
      // Try fallback if available
      if (decision.fallback) {
        logger.warn(`${decision.provider} failed, trying fallback: ${decision.fallback}`);
        return this.execute({
          ...request,
          complexity: request.complexity, // Keep original to prevent infinite loop
        });
      }
      throw error;
    }
  }

  /**
   * Get status of all providers
   */
  async getStatus(): Promise<AIProvider[]> {
    await this.checkAvailability();
    return Array.from(this.providers.values());
  }

  /**
   * Get recommended provider for a task type
   */
  getRecommendation(taskType: TaskType): string {
    switch (taskType) {
      case 'code':
        return 'ollama (FREE) → gemini → openai';
      case 'review':
        return 'gemini → openai → grok';
      case 'security':
        return 'Multi-model panel (gemini + openai + grok)';
      case 'analysis':
        return 'openai (o3) → gemini';
      default:
        return 'ollama → gemini → openai';
    }
  }
}

// Singleton
let aiRouter: AIRouter | null = null;

export function getAIRouter(): AIRouter {
  if (!aiRouter) {
    aiRouter = new AIRouter();
  }
  return aiRouter;
}
