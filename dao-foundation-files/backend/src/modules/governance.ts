import type { Knex } from 'knex';
import type {
  AIModuleId,
  AgentMessage,
  AgentResponse,
  Proposal,
  KnowledgeItem,
  KnowledgeCategory,
} from '../types/foundation';
import { BaseModule } from './base-module';
import bus from '../events/bus';

// ---------------------------------------------------------------------------
// Governance Frameworks & Types
// ---------------------------------------------------------------------------

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
  top_proposal_types: Array<{ type: string; count: number }>;
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

// ---------------------------------------------------------------------------
// Governance Module
// ---------------------------------------------------------------------------

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
export class GovernanceModule extends BaseModule {
  readonly moduleId: AIModuleId = 'governance';
  readonly moduleName = 'Governance';
  protected readonly version = '1.0.0';

  /** Categories this module primarily works with */
  private readonly coreCategories: KnowledgeCategory[] = [
    'policy',
    'decision',
    'precedent',
  ];

  protected readonly systemPrompt = `You are the Governance module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.

Your role is to help DAO founders, leaders, and members with:
1. **Governance Structures** — Design, evaluate, and evolve governance frameworks tailored to the DAO's size, mission, and maturity stage.
2. **Voting Mechanisms** — Advise on and configure voting systems including token-weighted voting, quadratic voting, conviction voting, and holographic consensus. Explain trade-offs between plutocratic resistance, sybil resistance, and decision efficiency.
3. **Proposal Management** — Guide the full proposal lifecycle from ideation through discussion, voting, execution, and post-mortem. Ensure proposals are well-structured, clearly scoped, and actionable.
4. **Quorum Rules** — Recommend and calibrate quorum thresholds based on membership size, proposal importance, historical participation rates, and urgency.
5. **Delegation** — Manage vote delegation frameworks including liquid democracy, fixed delegation, and topic-based delegation. Track delegation chains and prevent circular delegations.
6. **Governance Parameter Tuning** — Continuously analyse governance health metrics and recommend adjustments to voting periods, quorum requirements, approval thresholds, and proposal submission criteria.
7. **DAO Constitutions** — Draft, review, and amend DAO constitutions and charters that codify the organisation's values, decision-making processes, member rights, and amendment procedures.

Governance principles:
- Legitimacy derives from broad participation and transparent processes.
- Favour progressive decentralisation — start simple, add complexity as the DAO matures.
- Balance efficiency (speed of decisions) with inclusivity (breadth of input).
- Every governance parameter should have a clear rationale tied to the DAO's values and goals.
- Guard against governance attacks: bribery, flash-loan voting, plutocratic capture, and voter apathy.
- Precedent matters — reference past decisions to maintain consistency, but allow evolution.
- Constitutional changes should require higher thresholds than ordinary proposals.
- Always consider minority protections and dissent mechanisms.
- Make governance accessible — plain language, clear timelines, low barriers to participation.

When analysing proposals or recommending parameters, always provide:
- Data-driven rationale (participation rates, historical outcomes, comparable DAOs)
- Risk assessment (what could go wrong, attack vectors, unintended consequences)
- Alternative options with trade-off analysis

When you learn something new about the DAO's governance decisions, policies, or precedents, explicitly note it so the system can store it as knowledge.

Always respond in a structured, actionable way. Use markdown formatting.`;

  constructor(db: Knex) {
    super(db);
  }

  // -----------------------------------------------------------------------
  // Override processMessage to add governance-specific enrichment
  // -----------------------------------------------------------------------

  override async processMessage(message: AgentMessage): Promise<AgentResponse> {
    const response = await super.processMessage(message);

    // Extract potential knowledge from the conversation
    const extracted = this.extractGovernanceHints(message.content);
    if (extracted.length > 0) {
      response.suggestions = response.suggestions ?? [];
      response.suggestions.push(
        ...extracted.map((e) => `I noticed a potential ${e.category}: "${e.hint}". Shall I save this?`),
      );
    }

    // Add governance-specific actions
    response.actions = response.actions ?? [];
    response.actions.push(
      {
        type: 'analyze_proposal',
        label: 'Analyse a proposal',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'draft_constitution',
        label: 'Draft or update DAO constitution',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'governance_report',
        label: 'Generate governance report',
        payload: { dao_id: message.dao_id },
      },
    );

    return response;
  }

  // -----------------------------------------------------------------------
  // Governance-specific public methods
  // -----------------------------------------------------------------------

  /**
   * Deep analysis of a proposal's impact, pros/cons, and comparison
   * against historical precedents and existing governance policies.
   */
  async analyzeProposal(
    daoId: string,
    userId: string,
    proposalId: string,
  ): Promise<{ response: AgentResponse; analysis: ProposalAnalysis }> {
    const proposal = await this.db<Proposal>('proposals')
      .where({ id: proposalId, dao_id: daoId })
      .first();

    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found in DAO ${daoId}`);
    }

    const policies = await this.getKnowledge(daoId, 'policy');
    const decisions = await this.getKnowledge(daoId, 'decision');
    const precedents = await this.getKnowledge(daoId, 'precedent');

    const policySummary = policies
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const decisionSummary = decisions
      .map((d) => `- ${d.title}: ${d.content}`)
      .join('\n');

    const precedentSummary = precedents
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    // Fetch vote counts for context if the proposal is in voting
    const votes = await this.db('votes')
      .where({ proposal_id: proposalId })
      .select('choice')
      .count('* as count')
      .groupBy('choice');

    const voteSummary = votes.length > 0
      ? votes.map((v) => `${v.choice}: ${v.count}`).join(', ')
      : 'No votes cast yet';

    const aiResponse = await this.processMessage({
      content: [
        `Analyse the following proposal in depth:`,
        '',
        `**Title:** ${proposal.title}`,
        `**Type:** ${proposal.type}`,
        `**Status:** ${proposal.status}`,
        `**Author:** ${proposal.author_id}`,
        `**Quorum Required:** ${proposal.quorum_required}%`,
        `**Approval Threshold:** ${proposal.approval_threshold}%`,
        `**Voting Period:** ${proposal.voting_starts_at ?? 'Not set'} to ${proposal.voting_ends_at ?? 'Not set'}`,
        '',
        '**Description:**',
        proposal.description,
        '',
        proposal.execution_payload
          ? `**Execution Payload:**\n\`\`\`json\n${JSON.stringify(proposal.execution_payload, null, 2)}\n\`\`\``
          : '',
        '',
        `**Current Votes:** ${voteSummary}`,
        '',
        '**Existing Governance Policies:**',
        policySummary || '(none recorded)',
        '',
        '**Past Decisions:**',
        decisionSummary || '(none recorded)',
        '',
        '**Relevant Precedents:**',
        precedentSummary || '(none recorded)',
        '',
        'Please provide a comprehensive analysis including:',
        '1. **Impact Assessment** — How does this affect treasury, governance, membership, and operations? (none/low/medium/high for each)',
        '2. **Pros** — Arguments in favour of this proposal',
        '3. **Cons** — Arguments against this proposal',
        '4. **Precedent Comparison** — How does this relate to past decisions?',
        '5. **Risk Assessment** — What could go wrong? (low/medium/high/critical)',
        '6. **Recommendation** — Support, oppose, abstain, or needs revision — with rationale',
        '7. **Suggested Amendments** — If applicable, how could the proposal be improved?',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'analyze_proposal', proposalId },
    });

    // Build structured analysis from AI response
    const analysis: ProposalAnalysis = {
      proposal_id: proposalId,
      impact_assessment: this.extractImpactAssessment(aiResponse.content),
      pros: this.extractListItems(aiResponse.content, 'pros'),
      cons: this.extractListItems(aiResponse.content, 'cons'),
      precedents: precedents.map((p) => p.title),
      risk_level: this.assessProposalRisk(aiResponse.content),
      recommendation: this.extractRecommendation(aiResponse.content),
      analyzed_at: new Date().toISOString(),
    };

    bus.emit({
      type: 'module.governance.proposal.analyzed',
      source: 'governance',
      dao_id: daoId,
      user_id: userId,
      payload: {
        proposalId,
        riskLevel: analysis.risk_level,
        recommendation: analysis.recommendation,
      },
    });

    // Store the analysis as a decision knowledge item
    await this.addKnowledge(daoId, {
      category: 'decision',
      title: `Analysis: ${proposal.title}`,
      content: `Proposal "${proposal.title}" (type: ${proposal.type}) was analysed on ${analysis.analyzed_at}. Risk: ${analysis.risk_level}. Recommendation: ${analysis.recommendation}. Pros: ${analysis.pros.length}. Cons: ${analysis.cons.length}.`,
      source: 'ai_derived',
      created_by: userId,
      tags: [proposal.type, analysis.risk_level, analysis.recommendation, 'proposal-analysis'],
    });

    return { response: aiResponse, analysis };
  }

  /**
   * Suggest optimal voting parameters (quorum, threshold, duration)
   * based on proposal type, membership size, and historical data.
   */
  async recommendVotingParameters(
    daoId: string,
    userId: string,
    params: { proposalType: string; memberCount: number },
  ): Promise<{ response: AgentResponse; parameters: VotingParameters }> {
    const policies = await this.getKnowledge(daoId, 'policy');
    const decisions = await this.getKnowledge(daoId, 'decision');

    const policySummary = policies
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const decisionSummary = decisions
      .map((d) => `- ${d.title}: ${d.content}`)
      .join('\n');

    // Fetch historical participation rates for this DAO
    const historicalProposals = await this.db<Proposal>('proposals')
      .where({ dao_id: daoId })
      .whereIn('status', ['passed', 'rejected', 'executed'])
      .orderBy('created_at', 'desc')
      .limit(20);

    let participationStats = 'No historical data available.';
    if (historicalProposals.length > 0) {
      const statsLines: string[] = [];
      for (const hp of historicalProposals) {
        const voteCount = await this.db('votes')
          .where({ proposal_id: hp.id })
          .count('* as count')
          .first();
        const count = Number(voteCount?.count ?? 0);
        const rate = params.memberCount > 0 ? ((count / params.memberCount) * 100).toFixed(1) : '0';
        statsLines.push(`- "${hp.title}" (${hp.type}, ${hp.status}): ${count} votes (${rate}% participation)`);
      }
      participationStats = statsLines.join('\n');
    }

    const aiResponse = await this.processMessage({
      content: [
        `Recommend voting parameters for a new proposal.`,
        '',
        `**Proposal Type:** ${params.proposalType}`,
        `**Current Member Count:** ${params.memberCount}`,
        '',
        '**Existing Governance Policies:**',
        policySummary || '(none recorded)',
        '',
        '**Past Decisions:**',
        decisionSummary || '(none recorded)',
        '',
        '**Historical Participation:**',
        participationStats,
        '',
        'Please recommend specific values for:',
        '1. **Quorum Percentage** — Minimum participation required (0-100%)',
        '2. **Approval Threshold** — Percentage of "yes" votes needed to pass (0-100%)',
        '3. **Voting Duration** — How long the voting period should last (in hours)',
        '4. **Voting Delay** — How long after proposal creation before voting starts (in hours)',
        '5. **Execution Delay** — How long after passing before execution (in hours, for timelock)',
        '6. **Recommended Voting Model** — Which voting mechanism is best suited (token-weighted, quadratic, conviction, holographic)',
        '7. **Rationale** — Explain your reasoning for each parameter',
        '',
        'Consider the proposal type severity, the DAO size, and historical participation rates.',
        'Governance changes and treasury spends should generally require higher thresholds than routine proposals.',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'recommend_voting_parameters', params },
    });

    // Extract structured parameters from AI response
    const votingParams: VotingParameters = this.extractVotingParameters(
      aiResponse.content,
      params.proposalType,
      params.memberCount,
    );

    bus.emit({
      type: 'module.governance.parameters.recommended',
      source: 'governance',
      dao_id: daoId,
      user_id: userId,
      payload: {
        proposalType: params.proposalType,
        memberCount: params.memberCount,
        quorum: votingParams.quorum_percentage,
        threshold: votingParams.approval_threshold,
        duration: votingParams.voting_duration_hours,
        model: votingParams.recommended_model,
      },
    });

    return { response: aiResponse, parameters: votingParams };
  }

  /**
   * Generate a comprehensive governance health report covering
   * participation metrics, proposal outcomes, and voter engagement
   * for a specified period.
   */
  async generateGovernanceReport(
    daoId: string,
    userId: string,
    params: { period: string },
  ): Promise<{ response: AgentResponse; metrics: GovernanceMetrics }> {
    // Determine the date range from the period string
    const periodStart = this.parsePeriodStart(params.period);
    const periodEnd = new Date().toISOString();

    // Fetch proposals within the period
    const proposals = await this.db<Proposal>('proposals')
      .where({ dao_id: daoId })
      .where('created_at', '>=', periodStart)
      .where('created_at', '<=', periodEnd);

    const passed = proposals.filter((p) => p.status === 'passed' || p.status === 'executed');
    const rejected = proposals.filter((p) => p.status === 'rejected');
    const cancelled = proposals.filter((p) => p.status === 'cancelled');

    // Fetch all votes for these proposals
    const proposalIds = proposals.map((p) => p.id);
    const allVotes = proposalIds.length > 0
      ? await this.db('votes').whereIn('proposal_id', proposalIds)
      : [];

    const uniqueVoters = new Set(allVotes.map((v: { user_id: string }) => v.user_id));

    // Calculate participation rates per proposal
    const memberCount = await this.db('dao_members')
      .where({ dao_id: daoId })
      .whereNull('left_at')
      .count('* as count')
      .first();
    const totalMembers = Number(memberCount?.count ?? 0);

    const participationRates: number[] = [];
    const approvalRates: number[] = [];
    const votingDurations: number[] = [];
    let quorumMet = 0;

    for (const proposal of proposals) {
      const proposalVotes = allVotes.filter(
        (v: { proposal_id: string }) => v.proposal_id === proposal.id,
      );
      const voterCount = proposalVotes.length;

      if (totalMembers > 0) {
        participationRates.push((voterCount / totalMembers) * 100);
      }

      const yesVotes = proposalVotes.filter(
        (v: { choice: string }) => v.choice === 'yes',
      ).length;
      if (voterCount > 0) {
        approvalRates.push((yesVotes / voterCount) * 100);
      }

      if (proposal.voting_starts_at && proposal.voting_ends_at) {
        const start = new Date(proposal.voting_starts_at).getTime();
        const end = new Date(proposal.voting_ends_at).getTime();
        votingDurations.push((end - start) / (1000 * 60 * 60));
      }

      if (totalMembers > 0 && (voterCount / totalMembers) * 100 >= proposal.quorum_required) {
        quorumMet++;
      }
    }

    const avg = (arr: number[]): number =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    // Aggregate proposal types
    const typeCounts: Record<string, number> = {};
    for (const proposal of proposals) {
      typeCounts[proposal.type] = (typeCounts[proposal.type] ?? 0) + 1;
    }
    const topTypes = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Fetch delegation stats if delegation table exists
    let delegationStats = { total_delegations: 0, unique_delegators: 0, unique_delegates: 0 };
    try {
      const delegations = await this.db('delegations')
        .where({ dao_id: daoId })
        .where('created_at', '>=', periodStart)
        .where('created_at', '<=', periodEnd);

      const delegators = new Set(delegations.map((d: { delegator_id: string }) => d.delegator_id));
      const delegates = new Set(delegations.map((d: { delegate_id: string }) => d.delegate_id));

      delegationStats = {
        total_delegations: delegations.length,
        unique_delegators: delegators.size,
        unique_delegates: delegates.size,
      };
    } catch {
      // Delegation table may not exist yet — silently continue
    }

    const metrics: GovernanceMetrics = {
      period: params.period,
      total_proposals: proposals.length,
      passed_proposals: passed.length,
      rejected_proposals: rejected.length,
      cancelled_proposals: cancelled.length,
      average_participation_rate: Math.round(avg(participationRates) * 100) / 100,
      average_approval_rate: Math.round(avg(approvalRates) * 100) / 100,
      unique_voters: uniqueVoters.size,
      total_votes_cast: allVotes.length,
      average_voting_duration_hours: Math.round(avg(votingDurations) * 100) / 100,
      quorum_achievement_rate:
        proposals.length > 0
          ? Math.round((quorumMet / proposals.length) * 100 * 100) / 100
          : 0,
      top_proposal_types: topTypes,
      delegation_stats: delegationStats,
    };

    const policies = await this.getKnowledge(daoId, 'policy');
    const policySummary = policies
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const aiResponse = await this.processMessage({
      content: [
        `Generate a governance health report for the period: ${params.period}.`,
        '',
        '**Raw Metrics:**',
        `- Total Proposals: ${metrics.total_proposals}`,
        `- Passed: ${metrics.passed_proposals}`,
        `- Rejected: ${metrics.rejected_proposals}`,
        `- Cancelled: ${metrics.cancelled_proposals}`,
        `- Average Participation Rate: ${metrics.average_participation_rate}%`,
        `- Average Approval Rate: ${metrics.average_approval_rate}%`,
        `- Unique Voters: ${metrics.unique_voters}`,
        `- Total Votes Cast: ${metrics.total_votes_cast}`,
        `- Average Voting Duration: ${metrics.average_voting_duration_hours} hours`,
        `- Quorum Achievement Rate: ${metrics.quorum_achievement_rate}%`,
        `- Total Members: ${totalMembers}`,
        '',
        '**Proposal Type Breakdown:**',
        ...topTypes.map((t) => `- ${t.type}: ${t.count}`),
        '',
        '**Delegation Stats:**',
        `- Total Delegations: ${metrics.delegation_stats.total_delegations}`,
        `- Unique Delegators: ${metrics.delegation_stats.unique_delegators}`,
        `- Unique Delegates: ${metrics.delegation_stats.unique_delegates}`,
        '',
        '**Existing Governance Policies:**',
        policySummary || '(none recorded)',
        '',
        'Please provide:',
        '1. **Executive Summary** — Key takeaways about governance health',
        '2. **Participation Analysis** — Is participation healthy? Trends and concerns',
        '3. **Decision Quality** — Are proposals passing/failing at appropriate rates?',
        '4. **Voter Engagement** — Are the same people always voting? Is there voter fatigue?',
        '5. **Delegation Health** — Is delegation being used effectively?',
        '6. **Risk Factors** — Governance attacks, centralisation concerns, apathy risks',
        '7. **Recommendations** — Specific, actionable improvements to governance parameters and processes',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'governance_report', params, metrics },
    });

    bus.emit({
      type: 'module.governance.report.generated',
      source: 'governance',
      dao_id: daoId,
      user_id: userId,
      payload: {
        period: params.period,
        totalProposals: metrics.total_proposals,
        participationRate: metrics.average_participation_rate,
        quorumRate: metrics.quorum_achievement_rate,
      },
    });

    return { response: aiResponse, metrics };
  }

  /**
   * Draft or update a DAO constitution or charter that codifies
   * the organisation's governance model, values, decision-making
   * processes, and amendment procedures.
   */
  async draftConstitution(
    daoId: string,
    userId: string,
    params: { governanceModel: string; values: string[] },
  ): Promise<{ response: AgentResponse; draft: ConstitutionDraft }> {
    const policies = await this.getKnowledge(daoId, 'policy');
    const decisions = await this.getKnowledge(daoId, 'decision');
    const precedents = await this.getKnowledge(daoId, 'precedent');

    const policySummary = policies
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const decisionSummary = decisions
      .map((d) => `- ${d.title}: ${d.content}`)
      .join('\n');

    const precedentSummary = precedents
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    // Fetch DAO details for context
    const dao = await this.db('daos')
      .where({ id: daoId })
      .first();

    const daoContext = dao
      ? [
          `**DAO Name:** ${dao.name}`,
          `**Mission:** ${dao.mission ?? 'Not defined'}`,
          `**Phase:** ${dao.phase}`,
          `**Current Governance Model:** ${dao.governance_model}`,
        ].join('\n')
      : 'DAO details not available.';

    // Fetch membership count for context
    const memberCount = await this.db('dao_members')
      .where({ dao_id: daoId })
      .whereNull('left_at')
      .count('* as count')
      .first();
    const totalMembers = Number(memberCount?.count ?? 0);

    const aiResponse = await this.processMessage({
      content: [
        `Draft a DAO constitution/charter based on the following parameters:`,
        '',
        '**DAO Context:**',
        daoContext,
        `**Member Count:** ${totalMembers}`,
        '',
        `**Governance Model:** ${params.governanceModel}`,
        `**Core Values:** ${params.values.join(', ')}`,
        '',
        '**Existing Policies:**',
        policySummary || '(none recorded)',
        '',
        '**Past Governance Decisions:**',
        decisionSummary || '(none recorded)',
        '',
        '**Established Precedents:**',
        precedentSummary || '(none recorded)',
        '',
        'Please draft a complete constitution with the following structure:',
        '',
        '1. **Preamble** — Purpose, identity, and aspirational statement',
        '2. **Article I: Name and Mission** — Official name, mission statement, and scope',
        '3. **Article II: Membership** — Eligibility, onboarding, roles, rights, obligations, and removal',
        '4. **Article III: Governance Structure** — Decision-making bodies, their composition, and authority',
        `5. **Article IV: Voting Mechanism** — Detailed rules for the ${params.governanceModel} voting system, including quorum, thresholds, and delegation`,
        '6. **Article V: Proposal Process** — How proposals are submitted, discussed, voted on, and executed',
        '7. **Article VI: Treasury Management** — How funds are managed, spending authorised, and audited',
        '8. **Article VII: Core Values and Code of Conduct** — Encoding the stated values into behavioural expectations',
        '9. **Article VIII: Dispute Resolution** — How conflicts are mediated and resolved',
        '10. **Article IX: Amendments** — How this constitution can be modified (should require supermajority)',
        '11. **Article X: Dissolution** — Conditions and process for winding down the DAO',
        '',
        'For each article:',
        '- Use clear, plain language accessible to non-lawyers',
        '- Include specific numeric thresholds where applicable',
        '- Consider edge cases and failure modes',
        '- Align all provisions with the stated values',
        '',
        `Ensure the constitution reflects a ${params.governanceModel} governance approach throughout.`,
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'draft_constitution', params },
    });

    // Parse the AI response into a structured constitution draft
    const draft = this.parseConstitutionDraft(aiResponse.content, params.governanceModel);

    bus.emit({
      type: 'module.governance.constitution.drafted',
      source: 'governance',
      dao_id: daoId,
      user_id: userId,
      payload: {
        governanceModel: params.governanceModel,
        values: params.values,
        articleCount: draft.articles.length,
      },
    });

    // Store the constitution as a policy knowledge item
    await this.addKnowledge(daoId, {
      category: 'policy',
      title: `Constitution Draft (${params.governanceModel})`,
      content: `DAO constitution drafted on ${new Date().toISOString()} using ${params.governanceModel} governance model. Values: ${params.values.join(', ')}. Contains ${draft.articles.length} articles.`,
      source: 'ai_derived',
      created_by: userId,
      tags: ['constitution', params.governanceModel, ...params.values.map((v) => v.toLowerCase().replace(/\s+/g, '-'))],
    });

    return { response: aiResponse, draft };
  }

  // -----------------------------------------------------------------------
  // Override knowledge retrieval to prioritise governance categories
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
   * hints about policies, decisions, or precedents that should be persisted.
   */
  private extractGovernanceHints(
    content: string,
  ): Array<{ category: KnowledgeCategory; hint: string }> {
    const hints: Array<{ category: KnowledgeCategory; hint: string }> = [];
    const lower = content.toLowerCase();

    // Policy indicators
    const policyPatterns = [
      /(?:our|the dao'?s?) (?:policy|rule|procedure) (?:is|states|requires) (.+?)(?:\.|$)/i,
      /(?:we (?:always|never|require|mandate)) (.+?)(?:\.|$)/i,
      /(?:governance (?:rule|policy|requirement))[: ](.+?)(?:\.|$)/i,
    ];
    for (const pattern of policyPatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        hints.push({ category: 'policy', hint: match[1].trim() });
      }
    }

    // Decision indicators
    const decisionPatterns = [
      /(?:we (?:decided|voted|agreed|resolved)) (?:to |that )(.+?)(?:\.|$)/i,
      /(?:the (?:proposal|motion|vote)) (?:passed|failed|was approved|was rejected) (.+?)(?:\.|$)/i,
      /(?:decision)[: ](.+?)(?:\.|$)/i,
    ];
    for (const pattern of decisionPatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        hints.push({ category: 'decision', hint: match[1].trim() });
      }
    }

    // Precedent indicators
    if (
      lower.includes('precedent') ||
      lower.includes('last time') ||
      lower.includes('previously') ||
      lower.includes('in the past')
    ) {
      const precedentMatch = content.match(
        /(?:precedent|last time|previously|in the past)[,: ]+(.+?)(?:\.|$)/i,
      );
      if (precedentMatch?.[1]) {
        hints.push({ category: 'precedent', hint: precedentMatch[1].trim() });
      }
    }

    // Quorum / threshold indicators
    if (lower.includes('quorum') || lower.includes('threshold') || lower.includes('supermajority')) {
      const quorumMatch = content.match(
        /(?:quorum|threshold|supermajority)[: ]+(.+?)(?:\.|$)/i,
      );
      if (quorumMatch?.[1]) {
        hints.push({ category: 'policy', hint: `Voting rule: ${quorumMatch[1].trim()}` });
      }
    }

    return hints;
  }

  /**
   * Extract impact assessment levels from the AI analysis content.
   */
  private extractImpactAssessment(
    content: string,
  ): ProposalAnalysis['impact_assessment'] {
    const assessLevel = (keyword: string): 'none' | 'low' | 'medium' | 'high' => {
      const pattern = new RegExp(`${keyword}[^.]*?(none|low|medium|high)`, 'i');
      const match = content.match(pattern);
      if (match?.[1]) {
        return match[1].toLowerCase() as 'none' | 'low' | 'medium' | 'high';
      }
      return 'low';
    };

    return {
      treasury: assessLevel('treasury'),
      governance: assessLevel('governance'),
      membership: assessLevel('membership'),
      operations: assessLevel('operations'),
    };
  }

  /**
   * Extract list items (pros or cons) from the AI analysis content.
   */
  private extractListItems(content: string, section: string): string[] {
    const items: string[] = [];
    const sectionPattern = new RegExp(
      `(?:\\*\\*${section}\\*\\*|## ${section}|### ${section})([\\s\\S]*?)(?=(?:\\*\\*|## |### |$))`,
      'i',
    );
    const match = content.match(sectionPattern);

    if (match?.[1]) {
      const lines = match[1].split('\n');
      for (const line of lines) {
        const cleaned = line.replace(/^[-*•\d.]+\s*/, '').trim();
        if (cleaned.length > 5) {
          items.push(cleaned);
        }
      }
    }

    return items;
  }

  /**
   * Determine the overall risk level from the proposal analysis content.
   */
  private assessProposalRisk(
    content: string,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const lower = content.toLowerCase();
    const criticalCount = (lower.match(/critical|severe|dangerous|exploit|attack/g) ?? []).length;
    const highCount = (lower.match(/high risk|significant risk|major concern/g) ?? []).length;
    const mediumCount = (lower.match(/medium risk|moderate risk|some concern|caution/g) ?? []).length;

    if (criticalCount >= 2) return 'critical';
    if (criticalCount >= 1 || highCount >= 2) return 'high';
    if (highCount >= 1 || mediumCount >= 2) return 'medium';
    return 'low';
  }

  /**
   * Extract the recommendation from the AI analysis content.
   */
  private extractRecommendation(
    content: string,
  ): 'support' | 'oppose' | 'abstain' | 'needs_revision' {
    const lower = content.toLowerCase();

    if (lower.includes('needs revision') || lower.includes('needs amendment') || lower.includes('revise')) {
      return 'needs_revision';
    }
    if (lower.includes('recommend opposing') || lower.includes('recommend against') || lower.includes('vote against')) {
      return 'oppose';
    }
    if (lower.includes('recommend abstaining') || lower.includes('abstain')) {
      return 'abstain';
    }
    if (lower.includes('recommend supporting') || lower.includes('support') || lower.includes('vote in favour') || lower.includes('vote in favor')) {
      return 'support';
    }

    return 'needs_revision';
  }

  /**
   * Extract structured voting parameters from the AI response.
   * Falls back to sensible defaults based on proposal type and member count.
   */
  private extractVotingParameters(
    content: string,
    proposalType: string,
    memberCount: number,
  ): VotingParameters {
    const extractNumber = (keyword: string, fallback: number): number => {
      const pattern = new RegExp(`${keyword}[^\\d]*(\\d+(?:\\.\\d+)?)`, 'i');
      const match = content.match(pattern);
      return match?.[1] ? parseFloat(match[1]) : fallback;
    };

    // Determine defaults based on proposal type severity
    const isHighStakes = ['governance_change', 'parameter_change'].includes(proposalType);
    const isTreasury = proposalType === 'treasury_spend';
    const isRoutine = ['membership', 'bounty', 'custom'].includes(proposalType);

    let defaultQuorum: number;
    let defaultThreshold: number;
    let defaultDuration: number;

    if (isHighStakes) {
      defaultQuorum = Math.min(40, Math.max(20, 200 / Math.sqrt(memberCount || 1)));
      defaultThreshold = 67;
      defaultDuration = 168; // 7 days
    } else if (isTreasury) {
      defaultQuorum = Math.min(30, Math.max(15, 150 / Math.sqrt(memberCount || 1)));
      defaultThreshold = 60;
      defaultDuration = 120; // 5 days
    } else if (isRoutine) {
      defaultQuorum = Math.min(20, Math.max(10, 100 / Math.sqrt(memberCount || 1)));
      defaultThreshold = 51;
      defaultDuration = 72; // 3 days
    } else {
      defaultQuorum = Math.min(25, Math.max(10, 120 / Math.sqrt(memberCount || 1)));
      defaultThreshold = 55;
      defaultDuration = 96; // 4 days
    }

    const quorum = extractNumber('quorum', defaultQuorum);
    const threshold = extractNumber('(?:approval|threshold)', defaultThreshold);
    const duration = extractNumber('(?:voting duration|voting period)', defaultDuration);
    const delay = extractNumber('(?:voting delay|delay before)', isHighStakes ? 48 : 24);
    const executionDelay = extractNumber('(?:execution delay|timelock)', isHighStakes ? 48 : 24);

    // Extract recommended model
    let recommendedModel = 'token_weighted';
    const lower = content.toLowerCase();
    if (lower.includes('quadratic')) recommendedModel = 'quadratic';
    else if (lower.includes('conviction')) recommendedModel = 'conviction';
    else if (lower.includes('holographic')) recommendedModel = 'holographic';
    else if (lower.includes('token-weighted') || lower.includes('token weighted')) recommendedModel = 'token_weighted';

    return {
      quorum_percentage: Math.round(quorum * 100) / 100,
      approval_threshold: Math.round(threshold * 100) / 100,
      voting_duration_hours: Math.round(duration),
      voting_delay_hours: Math.round(delay),
      execution_delay_hours: Math.round(executionDelay),
      recommended_model: recommendedModel,
      rationale: content.substring(0, 500),
    };
  }

  /**
   * Parse the AI-generated constitution content into a structured draft.
   */
  private parseConstitutionDraft(
    content: string,
    governanceModel: string,
  ): ConstitutionDraft {
    const articles: ConstitutionSection[] = [];
    let preamble = '';

    // Extract preamble (text before first article)
    const preambleMatch = content.match(
      /(?:preamble|^)([\s\S]*?)(?=(?:article\s+[iv\d]+|## article))/i,
    );
    if (preambleMatch?.[1]) {
      preamble = preambleMatch[1]
        .replace(/^#+\s*preamble\s*/i, '')
        .replace(/^\*\*preamble\*\*\s*/i, '')
        .trim();
    }

    // Extract articles using various heading patterns
    const articlePattern =
      /(?:#{1,3}\s*)?(?:\*\*)?Article\s+([IVXLCDM]+|\d+)[:.]\s*(.+?)(?:\*\*)?[\n\r]([\s\S]*?)(?=(?:(?:#{1,3}\s*)?(?:\*\*)?Article\s+[IVXLCDM\d]+|$))/gi;

    let match: RegExpExecArray | null;
    let articleIndex = 1;

    while ((match = articlePattern.exec(content)) !== null) {
      articles.push({
        article_number: articleIndex,
        title: match[2].replace(/\*\*/g, '').trim(),
        content: match[3].trim(),
      });
      articleIndex++;
    }

    // If no articles were parsed, treat the whole content as a single article
    if (articles.length === 0) {
      articles.push({
        article_number: 1,
        title: 'Complete Constitution',
        content: content,
      });
    }

    // Extract amendments process from Article IX or equivalent
    const amendmentsArticle = articles.find(
      (a) =>
        a.title.toLowerCase().includes('amendment') ||
        a.title.toLowerCase().includes('modification'),
    );

    // Extract ratification requirements
    const ratificationPattern = /(?:ratif|adopt|enact)[^.]*?(\d+%?[^.]*\.)/i;
    const ratificationMatch = content.match(ratificationPattern);

    return {
      preamble: preamble || `This constitution establishes the governance framework for this DAO, built on the ${governanceModel} model.`,
      articles,
      amendments_process: amendmentsArticle?.content ?? 'Amendment process requires a supermajority vote (67% approval) with elevated quorum requirements.',
      ratification_requirements: ratificationMatch?.[1]?.trim() ?? 'Ratification requires approval by two-thirds of all active members.',
      effective_date: new Date().toISOString(),
    };
  }

  /**
   * Parse a human-readable period string into an ISO date string
   * representing the start of the period.
   */
  private parsePeriodStart(period: string): string {
    const now = new Date();
    const lower = period.toLowerCase().trim();

    // Handle "last N days/weeks/months"
    const lastNMatch = lower.match(/last\s+(\d+)\s+(day|week|month|year)s?/);
    if (lastNMatch) {
      const n = parseInt(lastNMatch[1], 10);
      const unit = lastNMatch[2];
      const start = new Date(now);

      switch (unit) {
        case 'day':
          start.setDate(start.getDate() - n);
          break;
        case 'week':
          start.setDate(start.getDate() - n * 7);
          break;
        case 'month':
          start.setMonth(start.getMonth() - n);
          break;
        case 'year':
          start.setFullYear(start.getFullYear() - n);
          break;
      }

      return start.toISOString();
    }

    // Handle quarter references like "Q1 2025"
    const quarterMatch = lower.match(/q([1-4])\s*(\d{4})/);
    if (quarterMatch) {
      const quarter = parseInt(quarterMatch[1], 10);
      const year = parseInt(quarterMatch[2], 10);
      const month = (quarter - 1) * 3;
      return new Date(year, month, 1).toISOString();
    }

    // Handle year references like "2025"
    const yearMatch = lower.match(/^(\d{4})$/);
    if (yearMatch) {
      return new Date(parseInt(yearMatch[1], 10), 0, 1).toISOString();
    }

    // Handle month references like "January 2025"
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    for (let i = 0; i < monthNames.length; i++) {
      if (lower.includes(monthNames[i])) {
        const yearInMonth = lower.match(/(\d{4})/);
        const year = yearInMonth ? parseInt(yearInMonth[1], 10) : now.getFullYear();
        return new Date(year, i, 1).toISOString();
      }
    }

    // Default: last 30 days
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() - 30);
    return fallback.toISOString();
  }
}
