/**
 * Ollama Client - FREE Local AI
 * Connects to local Ollama instance for zero-cost AI inference
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('Ollama');

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

export interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export class OllamaClient {
  private baseUrl: string;
  private defaultModel: string;
  private available: boolean = false;

  constructor(
    baseUrl: string = 'http://localhost:11434',
    defaultModel: string = 'qwen2.5-coder:32b'
  ) {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });
      this.available = response.ok;
      return this.available;
    } catch (error) {
      this.available = false;
      logger.debug(`Ollama not available: ${error}`);
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as { models: OllamaModel[] };
      return data.models || [];
    } catch (error) {
      logger.error(`Failed to list models: ${error}`);
      return [];
    }
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(m => m.name === modelName || m.name.startsWith(modelName));
  }

  /**
   * Chat completion (multi-turn conversation)
   */
  async chat(
    messages: OllamaMessage[],
    model?: string,
    options?: OllamaChatRequest['options']
  ): Promise<OllamaChatResponse> {
    const startTime = Date.now();
    const modelToUse = model || this.defaultModel;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          messages,
          stream: false,
          options: options || { temperature: 0.7 },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json() as OllamaChatResponse;
      const duration = Date.now() - startTime;

      logger.info(`Ollama chat completed (${modelToUse}, ${duration}ms, ${result.eval_count || 0} tokens)`);

      return result;
    } catch (error) {
      logger.error(`Ollama chat failed: ${error}`);
      throw error;
    }
  }

  /**
   * Simple text generation (single prompt)
   */
  async generate(
    prompt: string,
    model?: string,
    options?: OllamaGenerateRequest['options']
  ): Promise<OllamaGenerateResponse> {
    const startTime = Date.now();
    const modelToUse = model || this.defaultModel;

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          prompt,
          stream: false,
          options: options || { temperature: 0.7 },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json() as OllamaGenerateResponse;
      const duration = Date.now() - startTime;

      logger.info(`Ollama generate completed (${modelToUse}, ${duration}ms)`);

      return result;
    } catch (error) {
      logger.error(`Ollama generate failed: ${error}`);
      throw error;
    }
  }

  /**
   * Code review using Ollama
   */
  async reviewCode(code: string, context?: string): Promise<string> {
    const messages: OllamaMessage[] = [
      {
        role: 'system',
        content: `You are a code reviewer. Analyze the code for:
- Bugs and potential issues
- Security vulnerabilities
- Performance problems
- Code style and best practices

Be concise and actionable.`,
      },
      {
        role: 'user',
        content: context
          ? `Context: ${context}\n\nCode to review:\n\`\`\`\n${code}\n\`\`\``
          : `Review this code:\n\`\`\`\n${code}\n\`\`\``,
      },
    ];

    const response = await this.chat(messages);
    return response.message.content;
  }

  /**
   * Classify task complexity
   */
  async classifyTask(task: string): Promise<'simple' | 'medium' | 'complex'> {
    const prompt = `Classify this coding task as "simple", "medium", or "complex".

Task: ${task}

Rules:
- simple: typo fixes, variable renames, adding logs, simple edits
- medium: adding functions, refactoring single files, bug fixes
- complex: multi-file changes, architecture decisions, security reviews

Reply with ONLY one word: simple, medium, or complex`;

    try {
      const response = await this.generate(prompt, undefined, { temperature: 0.1 });
      const classification = response.response.toLowerCase().trim();

      if (classification.includes('simple')) return 'simple';
      if (classification.includes('complex')) return 'complex';
      return 'medium';
    } catch {
      // Default to medium if classification fails
      return 'medium';
    }
  }

  /**
   * Get embedding for text (if model supports it)
   */
  async embed(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { embedding: number[] };
      return data.embedding || [];
    } catch (error) {
      logger.error(`Ollama embed failed: ${error}`);
      throw error;
    }
  }

  /**
   * Pull a model if not present
   */
  async pullModel(modelName: string): Promise<boolean> {
    logger.info(`Pulling model: ${modelName}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      logger.info(`Model ${modelName} pulled successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to pull model: ${error}`);
      return false;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  isCurrentlyAvailable(): boolean {
    return this.available;
  }
}

// Singleton instance
let ollamaClient: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!ollamaClient) {
    const endpoint = process.env.OLLAMA_ENDPOINT || process.env.PIA_OLLAMA_URL || 'http://localhost:11434';
    const model = process.env.PRIMARY_CODING_MODEL || 'qwen2.5-coder:32b';
    ollamaClient = new OllamaClient(endpoint, model);
  }
  return ollamaClient;
}

export function initOllamaClient(baseUrl?: string, defaultModel?: string): OllamaClient {
  ollamaClient = new OllamaClient(baseUrl, defaultModel);
  return ollamaClient;
}
