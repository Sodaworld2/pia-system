import { BaseModule } from './base-module';
import bus from '../events/bus';
// ---------------------------------------------------------------------------
// Treasury Module
// ---------------------------------------------------------------------------
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
export class TreasuryModule extends BaseModule {
    moduleId = 'treasury';
    moduleName = 'Treasury';
    version = '1.0.0';
    /** Categories this module primarily works with */
    coreCategories = [
        'metric',
        'policy',
        'decision',
    ];
    systemPrompt = `You are the Treasury module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.

Your role is to help DAO founders, leaders, and members with:
1. **Treasury Management** — Monitor and manage the DAO's treasury holdings across multiple tokens and chains. Track balances, inflows, outflows, and overall financial health.
2. **Budget Allocation** — Help define, allocate, and manage budgets across departments, workstreams, and initiatives. Ensure spending stays within approved limits.
3. **Financial Reporting** — Generate clear, comprehensive financial reports including income statements, balance summaries, and cash flow analyses.
4. **Token Economics** — Advise on token distribution, vesting schedules, emission rates, and the economic sustainability of the DAO's tokenomics model.
5. **Spending Proposals** — Evaluate treasury spending proposals against available funds, historical precedent, policy constraints, and strategic alignment.
6. **Fund Tracking** — Record and categorize all expenses, track payments to contributors and service providers, and maintain an auditable financial trail.
7. **Treasury Diversification** — Recommend diversification strategies to reduce risk, maintain stable reserves, and optimise yield on idle treasury assets.

Treasury principles:
- Always prioritise the long-term financial sustainability of the DAO.
- Be transparent about assumptions and uncertainties in projections.
- Ground recommendations in the DAO's stated policies and historical spending patterns.
- Flag potential risks, conflicts of interest, or policy violations proactively.
- Use standard financial frameworks and metrics (runway, burn rate, ROI, TVL) when they add clarity.
- Present numbers clearly with appropriate precision and context.
- Maintain a conservative bias — it is better to under-promise than over-commit treasury funds.

When you learn something new about the DAO's financial metrics, treasury policies, or spending decisions, explicitly note it so the system can store it as knowledge.

Always respond in a structured, actionable way. Use markdown formatting.`;
    constructor(db) {
        super(db);
    }
    // -----------------------------------------------------------------------
    // Override processMessage to add treasury-specific enrichment
    // -----------------------------------------------------------------------
    async processMessage(message) {
        const response = await super.processMessage(message);
        // Extract potential knowledge from the conversation
        const extracted = this.extractKnowledgeHints(message.content);
        if (extracted.length > 0) {
            response.suggestions = response.suggestions ?? [];
            response.suggestions.push(...extracted.map((e) => `I noticed a potential ${e.category}: "${e.hint}". Shall I save this?`));
        }
        // Add treasury-specific actions
        response.actions = response.actions ?? [];
        response.actions.push({
            type: 'create_budget',
            label: 'Create a budget from this conversation',
            payload: { dao_id: message.dao_id },
        }, {
            type: 'evaluate_proposal',
            label: 'Evaluate a spending proposal',
            payload: { dao_id: message.dao_id },
        }, {
            type: 'generate_report',
            label: 'Generate a financial report',
            payload: { dao_id: message.dao_id },
        });
        return response;
    }
    // -----------------------------------------------------------------------
    // Treasury-specific public methods
    // -----------------------------------------------------------------------
    /**
     * Analyze spending patterns for a given period, broken down by the
     * requested categories. Returns an LLM-generated analysis grounded in
     * the DAO's stored financial metrics and policies.
     */
    async analyzeBudget(daoId, userId, params) {
        const metrics = await this.getKnowledge(daoId, 'metric');
        const policies = await this.getKnowledge(daoId, 'policy');
        const metricSummary = metrics.map((m) => `- ${m.title}: ${m.content}`).join('\n');
        const policySummary = policies.map((p) => `- ${p.title}: ${p.content}`).join('\n');
        return this.processMessage({
            content: `Analyze the treasury budget for the period: ${params.period}.\n\nCategories to analyze: ${params.categories.join(', ')}\n\nKnown financial metrics:\n${metricSummary}\n\nTreasury policies:\n${policySummary}\n\nPlease provide:\n1. A breakdown of spending by category with utilization percentages.\n2. Trends compared to previous periods (increasing, decreasing, or stable).\n3. Areas where spending is over or under budget.\n4. Specific, actionable recommendations to optimise the budget.`,
            dao_id: daoId,
            user_id: userId,
            context: { action: 'analyze_budget', ...params },
        });
    }
    /**
     * Evaluate a treasury spending proposal against the DAO's available funds,
     * policies, and historical precedent. Returns a structured assessment with
     * a recommendation to approve, reject, or revise.
     */
    async evaluateSpendingProposal(daoId, userId, proposal) {
        const policies = await this.getKnowledge(daoId, 'policy');
        const decisions = await this.getKnowledge(daoId, 'decision');
        const metrics = await this.getKnowledge(daoId, 'metric');
        const policySummary = policies.map((p) => `- ${p.title}: ${p.content}`).join('\n');
        const decisionSummary = decisions.map((d) => `- ${d.title}: ${d.content}`).join('\n');
        const metricSummary = metrics.map((m) => `- ${m.title}: ${m.content}`).join('\n');
        return this.processMessage({
            content: `Evaluate the following treasury spending proposal:\n\n**Title:** ${proposal.title}\n**Amount:** ${proposal.amount} ${proposal.token}\n**Category:** ${proposal.category}\n**Justification:** ${proposal.justification}\n\nTreasury policies:\n${policySummary}\n\nPrevious spending decisions:\n${decisionSummary}\n\nCurrent financial metrics:\n${metricSummary}\n\nPlease provide:\n1. A risk assessment score (1-10, where 10 is highest risk).\n2. An alignment score (1-10, where 10 is perfectly aligned with DAO goals).\n3. A recommendation: approve, reject, or revise.\n4. Any concerns or red flags.\n5. Conditions that should be attached if approved.\n6. Comparable precedents from past decisions.`,
            dao_id: daoId,
            user_id: userId,
            context: { action: 'evaluate_spending_proposal', proposal },
        });
    }
    /**
     * Generate a comprehensive financial summary report for the specified
     * period, optionally including forward-looking projections.
     */
    async generateFinancialReport(daoId, userId, params) {
        const allKnowledge = await this.getRelevantKnowledge(daoId, 'financial report', 20);
        const knowledgeDump = allKnowledge
            .map((k) => `[${k.category}] ${k.title}: ${k.content}`)
            .join('\n');
        const projectionClause = params.includeProjections
            ? '\n6. **Projections** — Provide a 3-month and 6-month projection of treasury balance with confidence levels. State all assumptions clearly.'
            : '';
        return this.processMessage({
            content: `Generate a financial report for the period: ${params.period}.\n\nAccumulated financial knowledge:\n${knowledgeDump}\n\nPlease provide:\n1. **Executive Summary** — A brief overview of the DAO's financial health.\n2. **Income Breakdown** — All sources of income with amounts and tokens.\n3. **Expense Breakdown** — All expenses by category with amounts and tokens.\n4. **Net Position** — Total assets, liabilities, and net treasury value.\n5. **Runway Analysis** — Estimated months of runway at current burn rate.${projectionClause}\n\nFormat the report with clear section headers, tables where appropriate, and highlight any areas of concern.`,
            dao_id: daoId,
            user_id: userId,
            context: { action: 'generate_financial_report', ...params },
        });
    }
    /**
     * Record an expense in the knowledge base and emit a tracking event.
     * Returns the stored knowledge items for the expense record.
     */
    async trackExpense(daoId, userId, expense) {
        const now = new Date().toISOString();
        const content = [
            `Amount: ${expense.amount} ${expense.token}`,
            `Category: ${expense.category}`,
            `Description: ${expense.description}`,
            `Recipient: ${expense.recipient}`,
            `Recorded at: ${now}`,
            `Recorded by: ${userId}`,
        ].join('\n');
        const saved = await this.addKnowledge(daoId, {
            category: 'metric',
            title: `Expense: ${expense.description.substring(0, 80)}`,
            content,
            source: 'user_input',
            created_by: userId,
            tags: ['expense', expense.category, expense.token],
        });
        bus.emit({
            type: 'module.treasury.expense.tracked',
            source: this.moduleId,
            dao_id: daoId,
            user_id: userId,
            payload: {
                knowledgeId: saved.id,
                amount: expense.amount,
                token: expense.token,
                category: expense.category,
                recipient: expense.recipient,
            },
        });
        return saved;
    }
    // -----------------------------------------------------------------------
    // Override knowledge retrieval to prioritise treasury categories
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
     * hints about financial metrics, treasury policies, or spending
     * decisions that should be persisted.
     */
    extractKnowledgeHints(content) {
        const hints = [];
        const lower = content.toLowerCase();
        // Metric indicators
        const metricPatterns = [
            /(?:treasury|balance|fund)[s]? (?:is|are|stands? at|total[s]?) (.+?)(?:\.|$)/i,
            /(?:burn rate|runway|revenue|income|expense[s]?) (?:is|are|of) (.+?)(?:\.|$)/i,
            /(?:we (?:have|hold|spent|earned|received)) (.+?)(?:\.|$)/i,
            /(?:tvl|aum|total value) (?:is|of|at) (.+?)(?:\.|$)/i,
        ];
        for (const pattern of metricPatterns) {
            const match = content.match(pattern);
            if (match?.[1]) {
                hints.push({ category: 'metric', hint: match[1].trim() });
            }
        }
        // Policy indicators
        if (lower.includes('policy') ||
            lower.includes('limit') ||
            lower.includes('threshold') ||
            lower.includes('approval') ||
            lower.includes('spending cap') ||
            lower.includes('budget rule')) {
            const policyMatch = content.match(/(?:policy|limit|threshold|approval|spending cap|budget rule)[: ](.+?)(?:\.|$)/i);
            if (policyMatch?.[1]) {
                hints.push({ category: 'policy', hint: policyMatch[1].trim() });
            }
        }
        // Decision indicators
        if (lower.includes('decided') ||
            lower.includes('approved') ||
            lower.includes('rejected') ||
            lower.includes('voted to') ||
            lower.includes('allocated')) {
            const decisionMatch = content.match(/(?:decided|approved|rejected|voted to|allocated)[: ](.+?)(?:\.|$)/i);
            if (decisionMatch?.[1]) {
                hints.push({ category: 'decision', hint: decisionMatch[1].trim() });
            }
        }
        return hints;
    }
}
//# sourceMappingURL=treasury.js.map