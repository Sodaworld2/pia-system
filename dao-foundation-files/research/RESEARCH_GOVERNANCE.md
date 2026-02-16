# SodaWorld DAO — Governance Systems Research

**Date:** February 15, 2026 | **Sources:** 65+ references

---

## Executive Summary

Governance is the central nervous system of any DAO. This research document examines the full spectrum of decentralized governance mechanisms across 10 major topic areas, drawing from production systems at Compound, Uniswap, Optimism, Nouns, MakerDAO, Gitcoin, 1Hive, DAOstack, Moloch, and Aragon. SodaWorld's current architecture -- council voting with 2-of-3 / 3-of-3 thresholds, a 7-stage proposal lifecycle (draft -> discussion -> voting -> passed/rejected -> executed -> cancelled), token-weighted voting power, and 9 council members -- provides a solid foundation. The recommendations below chart an evolution path from this foundation toward a mature, attack-resistant, progressively decentralized governance system.

Key findings:
- **Voter participation** averages only 17% across all DAOs; leading DAOs reach 22-28% on critical votes. Dynamic quorums, delegation, and incentive structures are essential.
- **Flash loan attacks** remain the most dangerous governance vector. Time-weighted snapshots and voting delay periods are non-negotiable defenses.
- **Progressive decentralization** (a16z framework) is the industry-standard path: founder-led -> council -> token-weighted -> full decentralization.
- **Hybrid governance** is the 2025-2026 trend: operational execution by a core team, strategic decisions by the community, with AI-assisted delegate matching emerging rapidly.
- **Modular plugin architectures** (Aragon OSx, OpenZeppelin Governor) enable swapping governance models without redeploying contracts.

---

## 1. Voting Mechanisms

### 1.1 Token-Weighted Voting

The most common mechanism. Each token equals one vote. Used by Compound, Uniswap, Aave, and most Governor-based DAOs.

**How it works:**
- Voting power = token balance at snapshot block
- ERC20Votes extension provides checkpointing (historical balance lookups)
- Snapshot taken at `block.number - 1` when proposal is created
- Voters must self-delegate or delegate to activate voting power

**Strengths:** Simple, Sybil-resistant (tokens have cost), aligns economic interest with governance power.

**Weaknesses:** Plutocratic -- Compound's top 10 voters control 57.86% of voting power; Uniswap's top 10 control 44.72%. Low-balance holders have negligible influence.

**SodaWorld current state:** Already implemented via `Vote.weight` field and `DAOMember.voting_power`. The `GovernanceModel` type includes `'token_weighted'`.

```typescript
// Current SodaWorld Vote interface (types/foundation.ts)
export interface Vote {
  id: string;
  proposal_id: string;
  user_id: string;
  choice: 'yes' | 'no' | 'abstain';
  weight: number;        // <- token-weighted voting power
  reason: string | null;
  cast_at: string;
}
```

### 1.2 Quadratic Voting (Gitcoin)

Cost of votes increases quadratically: N votes cost N^2 credits. Mitigates plutocracy by making marginal votes increasingly expensive.

**How it works:**
- Each voter receives equal voting credits per period
- 1 vote costs 1 credit, 2 votes cost 4, 3 cost 9, 10 cost 100
- A whale with 100 tokens gets sqrt(100) = 10 effective votes vs. 100 in linear
- Requires identity verification (Sybil resistance) to prevent splitting across wallets

**Production examples:**
- **Gitcoin Grants**: Quadratic Funding (QF) variant -- $67M+ distributed to 5,000+ projects. Uses Gitcoin Passport for Sybil resistance with stamp-based identity scores.
- **RadicalxChange**: Academic foundation for QV theory

**Sybil resistance requirement:** Without robust identity, QV degrades to plutocracy (split tokens across wallets). Gitcoin Passport combines stamps (GitHub, ENS, social accounts) plus Cluster Matching to detect coordinated wallets.

```typescript
// Quadratic voting weight calculation
interface QuadraticVoteConfig {
  credits_per_voter: number;         // e.g., 100 credits per period
  identity_verification: 'passport' | 'kyc' | 'sbt'; // Sybil resistance method
  min_identity_score: number;        // minimum passport/identity score to vote
}

function calculateQuadraticWeight(credits_spent: number): number {
  return Math.sqrt(credits_spent);   // N credits = sqrt(N) effective votes
}

function creditCost(desired_votes: number): number {
  return desired_votes * desired_votes; // N votes costs N^2 credits
}
```

**SodaWorld recommendation:** Add as an option for grants/funding decisions where broad community preference matters more than stake-weighted outcomes. Requires identity layer first.

### 1.3 Conviction Voting (1Hive Gardens)

Continuous signal voting where conviction (voting power) accumulates over time. No discrete voting periods -- proposals pass when accumulated conviction crosses a threshold.

**How it works:**
- Voters stake tokens on proposals they support
- Conviction charges up like a capacitor: starts low, asymptotically approaches maximum
- Threshold is a function of requested funds relative to total pool
- Voters can move their stake at any time; conviction decays and rebuilds
- No quorum needed -- the threshold mechanism handles it

**Production examples:**
- **1Hive Gardens**: Production framework combining conviction voting + community covenants + Celeste (dispute resolution)
- **Commons Stack**: cadCAD simulation models for parameter tuning
- **Token Engineering Commons**: Uses conviction voting for treasury allocation

**Key parameters:**
- `alpha` (decay constant): Controls how fast conviction builds/decays. Higher = slower buildup, more stable.
- `beta` (spending weight): How the trigger threshold scales with requested amount
- `rho` (max ratio): Maximum percentage of pool a single proposal can request

```typescript
// Conviction voting model
interface ConvictionVotingConfig {
  alpha: number;          // decay rate (0-1), e.g., 0.9 = slow buildup
  beta: number;           // spending weight
  max_ratio: number;      // max % of pool per proposal (e.g., 0.1 = 10%)
  min_threshold_stake: number; // minimum tokens to participate
}

interface ConvictionState {
  proposal_id: string;
  voter_id: string;
  staked_amount: number;
  conviction: number;     // accumulated conviction score
  last_updated: string;   // timestamp of last conviction recalculation
}

// Conviction update formula (per block/tick):
// conviction(t) = alpha * conviction(t-1) + staked_amount
function updateConviction(
  prevConviction: number,
  stakedAmount: number,
  alpha: number,
): number {
  return alpha * prevConviction + stakedAmount;
}

// Threshold to pass (scales with requested amount)
function triggerThreshold(
  requestedAmount: number,
  totalPool: number,
  beta: number,
  maxRatio: number,
): number {
  const ratio = requestedAmount / totalPool;
  if (ratio > maxRatio) return Infinity; // Cannot exceed max ratio
  return (beta * totalPool) / (1 - ratio / maxRatio);
}
```

**SodaWorld recommendation:** Ideal for Phase 3 continuous grants allocation. Does not require discrete voting periods, which reduces governance fatigue.

### 1.4 Optimistic Governance (Optimism)

Proposals auto-approve unless actively vetoed. Designed to reduce governance fatigue by only requiring action when stakeholders disagree.

**How it works:**
- Proposals enter a timelock period (e.g., 7 days)
- If no veto threshold is reached, proposal executes automatically
- Veto requires a minimum percentage of voting power (e.g., 30%)
- Optimism Season 8 (2025): "Optimistic Approval" with dynamic veto thresholds

**Optimism Season 8 innovations:**
- **Dynamic veto thresholds**: Threshold adjusts lower as consensus among stakeholder groups increases
- **Four stakeholder groups**: represented across Token House and Citizens' House
- **Dual-house structure**: Token House (token-weighted) + Citizens' House (one-person-one-vote, reputation-based)
- Any stakeholder group can veto if a proposal unfairly disadvantages them

```typescript
// Optimistic governance configuration
interface OptimisticGovernanceConfig {
  timelock_hours: number;         // e.g., 168 (7 days)
  veto_threshold_percent: number; // e.g., 30% of voting power to block
  auto_execute: boolean;          // true = execute after timelock if no veto
  dynamic_threshold: boolean;     // adjust threshold based on consensus
  stakeholder_groups: string[];   // groups that can veto
  escalation_path: 'appeal' | 'full_vote' | 'council_review';
}

type OptimisticProposalStatus =
  | 'proposed'
  | 'timelock_active'
  | 'vetoed'
  | 'appealed'
  | 'auto_executed';
```

**SodaWorld recommendation:** Excellent for Phase 2 routine operations (budget allocations under threshold, membership confirmations). Dramatically reduces governance overhead for non-contentious decisions.

### 1.5 Rage Quit (Moloch)

Members can exit the DAO with their proportional share of treasury before a proposal they oppose is executed.

**How it works:**
- During the "Grace Period" after a vote passes but before execution, any member who voted No (or did not vote Yes) can ragequit
- Ragequitting burns the member's shares and returns proportional treasury assets
- Provides strong minority protection against 51% attacks
- **GuildKick**: DAO can forcibly convert a member's shares to non-voting "loot" shares

**Production examples:**
- **Moloch v2/v3 (DAOhaus Baal)**: Standard for investment/grants DAOs
- Grace Period typically 3-7 days
- In v3, GuildKick implemented via multi-call proposals

```typescript
// Rage quit mechanism
interface RageQuitConfig {
  grace_period_hours: number;     // e.g., 72 (3 days)
  eligible_statuses: string[];    // ['passed'] -- proposals that trigger grace period
  excluded_vote_choices: string[]; // ['yes'] -- members who voted yes cannot ragequit
  treasury_proportion_method: 'pro_rata' | 'share_weighted';
}

interface RageQuitEvent {
  member_id: string;
  dao_id: string;
  shares_burned: number;
  loot_burned: number;
  assets_returned: Record<string, number>; // token -> amount
  triggered_by_proposal: string;
  executed_at: string;
}
```

**SodaWorld recommendation:** Implement as minority protection mechanism in Phase 2. Critical for legitimacy -- members need an exit that does not leave their capital hostage to majority decisions.

### 1.6 Holographic Consensus (DAOstack)

Combines voting with a prediction market to focus attention on high-signal proposals, enabling scalable governance in large DAOs.

**How it works:**
- Anyone can stake GEN tokens predicting a proposal will pass (upstake) or fail (downstake)
- If upstake exceeds downstake by a threshold, proposal is "boosted"
- **Non-boosted proposals**: Require absolute majority (quorum + majority)
- **Boosted proposals**: Only require relative majority (no quorum needed)
- Predictors earn/lose tokens based on accuracy
- Effect: Community attention focuses on proposals the market believes will pass

**Key insight:** Solves the scalability problem -- as DAOs grow, members cannot review every proposal. The prediction market acts as a filter, surfacing important proposals.

```typescript
// Holographic consensus configuration
interface HolographicConsensusConfig {
  staking_token: string;             // token used for prediction staking
  boost_threshold: number;           // net stake required to boost
  boosted_voting_period_hours: number;  // shorter than regular
  regular_voting_period_hours: number;  // standard period
  regular_quorum_percent: number;    // quorum for non-boosted
  quiet_ending_period_hours: number; // extend if vote flips near end
}

type ProposalBoostStatus = 'pending' | 'pre_boosted' | 'boosted' | 'expired';

interface PredictionStake {
  staker_id: string;
  proposal_id: string;
  direction: 'upstake' | 'downstake';
  amount: number;
  staked_at: string;
}
```

**SodaWorld recommendation:** Phase 3 consideration for when the DAO scales beyond 50+ active proposals per quarter. Requires a secondary staking token or credit system.

---

## 2. Delegation Systems

### 2.1 Compound-Style Delegation

The industry standard. Token holders delegate their voting power to a delegate address. Used by Compound, Uniswap, ENS, Aave, Arbitrum, and most Governor-based DAOs.

**How it works:**
- Voting power is not active until delegated (even self-delegation is required)
- ERC20Votes extension tracks delegation and checkpoints
- Delegatee receives the delegator's full voting power
- Delegation is all-or-nothing per address (no partial delegation)
- Delegators retain token ownership and can revoke at any time

**Key limitations:**
- Single-delegate model: Cannot split voting power across multiple delegates
- Topic-agnostic: Same delegate votes on all proposals
- Centralization risk: Tally's default sort by voting power creates "rich get richer" dynamics
- Research shows top delegates on Compound control 57.86%, Uniswap 44.72%

```typescript
// Compound-style delegation
interface Delegation {
  id: string;
  dao_id: string;
  delegator_id: string;    // who is delegating
  delegate_id: string;     // who receives the voting power
  voting_power: number;    // amount of power delegated
  delegated_at: string;
  revoked_at: string | null;
  status: 'active' | 'revoked';
}

// SodaWorld already has delegation_stats in GovernanceMetrics
// and a delegations table query in governance.ts
```

### 2.2 Liquid Democracy

Dynamic delegation where voting power flows through a chain of delegates, and can be revoked or reassigned at any time -- even per-proposal.

**How it works:**
- A delegates to B, B delegates to C -- C votes with A+B+C's combined power
- If B changes their mind, they can revoke and vote directly
- Topic-specific delegation: delegate to an expert on treasury issues, another on technical proposals
- Real-time reassignment without waiting for delegation cycles

**Production examples:**
- **ENT DAO**: Open-source liquid democracy implementation for permissionless governance through trust networks
- **Kite Protocol** (2025): Privacy-preserving delegation using Zero-Knowledge Proofs, allowing public or private delegation without exposing delegator identities

**Challenges:**
- Circular delegation detection required (A -> B -> C -> A)
- Delegation depth limits to prevent gas cost explosions
- Vote discovery: if A's delegate chain leads to someone who does not vote, A's vote is lost

```typescript
// Liquid democracy extensions
interface LiquidDelegation extends Delegation {
  topic: string | null;           // null = all topics, or specific category
  proposal_id: string | null;     // null = all proposals, or specific one
  depth: number;                  // position in delegation chain
  max_chain_depth: number;        // limit to prevent infinite chains (e.g., 5)
  auto_revoke_on_vote: boolean;   // if delegator votes directly, auto-revoke
}

// Circular delegation check
function hasCircularDelegation(
  delegations: LiquidDelegation[],
  newDelegatorId: string,
  newDelegateId: string,
): boolean {
  let current = newDelegateId;
  const visited = new Set<string>([newDelegatorId]);
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    const next = delegations.find(
      d => d.delegator_id === current && d.status === 'active'
    );
    current = next?.delegate_id ?? '';
  }
  return false;
}
```

### 2.3 Delegate Registries

Platforms that help token holders discover and evaluate potential delegates.

**Production examples:**
- **Tally**: Delegate registry for 100+ DAOs including Arbitrum, Compound, Uniswap, ENS, ZKsync. Profiles show vote history, platform statements, participation rates.
- **Karma**: Delegate scoring and analytics. Tracks delegate performance across DAOs.
- **Agora**: Delegate platform used by Optimism and ENS.

**Key metrics tracked:**
- Voting participation rate (% of proposals voted on)
- Voting power held (total delegated tokens)
- Platform/manifesto statement
- Proposal creation history
- Forum participation score

### 2.4 Delegate Incentives

**Problem:** Delegates spend significant time reviewing proposals but are rarely compensated.

**Approaches:**
- **Retroactive rewards**: Pay delegates based on participation rate (Optimism RetroPGF)
- **Stipends**: Fixed monthly payments for active delegates (Arbitrum, Gitcoin)
- **Performance bonuses**: Additional rewards for delegates who exceed participation thresholds
- **Reputation tokens**: Non-transferable tokens that increase delegate visibility

**a16z 2025 trend:** AI-assisted delegate matching -- agents interview users about their values and recommend delegates whose voting history aligns. More radically, AI agents could vote on behalf of users based on understood preferences.

**SodaWorld recommendations:**
1. `delegate_profiles` table: bio, platform_statement, expertise_areas, participation_score
2. `delegate_incentives` table: delegate_id, period, participation_rate, reward_amount, status
3. Topic-based delegation (Phase 2): allow delegating to different experts per proposal category
4. AI-powered delegate matching via GovernanceModule (Phase 3)

```typescript
// Delegate profile and incentive structures
interface DelegateProfile {
  id: string;
  dao_id: string;
  user_id: string;
  display_name: string;
  platform_statement: string;
  expertise_areas: string[];      // e.g., ['treasury', 'technical', 'legal']
  participation_rate: number;     // 0-100%
  proposals_voted: number;
  proposals_created: number;
  total_voting_power: number;     // sum of delegated power
  delegate_since: string;
  is_active: boolean;
}

interface DelegateReward {
  id: string;
  dao_id: string;
  delegate_id: string;
  period: string;                 // e.g., 'Q1-2026'
  participation_rate: number;
  proposals_eligible: number;
  proposals_voted: number;
  reward_amount: number;
  reward_token: string;
  status: 'pending' | 'approved' | 'paid';
  paid_at: string | null;
}
```

---

## 3. Quorum & Threshold Design

### 3.1 Dynamic Quorums (Nouns DAO)

Nouns DAO pioneered the first dynamic quorum as a function of contentiousness. Quorum requirements adjust based on opposition level rather than being fixed.

**How it works:**
- Base quorum is set (e.g., 10% of total supply)
- As "Against" votes increase, the quorum requirement rises proportionally
- Parameters: `minQuorumBPS`, `maxQuorumBPS`, `quorumCoefficient`
- Non-contentious proposals pass with low quorum; contentious ones require broader participation
- Protects against attacks targeting voter apathy on "boring" proposals

**Formula:**
```
adjustedQuorum = min(maxQuorum, minQuorum + quorumCoefficient * againstVotes / totalSupply)
```

```typescript
// Dynamic quorum configuration
interface DynamicQuorumConfig {
  min_quorum_percent: number;     // floor, e.g., 10%
  max_quorum_percent: number;     // ceiling, e.g., 40%
  quorum_coefficient: number;     // sensitivity to opposition, e.g., 1.5
  calculation_method: 'linear' | 'quadratic' | 'step';
}

function calculateDynamicQuorum(
  config: DynamicQuorumConfig,
  againstVotes: number,
  totalSupply: number,
): number {
  const oppositionRatio = againstVotes / totalSupply;
  const rawQuorum = config.min_quorum_percent +
    config.quorum_coefficient * oppositionRatio * 100;
  return Math.min(config.max_quorum_percent, Math.max(config.min_quorum_percent, rawQuorum));
}
```

**SodaWorld recommendation:** Implement dynamic quorum in Phase 1. With only 9 council members, the current fixed quorum may be too rigid. As the DAO grows, dynamic adjustment based on contentiousness will ensure security without suppressing routine governance.

### 3.2 Participation Incentives

**Problem:** DAO voter participation averages 17% across the industry. Most DAOs report participation below 18%, risking governance by a minority.

**Approaches:**

| Method | Description | Used By |
|--------|-------------|---------|
| Token rewards | Fixed tokens per vote cast | Gitcoin, various |
| Reputation boosts | Non-transferable rep for voting | Optimism Citizens |
| Airdrop multipliers | Future airdrop weighted by participation | Arbitrum |
| Staking rewards | Bonus yield for governance-active stakers | Curve, Aave |
| Penalty mechanisms | Reduced voting power for inactive delegates | Proposed by a16z |
| Gasless voting | Off-chain signatures reduce participation cost | Snapshot |

**a16z 2025 insight:** One-off airdropped rewards are insufficient to drive meaningful participation. Sustained, structured incentive programs with clear participation metrics are needed.

**SodaWorld recommendation:**
1. Participation tracking per member: votes cast, proposals discussed, delegation activity
2. Reputation multiplier: members with >80% participation get 1.1x voting weight
3. Gasless voting (Snapshot integration) to eliminate gas cost barrier
4. Quarterly participation reports via GovernanceModule

### 3.3 Time-Weighted Voting

Voting power is determined by how long tokens have been held, not just the balance at snapshot time. Mitigates flash loan attacks and rewards long-term commitment.

**How it works:**
- Instead of a single block snapshot, voting power is calculated as time-weighted average balance over a lookback window
- Example: 30-day time-weighted average prevents someone from buying tokens right before a vote

**2025 research (arxiv 2505.00888):** "Balancing Security and Liquidity: A Time-Weighted Snapshot Framework for DAO Governance Voting" proposes multi-block time-weighted snapshots as a defense against governance attacks while preserving token liquidity.

```typescript
// Time-weighted voting power
interface TimeWeightedConfig {
  lookback_days: number;          // e.g., 30 days
  weight_function: 'linear' | 'exponential' | 'step';
  min_holding_days: number;       // minimum days to qualify (e.g., 7)
  snapshot_interval: 'daily' | 'hourly' | 'per_block';
}

// Daily balance snapshots for time-weighted calculation
interface BalanceSnapshot {
  user_id: string;
  dao_id: string;
  balance: number;
  snapshot_date: string;
}

function calculateTimeWeightedPower(
  snapshots: BalanceSnapshot[],
  config: TimeWeightedConfig,
): number {
  if (snapshots.length < config.min_holding_days) return 0;

  const totalWeight = snapshots.reduce((sum, snap, i) => {
    const dayWeight = config.weight_function === 'linear'
      ? (i + 1) / snapshots.length
      : config.weight_function === 'exponential'
        ? Math.pow(0.95, snapshots.length - i - 1)
        : 1;
    return sum + snap.balance * dayWeight;
  }, 0);

  return totalWeight / snapshots.length;
}
```

**SodaWorld recommendation:** Phase 1 -- implement daily balance snapshots and require minimum 7-day holding period for vote eligibility. This is the most effective flash loan defense.

### 3.4 Threshold Design Matrix

Recommended thresholds for SodaWorld based on proposal type and industry benchmarks:

| Proposal Type | Quorum | Approval Threshold | Voting Duration | Timelock |
|--------------|--------|-------------------|-----------------|----------|
| Routine (bounties, membership) | 15% | 51% (simple majority) | 3 days | None |
| Treasury spend (<10K SODA) | 20% | 51% | 5 days | 24h |
| Treasury spend (>10K SODA) | 30% | 60% (supermajority) | 7 days | 48h |
| Governance change | 40% | 67% (supermajority) | 7 days | 72h |
| Constitutional amendment | 50% | 75% (supermajority) | 14 days | 7 days |
| Emergency action | 60% | 80% | 24h | None |

---

## 4. Proposal Systems

### 4.1 OpenZeppelin Governor

The industry standard for on-chain governance contracts. Modular, audited, and compatible with Compound's GovernorAlpha/GovernorBravo.

**Architecture:**
- `Governor.sol`: Core contract with propose/vote/execute lifecycle
- `GovernorSettings`: Configurable voting delay, voting period, proposal threshold
- `GovernorCountingSimple`: For/Against/Abstain counting
- `GovernorVotes`: Uses ERC20Votes for voting power
- `GovernorTimelockControl`: Timelock integration for execution delay

**Proposal lifecycle:**
1. `propose(targets, values, calldatas, description)` -- creates proposal
2. Voting delay period (e.g., 1 block to 2 days)
3. Voting period (e.g., 3-7 days)
4. If passed, `queue(...)` adds to timelock
5. After timelock delay, `execute(...)` runs on-chain actions

```solidity
// OpenZeppelin Governor simplified interface
// (For reference -- SodaWorld simulates this off-chain)

contract SodaWorldGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorTimelockControl
{
    constructor(
        IVotes _token,
        TimelockController _timelock
    )
        Governor("SodaWorld Governor")
        GovernorSettings(
            1 days,   // voting delay
            7 days,   // voting period
            100e18    // proposal threshold (100 tokens)
        )
        GovernorVotes(_token)
        GovernorTimelockControl(_timelock)
    {}

    function quorum(uint256 blockNumber)
        public view override returns (uint256)
    {
        // Dynamic quorum: 10% of total supply, adjusted by contentiousness
        return token().getPastTotalSupply(blockNumber) * 10 / 100;
    }
}
```

### 4.2 Tally

Full-featured governance front-end and analytics platform for OpenZeppelin Governor contracts.

**Features:**
- Proposal creation wizard with transaction builder
- Delegate discovery and delegation management
- Real-time voting dashboards
- Cross-DAO governance aggregation
- Governor contract deployment and management
- Supports 100+ DAOs: Arbitrum, Compound, Uniswap, ENS, ZKsync

### 4.3 Snapshot (Off-Chain)

Gasless off-chain voting platform. The most widely used DAO voting tool.

**How it works:**
- Proposals are created on Snapshot (no gas cost)
- Votes are signed messages (no gas cost)
- Voting power determined by on-chain token balance at snapshot block
- Results are off-chain -- require bridge for on-chain execution
- **Snapshot X** (2025): Fully on-chain voting via Starknet at 10-50x cheaper than L1

**Key features:**
- **Shielded voting** (Shutter Network): Voter choices are encrypted during voting period, revealed when proposal closes. Prevents bandwagoning and vote manipulation.
- **Voting strategies**: Custom logic for determining voting power (ERC20 balance, NFT holdings, multi-chain, etc.)
- **Spaces**: Per-DAO configuration with custom settings, strategies, and members

### 4.4 Proposal Pipeline (Best Practice)

Industry-standard multi-stage pipeline used by mature DAOs:

```
Temperature Check  -->  Request for Comment  -->  Snapshot Vote  -->  On-Chain Vote  -->  Execution
   (Forum poll)          (Forum discussion)       (Off-chain)        (Governor)         (Timelock)
    1-3 days                5-7 days                3-7 days           3-7 days          24-72h
```

**SodaWorld current implementation:**
```
draft  -->  discussion  -->  voting  -->  passed/rejected  -->  executed/cancelled
```

This maps well to the industry pipeline. Recommendations:
1. Add `temperature_check` status before `discussion` (lightweight poll)
2. Add `queued` status between `passed` and `executed` (timelock period)
3. Track `voting_delay` as explicit field on proposals

```typescript
// Enhanced proposal status flow
export type ProposalStatus =
  | 'draft'
  | 'temperature_check'   // NEW: lightweight poll
  | 'discussion'
  | 'voting'
  | 'passed'
  | 'rejected'
  | 'queued'              // NEW: in timelock
  | 'executed'
  | 'cancelled'
  | 'vetoed';             // NEW: for optimistic governance

// Enhanced proposal fields
interface EnhancedProposal extends Proposal {
  temperature_check_result: { yes: number; no: number } | null;
  voting_delay_hours: number;
  execution_delay_hours: number;
  execution_eligible_at: string | null;  // when timelock expires
  veto_deadline: string | null;          // for optimistic governance
  snapshot_block: number | null;         // block for voting power snapshot
  discussion_url: string | null;         // link to forum discussion
  proposal_number: number;              // sequential human-readable ID
}
```

---

## 5. On-Chain vs Off-Chain Governance

### 5.1 Trade-offs

| Aspect | On-Chain | Off-Chain (Snapshot) |
|--------|----------|---------------------|
| Cost | Gas per vote ($$) | Free (signed messages) |
| Binding | Automatically enforced | Requires separate execution |
| Speed | Block time dependent | Near-instant |
| Privacy | Public by default | Shielded voting available |
| Security | Immutable, audited | Trust model on operators |
| Accessibility | Requires wallet + gas | Requires only wallet |

### 5.2 SafeSnap / Reality.eth Bridge

Bridges off-chain Snapshot votes to on-chain execution via Reality.eth oracle.

**How it works:**
1. Proposal created on Snapshot with transaction payload
2. Voting happens off-chain (gasless)
3. After vote passes, a Reality.eth question is posted: "Did this Snapshot proposal pass with this payload?"
4. Bonded answer period (24h default) -- anyone can challenge with a bond
5. If unchallenged (or challenge resolved), transactions execute via Gnosis Safe
6. **Kleros** integration available for disputed questions (decentralized arbitration)

**Adopted by:** Yearn, SushiSwap, Gnosis DAO, DXdao, Open DeFi DAO

```typescript
// SafeSnap bridge configuration
interface SafeSnapConfig {
  snapshot_space: string;           // Snapshot space ID
  safe_address: string;            // Gnosis Safe address
  reality_module_address: string;  // Reality.eth module
  bond_amount: string;             // ETH bond for Reality.eth answers
  cooldown_hours: number;          // period after resolution before execution
  expiration_hours: number;        // time limit for execution after cooldown
  arbitrator: string;              // Kleros or other arbitration contract
}
```

### 5.3 Snapshot X (2025)

Snapshot's evolution to fully on-chain voting via Starknet.

**Key innovations:**
- On-chain computation on Starknet (10-50x cheaper than L1)
- **Storage proofs** via Herodotus: verify Ethereum balances on Starknet without bridges
- Can use any contract state variable (not just ERC20Votes) for voting power
- **Gas sponsorship**: users sign messages, relayer (Mana) broadcasts on-chain
- Available on Starknet, Ethereum, Optimism, Polygon, and Arbitrum

**SodaWorld recommendation:**
- Phase 1: Use Snapshot for gasless off-chain voting (current model)
- Phase 2: Add SafeSnap bridge for binding execution of treasury proposals
- Phase 3: Evaluate Snapshot X for fully on-chain voting with low gas costs

---

## 6. Optimistic Governance

### 6.1 Core Model

Optimistic governance inverts the default: proposals pass unless vetoed. This dramatically reduces governance overhead for routine operations.

**Design principles:**
- Default = approval (optimistic assumption that proposals are good-faith)
- Veto requires active opposition exceeding a threshold
- Timelock provides window for review and challenge
- Best for high-trust environments with established norms

### 6.2 Optimism Collective Implementation (Season 8, 2025)

The most sophisticated production optimistic governance system:

- **Optimistic Approval**: Proposals auto-approved unless actively vetoed
- **Dynamic veto thresholds**: Lower threshold when stakeholder consensus is high
- **Bicameral structure**: Token House + Citizens' House
  - Token House: Token-weighted, handles business parameters
  - Citizens' House: One-person-one-vote, handles retroactive public goods funding
  - Protocol upgrades approved by Token House, subject to Citizens' House veto
- **Season 8 stakeholder groups**: Citizens' House subdivided into three groups representing builders, users, and community members

### 6.3 Aragon Optimistic Dual Governance

Aragon OSx plugin implementing optimistic governance:

- Proposals created by authorized proposers (council, committee)
- Community has veto power during timelock
- If veto threshold not reached, execution proceeds automatically
- Plugin architecture means it can be combined with other governance models

```typescript
// Optimistic governance for SodaWorld
interface OptimisticGovernancePolicy {
  id: string;
  dao_id: string;
  name: string;
  // Who can create optimistic proposals
  authorized_proposers: string[];  // role IDs or member IDs
  // Veto configuration
  veto_threshold_percent: number;  // e.g., 25% of voting power
  veto_window_hours: number;       // e.g., 72 hours
  // Execution
  auto_execute: boolean;
  execution_delay_hours: number;   // additional delay after veto window
  // Scope limits
  max_treasury_amount: number;     // proposals above this require full vote
  allowed_proposal_types: ProposalType[];
  // Escalation
  escalation_on_veto: 'full_vote' | 'council_review' | 'rejected';
}

// Example: Council can approve operational spending up to 5K SODA
// unless 25% of token holders veto within 72 hours
const operationalPolicy: OptimisticGovernancePolicy = {
  id: 'opt-ops-1',
  dao_id: 'sodaworld',
  name: 'Operational Spending',
  authorized_proposers: ['council'],
  veto_threshold_percent: 25,
  veto_window_hours: 72,
  auto_execute: true,
  execution_delay_hours: 24,
  max_treasury_amount: 5000,
  allowed_proposal_types: ['treasury_spend', 'bounty', 'membership'],
  escalation_on_veto: 'full_vote',
};
```

**SodaWorld recommendation:** Phase 2 -- implement for council-initiated routine proposals. The council (9 members) creates proposals; the broader token-holding community has veto power. This leverages the existing council structure while adding community oversight.

---

## 7. SubDAO / Committee Governance

### 7.1 Orca Protocol Pods

Pods are lightweight working units within a DAO, each governed by their own multi-sig with delegated authority.

**How it works:**
- Pods are a permissions layer around a Gnosis Safe multi-sig
- Membership managed via NFTs (like office keycards)
- Pod authority is delegated by the parent DAO through governance vote
- Each pod has a specific mandate (grants, engineering, marketing, security)
- Pods can be nested: main DAO -> workstream pods -> sub-pods

**Tribe DAO example:** Used Orca pods for optimistic governance -- pod members propose and execute within their mandate unless the broader DAO vetoes.

### 7.2 MakerDAO SubDAO (Endgame Plan)

The most ambitious SubDAO architecture in production:

- **6 SubDAOs** as "Sky Stars" -- specialized departments with their own governance tokens
- **SparkDAO**: DeFi lending subDAO managing $1B+ in assets
- **Governance token**: SKY (1 MKR = 24,000 SKY) for broader participation
- **Purpose**: Reduce governance fatigue by delegating specialized decisions to focused groups
- Each SubDAO has independent governance, treasury, and token economics
- Parent DAO retains veto power and constitutional authority

### 7.3 Committee Types

| Committee Type | Authority | Size | Decision Method | Example |
|---------------|-----------|------|-----------------|---------|
| Grants Committee | Allocate grants budget | 5-9 | Multi-sig (3-of-5) | Gitcoin PGF |
| Security Council | Emergency actions, audits | 5-9 | Multi-sig (4-of-7) | Arbitrum |
| Treasury Committee | Investment, diversification | 3-7 | Multi-sig + timelock | MakerDAO |
| Technical Committee | Protocol upgrades | 5-7 | Optimistic approval | Polkadot |
| Compensation Committee | Contributor pay, incentives | 3-5 | Council vote | ENS |

### 7.4 SodaWorld Committee Architecture

```typescript
// SubDAO / Committee structure
interface Committee {
  id: string;
  dao_id: string;
  name: string;
  type: 'grants' | 'security' | 'treasury' | 'technical' | 'compensation' | 'custom';
  mandate: string;                    // scope of authority
  members: string[];                  // member IDs
  approval_threshold: number;         // M-of-N
  budget_allocation: number;          // tokens allocated
  budget_remaining: number;
  reporting_frequency: 'weekly' | 'monthly' | 'quarterly';
  parent_dao_veto: boolean;           // can parent DAO veto committee decisions
  created_at: string;
  dissolved_at: string | null;
}

interface CommitteeDecision {
  id: string;
  committee_id: string;
  dao_id: string;
  title: string;
  description: string;
  decision_type: 'spend' | 'approve' | 'reject' | 'escalate';
  amount: number | null;
  approvals: string[];                // member IDs who approved
  rejections: string[];
  status: 'proposed' | 'approved' | 'rejected' | 'executed' | 'vetoed';
  veto_deadline: string | null;       // parent DAO veto window
  executed_at: string | null;
}
```

**SodaWorld recommendation:**
- Phase 1: Formalize existing council as a committee with explicit mandate
- Phase 2: Create Grants Committee (subset of council + community members)
- Phase 3: Security Council for emergency actions, Technical Committee for protocol changes

---

## 8. Governance Analytics

### 8.1 Analytics Platforms

| Platform | Coverage | Key Features | Status (2026) |
|----------|----------|-------------|----------------|
| **DeepDAO** | 850+ DAOs, $35.1B tracked | Participation scoring, treasury analytics, member rankings | Active, industry leader |
| **Messari Governor** | 800+ DAOs, 5000+ proposals | Proposal tracker, alerts, delegate analytics | Migrated to Messari Intel |
| **Tally** | 100+ DAOs | Voting dashboards, delegate profiles, proposal creation | Active, expanding |
| **Boardroom** | 200+ DAOs | Governance API, voter education, proposal aggregation | Active |
| **DAOlytics** | Various | Deep governance analytics, participation trends | Active |
| **Karma** | 50+ DAOs | Delegate reputation scoring, performance tracking | Active |

### 8.2 Key Governance Metrics

**DeepDAO Participation Score:** Unified ranking of every voter, proposal creator, and delegate across the DAO ecosystem. Calculated from activity across thousands of DAOs and Snapshot spaces.

**Critical metrics to track:**

```typescript
// Governance health dashboard
interface GovernanceHealthDashboard {
  // Participation metrics
  voter_turnout_rate: number;        // % of eligible voters who voted
  unique_voters_30d: number;         // unique voters in last 30 days
  delegate_participation_rate: number; // % of proposals delegates voted on
  new_voter_rate: number;            // % of voters who are first-time

  // Proposal metrics
  proposal_success_rate: number;     // % of proposals that pass
  avg_time_to_vote: number;          // hours from proposal to first vote
  quorum_achievement_rate: number;   // % of proposals that meet quorum
  avg_discussion_length: number;     // days in discussion before vote

  // Power distribution metrics
  gini_coefficient: number;          // 0 = equal, 1 = one person holds all power
  top_10_voting_power_pct: number;   // % of power held by top 10 voters
  nakamoto_coefficient: number;      // min entities to reach 51% voting power

  // Delegation metrics
  delegation_rate: number;           // % of tokens delegated
  delegate_count: number;            // number of active delegates
  avg_delegators_per_delegate: number;

  // Health indicators
  governance_health_score: number;   // composite 0-100 score
  alerts: GovernanceAlert[];
}

interface GovernanceAlert {
  type: 'low_participation' | 'power_concentration' | 'quorum_risk'
    | 'delegate_inactive' | 'proposal_spam' | 'unusual_voting_pattern';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  data: Record<string, unknown>;
  created_at: string;
}
```

### 8.3 Power Distribution Analysis

**Industry benchmarks (2025):**
- Power concentration: 78% of governance tokens held by top 15-20% of holders
- Average voter turnout: 17% (leading DAOs: 22-28%)
- DAOs with >1000 active voters: <5% of all DAOs

**Nakamoto Coefficient:** The minimum number of entities required to control 51% of governance power. Higher is better.
- Compound: ~6 (highly concentrated)
- Uniswap: ~8
- ENS: ~15 (more distributed)

**SodaWorld recommendation:**
1. Build governance analytics dashboard (`/api/governance/analytics`)
2. Track Gini coefficient and Nakamoto coefficient per DAO
3. Alert on power concentration (>50% in top 5 voters)
4. Monthly governance health reports via GovernanceModule
5. Public governance dashboard for transparency

---

## 9. Governance Attacks & Mitigations

### 9.1 Flash Loan Attacks

**The attack:** Attacker borrows massive token quantity via flash loan, acquires majority voting power, passes malicious proposal, and repays loan -- all in a single transaction.

**Notable incident:** Beanstalk (2022) -- $1B flash loan used to control 80% of voting power, draining $182M.

**Advanced variant:** Master-Slave delegation attack -- Master contract takes flash loan and delegates to Slave contract that casts the actual vote, bypassing some flash loan checks.

**Mitigations:**

| Mitigation | Effectiveness | Implementation Complexity |
|-----------|--------------|--------------------------|
| Snapshot at proposal creation (block N-1) | High | Low (standard in Governor) |
| Time-weighted voting power | Very High | Medium |
| Voting delay (1-2 days) | High | Low |
| Proposal threshold (min tokens to propose) | Medium | Low |
| Multi-block snapshot average | Very High | Medium |
| Token lock during voting | Medium | Medium |

```typescript
// Flash loan defense configuration
interface FlashLoanDefense {
  // Snapshot at proposal creation block
  snapshot_at_creation: boolean;      // use block N-1 balances
  // Voting delay
  voting_delay_blocks: number;        // delay between creation and voting start
  // Proposal threshold
  min_tokens_to_propose: number;      // minimum tokens to create proposal
  // Time-weighted (see Section 3.3)
  time_weighted_voting: boolean;
  lookback_days: number;
  // Token lock
  lock_tokens_during_vote: boolean;
  lock_duration_days: number;
}
```

### 9.2 Vote Buying

**The attack:** Purchasing votes through bribes, either directly or through platforms (dark DAOs, vote markets).

**Research insight (IC3):** "The existence of trust-minimizing vote buying and Dark DAO primitives implies that all on-chain voting schemes where users can generate their own keys inherently degrade to plutocracy."

**Mitigations:**
- **Shielded voting** (Snapshot/Shutter): Hide vote choices until voting closes -- eliminates verifiable vote buying
- **Commit-reveal schemes**: Voter commits hash of vote, reveals after period ends
- **Time-locked voting**: Tokens locked for extended period after voting (increases cost of renting votes)
- **Quadratic voting**: Reduces marginal value of purchased votes
- **Identity-weighted voting**: Soulbound tokens (SBTs) or attestations that cannot be transferred

### 9.3 Governance Capture (Plutocracy)

**The problem:** Wealthy actors accumulate enough tokens to control governance outcomes. Top 10 holders of major DAOs control 44-58% of voting power.

**Mitigations:**
- **Quadratic voting**: sqrt(tokens) reduces whale influence
- **Conviction voting**: Time-based power accumulation levels the field
- **Bicameral governance**: Second house based on reputation/identity (Optimism Citizens' House)
- **Vote caps**: Maximum voting power per address
- **Delegation diversity**: Encourage broad delegation to prevent power concentration

### 9.4 Proposal Spam / Griefing

**The attack:** Flooding governance with low-quality proposals to cause voter fatigue.

**Mitigations:**
- **Proposal threshold**: Minimum tokens required to propose (Governor standard)
- **Proposal bond**: Stake tokens that are slashed if proposal fails badly
- **Curation/boosting**: Holographic consensus filters attention (DAOstack)
- **Temperature check**: Required sentiment poll before formal proposal
- **Cooldown**: Limit proposals per author per period

### 9.5 Last-Minute Vote Swings

**The attack:** Large voter waits until final minutes to cast decisive vote, preventing response.

**Mitigations:**
- **Quiet ending period**: If vote outcome changes in final N hours, voting extends (Nouns DAO)
- **Time-weighted votes**: Early votes count more than last-minute votes
- **Vote finality delay**: Votes cast in final 10% of period have reduced weight

```typescript
// Comprehensive attack mitigation configuration
interface GovernanceSecurityConfig {
  // Flash loan defenses
  voting_delay_hours: number;           // e.g., 24
  min_proposal_threshold: number;       // tokens needed to propose
  time_weighted_snapshots: boolean;

  // Vote buying defenses
  shielded_voting: boolean;             // encrypt votes until close
  token_lock_days: number;              // lock tokens after voting

  // Plutocracy defenses
  max_voting_power_percent: number;     // cap per address (e.g., 10%)
  voting_model: 'linear' | 'quadratic' | 'conviction';

  // Spam defenses
  proposal_bond_amount: number;         // stake to propose
  proposal_cooldown_hours: number;      // time between proposals per author
  temperature_check_required: boolean;

  // Last-minute swing defenses
  quiet_ending_hours: number;           // extend if outcome changes
  quiet_ending_extensions_max: number;  // max extensions (prevent infinite)
}
```

**SodaWorld recommendation:** Priority mitigations for Phase 1:
1. Voting delay (24h minimum)
2. Proposal threshold (minimum token holding)
3. Snapshot at proposal creation block
4. Quiet ending period (6h extension if vote flips in final 12h)

---

## 10. Progressive Decentralization

### 10.1 a16z Framework

The canonical framework for building crypto projects that evolve from centralized to decentralized governance.

**Three stages:**

**Stage 1: Product/Market Fit (Founder-Led)**
- Centralized decision-making for speed
- Small team controls all parameters
- Token may exist but governance is informational only
- Focus: Build the product, find users

**Stage 2: Community Participation (Council)**
- Governance token with limited powers
- Community votes on high-level direction
- Team retains operational control with council oversight
- Multi-sig treasury with increasing signers
- Focus: Build community, establish norms

**Stage 3: Sufficient Decentralization (Token/Full)**
- Token holders control all governance parameters
- No single entity has unilateral control
- Information asymmetry eliminated
- Token potentially transmutes from security to non-security
- Focus: Resilience, self-sustainability

### 10.2 SodaWorld Decentralization Roadmap

```
Current State               Phase 1                  Phase 2                  Phase 3
(Council, 9 members)        (Enhanced Council)       (Hybrid)                 (Full Decentralization)

founder_led/council    -->  council + delegation --> token_weighted +     --> quadratic/conviction
                            + dynamic quorum        council veto             + bicameral
                            + proposal pipeline     + optimistic gov         + subDAOs
                            + voting delay          + committees             + on-chain execution
                            + basic analytics       + delegate registry      + prediction markets
                                                    + time-weighted voting   + rage quit
```

### 10.3 2025-2026 Governance Trends (a16z)

Six key trends identified by a16z crypto for 2025:

1. **AI + Governance**: AI agents that match voters to delegates based on values analysis. AI agents that vote on behalf of users. AI-driven proposal analysis and discussion participation.

2. **Improved Incentive Structures**: Move beyond one-off airdrops to sustained, structured incentive programs. Performance-based delegate compensation.

3. **Professional Governance Operations**: Core teams handle execution; community handles strategy. Clear separation of concerns reduces governance fatigue.

4. **Modular Governance Architecture**: Aragon OSx and similar frameworks enable swapping governance models without redeploying. Plugin-based approach.

5. **Cross-Chain Governance**: Snapshot X (Starknet) and Axelar enable governance across multiple chains. Interchain governance for L2 ecosystems.

6. **Governance Minimization**: Automate and reduce the scope of governance decisions. Algorithmic parameter adjustment where possible.

### 10.4 Gitcoin 2025 Governance Strategy

Gitcoin's approach provides a concrete example of progressive decentralization:
- "Leveling up with professional governance, progressive decentralization, and enhanced builder engagement"
- Clear structures and measurable outcomes
- Workstream-based budgets: PGF (Public Goods Funding), FDD (Fraud Detection/Defense), DAO Operations
- Each workstream has independent budget with governance oversight

### 10.5 SodaWorld Phase Transitions

```typescript
// Phase transition criteria
interface DecentralizationPhase {
  phase: 'founder_led' | 'council' | 'hybrid' | 'full_decentralization';
  criteria: {
    min_token_holders: number;
    min_active_voters: number;
    min_proposals_passed: number;
    min_delegate_count: number;
    max_concentration_percent: number;  // max % held by top holder
    min_nakamoto_coefficient: number;
    governance_health_score_min: number;
  };
  governance_model: GovernanceModel;
  council_authority: 'full' | 'operational' | 'veto_only' | 'none';
  community_authority: 'advisory' | 'strategic' | 'full';
}

const sodaWorldPhases: DecentralizationPhase[] = [
  {
    phase: 'council',
    criteria: {
      min_token_holders: 0,
      min_active_voters: 5,
      min_proposals_passed: 0,
      min_delegate_count: 0,
      max_concentration_percent: 100,
      min_nakamoto_coefficient: 2,
      governance_health_score_min: 0,
    },
    governance_model: 'council',
    council_authority: 'full',
    community_authority: 'advisory',
  },
  {
    phase: 'hybrid',
    criteria: {
      min_token_holders: 50,
      min_active_voters: 20,
      min_proposals_passed: 10,
      min_delegate_count: 5,
      max_concentration_percent: 40,
      min_nakamoto_coefficient: 5,
      governance_health_score_min: 50,
    },
    governance_model: 'token_weighted',
    council_authority: 'veto_only',
    community_authority: 'strategic',
  },
  {
    phase: 'full_decentralization',
    criteria: {
      min_token_holders: 200,
      min_active_voters: 50,
      min_proposals_passed: 50,
      min_delegate_count: 20,
      max_concentration_percent: 20,
      min_nakamoto_coefficient: 10,
      governance_health_score_min: 70,
    },
    governance_model: 'quadratic',
    council_authority: 'none',
    community_authority: 'full',
  },
];
```

---

## Implementation Priority

### Phase 1 -- Immediate (Current Sprint)

| Item | Effort | Impact |
|------|--------|--------|
| Voting delay (24h minimum before voting starts) | Low | High (flash loan defense) |
| Dynamic quorum (Nouns-style, contentiousness-based) | Medium | High |
| Enhanced proposal statuses (temperature_check, queued, vetoed) | Low | Medium |
| Proposal threshold (minimum tokens to create proposal) | Low | Medium |
| Quiet ending period (6h extension on vote flip) | Medium | Medium |
| Daily balance snapshots for time-weighted eligibility | Medium | High |
| Participation tracking per member | Low | Medium |
| Threshold matrix by proposal type (see Section 3.4) | Low | High |

### Phase 2 -- Near-term (Next Quarter)

| Item | Effort | Impact |
|------|--------|--------|
| Compound-style delegation with delegate profiles | Medium | High |
| Optimistic governance for council routine proposals | Medium | High |
| Delegate registry with participation scoring | Medium | Medium |
| Committee/SubDAO structure (grants, security) | Medium | High |
| Shielded voting (commit-reveal scheme) | Medium | Medium |
| Governance analytics dashboard | High | High |
| Snapshot integration for gasless off-chain voting | High | High |
| Rage quit mechanism (minority protection) | Medium | Medium |
| Time-weighted voting power (30-day lookback) | Medium | High |

### Phase 3 -- Strategic (6-12 Months)

| Item | Effort | Impact |
|------|--------|--------|
| Quadratic voting (requires identity layer) | High | High |
| Conviction voting for continuous grants allocation | High | Medium |
| Holographic consensus (prediction market filtering) | High | Medium |
| Liquid democracy (topic-based, chain delegation) | High | Medium |
| AI-powered delegate matching and voting assistance | High | High |
| Bicameral governance (Token House + Reputation House) | High | High |
| On-chain governance via Snapshot X or Governor contracts | High | High |
| SafeSnap bridge for off-chain to on-chain execution | High | Medium |
| Cross-chain governance support | High | Low |
| Progressive decentralization phase transition automation | Medium | High |

---

## Database Schema Additions

Summary of new tables recommended across all sections:

```sql
-- Delegation system
CREATE TABLE delegations (
  id UUID PRIMARY KEY,
  dao_id UUID REFERENCES daos(id),
  delegator_id UUID REFERENCES users(id),
  delegate_id UUID REFERENCES users(id),
  voting_power DECIMAL NOT NULL,
  topic TEXT,                          -- null = all topics
  proposal_id UUID,                    -- null = all proposals
  depth INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',        -- active | revoked
  delegated_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Delegate profiles
CREATE TABLE delegate_profiles (
  id UUID PRIMARY KEY,
  dao_id UUID REFERENCES daos(id),
  user_id UUID REFERENCES users(id),
  display_name TEXT,
  platform_statement TEXT,
  expertise_areas JSONB DEFAULT '[]',
  participation_rate DECIMAL DEFAULT 0,
  proposals_voted INTEGER DEFAULT 0,
  proposals_created INTEGER DEFAULT 0,
  total_voting_power DECIMAL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  delegate_since TIMESTAMPTZ DEFAULT NOW()
);

-- Committees / SubDAOs
CREATE TABLE committees (
  id UUID PRIMARY KEY,
  dao_id UUID REFERENCES daos(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,                  -- grants | security | treasury | technical | custom
  mandate TEXT,
  members JSONB DEFAULT '[]',
  approval_threshold INTEGER,
  budget_allocation DECIMAL DEFAULT 0,
  budget_remaining DECIMAL DEFAULT 0,
  reporting_frequency TEXT DEFAULT 'monthly',
  parent_dao_veto BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dissolved_at TIMESTAMPTZ
);

-- Governance security configuration
CREATE TABLE governance_security_config (
  id UUID PRIMARY KEY,
  dao_id UUID REFERENCES daos(id),
  voting_delay_hours INTEGER DEFAULT 24,
  min_proposal_threshold DECIMAL DEFAULT 100,
  time_weighted_snapshots BOOLEAN DEFAULT false,
  lookback_days INTEGER DEFAULT 30,
  shielded_voting BOOLEAN DEFAULT false,
  max_voting_power_percent DECIMAL DEFAULT 100,
  proposal_bond_amount DECIMAL DEFAULT 0,
  proposal_cooldown_hours INTEGER DEFAULT 0,
  quiet_ending_hours INTEGER DEFAULT 6,
  quiet_ending_max_extensions INTEGER DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Balance snapshots for time-weighted voting
CREATE TABLE balance_snapshots (
  id UUID PRIMARY KEY,
  dao_id UUID REFERENCES daos(id),
  user_id UUID REFERENCES users(id),
  balance DECIMAL NOT NULL,
  snapshot_date DATE NOT NULL,
  UNIQUE(dao_id, user_id, snapshot_date)
);

-- Governance analytics snapshots
CREATE TABLE governance_snapshots (
  id UUID PRIMARY KEY,
  dao_id UUID REFERENCES daos(id),
  snapshot_date DATE NOT NULL,
  voter_turnout_rate DECIMAL,
  unique_voters INTEGER,
  gini_coefficient DECIMAL,
  nakamoto_coefficient INTEGER,
  top_10_power_pct DECIMAL,
  total_proposals INTEGER,
  governance_health_score DECIMAL,
  metrics JSONB,
  UNIQUE(dao_id, snapshot_date)
);

-- Governance alerts
CREATE TABLE governance_alerts (
  id UUID PRIMARY KEY,
  dao_id UUID REFERENCES daos(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,              -- info | warning | critical
  message TEXT NOT NULL,
  data JSONB,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Sources & References

**Voting Mechanisms:**
- [DAO Governance: Voting Power, Participation, and Controversy](https://dl.acm.org/doi/10.1145/3777416) -- ACM DLT Research
- [Quadratic Voting](https://en.wikipedia.org/wiki/Quadratic_voting) -- Wikipedia / RadicalxChange
- [Conviction Voting cadCAD Model](https://github.com/1Hive/conviction-voting-cadcad) -- 1Hive / Commons Stack
- [Gardens Framework](https://gardens.substack.com/p/introducing-gardens) -- 1Hive
- [Holographic Consensus](https://medium.com/daostack/holographic-consensus-part-1-116a73ba1e1c) -- DAOstack
- [Moloch Rage Quit](https://dao-docs.quadratic-labs.com/moloch-on-starknet/features/ragequit-and-guildkick) -- Quadratic Labs
- [Scalable Voting: Validation of Holographic Consensus](https://scholarspace.manoa.hawaii.edu/items/f72bbf22-8fc2-4cec-b501-a01d3fc4d578) -- University of Hawaii

**Delegation:**
- [Delegated Voting in DAOs: A Scoping Review](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2025.1598283/full) -- Frontiers in Blockchain (2025)
- [Liquid Delegation in DAO Governance](https://mariolaul.medium.com/liquid-delegation-in-dao-governance-440a160fe16a) -- Mario Laul
- [Fairness in Token Delegation](https://arxiv.org/html/2510.05830) -- arXiv (2025)
- [ENT DAO Liquid Democracy](https://github.com/ent-dao/liquid-democracy) -- GitHub

**Quorum & Thresholds:**
- [Nouns Dynamic Quorum](https://mirror.xyz/verbsteam.eth/96zSoFfiT_RM2o2P9UbVKxPzVpB_trZqUjzllBE00BE) -- Verbs Team
- [Time-Weighted Snapshot Framework](https://arxiv.org/html/2505.00888v1) -- arXiv (2025)
- [DAO Voting Mechanism Resistant to Whale and Collusion](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2024.1405516/full) -- Frontiers

**Proposal Systems:**
- [OpenZeppelin Governor](https://docs.openzeppelin.com/contracts/4.x/governance) -- OpenZeppelin Docs
- [OpenZeppelin Governor on Tally](https://docs.tally.xyz/user-guides/governance-frameworks/openzeppelin-governor) -- Tally Docs
- [Snapshot Documentation](https://docs.snapshot.box/) -- Snapshot Labs
- [Snapshot X on Starknet](https://www.starknet.io/blog/snapshot-x-onchain-voting/) -- Starknet

**On-Chain / Off-Chain Bridge:**
- [SafeSnap Reality Plugin](https://docs.snapshot.box/user-guides/plugins/safesnap-reality) -- Snapshot Docs
- [Gnosis SafeSnap Launch](https://beincrypto.com/gnosis-off-chain-voting-safesnap-yearn-sushiswap-adopt-feature/) -- BeInCrypto
- [Kleros x SafeSnap](https://blog.kleros.io/kleros-x-safesnap/) -- Kleros

**Optimistic Governance:**
- [Optimism Season 8](https://optimism.mirror.xyz/JR5YEsK9-bM6At6c6iC5RiNNE4XXi0sMp3ytINq0wXw) -- Optimism Collective
- [Future of Optimism Governance](https://www.optimism.io/blog/the-future-of-optimism-governance) -- Optimism
- [Optimistic Dual Governance (Aragon)](https://blog.aragon.org/optimistic-dual-governance-a-new-governance-design-leveraging-aragon-osx-plugins/) -- Aragon
- [Governance of Optimism](https://lemma.solutions/the-governance-of-optimism/) -- Lemma Solutions

**SubDAOs / Committees:**
- [Orca Protocol Pods](https://orca.mirror.xyz/dpNi9dL-ARddwhFYvBrQfM-SVoNyZkzQgA_KLaHZZ78) -- Orca Mirror
- [What Is a SubDAO?](https://blockworks.co/news/are-subdaos-the-future-of-dao-governance) -- Blockworks
- [MakerDAO Endgame](https://endgame.makerdao.com/endgame/overview) -- MakerDAO
- [MakerDAO SubDAO Branches](https://blockworks.co/news/maker-endgame-sub-dao-governance-gnosis-dai) -- Blockworks

**Analytics:**
- [DeepDAO Participation Score](https://deepdao.gitbook.io/deepdao-products/governance-list-the-top-daoists/dao-participation-score) -- DeepDAO
- [Messari Governor](https://messari.io/report/introducing-messari-governor-the-first-to-market-governance-aggregator-and-voting-platform) -- Messari
- [DAO Statistics 2025](https://coinlaw.io/decentralized-autonomous-organizations-statistics/) -- CoinLaw
- [DAO Growth Stats](https://patentpc.com/blog/dao-growth-stats-treasury-sizes-governance-votes-activity) -- PatentPC

**Security & Attacks:**
- [DAO Governance Attacks and How to Avoid Them](https://a16zcrypto.com/posts/article/dao-governance-attacks-and-how-to-avoid-them/) -- a16z Crypto
- [DAO Governance DeFi Attacks](https://dacian.me/dao-governance-defi-attacks) -- Dacian
- [On-Chain Vote Buying and Dark DAOs](https://initc3org.medium.com/on-chain-vote-buying-and-the-rise-of-dark-daos-b01f5bd77030) -- IC3
- [Governance Attack Vectors](https://olympixai.medium.com/governance-attack-vectors-in-daos-a-comprehensive-analysis-of-identification-and-prevention-e27c08d45ae4) -- Olympix
- [Perils of Current DAO Governance](https://arxiv.org/html/2406.08605v1) -- arXiv
- [Typical DAO Governance Vulnerabilities](https://mundus.dev/blog/typical-dao-and-governance-smart-contracts-vulnerabilities) -- Mundus

**Progressive Decentralization:**
- [Progressive Decentralization Framework](https://a16zcrypto.com/posts/article/progressive-decentralization-a-high-level-framework/) -- a16z Crypto
- [Progressive Decentralization Playbook](https://a16z.com/progressive-decentralization-a-playbook-for-building-crypto-applications/) -- a16z
- [6 Decentralized Governance Trends for 2025](https://a16zcrypto.com/posts/article/6-decentralized-governance-trends-for-2025/) -- a16z Crypto
- [Gitcoin Governance Strategy 2025](https://gov.gitcoin.co/t/gitcoins-governance-strategy-for-2025/19845/1) -- Gitcoin Forum

**Platforms & Tools:**
- [Aragon OSx Modular Framework](https://blog.aragon.org/the-future-of-governance-is-modular-2/) -- Aragon
- [Aragon DAO Tool Report 2025](https://daotimes.com/aragon-dao-tool-report-for-2025/) -- DAOTimes
- [Snapshot DAO Tool Report 2025](https://daotimes.com/snapshot-dao-tool-report-for-2025/) -- DAOTimes
- [Top Web3 Governance Platforms 2026](https://startupstash.com/top-web3-governance-and-dao-platforms/) -- StartupStash
- [Gitcoin Grants Results](https://www.gitcoin.co/blog/gg22-results-recap) -- Gitcoin
- [ERC20Votes: ERC5805 and ERC6372](https://rareskills.io/post/erc20-votes-erc5805-and-erc6372) -- RareSkills

---

*65+ sources referenced -- see full bibliography above*
