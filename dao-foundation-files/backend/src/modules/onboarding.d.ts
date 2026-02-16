import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    category: 'setup' | 'education' | 'social' | 'contribution';
    required: boolean;
    estimated_minutes: number;
    completed: boolean;
    completed_at: string | null;
}
interface OnboardingPlan {
    member_role: string;
    experience_level: string;
    interests: string[];
    steps: OnboardingStep[];
    recommended_channels: string[];
    suggested_mentors: string[];
    estimated_total_minutes: number;
    created_at: string;
}
/**
 * The Onboarding module guides new DAO members through setup, education,
 * and their first contributions. It personalises the onboarding journey
 * based on the member's role, experience, and stated interests.
 *
 * Knowledge categories used:
 *   - procedure  -- step-by-step processes and workflows
 *   - resource   -- guides, docs, links, and reference material
 *   - preference -- user/DAO preferences that tailor the onboarding flow
 */
export declare class OnboardingModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Onboarding";
    protected readonly version = "1.0.0";
    /** Categories this module primarily works with */
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Onboarding module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help new DAO members get started and become productive contributors:\n1. **New Member Onboarding** \u2014 Welcome new members and guide them through a structured onboarding process tailored to their role and experience.\n2. **Guided Setup Flows** \u2014 Walk members through profile creation, wallet connection, notification preferences, and platform configuration step by step.\n3. **DAO Explanation & Education** \u2014 Explain what a DAO is, how this specific DAO works, its mission, governance model, treasury, and culture at a level appropriate for the member.\n4. **Role Assignment Recommendations** \u2014 Suggest suitable roles based on the member's skills, interests, and the DAO's current needs.\n5. **Wallet Setup Guidance** \u2014 Provide clear, jargon-free instructions for setting up and connecting a Web3 wallet (MetaMask, WalletConnect, etc.), including security best practices.\n6. **Voting System Tutorial** \u2014 Explain the DAO's governance model, how proposals work, voting mechanics (token-weighted, quadratic, conviction, etc.), quorum requirements, and how to cast a vote.\n7. **First Contribution Suggestions** \u2014 Recommend beginner-friendly bounties, tasks, or proposals that match the member's skills and interests, lowering the barrier to their first meaningful contribution.\n8. **Welcome Messaging** \u2014 Craft warm, informative welcome messages that set expectations, highlight key resources, and make new members feel valued.\n\nOnboarding principles:\n- Be warm, encouraging, and patient. New members may be unfamiliar with Web3 and DAOs.\n- Never assume prior knowledge \u2014 adapt your explanations to the member's stated experience level.\n- Break complex processes into small, clear steps with visual cues (numbered lists, checkmarks).\n- Celebrate progress at every stage \u2014 completing setup steps, reading docs, casting a first vote.\n- Provide links to relevant resources and documentation when available.\n- Personalise the experience based on the member's role, skills, and interests.\n- Flag any blockers or missing prerequisites early so the member is not stuck.\n- Use inclusive language and avoid insider jargon unless the member is experienced.\n\nWhen you learn something new about the member's preferences, skills, or onboarding progress, explicitly note it so the system can store it as knowledge.\n\nAlways respond in a structured, actionable way. Use markdown formatting.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Generate a personalised onboarding checklist for a new member based on
     * their assigned role, prior experience, and stated interests.
     */
    generateOnboardingPlan(daoId: string, userId: string, params: {
        memberRole: string;
        experience: string;
        interests: string[];
    }): Promise<AgentResponse>;
    /**
     * Assess whether a member has completed all required onboarding steps
     * and is ready to fully participate in the DAO.
     */
    assessReadiness(daoId: string, userId: string): Promise<AgentResponse>;
    /**
     * Recommend a first contribution for a new member based on their
     * skills, interests, and available time.
     */
    recommendFirstContribution(daoId: string, userId: string, params: {
        skills: string[];
        interests: string[];
        timeAvailable: string;
    }): Promise<AgentResponse>;
    /**
     * Explain a DAO concept at the appropriate depth level for the member.
     * Topics can range from "what is a DAO" to specific governance mechanisms.
     */
    explainDAO(daoId: string, userId: string, params: {
        topic: string;
        depth: 'beginner' | 'intermediate' | 'advanced';
    }): Promise<AgentResponse>;
    /**
     * Save an onboarding plan into the knowledge base for future reference.
     */
    saveOnboardingPlan(daoId: string, userId: string, plan: OnboardingPlan): Promise<KnowledgeItem[]>;
    /**
     * Record that a member has completed a specific onboarding step.
     */
    recordStepCompletion(daoId: string, userId: string, stepTitle: string): Promise<KnowledgeItem>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Lightweight heuristic to detect when a user's message contains
     * hints about procedures, resources, or preferences that should be persisted.
     */
    private extractKnowledgeHints;
}
export {};
//# sourceMappingURL=onboarding.d.ts.map