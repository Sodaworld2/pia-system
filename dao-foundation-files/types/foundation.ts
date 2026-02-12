// ============================================================================
// SodaWorld DAO Foundation Types
// Shared type definitions for the entire platform
// ============================================================================

// ---------------------------------------------------------------------------
// User & Roles
// ---------------------------------------------------------------------------

export type UserRole = 'founder' | 'admin' | 'member' | 'contributor' | 'observer';

export interface User {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  wallet_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// DAO
// ---------------------------------------------------------------------------

export type DAOPhase =
  | 'inception'      // Idea stage, founder only
  | 'formation'      // Recruiting core team, drafting agreements
  | 'operating'      // Live and running
  | 'scaling'        // Growing beyond initial team
  | 'sunset';        // Winding down

export type GovernanceModel =
  | 'founder_led'    // Single decision-maker
  | 'council'        // Small elected group
  | 'token_weighted' // 1-token-1-vote
  | 'quadratic'      // Quadratic voting
  | 'conviction'     // Conviction voting
  | 'holographic';   // Holographic consensus

export interface DAO {
  id: string;
  name: string;
  slug: string;
  description: string;
  mission: string | null;
  phase: DAOPhase;
  governance_model: GovernanceModel;
  treasury_address: string | null;
  settings: Record<string, unknown>;
  founder_id: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// DAO Membership
// ---------------------------------------------------------------------------

export interface DAOMember {
  id: string;
  dao_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
  left_at: string | null;
  voting_power: number;
  reputation_score: number;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

export type AgreementType =
  | 'operating_agreement'
  | 'contributor_agreement'
  | 'nda'
  | 'ip_assignment'
  | 'service_agreement'
  | 'token_grant'
  | 'custom';

export type AgreementStatus =
  | 'draft'
  | 'review'
  | 'pending_signatures'
  | 'active'
  | 'expired'
  | 'terminated'
  | 'amended';

export interface VestingUnlock {
  date: string;
  percentage: number;
  description: string;
}

export interface VestingSchedule {
  total_amount: number;
  token_symbol: string;
  cliff_months: number;
  vesting_months: number;
  unlocks: VestingUnlock[];
}

export interface AgreementTerms {
  effective_date: string;
  expiry_date: string | null;
  auto_renew: boolean;
  termination_notice_days: number;
  governing_law: string;
  dispute_resolution: string;
  vesting: VestingSchedule | null;
  custom_clauses: Record<string, string>;
}

export interface Agreement {
  id: string;
  dao_id: string;
  title: string;
  type: AgreementType;
  status: AgreementStatus;
  version: number;
  content_markdown: string;
  terms: AgreementTerms;
  created_by: string;
  parent_agreement_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgreementSignature {
  id: string;
  agreement_id: string;
  user_id: string;
  signed_at: string;
  signature_hash: string;
  ip_address: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Proposals & Votes
// ---------------------------------------------------------------------------

export type ProposalType =
  | 'treasury_spend'
  | 'membership'
  | 'governance_change'
  | 'agreement_ratification'
  | 'bounty'
  | 'parameter_change'
  | 'custom';

export type ProposalStatus =
  | 'draft'
  | 'discussion'
  | 'voting'
  | 'passed'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export interface Proposal {
  id: string;
  dao_id: string;
  title: string;
  description: string;
  type: ProposalType;
  status: ProposalStatus;
  author_id: string;
  voting_starts_at: string | null;
  voting_ends_at: string | null;
  quorum_required: number;
  approval_threshold: number;
  execution_payload: Record<string, unknown> | null;
  result_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Vote {
  id: string;
  proposal_id: string;
  user_id: string;
  choice: 'yes' | 'no' | 'abstain';
  weight: number;
  reason: string | null;
  cast_at: string;
}

// ---------------------------------------------------------------------------
// AI Modules
// ---------------------------------------------------------------------------

export type AIModuleId =
  | 'coach'
  | 'legal'
  | 'treasury'
  | 'governance'
  | 'community'
  | 'product'
  | 'security'
  | 'analytics'
  | 'onboarding';

export interface AIModule {
  id: AIModuleId;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface AIMessage {
  id: string;
  dao_id: string;
  module_id: AIModuleId;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown>;
  parent_message_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export type KnowledgeCategory =
  | 'goal'
  | 'strength'
  | 'preference'
  | 'contract'
  | 'precedent'
  | 'terms'
  | 'policy'
  | 'procedure'
  | 'metric'
  | 'decision'
  | 'lesson'
  | 'resource'
  | 'contact'
  | 'custom';

export type KnowledgeSource =
  | 'user_input'
  | 'ai_derived'
  | 'document_import'
  | 'api_sync'
  | 'conversation_extract';

export interface KnowledgeItem {
  id: string;
  dao_id: string;
  module_id: AIModuleId;
  category: KnowledgeCategory;
  title: string;
  content: string;
  source: KnowledgeSource;
  confidence: number;
  tags: string[];
  embedding_vector: number[] | null;
  created_by: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------

export type BountyStatus =
  | 'open'
  | 'claimed'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'cancelled';

export interface Bounty {
  id: string;
  dao_id: string;
  title: string;
  description: string;
  reward_amount: number;
  reward_token: string;
  status: BountyStatus;
  created_by: string;
  claimed_by: string | null;
  deadline: string | null;
  deliverables: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export type MarketplaceItemType = 'template' | 'module' | 'integration' | 'service';
export type MarketplaceItemStatus = 'draft' | 'listed' | 'delisted';

export interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  type: MarketplaceItemType;
  status: MarketplaceItemStatus;
  price: number;
  currency: string;
  author_id: string;
  dao_id: string | null;
  download_count: number;
  rating_avg: number;
  rating_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Agent Interface (for all AI modules)
// ---------------------------------------------------------------------------

export interface AgentMessage {
  content: string;
  dao_id: string;
  user_id: string;
  context?: Record<string, unknown>;
  parent_message_id?: string;
}

export interface AgentResponse {
  content: string;
  module_id: AIModuleId;
  confidence: number;
  suggestions?: string[];
  actions?: Array<{
    type: string;
    label: string;
    payload: Record<string, unknown>;
  }>;
  knowledge_refs?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentModule {
  readonly moduleId: AIModuleId;
  readonly moduleName: string;

  processMessage(message: AgentMessage): Promise<AgentResponse>;
  learn(daoId: string, item: Omit<KnowledgeItem, 'id' | 'created_at' | 'updated_at'>): Promise<KnowledgeItem>;
  getKnowledge(daoId: string, category?: KnowledgeCategory): Promise<KnowledgeItem[]>;
  getStatus(): Promise<{ healthy: boolean; version: string; lastActive: string | null }>;
}

// ---------------------------------------------------------------------------
// API Response Wrapper
// ---------------------------------------------------------------------------

export interface APIResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: {
    page?: number;
    per_page?: number;
    total?: number;
    request_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Event Bus
// ---------------------------------------------------------------------------

export interface BusEvent {
  type: string;
  payload: Record<string, unknown>;
  source: string;
  dao_id?: string;
  user_id?: string;
  timestamp: string;
  correlation_id?: string;
}
