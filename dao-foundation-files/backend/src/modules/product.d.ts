import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
/**
 * The Product module provides product management guidance including feature
 * prioritization (RICE, MoSCoW), roadmap planning, user research synthesis,
 * competitive analysis, product metrics tracking, sprint planning, backlog
 * management, and technical debt assessment for DAO teams.
 *
 * Knowledge categories used:
 *   - goal     — product goals, vision, and strategic objectives
 *   - resource — team capacity, budgets, and available tools
 *   - metric   — product KPIs, usage data, and performance indicators
 */
export declare class ProductModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Product";
    protected readonly version = "1.0.0";
    /** Categories this module primarily works with */
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Product module for a DAO (Decentralised Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help DAO founders, leaders, and members with:\n1. **Product Strategy** \u2014 Define and refine the product vision, mission, and strategic direction aligned with the DAO's goals.\n2. **Roadmap Planning** \u2014 Build time-bound roadmaps organised by themes, with clear milestones, deliverables, and dependencies.\n3. **Feature Prioritization** \u2014 Apply frameworks like RICE (Reach, Impact, Confidence, Effort) and MoSCoW (Must, Should, Could, Won't) to objectively rank features and initiatives.\n4. **User Research Synthesis** \u2014 Distil user interviews, surveys, and feedback into actionable insights and validated personas.\n5. **Competitive Analysis** \u2014 Map the competitive landscape, identify differentiators, and spot opportunities or threats.\n6. **Product Metrics** \u2014 Track and interpret key product metrics including MAU (Monthly Active Users), retention rates, NPS (Net Promoter Score), activation rates, churn, and engagement depth.\n7. **Sprint Planning** \u2014 Help teams scope sprints based on capacity, priority, and dependencies, ensuring a healthy mix of feature work, bugs, and tech debt.\n8. **Backlog Management** \u2014 Keep the backlog groomed, well-structured, and aligned with strategic themes. Identify stale items and duplicates.\n9. **Technical Debt Assessment** \u2014 Evaluate the cost and risk of accumulated technical debt and recommend a sustainable paydown strategy.\n\nProduct management principles:\n- Always ground recommendations in data and user evidence when available.\n- Balance short-term delivery with long-term product health.\n- Make trade-offs explicit \u2014 every \"yes\" to a feature implies a \"not now\" to something else.\n- Use prioritization frameworks consistently to reduce bias.\n- Consider the DAO's phase (inception, formation, operating, scaling) when advising on scope and ambition.\n- Champion the user's perspective while respecting engineering constraints.\n- Quantify impact where possible \u2014 use metrics, estimates, and benchmarks.\n- Encourage iterative delivery: ship small, learn fast, adapt.\n- Flag technical debt proactively and integrate paydown into regular planning.\n- Tailor communication to the audience \u2014 strategic for leadership, tactical for execution teams.\n\nWhen you learn something new about the DAO's product goals, available resources, or metrics, explicitly note it so the system can store it as knowledge.\n\nAlways respond in a structured, actionable way. Use markdown formatting.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Prioritize a list of features using RICE scoring.
     *
     * RICE = (Reach * Impact * Confidence) / Effort
     *
     * The LLM evaluates each feature against the DAO's known goals and
     * resources to produce numeric RICE components, a composite score,
     * a rank ordering, and a recommendation for each feature.
     */
    prioritizeFeatures(daoId: string, userId: string, features: Array<{
        name: string;
        description: string;
        effort: string;
        impact: string;
    }>): Promise<AgentResponse>;
    /**
     * Generate a product roadmap organized by themes across a given time horizon.
     */
    generateRoadmap(daoId: string, userId: string, params: {
        horizon: string;
        themes: string[];
        constraints: string[];
    }): Promise<AgentResponse>;
    /**
     * Analyze product metrics for a given period, identifying trends,
     * anomalies, and actionable recommendations.
     */
    analyzeMetrics(daoId: string, userId: string, params: {
        metrics: Record<string, number>;
        period: string;
    }): Promise<AgentResponse>;
    /**
     * Assist with sprint planning by recommending commitment levels,
     * item selection, stretch goals, and risk identification.
     */
    planSprint(daoId: string, userId: string, params: {
        sprintNumber: number;
        capacity: number;
        backlogItems: string[];
    }): Promise<AgentResponse>;
    /**
     * Save a set of product metrics into the knowledge base for
     * historical tracking and future analysis.
     */
    saveMetrics(daoId: string, userId: string, metrics: Record<string, number>, period: string): Promise<KnowledgeItem[]>;
    /**
     * Save a product goal into the knowledge base.
     */
    saveProductGoal(daoId: string, userId: string, goal: {
        title: string;
        description: string;
        target_date?: string;
        tags?: string[];
    }): Promise<KnowledgeItem>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Lightweight heuristic to detect when a user's message contains
     * hints about product goals, resources, or metrics that should be persisted.
     */
    private extractKnowledgeHints;
}
//# sourceMappingURL=product.d.ts.map