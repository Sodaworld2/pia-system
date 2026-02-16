import { randomUUID } from 'crypto';
export class BaseModule {
    db;
    lastActive = null;
    /** Shared LLM provider — set once via BaseModule.setLLMProvider() */
    static _llmProvider = null;
    /** Inject the LLM provider (called from dao-modules.ts route setup) */
    static setLLMProvider(provider) {
        BaseModule._llmProvider = provider;
    }
    /** Check if LLM is available */
    static get hasLLM() {
        return BaseModule._llmProvider !== null;
    }
    constructor(db) {
        this.db = db;
    }
    // ─── AgentModule interface ───────────────────────────────────────────
    async processMessage(message) {
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
        }
        catch {
            // ai_conversations table may not exist yet — non-fatal
        }
        // Build response — use LLM if available, fallback to template
        const responseContent = await this.buildResponse(message, knowledgeContext);
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
        }
        catch {
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
    async learn(daoId, item) {
        return this.addKnowledge(daoId, item);
    }
    async getKnowledge(daoId, category) {
        let query = this.db('knowledge_items')
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
    async getStatus() {
        return {
            healthy: true,
            version: this.version,
            lastActive: this.lastActive,
        };
    }
    // ─── Protected helpers (used by subclasses) ──────────────────────────
    async getRelevantKnowledge(daoId, _query, limit = 10) {
        const rows = await this.db('knowledge_items')
            .where({ dao_id: daoId, module_id: this.moduleId })
            .where(function () {
            this.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString());
        })
            .orderBy('confidence', 'desc')
            .orderBy('created_at', 'desc')
            .limit(limit);
        return rows.map(row => this.parseKnowledgeRow(row));
    }
    async addKnowledge(daoId, item) {
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
        };
    }
    // ─── Private helpers ─────────────────────────────────────────────────
    async buildResponse(message, knowledgeContext) {
        // If LLM provider is available, use it for intelligent responses
        if (BaseModule._llmProvider) {
            try {
                const fullSystemPrompt = this.systemPrompt + knowledgeContext;
                const llmResponse = await BaseModule._llmProvider(fullSystemPrompt, message.content);
                return llmResponse;
            }
            catch (err) {
                // LLM failed — fall through to template response
                console.error(`[${this.moduleName}] LLM call failed, using template:`, err);
            }
        }
        // Fallback: template response when no LLM is available
        const action = message.context?.action;
        if (action) {
            return `[${this.moduleName} v${this.version}] Processing "${action}" for DAO ${message.dao_id}.${knowledgeContext}\n\n` +
                `Based on the available knowledge, here is my analysis:\n\n` +
                `**Request:** ${message.content.substring(0, 200)}${message.content.length > 200 ? '...' : ''}\n\n` +
                `*Set ANTHROPIC_API_KEY or configure Ollama for intelligent AI responses.*`;
        }
        return `[${this.moduleName} v${this.version}] Received your message.${knowledgeContext}\n\n` +
            `**Your message:** ${message.content.substring(0, 300)}${message.content.length > 300 ? '...' : ''}\n\n` +
            `I have access to ${knowledgeContext ? 'relevant knowledge from the database' : 'no stored knowledge yet'} for this DAO.\n\n` +
            `*Set ANTHROPIC_API_KEY or configure Ollama for intelligent AI responses.*`;
    }
    parseKnowledgeRow(row) {
        return {
            ...row,
            tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags ?? []),
            embedding_vector: row.embedding_vector == null
                ? null
                : typeof row.embedding_vector === 'string'
                    ? JSON.parse(row.embedding_vector)
                    : row.embedding_vector,
        };
    }
}
//# sourceMappingURL=base-module.js.map