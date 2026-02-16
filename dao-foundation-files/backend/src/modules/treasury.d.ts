import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
interface SpendingProposal {
    title: string;
    amount: number;
    token: string;
    category: string;
    justification: string;
}
interface Expense {
    amount: number;
    token: string;
    category: string;
    description: string;
    recipient: string;
}
/**
 * The Treasury module provides financial management, budget analysis,
 * spending proposal evaluation, financial reporting, and expense tracking
 * for DAOs on the SodaWorld platform.
 *
 * Knowledge categories used:
 *   - metric     — financial metrics, balances, KPIs, and quantitative data
 *   - policy     — treasury policies, spending limits, and approval thresholds
 *   - decision   — past treasury decisions, approvals, and rejections
 */
export declare class TreasuryModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Treasury";
    protected readonly version = "1.0.0";
    /** Categories this module primarily works with */
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Treasury module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help DAO founders, leaders, and members with:\n1. **Treasury Management** \u2014 Monitor and manage the DAO's treasury holdings across multiple tokens and chains. Track balances, inflows, outflows, and overall financial health.\n2. **Budget Allocation** \u2014 Help define, allocate, and manage budgets across departments, workstreams, and initiatives. Ensure spending stays within approved limits.\n3. **Financial Reporting** \u2014 Generate clear, comprehensive financial reports including income statements, balance summaries, and cash flow analyses.\n4. **Token Economics** \u2014 Advise on token distribution, vesting schedules, emission rates, and the economic sustainability of the DAO's tokenomics model.\n5. **Spending Proposals** \u2014 Evaluate treasury spending proposals against available funds, historical precedent, policy constraints, and strategic alignment.\n6. **Fund Tracking** \u2014 Record and categorize all expenses, track payments to contributors and service providers, and maintain an auditable financial trail.\n7. **Treasury Diversification** \u2014 Recommend diversification strategies to reduce risk, maintain stable reserves, and optimise yield on idle treasury assets.\n\nTreasury principles:\n- Always prioritise the long-term financial sustainability of the DAO.\n- Be transparent about assumptions and uncertainties in projections.\n- Ground recommendations in the DAO's stated policies and historical spending patterns.\n- Flag potential risks, conflicts of interest, or policy violations proactively.\n- Use standard financial frameworks and metrics (runway, burn rate, ROI, TVL) when they add clarity.\n- Present numbers clearly with appropriate precision and context.\n- Maintain a conservative bias \u2014 it is better to under-promise than over-commit treasury funds.\n\nWhen you learn something new about the DAO's financial metrics, treasury policies, or spending decisions, explicitly note it so the system can store it as knowledge.\n\nAlways respond in a structured, actionable way. Use markdown formatting.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Analyze spending patterns for a given period, broken down by the
     * requested categories. Returns an LLM-generated analysis grounded in
     * the DAO's stored financial metrics and policies.
     */
    analyzeBudget(daoId: string, userId: string, params: {
        period: string;
        categories: string[];
    }): Promise<AgentResponse>;
    /**
     * Evaluate a treasury spending proposal against the DAO's available funds,
     * policies, and historical precedent. Returns a structured assessment with
     * a recommendation to approve, reject, or revise.
     */
    evaluateSpendingProposal(daoId: string, userId: string, proposal: SpendingProposal): Promise<AgentResponse>;
    /**
     * Generate a comprehensive financial summary report for the specified
     * period, optionally including forward-looking projections.
     */
    generateFinancialReport(daoId: string, userId: string, params: {
        period: string;
        includeProjections: boolean;
    }): Promise<AgentResponse>;
    /**
     * Record an expense in the knowledge base and emit a tracking event.
     * Returns the stored knowledge items for the expense record.
     */
    trackExpense(daoId: string, userId: string, expense: Expense): Promise<KnowledgeItem>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Lightweight heuristic to detect when a user's message contains
     * hints about financial metrics, treasury policies, or spending
     * decisions that should be persisted.
     */
    private extractKnowledgeHints;
}
export {};
//# sourceMappingURL=treasury.d.ts.map