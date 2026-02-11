/**
 * OpenAI Client - GPT-4 / o3 Integration
 * Uses OpenAI for deep reasoning and code analysis
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('OpenAI');

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: OpenAIMessage;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type OpenAIModel = 'gpt-4.1' | 'gpt-4.1-mini' | 'o3' | 'o3-mini' | 'o3-pro';

export class OpenAIClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1';
  private defaultModel: OpenAIModel = 'gpt-4.1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Check if OpenAI is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.startsWith('sk-');
  }

  /**
   * Chat completion
   */
  async chat(
    messages: OpenAIMessage[],
    model?: OpenAIModel,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const startTime = Date.now();
    const modelToUse = model || this.defaultModel;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const result = await response.json() as OpenAIResponse;
      const duration = Date.now() - startTime;
      const tokens = result.usage?.total_tokens || 0;

      logger.info(`OpenAI chat completed (${modelToUse}, ${duration}ms, ${tokens} tokens)`);

      return result.choices[0]?.message?.content || '';
    } catch (error) {
      logger.error(`OpenAI chat failed: ${error}`);
      throw error;
    }
  }

  /**
   * Generate text
   */
  async generate(prompt: string, model?: OpenAIModel): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], model);
  }

  /**
   * Code review with adversarial security focus
   */
  async reviewCode(
    code: string,
    focus: 'security' | 'logic' | 'performance' | 'general' = 'general'
  ): Promise<string> {
    const systemPrompts: Record<string, string> = {
      security: `You are a security-focused code reviewer. Think like an attacker.
For each piece of code, ask:
- How can this be exploited?
- What trust boundaries are crossed?
- What happens with malicious input?
- Are there OWASP Top 10 vulnerabilities?`,
      logic: `You are a logic-focused code reviewer.
Analyze:
- Control flow and edge cases
- Error handling completeness
- Race conditions and concurrency issues
- State management correctness`,
      performance: `You are a performance-focused code reviewer.
Look for:
- N+1 query problems
- Memory leaks
- Unnecessary allocations
- Blocking operations
- Caching opportunities`,
      general: `You are a thorough code reviewer.
Check for bugs, security issues, performance problems, and best practice violations.`,
    };

    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompts[focus] },
      {
        role: 'user',
        content: `Review this code:\n\`\`\`\n${code}\n\`\`\`\n\nProvide specific issues with line numbers where possible.`,
      },
    ];

    // Use o3 for security reviews (deeper reasoning)
    const model = focus === 'security' ? 'o3' : this.defaultModel;
    return this.chat(messages, model, { temperature: 0.3 });
  }

  /**
   * Deep reasoning task (uses o3)
   */
  async reason(prompt: string, context?: string): Promise<string> {
    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: 'Think step by step. Consider multiple perspectives. Identify assumptions and validate them.',
      },
      {
        role: 'user',
        content: context ? `Context: ${context}\n\nQuestion: ${prompt}` : prompt,
      },
    ];

    return this.chat(messages, 'o3', { temperature: 0.5 });
  }

  /**
   * Red team analysis (security attack perspective)
   */
  async redTeam(code: string): Promise<string> {
    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: `You are a red team security analyst. Your job is to find ways to exploit this code.

Think creatively about:
1. Input manipulation attacks
2. Race conditions
3. Resource exhaustion
4. Authentication bypasses
5. Privilege escalation
6. Data exfiltration

For each vulnerability, provide:
- Attack vector
- Impact
- Proof of concept (if applicable)
- Remediation`,
      },
      {
        role: 'user',
        content: `Find vulnerabilities in this code:\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    return this.chat(messages, 'o3', { temperature: 0.7 });
  }

  /**
   * Get estimated cost for a response
   */
  getEstimatedCost(inputTokens: number, outputTokens: number, model: OpenAIModel = 'gpt-4.1'): number {
    // Approximate pricing
    const pricing: Record<OpenAIModel, { input: number; output: number }> = {
      'gpt-4.1': { input: 2.50, output: 10.00 },
      'gpt-4.1-mini': { input: 0.15, output: 0.60 },
      'o3': { input: 10.00, output: 40.00 },
      'o3-mini': { input: 1.10, output: 4.40 },
      'o3-pro': { input: 20.00, output: 80.00 },
    };

    const p = pricing[model];
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }
}

// Singleton
let openaiClient: OpenAIClient | null = null;

export function getOpenAIClient(): OpenAIClient {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    openaiClient = new OpenAIClient(apiKey);
  }
  return openaiClient;
}

export function initOpenAIClient(apiKey: string): OpenAIClient {
  openaiClient = new OpenAIClient(apiKey);
  return openaiClient;
}
