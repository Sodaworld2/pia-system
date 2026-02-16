# SodaWorld DAO — Sprint Plan: Governance, Treasury, Agreements & Tokens

**Date:** February 15, 2026
**Scope:** Components 1-4 (Voting & Governance, Treasury, Agreements & Signatures, Token Distribution)
**Target Machine:** Machine #3 (100.102.217.69:5003)
**Project Path:** `C:\Users\User\Documents\GitHub\DAOV1\`
**Database:** `backend/mentor_chats.db` (SQLite, WAL mode, FK enabled)

---

## Agent Autonomy Configuration

Before starting any sprint work, deploy these settings so agents can work without permission interruptions.

### CLAUDE.md (create at project root)

```markdown
# SodaWorld DAO — Agent Instructions

## Project
SodaWorld DAO backend — Express + TypeScript + SQLite (Knex) + 9 AI modules.

## Architecture
- Backend: `backend/src/` — Express server on port 5003
- Database: SQLite via Knex, migrations in `backend/src/database_migrations/`
- Modules: `backend/src/modules/*.ts` — each extends BaseModule
- Types: `types/foundation.ts` — all shared TypeScript interfaces
- Routes: `backend/src/routes/` and `src/api/routes/dao-modules.ts`
- Seed: `seed-dao-data.ts` — reference data for all tables

## Conventions
- Use Knex for all database operations (never raw SQL in route handlers)
- All table IDs are TEXT (UUID strings), never auto-increment integers
- All timestamps use ISO 8601 strings
- API responses follow `{ success: true, data: ... }` pattern
- Errors follow `{ success: false, error: '...' }` pattern
- Use the event bus (`bus.emit()`) for cross-module communication
- TypeScript strict mode — no `any` types without justification

## Permissions
- You may freely create, edit, and delete files in this project
- You may run npm install, npm run build, npx tsx, npx tsc
- You may run database migrations and seed scripts
- You may restart the server (kill port 5003, then `npx tsx src/index.ts`)
- You may read/write the SQLite database directly for testing
- Do NOT push to git without explicit user approval
- Do NOT modify .env files without explicit user approval
```

### Mission Control Agent Settings

When spawning agents for this sprint via Mission Control:

| Setting | Value | Why |
|---------|-------|-----|
| Approval Mode | **Auto** | Approve all safe operations automatically |
| Model | **Opus 4.6** | Maximum capability for architecture work |
| Effort | **High** | Deep reasoning for type system changes |
| Max Budget | **$10** per agent | Generous budget for complex tasks |
| System Prompt | See CLAUDE.md above | Project context pre-loaded |
| Blocked Tools | (none) | Full tool access |

For agents that only need to write code (no git push, no deploy):
- Auto mode is sufficient — it blocks `rm -rf`, `git push --force`, `deploy`, `shutdown`
- Everything else (file edits, npm commands, server restart, database operations) flows through without prompts

---

## Sprint Overview

**4 sprints, 2-3 days each, sequential with overlap possible**

| Sprint | Focus | Deliverables | Estimated Effort |
|--------|-------|--------------|-----------------|
| **Sprint 1** | Governance Foundation | Delegations, timelock, vote snapshots, proposal lifecycle | 2-3 days |
| **Sprint 2** | Treasury Security | Transactions table, spending tiers, daily caps, audit trail | 2 days |
| **Sprint 3** | Agreements & Signatures | Content hashing, EIP-712 types, dispute resolution, terms extensions | 2 days |
| **Sprint 4** | Token Distribution | Fix allocation, vesting tables, acceleration clauses, supply tracking | 2 days |

---

## SPRINT 1: Governance Foundation

**Goal:** Transform the governance system from basic yes/no voting into a production-grade system with delegation, timelocks, vote snapshots, and an expanded proposal lifecycle.

### Task 1.1 — Expand ProposalStatus Type
**File:** `types/foundation.ts` (line 160)
**What:** Add 5 new statuses to the ProposalStatus union type

**Current:**
```typescript
export type ProposalStatus = 'draft' | 'discussion' | 'voting' | 'passed' | 'rejected' | 'executed' | 'cancelled';
```

**Target:**
```typescript
export type ProposalStatus =
  | 'draft'              // Author is writing
  | 'temperature_check'  // NEW — Informal sentiment poll
  | 'discussion'         // Formal discussion period
  | 'pending'            // NEW — Voting delay period (anti-manipulation)
  | 'voting'             // Active voting
  | 'grace_period'       // NEW — Post-vote window for objections
  | 'queued'             // NEW — In timelock awaiting execution
  | 'passed'             // Approved
  | 'rejected'           // Did not meet threshold
  | 'executed'           // Successfully executed
  | 'expired'            // NEW — Passed but not executed in time
  | 'vetoed'             // NEW — Vetoed by security council
  | 'cancelled';         // Cancelled by author
```

**Why:** Industry standard (ENS, Compound, Aave) uses these intermediate states to prevent rushing proposals through and to give the community time to react.

### Task 1.2 — Add Proposal Timing Fields
**File:** `types/foundation.ts` (line 169, Proposal interface)
**What:** Add timing and threshold fields to Proposal

**Add these fields:**
```typescript
// Timing
discussion_ends_at: string | null;
voting_delay_hours: number;           // default 24
grace_period_hours: number;           // default 48
execution_delay_hours: number;        // default 24
execution_deadline: string | null;    // must execute by this date
executable_after: string | null;      // computed: voting_ends + grace + delay

// Thresholds
proposal_threshold: number;           // minimum voting power to submit (default 0.5)
veto_threshold: number | null;        // voting power needed to veto (default null = no veto)

// Optimistic
is_optimistic: boolean;               // default false
```

### Task 1.3 — Create Delegations Table
**File:** New migration `backend/src/database_migrations/016_governance_upgrades.ts`
**What:** Create the delegations table that governance.ts already tries to query

```sql
CREATE TABLE IF NOT EXISTS delegations (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  delegator_id TEXT NOT NULL REFERENCES users(id),
  delegate_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT DEFAULT 'all',
  weight REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now')),
  revoked_at TEXT NULL,
  UNIQUE(dao_id, delegator_id, scope)
);

CREATE INDEX idx_delegations_dao ON delegations(dao_id);
CREATE INDEX idx_delegations_delegate ON delegations(delegate_id);
```

**Also add circular delegation check in governance module:**
```typescript
async function hasCircularDelegation(daoId: string, delegatorId: string, delegateId: string): Promise<boolean> {
  let current = delegateId;
  const visited = new Set<string>();
  while (current) {
    if (current === delegatorId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const next = await db('delegations')
      .where({ dao_id: daoId, delegator_id: current, scope: 'all' })
      .whereNull('revoked_at')
      .first();
    current = next?.delegate_id;
  }
  return false;
}
```

### Task 1.4 — Vote Snapshots (Flash-Loan Protection)
**File:** Same migration `016_governance_upgrades.ts`
**What:** Snapshot voting power at proposal creation time

```sql
CREATE TABLE IF NOT EXISTS proposal_snapshots (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  voting_power REAL NOT NULL,
  delegated_power REAL DEFAULT 0,
  total_power REAL NOT NULL,
  snapshot_at TEXT DEFAULT (datetime('now')),
  UNIQUE(proposal_id, user_id)
);
```

**Logic:** When a proposal moves to `voting` status, snapshot every member's voting power + any delegated power into this table. When casting a vote, look up power from snapshot, not from live `dao_members.voting_power`.

### Task 1.5 — Tiered Quorum/Threshold Defaults
**File:** `backend/src/modules/governance.ts`
**What:** Add a function that returns recommended quorum/threshold by proposal type

```typescript
function getDefaultThresholds(type: ProposalType): { quorum: number; approval: number } {
  switch (type) {
    case 'bounty':
    case 'custom':
      return { quorum: 0.20, approval: 0.51 };   // Routine
    case 'membership':
      return { quorum: 0.30, approval: 0.51 };   // Standard
    case 'treasury_spend':
    case 'agreement_ratification':
      return { quorum: 0.30, approval: 0.60 };   // Significant
    case 'parameter_change':
      return { quorum: 0.40, approval: 0.67 };   // Critical
    case 'governance_change':
      return { quorum: 0.60, approval: 0.75 };   // Existential
  }
}
```

### Task 1.6 — Proposal Execution Engine
**File:** New file `backend/src/modules/proposal-executor.ts`
**What:** Engine that processes passed proposals after timelock expires

```typescript
interface ExecutionAction {
  type: 'treasury_transfer' | 'role_change' | 'parameter_update' | 'agreement_activate';
  params: Record<string, unknown>;
}

async function executeProposal(proposalId: string, db: Knex): Promise<void> {
  const proposal = await db('proposals').where({ id: proposalId }).first();

  // Guards
  if (proposal.status !== 'queued') throw new Error('Not in queued status');
  if (new Date(proposal.executable_after) > new Date()) throw new Error('Timelock not expired');
  if (proposal.execution_deadline && new Date(proposal.execution_deadline) < new Date()) {
    await db('proposals').where({ id: proposalId }).update({ status: 'expired' });
    throw new Error('Execution deadline passed');
  }

  // Execute each action in the payload
  const actions: ExecutionAction[] = proposal.execution_payload?.actions || [];
  for (const action of actions) {
    await executeAction(action, db, proposal);
  }

  await db('proposals').where({ id: proposalId }).update({
    status: 'executed',
    updated_at: new Date().toISOString()
  });
}
```

### Task 1.7 — API Endpoints for New Features
**File:** `src/api/routes/dao-modules.ts` or new `backend/src/routes/governance.ts`
**What:** REST endpoints for delegation and enhanced proposal flow

| Method | Path | Action |
|--------|------|--------|
| POST | `/api/governance/delegate` | Create delegation (with circular check) |
| DELETE | `/api/governance/delegate/:id` | Revoke delegation |
| GET | `/api/governance/delegations/:userId` | Get user's delegations (given and received) |
| POST | `/api/governance/proposals/:id/advance` | Advance proposal to next status |
| POST | `/api/governance/proposals/:id/veto` | Veto a proposal (security council) |
| GET | `/api/governance/proposals/:id/snapshot` | Get voting power snapshot |
| POST | `/api/governance/proposals/:id/execute` | Execute a passed+queued proposal |

### Task 1.8 — Seed Delegation Data
**File:** `seed-dao-data.ts` (append)
**What:** Sample delegations showing the feature working

```typescript
const delegations = [
  { id: 'del-1', dao_id: '1', delegator_id: 'user-noah', delegate_id: 'user-marcus', scope: 'all', weight: 1.0 },
  { id: 'del-2', dao_id: '1', delegator_id: 'user-mia', delegate_id: 'user-sarah', scope: 'governance', weight: 1.0 },
  { id: 'del-3', dao_id: '1', delegator_id: 'user-alex', delegate_id: 'user-david', scope: 'treasury', weight: 0.5 },
];
```

### Sprint 1 Definition of Done
- [ ] ProposalStatus type has 13 statuses (was 7)
- [ ] Proposal interface has timing + threshold fields
- [ ] `delegations` table created and seeded with 3 sample rows
- [ ] `proposal_snapshots` table created
- [ ] Circular delegation detection works
- [ ] Governance module has `getDefaultThresholds()` function
- [ ] Proposal execution engine handles treasury_transfer and role_change
- [ ] 7 new API endpoints responding 200
- [ ] All existing tests still pass
- [ ] Server restarts cleanly

---

## SPRINT 2: Treasury Security

**Goal:** Add proper financial controls — transaction audit trail, multi-sig approval flow, spending tiers, daily caps, and runway monitoring.

### Task 2.1 — Treasury Transactions Table
**File:** New migration `backend/src/database_migrations/017_treasury_security.ts`

```sql
CREATE TABLE IF NOT EXISTS treasury_transactions (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('inflow', 'outflow', 'internal')),
  amount REAL NOT NULL,
  token TEXT NOT NULL DEFAULT 'SODA',
  category TEXT,
  description TEXT,
  proposal_id TEXT NULL REFERENCES proposals(id),
  recipient_id TEXT NULL REFERENCES users(id),
  recipient_address TEXT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'rejected', 'cancelled')),
  tier TEXT CHECK (tier IN ('micro', 'small', 'medium', 'large')),
  required_signatures INTEGER DEFAULT 2,
  current_signatures INTEGER DEFAULT 0,
  timelock_hours INTEGER DEFAULT 0,
  executable_after TEXT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  executed_at TEXT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS treasury_signatures (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES treasury_transactions(id),
  signer_id TEXT NOT NULL REFERENCES users(id),
  signature_hash TEXT NOT NULL,
  signed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(transaction_id, signer_id)
);

CREATE INDEX idx_treasury_tx_dao ON treasury_transactions(dao_id);
CREATE INDEX idx_treasury_tx_status ON treasury_transactions(status);
```

### Task 2.2 — Spending Tiers Configuration
**File:** New table + configuration in same migration

```sql
CREATE TABLE IF NOT EXISTS spending_policies (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('micro', 'small', 'medium', 'large')),
  max_amount REAL NOT NULL,
  required_signatures INTEGER NOT NULL,
  requires_proposal INTEGER DEFAULT 0,
  timelock_hours INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Seed default policies:**
```typescript
const policies = [
  { id: 'pol-1', dao_id: '1', tier: 'micro',  max_amount: 100,   required_signatures: 1, requires_proposal: 0, timelock_hours: 0 },
  { id: 'pol-2', dao_id: '1', tier: 'small',  max_amount: 1000,  required_signatures: 2, requires_proposal: 0, timelock_hours: 0 },
  { id: 'pol-3', dao_id: '1', tier: 'medium', max_amount: 10000, required_signatures: 2, requires_proposal: 1, timelock_hours: 24 },
  { id: 'pol-4', dao_id: '1', tier: 'large',  max_amount: 999999999, required_signatures: 3, requires_proposal: 1, timelock_hours: 48 },
];
```

### Task 2.3 — Auto-Tier Assignment
**File:** `backend/src/modules/treasury.ts`
**What:** Function that determines the spending tier for a transaction amount

```typescript
async function assignTier(daoId: string, amount: number): Promise<SpendingPolicy> {
  const policies = await db('spending_policies')
    .where({ dao_id: daoId })
    .orderBy('max_amount', 'asc');

  for (const policy of policies) {
    if (amount <= policy.max_amount) return policy;
  }
  return policies[policies.length - 1]; // largest tier
}
```

### Task 2.4 — Daily Spending Cap
**File:** `backend/src/modules/treasury.ts`
**What:** Check daily outflow before approving new transactions

```typescript
async function checkDailyCap(daoId: string, newAmount: number): Promise<{ allowed: boolean; spent_today: number; cap: number }> {
  const today = new Date().toISOString().split('T')[0];
  const result = await db('treasury_transactions')
    .where({ dao_id: daoId, type: 'outflow' })
    .where('status', 'in', ['approved', 'executed'])
    .where('created_at', '>=', today)
    .sum('amount as total');

  const spentToday = result[0]?.total || 0;
  const dailyCap = 50000; // configurable per DAO

  return {
    allowed: (spentToday + newAmount) <= dailyCap,
    spent_today: spentToday,
    cap: dailyCap
  };
}
```

### Task 2.5 — Runway Calculator
**File:** `backend/src/modules/treasury.ts`
**What:** Calculate months of runway based on burn rate

```typescript
async function calculateRunway(daoId: string): Promise<{ balance: number; monthly_burn: number; runway_months: number; warning: string | null }> {
  // Get current balance
  const balanceResult = await db('treasury_transactions')
    .where({ dao_id: daoId })
    .select(db.raw("SUM(CASE WHEN type='inflow' THEN amount ELSE -amount END) as balance"));

  // Get last 3 months outflow average
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const burnResult = await db('treasury_transactions')
    .where({ dao_id: daoId, type: 'outflow' })
    .where('executed_at', '>=', threeMonthsAgo)
    .sum('amount as total');

  const balance = balanceResult[0]?.balance || 0;
  const monthlyBurn = (burnResult[0]?.total || 0) / 3;
  const runwayMonths = monthlyBurn > 0 ? balance / monthlyBurn : Infinity;

  let warning = null;
  if (runwayMonths < 3) warning = 'CRITICAL: Less than 3 months runway';
  else if (runwayMonths < 6) warning = 'WARNING: Less than 6 months runway';

  return { balance, monthly_burn: monthlyBurn, runway_months: runwayMonths, warning };
}
```

### Task 2.6 — Treasury API Endpoints
**File:** New `backend/src/routes/treasury.ts`

| Method | Path | Action |
|--------|------|--------|
| POST | `/api/treasury/transactions` | Create new transaction (auto-assigns tier) |
| POST | `/api/treasury/transactions/:id/sign` | Add signature to transaction |
| POST | `/api/treasury/transactions/:id/execute` | Execute approved transaction |
| GET | `/api/treasury/transactions` | List transactions (filterable by status, type) |
| GET | `/api/treasury/runway` | Get runway calculation |
| GET | `/api/treasury/daily-summary` | Today's spending vs cap |
| GET | `/api/treasury/policies` | Get spending tier policies |

### Task 2.7 — Seed Treasury Data
**What:** Realistic transaction history showing different tiers in action

10-15 sample transactions: bounty payouts (micro/small), contributor payments (small/medium), audit payment (large), and inflows (Coca-Cola investment, token sales).

### Sprint 2 Definition of Done
- [ ] `treasury_transactions` and `treasury_signatures` tables created
- [ ] `spending_policies` table created and seeded with 4 tiers
- [ ] Auto-tier assignment works for any amount
- [ ] Daily spending cap enforcement works
- [ ] Runway calculator returns months remaining + warnings
- [ ] 7 new treasury API endpoints responding 200
- [ ] Seeded with 10-15 realistic transactions
- [ ] Multi-sig flow works: create → sign → sign → execute

---

## SPRINT 3: Agreements & Signatures

**Goal:** Upgrade agreements from basic signature storage to tamper-proof, typed, structured signing with content hashing, dispute resolution, and extended terms.

### Task 3.1 — Content Hashing for Tamper Detection
**File:** `types/foundation.ts` (Agreement interface) + legal module
**What:** SHA-256 hash of agreement content stored alongside

**Add to Agreement interface:**
```typescript
content_hash: string | null;          // SHA-256 of content_markdown
content_hash_algorithm: string;       // 'sha256'
```

**Implementation:**
```typescript
import { createHash } from 'crypto';

function hashAgreementContent(contentMarkdown: string): string {
  return createHash('sha256').update(contentMarkdown).digest('hex');
}
```

Compute on creation and on every update. Compare before signing — if hash doesn't match stored hash, the content was tampered with since last save. Refuse signatures on tampered agreements.

### Task 3.2 — Nonce Tracking for Signature Replay Protection
**File:** Migration + signature endpoint
**What:** Prevent the same signature from being replayed

**Add to `agreement_signatures` table:**
```sql
ALTER TABLE agreement_signatures ADD COLUMN nonce INTEGER;
ALTER TABLE agreement_signatures ADD COLUMN content_hash TEXT;
```

Each signature records which version of the content it was signing (via content_hash) and a sequential nonce per user per agreement.

### Task 3.3 — EIP-712 Typed Signature Structure
**File:** `types/foundation.ts`
**What:** Define the structured data format for typed signing

```typescript
interface TypedSignatureData {
  domain: {
    name: 'SodaWorld DAO';
    version: '1';
    chainId: number;
  };
  types: {
    AgreementSignature: Array<{ name: string; type: string }>;
  };
  value: {
    agreementId: string;
    contentHash: string;      // bytes32
    signerRole: string;
    timestamp: number;
    nonce: number;
  };
}
```

This doesn't require a blockchain — it structures the data so that IF/WHEN the DAO goes on-chain, signatures are already in the right format. For now, the server validates the structure.

### Task 3.4 — Extended AgreementTerms
**File:** `types/foundation.ts` (AgreementTerms interface, line 111)
**What:** Add deliverables, performance reviews, offboarding, and clawback

**Add to AgreementTerms:**
```typescript
// Deliverables (for contributor/advisor agreements)
deliverables?: Array<{
  title: string;
  deadline: string;
  acceptance_criteria: string;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected';
}>;

// Performance reviews
performance_reviews?: {
  frequency: 'monthly' | 'quarterly';
  criteria: string[];
  next_review: string | null;
};

// Offboarding
offboarding?: {
  notice_days: number;
  handoff_requirements: string[];
  exit_interview_required: boolean;
};

// Clawback (for advisors/founders)
clawback?: {
  bad_leaver_forfeiture: number;    // percentage forfeited (e.g., 100 = all unvested)
  good_leaver_acceleration: number; // months of accelerated vesting
  triggers: string[];               // what constitutes bad/good leaver
};

// Lock-up (separate from vesting cliff)
lockup?: {
  months: number;
  applies_after_vesting: boolean;
};
```

### Task 3.5 — Dispute Resolution Tiers
**File:** `types/foundation.ts` (new type) + AgreementTerms
**What:** Replace flat "Binding arbitration" with 3-tier system

```typescript
interface DisputeResolution {
  tiers: Array<{
    tier: 1 | 2 | 3;
    method: 'internal_vote' | 'kleros' | 'jams_arbitration';
    max_value: number;          // disputes up to this amount
    timeline_days: number;
    governing_law: string;
  }>;
}
```

**Replace `dispute_resolution: string` with `dispute_resolution: DisputeResolution` in AgreementTerms.**

**Default:**
```typescript
const defaultDisputeResolution: DisputeResolution = {
  tiers: [
    { tier: 1, method: 'internal_vote', max_value: 10000, timeline_days: 7, governing_law: 'Wyoming' },
    { tier: 2, method: 'kleros', max_value: 100000, timeline_days: 30, governing_law: 'Wyoming' },
    { tier: 3, method: 'jams_arbitration', max_value: Infinity, timeline_days: 90, governing_law: 'Wyoming' },
  ]
};
```

### Task 3.6 — Security Council Table
**File:** Migration `016_governance_upgrades.ts` (or `018_agreements_upgrades.ts`)
**What:** Formalize the emergency governance body

```sql
CREATE TABLE IF NOT EXISTS security_council (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'chair')),
  appointed_at TEXT DEFAULT (datetime('now')),
  term_ends_at TEXT NULL,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS security_council_actions (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('treasury_freeze', 'proposal_cancel', 'member_suspend', 'parameter_rollback')),
  description TEXT,
  initiated_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT DEFAULT '[]',
  executed_at TEXT NULL,
  ratified_at TEXT NULL,
  ratification_proposal_id TEXT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Seed:** The 3 founders (Marcus, Sarah, James) as initial security council.

### Task 3.7 — Witness Co-Signatures
**File:** `types/foundation.ts` (AgreementSignature interface)
**What:** Support witness signatures on agreements

**Add fields:**
```typescript
signature_type: 'signer' | 'witness' | 'council_cosign';
witness_of: string | null;     // user_id of the primary signer being witnessed
```

### Sprint 3 Definition of Done
- [ ] All agreements have `content_hash` computed on save
- [ ] Signatures include nonce and content_hash (replay + tamper protection)
- [ ] AgreementTerms extended with deliverables, performance reviews, offboarding, clawback, lockup
- [ ] DisputeResolution type replaces string-based dispute_resolution
- [ ] Security council table created and seeded with 3 founders
- [ ] Witness/council co-signature support in signature flow
- [ ] EIP-712 typed signature structure defined (ready for on-chain migration)
- [ ] Existing agreement seed data updated with new fields

---

## SPRINT 4: Token Distribution

**Goal:** Fix the allocation inconsistency, build proper vesting tracking tables, add acceleration clauses, and prepare the token supply tracking infrastructure.

### Task 4.1 — Fix Token Allocation Inconsistency
**File:** `seed-dao-data.ts` (line 54) + knowledge base items
**What:** The seed data says 25/25/25/25 but research recommends and knowledge base says 20/15/40/25. Pick one and make it consistent everywhere.

**Recommended allocation (from research):**
```typescript
tokenomics: {
  core_team: 20,        // 20M SODA — founders (was "founders: 25")
  advisors: 5,          // 5M SODA (was "advisors: 25")
  community: 35,        // 35M SODA — bounties, grants, airdrops (was "community: 25")
  treasury_reserve: 20, // 20M SODA — operational + strategic (NEW)
  investors: 10,        // 10M SODA (NEW — was bundled in "public")
  public_sale: 10,      // 10M SODA — LBP fair launch (was "public: 25")
}
```

**Update everywhere:** seed-dao-data.ts, any knowledge_items referencing allocation, and the DAO configuration.

### Task 4.2 — Vesting Schedules Table
**File:** New migration `019_token_distribution.ts`

```sql
CREATE TABLE IF NOT EXISTS vesting_schedules (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL REFERENCES users(id),
  agreement_id TEXT NULL REFERENCES agreements(id),
  total_amount REAL NOT NULL,
  token TEXT NOT NULL DEFAULT 'SODA',
  cliff_date TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  vesting_type TEXT DEFAULT 'linear' CHECK (vesting_type IN ('linear', 'milestone', 'hybrid')),
  vested_amount REAL DEFAULT 0,
  claimed_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'revoked')),
  acceleration_trigger TEXT NULL CHECK (acceleration_trigger IN ('single', 'double', NULL)),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vesting_events (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES vesting_schedules(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('vest', 'claim', 'revoke', 'pause', 'resume', 'accelerate')),
  amount REAL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vesting_milestones (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES vesting_schedules(id),
  title TEXT NOT NULL,
  criteria TEXT NOT NULL,
  token_amount REAL NOT NULL,
  percentage REAL NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'achieved', 'failed')),
  verified_at TEXT NULL,
  verified_by TEXT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Task 4.3 — Token Supply Tracking
**File:** Same migration

```sql
CREATE TABLE IF NOT EXISTS token_supply (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  total_supply REAL NOT NULL,
  circulating REAL DEFAULT 0,
  locked_vesting REAL DEFAULT 0,
  locked_staking REAL DEFAULT 0,
  treasury_held REAL DEFAULT 0,
  burned REAL DEFAULT 0,
  snapshot_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS token_operations (
  id TEXT PRIMARY KEY,
  dao_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('mint', 'burn', 'buyback', 'distribute', 'lock', 'unlock')),
  amount REAL NOT NULL,
  from_pool TEXT,
  to_pool TEXT,
  reason TEXT,
  proposal_id TEXT NULL,
  executed_by TEXT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Task 4.4 — Vesting Calculator
**File:** New utility or in treasury module
**What:** Calculate vested amount for any schedule at any point in time

```typescript
function calculateVestedAmount(schedule: VestingSchedule, atDate: Date = new Date()): number {
  const now = atDate.getTime();
  const cliff = new Date(schedule.cliff_date).getTime();
  const start = new Date(schedule.start_date).getTime();
  const end = new Date(schedule.end_date).getTime();

  // Before cliff: nothing vested
  if (now < cliff) return 0;

  // After end: everything vested
  if (now >= end) return schedule.total_amount;

  // Linear vesting between cliff and end
  const elapsed = now - start;
  const total = end - start;
  return schedule.total_amount * (elapsed / total);
}
```

### Task 4.5 — Acceleration Clauses
**File:** `types/foundation.ts` (VestingSchedule interface)
**What:** Add single-trigger and double-trigger acceleration

**Add to VestingSchedule:**
```typescript
acceleration?: {
  type: 'single_trigger' | 'double_trigger';
  single_trigger_events: string[];   // e.g., ['acquisition', 'termination_without_cause']
  double_trigger_events: string[];   // e.g., ['acquisition AND termination']
  acceleration_percentage: number;   // e.g., 100 = full acceleration
};
```

### Task 4.6 — Seed Vesting Schedules
**What:** Create vesting schedule records for all 7 members with agreements

```typescript
const vestingSchedules = [
  { id: 'vest-marcus', dao_id: '1', recipient_id: 'user-marcus', agreement_id: 'agr-marcus',
    total_amount: 4000000, token: 'SODA', cliff_date: '2027-01-15', start_date: '2026-01-15',
    end_date: '2030-01-15', vesting_type: 'linear', acceleration_trigger: 'double' },
  { id: 'vest-sarah', dao_id: '1', recipient_id: 'user-sarah', agreement_id: 'agr-sarah',
    total_amount: 4000000, token: 'SODA', cliff_date: '2027-01-15', start_date: '2026-01-15',
    end_date: '2030-01-15', vesting_type: 'linear', acceleration_trigger: 'double' },
  // ... similar for James, Lisa, David, Emma, Alex
];
```

Also seed initial token supply snapshot:
```typescript
{ id: 'supply-1', dao_id: '1', total_supply: 100000000, circulating: 0,
  locked_vesting: 16750000, locked_staking: 0, treasury_held: 20000000, burned: 0 }
```

### Task 4.7 — Vesting Dashboard Endpoint
| Method | Path | Action |
|--------|------|--------|
| GET | `/api/token/supply` | Current token supply breakdown |
| GET | `/api/token/vesting` | All vesting schedules with calculated vested amounts |
| GET | `/api/token/vesting/:userId` | Single user's vesting schedule + claim history |
| POST | `/api/token/vesting/:scheduleId/claim` | Claim vested tokens |
| GET | `/api/token/operations` | Token operation history |

### Sprint 4 Definition of Done
- [ ] Token allocation fixed to 20/5/35/20/10/10 everywhere
- [ ] `vesting_schedules` table created with 7 schedules for all agreement holders
- [ ] `vesting_events` table created
- [ ] `vesting_milestones` table created
- [ ] `token_supply` table created with initial snapshot
- [ ] `token_operations` table created
- [ ] Vesting calculator correctly computes amounts for any date
- [ ] Acceleration clause types defined
- [ ] 5 new token API endpoints responding 200
- [ ] Token supply numbers are internally consistent

---

## Cross-Sprint: Security Baseline

These security items should be woven into every sprint, not done separately:

| Item | When | How |
|------|------|-----|
| **Rate limiting** | Sprint 1 | Add `express-rate-limit` middleware to all new endpoints |
| **Input validation** | Every sprint | Validate all POST body fields before database operations |
| **Audit logging** | Sprint 2 | Create `audit_log` table, log all treasury + governance actions |
| **SQLite backups** | Sprint 1 | Set up 6-hour backup schedule via cron/setInterval |
| **Zod schemas** | Every sprint | Define Zod schemas for every new POST endpoint |

---

## Total New Tables Summary

| Sprint | Tables Created | Purpose |
|--------|---------------|---------|
| Sprint 1 | `delegations`, `proposal_snapshots` | Governance |
| Sprint 2 | `treasury_transactions`, `treasury_signatures`, `spending_policies` | Treasury |
| Sprint 3 | `security_council`, `security_council_actions` | Agreements |
| Sprint 4 | `vesting_schedules`, `vesting_events`, `vesting_milestones`, `token_supply`, `token_operations` | Tokens |
| Cross-Sprint | `audit_log` | Security |
| **Total** | **13 new tables** | |

## Total New API Endpoints

| Sprint | Endpoints | Area |
|--------|-----------|------|
| Sprint 1 | 7 | Governance (delegate, advance, veto, snapshot, execute) |
| Sprint 2 | 7 | Treasury (transactions, sign, execute, runway, daily, policies) |
| Sprint 3 | 0 new routes, enhanced existing | Agreements (updated sign/verify flow) |
| Sprint 4 | 5 | Tokens (supply, vesting, claim, operations) |
| **Total** | **19 new endpoints** | |

---

*Sprint plan created by Claude Opus 4.6 | February 15, 2026*
*Based on 7 research documents totaling 330+ sources*
