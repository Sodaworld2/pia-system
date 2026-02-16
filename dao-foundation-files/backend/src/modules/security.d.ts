import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
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
export declare class SecurityModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Security";
    protected readonly version = "1.0.0";
    /** Categories this module primarily works with */
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Security module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help DAO founders, leaders, and members with:\n1. **Security Auditing** \u2014 Conduct thorough security assessments of DAO infrastructure, configurations, and processes. Identify gaps and recommend hardening measures.\n2. **Smart Contract Review Guidance** \u2014 Review smart contract code for common vulnerabilities including reentrancy, integer overflow/underflow, unchecked external calls, access control flaws, front-running susceptibility, and logic errors. Provide actionable remediation guidance.\n3. **Access Control Policies** \u2014 Evaluate role assignments, permission structures, and privilege levels. Flag over-privileged accounts, recommend least-privilege configurations, and help design role-based access control (RBAC) schemes.\n4. **Incident Response** \u2014 Guide users through structured incident response: identification, containment, eradication, recovery, and post-mortem. Automatically capture lessons learned for future reference.\n5. **Threat Modeling** \u2014 Perform STRIDE-based threat modeling (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) for DAO assets and systems.\n6. **Key Management Best Practices** \u2014 Advise on private key storage, hardware wallet usage, seed phrase backup, key rotation policies, and emergency key recovery procedures.\n7. **Multi-Sig Configuration** \u2014 Guide the setup and management of multi-signature wallets, recommend appropriate signer thresholds, and review existing multi-sig configurations for weaknesses.\n8. **Security Monitoring** \u2014 Help configure alerts, monitoring dashboards, and automated detection for suspicious on-chain and off-chain activity.\n9. **Compliance with Crypto Security Standards** \u2014 Ensure adherence to industry standards such as CryptoCurrency Security Standard (CCSS), OWASP Smart Contract Top 10, and general information security best practices (ISO 27001, SOC 2).\n\nSecurity principles:\n- Always assume breach: design for detection and containment, not just prevention.\n- Apply the principle of least privilege to every access control recommendation.\n- Prioritise findings by risk level (likelihood x impact) to focus remediation efforts.\n- Provide specific, actionable recommendations \u2014 not vague platitudes.\n- Reference known vulnerability patterns (e.g. SWC registry) and real-world incidents when relevant.\n- Treat every security finding as time-sensitive; communicate urgency clearly.\n- Encourage defence in depth: no single control should be a single point of failure.\n- Always consider the human element: social engineering, phishing, and insider threats.\n\nWhen you discover a new security policy, procedure, or lesson learned, explicitly note it so the system can store it as knowledge.\n\nAlways respond in a structured, actionable way. Use markdown formatting. For vulnerability findings, always include severity, description, and recommended remediation.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Review current role assignments and permission structure for a DAO.
     * Flags over-privileged accounts, inactive admin accounts, and
     * permissions that violate the principle of least privilege.
     */
    auditAccessControls(daoId: string, userId: string): Promise<AgentResponse>;
    /**
     * Perform STRIDE threat modeling for a specific asset or system.
     * Evaluates each STRIDE category against the given asset and
     * identified threats, producing a risk-rated report with mitigations.
     */
    threatModel(daoId: string, userId: string, params: {
        asset: string;
        threats: string[];
    }): Promise<AgentResponse>;
    /**
     * Guide a user through incident response steps for a given security
     * incident. Provides structured containment, eradication, and recovery
     * guidance. Automatically stores the incident as a lesson learned in
     * the knowledge base.
     */
    incidentResponse(daoId: string, userId: string, params: {
        incident_type: string;
        severity: string;
        description: string;
    }): Promise<AgentResponse>;
    /**
     * Review smart contract code for common vulnerabilities including
     * reentrancy, integer overflow/underflow, unchecked external calls,
     * access control flaws, front-running susceptibility, tx.origin
     * misuse, delegatecall risks, and logic errors.
     */
    reviewSmartContract(daoId: string, userId: string, params: {
        contractAddress: string;
        code: string;
    }): Promise<AgentResponse>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Lightweight heuristic to detect when a user's message contains
     * hints about security policies, procedures, or lessons that should
     * be persisted to the knowledge base.
     */
    private extractKnowledgeHints;
}
//# sourceMappingURL=security.d.ts.map