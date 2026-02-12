import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import type {
  AIModuleId,
  AgentModule,
  AgentMessage,
  AgentResponse,
  KnowledgeItem,
  KnowledgeCategory,
} from '../../../types/foundation';
import bus from '../events/bus';

// ---------------------------------------------------------------------------
// LLM provider abstraction — cost waterfall: Ollama -> Haiku -> Sonnet -> Opus
// ---------------------------------------------------------------------------

export interface LLMRequest {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  context?: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

type LLMProvider = {
  name: string;
  call: (req: LLMRequest) => Promise<LLMResponse>;
};

// ---------------------------------------------------------------------------
// BaseModule — abstract superclass for every AI module
// ---------------------------------------------------------------------------

export abstract class BaseModule implements AgentModule {
  abstract readonly moduleId: AIModuleId;
  abstract readonly moduleName: string;

  /** Each module defines its own system prompt. */
  protected abstract readonly systemPrompt: string;

  /** Module version string, e.g. "1.0.0". */
  protected abstract readonly version: string;

  protected readonly db: Knex;
  private lastActiveAt: string | null = null;

  /** LLM providers in cost-ascending order. Override in tests. */
  protected llmProviders: LLMProvider[] = [];

  constructor(db: Knex) {
    this.db = db;
    this.llmProviders = this.buildDefaultProviders();
  }

  // -----------------------------------------------------------------------
  // AgentModule interface
  // -----------------------------------------------------------------------

  async processMessage(message: AgentMessage): Promise<AgentResponse> {
    this.lastActiveAt = new Date().toISOString();

    const relevantKnowledge = await this.getRelevantKnowledge(
      message.dao_id,
      message.content,
    );

    const knowledgeContext =
      relevantKnowledge.length > 0
        ? `\n\nRelevant knowledge:\n${relevantKnowledge
            .map((k) => `- [${k.category}] ${k.title}: ${k.content}`)
            .join('\n')}`
        : '';

    const llmResult = await this.callLLM({
      systemPrompt: this.systemPrompt + knowledgeContext,
      userMessage: message.content,
      context: message.context,
    });

    // Persist conversation to DB
    const userMsgId = randomUUID();
    const assistantMsgId = randomUUID();

    await this.db('ai_conversations').insert([
      {
        id: userMsgId,
        dao_id: message.dao_id,
        module_id: this.moduleId,
        user_id: message.user_id,
        role: 'user',
        content: message.content,
        metadata: JSON.stringify(message.context ?? {}),
        parent_message_id: message.parent_message_id ?? null,
        created_at: new Date().toISOString(),
      },
      {
        id: assistantMsgId,
        dao_id: message.dao_id,
        module_id: this.moduleId,
        user_id: message.user_id,
        role: 'assistant',
        content: llmResult.content,
        metadata: JSON.stringify({
          provider: llmResult.provider,
          model: llmResult.model,
          inputTokens: llmResult.inputTokens,
          outputTokens: llmResult.outputTokens,
          latencyMs: llmResult.latencyMs,
        }),
        parent_message_id: userMsgId,
        created_at: new Date().toISOString(),
      },
    ]);

    bus.emit({
      type: `module.${this.moduleId}.message`,
      source: this.moduleId,
      dao_id: message.dao_id,
      user_id: message.user_id,
      payload: {
        userMsgId,
        assistantMsgId,
        provider: llmResult.provider,
        model: llmResult.model,
      },
    });

    return this.buildResponse(llmResult, relevantKnowledge);
  }

  async learn(
    daoId: string,
    item: Omit<KnowledgeItem, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<KnowledgeItem> {
    const now = new Date().toISOString();
    const id = randomUUID();

    const record: KnowledgeItem = {
      ...item,
      id,
      created_at: now,
      updated_at: now,
    };

    await this.db('knowledge_items').insert({
      ...record,
      tags: JSON.stringify(record.tags),
      embedding_vector: record.embedding_vector
        ? JSON.stringify(record.embedding_vector)
        : null,
    });

    bus.emit({
      type: `module.${this.moduleId}.knowledge.added`,
      source: this.moduleId,
      dao_id: daoId,
      payload: { knowledgeId: id, category: item.category, title: item.title },
    });

    return record;
  }

  async getKnowledge(
    daoId: string,
    category?: KnowledgeCategory,
  ): Promise<KnowledgeItem[]> {
    const query = this.db<KnowledgeItem>('knowledge_items')
      .where({ dao_id: daoId, module_id: this.moduleId })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString());
      })
      .orderBy('created_at', 'desc');

    if (category) {
      query.andWhere('category', category);
    }

    const rows = await query;
    return rows.map(this.deserializeKnowledgeRow);
  }

  async getStatus(): Promise<{
    healthy: boolean;
    version: string;
    lastActive: string | null;
  }> {
    return {
      healthy: true,
      version: this.version,
      lastActive: this.lastActiveAt,
    };
  }

  // -----------------------------------------------------------------------
  // Protected helpers — available to subclasses
  // -----------------------------------------------------------------------

  /**
   * Call the LLM using the cost waterfall: tries each provider in order
   * (cheapest first) and falls through on failure.
   *
   * Order: Ollama (free, local) -> Haiku -> Sonnet -> Opus
   */
  protected async callLLM(req: LLMRequest): Promise<LLMResponse> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of this.llmProviders) {
      try {
        const result = await provider.call(req);
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ provider: provider.name, error: msg });
        console.warn(
          `[${this.moduleId}] LLM provider "${provider.name}" failed: ${msg} — falling through`,
        );
      }
    }

    throw new Error(
      `All LLM providers failed for module "${this.moduleId}": ${JSON.stringify(errors)}`,
    );
  }

  /**
   * Convenience wrapper around `learn()` that fills in the module_id.
   */
  protected async addKnowledge(
    daoId: string,
    data: {
      category: KnowledgeCategory;
      title: string;
      content: string;
      source: KnowledgeItem['source'];
      confidence?: number;
      tags?: string[];
      created_by: string;
      expires_at?: string | null;
    },
  ): Promise<KnowledgeItem> {
    return this.learn(daoId, {
      dao_id: daoId,
      module_id: this.moduleId,
      category: data.category,
      title: data.title,
      content: data.content,
      source: data.source,
      confidence: data.confidence ?? 1.0,
      tags: data.tags ?? [],
      embedding_vector: null,
      created_by: data.created_by,
      expires_at: data.expires_at ?? null,
    });
  }

  /**
   * Retrieve knowledge items relevant to the current query.
   * Falls back to category-based retrieval; override in subclasses
   * to add embedding-based similarity search.
   */
  protected async getRelevantKnowledge(
    daoId: string,
    _query: string,
    limit = 10,
  ): Promise<KnowledgeItem[]> {
    const rows = await this.db<KnowledgeItem>('knowledge_items')
      .where({ dao_id: daoId, module_id: this.moduleId })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString());
      })
      .orderBy('confidence', 'desc')
      .orderBy('created_at', 'desc')
      .limit(limit);

    return rows.map(this.deserializeKnowledgeRow);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildResponse(
    llm: LLMResponse,
    knowledge: KnowledgeItem[],
  ): AgentResponse {
    return {
      content: llm.content,
      module_id: this.moduleId,
      confidence: 0.85, // subclasses can override with a smarter calculation
      knowledge_refs: knowledge.map((k) => k.id),
      metadata: {
        provider: llm.provider,
        model: llm.model,
        latencyMs: llm.latencyMs,
      },
    };
  }

  private deserializeKnowledgeRow(row: Record<string, unknown>): KnowledgeItem {
    return {
      ...(row as unknown as KnowledgeItem),
      tags:
        typeof row.tags === 'string' ? JSON.parse(row.tags as string) : (row.tags as string[]),
      embedding_vector:
        row.embedding_vector == null
          ? null
          : typeof row.embedding_vector === 'string'
            ? JSON.parse(row.embedding_vector as string)
            : (row.embedding_vector as number[]),
    };
  }

  /**
   * Build the default provider waterfall.
   * Each provider stub logs the attempt; real implementations would call
   * the actual APIs. Override this in integration tests.
   */
  private buildDefaultProviders(): LLMProvider[] {
    return [
      {
        name: 'ollama',
        call: async (req: LLMRequest): Promise<LLMResponse> => {
          const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
          const model = process.env.OLLAMA_MODEL ?? 'llama3';

          const start = Date.now();
          const response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: req.systemPrompt },
                { role: 'user', content: req.userMessage },
              ],
              stream: false,
              options: {
                temperature: req.temperature ?? 0.7,
                num_predict: req.maxTokens ?? 2048,
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`Ollama returned ${response.status}`);
          }

          const data = (await response.json()) as {
            message?: { content?: string };
            eval_count?: number;
            prompt_eval_count?: number;
          };

          return {
            content: data.message?.content ?? '',
            provider: 'ollama',
            model,
            inputTokens: data.prompt_eval_count ?? 0,
            outputTokens: data.eval_count ?? 0,
            latencyMs: Date.now() - start,
          };
        },
      },
      {
        name: 'haiku',
        call: async (req: LLMRequest): Promise<LLMResponse> => {
          return this.callAnthropic(req, 'claude-3-5-haiku-20241022', 'haiku');
        },
      },
      {
        name: 'sonnet',
        call: async (req: LLMRequest): Promise<LLMResponse> => {
          return this.callAnthropic(req, 'claude-sonnet-4-20250514', 'sonnet');
        },
      },
      {
        name: 'opus',
        call: async (req: LLMRequest): Promise<LLMResponse> => {
          return this.callAnthropic(req, 'claude-opus-4-20250514', 'opus');
        },
      },
    ];
  }

  /**
   * Shared Anthropic Messages API caller used by haiku/sonnet/opus providers.
   */
  private async callAnthropic(
    req: LLMRequest,
    model: string,
    label: string,
  ): Promise<LLMResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(`ANTHROPIC_API_KEY not set — skipping ${label}`);
    }

    const start = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature ?? 0.7,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userMessage }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic ${label} returned ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    return {
      content: data.content?.[0]?.text ?? '',
      provider: `anthropic-${label}`,
      model,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      latencyMs: Date.now() - start,
    };
  }
}
