import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
interface VotingParameters {
    quorum_percentage: number;
    approval_threshold: number;
    voting_duration_hours: number;
    voting_delay_hours: number;
    execution_delay_hours: number;
    recommended_model: string;
    rationale: string;
}
interface ProposalAnalysis {
    proposal_id: string;
    impact_assessment: {
        treasury: 'none' | 'low' | 'medium' | 'high';
        governance: 'none' | 'low' | 'medium' | 'high';
        membership: 'none' | 'low' | 'medium' | 'high';
        operations: 'none' | 'low' | 'medium' | 'high';
    };
    pros: string[];
    cons: string[];
    precedents: string[];
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    recommendation: 'support' | 'oppose' | 'abstain' | 'needs_revision';
    analyzed_at: string;
}
interface GovernanceMetrics {
    period: string;
    total_proposals: number;
    passed_proposals: number;
    rejected_proposals: number;
    cancelled_proposals: number;
    average_participation_rate: number;
    average_approval_rate: number;
    unique_voters: number;
    total_votes_cast: number;
    average_voting_duration_hours: number;
    quorum_achievement_rate: number;
    top_proposal_types: Array<{
        type: string;
        count: number;
    }>;
    delegation_stats: {
        total_delegations: number;
        unique_delegators: number;
        unique_delegates: number;
    };
}
interface ConstitutionSection {
    title: string;
    content: string;
    article_number: number;
}
interface ConstitutionDraft {
    preamble: string;
    articles: ConstitutionSection[];
    amendments_process: string;
    ratification_requirements: string;
    effective_date: string;
}
/**
 * The Governance module handles all aspects of DAO decision-making:
 * proposal management, voting mechanisms, quorum rules, delegation,
 * governance parameter tuning, and constitutional frameworks.
 *
 * Knowledge categories used:
 *   - policy     — governance policies, rules, and standing procedures
 *   - decision   — past governance decisions and their outcomes
 *   - precedent  — precedents set by previous proposals and votes
 */
export declare class GovernanceModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Governance";
    protected readonly version = "1.0.0";
    /** Categories this module primarily works with */
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Governance module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help DAO founders, leaders, and members with:\n1. **Governance Structures** \u2014 Design, evaluate, and evolve governance frameworks tailored to the DAO's size, mission, and maturity stage.\n2. **Voting Mechanisms** \u2014 Advise on and configure voting systems including token-weighted voting, quadratic voting, conviction voting, and holographic consensus. Explain trade-offs between plutocratic resistance, sybil resistance, and decision efficiency.\n3. **Proposal Management** \u2014 Guide the full proposal lifecycle from ideation through discussion, voting, execution, and post-mortem. Ensure proposals are well-structured, clearly scoped, and actionable.\n4. **Quorum Rules** \u2014 Recommend and calibrate quorum thresholds based on membership size, proposal importance, historical participation rates, and urgency.\n5. **Delegation** \u2014 Manage vote delegation frameworks including liquid democracy, fixed delegation, and topic-based delegation. Track delegation chains and prevent circular delegations.\n6. **Governance Parameter Tuning** \u2014 Continuously analyse governance health metrics and recommend adjustments to voting periods, quorum requirements, approval thresholds, and proposal submission criteria.\n7. **DAO Constitutions** \u2014 Draft, review, and amend DAO constitutions and charters that codify the organisation's values, decision-making processes, member rights, and amendment procedures.\n\nGovernance principles:\n- Legitimacy derives from broad participation and transparent processes.\n- Favour progressive decentralisation \u2014 start simple, add complexity as the DAO matures.\n- Balance efficiency (speed of decisions) with inclusivity (breadth of input).\n- Every governance parameter should have a clear rationale tied to the DAO's values and goals.\n- Guard against governance attacks: bribery, flash-loan voting, plutocratic capture, and voter apathy.\n- Precedent matters \u2014 reference past decisions to maintain consistency, but allow evolution.\n- Constitutional changes should require higher thresholds than ordinary proposals.\n- Always consider minority protections and dissent mechanisms.\n- Make governance accessible \u2014 plain language, clear timelines, low barriers to participation.\n\nWhen analysing proposals or recommending parameters, always provide:\n- Data-driven rationale (participation rates, historical outcomes, comparable DAOs)\n- Risk assessment (what could go wrong, attack vectors, unintended consequences)\n- Alternative options with trade-off analysis\n\nWhen you learn something new about the DAO's governance decisions, policies, or precedents, explicitly note it so the system can store it as knowledge.\n\nAlways respond in a structured, actionable way. Use markdown formatting.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Deep analysis of a proposal's impact, pros/cons, and comparison
     * against historical precedents and existing governance policies.
     */
    analyzeProposal(daoId: string, userId: string, proposalId: string): Promise<{
        response: AgentResponse;
        analysis: ProposalAnalysis;
    }>;
    /**
     * Suggest optimal voting parameters (quorum, threshold, duration)
     * based on proposal type, membership size, and historical data.
     */
    recommendVotingParameters(daoId: string, userId: string, params: {
        proposalType: string;
        memberCount: number;
    }): Promise<{
        response: AgentResponse;
        parameters: VotingParameters;
    }>;
    /**
     * Generate a comprehensive governance health report covering
     * participation metrics, proposal outcomes, and voter engagement
     * for a specified period.
     */
    generateGovernanceReport(daoId: string, userId: string, params: {
        period: string;
    }): Promise<{
        response: AgentResponse;
        metrics: GovernanceMetrics;
    }>;
    /**
     * Draft or update a DAO constitution or charter that codifies
     * the organisation's governance model, values, decision-making
     * processes, and amendment procedures.
     */
    draftConstitution(daoId: string, userId: string, params: {
        governanceModel: string;
        values: string[];
    }): Promise<{
        response: AgentResponse;
        draft: ConstitutionDraft;
    }>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Lightweight heuristic to detect when a user's message contains
     * hints about policies, decisions, or precedents that should be persisted.
     */
    private extractGovernanceHints;
    /**
     * Extract impact assessment levels from the AI analysis content.
     */
    private extractImpactAssessment;
    /**
     * Extract list items (pros or cons) from the AI analysis content.
     */
    private extractListItems;
    /**
     * Determine the overall risk level from the proposal analysis content.
     */
    private assessProposalRisk;
    /**
     * Extract the recommendation from the AI analysis content.
     */
    private extractRecommendation;
    /**
     * Extract structured voting parameters from the AI response.
     * Falls back to sensible defaults based on proposal type and member count.
     */
    private extractVotingParameters;
    /**
     * Parse the AI-generated constitution content into a structured draft.
     */
    private parseConstitutionDraft;
    /**
     * Parse a human-readable period string into an ISO date string
     * representing the start of the period.
     */
    private parsePeriodStart;
}
export {};
//# sourceMappingURL=governance.d.ts.map