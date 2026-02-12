/**
 * Claude Client - Anthropic API Integration
 * Uses Claude for intelligent code generation, review, and reasoning
 *
 * Tiers:
 *   CHEAP  - Claude Haiku 4.5 (~$0.001/req)
 *   MEDIUM - Claude Sonnet 4.5 (~$0.01/req)
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('Claude');

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: { type: string; text: string }[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type ClaudeModel =
  | 'claude-sonnet-4-5-20250929'
  | 'claude-haiku-4-5-20251001'
  | 'claude-opus-4-6';

export interface ClaudeModelInfo {
  id: ClaudeModel;
  name: string;
  tier: 'cheap' | 'medium' | 'premium';
  costPer1MInput: number;
  costPer1MOutput: number;
}

export const CLAUDE_MODELS: ClaudeModelInfo[] = [
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    tier: 'cheap',
    costPer1MInput: 0.80,
    costPer1MOutput: 4.00,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    tier: 'medium',
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    tier: 'premium',
    costPer1MInput: 15.00,
    costPer1MOutput: 75.00,
  },
];

export class ClaudeClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.anthropic.com/v1';
  private defaultModel: ClaudeModel = 'claude-haiku-4-5-20251001';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Check if Claude API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  /**
   * Check if API is available (makes a quick test call)
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // 200 = success, 401 = bad key, 429 = rate limited (but available)
      return res.status === 200 || res.status === 429;
    } catch {
      return false;
    }
  }

  /**
   * Send messages to Claude
   */
  async chat(
    messages: ClaudeMessage[],
    model?: ClaudeModel,
    options?: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
    const startTime = Date.now();
    const modelToUse = model || this.defaultModel;

    try {
      const body: Record<string, unknown> = {
        model: modelToUse,
        messages,
        max_tokens: options?.maxTokens ?? 4096,
      };

      if (options?.system) {
        body.system = options.system;
      }
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error (${response.status}): ${error}`);
      }

      const data = await response.json() as ClaudeResponse;
      const text = data.content.map(c => c.text).join('');
      const usage = data.usage || { input_tokens: 0, output_tokens: 0 };

      const duration = Date.now() - startTime;
      logger.debug(`Claude ${modelToUse}: ${usage.input_tokens}+${usage.output_tokens} tokens in ${duration}ms`);

      return { text, usage };
    } catch (error) {
      logger.error(`Claude chat failed: ${error}`);
      throw error;
    }
  }

  /**
   * Simple text generation
   */
  async generate(
    prompt: string,
    model?: ClaudeModel,
    options?: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const result = await this.chat(
      [{ role: 'user', content: prompt }],
      model,
      options
    );
    return result.text;
  }

  /**
   * Code review
   */
  async reviewCode(
    code: string,
    context?: string,
    model?: ClaudeModel
  ): Promise<string> {
    const system = `You are an expert code reviewer. Analyze the code for:
1. Bugs and logic errors
2. Security vulnerabilities (OWASP top 10)
3. Performance issues
4. Best practice violations
5. Suggestions for improvement

Be specific and actionable. Reference line numbers where possible.`;

    const prompt = context
      ? `Context: ${context}\n\nCode to review:\n\`\`\`\n${code}\n\`\`\``
      : `Review this code:\n\`\`\`\n${code}\n\`\`\``;

    return this.generate(prompt, model || 'claude-sonnet-4-5-20250929', {
      system,
      temperature: 0.3,
      maxTokens: 4096,
    });
  }

  /**
   * Task execution - agent performs a task
   */
  async executeTask(
    task: string,
    _agentType: string,
    systemPrompt: string,
    model?: ClaudeModel,
    options?: { maxTokens?: number }
  ): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
    return this.chat(
      [{ role: 'user', content: task }],
      model,
      {
        system: systemPrompt,
        temperature: 0.7,
        maxTokens: options?.maxTokens ?? 8192,
      }
    );
  }

  /**
   * Get model info by tier
   */
  getModelByTier(tier: 'cheap' | 'medium' | 'premium'): ClaudeModelInfo | undefined {
    return CLAUDE_MODELS.find(m => m.tier === tier);
  }

  /**
   * Estimate cost for given tokens
   */
  estimateCost(model: ClaudeModel, inputTokens: number, outputTokens: number): number {
    const info = CLAUDE_MODELS.find(m => m.id === model);
    if (!info) return 0;
    return (inputTokens / 1_000_000) * info.costPer1MInput +
           (outputTokens / 1_000_000) * info.costPer1MOutput;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let claudeClient: ClaudeClient | null = null;

export function getClaudeClient(): ClaudeClient {
  if (!claudeClient) {
    const apiKey = process.env.PIA_CLAUDE_API_KEY ||
                   process.env.ANTHROPIC_API_KEY ||
                   process.env.CLAUDE_API_KEY || '';
    claudeClient = new ClaudeClient(apiKey);
  }
  return claudeClient;
}

export function initClaudeClient(apiKey: string): ClaudeClient {
  claudeClient = new ClaudeClient(apiKey);
  return claudeClient;
}
