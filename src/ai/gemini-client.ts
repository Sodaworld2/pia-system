/**
 * Gemini Client - Google AI Integration
 * Uses Google's Gemini Pro for code review and analysis
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('Gemini');

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
      role: string;
    };
    finishReason: string;
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export type ThinkingLevel = 'low' | 'medium' | 'high';

export class GeminiClient {
  private apiKey: string;
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta';
  private defaultModel: string = 'gemini-1.5-pro';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Check if Gemini is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== 'your-gemini-api-key';
  }

  /**
   * Generate content with Gemini
   */
  async generate(
    prompt: string,
    model?: string,
    thinkingLevel: ThinkingLevel = 'medium'
  ): Promise<string> {
    const startTime = Date.now();
    const modelToUse = model || this.defaultModel;

    // Adjust system instruction based on thinking level
    const systemInstructions: Record<ThinkingLevel, string> = {
      low: 'Be concise and direct.',
      medium: 'Provide balanced analysis with key points.',
      high: 'Think deeply and provide comprehensive analysis with reasoning.',
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${modelToUse}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            systemInstruction: {
              parts: [{ text: systemInstructions[thinkingLevel] }],
            },
            generationConfig: {
              temperature: thinkingLevel === 'high' ? 0.7 : 0.4,
              maxOutputTokens: thinkingLevel === 'high' ? 4096 : 2048,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const result = await response.json() as GeminiResponse;
      const duration = Date.now() - startTime;
      const tokens = result.usageMetadata?.totalTokenCount || 0;

      logger.info(`Gemini generate completed (${modelToUse}, ${duration}ms, ${tokens} tokens)`);

      return result.candidates[0]?.content?.parts[0]?.text || '';
    } catch (error) {
      logger.error(`Gemini generate failed: ${error}`);
      throw error;
    }
  }

  /**
   * Chat conversation with Gemini
   */
  async chat(
    messages: GeminiMessage[],
    model?: string,
    thinkingLevel: ThinkingLevel = 'medium'
  ): Promise<string> {
    const startTime = Date.now();
    const modelToUse = model || this.defaultModel;

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${modelToUse}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: messages,
            generationConfig: {
              temperature: thinkingLevel === 'high' ? 0.7 : 0.4,
              maxOutputTokens: 4096,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const result = await response.json() as GeminiResponse;
      const duration = Date.now() - startTime;

      logger.info(`Gemini chat completed (${modelToUse}, ${duration}ms)`);

      return result.candidates[0]?.content?.parts[0]?.text || '';
    } catch (error) {
      logger.error(`Gemini chat failed: ${error}`);
      throw error;
    }
  }

  /**
   * Analyze code for patterns, structure, and best practices
   */
  async analyzeCode(
    code: string,
    focus: 'architecture' | 'patterns' | 'security' | 'general' = 'general'
  ): Promise<string> {
    const focusPrompts: Record<string, string> = {
      architecture: `Analyze this code from an ARCHITECTURE perspective:
- Is the structure sound?
- Are components properly separated?
- Is coupling appropriate?
- Are there extensibility concerns?`,
      patterns: `Analyze this code for DESIGN PATTERNS:
- Which patterns are used?
- Are they applied correctly?
- What patterns might improve this code?`,
      security: `Analyze this code for SECURITY:
- Input validation issues
- Injection vulnerabilities
- Authentication/authorization problems
- Sensitive data exposure
- OWASP Top 10 concerns`,
      general: `Analyze this code for:
- Bugs and issues
- Performance concerns
- Code quality
- Best practices`,
    };

    const prompt = `${focusPrompts[focus]}

Code:
\`\`\`
${code}
\`\`\`

Provide specific, actionable findings.`;

    return this.generate(prompt, undefined, focus === 'security' ? 'high' : 'medium');
  }

  /**
   * Review code changes (diff)
   */
  async reviewDiff(diff: string, context?: string): Promise<string> {
    const prompt = `Review this code diff for potential issues:

${context ? `Context: ${context}\n\n` : ''}Diff:
\`\`\`diff
${diff}
\`\`\`

Look for:
1. Breaking changes
2. Security implications
3. Performance impacts
4. Missing error handling
5. Incomplete changes

Format: List issues with severity (HIGH/MEDIUM/LOW)`;

    return this.generate(prompt, undefined, 'high');
  }

  /**
   * Get estimated cost for a response
   */
  getEstimatedCost(inputTokens: number, outputTokens: number): number {
    // Gemini 1.5 Pro pricing (approximate)
    const inputCostPer1M = 1.25;  // $1.25 per 1M input tokens
    const outputCostPer1M = 5.00; // $5.00 per 1M output tokens

    return (inputTokens / 1_000_000) * inputCostPer1M +
           (outputTokens / 1_000_000) * outputCostPer1M;
  }
}

// Singleton
let geminiClient: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    geminiClient = new GeminiClient(apiKey);
  }
  return geminiClient;
}

export function initGeminiClient(apiKey: string): GeminiClient {
  geminiClient = new GeminiClient(apiKey);
  return geminiClient;
}
