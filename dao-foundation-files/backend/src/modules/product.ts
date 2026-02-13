import type { Knex } from 'knex';
import type {
  AIModuleId,
  AgentMessage,
  AgentResponse,
  KnowledgeItem,
  KnowledgeCategory,
} from '../types/foundation';
import { BaseModule } from './base-module';
import bus from '../events/bus';

// ---------------------------------------------------------------------------
// Product Frameworks
// ---------------------------------------------------------------------------

interface RICEScore {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  score: number;
}

interface PrioritizedFeature {
  name: string;
  description: string;
  effort: string;
  impact: string;
  rice: RICEScore;
  rank: number;
  recommendation: string;
}

interface RoadmapTheme {
  name: string;
  description: string;
  milestones: RoadmapMilestone[];
}

interface RoadmapMilestone {
  title: string;
  description: string;
  target_date: string;
  deliverables: string[];
  dependencies: string[];
  status: 'planned' | 'in_progress' | 'completed' | 'blocked';
}

interface ProductRoadmap {
  horizon: string;
  themes: RoadmapTheme[];
  constraints: string[];
  generated_at: string;
}

interface MetricAnalysis {
  metric_name: string;
  current_value: number;
  trend: 'improving' | 'stable' | 'declining';
  insight: string;
  recommended_action: string;
}

interface SprintPlan {
  sprint_number: number;
  capacity: number;
  committed_items: string[];
  stretch_items: string[];
  risks: string[];
  goals: string[];
}

// ---------------------------------------------------------------------------
// Product Module
// ---------------------------------------------------------------------------

/**
 * The Product module provides product management guidance including feature
 * prioritization (RICE, MoSCoW), roadmap planning, user research synthesis,
 * competitive analysis, product metrics tracking, sprint planning, backlog
 * management, and technical debt assessment for DAO teams.
 *
 * Knowledge categories used:
 *   - goal     — product goals, vision, and strategic objectives
 *   - resource — team capacity, budgets, and available tools
 *   - metric   — product KPIs, usage data, and performance indicators
 */
export class ProductModule extends BaseModule {
  readonly moduleId: AIModuleId = 'product';
  readonly moduleName = 'Product';
  protected readonly version = '1.0.0';

  /** Categories this module primarily works with */
  private readonly coreCategories: KnowledgeCategory[] = [
    'goal',
    'resource',
    'metric',
  ];

  protected readonly systemPrompt = `You are the Product module for a DAO (Decentralised Autonomous Organisation) platform called SodaWorld.

Your role is to help DAO founders, leaders, and members with:
1. **Product Strategy** — Define and refine the product vision, mission, and strategic direction aligned with the DAO's goals.
2. **Roadmap Planning** — Build time-bound roadmaps organised by themes, with clear milestones, deliverables, and dependencies.
3. **Feature Prioritization** — Apply frameworks like RICE (Reach, Impact, Confidence, Effort) and MoSCoW (Must, Should, Could, Won't) to objectively rank features and initiatives.
4. **User Research Synthesis** — Distil user interviews, surveys, and feedback into actionable insights and validated personas.
5. **Competitive Analysis** — Map the competitive landscape, identify differentiators, and spot opportunities or threats.
6. **Product Metrics** — Track and interpret key product metrics including MAU (Monthly Active Users), retention rates, NPS (Net Promoter Score), activation rates, churn, and engagement depth.
7. **Sprint Planning** — Help teams scope sprints based on capacity, priority, and dependencies, ensuring a healthy mix of feature work, bugs, and tech debt.
8. **Backlog Management** — Keep the backlog groomed, well-structured, and aligned with strategic themes. Identify stale items and duplicates.
9. **Technical Debt Assessment** — Evaluate the cost and risk of accumulated technical debt and recommend a sustainable paydown strategy.

Product management principles:
- Always ground recommendations in data and user evidence when available.
- Balance short-term delivery with long-term product health.
- Make trade-offs explicit — every "yes" to a feature implies a "not now" to something else.
- Use prioritization frameworks consistently to reduce bias.
- Consider the DAO's phase (inception, formation, operating, scaling) when advising on scope and ambition.
- Champion the user's perspective while respecting engineering constraints.
- Quantify impact where possible — use metrics, estimates, and benchmarks.
- Encourage iterative delivery: ship small, learn fast, adapt.
- Flag technical debt proactively and integrate paydown into regular planning.
- Tailor communication to the audience — strategic for leadership, tactical for execution teams.

When you learn something new about the DAO's product goals, available resources, or metrics, explicitly note it so the system can store it as knowledge.

Always respond in a structured, actionable way. Use markdown formatting.`;

  constructor(db: Knex) {
    super(db);
  }

  // -----------------------------------------------------------------------
  // Override processMessage to add product-specific enrichment
  // -----------------------------------------------------------------------

  override async processMessage(message: AgentMessage): Promise<AgentResponse> {
    const response = await super.processMessage(message);

    // Extract potential knowledge from the conversation
    const extracted = this.extractKnowledgeHints(message.content);
    if (extracted.length > 0) {
      response.suggestions = response.suggestions ?? [];
      response.suggestions.push(
        ...extracted.map((e) => `I noticed a potential ${e.category}: "${e.hint}". Shall I save this?`),
      );
    }

    // Add product-specific actions
    response.actions = response.actions ?? [];
    response.actions.push(
      {
        type: 'prioritize_features',
        label: 'Prioritize features using RICE scoring',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'generate_roadmap',
        label: 'Generate a product roadmap',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'analyze_metrics',
        label: 'Analyze product metrics',
        payload: { dao_id: message.dao_id },
      },
    );

    return response;
  }

  // -----------------------------------------------------------------------
  // Product-specific public methods
  // -----------------------------------------------------------------------

  /**
   * Prioritize a list of features using RICE scoring.
   *
   * RICE = (Reach * Impact * Confidence) / Effort
   *
   * The LLM evaluates each feature against the DAO's known goals and
   * resources to produce numeric RICE components, a composite score,
   * a rank ordering, and a recommendation for each feature.
   */
  async prioritizeFeatures(
    daoId: string,
    userId: string,
    features: Array<{ name: string; description: string; effort: string; impact: string }>,
  ): Promise<AgentResponse> {
    const goals = await this.getKnowledge(daoId, 'goal');
    const resources = await this.getKnowledge(daoId, 'resource');
    const metrics = await this.getKnowledge(daoId, 'metric');

    const goalSummary = goals.map((g) => `- ${g.title}: ${g.content}`).join('\n');
    const resourceSummary = resources.map((r) => `- ${r.title}: ${r.content}`).join('\n');
    const metricSummary = metrics.map((m) => `- ${m.title}: ${m.content}`).join('\n');

    const featureList = features
      .map(
        (f, i) =>
          `${i + 1}. **${f.name}** — ${f.description}\n   Estimated effort: ${f.effort} | Expected impact: ${f.impact}`,
      )
      .join('\n');

    return this.processMessage({
      content: `Prioritize the following features using the RICE framework (Reach, Impact, Confidence, Effort).

For each feature, provide:
- Reach (estimated users affected per quarter, 1-10 scale)
- Impact (minimal=0.25, low=0.5, medium=1, high=2, massive=3)
- Confidence (percentage as decimal: 0.5, 0.8, 1.0)
- Effort (person-months, estimated from the provided effort level)
- RICE Score = (Reach × Impact × Confidence) / Effort
- Rank (1 = highest priority)
- Recommendation (build now, plan next, consider later, or revisit)

Features to prioritize:
${featureList}

Product goals:
${goalSummary || '(No goals recorded yet)'}

Available resources:
${resourceSummary || '(No resource information recorded yet)'}

Current metrics:
${metricSummary || '(No metrics recorded yet)'}

Also apply MoSCoW categorisation (Must have, Should have, Could have, Won't have this cycle) as a secondary lens. Present results in a markdown table sorted by RICE score descending.`,
      dao_id: daoId,
      user_id: userId,
      context: { action: 'prioritize_features', feature_count: features.length },
    });
  }

  /**
   * Generate a product roadmap organized by themes across a given time horizon.
   */
  async generateRoadmap(
    daoId: string,
    userId: string,
    params: { horizon: string; themes: string[]; constraints: string[] },
  ): Promise<AgentResponse> {
    const goals = await this.getKnowledge(daoId, 'goal');
    const resources = await this.getKnowledge(daoId, 'resource');
    const metrics = await this.getKnowledge(daoId, 'metric');

    const goalSummary = goals.map((g) => `- ${g.title}: ${g.content}`).join('\n');
    const resourceSummary = resources.map((r) => `- ${r.title}: ${r.content}`).join('\n');
    const metricSummary = metrics.map((m) => `- ${m.title}: ${m.content}`).join('\n');

    const themeList = params.themes.map((t) => `- ${t}`).join('\n');
    const constraintList = params.constraints.map((c) => `- ${c}`).join('\n');

    return this.processMessage({
      content: `Generate a product roadmap for the following parameters.

**Time Horizon:** ${params.horizon}

**Strategic Themes:**
${themeList}

**Constraints:**
${constraintList || '(None specified)'}

**Product Goals:**
${goalSummary || '(No goals recorded yet)'}

**Available Resources:**
${resourceSummary || '(No resource information recorded yet)'}

**Current Metrics:**
${metricSummary || '(No metrics recorded yet)'}

For each theme, provide:
1. A brief description of the theme's strategic rationale.
2. 2-4 milestones with:
   - Title and description
   - Target date (within the specified horizon)
   - Key deliverables
   - Dependencies on other milestones or external factors
   - Status recommendation (planned / in_progress)
3. Success criteria — how we'll know this theme delivered value.

Also include:
- A "Now / Next / Later" summary view.
- Key risks and mitigations across the roadmap.
- Suggested review cadence (e.g., monthly roadmap review).

Format the roadmap in a clear, visual markdown structure with timelines.`,
      dao_id: daoId,
      user_id: userId,
      context: { action: 'generate_roadmap', horizon: params.horizon, theme_count: params.themes.length },
    });
  }

  /**
   * Analyze product metrics for a given period, identifying trends,
   * anomalies, and actionable recommendations.
   */
  async analyzeMetrics(
    daoId: string,
    userId: string,
    params: { metrics: Record<string, number>; period: string },
  ): Promise<AgentResponse> {
    const goals = await this.getKnowledge(daoId, 'goal');
    const historicalMetrics = await this.getKnowledge(daoId, 'metric');

    const goalSummary = goals.map((g) => `- ${g.title}: ${g.content}`).join('\n');
    const historicalSummary = historicalMetrics
      .map((m) => `- ${m.title}: ${m.content}`)
      .join('\n');

    const metricEntries = Object.entries(params.metrics)
      .map(([name, value]) => `- **${name}**: ${value}`)
      .join('\n');

    return this.processMessage({
      content: `Analyze the following product metrics for the period: **${params.period}**.

**Current Metrics:**
${metricEntries}

**Historical Context:**
${historicalSummary || '(No historical metrics recorded yet — treat current values as the baseline)'}

**Product Goals:**
${goalSummary || '(No goals recorded yet)'}

For each metric, provide:
1. **Trend Assessment** — Is this improving, stable, or declining? (Infer from historical data if available, otherwise note it as a baseline.)
2. **Benchmark Comparison** — How does this compare to typical SaaS/Web3 benchmarks for a project at this stage?
3. **Insight** — What does this metric tell us about user behaviour or product health?
4. **Recommended Action** — One specific, actionable step to improve this metric.

Also provide:
- An overall product health score (1-10) with justification.
- Top 3 metrics to watch most closely in the next period.
- Any correlations or red flags across metrics (e.g., high acquisition but low retention suggests an onboarding problem).

Use markdown tables and clear formatting.`,
      dao_id: daoId,
      user_id: userId,
      context: { action: 'analyze_metrics', period: params.period, metric_count: Object.keys(params.metrics).length },
    });
  }

  /**
   * Assist with sprint planning by recommending commitment levels,
   * item selection, stretch goals, and risk identification.
   */
  async planSprint(
    daoId: string,
    userId: string,
    params: { sprintNumber: number; capacity: number; backlogItems: string[] },
  ): Promise<AgentResponse> {
    const goals = await this.getKnowledge(daoId, 'goal');
    const resources = await this.getKnowledge(daoId, 'resource');

    const goalSummary = goals.map((g) => `- ${g.title}: ${g.content}`).join('\n');
    const resourceSummary = resources.map((r) => `- ${r.title}: ${r.content}`).join('\n');

    const backlogList = params.backlogItems
      .map((item, i) => `${i + 1}. ${item}`)
      .join('\n');

    return this.processMessage({
      content: `Help plan Sprint ${params.sprintNumber}.

**Team Capacity:** ${params.capacity} story points (or equivalent effort units)

**Backlog Items (prioritized):**
${backlogList}

**Product Goals:**
${goalSummary || '(No goals recorded yet)'}

**Team Resources:**
${resourceSummary || '(No resource information recorded yet)'}

Please provide:

1. **Sprint Goal** — A clear, concise sprint goal (1-2 sentences) that ties committed work to a product outcome.

2. **Committed Items** — Which backlog items should the team commit to, given the capacity? Aim for ~80% capacity utilisation to leave room for unplanned work. Explain your reasoning.

3. **Stretch Items** — 1-2 items that can be pulled in if the team finishes early.

4. **Risks & Dependencies** — Any risks or external dependencies that could derail the sprint. Suggest mitigations.

5. **Technical Debt Allocation** — Recommend what percentage of capacity (typically 15-20%) should be reserved for tech debt and bug fixes. Identify specific tech debt items if known.

6. **Definition of Done Reminders** — Key quality checks for this sprint's deliverables.

7. **Carry-over Check** — Flag if the capacity seems too tight or too loose based on the number of items vs. available points.

Format the sprint plan as a structured markdown document that can be shared with the team.`,
      dao_id: daoId,
      user_id: userId,
      context: {
        action: 'plan_sprint',
        sprint_number: params.sprintNumber,
        capacity: params.capacity,
        backlog_item_count: params.backlogItems.length,
      },
    });
  }

  /**
   * Save a set of product metrics into the knowledge base for
   * historical tracking and future analysis.
   */
  async saveMetrics(
    daoId: string,
    userId: string,
    metrics: Record<string, number>,
    period: string,
  ): Promise<KnowledgeItem[]> {
    const saved: KnowledgeItem[] = [];

    for (const [name, value] of Object.entries(metrics)) {
      saved.push(
        await this.addKnowledge(daoId, {
          category: 'metric',
          title: `${name} (${period})`,
          content: `${name}: ${value} — recorded for period ${period}`,
          source: 'user_input',
          created_by: userId,
          tags: ['product-metric', period, name.toLowerCase().replace(/\s+/g, '-')],
        }),
      );
    }

    bus.emit({
      type: `module.${this.moduleId}.metrics.saved`,
      source: this.moduleId,
      dao_id: daoId,
      user_id: userId,
      payload: {
        metric_count: Object.keys(metrics).length,
        period,
        metric_names: Object.keys(metrics),
      },
    });

    return saved;
  }

  /**
   * Save a product goal into the knowledge base.
   */
  async saveProductGoal(
    daoId: string,
    userId: string,
    goal: { title: string; description: string; target_date?: string; tags?: string[] },
  ): Promise<KnowledgeItem> {
    const content = goal.target_date
      ? `${goal.description}\n\nTarget date: ${goal.target_date}`
      : goal.description;

    const item = await this.addKnowledge(daoId, {
      category: 'goal',
      title: `Product Goal: ${goal.title.substring(0, 80)}`,
      content,
      source: 'user_input',
      created_by: userId,
      tags: ['product-goal', ...(goal.tags ?? [])],
    });

    bus.emit({
      type: `module.${this.moduleId}.goal.saved`,
      source: this.moduleId,
      dao_id: daoId,
      user_id: userId,
      payload: { knowledgeId: item.id, title: goal.title },
    });

    return item;
  }

  // -----------------------------------------------------------------------
  // Override knowledge retrieval to prioritise product categories
  // -----------------------------------------------------------------------

  protected override async getRelevantKnowledge(
    daoId: string,
    _query: string,
    limit = 10,
  ): Promise<KnowledgeItem[]> {
    // Prioritise this module's core categories, then fall back to any category
    const rows = await this.db<KnowledgeItem>('knowledge_items')
      .where({ dao_id: daoId, module_id: this.moduleId })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString());
      })
      .orderByRaw(
        `CASE WHEN category IN (${this.coreCategories.map(() => '?').join(',')}) THEN 0 ELSE 1 END`,
        this.coreCategories,
      )
      .orderBy('confidence', 'desc')
      .orderBy('created_at', 'desc')
      .limit(limit);

    return rows.map((row) => ({
      ...(row as unknown as KnowledgeItem),
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags as unknown as string) : row.tags,
      embedding_vector:
        row.embedding_vector == null
          ? null
          : typeof row.embedding_vector === 'string'
            ? JSON.parse(row.embedding_vector as unknown as string)
            : row.embedding_vector,
    }));
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Lightweight heuristic to detect when a user's message contains
   * hints about product goals, resources, or metrics that should be persisted.
   */
  private extractKnowledgeHints(
    content: string,
  ): Array<{ category: KnowledgeCategory; hint: string }> {
    const hints: Array<{ category: KnowledgeCategory; hint: string }> = [];
    const lower = content.toLowerCase();

    // Goal indicators
    const goalPatterns = [
      /(?:our|my|the) product (?:goal|vision|strategy) is (.+?)(?:\.|$)/i,
      /(?:we want to|we aim to|we plan to|we need to) (?:build|ship|launch|deliver|release) (.+?)(?:\.|$)/i,
      /(?:roadmap|milestone|objective)[: ]+(.+?)(?:\.|$)/i,
      /(?:by q[1-4]|by end of|this quarter) .+ (?:we (?:want|need|plan) to) (.+?)(?:\.|$)/i,
    ];
    for (const pattern of goalPatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        hints.push({ category: 'goal', hint: match[1].trim() });
      }
    }

    // Resource indicators
    const resourcePatterns = [
      /(?:our team|we have|team size|capacity)[: ]+(.+?)(?:\.|$)/i,
      /(?:budget|runway|funding)[: ]+(.+?)(?:\.|$)/i,
      /(\d+)\s*(?:developers|engineers|designers|team members)/i,
    ];
    for (const pattern of resourcePatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        hints.push({ category: 'resource', hint: match[1].trim() });
      }
    }

    // Metric indicators
    if (
      lower.includes('mau') ||
      lower.includes('retention') ||
      lower.includes('nps') ||
      lower.includes('churn') ||
      lower.includes('conversion') ||
      lower.includes('dau') ||
      lower.includes('arpu') ||
      lower.includes('ltv') ||
      lower.includes('activation')
    ) {
      const metricPatterns = [
        /(?:mau|monthly active users)[: ]+(\d[\d,]*)/i,
        /(?:retention)[: ]+(\d+%?)/i,
        /(?:nps)[: ]+([+-]?\d+)/i,
        /(?:churn)[: ]+(\d+%?)/i,
        /(?:conversion)[: ]+(\d+%?)/i,
        /(?:dau|daily active users)[: ]+(\d[\d,]*)/i,
      ];
      for (const pattern of metricPatterns) {
        const match = content.match(pattern);
        if (match?.[1]) {
          hints.push({ category: 'metric', hint: `${match[0].trim()}` });
        }
      }

      // Fallback: if we detected metric keywords but no specific pattern matched
      if (hints.filter((h) => h.category === 'metric').length === 0) {
        const metricMatch = content.match(
          /(?:mau|retention|nps|churn|conversion|dau|arpu|ltv|activation)[: ].+?(?:\.|$)/i,
        );
        if (metricMatch?.[0]) {
          hints.push({ category: 'metric', hint: metricMatch[0].trim() });
        }
      }
    }

    return hints;
  }
}
