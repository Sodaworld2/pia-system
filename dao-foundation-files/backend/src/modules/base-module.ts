import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import type {
  AIModuleId,
  AgentMessage,
  AgentResponse,
  AgentModule,
  KnowledgeItem,
  KnowledgeCategory,
  KnowledgeSource,
} from '../types/foundation';

// ============================================================================
// BaseModule — Foundation for all DAO AI modules
//
// Accepts a Knex instance and implements the AgentModule interface.
// Subclasses set moduleId, moduleName, version, systemPrompt and override
// processMessage() to add module-specific logic.
// ============================================================================

export abstract class BaseModule implements AgentModule {
  abstract readonly moduleId: AIModuleId;
  abstract readonly moduleName: string;
  protected abstract readonly version: string;
  protected abstract readonly systemPrompt: string;

  protected readonly db: Knex;
  private lastActive: string | null = null;

  constructor(db: Knex) {
    this.db = db;
  }

  // ─── AgentModule interface ───────────────────────────────────────────

  async processMessage(message: AgentMessage): Promise<AgentResponse> {
    this.lastActive = new Date().toISOString();

    // Gather relevant knowledge for context
    const knowledge = await this.getRelevantKnowledge(message.dao_id, message.content, 10);

    const knowledgeContext = knowledge.length > 0
      ? '\n\nRelevant knowledge:\n' + knowledge.map(k => `[${k.category}] ${k.title}: ${k.content}`).join('\n')
      : '';

    // Store conversation
    const msgId = randomUUID();
    try {
      await this.db('ai_conversations').insert({
        id: msgId,
        dao_id: message.dao_id,
        module_id: this.moduleId,
        user_id: message.user_id,
        role: 'user',
        content: message.content,
        metadata: JSON.stringify(message.context ?? {}),
        parent_message_id: message.parent_message_id ?? null,
        created_at: new Date().toISOString(),
      });
    } catch {
      // ai_conversations table may not exist yet — non-fatal
    }

    // Build response (no LLM call yet — returns structured context)
    const responseContent = this.buildResponse(message, knowledgeContext);

    // Store assistant response
    try {
      await this.db('ai_conversations').insert({
        id: randomUUID(),
        dao_id: message.dao_id,
        module_id: this.moduleId,
        user_id: 'system',
        role: 'assistant',
        content: responseContent,
        metadata: JSON.stringify({ knowledge_count: knowledge.length }),
        parent_message_id: msgId,
        created_at: new Date().toISOString(),
      });
    } catch {
      // non-fatal
    }

    return {
      content: responseContent,
      module_id: this.moduleId,
      confidence: knowledge.length > 0 ? 0.8 : 0.5,
      knowledge_refs: knowledge.map(k => k.id),
      metadata: {
        knowledge_used: knowledge.length,
        module_version: this.version,
      },
    };
  }

  async learn(
    daoId: string,
    item: Omit<KnowledgeItem, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<KnowledgeItem> {
    return this.addKnowledge(daoId, item);
  }

  async getKnowledge(daoId: string, category?: KnowledgeCategory): Promise<KnowledgeItem[]> {
    let query = this.db<KnowledgeItem>('knowledge_items')
      .where({ dao_id: daoId, module_id: this.moduleId });

    if (category) {
      query = query.where({ category });
    }

    const rows = await query
      .orderBy('confidence', 'desc')
      .orderBy('created_at', 'desc')
      .limit(50);

    return rows.map(row => this.parseKnowledgeRow(row));
  }

  async getStatus(): Promise<{ healthy: boolean; version: string; lastActive: string | null }> {
    return {
      healthy: true,
      version: this.version,
      lastActive: this.lastActive,
    };
  }

  // ─── Protected helpers (used by subclasses) ──────────────────────────

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

    return rows.map(row => this.parseKnowledgeRow(row));
  }

  protected async addKnowledge(
    daoId: string,
    item: Partial<KnowledgeItem> & { category: KnowledgeCategory; title: string; content: string; source: KnowledgeSource | string; created_by: string; tags?: string[] },
  ): Promise<KnowledgeItem> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const record = {
      id,
      dao_id: daoId,
      module_id: this.moduleId,
      category: item.category,
      title: item.title,
      content: item.content,
      source: item.source,
      confidence: item.confidence ?? 1.0,
      tags: JSON.stringify(item.tags ?? []),
      embedding_vector: null,
      created_by: item.created_by,
      expires_at: item.expires_at ?? null,
      created_at: now,
      updated_at: now,
    };

    await this.db('knowledge_items').insert(record);

    return {
      ...record,
      tags: item.tags ?? [],
      embedding_vector: null,
    } as KnowledgeItem;
  }

  // ─── Private helpers ─────────────────────────────────────────────────

  private buildResponse(message: AgentMessage, knowledgeContext: string): string {
    const action = (message.context as Record<string, unknown>)?.action as string | undefined;

    if (action) {
      return `[${this.moduleName} v${this.version}] Processing "${action}" for DAO ${message.dao_id}.${knowledgeContext}\n\n` +
        `Based on the available knowledge, here is my analysis:\n\n` +
        `**Request:** ${message.content.substring(0, 200)}${message.content.length > 200 ? '...' : ''}\n\n` +
        `*This module is ready for LLM integration. Connect an AI provider for intelligent responses.*`;
    }

    return `[${this.moduleName} v${this.version}] Received your message.${knowledgeContext}\n\n` +
      `**Your message:** ${message.content.substring(0, 300)}${message.content.length > 300 ? '...' : ''}\n\n` +
      `I have access to ${knowledgeContext ? 'relevant knowledge from the database' : 'no stored knowledge yet'} for this DAO.\n\n` +
      `*This module is ready for LLM integration. Connect an AI provider for intelligent responses.*`;
  }

  private parseKnowledgeRow(row: KnowledgeItem): KnowledgeItem {
    return {
      ...row,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags as unknown as string) : (row.tags ?? []),
      embedding_vector:
        row.embedding_vector == null
          ? null
          : typeof row.embedding_vector === 'string'
            ? JSON.parse(row.embedding_vector as unknown as string)
            : row.embedding_vector,
    };
  }
}
