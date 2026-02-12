import type { Knex } from 'knex';
import type {
  AIModuleId,
  AgentMessage,
  AgentResponse,
  KnowledgeItem,
  KnowledgeCategory,
} from '../../../types/foundation';
import { BaseModule } from './base-module';

// ---------------------------------------------------------------------------
// Coaching Frameworks
// ---------------------------------------------------------------------------

interface OKR {
  objective: string;
  keyResults: Array<{
    description: string;
    target: number;
    current: number;
    unit: string;
  }>;
  quarter: string;
  status: 'on_track' | 'at_risk' | 'behind';
}

interface Milestone {
  title: string;
  description: string;
  due_date: string;
  dependencies: string[];
  completed: boolean;
}

interface CoachingPlan {
  goals: string[];
  okrs: OKR[];
  milestones: Milestone[];
  strengths: string[];
  areas_for_growth: string[];
  next_actions: string[];
}

// ---------------------------------------------------------------------------
// Coach Module
// ---------------------------------------------------------------------------

/**
 * The Coach module provides strategy guidance, goal-setting via OKRs,
 * milestone planning, and ongoing performance coaching for DAO members
 * and the DAO as a whole.
 *
 * Knowledge categories used:
 *   - goal       — strategic goals and objectives
 *   - strength   — identified strengths of the DAO or its members
 *   - preference — user/DAO preferences that inform coaching style
 */
export class CoachModule extends BaseModule {
  readonly moduleId: AIModuleId = 'coach';
  readonly moduleName = 'Coach';
  protected readonly version = '1.0.0';

  /** Categories this module primarily works with */
  private readonly coreCategories: KnowledgeCategory[] = [
    'goal',
    'strength',
    'preference',
  ];

  protected readonly systemPrompt = `You are the Coach module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.

Your role is to help DAO founders, leaders, and members with:
1. **Strategy & Vision** — Clarify the DAO's mission, vision, and strategic direction.
2. **OKR Tracking** — Help define Objectives and Key Results, track progress, and adjust when needed.
3. **Milestone Planning** — Break large goals into achievable milestones with clear deliverables and timelines.
4. **Performance Coaching** — Identify strengths, growth areas, and provide actionable feedback.
5. **Decision Support** — Help weigh options, consider trade-offs, and think through consequences.

Coaching principles:
- Ask clarifying questions before giving advice.
- Be direct and honest, but constructive.
- Ground recommendations in the DAO's stated goals and values.
- Use frameworks (OKR, SMART goals, SWOT) when they add clarity.
- Celebrate wins and progress, not just outcomes.
- Tailor your communication style to the user's preferences when known.

When you learn something new about the DAO's goals, strengths, or preferences, explicitly note it so the system can store it as knowledge.

Always respond in a structured, actionable way. Use markdown formatting.`;

  constructor(db: Knex) {
    super(db);
  }

  // -----------------------------------------------------------------------
  // Override processMessage to add coaching-specific enrichment
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

    // Add coaching-specific actions
    response.actions = response.actions ?? [];
    response.actions.push(
      {
        type: 'create_okr',
        label: 'Create an OKR from this conversation',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'create_milestone',
        label: 'Create a milestone',
        payload: { dao_id: message.dao_id },
      },
    );

    return response;
  }

  // -----------------------------------------------------------------------
  // Coaching-specific public methods
  // -----------------------------------------------------------------------

  /**
   * Generate or update an OKR set for a DAO based on its current goals
   * and the provided strategic context.
   */
  async generateOKRs(
    daoId: string,
    userId: string,
    context: { quarter: string; focus_areas: string[] },
  ): Promise<AgentResponse> {
    const goals = await this.getKnowledge(daoId, 'goal');
    const strengths = await this.getKnowledge(daoId, 'strength');

    const goalSummary = goals.map((g) => `- ${g.title}: ${g.content}`).join('\n');
    const strengthSummary = strengths.map((s) => `- ${s.title}: ${s.content}`).join('\n');

    return this.processMessage({
      content: `Generate OKRs for ${context.quarter}.\n\nFocus areas: ${context.focus_areas.join(', ')}\n\nExisting goals:\n${goalSummary}\n\nKnown strengths:\n${strengthSummary}\n\nPlease provide 2-3 objectives, each with 3-4 measurable key results.`,
      dao_id: daoId,
      user_id: userId,
      context: { action: 'generate_okrs', ...context },
    });
  }

  /**
   * Build a milestone plan for a specific objective.
   */
  async planMilestones(
    daoId: string,
    userId: string,
    objective: string,
    timeframeWeeks: number,
  ): Promise<AgentResponse> {
    const prefs = await this.getKnowledge(daoId, 'preference');
    const prefSummary = prefs.map((p) => `- ${p.title}: ${p.content}`).join('\n');

    return this.processMessage({
      content: `Create a milestone plan for the following objective:\n\n"${objective}"\n\nTimeframe: ${timeframeWeeks} weeks.\n\nPreferences / constraints:\n${prefSummary}\n\nBreak this into sequential milestones with clear deliverables, owners, and dependencies.`,
      dao_id: daoId,
      user_id: userId,
      context: { action: 'plan_milestones', objective, timeframeWeeks },
    });
  }

  /**
   * Run a SWOT analysis for the DAO based on accumulated knowledge.
   */
  async swotAnalysis(daoId: string, userId: string): Promise<AgentResponse> {
    const allKnowledge = await this.getRelevantKnowledge(daoId, 'swot analysis', 20);

    const knowledgeDump = allKnowledge
      .map((k) => `[${k.category}] ${k.title}: ${k.content}`)
      .join('\n');

    return this.processMessage({
      content: `Perform a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) for this DAO based on everything you know.\n\nAccumulated knowledge:\n${knowledgeDump}\n\nBe specific and actionable. For each quadrant, provide 3-5 items with brief explanations.`,
      dao_id: daoId,
      user_id: userId,
      context: { action: 'swot_analysis' },
    });
  }

  /**
   * Save a coaching plan into the knowledge base.
   */
  async saveCoachingPlan(
    daoId: string,
    userId: string,
    plan: CoachingPlan,
  ): Promise<KnowledgeItem[]> {
    const saved: KnowledgeItem[] = [];

    // Save goals
    for (const goal of plan.goals) {
      saved.push(
        await this.addKnowledge(daoId, {
          category: 'goal',
          title: `Goal: ${goal.substring(0, 80)}`,
          content: goal,
          source: 'user_input',
          created_by: userId,
          tags: ['coaching-plan'],
        }),
      );
    }

    // Save strengths
    for (const strength of plan.strengths) {
      saved.push(
        await this.addKnowledge(daoId, {
          category: 'strength',
          title: `Strength: ${strength.substring(0, 80)}`,
          content: strength,
          source: 'user_input',
          created_by: userId,
          tags: ['coaching-plan'],
        }),
      );
    }

    // Save OKRs as goals
    for (const okr of plan.okrs) {
      const content = [
        `Objective: ${okr.objective}`,
        `Quarter: ${okr.quarter}`,
        `Status: ${okr.status}`,
        'Key Results:',
        ...okr.keyResults.map(
          (kr) => `  - ${kr.description}: ${kr.current}/${kr.target} ${kr.unit}`,
        ),
      ].join('\n');

      saved.push(
        await this.addKnowledge(daoId, {
          category: 'goal',
          title: `OKR: ${okr.objective.substring(0, 80)}`,
          content,
          source: 'user_input',
          created_by: userId,
          tags: ['okr', okr.quarter, okr.status],
        }),
      );
    }

    return saved;
  }

  // -----------------------------------------------------------------------
  // Override knowledge retrieval to prioritise coaching categories
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
   * hints about goals, strengths, or preferences that should be persisted.
   */
  private extractKnowledgeHints(
    content: string,
  ): Array<{ category: KnowledgeCategory; hint: string }> {
    const hints: Array<{ category: KnowledgeCategory; hint: string }> = [];
    const lower = content.toLowerCase();

    // Goal indicators
    const goalPatterns = [
      /(?:our|my|the dao'?s?) goal is (.+?)(?:\.|$)/i,
      /(?:we want to|we aim to|we plan to|objective is) (.+?)(?:\.|$)/i,
      /(?:by q[1-4]|by end of) .+ (?:we (?:want|need|plan) to) (.+?)(?:\.|$)/i,
    ];
    for (const pattern of goalPatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        hints.push({ category: 'goal', hint: match[1].trim() });
      }
    }

    // Strength indicators
    if (lower.includes('strength') || lower.includes('good at') || lower.includes('excel at')) {
      const strengthMatch = content.match(
        /(?:strength|good at|excel at)[: ](.+?)(?:\.|$)/i,
      );
      if (strengthMatch?.[1]) {
        hints.push({ category: 'strength', hint: strengthMatch[1].trim() });
      }
    }

    // Preference indicators
    if (lower.includes('prefer') || lower.includes('rather') || lower.includes('style')) {
      const prefMatch = content.match(
        /(?:prefer|rather|style)[: ](.+?)(?:\.|$)/i,
      );
      if (prefMatch?.[1]) {
        hints.push({ category: 'preference', hint: prefMatch[1].trim() });
      }
    }

    return hints;
  }
}
