/**
 * Seed the local SQLite database with SodaWorld DAO data.
 * Run with: npx tsx dao-foundation-files/seed-dao-data.ts
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'data/pia.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`Connected to ${dbPath}`);

// ── Helpers ──────────────────────────────────────────────────────────────

function upsert(table: string, data: Record<string, unknown>, idField = 'id') {
  const id = data[idField] as string;
  const existing = db.prepare(`SELECT ${idField} FROM ${table} WHERE ${idField} = ?`).get(id);
  if (existing) {
    console.log(`  [skip] ${table} "${id}" already exists`);
    return;
  }
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...keys.map(k => {
    const v = data[k];
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }));
  console.log(`  [insert] ${table} "${data.name || data.title || data.display_name || id}"`);
}

const now = new Date().toISOString();

// ── 1. DAO ───────────────────────────────────────────────────────────────

console.log('\n=== Seeding DAO ===');
const DAO_ID = 'sodaworld-dao-001';

upsert('daos', {
  id: DAO_ID,
  name: 'SodaWorld DAO',
  slug: 'sodaworld',
  description: 'A decentralized autonomous organisation building the future of collaborative AI-powered project management and community governance.',
  mission: 'Empower creators and communities through transparent, AI-augmented decentralized governance.',
  phase: 'formation',
  governance_model: 'council',
  treasury_address: null,
  settings: JSON.stringify({
    tokenomics: { founders: 25, advisors: 25, community: 25, public: 25 },
    legal_framework: 'US',
    token_symbol: 'SODA',
    total_supply: 100_000_000,
  }),
  founder_id: 'user-marcus',
  created_at: '2026-01-15T00:00:00.000Z',
  updated_at: now,
});

// ── 2. Users & Members ───────────────────────────────────────────────────

console.log('\n=== Seeding Users & Members ===');

const members = [
  { id: 'user-marcus',   name: 'Marcus Chen',      email: 'marcus@sodaworld.io',   role: 'founder',     title: 'CTO',              tokens: 4_000_000,  voting_power: 4.0 },
  { id: 'user-sarah',    name: 'Sarah Williams',    email: 'sarah@sodaworld.io',    role: 'founder',     title: 'CEO',              tokens: 4_000_000,  voting_power: 4.0 },
  { id: 'user-james',    name: 'James Wright',      email: 'james@sodaworld.io',    role: 'founder',     title: 'Creative Director', tokens: 3_000_000, voting_power: 3.0 },
  { id: 'user-lisa',     name: 'Lisa Park',         email: 'lisa@sodaworld.io',     role: 'admin',       title: 'Legal Advisor',    tokens: 2_000_000,  voting_power: 2.0 },
  { id: 'user-david',    name: 'David Kumar',       email: 'david@sodaworld.io',    role: 'admin',       title: 'Blockchain Advisor', tokens: 1_500_000, voting_power: 1.5 },
  { id: 'user-emma',     name: 'Emma Rodriguez',    email: 'emma@sodaworld.io',     role: 'contributor', title: 'Lead Developer',   tokens: 1_000_000,  voting_power: 1.0 },
  { id: 'user-alex',     name: 'Alex Thompson',     email: 'alex@sodaworld.io',     role: 'contributor', title: 'Community Manager', tokens: 500_000,   voting_power: 0.5 },
  { id: 'user-mia',      name: 'Mia Foster',        email: 'mia@sodaworld.io',      role: 'member',      title: 'First Born Investor', tokens: 500_000, voting_power: 0.5 },
  { id: 'user-noah',     name: 'Noah Baker',         email: 'noah@sodaworld.io',     role: 'observer',    title: 'First Born Investor (Non-voting)', tokens: 250_000, voting_power: 0 },
];

for (const m of members) {
  upsert('users', {
    id: m.id,
    firebase_uid: `firebase-${m.id}`,
    email: m.email,
    display_name: m.name,
    avatar_url: null,
    role: m.role,
    wallet_address: null,
    metadata: JSON.stringify({ title: m.title, tokens: m.tokens }),
    created_at: '2026-01-15T00:00:00.000Z',
    updated_at: now,
  });

  upsert('dao_members', {
    id: `member-${m.id}`,
    dao_id: DAO_ID,
    user_id: m.id,
    role: m.role,
    joined_at: '2026-01-15T00:00:00.000Z',
    left_at: null,
    voting_power: m.voting_power,
    reputation_score: m.role === 'founder' ? 100 : m.role === 'admin' ? 80 : m.role === 'contributor' ? 60 : 40,
    metadata: JSON.stringify({ title: m.title, token_allocation: m.tokens }),
  });
}

// ── 3. Agreements ────────────────────────────────────────────────────────

console.log('\n=== Seeding Agreements ===');

const agreements = [
  {
    id: 'agr-operating',
    title: 'SodaWorld DAO Operating Agreement',
    type: 'operating_agreement',
    created_by: 'user-sarah',
    terms: {
      effective_date: '2026-01-15',
      expiry_date: '2030-01-15',
      auto_renew: true,
      termination_notice_days: 90,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: null,
      custom_clauses: {},
    },
    content_markdown: `# SodaWorld DAO Operating Agreement\n\n## 1. Formation\nThis Operating Agreement establishes SodaWorld DAO as a decentralized autonomous organisation.\n\n## 2. Purpose\nThe DAO exists to build and govern the SodaWorld platform.\n\n## 3. Membership\nMembers are classified as Founders, Advisors, Contributors, and First Born Investors.\n\n## 4. Governance\nDecisions are made through a council model with token-weighted voting.\n\n## 5. Treasury\nThe treasury is managed by a 2-of-3 multi-sig wallet.`,
  },
  {
    id: 'agr-marcus',
    title: 'Founder Agreement — Marcus Chen (CTO)',
    type: 'contributor_agreement',
    created_by: 'user-sarah',
    terms: {
      effective_date: '2026-01-15',
      expiry_date: '2030-01-15',
      auto_renew: false,
      termination_notice_days: 60,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 4_000_000, token_symbol: 'SODA', cliff_months: 12, vesting_months: 48, unlocks: [] },
      custom_clauses: { ip_assignment: 'All IP created during engagement belongs to the DAO', non_compete: '12 months post-departure' },
    },
    content_markdown: `# Founder Agreement — Marcus Chen\n\n## Role: Chief Technology Officer\n\n## Token Grant: 4,000,000 SODA\n- 12-month cliff\n- 48-month linear vesting\n\n## Responsibilities\n- Lead technical architecture and development\n- Manage engineering team\n- Oversee security and infrastructure\n\n## IP Assignment\nAll intellectual property created during this engagement is assigned to SodaWorld DAO.`,
  },
  {
    id: 'agr-sarah',
    title: 'Founder Agreement — Sarah Williams (CEO)',
    type: 'contributor_agreement',
    created_by: 'user-marcus',
    terms: {
      effective_date: '2026-01-15',
      expiry_date: '2030-01-15',
      auto_renew: false,
      termination_notice_days: 60,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 4_000_000, token_symbol: 'SODA', cliff_months: 12, vesting_months: 48, unlocks: [] },
      custom_clauses: { ip_assignment: 'All IP created during engagement belongs to the DAO', non_compete: '12 months post-departure' },
    },
    content_markdown: `# Founder Agreement — Sarah Williams\n\n## Role: Chief Executive Officer\n\n## Token Grant: 4,000,000 SODA\n- 12-month cliff\n- 48-month linear vesting\n\n## Responsibilities\n- Overall strategic direction and vision\n- Stakeholder management and partnerships\n- Fundraising and investor relations\n\n## IP Assignment\nAll intellectual property created during this engagement is assigned to SodaWorld DAO.`,
  },
  {
    id: 'agr-james',
    title: 'Founder Agreement — James Wright (Creative Director)',
    type: 'contributor_agreement',
    created_by: 'user-sarah',
    terms: {
      effective_date: '2026-01-20',
      expiry_date: '2030-01-20',
      auto_renew: false,
      termination_notice_days: 60,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 3_000_000, token_symbol: 'SODA', cliff_months: 12, vesting_months: 48, unlocks: [] },
      custom_clauses: { ip_assignment: 'All IP created during engagement belongs to the DAO' },
    },
    content_markdown: `# Founder Agreement — James Wright\n\n## Role: Creative Director\n\n## Token Grant: 3,000,000 SODA\n- 12-month cliff\n- 48-month linear vesting\n\n## Responsibilities\n- Brand identity and creative vision\n- UI/UX design leadership\n- Content strategy\n\n## IP Assignment\nAll intellectual property created during this engagement is assigned to SodaWorld DAO.`,
  },
  {
    id: 'agr-lisa',
    title: 'Advisor Agreement — Lisa Park (Legal)',
    type: 'service_agreement',
    created_by: 'user-sarah',
    terms: {
      effective_date: '2026-02-01',
      expiry_date: '2028-02-01',
      auto_renew: true,
      termination_notice_days: 30,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 2_000_000, token_symbol: 'SODA', cliff_months: 6, vesting_months: 24, unlocks: [] },
      custom_clauses: { advisory_commitment: 'Minimum 10 hours/month', confidentiality: 'Perpetual NDA' },
    },
    content_markdown: `# Advisor Agreement — Lisa Park\n\n## Role: Legal Advisor\n\n## Token Grant: 2,000,000 SODA\n- 6-month cliff\n- 24-month linear vesting\n\n## Responsibilities\n- Legal compliance guidance\n- Agreement review and drafting\n- Regulatory landscape monitoring\n\n## Commitment: 10 hours/month minimum`,
  },
  {
    id: 'agr-david',
    title: 'Advisor Agreement — David Kumar (Blockchain)',
    type: 'service_agreement',
    created_by: 'user-sarah',
    terms: {
      effective_date: '2026-02-01',
      expiry_date: '2028-02-01',
      auto_renew: true,
      termination_notice_days: 30,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 1_500_000, token_symbol: 'SODA', cliff_months: 6, vesting_months: 24, unlocks: [] },
      custom_clauses: { advisory_commitment: 'Minimum 8 hours/month' },
    },
    content_markdown: `# Advisor Agreement — David Kumar\n\n## Role: Blockchain Advisor\n\n## Token Grant: 1,500,000 SODA\n- 6-month cliff\n- 24-month linear vesting\n\n## Responsibilities\n- Smart contract architecture guidance\n- Solana ecosystem expertise\n- Token economics review\n\n## Commitment: 8 hours/month minimum`,
  },
  {
    id: 'agr-emma',
    title: 'Contributor Agreement — Emma Rodriguez (Lead Developer)',
    type: 'contributor_agreement',
    created_by: 'user-marcus',
    terms: {
      effective_date: '2026-02-01',
      expiry_date: '2028-02-01',
      auto_renew: true,
      termination_notice_days: 30,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 1_000_000, token_symbol: 'SODA', cliff_months: 6, vesting_months: 24, unlocks: [] },
      custom_clauses: { ip_assignment: 'All code contributions are assigned to the DAO' },
    },
    content_markdown: `# Contributor Agreement — Emma Rodriguez\n\n## Role: Lead Developer\n\n## Token Grant: 1,000,000 SODA\n- 6-month cliff\n- 24-month linear vesting\n\n## Responsibilities\n- Frontend and backend development\n- Code review and quality assurance\n- Technical documentation\n\n## IP Assignment\nAll code contributions are assigned to SodaWorld DAO.`,
  },
  {
    id: 'agr-alex',
    title: 'Contributor Agreement — Alex Thompson (Community Manager)',
    type: 'contributor_agreement',
    created_by: 'user-sarah',
    terms: {
      effective_date: '2026-02-01',
      expiry_date: '2028-02-01',
      auto_renew: true,
      termination_notice_days: 30,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 500_000, token_symbol: 'SODA', cliff_months: 3, vesting_months: 12, unlocks: [] },
      custom_clauses: {},
    },
    content_markdown: `# Contributor Agreement — Alex Thompson\n\n## Role: Community Manager\n\n## Token Grant: 500,000 SODA\n- 3-month cliff\n- 12-month linear vesting\n\n## Responsibilities\n- Community engagement and growth\n- Social media management\n- Event organization and moderation`,
  },
  {
    id: 'agr-mia',
    title: 'First Born Investor Agreement — Mia Foster',
    type: 'token_grant',
    created_by: 'user-sarah',
    terms: {
      effective_date: '2026-02-10',
      expiry_date: null,
      auto_renew: false,
      termination_notice_days: 0,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 500_000, token_symbol: 'SODA', cliff_months: 0, vesting_months: 12, unlocks: [] },
      custom_clauses: { investor_rights: 'Voting rights proportional to token holdings', information_rights: 'Quarterly financial reports' },
    },
    content_markdown: `# First Born Investor Agreement — Mia Foster\n\n## Token Grant: 500,000 SODA\n- No cliff\n- 12-month linear vesting\n\n## Investor Rights\n- Voting rights proportional to token holdings\n- Quarterly financial reports\n- Early access to new features`,
  },
  {
    id: 'agr-noah',
    title: 'First Born Investor Agreement — Noah Baker (Non-voting)',
    type: 'token_grant',
    created_by: 'user-sarah',
    terms: {
      effective_date: '2026-02-10',
      expiry_date: null,
      auto_renew: false,
      termination_notice_days: 0,
      governing_law: 'Delaware, USA',
      dispute_resolution: 'Binding arbitration',
      vesting: { total_amount: 250_000, token_symbol: 'SODA', cliff_months: 0, vesting_months: 12, unlocks: [] },
      custom_clauses: { investor_rights: 'Non-voting observer status', information_rights: 'Quarterly financial reports' },
    },
    content_markdown: `# First Born Investor Agreement — Noah Baker\n\n## Token Grant: 250,000 SODA\n- No cliff\n- 12-month linear vesting\n\n## Observer Status\n- Non-voting observer\n- Quarterly financial reports\n- Early access to new features`,
  },
];

for (const a of agreements) {
  upsert('agreements', {
    id: a.id,
    dao_id: DAO_ID,
    title: a.title,
    type: a.type,
    status: 'active',
    version: 1,
    content_markdown: a.content_markdown,
    terms: JSON.stringify(a.terms),
    created_by: a.created_by,
    parent_agreement_id: null,
    created_at: a.terms.effective_date + 'T00:00:00.000Z',
    updated_at: now,
  });
}

// ── 4. Proposals ─────────────────────────────────────────────────────────

console.log('\n=== Seeding Proposals ===');

upsert('proposals', {
  id: 'prop-marketing-budget',
  dao_id: DAO_ID,
  title: 'Q1 2026 Marketing Budget Allocation',
  description: 'Allocate 50,000 SODA tokens for Q1 2026 marketing activities including social media campaigns, content creation, and community events.',
  type: 'treasury_spend',
  status: 'voting',
  author_id: 'user-alex',
  voting_starts_at: '2026-02-10T00:00:00.000Z',
  voting_ends_at: '2026-02-17T00:00:00.000Z',
  quorum_required: 0.5,
  approval_threshold: 0.6,
  execution_payload: JSON.stringify({ amount: 50_000, token: 'SODA', recipient: 'marketing-multisig' }),
  result_summary: null,
  created_at: '2026-02-08T00:00:00.000Z',
  updated_at: now,
});

upsert('proposals', {
  id: 'prop-oracle-integration',
  dao_id: DAO_ID,
  title: 'Integrate Chainlink Oracle for Token Price Feeds',
  description: 'Integrate Chainlink oracle service for real-time SODA token price feeds and external data.',
  type: 'parameter_change',
  status: 'passed',
  author_id: 'user-david',
  voting_starts_at: '2026-02-01T00:00:00.000Z',
  voting_ends_at: '2026-02-08T00:00:00.000Z',
  quorum_required: 0.5,
  approval_threshold: 0.5,
  execution_payload: JSON.stringify({ oracle: 'chainlink', networks: ['solana-devnet'] }),
  result_summary: JSON.stringify({ votes_for: 7, votes_against: 1, abstain: 1, quorum_met: true }),
  created_at: '2026-01-30T00:00:00.000Z',
  updated_at: '2026-02-08T00:00:00.000Z',
});

// ── 5. Votes ─────────────────────────────────────────────────────────────

console.log('\n=== Seeding Votes ===');

// Votes for oracle proposal (passed)
const oracleVotes = [
  { user: 'user-marcus', choice: 'yes', weight: 4.0 },
  { user: 'user-sarah', choice: 'yes', weight: 4.0 },
  { user: 'user-james', choice: 'yes', weight: 3.0 },
  { user: 'user-lisa', choice: 'yes', weight: 2.0 },
  { user: 'user-david', choice: 'yes', weight: 1.5 },
  { user: 'user-emma', choice: 'yes', weight: 1.0 },
  { user: 'user-alex', choice: 'yes', weight: 0.5 },
  { user: 'user-mia', choice: 'no', weight: 0.5 },
  { user: 'user-noah', choice: 'abstain', weight: 0 },
];

for (const v of oracleVotes) {
  upsert('votes', {
    id: `vote-oracle-${v.user}`,
    proposal_id: 'prop-oracle-integration',
    user_id: v.user,
    choice: v.choice,
    weight: v.weight,
    reason: null,
    cast_at: '2026-02-05T12:00:00.000Z',
  });
}

// Votes for marketing (in progress)
const marketingVotes = [
  { user: 'user-sarah', choice: 'yes', weight: 4.0, reason: 'We need visibility to attract contributors' },
  { user: 'user-alex', choice: 'yes', weight: 0.5, reason: 'As community manager, I see the demand' },
  { user: 'user-marcus', choice: 'yes', weight: 4.0, reason: null },
  { user: 'user-lisa', choice: 'no', weight: 2.0, reason: 'Budget too high for current stage' },
];

for (const v of marketingVotes) {
  upsert('votes', {
    id: `vote-marketing-${v.user}`,
    proposal_id: 'prop-marketing-budget',
    user_id: v.user,
    choice: v.choice,
    weight: v.weight,
    reason: v.reason,
    cast_at: '2026-02-11T12:00:00.000Z',
  });
}

// ── 6. Knowledge Items (seed coach, legal, treasury) ─────────────────────

console.log('\n=== Seeding Knowledge Items ===');

const knowledgeItems = [
  { module: 'coach', category: 'goal', title: 'Mission: AI-Powered Governance', content: 'SodaWorld DAO aims to be the first DAO platform with fully integrated AI modules for governance, legal, treasury, and coaching.', source: 'user_input', created_by: 'user-sarah' },
  { module: 'coach', category: 'goal', title: 'Q1 2026: Platform Launch', content: 'Launch the SodaWorld platform with working governance, treasury management, and at least 3 AI modules by end of Q1 2026.', source: 'user_input', created_by: 'user-marcus' },
  { module: 'coach', category: 'strength', title: 'Strong Technical Team', content: 'The founding team includes an experienced CTO (Marcus), a full-stack developer (Emma), and a blockchain advisor (David).', source: 'ai_derived', created_by: 'system' },
  { module: 'coach', category: 'strength', title: 'Clear Tokenomics', content: 'The 25/25/25/25 split (founders/advisors/community/public) is clean and fair, with clear vesting schedules.', source: 'ai_derived', created_by: 'system' },
  { module: 'legal', category: 'precedent', title: 'Wyoming DAO LLC Framework', content: 'Wyoming allows DAOs to register as LLCs. This provides liability protection while maintaining decentralized governance.', source: 'ai_derived', created_by: 'system' },
  { module: 'legal', category: 'terms', title: 'Standard Vesting: 12/48', content: 'Standard founder vesting is 12-month cliff with 48-month total vesting. This is what Marcus and Sarah have.', source: 'user_input', created_by: 'user-lisa' },
  { module: 'legal', category: 'policy', title: 'IP Assignment Required', content: 'All contributors must sign IP assignment clauses. All code, designs, and content created for SodaWorld belong to the DAO.', source: 'user_input', created_by: 'user-lisa' },
  { module: 'treasury', category: 'metric', title: 'Treasury Balance', content: 'Current treasury holds 1,025,000 SODA tokens with 2-of-3 multi-sig control. 5 transactions recorded, 2 pending.', source: 'api_sync', created_by: 'system' },
  { module: 'treasury', category: 'policy', title: 'Spending Approval Threshold', content: 'Spending proposals over 10,000 SODA require council vote with 60% approval threshold and 50% quorum.', source: 'user_input', created_by: 'user-sarah' },
  { module: 'governance', category: 'policy', title: 'Council Voting Model', content: 'SodaWorld uses a council governance model. 9 members with token-weighted voting. Non-voting observers can participate in discussions.', source: 'user_input', created_by: 'user-sarah' },
  { module: 'governance', category: 'decision', title: 'Oracle Integration Approved', content: 'Chainlink oracle integration was approved with 7-1-1 vote (for-against-abstain). Implementation to begin in Q1 2026.', source: 'conversation_extract', created_by: 'system' },
  { module: 'community', category: 'metric', title: 'Idea Bubbles Stats', content: '6 idea bubbles active with 102,500 SODA raised and 275 backers total.', source: 'api_sync', created_by: 'system' },
  { module: 'product', category: 'goal', title: 'Roadmap: AI Module Integration', content: 'Phase 1: Wire 9 AI modules to database. Phase 2: Add LLM integration. Phase 3: Frontend chat UI. Phase 4: Cross-module intelligence.', source: 'user_input', created_by: 'user-marcus' },
  { module: 'security', category: 'policy', title: 'Multi-sig Requirement', content: 'Treasury operations require 2-of-3 multi-sig approval from founders (Marcus, Sarah, James).', source: 'user_input', created_by: 'user-marcus' },
  { module: 'analytics', category: 'metric', title: 'Token Distribution', content: 'Total supply: 100M SODA. Founders: 20% (20M). Advisors: 15% (15M). Community: 40% (40M). Public: 25% (25M). Currently 35M circulating.', source: 'api_sync', created_by: 'system' },
];

for (const k of knowledgeItems) {
  upsert('knowledge_items', {
    id: randomUUID(),
    dao_id: DAO_ID,
    module_id: k.module,
    category: k.category,
    title: k.title,
    content: k.content,
    source: k.source,
    confidence: 1.0,
    tags: JSON.stringify([]),
    embedding_vector: null,
    created_by: k.created_by,
    expires_at: null,
    created_at: now,
    updated_at: now,
  });
}

// ── 7. Bounties ──────────────────────────────────────────────────────────

console.log('\n=== Seeding Bounties ===');

const bounties = [
  { id: 'bounty-docs', title: 'Write Developer Documentation', reward: 5000, status: 'open', created_by: 'user-marcus', desc: 'Create comprehensive developer docs for the SodaWorld API and module system.' },
  { id: 'bounty-audit', title: 'Security Audit — Smart Contract Review', reward: 25000, status: 'open', created_by: 'user-david', desc: 'Perform a security audit of the planned Solana smart contracts before deployment.' },
  { id: 'bounty-ui', title: 'Design Module Chat UI Components', reward: 3000, status: 'claimed', created_by: 'user-james', desc: 'Design and implement the chat UI for interacting with AI modules in the frontend.' },
];

for (const b of bounties) {
  upsert('bounties', {
    id: b.id,
    dao_id: DAO_ID,
    title: b.title,
    description: b.desc,
    reward_amount: b.reward,
    reward_token: 'SODA',
    status: b.status,
    created_by: b.created_by,
    claimed_by: b.status === 'claimed' ? 'user-emma' : null,
    deadline: null,
    deliverables: JSON.stringify([]),
    tags: JSON.stringify([]),
    created_at: now,
    updated_at: now,
  });
}

// ── 8. Marketplace Items ─────────────────────────────────────────────────

console.log('\n=== Seeding Marketplace Items ===');

const marketplace = [
  { id: 'mkt-dao-template', title: 'DAO Starter Template', type: 'template', price: 0, desc: 'Complete DAO setup template with governance, treasury, and agreements.', author: 'user-marcus' },
  { id: 'mkt-legal-pack', title: 'Legal Agreement Pack', type: 'template', price: 500, desc: 'Pre-built legal agreement templates for DAOs: operating agreement, contributor agreement, NDA, IP assignment.', author: 'user-lisa' },
  { id: 'mkt-nft-collection', title: 'SodaWorld Genesis NFT', type: 'service', price: 100, desc: 'Genesis NFT for early SodaWorld supporters.', author: 'user-james' },
  { id: 'mkt-analytics-dash', title: 'Analytics Dashboard Module', type: 'module', price: 1000, desc: 'Custom analytics dashboard for DAO metrics and KPIs.', author: 'user-emma' },
  { id: 'mkt-event-tickets', title: 'SodaWorld Launch Event Tickets', type: 'service', price: 50, desc: 'Virtual tickets for the SodaWorld DAO launch event.', author: 'user-alex' },
];

for (const m of marketplace) {
  upsert('marketplace_items', {
    id: m.id,
    title: m.title,
    description: m.desc,
    type: m.type,
    status: 'listed',
    price: m.price,
    currency: 'SODA',
    author_id: m.author,
    dao_id: DAO_ID,
    download_count: Math.floor(Math.random() * 50),
    rating_avg: +(3 + Math.random() * 2).toFixed(2),
    rating_count: Math.floor(Math.random() * 20),
    metadata: JSON.stringify({}),
    created_at: now,
    updated_at: now,
  });
}

// ── Done ─────────────────────────────────────────────────────────────────

db.close();
console.log('\n=== Seed complete ===');
console.log('DAO: SodaWorld DAO');
console.log('Users: 9');
console.log('Members: 9');
console.log(`Agreements: ${agreements.length}`);
console.log('Proposals: 2');
console.log(`Knowledge items: ${knowledgeItems.length}`);
console.log(`Bounties: ${bounties.length}`);
console.log(`Marketplace items: ${marketplace.length}`);
