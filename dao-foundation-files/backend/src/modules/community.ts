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
// Community Frameworks & Types
// ---------------------------------------------------------------------------

interface EngagementMetrics {
  period: string;
  total_members: number;
  active_members: number;
  new_members: number;
  messages_sent: number;
  proposals_created: number;
  votes_cast: number;
  events_attended: number;
  retention_rate: number;
  engagement_score: number;
  trends: Array<{
    metric: string;
    direction: 'up' | 'down' | 'stable';
    change_percentage: number;
    insight: string;
  }>;
}

interface Announcement {
  topic: string;
  audience: string;
  tone: string;
  subject: string;
  body: string;
  call_to_action: string;
  channels: string[];
  scheduled_at: string | null;
}

interface ConflictResolution {
  parties: string[];
  issue: string;
  context: string;
  root_causes: string[];
  recommendations: Array<{
    action: string;
    responsible_party: string;
    priority: 'immediate' | 'short_term' | 'long_term';
    description: string;
  }>;
  mediation_steps: string[];
  preventive_measures: string[];
  follow_up_date: string | null;
}

interface EventPlan {
  type: string;
  title: string;
  audience: string;
  goals: string[];
  agenda: Array<{
    time: string;
    activity: string;
    speaker: string | null;
    duration_minutes: number;
  }>;
  logistics: {
    platform: string;
    date_suggestion: string;
    duration_minutes: number;
    max_attendees: number | null;
    resources_needed: string[];
  };
  promotion: {
    channels: string[];
    messaging: string;
    timeline: string[];
  };
  success_metrics: string[];
}

// ---------------------------------------------------------------------------
// Community Module
// ---------------------------------------------------------------------------

/**
 * The Community module handles member engagement, onboarding, communications,
 * conflict resolution, event planning, and contributor recognition for DAOs.
 *
 * Knowledge categories used:
 *   - contact    -- member profiles, contacts, and communication preferences
 *   - preference -- community norms, communication styles, and cultural values
 *   - resource   -- community tools, channels, guides, and shared assets
 */
export class CommunityModule extends BaseModule {
  readonly moduleId: AIModuleId = 'community';
  readonly moduleName = 'Community';
  protected readonly version = '1.0.0';

  /** Categories this module primarily works with */
  private readonly coreCategories: KnowledgeCategory[] = [
    'contact',
    'preference',
    'resource',
  ];

  protected readonly systemPrompt = `You are the Community module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.

Your role is to help DAO founders, leaders, and members with:
1. **Community Management** — Oversee the health, growth, and day-to-day operations of the DAO community. Monitor member satisfaction, set community guidelines, and ensure a welcoming environment.
2. **Member Engagement** — Track participation, identify disengaged members, suggest re-engagement strategies, and celebrate active contributors. Provide actionable insights on engagement metrics and trends.
3. **Onboarding Workflows** — Design and optimise onboarding experiences for new members. Create welcome sequences, orientation materials, role-assignment guides, and first-contribution pathways.
4. **Communication Strategies** — Draft announcements, newsletters, and updates. Advise on tone, timing, channel selection, and audience segmentation. Help maintain a consistent community voice.
5. **Conflict Resolution** — Mediate disputes between members with structured, fair approaches. Identify root causes, propose resolutions, and establish preventive measures. Always remain neutral and empathetic.
6. **Culture Building** — Help define and reinforce the DAO's culture, values, and norms. Suggest rituals, traditions, and practices that strengthen community identity and belonging.
7. **Event Planning** — Help plan community events such as town halls, AMAs, hackathons, workshops, and social gatherings. Provide agendas, logistics checklists, and promotion strategies.
8. **Contributor Recognition** — Design recognition programmes, track contributions, suggest reward mechanisms, and help celebrate member achievements publicly.

Community management principles:
- Lead with empathy and inclusivity in all interactions.
- Listen before advising — understand the community's unique dynamics and history.
- Be data-informed but people-centred; metrics support decisions, they do not replace judgment.
- Encourage transparency and open communication at every level.
- Respect cultural differences and time zones across a global membership.
- Prioritise psychological safety — members should feel safe to speak up, disagree, and make mistakes.
- Recognise contributions early and often, both publicly and privately.
- Design for accessibility — ensure events, communications, and processes are inclusive.
- When handling conflicts, remain neutral and focus on interests rather than positions.
- Tailor communication style and channel to the audience and context.

When you learn something new about community members, preferences, or resources, explicitly note it so the system can store it as knowledge.

Always respond in a structured, actionable way. Use markdown formatting.`;

  constructor(db: Knex) {
    super(db);
  }

  // -----------------------------------------------------------------------
  // Override processMessage to add community-specific enrichment
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

    // Add community-specific actions
    response.actions = response.actions ?? [];
    response.actions.push(
      {
        type: 'draft_announcement',
        label: 'Draft a community announcement',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'plan_event',
        label: 'Plan a community event',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'engagement_report',
        label: 'Generate an engagement report',
        payload: { dao_id: message.dao_id },
      },
    );

    return response;
  }

  // -----------------------------------------------------------------------
  // Community-specific public methods
  // -----------------------------------------------------------------------

  /**
   * Analyse member activity, participation trends, and engagement metrics
   * for the DAO over a given period.
   */
  async analyzeEngagement(
    daoId: string,
    userId: string,
    params: { period: string },
  ): Promise<AgentResponse> {
    const contacts = await this.getKnowledge(daoId, 'contact');
    const preferences = await this.getKnowledge(daoId, 'preference');
    const resources = await this.getKnowledge(daoId, 'resource');

    const contactSummary = contacts
      .map((c) => `- ${c.title}: ${c.content}`)
      .join('\n');

    const preferenceSummary = preferences
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const resourceSummary = resources
      .map((r) => `- ${r.title}: ${r.content}`)
      .join('\n');

    const aiResponse = await this.processMessage({
      content: [
        `Analyse community engagement for the period: ${params.period}.`,
        '',
        'Please provide a comprehensive engagement report including:',
        '1. **Overall Engagement Score** — A 0-100 score with explanation',
        '2. **Active vs Inactive Members** — Breakdown and percentages',
        '3. **Participation Trends** — How has activity changed over the period?',
        '4. **Top Contributors** — Who has been most active and in what ways?',
        '5. **At-Risk Members** — Members showing declining engagement',
        '6. **Channel Activity** — Which communication channels are most/least active?',
        '7. **Content Performance** — What types of posts/announcements get the most engagement?',
        '8. **Recommendations** — Specific, actionable suggestions to improve engagement',
        '',
        'Known community members:',
        contactSummary || '(no member data yet)',
        '',
        'Community preferences and norms:',
        preferenceSummary || '(no preferences recorded yet)',
        '',
        'Available resources and channels:',
        resourceSummary || '(no resources recorded yet)',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'analyze_engagement', period: params.period },
    });

    bus.emit({
      type: 'module.community.engagement.analyzed',
      source: 'community',
      dao_id: daoId,
      user_id: userId,
      payload: {
        period: params.period,
      },
    });

    return aiResponse;
  }

  /**
   * Draft a community announcement tailored to the specified audience and tone.
   */
  async draftAnnouncement(
    daoId: string,
    userId: string,
    params: { topic: string; audience: string; tone: string },
  ): Promise<AgentResponse> {
    const preferences = await this.getKnowledge(daoId, 'preference');
    const resources = await this.getKnowledge(daoId, 'resource');

    const preferenceSummary = preferences
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const resourceSummary = resources
      .map((r) => `- ${r.title}: ${r.content}`)
      .join('\n');

    const aiResponse = await this.processMessage({
      content: [
        `Draft a community announcement about: ${params.topic}`,
        '',
        `Target audience: ${params.audience}`,
        `Desired tone: ${params.tone}`,
        '',
        'Please provide:',
        '1. **Subject Line** — A compelling, concise subject/headline',
        '2. **Body** — The full announcement text, well-structured with clear sections',
        '3. **Call to Action** — What should readers do after reading?',
        '4. **Recommended Channels** — Where should this be posted? (Discord, forum, email, Twitter, etc.)',
        '5. **Timing Suggestion** — Best time/day to publish for maximum reach',
        '6. **Variations** — Provide a short version (for Twitter/chat) and a long version (for email/forum)',
        '',
        'Community communication preferences:',
        preferenceSummary || '(no preferences recorded yet)',
        '',
        'Available channels and resources:',
        resourceSummary || '(no resources recorded yet)',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'draft_announcement', ...params },
    });

    bus.emit({
      type: 'module.community.announcement.drafted',
      source: 'community',
      dao_id: daoId,
      user_id: userId,
      payload: {
        topic: params.topic,
        audience: params.audience,
        tone: params.tone,
      },
    });

    return aiResponse;
  }

  /**
   * Provide mediation assistance for a conflict between community members,
   * with structured recommendations and follow-up steps.
   */
  async resolveConflict(
    daoId: string,
    userId: string,
    params: { parties: string[]; issue: string; context: string },
  ): Promise<AgentResponse> {
    const preferences = await this.getKnowledge(daoId, 'preference');
    const contacts = await this.getKnowledge(daoId, 'contact');

    const preferenceSummary = preferences
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    // Look for any existing knowledge about the involved parties
    const partiesInfo = contacts
      .filter((c) => params.parties.some(
        (party) => c.title.toLowerCase().includes(party.toLowerCase()) ||
                   c.content.toLowerCase().includes(party.toLowerCase()),
      ))
      .map((c) => `- ${c.title}: ${c.content}`)
      .join('\n');

    const aiResponse = await this.processMessage({
      content: [
        'Assist with conflict resolution in the community.',
        '',
        `Parties involved: ${params.parties.join(', ')}`,
        `Issue: ${params.issue}`,
        `Context: ${params.context}`,
        '',
        'Please provide a structured mediation plan:',
        '1. **Situation Summary** — Neutral restatement of the conflict',
        '2. **Root Cause Analysis** — What are the likely underlying causes?',
        '3. **Each Party\'s Perspective** — Acknowledge each party\'s likely concerns and feelings',
        '4. **Recommendations** — Specific actions for resolution, with responsible parties and priorities (immediate / short-term / long-term)',
        '5. **Mediation Steps** — A step-by-step process for facilitated discussion',
        '6. **Preventive Measures** — How can similar conflicts be avoided in the future?',
        '7. **Follow-up Plan** — When and how to check on the resolution',
        '',
        'Important guidelines:',
        '- Remain completely neutral — do not take sides',
        '- Focus on interests and needs, not positions',
        '- Suggest restorative rather than punitive approaches where possible',
        '- Consider the impact on the broader community',
        '- Reference any relevant community norms or codes of conduct',
        '',
        'Known information about parties:',
        partiesInfo || '(no prior data on these members)',
        '',
        'Community norms and preferences:',
        preferenceSummary || '(no community norms recorded yet)',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'resolve_conflict', parties: params.parties, issue: params.issue },
    });

    bus.emit({
      type: 'module.community.conflict.mediated',
      source: 'community',
      dao_id: daoId,
      user_id: userId,
      payload: {
        parties: params.parties,
        issue: params.issue,
      },
    });

    // Store the conflict and its resolution as a lesson for future reference
    await this.addKnowledge(daoId, {
      category: 'lesson' as KnowledgeCategory,
      title: `Conflict resolution: ${params.issue.substring(0, 80)}`,
      content: [
        `Parties: ${params.parties.join(', ')}`,
        `Issue: ${params.issue}`,
        `Context: ${params.context}`,
        `Resolution guidance provided on ${new Date().toISOString()}`,
      ].join('\n'),
      source: 'ai_derived',
      created_by: userId,
      tags: ['conflict-resolution', ...params.parties],
    });

    return aiResponse;
  }

  /**
   * Help plan a community event with agenda, logistics, promotion plan,
   * and success metrics.
   */
  async planEvent(
    daoId: string,
    userId: string,
    params: { type: string; title: string; audience: string; goals: string[] },
  ): Promise<AgentResponse> {
    const resources = await this.getKnowledge(daoId, 'resource');
    const preferences = await this.getKnowledge(daoId, 'preference');
    const contacts = await this.getKnowledge(daoId, 'contact');

    const resourceSummary = resources
      .map((r) => `- ${r.title}: ${r.content}`)
      .join('\n');

    const preferenceSummary = preferences
      .map((p) => `- ${p.title}: ${p.content}`)
      .join('\n');

    const contactSummary = contacts
      .map((c) => `- ${c.title}: ${c.content}`)
      .join('\n');

    const aiResponse = await this.processMessage({
      content: [
        `Help plan a community event.`,
        '',
        `Event type: ${params.type}`,
        `Title: ${params.title}`,
        `Target audience: ${params.audience}`,
        `Goals:`,
        ...params.goals.map((g) => `- ${g}`),
        '',
        'Please provide a comprehensive event plan including:',
        '1. **Event Overview** — Summary of what this event is about and why it matters',
        '2. **Agenda** — Detailed schedule with time slots, activities, speakers/facilitators, and durations',
        '3. **Logistics** — Platform/venue, date/time suggestions (considering time zones), duration, capacity, and required resources',
        '4. **Promotion Plan** — Channels to announce on, key messaging, timeline for promotion (e.g. 2 weeks before, 1 week before, day-of)',
        '5. **Engagement Tactics** — How to keep attendees engaged during the event (polls, Q&A, breakout rooms, etc.)',
        '6. **Roles Needed** — Who needs to be involved (moderator, speakers, note-taker, etc.)',
        '7. **Success Metrics** — How will we measure if the event achieved its goals?',
        '8. **Follow-up Plan** — Post-event actions (thank-you messages, recording sharing, feedback survey, etc.)',
        '',
        'Available community resources:',
        resourceSummary || '(no resources recorded yet)',
        '',
        'Community preferences:',
        preferenceSummary || '(no preferences recorded yet)',
        '',
        'Known community members (potential speakers/helpers):',
        contactSummary || '(no member data yet)',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'plan_event', ...params },
    });

    bus.emit({
      type: 'module.community.event.planned',
      source: 'community',
      dao_id: daoId,
      user_id: userId,
      payload: {
        type: params.type,
        title: params.title,
        audience: params.audience,
        goals: params.goals,
      },
    });

    return aiResponse;
  }

  /**
   * Save community member information into the knowledge base.
   */
  async saveMemberProfile(
    daoId: string,
    userId: string,
    profile: {
      member_name: string;
      role: string;
      interests: string[];
      communication_preference: string;
      timezone: string;
      joined_date: string;
      notes: string;
    },
  ): Promise<KnowledgeItem> {
    const content = [
      `Name: ${profile.member_name}`,
      `Role: ${profile.role}`,
      `Interests: ${profile.interests.join(', ')}`,
      `Communication preference: ${profile.communication_preference}`,
      `Timezone: ${profile.timezone}`,
      `Joined: ${profile.joined_date}`,
      `Notes: ${profile.notes}`,
    ].join('\n');

    return this.addKnowledge(daoId, {
      category: 'contact',
      title: `Member: ${profile.member_name}`,
      content,
      source: 'user_input',
      created_by: userId,
      tags: ['member-profile', profile.role, ...profile.interests],
    });
  }

  /**
   * Save a community resource (channel, tool, guide, etc.) into the knowledge base.
   */
  async saveResource(
    daoId: string,
    userId: string,
    resource: {
      name: string;
      type: string;
      url: string | null;
      description: string;
      access_level: string;
    },
  ): Promise<KnowledgeItem> {
    const content = [
      `Resource: ${resource.name}`,
      `Type: ${resource.type}`,
      `URL: ${resource.url ?? 'N/A'}`,
      `Description: ${resource.description}`,
      `Access: ${resource.access_level}`,
    ].join('\n');

    return this.addKnowledge(daoId, {
      category: 'resource',
      title: `Resource: ${resource.name}`,
      content,
      source: 'user_input',
      created_by: userId,
      tags: ['community-resource', resource.type, resource.access_level],
    });
  }

  /**
   * Save a community preference or norm into the knowledge base.
   */
  async saveCommunityNorm(
    daoId: string,
    userId: string,
    norm: {
      name: string;
      description: string;
      category: string;
    },
  ): Promise<KnowledgeItem> {
    return this.addKnowledge(daoId, {
      category: 'preference',
      title: `Norm: ${norm.name}`,
      content: norm.description,
      source: 'user_input',
      created_by: userId,
      tags: ['community-norm', norm.category],
    });
  }

  // -----------------------------------------------------------------------
  // Override knowledge retrieval to prioritise community categories
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
   * hints about contacts, preferences, or resources that should be persisted.
   */
  private extractKnowledgeHints(
    content: string,
  ): Array<{ category: KnowledgeCategory; hint: string }> {
    const hints: Array<{ category: KnowledgeCategory; hint: string }> = [];
    const lower = content.toLowerCase();

    // Contact / member indicators
    const contactPatterns = [
      /(?:member|contributor|contact)\s+(?:named?|called|is)\s+(.+?)(?:\.|,|$)/i,
      /(?:reach|contact|email|message)\s+(?:them?\s+(?:at|via|on)\s+)?(.+?)(?:\.|,|$)/i,
      /(?:new member|joined|onboarded)\s+(.+?)(?:\.|,|$)/i,
    ];
    for (const pattern of contactPatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        hints.push({ category: 'contact', hint: match[1].trim() });
      }
    }

    // Preference / norm indicators
    if (
      lower.includes('prefer') ||
      lower.includes('norm') ||
      lower.includes('culture') ||
      lower.includes('value') ||
      lower.includes('guideline') ||
      lower.includes('code of conduct')
    ) {
      const prefPatterns = [
        /(?:our|the|community)\s+(?:preference|norm|value|guideline|culture)\s+(?:is|are)\s+(.+?)(?:\.|$)/i,
        /(?:we prefer|we value|we believe in)\s+(.+?)(?:\.|$)/i,
        /(?:code of conduct|community guideline)[: ]+(.+?)(?:\.|$)/i,
      ];
      for (const pattern of prefPatterns) {
        const match = content.match(pattern);
        if (match?.[1]) {
          hints.push({ category: 'preference', hint: match[1].trim() });
        }
      }
    }

    // Resource indicators
    if (
      lower.includes('channel') ||
      lower.includes('tool') ||
      lower.includes('resource') ||
      lower.includes('discord') ||
      lower.includes('forum') ||
      lower.includes('guide') ||
      lower.includes('documentation')
    ) {
      const resourcePatterns = [
        /(?:our|the|we use)\s+(?:channel|tool|resource|platform)\s+(?:is|are|called)\s+(.+?)(?:\.|,|$)/i,
        /(?:discord|slack|telegram|forum|notion|github)\s+(?:at|link|url)?[: ]+(.+?)(?:\.|,|\s|$)/i,
        /(?:we use|we have)\s+(.+?)\s+(?:for|as our)\s+(.+?)(?:\.|,|$)/i,
      ];
      for (const pattern of resourcePatterns) {
        const match = content.match(pattern);
        if (match?.[1]) {
          hints.push({ category: 'resource', hint: match[1].trim() });
        }
      }
    }

    return hints;
  }
}
