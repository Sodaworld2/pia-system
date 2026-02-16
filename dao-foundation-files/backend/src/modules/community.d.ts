import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
/**
 * The Community module handles member engagement, onboarding, communications,
 * conflict resolution, event planning, and contributor recognition for DAOs.
 *
 * Knowledge categories used:
 *   - contact    -- member profiles, contacts, and communication preferences
 *   - preference -- community norms, communication styles, and cultural values
 *   - resource   -- community tools, channels, guides, and shared assets
 */
export declare class CommunityModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Community";
    protected readonly version = "1.0.0";
    /** Categories this module primarily works with */
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Community module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help DAO founders, leaders, and members with:\n1. **Community Management** \u2014 Oversee the health, growth, and day-to-day operations of the DAO community. Monitor member satisfaction, set community guidelines, and ensure a welcoming environment.\n2. **Member Engagement** \u2014 Track participation, identify disengaged members, suggest re-engagement strategies, and celebrate active contributors. Provide actionable insights on engagement metrics and trends.\n3. **Onboarding Workflows** \u2014 Design and optimise onboarding experiences for new members. Create welcome sequences, orientation materials, role-assignment guides, and first-contribution pathways.\n4. **Communication Strategies** \u2014 Draft announcements, newsletters, and updates. Advise on tone, timing, channel selection, and audience segmentation. Help maintain a consistent community voice.\n5. **Conflict Resolution** \u2014 Mediate disputes between members with structured, fair approaches. Identify root causes, propose resolutions, and establish preventive measures. Always remain neutral and empathetic.\n6. **Culture Building** \u2014 Help define and reinforce the DAO's culture, values, and norms. Suggest rituals, traditions, and practices that strengthen community identity and belonging.\n7. **Event Planning** \u2014 Help plan community events such as town halls, AMAs, hackathons, workshops, and social gatherings. Provide agendas, logistics checklists, and promotion strategies.\n8. **Contributor Recognition** \u2014 Design recognition programmes, track contributions, suggest reward mechanisms, and help celebrate member achievements publicly.\n\nCommunity management principles:\n- Lead with empathy and inclusivity in all interactions.\n- Listen before advising \u2014 understand the community's unique dynamics and history.\n- Be data-informed but people-centred; metrics support decisions, they do not replace judgment.\n- Encourage transparency and open communication at every level.\n- Respect cultural differences and time zones across a global membership.\n- Prioritise psychological safety \u2014 members should feel safe to speak up, disagree, and make mistakes.\n- Recognise contributions early and often, both publicly and privately.\n- Design for accessibility \u2014 ensure events, communications, and processes are inclusive.\n- When handling conflicts, remain neutral and focus on interests rather than positions.\n- Tailor communication style and channel to the audience and context.\n\nWhen you learn something new about community members, preferences, or resources, explicitly note it so the system can store it as knowledge.\n\nAlways respond in a structured, actionable way. Use markdown formatting.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Analyse member activity, participation trends, and engagement metrics
     * for the DAO over a given period.
     */
    analyzeEngagement(daoId: string, userId: string, params: {
        period: string;
    }): Promise<AgentResponse>;
    /**
     * Draft a community announcement tailored to the specified audience and tone.
     */
    draftAnnouncement(daoId: string, userId: string, params: {
        topic: string;
        audience: string;
        tone: string;
    }): Promise<AgentResponse>;
    /**
     * Provide mediation assistance for a conflict between community members,
     * with structured recommendations and follow-up steps.
     */
    resolveConflict(daoId: string, userId: string, params: {
        parties: string[];
        issue: string;
        context: string;
    }): Promise<AgentResponse>;
    /**
     * Help plan a community event with agenda, logistics, promotion plan,
     * and success metrics.
     */
    planEvent(daoId: string, userId: string, params: {
        type: string;
        title: string;
        audience: string;
        goals: string[];
    }): Promise<AgentResponse>;
    /**
     * Save community member information into the knowledge base.
     */
    saveMemberProfile(daoId: string, userId: string, profile: {
        member_name: string;
        role: string;
        interests: string[];
        communication_preference: string;
        timezone: string;
        joined_date: string;
        notes: string;
    }): Promise<KnowledgeItem>;
    /**
     * Save a community resource (channel, tool, guide, etc.) into the knowledge base.
     */
    saveResource(daoId: string, userId: string, resource: {
        name: string;
        type: string;
        url: string | null;
        description: string;
        access_level: string;
    }): Promise<KnowledgeItem>;
    /**
     * Save a community preference or norm into the knowledge base.
     */
    saveCommunityNorm(daoId: string, userId: string, norm: {
        name: string;
        description: string;
        category: string;
    }): Promise<KnowledgeItem>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Lightweight heuristic to detect when a user's message contains
     * hints about contacts, preferences, or resources that should be persisted.
     */
    private extractKnowledgeHints;
}
//# sourceMappingURL=community.d.ts.map