# DAO Foundation Specification
## Phase A, Session 1 — Written by Hub (Machine #1)
## For execution on Machine #3 (soda-yeti) — DAOV1 Repo

---

## 1. Overview

This spec defines the **foundation layer** of the SodaWorld DAO platform. Everything else (AI modules, agreements, governance, marketplace) builds on this. The foundation covers:

1. **Database Schema** — Complete table definitions with types, indexes, relationships
2. **Authentication System** — Firebase Auth + role-based access control
3. **Shared TypeScript Types** — Universal types used across frontend and backend
4. **API Base Layer** — Express middleware, error handling, response formats
5. **Module System** — How the 9 AI modules plug in

---

## 2. Database Schema (SQLite via Knex)

### Existing Tables (from migrations 001-014)

#### `user_balances`
```sql
CREATE TABLE user_balances (
  user_id TEXT PRIMARY KEY,
  soda_balance INTEGER DEFAULT 0,
  bubble_score INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,          -- from migration 013
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `token_transactions`
```sql
CREATE TABLE token_transactions (
  id TEXT PRIMARY KEY,
  from_user TEXT,
  to_user TEXT,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,      -- 'reward','purchase','claim','transfer','governance_reward'
  reference_id TEXT,
  memo TEXT,
  status TEXT DEFAULT 'completed',     -- 'pending','completed','failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Indexes: from_user, to_user, transaction_type, created_at
```

### NEW Tables Needed (v2 Foundation)

#### `users` (Master user table)
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,                 -- Firebase UID
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'member',          -- 'admin','founder','advisor','contributor','firstborn','member'
  onboarding_complete BOOLEAN DEFAULT FALSE,
  firebase_uid TEXT UNIQUE,
  wallet_address TEXT,                 -- Solana wallet (optional)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME,
  FOREIGN KEY (id) REFERENCES user_balances(user_id)
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_wallet ON users(wallet_address);
```

#### `daos` (DAO registry)
```sql
CREATE TABLE daos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  mission TEXT,
  founder_id TEXT NOT NULL,
  phase TEXT DEFAULT 'foundation',     -- 'foundation','growth','scale','mature'
  treasury_wallet TEXT,                -- Solana treasury address
  token_name TEXT DEFAULT 'SODA',
  total_supply INTEGER DEFAULT 100000000,
  governance_model TEXT DEFAULT 'token_weighted',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (founder_id) REFERENCES users(id)
);
```

#### `dao_members` (Membership + roles per DAO)
```sql
CREATE TABLE dao_members (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,                  -- 'founder','advisor','contributor','firstborn','member'
  voting_power INTEGER DEFAULT 1,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active',        -- 'active','suspended','left'
  FOREIGN KEY (dao_id) REFERENCES daos(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(dao_id, user_id)
);
CREATE INDEX idx_dao_members_dao ON dao_members(dao_id);
CREATE INDEX idx_dao_members_user ON dao_members(user_id);
```

#### `agreements` (All agreement types)
```sql
CREATE TABLE agreements (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  type TEXT NOT NULL,                  -- 'founder','advisor','contributor','firstborn'
  title TEXT NOT NULL,
  status TEXT DEFAULT 'draft',         -- 'draft','pending_signatures','active','completed','terminated','disputed'
  creator_id TEXT NOT NULL,
  terms_json TEXT,                     -- JSON blob of agreement-specific terms
  token_allocation INTEGER DEFAULT 0,
  vesting_schedule TEXT,               -- JSON: {cliff_months, vesting_months, total_tokens}
  effective_date DATETIME,
  expiry_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dao_id) REFERENCES daos(id),
  FOREIGN KEY (creator_id) REFERENCES users(id)
);
CREATE INDEX idx_agreements_dao ON agreements(dao_id);
CREATE INDEX idx_agreements_status ON agreements(status);
CREATE INDEX idx_agreements_type ON agreements(type);
```

#### `agreement_signatures`
```sql
CREATE TABLE agreement_signatures (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  signed_at DATETIME,
  signature_hash TEXT,                 -- Solana signature or local hash
  status TEXT DEFAULT 'pending',       -- 'pending','signed','rejected'
  FOREIGN KEY (agreement_id) REFERENCES agreements(id),
  FOREIGN KEY (signer_id) REFERENCES users(id),
  UNIQUE(agreement_id, signer_id)
);
```

#### `proposals` (Governance proposals)
```sql
CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'general',         -- 'general','treasury','membership','amendment','emergency'
  status TEXT DEFAULT 'draft',         -- 'draft','active','passed','rejected','executed','cancelled'
  proposer_id TEXT NOT NULL,
  voting_start DATETIME,
  voting_end DATETIME,
  quorum_required INTEGER DEFAULT 51,  -- percentage
  execution_data TEXT,                 -- JSON: what happens if passed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dao_id) REFERENCES daos(id),
  FOREIGN KEY (proposer_id) REFERENCES users(id)
);
CREATE INDEX idx_proposals_dao ON proposals(dao_id);
CREATE INDEX idx_proposals_status ON proposals(status);
```

#### `votes`
```sql
CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  vote TEXT NOT NULL,                  -- 'for','against','abstain'
  voting_power INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id),
  FOREIGN KEY (voter_id) REFERENCES users(id),
  UNIQUE(proposal_id, voter_id)
);
```

#### `vesting_unlocks` (Token vesting schedules)
```sql
CREATE TABLE vesting_unlocks (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  unlock_date DATETIME NOT NULL,
  status TEXT DEFAULT 'locked',        -- 'locked','unlocked','claimed'
  claimed_at DATETIME,
  FOREIGN KEY (agreement_id) REFERENCES agreements(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_vesting_user ON vesting_unlocks(user_id);
CREATE INDEX idx_vesting_date ON vesting_unlocks(unlock_date);
```

#### `ai_conversations` (AI brain message history)
```sql
CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  module TEXT NOT NULL,                -- 'coach','legal','finance','research','builder','organizer','comms','governance','trust'
  role TEXT NOT NULL,                  -- 'user','assistant','system'
  content TEXT NOT NULL,
  metadata_json TEXT,                  -- brain_model, cost, tokens_used, persona_used
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_ai_conv_user ON ai_conversations(user_id);
CREATE INDEX idx_ai_conv_module ON ai_conversations(module);
CREATE INDEX idx_ai_conv_created ON ai_conversations(created_at);
```

#### `knowledge_items` (Per-user knowledge base)
```sql
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  module TEXT,                         -- which AI module owns this knowledge
  category TEXT NOT NULL,              -- 'goal','strength','contact','document','insight','preference','business_context'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  importance REAL DEFAULT 0.5,         -- 0.0 to 1.0
  source TEXT,                         -- 'chat','cv_upload','cross_ai','profile_import'
  embedding_vector BLOB,              -- for semantic search (future: pgvector migration)
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_knowledge_user ON knowledge_items(user_id);
CREATE INDEX idx_knowledge_module ON knowledge_items(module);
CREATE INDEX idx_knowledge_category ON knowledge_items(category);
```

#### `marketplace_items`
```sql
CREATE TABLE marketplace_items (
  id TEXT PRIMARY KEY,
  dao_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                  -- 'NFT','Ticket','Merch'
  description TEXT,
  price INTEGER NOT NULL,              -- in SODA tokens
  image_url TEXT,
  creator_id TEXT NOT NULL,
  category TEXT,
  edition_current INTEGER,
  edition_total INTEGER,
  status TEXT DEFAULT 'active',        -- 'active','sold','expired'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id)
);
```

#### `bounties`
```sql
CREATE TABLE bounties (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  reward_bubble_score INTEGER DEFAULT 0,
  reward_soda INTEGER DEFAULT 0,
  category TEXT DEFAULT 'All',         -- 'Social','Creative','Technical','Governance'
  status TEXT DEFAULT 'Available',     -- 'Available','Completed','Expired'
  deadline DATETIME,
  max_completions INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dao_id) REFERENCES daos(id)
);
```

#### `admin_logs` (from migration 007)
```sql
CREATE TABLE admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,                    -- 'user','dao','proposal','agreement','token'
  target_id TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id)
);
```

---

## 3. Authentication System

### Current: Firebase Auth
- Email/password + magic links
- Firebase UID stored in `users.firebase_uid`
- Frontend: `firebase/auth` SDK
- Backend: Verify Firebase ID token in middleware

### Auth Middleware (Express)
```typescript
// backend/src/middleware/auth.ts
import { auth } from '../config/firebase-admin';

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: await getUserRole(decoded.uid)  // lookup from users table
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

### Role Hierarchy
```
admin > founder > advisor > contributor > firstborn > member
```

### Permission Matrix

| Action | admin | founder | advisor | contributor | firstborn | member |
|--------|-------|---------|---------|-------------|-----------|--------|
| Create DAO | x | x | | | | |
| Create proposal | x | x | x | x | | |
| Vote on proposal | x | x | x | x | x | |
| Create agreement | x | x | x | | | |
| Sign agreement | x | x | x | x | x | |
| Manage treasury | x | x | | | | |
| Invite members | x | x | x | x | | |
| Admin dashboard | x | | | | | |
| AI Brain (all modules) | x | x | x | x | x | x |
| View marketplace | x | x | x | x | x | x |
| Create bounty | x | x | x | | | |

---

## 4. Shared TypeScript Types

### Core Types (extend existing `types.ts`)

```typescript
// types/foundation.ts — NEW shared types for v2

// ============ CORE ENTITIES ============

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: UserRole;
  onboardingComplete: boolean;
  walletAddress?: string;
  createdAt: string;
  lastActiveAt?: string;
}

export type UserRole = 'admin' | 'founder' | 'advisor' | 'contributor' | 'firstborn' | 'member';

export interface DAO {
  id: string;
  name: string;
  description: string;
  mission: string;
  founderId: string;
  phase: DAOPhase;
  treasuryWallet?: string;
  tokenName: string;
  totalSupply: number;
  governanceModel: GovernanceModel;
  createdAt: string;
}

export type DAOPhase = 'foundation' | 'growth' | 'scale' | 'mature';
export type GovernanceModel = 'token_weighted' | 'one_person_one_vote' | 'quadratic' | 'conviction';

// ============ AGREEMENTS ============

export interface Agreement {
  id: string;
  daoId: string;
  type: AgreementType;
  title: string;
  status: AgreementStatus;
  creatorId: string;
  terms: AgreementTerms;
  tokenAllocation: number;
  vestingSchedule?: VestingSchedule;
  effectiveDate?: string;
  expiryDate?: string;
  signatures: AgreementSignature[];
  createdAt: string;
}

export type AgreementType = 'founder' | 'advisor' | 'contributor' | 'firstborn';
export type AgreementStatus = 'draft' | 'pending_signatures' | 'active' | 'completed' | 'terminated' | 'disputed';

export interface AgreementTerms {
  responsibilities: string[];
  compensation: { type: string; amount: number; currency: string }[];
  duration?: { months: number };
  terminationClause?: string;
  customClauses?: { title: string; text: string }[];
}

export interface VestingSchedule {
  cliffMonths: number;
  vestingMonths: number;
  totalTokens: number;
  unlocks: VestingUnlock[];
}

export interface VestingUnlock {
  id: string;
  amount: number;
  unlockDate: string;
  status: 'locked' | 'unlocked' | 'claimed';
}

export interface AgreementSignature {
  id: string;
  signerId: string;
  signedAt?: string;
  signatureHash?: string;
  status: 'pending' | 'signed' | 'rejected';
}

// ============ GOVERNANCE ============

export interface Proposal {
  id: string;
  daoId: string;
  title: string;
  description: string;
  type: ProposalType;
  status: ProposalStatus;
  proposerId: string;
  votingStart?: string;
  votingEnd?: string;
  quorumRequired: number;
  executionData?: Record<string, any>;
  votes: Vote[];
  createdAt: string;
}

export type ProposalType = 'general' | 'treasury' | 'membership' | 'amendment' | 'emergency';
export type ProposalStatus = 'draft' | 'active' | 'passed' | 'rejected' | 'executed' | 'cancelled';

export interface Vote {
  id: string;
  proposalId: string;
  voterId: string;
  vote: 'for' | 'against' | 'abstain';
  votingPower: number;
  createdAt: string;
}

// ============ AI MODULES ============

export type AIModuleId = 'coach' | 'legal' | 'finance' | 'research' | 'builder' | 'organizer' | 'comms' | 'governance' | 'trust';

export interface AIModule {
  id: AIModuleId;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'learning';
  capabilities: string[];
  privateKnowledgeCount: number;
  lastActive?: string;
}

export interface AIMessage {
  id: string;
  userId: string;
  module: AIModuleId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    model: string;
    cost: number;
    tokensUsed: number;
    personaUsed: string;
    confidence?: number;
  };
  createdAt: string;
}

export interface KnowledgeItem {
  id: string;
  userId: string;
  module?: AIModuleId;
  category: KnowledgeCategory;
  title: string;
  content: string;
  importance: number;
  source: KnowledgeSource;
  expiresAt?: string;
  createdAt: string;
}

export type KnowledgeCategory = 'goal' | 'strength' | 'contact' | 'document' | 'insight' | 'preference' | 'business_context';
export type KnowledgeSource = 'chat' | 'cv_upload' | 'cross_ai' | 'profile_import';

// ============ UNIVERSAL AGENT INTERFACE ============
// Every AI module implements this contract (SNAP #76)

export interface AgentModule {
  id: AIModuleId;
  name: string;
  processMessage(msg: AgentMessage): Promise<AgentResponse>;
  learn(interaction: AIMessage): Promise<void>;
  getKnowledge(userId: string, query?: string): Promise<KnowledgeItem[]>;
  getStatus(): AIModule;
}

export interface AgentMessage {
  from: string;
  to: string | 'broadcast';
  type: 'task' | 'insight' | 'question' | 'result' | 'alert';
  payload: any;
  context: string;
  priority: number;
  replyTo?: string;
}

export interface AgentResponse {
  content: string;
  confidence: number;
  suggestedActions?: { label: string; action: string }[];
  knowledgeGenerated?: KnowledgeItem[];
  delegateTo?: AIModuleId;
}

// ============ API RESPONSE FORMAT ============

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp: string;
  };
}

// ============ EVENT BUS ============

export interface BusEvent {
  type: string;
  source: AIModuleId | 'system' | 'user';
  payload: any;
  timestamp: string;
  correlationId?: string;
}
```

---

## 5. API Base Layer

### Standard Response Format
All API endpoints return:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "2026-02-12T16:00:00Z" }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

### Standard Error Codes
| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `UNAUTHORIZED` | 401 | No token or invalid token |
| `FORBIDDEN` | 403 | Valid token but insufficient role |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `CONFLICT` | 409 | Duplicate or state conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

### Base Middleware Stack
```typescript
// backend/src/middleware/index.ts
app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(requestLogger);     // log method, path, duration
app.use(errorHandler);      // catch-all error handler
```

---

## 6. AI Cost Waterfall (from Martin's template, SNAP decision)

```
Layer 1: FREE     — Ollama (qwen2.5-coder:7b) on local GPU
Layer 2: CHEAP    — Claude Haiku ($0.25/1M input, $1.25/1M output)
Layer 3: STANDARD — Claude Sonnet ($3/1M input, $15/1M output)
Layer 4: PREMIUM  — Claude Opus ($15/1M input, $75/1M output)
```

**Routing Rules:**
- Simple Q&A, classification → Layer 1 (Ollama)
- Knowledge retrieval, summarization → Layer 2 (Haiku)
- Complex reasoning, code generation → Layer 3 (Sonnet)
- Critical decisions, legal review, architecture → Layer 4 (Opus)

---

## 7. Migration Plan (v1 → v2)

### Migration 015: Create Foundation Tables
```typescript
// backend/src/database_migrations/015_foundation_tables.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users master table
  await knex.schema.createTable('users', (t) => {
    t.text('id').primary();
    t.text('email').unique().notNullable();
    t.text('display_name');
    t.text('avatar_url');
    t.text('role').defaultTo('member');
    t.boolean('onboarding_complete').defaultTo(false);
    t.text('firebase_uid').unique();
    t.text('wallet_address');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.timestamp('last_active_at');
    t.index('email');
    t.index('role');
  });

  // DAOs
  await knex.schema.createTable('daos', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('description');
    t.text('mission');
    t.text('founder_id').notNullable().references('id').inTable('users');
    t.text('phase').defaultTo('foundation');
    t.text('treasury_wallet');
    t.text('token_name').defaultTo('SODA');
    t.integer('total_supply').defaultTo(100000000);
    t.text('governance_model').defaultTo('token_weighted');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // DAO Members
  await knex.schema.createTable('dao_members', (t) => {
    t.text('id').primary();
    t.text('dao_id').notNullable().references('id').inTable('daos');
    t.text('user_id').notNullable().references('id').inTable('users');
    t.text('role').notNullable();
    t.integer('voting_power').defaultTo(1);
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.text('status').defaultTo('active');
    t.unique(['dao_id', 'user_id']);
    t.index('dao_id');
    t.index('user_id');
  });

  // Agreements (enhanced)
  await knex.schema.createTable('agreements', (t) => {
    t.text('id').primary();
    t.text('dao_id').notNullable().references('id').inTable('daos');
    t.text('type').notNullable();
    t.text('title').notNullable();
    t.text('status').defaultTo('draft');
    t.text('creator_id').notNullable().references('id').inTable('users');
    t.text('terms_json');
    t.integer('token_allocation').defaultTo(0);
    t.text('vesting_schedule');
    t.timestamp('effective_date');
    t.timestamp('expiry_date');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.index('dao_id');
    t.index('status');
    t.index('type');
  });

  // Agreement Signatures
  await knex.schema.createTable('agreement_signatures', (t) => {
    t.text('id').primary();
    t.text('agreement_id').notNullable().references('id').inTable('agreements');
    t.text('signer_id').notNullable().references('id').inTable('users');
    t.timestamp('signed_at');
    t.text('signature_hash');
    t.text('status').defaultTo('pending');
    t.unique(['agreement_id', 'signer_id']);
  });

  // Proposals (enhanced)
  await knex.schema.createTable('proposals', (t) => {
    t.text('id').primary();
    t.text('dao_id').notNullable().references('id').inTable('daos');
    t.text('title').notNullable();
    t.text('description');
    t.text('type').defaultTo('general');
    t.text('status').defaultTo('draft');
    t.text('proposer_id').notNullable().references('id').inTable('users');
    t.timestamp('voting_start');
    t.timestamp('voting_end');
    t.integer('quorum_required').defaultTo(51);
    t.text('execution_data');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('dao_id');
    t.index('status');
  });

  // Votes
  await knex.schema.createTable('votes', (t) => {
    t.text('id').primary();
    t.text('proposal_id').notNullable().references('id').inTable('proposals');
    t.text('voter_id').notNullable().references('id').inTable('users');
    t.text('vote').notNullable();
    t.integer('voting_power').defaultTo(1);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['proposal_id', 'voter_id']);
  });

  // AI Conversations
  await knex.schema.createTable('ai_conversations', (t) => {
    t.text('id').primary();
    t.text('user_id').notNullable().references('id').inTable('users');
    t.text('module').notNullable();
    t.text('role').notNullable();
    t.text('content').notNullable();
    t.text('metadata_json');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('user_id');
    t.index('module');
    t.index('created_at');
  });

  // Knowledge Items
  await knex.schema.createTable('knowledge_items', (t) => {
    t.text('id').primary();
    t.text('user_id').notNullable().references('id').inTable('users');
    t.text('module');
    t.text('category').notNullable();
    t.text('title').notNullable();
    t.text('content').notNullable();
    t.float('importance').defaultTo(0.5);
    t.text('source');
    t.binary('embedding_vector');
    t.timestamp('expires_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.index('user_id');
    t.index('module');
    t.index('category');
  });

  // Bounties
  await knex.schema.createTable('bounties', (t) => {
    t.text('id').primary();
    t.text('dao_id').notNullable().references('id').inTable('daos');
    t.text('title').notNullable();
    t.text('description');
    t.integer('reward_bubble_score').defaultTo(0);
    t.integer('reward_soda').defaultTo(0);
    t.text('category').defaultTo('All');
    t.text('status').defaultTo('Available');
    t.timestamp('deadline');
    t.integer('max_completions');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Marketplace Items
  await knex.schema.createTable('marketplace_items', (t) => {
    t.text('id').primary();
    t.text('dao_id');
    t.text('name').notNullable();
    t.text('type').notNullable();
    t.text('description');
    t.integer('price').notNullable();
    t.text('image_url');
    t.text('creator_id').notNullable().references('id').inTable('users');
    t.text('category');
    t.integer('edition_current');
    t.integer('edition_total');
    t.text('status').defaultTo('active');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'marketplace_items', 'bounties', 'knowledge_items', 'ai_conversations',
    'votes', 'proposals', 'agreement_signatures', 'agreements',
    'dao_members', 'daos', 'users'
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
```

---

## 8. Directory Structure (v2 Target)

```
DAOV1/
├── backend/
│   ├── src/
│   │   ├── ai/                    # AI Brain (EXISTS - 7 files)
│   │   │   ├── index.ts           # Brain entry point
│   │   │   ├── router.ts          # Cost waterfall router
│   │   │   ├── personas.ts        # 5 AI personas
│   │   │   ├── classifier.ts      # Intent classification
│   │   │   ├── memory.ts          # 4-layer memory system
│   │   │   ├── models.ts          # Model configs
│   │   │   └── rag.ts             # RAG retrieval
│   │   ├── modules/               # NEW: 9 AI modules
│   │   │   ├── base-module.ts     # Universal Agent Interface impl
│   │   │   ├── coach.ts
│   │   │   ├── legal.ts
│   │   │   ├── finance.ts
│   │   │   ├── research.ts
│   │   │   ├── builder.ts
│   │   │   ├── organizer.ts
│   │   │   ├── comms.ts
│   │   │   ├── governance.ts
│   │   │   └── trust.ts
│   │   ├── routes/                # API routes (EXISTS - 19 files)
│   │   │   ├── brain.ts           # AI brain endpoints
│   │   │   ├── contracts.ts
│   │   │   ├── dao.ts
│   │   │   ├── proposals.ts
│   │   │   ├── tokens.ts
│   │   │   ├── treasury.ts
│   │   │   ├── marketplace.ts
│   │   │   ├── agreements.ts      # NEW: unified agreement routes
│   │   │   ├── knowledge.ts       # NEW: knowledge CRUD
│   │   │   └── ...
│   │   ├── middleware/            # NEW: auth, error handling
│   │   │   ├── auth.ts
│   │   │   ├── error-handler.ts
│   │   │   └── rate-limit.ts
│   │   ├── events/               # NEW: event bus
│   │   │   ├── bus.ts
│   │   │   └── handlers.ts
│   │   ├── database_migrations/
│   │   └── index.ts
│   └── package.json
├── src/                           # React frontend
│   ├── pages/                    # 16 pages (EXISTS)
│   ├── components/               # React components
│   └── hooks/                    # Custom hooks
├── solana-dao-program/           # Solana smart contracts
├── docs/                         # Architecture docs
│   ├── FOUNDATION_SPEC.md        # THIS FILE (pushed from hub)
│   ├── API_CONTRACTS.md          # NEXT: all endpoints
│   └── STATE_MACHINES.md         # NEXT: all state flows
├── types.ts                      # Shared types (EXISTS, extend)
└── types/
    └── foundation.ts             # NEW: v2 foundation types
```

---

## 9. Execution Checklist

For Machine #3 (or any machine working on DAOV1):

- [ ] Create `backend/src/database_migrations/015_foundation_tables.ts`
- [ ] Create `types/foundation.ts` with shared types
- [ ] Create `backend/src/middleware/auth.ts`
- [ ] Create `backend/src/middleware/error-handler.ts`
- [ ] Create `backend/src/modules/base-module.ts` (Universal Agent Interface)
- [ ] Create `backend/src/events/bus.ts` (event bus)
- [ ] Run migration: `npx knex migrate:latest`
- [ ] Update `backend/src/index.ts` to use new middleware
- [ ] Create tests for auth middleware
- [ ] Create tests for migration (tables exist, constraints work)

---

*Written by Machine #1 Hub (izzit7) | Claude Opus 4.6*
*Based on: Machine 1 Briefing, DAO repo analysis via remote PTY, SESSION_JOURNAL, CLAUDE.md*
*Date: February 12, 2026*
*Status: READY FOR IMPLEMENTATION*
