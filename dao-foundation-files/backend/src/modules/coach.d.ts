import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
interface OKR {
    objective: string;
    keyResults: Array<{
        description: string;
        target: number;
        current: number;
        unit: string;
    }>;
    quarter: string;
    status: 'on_track' | 'at_risk' | 'behind';
}
interface Milestone {
    title: string;
    description: string;
    due_date: string;
    dependencies: string[];
    completed: boolean;
}
interface CoachingPlan {
    goals: string[];
    okrs: OKR[];
    milestones: Milestone[];
    strengths: string[];
    areas_for_growth: string[];
    next_actions: string[];
}
/**
 * The Coach module provides strategy guidance, goal-setting via OKRs,
 * milestone planning, and ongoing performance coaching for DAO members
 * and the DAO as a whole.
 *
 * Knowledge categories used:
 *   - goal       — strategic goals and objectives
 *   - strength   — identified strengths of the DAO or its members
 *   - preference — user/DAO preferences that inform coaching style
 */
export declare class CoachModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Coach";
    protected readonly version = "1.0.0";
    /** Categories this module primarily works with */
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Coach module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help DAO founders, leaders, and members with:\n1. **Strategy & Vision** \u2014 Clarify the DAO's mission, vision, and strategic direction.\n2. **OKR Tracking** \u2014 Help define Objectives and Key Results, track progress, and adjust when needed.\n3. **Milestone Planning** \u2014 Break large goals into achievable milestones with clear deliverables and timelines.\n4. **Performance Coaching** \u2014 Identify strengths, growth areas, and provide actionable feedback.\n5. **Decision Support** \u2014 Help weigh options, consider trade-offs, and think through consequences.\n\nCoaching principles:\n- Ask clarifying questions before giving advice.\n- Be direct and honest, but constructive.\n- Ground recommendations in the DAO's stated goals and values.\n- Use frameworks (OKR, SMART goals, SWOT) when they add clarity.\n- Celebrate wins and progress, not just outcomes.\n- Tailor your communication style to the user's preferences when known.\n\nWhen you learn something new about the DAO's goals, strengths, or preferences, explicitly note it so the system can store it as knowledge.\n\nAlways respond in a structured, actionable way. Use markdown formatting.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Generate or update an OKR set for a DAO based on its current goals
     * and the provided strategic context.
     */
    generateOKRs(daoId: string, userId: string, context: {
        quarter: string;
        focus_areas: string[];
    }): Promise<AgentResponse>;
    /**
     * Build a milestone plan for a specific objective.
     */
    planMilestones(daoId: string, userId: string, objective: string, timeframeWeeks: number): Promise<AgentResponse>;
    /**
     * Run a SWOT analysis for the DAO based on accumulated knowledge.
     */
    swotAnalysis(daoId: string, userId: string): Promise<AgentResponse>;
    /**
     * Save a coaching plan into the knowledge base.
     */
    saveCoachingPlan(daoId: string, userId: string, plan: CoachingPlan): Promise<KnowledgeItem[]>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Lightweight heuristic to detect when a user's message contains
     * hints about goals, strengths, or preferences that should be persisted.
     */
    private extractKnowledgeHints;
}
export {};
//# sourceMappingURL=coach.d.ts.map