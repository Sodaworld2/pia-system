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
// Onboarding Frameworks & Types
// ---------------------------------------------------------------------------

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  category: 'setup' | 'education' | 'social' | 'contribution';
  required: boolean;
  estimated_minutes: number;
  completed: boolean;
  completed_at: string | null;
}

interface OnboardingPlan {
  member_role: string;
  experience_level: string;
  interests: string[];
  steps: OnboardingStep[];
  recommended_channels: string[];
  suggested_mentors: string[];
  estimated_total_minutes: number;
  created_at: string;
}

interface ReadinessAssessment {
  user_id: string;
  dao_id: string;
  overall_ready: boolean;
  completion_percentage: number;
  completed_steps: string[];
  pending_steps: string[];
  blockers: Array<{
    step_id: string;
    reason: string;
    suggestion: string;
  }>;
  assessed_at: string;
}

interface ContributionSuggestion {
  title: string;
  description: string;
  type: 'bounty' | 'task' | 'proposal' | 'documentation' | 'community';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimated_hours: number;
  skills_matched: string[];
  reason: string;
}

// ---------------------------------------------------------------------------
// Onboarding Module
// ---------------------------------------------------------------------------

/**
 * The Onboarding module guides new DAO members through setup, education,
 * and their first contributions. It personalises the onboarding journey
 * based on the member's role, experience, and stated interests.
 *
 * Knowledge categories used:
 *   - procedure  -- step-by-step processes and workflows
 *   - resource   -- guides, docs, links, and reference material
 *   - preference -- user/DAO preferences that tailor the onboarding flow
 */
export class OnboardingModule extends BaseModule {
  readonly moduleId: AIModuleId = 'onboarding';
  readonly moduleName = 'Onboarding';
  protected readonly version = '1.0.0';

  /** Categories this module primarily works with */
  private readonly coreCategories: KnowledgeCategory[] = [
    'procedure',
    'resource',
    'preference',
  ];

  protected readonly systemPrompt = `You are the Onboarding module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.

Your role is to help new DAO members get started and become productive contributors:
1. **New Member Onboarding** — Welcome new members and guide them through a structured onboarding process tailored to their role and experience.
2. **Guided Setup Flows** — Walk members through profile creation, wallet connection, notification preferences, and platform configuration step by step.
3. **DAO Explanation & Education** — Explain what a DAO is, how this specific DAO works, its mission, governance model, treasury, and culture at a level appropriate for the member.
4. **Role Assignment Recommendations** — Suggest suitable roles based on the member's skills, interests, and the DAO's current needs.
5. **Wallet Setup Guidance** — Provide clear, jargon-free instructions for setting up and connecting a Web3 wallet (MetaMask, WalletConnect, etc.), including security best practices.
6. **Voting System Tutorial** — Explain the DAO's governance model, how proposals work, voting mechanics (token-weighted, quadratic, conviction, etc.), quorum requirements, and how to cast a vote.
7. **First Contribution Suggestions** — Recommend beginner-friendly bounties, tasks, or proposals that match the member's skills and interests, lowering the barrier to their first meaningful contribution.
8. **Welcome Messaging** — Craft warm, informative welcome messages that set expectations, highlight key resources, and make new members feel valued.

Onboarding principles:
- Be warm, encouraging, and patient. New members may be unfamiliar with Web3 and DAOs.
- Never assume prior knowledge — adapt your explanations to the member's stated experience level.
- Break complex processes into small, clear steps with visual cues (numbered lists, checkmarks).
- Celebrate progress at every stage — completing setup steps, reading docs, casting a first vote.
- Provide links to relevant resources and documentation when available.
- Personalise the experience based on the member's role, skills, and interests.
- Flag any blockers or missing prerequisites early so the member is not stuck.
- Use inclusive language and avoid insider jargon unless the member is experienced.

When you learn something new about the member's preferences, skills, or onboarding progress, explicitly note it so the system can store it as knowledge.

Always respond in a structured, actionable way. Use markdown formatting.`;

  constructor(db: Knex) {
    super(db);
  }

  // -----------------------------------------------------------------------
  // Override processMessage to add onboarding-specific enrichment
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

    // Add onboarding-specific actions
    response.actions = response.actions ?? [];
    response.actions.push(
      {
        type: 'create_onboarding_plan',
        label: 'Create a personalised onboarding plan',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'assess_readiness',
        label: 'Check onboarding readiness',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'explain_concept',
        label: 'Explain a DAO concept',
        payload: { dao_id: message.dao_id },
      },
    );

    return response;
  }

  // -----------------------------------------------------------------------
  // Onboarding-specific public methods
  // -----------------------------------------------------------------------

  /**
   * Generate a personalised onboarding checklist for a new member based on
   * their assigned role, prior experience, and stated interests.
   */
  async generateOnboardingPlan(
    daoId: string,
    userId: string,
    params: { memberRole: string; experience: string; interests: string[] },
  ): Promise<AgentResponse> {
    const procedures = await this.getKnowledge(daoId, 'procedure');
    const resources = await this.getKnowledge(daoId, 'resource');
    const preferences = await this.getKnowledge(daoId, 'preference');

    const procedureSummary = procedures
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const resourceSummary = resources
      .map((r) => `- ${r.title}: ${r.content}`)
      .join('\n');

    const preferenceSummary = preferences
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const aiResponse = await this.processMessage({
      content: [
        `Create a personalised onboarding plan for a new member.`,
        '',
        `Member details:`,
        `- Role: ${params.memberRole}`,
        `- Experience level: ${params.experience}`,
        `- Interests: ${params.interests.join(', ')}`,
        '',
        'Existing onboarding procedures:',
        procedureSummary || '(none defined yet)',
        '',
        'Available resources:',
        resourceSummary || '(none defined yet)',
        '',
        'DAO preferences:',
        preferenceSummary || '(none defined yet)',
        '',
        'Please generate a structured onboarding plan with the following sections:',
        '1. **Welcome Message** — A warm, personalised greeting.',
        '2. **Setup Steps** — Account, wallet, profile, and notification setup (mark required vs optional).',
        '3. **Education Path** — Key concepts the member should understand, ordered by priority.',
        '4. **Social Integration** — Suggested channels, introductions, and community activities.',
        '5. **First Contributions** — 2-3 beginner-friendly tasks or bounties that match their interests.',
        '6. **Timeline** — Estimated time for each section and total onboarding duration.',
        '',
        'For each step, include: title, description, estimated minutes, and whether it is required or optional.',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'generate_onboarding_plan', ...params },
    });

    bus.emit({
      type: 'module.onboarding.plan.created',
      source: 'onboarding',
      dao_id: daoId,
      user_id: userId,
      payload: {
        memberRole: params.memberRole,
        experience: params.experience,
        interests: params.interests,
      },
    });

    return aiResponse;
  }

  /**
   * Assess whether a member has completed all required onboarding steps
   * and is ready to fully participate in the DAO.
   */
  async assessReadiness(
    daoId: string,
    userId: string,
  ): Promise<AgentResponse> {
    const allKnowledge = await this.getRelevantKnowledge(daoId, 'onboarding readiness', 20);
    const procedures = await this.getKnowledge(daoId, 'procedure');

    const knowledgeDump = allKnowledge
      .map((k) => `[${k.category}] ${k.title}: ${k.content}`)
      .join('\n');

    const procedureDump = procedures
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const aiResponse = await this.processMessage({
      content: [
        `Assess the onboarding readiness for user "${userId}" in this DAO.`,
        '',
        'Required onboarding procedures:',
        procedureDump || '(none defined — use default onboarding checklist)',
        '',
        'Accumulated knowledge about this member and DAO:',
        knowledgeDump || '(no data yet)',
        '',
        'Please evaluate:',
        '1. **Completion Status** — Which onboarding steps have been completed and which are pending?',
        '2. **Blockers** — Are there any blockers preventing the member from completing onboarding?',
        '3. **Overall Readiness** — Is the member ready to fully participate? (yes/no with reasoning)',
        '4. **Next Steps** — If not ready, what should they do next?',
        '5. **Completion Percentage** — Estimated percentage of onboarding complete.',
        '',
        'If there is insufficient data to make a determination, list the information that is needed and suggest how to gather it.',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'assess_readiness' },
    });

    bus.emit({
      type: 'module.onboarding.readiness.assessed',
      source: 'onboarding',
      dao_id: daoId,
      user_id: userId,
      payload: { userId },
    });

    return aiResponse;
  }

  /**
   * Recommend a first contribution for a new member based on their
   * skills, interests, and available time.
   */
  async recommendFirstContribution(
    daoId: string,
    userId: string,
    params: { skills: string[]; interests: string[]; timeAvailable: string },
  ): Promise<AgentResponse> {
    const resources = await this.getKnowledge(daoId, 'resource');
    const procedures = await this.getKnowledge(daoId, 'procedure');
    const preferences = await this.getKnowledge(daoId, 'preference');

    const resourceSummary = resources
      .map((r) => `- ${r.title}: ${r.content}`)
      .join('\n');

    const procedureSummary = procedures
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const preferenceSummary = preferences
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    // Also check for open bounties in the database
    const openBounties = await this.db('bounties')
      .where({ dao_id: daoId, status: 'open' })
      .orderBy('created_at', 'desc')
      .limit(10);

    const bountySummary = openBounties
      .map((b: { title: string; description: string; reward_amount: number; reward_token: string; tags: string | string[] }) => {
        const tags: string[] = typeof b.tags === 'string' ? JSON.parse(b.tags) : (b.tags ?? []);
        return `- ${b.title}: ${b.description} (Reward: ${b.reward_amount} ${b.reward_token}, Tags: ${tags.join(', ')})`;
      })
      .join('\n');

    const aiResponse = await this.processMessage({
      content: [
        `Recommend first contributions for a new member.`,
        '',
        'Member profile:',
        `- Skills: ${params.skills.join(', ')}`,
        `- Interests: ${params.interests.join(', ')}`,
        `- Time available: ${params.timeAvailable}`,
        '',
        'Open bounties:',
        bountySummary || '(no open bounties)',
        '',
        'Available resources:',
        resourceSummary || '(none)',
        '',
        'DAO procedures:',
        procedureSummary || '(none)',
        '',
        'DAO preferences:',
        preferenceSummary || '(none)',
        '',
        'Please suggest 3-5 first contributions, ordered by best match. For each suggestion:',
        '1. **Title** — Clear, descriptive name.',
        '2. **Type** — Bounty, task, proposal, documentation, or community.',
        '3. **Difficulty** — Beginner, intermediate, or advanced.',
        '4. **Estimated Hours** — How long it should take.',
        '5. **Skills Matched** — Which of the member\'s skills are relevant.',
        '6. **Why This?** — Why this is a good first contribution for this specific member.',
        '7. **How to Start** — Step-by-step instructions to begin.',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'recommend_first_contribution', ...params },
    });

    bus.emit({
      type: 'module.onboarding.contribution.recommended',
      source: 'onboarding',
      dao_id: daoId,
      user_id: userId,
      payload: {
        skills: params.skills,
        interests: params.interests,
        timeAvailable: params.timeAvailable,
      },
    });

    return aiResponse;
  }

  /**
   * Explain a DAO concept at the appropriate depth level for the member.
   * Topics can range from "what is a DAO" to specific governance mechanisms.
   */
  async explainDAO(
    daoId: string,
    userId: string,
    params: { topic: string; depth: 'beginner' | 'intermediate' | 'advanced' },
  ): Promise<AgentResponse> {
    const resources = await this.getKnowledge(daoId, 'resource');
    const procedures = await this.getKnowledge(daoId, 'procedure');

    const resourceSummary = resources
      .map((r) => `- ${r.title}: ${r.content}`)
      .join('\n');

    const procedureSummary = procedures
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const depthGuidance: Record<string, string> = {
      beginner: [
        'Use simple, everyday language. Avoid jargon entirely or define it immediately when first used.',
        'Use analogies to familiar concepts (e.g., "a DAO is like a club with transparent rules").',
        'Keep explanations short and visual — use bullet points and numbered steps.',
        'Do not assume any prior knowledge of blockchain, crypto, or governance.',
      ].join('\n'),
      intermediate: [
        'The member has basic understanding of blockchain and DAOs.',
        'You can use common Web3 terminology but explain advanced concepts.',
        'Include practical examples and comparisons between different approaches.',
        'Discuss trade-offs and nuances.',
      ].join('\n'),
      advanced: [
        'The member is experienced with DAOs and Web3.',
        'Use technical terminology freely.',
        'Focus on edge cases, attack vectors, game theory, and implementation details.',
        'Compare mechanisms across different protocols and reference research papers or proposals where relevant.',
        'Discuss cutting-edge developments and open questions in the space.',
      ].join('\n'),
    };

    const aiResponse = await this.processMessage({
      content: [
        `Explain the following DAO concept: "${params.topic}"`,
        '',
        `Depth level: ${params.depth}`,
        '',
        `Depth guidance:`,
        depthGuidance[params.depth],
        '',
        'DAO-specific resources:',
        resourceSummary || '(none available — use general knowledge)',
        '',
        'DAO-specific procedures:',
        procedureSummary || '(none available — use general knowledge)',
        '',
        'Please structure your explanation with:',
        '1. **Summary** — A one-sentence overview.',
        '2. **Explanation** — The main explanation at the appropriate depth.',
        '3. **How It Works Here** — How this concept applies specifically to this DAO (if known).',
        '4. **Examples** — Concrete examples to illustrate the concept.',
        '5. **Common Questions** — 2-3 frequently asked questions with answers.',
        '6. **Learn More** — Suggested next topics or resources for deeper understanding.',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'explain_dao', ...params },
    });

    bus.emit({
      type: 'module.onboarding.concept.explained',
      source: 'onboarding',
      dao_id: daoId,
      user_id: userId,
      payload: {
        topic: params.topic,
        depth: params.depth,
      },
    });

    return aiResponse;
  }

  // -----------------------------------------------------------------------
  // Knowledge persistence helpers
  // -----------------------------------------------------------------------

  /**
   * Save an onboarding plan into the knowledge base for future reference.
   */
  async saveOnboardingPlan(
    daoId: string,
    userId: string,
    plan: OnboardingPlan,
  ): Promise<KnowledgeItem[]> {
    const saved: KnowledgeItem[] = [];

    // Save the overall plan as a procedure
    saved.push(
      await this.addKnowledge(daoId, {
        category: 'procedure',
        title: `Onboarding plan: ${plan.member_role} (${plan.experience_level})`,
        content: [
          `Role: ${plan.member_role}`,
          `Experience: ${plan.experience_level}`,
          `Interests: ${plan.interests.join(', ')}`,
          `Total estimated time: ${plan.estimated_total_minutes} minutes`,
          '',
          'Steps:',
          ...plan.steps.map(
            (s) =>
              `  - [${s.completed ? 'x' : ' '}] ${s.title} (${s.category}, ${s.estimated_minutes}min, ${s.required ? 'required' : 'optional'})`,
          ),
        ].join('\n'),
        source: 'ai_derived',
        created_by: userId,
        tags: ['onboarding-plan', plan.member_role, plan.experience_level],
      }),
    );

    // Save recommended channels as a resource
    if (plan.recommended_channels.length > 0) {
      saved.push(
        await this.addKnowledge(daoId, {
          category: 'resource',
          title: `Recommended channels for ${plan.member_role}`,
          content: plan.recommended_channels.map((c) => `- ${c}`).join('\n'),
          source: 'ai_derived',
          created_by: userId,
          tags: ['onboarding-plan', 'channels', plan.member_role],
        }),
      );
    }

    // Save suggested mentors as a resource
    if (plan.suggested_mentors.length > 0) {
      saved.push(
        await this.addKnowledge(daoId, {
          category: 'resource',
          title: `Suggested mentors for ${plan.member_role}`,
          content: plan.suggested_mentors.map((m) => `- ${m}`).join('\n'),
          source: 'ai_derived',
          created_by: userId,
          tags: ['onboarding-plan', 'mentors', plan.member_role],
        }),
      );
    }

    // Save individual required steps as procedures
    for (const step of plan.steps.filter((s) => s.required)) {
      saved.push(
        await this.addKnowledge(daoId, {
          category: 'procedure',
          title: `Onboarding step: ${step.title}`,
          content: [
            `Category: ${step.category}`,
            `Description: ${step.description}`,
            `Estimated time: ${step.estimated_minutes} minutes`,
            `Required: ${step.required}`,
          ].join('\n'),
          source: 'ai_derived',
          created_by: userId,
          tags: ['onboarding-step', step.category, plan.member_role],
        }),
      );
    }

    return saved;
  }

  /**
   * Record that a member has completed a specific onboarding step.
   */
  async recordStepCompletion(
    daoId: string,
    userId: string,
    stepTitle: string,
  ): Promise<KnowledgeItem> {
    const item = await this.addKnowledge(daoId, {
      category: 'procedure',
      title: `Completed: ${stepTitle}`,
      content: `User ${userId} completed onboarding step "${stepTitle}" at ${new Date().toISOString()}.`,
      source: 'user_input',
      created_by: userId,
      tags: ['onboarding-completion', stepTitle],
    });

    bus.emit({
      type: 'module.onboarding.step.completed',
      source: 'onboarding',
      dao_id: daoId,
      user_id: userId,
      payload: {
        stepTitle,
        completedAt: new Date().toISOString(),
      },
    });

    return item;
  }

  // -----------------------------------------------------------------------
  // Override knowledge retrieval to prioritise onboarding categories
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
   * hints about procedures, resources, or preferences that should be persisted.
   */
  private extractKnowledgeHints(
    content: string,
  ): Array<{ category: KnowledgeCategory; hint: string }> {
    const hints: Array<{ category: KnowledgeCategory; hint: string }> = [];
    const lower = content.toLowerCase();

    // Procedure indicators
    const procedurePatterns = [
      /(?:the process is|steps? (?:are|is)|to (?:get started|begin|set up),?) (.+?)(?:\.|$)/i,
      /(?:first|then|next|finally)[, ]+(?:you |we )?(?:need to |should |must )?(.+?)(?:\.|$)/i,
      /(?:our onboarding|the workflow|the procedure) (?:is|involves|requires) (.+?)(?:\.|$)/i,
    ];
    for (const pattern of procedurePatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        hints.push({ category: 'procedure', hint: match[1].trim() });
      }
    }

    // Resource indicators
    const resourcePatterns = [
      /(?:check out|see|read|visit|refer to) (.+?)(?:\.|$)/i,
      /(?:documentation|guide|tutorial|wiki|handbook) (?:is |at |here:? ?)(.+?)(?:\.|$)/i,
      /(?:https?:\/\/\S+)/i,
    ];
    for (const pattern of resourcePatterns) {
      const match = content.match(pattern);
      if (match?.[1] || match?.[0]) {
        const hint = match[1]?.trim() ?? match[0].trim();
        hints.push({ category: 'resource', hint });
      }
    }

    // Preference indicators
    if (lower.includes('prefer') || lower.includes('rather') || lower.includes('style') || lower.includes('like to')) {
      const prefMatch = content.match(
        /(?:prefer|rather|style|like to)[: ](.+?)(?:\.|$)/i,
      );
      if (prefMatch?.[1]) {
        hints.push({ category: 'preference', hint: prefMatch[1].trim() });
      }
    }

    // Skill / experience indicators (save as preferences for tailoring)
    if (lower.includes('experience') || lower.includes('familiar with') || lower.includes('background in')) {
      const expMatch = content.match(
        /(?:experience (?:with|in)|familiar with|background in) (.+?)(?:\.|$)/i,
      );
      if (expMatch?.[1]) {
        hints.push({ category: 'preference', hint: `Experience: ${expMatch[1].trim()}` });
      }
    }

    return hints;
  }
}
