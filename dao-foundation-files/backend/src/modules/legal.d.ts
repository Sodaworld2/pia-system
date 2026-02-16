import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, Agreement, AgreementType, AgreementStatus, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
interface ClauseLibraryEntry {
    id: string;
    name: string;
    category: AgreementType;
    content: string;
    jurisdiction: string;
    last_reviewed: string;
}
interface ComplianceCheck {
    agreement_id: string;
    issues: Array<{
        severity: 'critical' | 'warning' | 'info';
        clause: string;
        description: string;
        recommendation: string;
    }>;
    overall_risk: 'low' | 'medium' | 'high';
    reviewed_at: string;
}
/**
 * The Legal module handles contracts, compliance, agreement lifecycle
 * management, and provides a clause library for DAO agreements.
 *
 * Knowledge categories used:
 *   - contract   — executed or template agreements
 *   - precedent  — legal precedents and past decisions
 *   - terms      — standard terms, clauses, and definitions
 */
export declare class LegalModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Legal";
    protected readonly version = "1.0.0";
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Legal module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help DAO founders, leaders, and members with:\n1. **Agreement Drafting** \u2014 Draft operating agreements, contributor agreements, NDAs, IP assignments, service agreements, and token grants.\n2. **Contract Review** \u2014 Review agreements for completeness, fairness, and potential risks.\n3. **Compliance Guidance** \u2014 Advise on regulatory considerations for DAOs, token distributions, and governance.\n4. **Clause Library** \u2014 Maintain and suggest reusable clauses for common agreement scenarios.\n5. **Agreement Lifecycle** \u2014 Track agreement status from draft through signatures to expiry or termination.\n\nLegal principles:\n- Always include a disclaimer that you provide legal information, NOT legal advice. Users should consult a licensed attorney for their jurisdiction.\n- Be thorough \u2014 flag missing clauses, ambiguous language, and potential risks.\n- Consider multiple jurisdictions when relevant (US, EU, common crypto-friendly jurisdictions).\n- Use plain language explanations alongside any legal terminology.\n- Err on the side of caution \u2014 highlight risks even if they seem unlikely.\n- Reference relevant precedents and standards when available.\n- For token-related agreements, always consider securities law implications.\n\nWhen drafting or reviewing, structure your output with clear sections:\n- Summary / Purpose\n- Key Terms\n- Rights & Obligations\n- Risk Factors\n- Recommended Changes (if reviewing)\n\nIMPORTANT DISCLAIMER: This AI provides legal information for educational purposes only. It does not constitute legal advice. Always consult a qualified attorney for legal decisions.\n\nAlways respond in a structured, detailed way. Use markdown formatting.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Draft a new agreement using AI, the clause library, and existing
     * knowledge about the DAO's legal preferences.
     */
    draftAgreement(daoId: string, userId: string, params: {
        type: AgreementType;
        title: string;
        parties: string[];
        key_terms: Record<string, string>;
        jurisdiction?: string;
    }): Promise<AgentResponse>;
    /**
     * Review an existing agreement for risks, missing clauses, and compliance issues.
     */
    reviewAgreement(daoId: string, userId: string, agreementId: string): Promise<{
        response: AgentResponse;
        compliance: ComplianceCheck;
    }>;
    /**
     * Transition an agreement to a new status with validation.
     */
    transitionAgreementStatus(daoId: string, agreementId: string, newStatus: AgreementStatus, userId: string): Promise<Agreement>;
    /**
     * Retrieve clause templates applicable to a given agreement type.
     * Pulls from knowledge items with category 'terms'.
     */
    getClausesForType(daoId: string, agreementType: AgreementType): Promise<ClauseLibraryEntry[]>;
    /**
     * Add a new clause to the library.
     */
    addClause(daoId: string, userId: string, clause: {
        name: string;
        content: string;
        applicable_types: AgreementType[];
        jurisdiction?: string;
    }): Promise<KnowledgeItem>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Parse the AI review output to extract structured compliance issues.
     * This is a heuristic parser — the AI is prompted to produce structured output,
     * but we handle unstructured responses gracefully.
     */
    private extractComplianceIssues;
    /**
     * Determine the overall risk level from the review content.
     */
    private assessOverallRisk;
}
export {};
//# sourceMappingURL=legal.d.ts.map