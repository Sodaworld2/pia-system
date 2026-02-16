import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, AgentModule, KnowledgeItem, KnowledgeCategory, KnowledgeSource } from '../types/foundation';
/** LLM provider function signature — injected at runtime from PIA's AI system */
export type LLMProvider = (systemPrompt: string, userMessage: string) => Promise<string>;
export declare abstract class BaseModule implements AgentModule {
    abstract readonly moduleId: AIModuleId;
    abstract readonly moduleName: string;
    protected abstract readonly version: string;
    protected abstract readonly systemPrompt: string;
    protected readonly db: Knex;
    private lastActive;
    /** Shared LLM provider — set once via BaseModule.setLLMProvider() */
    private static _llmProvider;
    /** Inject the LLM provider (called from dao-modules.ts route setup) */
    static setLLMProvider(provider: LLMProvider): void;
    /** Check if LLM is available */
    static get hasLLM(): boolean;
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    learn(daoId: string, item: Omit<KnowledgeItem, 'id' | 'created_at' | 'updated_at'>): Promise<KnowledgeItem>;
    getKnowledge(daoId: string, category?: KnowledgeCategory): Promise<KnowledgeItem[]>;
    getStatus(): Promise<{
        healthy: boolean;
        version: string;
        lastActive: string | null;
    }>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    protected addKnowledge(daoId: string, item: Partial<KnowledgeItem> & {
        category: KnowledgeCategory;
        title: string;
        content: string;
        source: KnowledgeSource | string;
        created_by: string;
        tags?: string[];
    }): Promise<KnowledgeItem>;
    private buildResponse;
    private parseKnowledgeRow;
}
//# sourceMappingURL=base-module.d.ts.map