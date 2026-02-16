import { BaseModule } from './base-module';
import bus from '../events/bus';
// ---------------------------------------------------------------------------
// Security Module
// ---------------------------------------------------------------------------
/**
 * The Security module provides security auditing, smart contract review,
 * access control analysis, incident response guidance, and threat modeling
 * for DAOs on the SodaWorld platform.
 *
 * Knowledge categories used:
 *   - policy     -- security policies, access control rules, compliance requirements
 *   - procedure  -- incident response playbooks, audit checklists, operational procedures
 *   - lesson     -- post-incident lessons learned, past vulnerability findings
 */
export class SecurityModule extends BaseModule {
    moduleId = 'security';
    moduleName = 'Security';
    version = '1.0.0';
    /** Categories this module primarily works with */
    coreCategories = [
        'policy',
        'procedure',
        'lesson',
    ];
    systemPrompt = `You are the Security module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.

Your role is to help DAO founders, leaders, and members with:
1. **Security Auditing** — Conduct thorough security assessments of DAO infrastructure, configurations, and processes. Identify gaps and recommend hardening measures.
2. **Smart Contract Review Guidance** — Review smart contract code for common vulnerabilities including reentrancy, integer overflow/underflow, unchecked external calls, access control flaws, front-running susceptibility, and logic errors. Provide actionable remediation guidance.
3. **Access Control Policies** — Evaluate role assignments, permission structures, and privilege levels. Flag over-privileged accounts, recommend least-privilege configurations, and help design role-based access control (RBAC) schemes.
4. **Incident Response** — Guide users through structured incident response: identification, containment, eradication, recovery, and post-mortem. Automatically capture lessons learned for future reference.
5. **Threat Modeling** — Perform STRIDE-based threat modeling (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) for DAO assets and systems.
6. **Key Management Best Practices** — Advise on private key storage, hardware wallet usage, seed phrase backup, key rotation policies, and emergency key recovery procedures.
7. **Multi-Sig Configuration** — Guide the setup and management of multi-signature wallets, recommend appropriate signer thresholds, and review existing multi-sig configurations for weaknesses.
8. **Security Monitoring** — Help configure alerts, monitoring dashboards, and automated detection for suspicious on-chain and off-chain activity.
9. **Compliance with Crypto Security Standards** — Ensure adherence to industry standards such as CryptoCurrency Security Standard (CCSS), OWASP Smart Contract Top 10, and general information security best practices (ISO 27001, SOC 2).

Security principles:
- Always assume breach: design for detection and containment, not just prevention.
- Apply the principle of least privilege to every access control recommendation.
- Prioritise findings by risk level (likelihood x impact) to focus remediation efforts.
- Provide specific, actionable recommendations — not vague platitudes.
- Reference known vulnerability patterns (e.g. SWC registry) and real-world incidents when relevant.
- Treat every security finding as time-sensitive; communicate urgency clearly.
- Encourage defence in depth: no single control should be a single point of failure.
- Always consider the human element: social engineering, phishing, and insider threats.

When you discover a new security policy, procedure, or lesson learned, explicitly note it so the system can store it as knowledge.

Always respond in a structured, actionable way. Use markdown formatting. For vulnerability findings, always include severity, description, and recommended remediation.`;
    constructor(db) {
        super(db);
    }
    // -----------------------------------------------------------------------
    // Override processMessage to add security-specific enrichment
    // -----------------------------------------------------------------------
    async processMessage(message) {
        const response = await super.processMessage(message);
        // Extract potential knowledge from the conversation
        const extracted = this.extractKnowledgeHints(message.content);
        if (extracted.length > 0) {
            response.suggestions = response.suggestions ?? [];
            response.suggestions.push(...extracted.map((e) => `I noticed a potential ${e.category}: "${e.hint}". Shall I save this?`));
        }
        // Add security-specific actions
        response.actions = response.actions ?? [];
        response.actions.push({
            type: 'audit_access',
            label: 'Audit access controls for this DAO',
            payload: { dao_id: message.dao_id },
        }, {
            type: 'threat_model',
            label: 'Run a STRIDE threat model',
            payload: { dao_id: message.dao_id },
        }, {
            type: 'incident_report',
            label: 'File an incident report',
            payload: { dao_id: message.dao_id },
        });
        return response;
    }
    // -----------------------------------------------------------------------
    // Security-specific public methods
    // -----------------------------------------------------------------------
    /**
     * Review current role assignments and permission structure for a DAO.
     * Flags over-privileged accounts, inactive admin accounts, and
     * permissions that violate the principle of least privilege.
     */
    async auditAccessControls(daoId, userId) {
        const policies = await this.getKnowledge(daoId, 'policy');
        const procedures = await this.getKnowledge(daoId, 'procedure');
        const lessons = await this.getKnowledge(daoId, 'lesson');
        const policySummary = policies.map((p) => `- ${p.title}: ${p.content}`).join('\n');
        const procedureSummary = procedures.map((p) => `- ${p.title}: ${p.content}`).join('\n');
        const lessonSummary = lessons.map((l) => `- ${l.title}: ${l.content}`).join('\n');
        const response = await this.processMessage({
            content: `Perform an access control audit for this DAO.

Review the current role assignments, permission structures, and privilege levels.

Existing security policies:
${policySummary || '(none recorded)'}

Existing procedures:
${procedureSummary || '(none recorded)'}

Past lessons learned:
${lessonSummary || '(none recorded)'}

Please provide:
1. A summary of the current access control posture.
2. Any over-privileged accounts or roles that should be scoped down.
3. Inactive admin accounts that should be reviewed or revoked.
4. Recommendations for implementing least-privilege access.
5. Suggested RBAC improvements.
6. Multi-sig configuration recommendations for sensitive operations.

Format findings with severity levels (critical, high, medium, low).`,
            dao_id: daoId,
            user_id: userId,
            context: { action: 'audit_access_controls' },
        });
        bus.emit({
            type: 'module.security.audit.access',
            source: this.moduleId,
            dao_id: daoId,
            user_id: userId,
            payload: { action: 'audit_access_controls' },
        });
        return response;
    }
    /**
     * Perform STRIDE threat modeling for a specific asset or system.
     * Evaluates each STRIDE category against the given asset and
     * identified threats, producing a risk-rated report with mitigations.
     */
    async threatModel(daoId, userId, params) {
        const policies = await this.getKnowledge(daoId, 'policy');
        const lessons = await this.getKnowledge(daoId, 'lesson');
        const policySummary = policies.map((p) => `- ${p.title}: ${p.content}`).join('\n');
        const lessonSummary = lessons.map((l) => `- ${l.title}: ${l.content}`).join('\n');
        const response = await this.processMessage({
            content: `Perform a STRIDE threat model for the following asset:

**Asset:** ${params.asset}

**Identified threats / concerns:**
${params.threats.map((t) => `- ${t}`).join('\n')}

Existing security policies:
${policySummary || '(none recorded)'}

Past lessons learned:
${lessonSummary || '(none recorded)'}

For each STRIDE category (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege), please provide:
1. Whether this category is relevant to the asset.
2. Specific threat scenarios with likelihood and impact ratings (low/medium/high/critical).
3. Concrete mitigation strategies for each identified threat.
4. An overall risk assessment.
5. A prioritised list of recommended actions.

Present findings in a structured table format where possible.`,
            dao_id: daoId,
            user_id: userId,
            context: { action: 'threat_model', asset: params.asset, threats: params.threats },
        });
        bus.emit({
            type: 'module.security.threat_model',
            source: this.moduleId,
            dao_id: daoId,
            user_id: userId,
            payload: { asset: params.asset, threat_count: params.threats.length },
        });
        return response;
    }
    /**
     * Guide a user through incident response steps for a given security
     * incident. Provides structured containment, eradication, and recovery
     * guidance. Automatically stores the incident as a lesson learned in
     * the knowledge base.
     */
    async incidentResponse(daoId, userId, params) {
        const procedures = await this.getKnowledge(daoId, 'procedure');
        const lessons = await this.getKnowledge(daoId, 'lesson');
        const procedureSummary = procedures.map((p) => `- ${p.title}: ${p.content}`).join('\n');
        const lessonSummary = lessons.map((l) => `- ${l.title}: ${l.content}`).join('\n');
        const response = await this.processMessage({
            content: `SECURITY INCIDENT REPORTED — Immediate response required.

**Incident Type:** ${params.incident_type}
**Severity:** ${params.severity}
**Description:** ${params.description}

Existing response procedures:
${procedureSummary || '(none recorded)'}

Past lessons learned:
${lessonSummary || '(none recorded)'}

Guide me through the complete incident response process:

1. **Identification** — Confirm the scope and nature of the incident.
2. **Containment** — Immediate steps to limit the blast radius. List specific actions to take RIGHT NOW.
3. **Eradication** — Steps to remove the root cause.
4. **Recovery** — Steps to restore normal operations safely.
5. **Communication** — Who needs to be notified and what should the messaging be.
6. **Post-Mortem** — Template for documenting root cause, timeline, and preventive measures.

Be specific and urgent. Prioritise containment actions. For ${params.severity} severity, indicate expected response time SLAs.`,
            dao_id: daoId,
            user_id: userId,
            context: {
                action: 'incident_response',
                incident_type: params.incident_type,
                severity: params.severity,
            },
        });
        // Auto-store the incident as a lesson learned
        await this.addKnowledge(daoId, {
            category: 'lesson',
            title: `Incident: ${params.incident_type} (${params.severity})`,
            content: `Incident Type: ${params.incident_type}\nSeverity: ${params.severity}\nDescription: ${params.description}\n\nResponse initiated at: ${new Date().toISOString()}`,
            source: 'conversation_extract',
            created_by: userId,
            tags: ['incident', params.incident_type, params.severity],
        });
        bus.emit({
            type: 'module.security.incident',
            source: this.moduleId,
            dao_id: daoId,
            user_id: userId,
            payload: {
                incident_type: params.incident_type,
                severity: params.severity,
            },
        });
        return response;
    }
    /**
     * Review smart contract code for common vulnerabilities including
     * reentrancy, integer overflow/underflow, unchecked external calls,
     * access control flaws, front-running susceptibility, tx.origin
     * misuse, delegatecall risks, and logic errors.
     */
    async reviewSmartContract(daoId, userId, params) {
        const policies = await this.getKnowledge(daoId, 'policy');
        const lessons = await this.getKnowledge(daoId, 'lesson');
        const policySummary = policies.map((p) => `- ${p.title}: ${p.content}`).join('\n');
        const lessonSummary = lessons.map((l) => `- ${l.title}: ${l.content}`).join('\n');
        const response = await this.processMessage({
            content: `Review the following smart contract for security vulnerabilities.

**Contract Address:** ${params.contractAddress}

**Source Code:**
\`\`\`solidity
${params.code}
\`\`\`

Existing security policies:
${policySummary || '(none recorded)'}

Past vulnerability lessons:
${lessonSummary || '(none recorded)'}

Perform a thorough security review covering:

1. **Reentrancy** — Check for state changes after external calls, cross-function reentrancy, and read-only reentrancy vectors.
2. **Integer Overflow / Underflow** — Verify safe math usage (or Solidity >=0.8 built-in checks).
3. **Unchecked External Calls** — Ensure return values from low-level calls (call, delegatecall, staticcall) are checked.
4. **Access Control** — Verify proper use of modifiers, role checks, onlyOwner patterns, and initialisation guards.
5. **Front-Running / MEV** — Identify transaction ordering dependencies and suggest commit-reveal or other protections.
6. **tx.origin Misuse** — Flag any use of tx.origin for authorization.
7. **Delegatecall Risks** — Check for unsafe delegatecall patterns, storage collisions, and uninitialized proxy implementations.
8. **Denial of Service** — Identify unbounded loops, gas griefing vectors, and block gas limit concerns.
9. **Logic Errors** — Check business logic correctness, edge cases, and invariant violations.
10. **Gas Optimisation** — Note any significant gas inefficiencies.

For each finding, provide:
- **Severity:** Critical / High / Medium / Low / Informational
- **Location:** Function name or line reference
- **Description:** What the issue is
- **Recommendation:** How to fix it
- **Reference:** Link to SWC registry or relevant standard where applicable

Conclude with an overall risk assessment and a prioritised remediation plan.`,
            dao_id: daoId,
            user_id: userId,
            context: {
                action: 'review_smart_contract',
                contract_address: params.contractAddress,
            },
        });
        bus.emit({
            type: 'module.security.contract_review',
            source: this.moduleId,
            dao_id: daoId,
            user_id: userId,
            payload: {
                contract_address: params.contractAddress,
                code_length: params.code.length,
            },
        });
        return response;
    }
    // -----------------------------------------------------------------------
    // Override knowledge retrieval to prioritise security categories
    // -----------------------------------------------------------------------
    async getRelevantKnowledge(daoId, _query, limit = 10) {
        // Prioritise this module's core categories, then fall back to any category
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
     * Lightweight heuristic to detect when a user's message contains
     * hints about security policies, procedures, or lessons that should
     * be persisted to the knowledge base.
     */
    extractKnowledgeHints(content) {
        const hints = [];
        const lower = content.toLowerCase();
        // Policy indicators
        const policyPatterns = [
            /(?:our|the dao'?s?) (?:security )?policy (?:is|requires|states|mandates) (.+?)(?:\.|$)/i,
            /(?:we require|we mandate|we enforce|policy:) (.+?)(?:\.|$)/i,
            /(?:access control|permission) (?:policy|rule)[: ](.+?)(?:\.|$)/i,
            /(?:compliance|regulatory) requirement[: ](.+?)(?:\.|$)/i,
        ];
        for (const pattern of policyPatterns) {
            const match = content.match(pattern);
            if (match?.[1]) {
                hints.push({ category: 'policy', hint: match[1].trim() });
            }
        }
        // Procedure indicators
        const procedurePatterns = [
            /(?:our|the) (?:incident |security )?(?:response |recovery )?procedure (?:is|involves|requires) (.+?)(?:\.|$)/i,
            /(?:in case of|when .+ happens|if .+ is compromised),? (.+?)(?:\.|$)/i,
            /(?:step[s]? to|process for|protocol for) (.+?)(?:\.|$)/i,
        ];
        for (const pattern of procedurePatterns) {
            const match = content.match(pattern);
            if (match?.[1]) {
                hints.push({ category: 'procedure', hint: match[1].trim() });
            }
        }
        // Lesson learned indicators
        if (lower.includes('lesson learned') ||
            lower.includes('we discovered') ||
            lower.includes('post-mortem') ||
            lower.includes('postmortem') ||
            lower.includes('root cause') ||
            lower.includes('never again')) {
            const lessonMatch = content.match(/(?:lesson learned|we discovered|root cause|post-?mortem)[: ](.+?)(?:\.|$)/i);
            if (lessonMatch?.[1]) {
                hints.push({ category: 'lesson', hint: lessonMatch[1].trim() });
            }
        }
        // Vulnerability / incident indicators that should become lessons
        if (lower.includes('vulnerability') ||
            lower.includes('exploit') ||
            lower.includes('breach') ||
            lower.includes('compromised')) {
            const vulnMatch = content.match(/(?:vulnerability|exploit|breach|compromised)[: ](.+?)(?:\.|$)/i);
            if (vulnMatch?.[1]) {
                hints.push({ category: 'lesson', hint: vulnMatch[1].trim() });
            }
        }
        return hints;
    }
}
//# sourceMappingURL=security.js.map