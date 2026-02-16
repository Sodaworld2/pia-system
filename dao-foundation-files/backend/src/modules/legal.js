import { BaseModule } from './base-module';
import bus from '../events/bus';
// ---------------------------------------------------------------------------
// Legal Module
// ---------------------------------------------------------------------------
/**
 * The Legal module handles contracts, compliance, agreement lifecycle
 * management, and provides a clause library for DAO agreements.
 *
 * Knowledge categories used:
 *   - contract   — executed or template agreements
 *   - precedent  — legal precedents and past decisions
 *   - terms      — standard terms, clauses, and definitions
 */
export class LegalModule extends BaseModule {
    moduleId = 'legal';
    moduleName = 'Legal';
    version = '1.0.0';
    coreCategories = [
        'contract',
        'precedent',
        'terms',
    ];
    systemPrompt = `You are the Legal module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.

Your role is to help DAO founders, leaders, and members with:
1. **Agreement Drafting** — Draft operating agreements, contributor agreements, NDAs, IP assignments, service agreements, and token grants.
2. **Contract Review** — Review agreements for completeness, fairness, and potential risks.
3. **Compliance Guidance** — Advise on regulatory considerations for DAOs, token distributions, and governance.
4. **Clause Library** — Maintain and suggest reusable clauses for common agreement scenarios.
5. **Agreement Lifecycle** — Track agreement status from draft through signatures to expiry or termination.

Legal principles:
- Always include a disclaimer that you provide legal information, NOT legal advice. Users should consult a licensed attorney for their jurisdiction.
- Be thorough — flag missing clauses, ambiguous language, and potential risks.
- Consider multiple jurisdictions when relevant (US, EU, common crypto-friendly jurisdictions).
- Use plain language explanations alongside any legal terminology.
- Err on the side of caution — highlight risks even if they seem unlikely.
- Reference relevant precedents and standards when available.
- For token-related agreements, always consider securities law implications.

When drafting or reviewing, structure your output with clear sections:
- Summary / Purpose
- Key Terms
- Rights & Obligations
- Risk Factors
- Recommended Changes (if reviewing)

IMPORTANT DISCLAIMER: This AI provides legal information for educational purposes only. It does not constitute legal advice. Always consult a qualified attorney for legal decisions.

Always respond in a structured, detailed way. Use markdown formatting.`;
    constructor(db) {
        super(db);
    }
    // -----------------------------------------------------------------------
    // Override processMessage to add legal-specific enrichment
    // -----------------------------------------------------------------------
    async processMessage(message) {
        const response = await super.processMessage(message);
        // Always append the legal disclaimer
        response.content += '\n\n---\n*Disclaimer: This is legal information, not legal advice. Consult a licensed attorney for decisions specific to your situation and jurisdiction.*';
        // Add legal-specific actions
        response.actions = response.actions ?? [];
        response.actions.push({
            type: 'draft_agreement',
            label: 'Draft a new agreement',
            payload: { dao_id: message.dao_id },
        }, {
            type: 'review_agreement',
            label: 'Review an existing agreement',
            payload: { dao_id: message.dao_id },
        }, {
            type: 'compliance_check',
            label: 'Run compliance check',
            payload: { dao_id: message.dao_id },
        });
        return response;
    }
    // -----------------------------------------------------------------------
    // Agreement Lifecycle Methods
    // -----------------------------------------------------------------------
    /**
     * Draft a new agreement using AI, the clause library, and existing
     * knowledge about the DAO's legal preferences.
     */
    async draftAgreement(daoId, userId, params) {
        const clauses = await this.getClausesForType(daoId, params.type);
        const precedents = await this.getKnowledge(daoId, 'precedent');
        const terms = await this.getKnowledge(daoId, 'terms');
        const clauseSummary = clauses
            .map((c) => `[${c.name}]: ${c.content.substring(0, 200)}...`)
            .join('\n\n');
        const precedentSummary = precedents
            .map((p) => `- ${p.title}: ${p.content}`)
            .join('\n');
        const termsSummary = terms
            .map((t) => `- ${t.title}: ${t.content}`)
            .join('\n');
        return this.processMessage({
            content: [
                `Draft a ${params.type.replace(/_/g, ' ')} titled "${params.title}".`,
                '',
                `Parties: ${params.parties.join(', ')}`,
                `Jurisdiction: ${params.jurisdiction ?? 'To be determined'}`,
                '',
                'Key terms:',
                ...Object.entries(params.key_terms).map(([k, v]) => `- ${k}: ${v}`),
                '',
                'Available clause templates:',
                clauseSummary || '(none yet)',
                '',
                'Relevant precedents:',
                precedentSummary || '(none yet)',
                '',
                'Standard terms:',
                termsSummary || '(none yet)',
                '',
                'Please draft a complete agreement in markdown. Include all standard sections: parties, recitals, definitions, terms, representations, warranties, termination, dispute resolution, and signature blocks.',
            ].join('\n'),
            dao_id: daoId,
            user_id: userId,
            context: { action: 'draft_agreement', params },
        });
    }
    /**
     * Review an existing agreement for risks, missing clauses, and compliance issues.
     */
    async reviewAgreement(daoId, userId, agreementId) {
        const agreement = await this.db('agreements')
            .where({ id: agreementId, dao_id: daoId })
            .first();
        if (!agreement) {
            throw new Error(`Agreement ${agreementId} not found in DAO ${daoId}`);
        }
        const aiResponse = await this.processMessage({
            content: [
                `Review the following ${agreement.type.replace(/_/g, ' ')} for completeness, risks, and compliance:`,
                '',
                `Title: ${agreement.title}`,
                `Type: ${agreement.type}`,
                `Status: ${agreement.status}`,
                `Version: ${agreement.version}`,
                '',
                '--- AGREEMENT CONTENT ---',
                agreement.content_markdown,
                '--- END CONTENT ---',
                '',
                'Please provide:',
                '1. A summary of the agreement',
                '2. Identified risks (critical, warning, info)',
                '3. Missing or incomplete clauses',
                '4. Compliance considerations',
                '5. Recommended changes',
            ].join('\n'),
            dao_id: daoId,
            user_id: userId,
            context: { action: 'review_agreement', agreementId },
        });
        // Build a structured compliance check from the review
        const compliance = {
            agreement_id: agreementId,
            issues: this.extractComplianceIssues(aiResponse.content),
            overall_risk: this.assessOverallRisk(aiResponse.content),
            reviewed_at: new Date().toISOString(),
        };
        bus.emit({
            type: 'module.legal.agreement.reviewed',
            source: 'legal',
            dao_id: daoId,
            user_id: userId,
            payload: {
                agreementId,
                overallRisk: compliance.overall_risk,
                issueCount: compliance.issues.length,
            },
        });
        return { response: aiResponse, compliance };
    }
    /**
     * Transition an agreement to a new status with validation.
     */
    async transitionAgreementStatus(daoId, agreementId, newStatus, userId) {
        const agreement = await this.db('agreements')
            .where({ id: agreementId, dao_id: daoId })
            .first();
        if (!agreement) {
            throw new Error(`Agreement ${agreementId} not found in DAO ${daoId}`);
        }
        const validTransitions = {
            draft: ['review', 'terminated'],
            review: ['draft', 'pending_signatures', 'terminated'],
            pending_signatures: ['active', 'review', 'terminated'],
            active: ['expired', 'terminated', 'amended'],
            expired: [],
            terminated: [],
            amended: ['review', 'terminated'],
        };
        const allowed = validTransitions[agreement.status] ?? [];
        if (!allowed.includes(newStatus)) {
            throw new Error(`Invalid transition: ${agreement.status} -> ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`);
        }
        await this.db('agreements')
            .where({ id: agreementId })
            .update({ status: newStatus, updated_at: new Date().toISOString() });
        bus.emit({
            type: 'module.legal.agreement.status_changed',
            source: 'legal',
            dao_id: daoId,
            user_id: userId,
            payload: {
                agreementId,
                previousStatus: agreement.status,
                newStatus,
            },
        });
        // Store as precedent if the agreement becomes active
        if (newStatus === 'active') {
            await this.addKnowledge(daoId, {
                category: 'precedent',
                title: `Active agreement: ${agreement.title}`,
                content: `Agreement "${agreement.title}" (type: ${agreement.type}) was activated on ${new Date().toISOString()}. This sets a precedent for future ${agreement.type.replace(/_/g, ' ')} agreements.`,
                source: 'ai_derived',
                created_by: userId,
                tags: [agreement.type, 'active', 'precedent'],
            });
        }
        return { ...agreement, status: newStatus };
    }
    // -----------------------------------------------------------------------
    // Clause Library
    // -----------------------------------------------------------------------
    /**
     * Retrieve clause templates applicable to a given agreement type.
     * Pulls from knowledge items with category 'terms'.
     */
    async getClausesForType(daoId, agreementType) {
        const items = await this.db('knowledge_items')
            .where({
            dao_id: daoId,
            module_id: this.moduleId,
            category: 'terms',
        })
            .where(function () {
            this.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString());
        })
            .orderBy('confidence', 'desc');
        return items
            .filter((item) => {
            const tags = typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags;
            return tags.includes(agreementType) || tags.includes('universal');
        })
            .map((item) => ({
            id: item.id,
            name: item.title,
            category: agreementType,
            content: item.content,
            jurisdiction: 'general',
            last_reviewed: item.updated_at,
        }));
    }
    /**
     * Add a new clause to the library.
     */
    async addClause(daoId, userId, clause) {
        return this.addKnowledge(daoId, {
            category: 'terms',
            title: clause.name,
            content: clause.content,
            source: 'user_input',
            confidence: 1.0,
            created_by: userId,
            tags: [...clause.applicable_types, clause.jurisdiction ?? 'general'],
        });
    }
    // -----------------------------------------------------------------------
    // Override knowledge retrieval to prioritise legal categories
    // -----------------------------------------------------------------------
    async getRelevantKnowledge(daoId, _query, limit = 10) {
        const rows = await this.db('knowledge_items')
            .where({ dao_id: daoId, module_id: this.moduleId })
            .where(function () {
            this.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString());
        })
            .orderByRaw(`CASE WHEN category IN (${this.coreCategories.map(() => '?').join(',')}) THEN 0 ELSE 1 END`, this.coreCategories)
            .orderBy('confidence', 'desc')
            .orderBy('created_at', 'desc')
            .limit(limit);
        return rows.map((row) => ({
            ...row,
            tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
            embedding_vector: row.embedding_vector == null
                ? null
                : typeof row.embedding_vector === 'string'
                    ? JSON.parse(row.embedding_vector)
                    : row.embedding_vector,
        }));
    }
    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------
    /**
     * Parse the AI review output to extract structured compliance issues.
     * This is a heuristic parser — the AI is prompted to produce structured output,
     * but we handle unstructured responses gracefully.
     */
    extractComplianceIssues(reviewContent) {
        const issues = [];
        // Look for critical / warning / info markers in the AI output
        const lines = reviewContent.split('\n');
        for (const line of lines) {
            const lower = line.toLowerCase();
            let severity = null;
            if (lower.includes('critical') || lower.includes('high risk')) {
                severity = 'critical';
            }
            else if (lower.includes('warning') || lower.includes('medium risk') || lower.includes('caution')) {
                severity = 'warning';
            }
            else if (lower.includes('info') || lower.includes('note') || lower.includes('suggestion')) {
                severity = 'info';
            }
            if (severity && line.trim().length > 10) {
                issues.push({
                    severity,
                    clause: 'general',
                    description: line.replace(/^[-*•]\s*/, '').trim(),
                    recommendation: '',
                });
            }
        }
        return issues;
    }
    /**
     * Determine the overall risk level from the review content.
     */
    assessOverallRisk(reviewContent) {
        const lower = reviewContent.toLowerCase();
        const criticalCount = (lower.match(/critical|high risk|severe/g) ?? []).length;
        const warningCount = (lower.match(/warning|caution|medium risk/g) ?? []).length;
        if (criticalCount >= 2)
            return 'high';
        if (criticalCount >= 1 || warningCount >= 3)
            return 'medium';
        return 'low';
    }
}
//# sourceMappingURL=legal.js.map