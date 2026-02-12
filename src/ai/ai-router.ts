/**
 * AI Router - Cost-Optimized Model Selection
 * Routes tasks to the cheapest AI that can handle them
 *
 * Cost Waterfall:
 * Tier 0 (FREE):    Ollama (local GPU)
 * Tier 1 (CHEAP):   Claude Haiku 4.5 (~$0.002/req)
 * Tier 2 (MEDIUM):  Claude Sonnet 4.5 (~$0.01/req)
 */

import { createLogger } from '../utils/logger.js';
import { getOllamaClient, OllamaClient } from './ollama-client.js';
import { getClaudeClient, ClaudeClient } from './claude-client.js';

const logger = createLogger('AIRouter');

export type TaskComplexity = 'simple' | 'medium' | 'complex' | 'security';
export type TaskType = 'code' | 'review' | 'security' | 'chat' | 'analysis';

export interface AIProvider {
  name: 'ollama' | 'claude';
  tier: 0 | 1 | 2;
  model: string;
  costPer1KTokens: number;
  available: boolean;
}

export interface RoutingDecision {
  provider: AIProvider['name'];
  model: string;
  reason: string;
  estimatedCost: number;
  fallback?: string;
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
  private claude: ClaudeClient;

  private providers: Map<string, AIProvider> = new Map();

  constructor() {
    this.ollama = getOllamaClient();
    this.claude = getClaudeClient();

    // Initialize provider info
    this.providers.set('ollama', {
      name: 'ollama',
      tier: 0,
      model: this.ollama.getDefaultModel(),
      costPer1KTokens: 0,
      available: false,
    });
    this.providers.set('claude-haiku', {
      name: 'claude',
      tier: 1,
      model: 'claude-haiku-4-5-20251001',
      costPer1KTokens: 0.0008,
      available: this.claude.isConfigured(),
    });
    this.providers.set('claude-sonnet', {
      name: 'claude',
      tier: 2,
      model: 'claude-sonnet-4-5-20250929',
      costPer1KTokens: 0.003,
      available: this.claude.isConfigured(),
    });
  }

  /**
   * Check which providers are available
   */
  async checkAvailability(): Promise<Map<string, boolean>> {
    const availability = new Map<string, boolean>();

    // Check Ollama (requires network call)
    const ollamaAvailable = await this.ollama.isAvailable();
    this.providers.get('ollama')!.available = ollamaAvailable;
    availability.set('ollama', ollamaAvailable);

    // Check Claude (config check - actual API test is expensive)
    const claudeConfigured = this.claude.isConfigured();
    this.providers.get('claude-haiku')!.available = claudeConfigured;
    this.providers.get('claude-sonnet')!.available = claudeConfigured;
    availability.set('claude', claudeConfigured);

    logger.info(`Provider availability: Ollama=${ollamaAvailable}, Claude=${claudeConfigured}`);

    return availability;
  }

  /**
   * Classify task complexity
   */
  async classifyTask(prompt: string): Promise<TaskComplexity> {
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
   *
   * Waterfall: Ollama (FREE) -> Claude Haiku (CHEAP) -> Claude Sonnet (MEDIUM)
   */
  async route(request: AIRequest): Promise<RoutingDecision> {
    await this.checkAvailability();

    const complexity = request.complexity || await this.classifyTask(request.prompt);

    // Security tasks always use Claude Sonnet (strongest reasoning)
    if (complexity === 'security' || request.taskType === 'security') {
      if (this.providers.get('claude-sonnet')!.available) {
        return {
          provider: 'claude',
          model: 'claude-sonnet-4-5-20250929',
          reason: 'Security tasks require deep reasoning (Claude Sonnet)',
          estimatedCost: 0.02,
          fallback: 'claude-haiku-4-5-20251001',
        };
      }
    }

    // Try FREE tier first (Ollama)
    const ollamaProvider = this.providers.get('ollama')!;
    if (ollamaProvider.available && (complexity === 'simple' || request.preferLocal)) {
      return {
        provider: 'ollama',
        model: this.ollama.getDefaultModel(),
        reason: 'Using FREE local AI for simple task',
        estimatedCost: 0,
        fallback: 'claude-haiku-4-5-20251001',
      };
    }

    // Medium tasks - Claude Haiku (fast & cheap)
    const haikuProvider = this.providers.get('claude-haiku')!;
    if (haikuProvider.available && complexity !== 'complex') {
      return {
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        reason: 'Using Claude Haiku for medium complexity task',
        estimatedCost: 0.002,
        fallback: 'claude-sonnet-4-5-20250929',
      };
    }

    // Complex tasks or Haiku unavailable - Claude Sonnet
    const sonnetProvider = this.providers.get('claude-sonnet')!;
    if (sonnetProvider.available) {
      return {
        provider: 'claude',
        model: 'claude-sonnet-4-5-20250929',
        reason: `Using Claude Sonnet for ${complexity} task`,
        estimatedCost: 0.01,
      };
    }

    // Fallback to Ollama even for complex tasks if nothing else available
    if (ollamaProvider.available) {
      return {
        provider: 'ollama',
        model: this.ollama.getDefaultModel(),
        reason: 'Falling back to Ollama (no Claude API key)',
        estimatedCost: 0,
      };
    }

    throw new Error('No AI providers available. Configure Ollama or set ANTHROPIC_API_KEY.');
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
      let tokens: number | undefined;

      switch (decision.provider) {
        case 'ollama': {
          const ollamaResponse = await this.ollama.chat([
            { role: 'user', content: request.prompt },
          ]);
          content = ollamaResponse.message.content;
          break;
        }

        case 'claude': {
          const claudeResult = await this.claude.chat(
            [{ role: 'user', content: request.prompt }],
            decision.model as any,
            {
              system: request.context,
              maxTokens: 4096,
            }
          );
          content = claudeResult.text;
          tokens = claudeResult.usage.input_tokens + claudeResult.usage.output_tokens;
          break;
        }

        default:
          throw new Error(`Unknown provider: ${decision.provider}`);
      }

      const duration = Date.now() - startTime;

      return {
        content,
        provider: decision.provider,
        model: decision.model,
        tokens,
        cost: decision.estimatedCost,
        duration,
      };
    } catch (error) {
      // Try fallback if available
      if (decision.fallback) {
        logger.warn(`${decision.provider}/${decision.model} failed, trying fallback: ${decision.fallback}`);

        // Determine fallback provider
        const isOllamaFallback = decision.fallback.includes('ollama');
        const fallbackProvider = isOllamaFallback ? 'ollama' : 'claude';

        try {
          let content: string;
          let tokens: number | undefined;

          if (fallbackProvider === 'ollama') {
            const ollamaResponse = await this.ollama.chat([
              { role: 'user', content: request.prompt },
            ]);
            content = ollamaResponse.message.content;
          } else {
            const claudeResult = await this.claude.chat(
              [{ role: 'user', content: request.prompt }],
              decision.fallback as any,
              { system: request.context, maxTokens: 4096 }
            );
            content = claudeResult.text;
            tokens = claudeResult.usage.input_tokens + claudeResult.usage.output_tokens;
          }

          const duration = Date.now() - startTime;
          return {
            content,
            provider: fallbackProvider,
            model: decision.fallback,
            tokens,
            cost: fallbackProvider === 'ollama' ? 0 : 0.002,
            duration,
          };
        } catch (fallbackError) {
          logger.error(`Fallback also failed: ${fallbackError}`);
          throw error; // Throw original error
        }
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
        return 'ollama (FREE) → claude-haiku → claude-sonnet';
      case 'review':
        return 'claude-haiku → claude-sonnet';
      case 'security':
        return 'claude-sonnet (deep reasoning)';
      case 'analysis':
        return 'claude-sonnet → claude-haiku';
      default:
        return 'ollama → claude-haiku → claude-sonnet';
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
