/**
 * Grok Client - xAI Integration (Devil's Advocate)
 * Uses Grok for unconventional perspectives and chaos engineering
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('Grok');

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GrokResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: GrokMessage;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type GrokModel = 'grok-4-0709' | 'grok-4-0709-fast';

export class GrokClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.x.ai/v1';
  private defaultModel: GrokModel = 'grok-4-0709';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Check if Grok is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  /**
   * Chat completion
   */
  async chat(
    messages: GrokMessage[],
    model?: GrokModel,
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
          temperature: options?.temperature ?? 0.8,
          max_tokens: options?.maxTokens ?? 4096,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const result = await response.json() as GrokResponse;
      const duration = Date.now() - startTime;
      const tokens = result.usage?.total_tokens || 0;

      logger.info(`Grok chat completed (${modelToUse}, ${duration}ms, ${tokens} tokens)`);

      return result.choices[0]?.message?.content || '';
    } catch (error) {
      logger.error(`Grok chat failed: ${error}`);
      throw error;
    }
  }

  /**
   * Generate text
   */
  async generate(prompt: string, model?: GrokModel): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], model);
  }

  /**
   * Devil's advocate code review
   * Challenges assumptions and finds non-obvious problems
   */
  async devilsAdvocate(code: string, context?: string): Promise<string> {
    const messages: GrokMessage[] = [
      {
        role: 'system',
        content: `You are a devil's advocate code reviewer. Your job is to:

1. **Challenge Assumptions**
   - What assumptions does this code make that might be wrong?
   - What if the happy path isn't the common path?
   - What edge cases are being ignored?

2. **Find Hidden Costs**
   - What's the maintenance burden of this code?
   - What dependencies does it create?
   - What technical debt is being introduced?

3. **Think Laterally**
   - How might this code fail in ways the author didn't anticipate?
   - What could go wrong in production that works in development?
   - What happens when scale increases 10x? 100x?

4. **Be Unconventional**
   - What would a chaos monkey do to this code?
   - How would Murphy's Law manifest here?
   - What's the worst realistic scenario?

Be provocative but constructive. Challenge everything.`,
      },
      {
        role: 'user',
        content: context
          ? `Context: ${context}\n\nChallenge this code:\n\`\`\`\n${code}\n\`\`\``
          : `Challenge this code:\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    return this.chat(messages, undefined, { temperature: 0.9 });
  }

  /**
   * Chaos engineering perspective
   * What could go wrong?
   */
  async chaosAnalysis(code: string): Promise<string> {
    const messages: GrokMessage[] = [
      {
        role: 'system',
        content: `You are a chaos engineer. Your job is to find failure modes.

For this code, identify:

**Network Failures**
- What if the network is slow? Partitioned? Unreliable?

**Resource Exhaustion**
- Memory leaks? CPU spikes? Disk full? File handles?

**Timing Issues**
- Race conditions? Deadlocks? Timeouts?

**Data Corruption**
- What if data is malformed? Missing? Duplicate?

**Dependency Failures**
- What if external services fail? Are slow? Return errors?

**Human Factors**
- What if someone misconfigures this?
- What if someone uses it wrong?

For each failure mode, rate:
- Likelihood (LOW/MEDIUM/HIGH)
- Impact (LOW/MEDIUM/HIGH)
- Detection difficulty (EASY/MEDIUM/HARD)`,
      },
      {
        role: 'user',
        content: `Analyze failure modes:\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    return this.chat(messages, undefined, { temperature: 0.8 });
  }

  /**
   * Creative abuse scenarios
   * How could this be misused?
   */
  async abuseScenarios(code: string): Promise<string> {
    const messages: GrokMessage[] = [
      {
        role: 'system',
        content: `You are a creative security tester. Think of ways this code could be abused.

Consider:
- **Social Engineering**: How could users be tricked?
- **Chain Attacks**: How could multiple small issues combine?
- **Timing Attacks**: Can timing reveal information?
- **Resource Abuse**: Can this be used to DoS?
- **Data Exfiltration**: Can data leak through side channels?
- **Privilege Abuse**: Can legitimate features be misused?

Be creative. Think like a motivated attacker with time and resources.`,
      },
      {
        role: 'user',
        content: `Find abuse scenarios:\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    return this.chat(messages, undefined, { temperature: 0.9 });
  }

  /**
   * YAGNI (You Aren't Gonna Need It) check
   * Is this code over-engineered?
   */
  async yagniCheck(code: string): Promise<string> {
    const prompt = `Analyze this code for over-engineering (YAGNI violations):

\`\`\`
${code}
\`\`\`

Look for:
- Abstractions that serve only one case
- Configuration for things that never change
- Features that anticipate requirements that don't exist
- Complexity without justification
- Premature optimization

Be direct. Is this code simpler than it needs to be, just right, or over-engineered?`;

    return this.generate(prompt, 'grok-4-0709-fast');
  }

  /**
   * Get estimated cost
   */
  getEstimatedCost(inputTokens: number, outputTokens: number, model: GrokModel = 'grok-4-0709'): number {
    // Approximate pricing (xAI pricing)
    const pricing: Record<GrokModel, { input: number; output: number }> = {
      'grok-4-0709': { input: 3.00, output: 15.00 },
      'grok-4-0709-fast': { input: 1.00, output: 5.00 },
    };

    const p = pricing[model];
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }
}

// Singleton
let grokClient: GrokClient | null = null;

export function getGrokClient(): GrokClient {
  if (!grokClient) {
    const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
    grokClient = new GrokClient(apiKey);
  }
  return grokClient;
}

export function initGrokClient(apiKey: string): GrokClient {
  grokClient = new GrokClient(apiKey);
  return grokClient;
}
