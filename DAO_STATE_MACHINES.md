# SodaWorld DAO State Machines Specification (DAOV1)

**Version**: 1.0.0
**Author**: Machine #1 Hub (PIA Orchestration System)
**Created**: 2026-02-12
**Status**: SPEC DRAFT -- Ready for Implementation
**Repo**: DAOV1

---

## Table of Contents

1. [Overview](#1-overview)
2. [Agreement Lifecycle](#2-agreement-lifecycle)
3. [Proposal Flow](#3-proposal-flow)
4. [Token Vesting](#4-token-vesting)
5. [User Onboarding](#5-user-onboarding)
6. [DAO Phase](#6-dao-phase)
7. [Bounty Lifecycle](#7-bounty-lifecycle)
8. [AI Module Learning](#8-ai-module-learning)
9. [Cross-Machine State Synchronization](#9-cross-machine-state-synchronization)
10. [Global Error States](#10-global-error-states)
11. [Implementation Notes](#11-implementation-notes)

---

## 1. Overview

The SodaWorld DAO platform (DAOV1) is built on seven interconnected state machines. Each state machine governs a distinct lifecycle within the DAO. They share a common pattern:

- **States** are stored in SQLite (via `better-sqlite3`) and broadcast over WebSocket
- **Transitions** are atomic database operations wrapped in transactions
- **Guards** are pre-condition checks that MUST pass before a transition fires
- **Actions** are side effects (notifications, token operations, AI calls) executed after a successful transition
- **Events** are the triggers -- user actions, cron jobs, AI decisions, or cascading effects from other state machines

### Shared Conventions

```
State naming:    lowercase_snake_case
Event naming:    UPPER_SNAKE_CASE
Guard naming:    can_<transition_name>
Action naming:   on_<transition_name>
Error states:    <machine>_error or <machine>_suspended
```

### Cross-Machine Dependencies

```
Agreement Lifecycle  -->  Token Vesting (agreement activation triggers vest schedule)
Proposal Flow        -->  Agreement Lifecycle (proposal execution can create agreements)
DAO Phase            -->  Proposal Flow (phase determines available voting types)
User Onboarding      -->  AI Module Learning (onboarding data feeds AI calibration)
Bounty Lifecycle     -->  Token Vesting (bounty completion can trigger token release)
AI Module Learning   -->  Proposal Flow (autonomous AI can auto-execute passed proposals)
```

---

## 2. Agreement Lifecycle

Agreements are the backbone of DAO operations. They represent binding commitments between parties: service agreements, partnership terms, funding allocations, contributor contracts, and resource sharing pacts.

### 2.1 State Diagram

```
                          SUBMIT_DRAFT
                              |
                              v
    +--------+          +-----------+          +------------------+
    |        |  CREATE   |           |  SUBMIT  |                  |
    | (none) |---------->|   draft   |--------->| pending_signatures|
    |        |          |           |          |                  |
    +--------+          +-----+-----+          +--------+---------+
                              |                         |
                         CANCEL_DRAFT              SIGN (per party)
                              |                         |
                              v                         |
                        +-----------+                   |
                        | cancelled |          All signed?
                        +-----------+              |    |
                                              no   |    | yes
                                              |    |    |
                                              v    |    v
                                         (wait)   | +--------+
                                                   | | active |<------+
                                                   | +---+----+       |
                                                   |     |            |
                                                   |     |  COMPLETE  | RENEW
                                                   |     |  TERMINATE |
                                                   |     |  DISPUTE   |
                                                   |     |            |
                                          REJECT   |     +------+-----+------+
                                            |      |            |      |     |
                                            v      |            v      v     |
                                       +--------+  |    +---------+ +-----+  |
                                       |rejected|  |    |completed| |term-|  |
                                       +--------+  |    +---------+ |inated| |
                                                   |                +-----+  |
                                                   |                         |
                                                   |     +----------+        |
                                                   +---->| disputed |--------+
                                                         +----+-----+  RESOLVE
                                                              |
                                                         RESOLVE_FAIL
                                                              |
                                                              v
                                                         +---------+
                                                         |terminated|
                                                         +---------+
```

### 2.2 State Descriptions

| State | Description | Duration | Mutability |
|-------|-------------|----------|------------|
| `draft` | Agreement is being authored. Only the creator can edit terms, add parties, attach documents. | Unlimited | Fully editable |
| `pending_signatures` | All terms are locked. Awaiting cryptographic signatures from all named parties. | 30 days max (configurable) | Read-only (terms locked) |
| `active` | All parties have signed. Agreement is in force. Token vesting schedules activate. | Per agreement terms | Amendments require new proposal |
| `completed` | All obligations fulfilled. Final settlement executed. | Terminal | Immutable |
| `terminated` | Agreement ended early by mutual consent, breach, or dispute resolution. | Terminal | Immutable |
| `disputed` | One or more parties have raised a formal dispute. Enters arbitration flow. | 90 days max | Dispute evidence appendable |
| `rejected` | One or more required signers rejected during pending_signatures. | Terminal | Immutable |
| `cancelled` | Creator cancelled before submitting for signatures. | Terminal | Immutable |

### 2.3 Transition Table

| # | From State | Event | To State | Guard Condition | Action |
|---|-----------|-------|----------|-----------------|--------|
| A1 | `(none)` | `CREATE` | `draft` | `caller.is_dao_member AND caller.kyc_verified` | Create agreement record; assign creator as owner; log creation event |
| A2 | `draft` | `SUBMIT_DRAFT` | `pending_signatures` | `agreement.has_all_required_fields AND agreement.parties.length >= 2 AND agreement.terms_hash != null` | Lock all terms; compute terms_hash; notify all parties via WebSocket + email; start signature_deadline timer |
| A3 | `draft` | `CANCEL_DRAFT` | `cancelled` | `caller == agreement.creator` | Soft-delete draft; release any escrowed tokens; log cancellation |
| A4 | `pending_signatures` | `SIGN` | `pending_signatures` | `caller IN agreement.parties AND NOT already_signed(caller)` | Record signature + timestamp; emit `agreement:signed` event; check if all parties signed |
| A5 | `pending_signatures` | `SIGN` (last party) | `active` | `all_parties_signed(agreement)` | Activate agreement; trigger token vesting schedule; notify all parties; emit `agreement:activated`; log on-chain hash |
| A6 | `pending_signatures` | `REJECT` | `rejected` | `caller IN agreement.parties AND NOT already_signed(caller)` | Record rejection + reason; notify creator and all parties; release any escrowed tokens |
| A7 | `pending_signatures` | `SIGNATURE_TIMEOUT` | `cancelled` | `now > agreement.signature_deadline` | Auto-cancel; notify all parties; release escrowed tokens; log timeout |
| A8 | `active` | `COMPLETE` | `completed` | `all_milestones_met(agreement) OR (caller == agreement.creator AND all_parties_approve_completion)` | Execute final settlement; release remaining vested tokens; archive agreement; emit `agreement:completed` |
| A9 | `active` | `TERMINATE` | `terminated` | `(caller IN agreement.parties AND termination_clause_met) OR (caller.is_arbitrator AND dispute_resolved)` | Execute termination clause; prorate vested tokens; notify all parties; emit `agreement:terminated` |
| A10 | `active` | `DISPUTE` | `disputed` | `caller IN agreement.parties AND dispute_reason.length > 0` | Freeze token vesting; assign arbitrator; notify all parties; create dispute record; start dispute_deadline timer |
| A11 | `active` | `AMEND` | `active` | `caller IN agreement.parties AND amendment_proposal_passed` | Apply amendment; update terms_hash; notify all parties; log amendment |
| A12 | `active` | `RENEW` | `active` | `agreement.renewable AND renewal_proposal_passed` | Extend end_date; reset milestones if applicable; notify all parties |
| A13 | `disputed` | `RESOLVE` | `active` | `caller.is_arbitrator AND resolution.accepted_by_all_parties` | Unfreeze token vesting; apply resolution terms; notify all parties; close dispute record |
| A14 | `disputed` | `RESOLVE_TERMINATE` | `terminated` | `caller.is_arbitrator` | Execute arbitrator ruling; distribute tokens per ruling; notify all parties |
| A15 | `disputed` | `DISPUTE_TIMEOUT` | `terminated` | `now > dispute.deadline AND NOT dispute.resolved` | Auto-terminate; distribute tokens per default dispute clause; notify all parties |

### 2.4 Multi-Party Signing Flow

```
Agreement submitted for signatures
         |
         v
   For each party in agreement.parties:
         |
    +----+----+
    |         |
    v         v
  SIGN     REJECT -------> Agreement = rejected (terminal)
    |
    v
  Record signature
    |
    v
  All parties signed?
    |         |
   no        yes
    |         |
    v         v
  (wait)   Transition to active
            |
            v
          Trigger token vesting
          Emit notifications
```

**Signature ordering**: By default, signatures can arrive in any order (parallel signing). If `agreement.sequential_signing == true`, parties must sign in the order listed in `agreement.parties[]`.

**Delegate signing**: A party can designate a `signing_delegate` who signs on their behalf. The delegate must hold the `SIGNING_DELEGATE` role for that party's DAO membership.

### 2.5 Edge Cases

- **Party leaves DAO during pending_signatures**: Agreement auto-transitions to `cancelled`. All other signatures are voided.
- **Creator account suspended during active**: Agreement remains active. A co-party or arbitrator can trigger transitions.
- **Duplicate SIGN event**: Idempotent. Second signature from same party is silently ignored.
- **Network partition during SIGN**: The signature is recorded locally and synced via the PIA cross-machine protocol when connectivity resumes. Conflict resolution uses last-write-wins with vector clocks.
- **Agreement with self**: Blocked by guard. `agreement.parties` must contain at least 2 distinct addresses.

---

## 3. Proposal Flow

Proposals are the governance mechanism. Any DAO member can propose changes, spending, parameter updates, or agreement creation. The voting mechanism varies by DAO phase and proposal type.

### 3.1 State Diagram

```
                                    CREATE_PROPOSAL
                                         |
                                         v
    +--------+                     +-----------+
    |        |    CREATE            |           |
    | (none) |------------------->|   draft   |
    |        |                     |           |
    +--------+                     +-----+-----+
                                         |
                                    PUBLISH
                                         |
                                         v
                                   +-----------+
                                   |           |
                                   |  active   |<--------+
                                   |  (voting) |         |
                                   +-----+-----+     EXTEND_VOTING
                                         |              (if enabled)
                                    VOTING_ENDS
                                         |
                              +----------+----------+
                              |                     |
                         quorum met?           quorum NOT met
                              |                     |
                    +---------+---------+           v
                    |                   |    +-----------+
               votes FOR >          votes    | no_quorum |
               threshold?          AGAINST   +-----------+
                    |               > threshold
                    v                   |
              +----------+              v
              |  passed  |        +----------+
              +----+-----+       | rejected  |
                   |              +----------+
                   |
              EXECUTE
                   |
          +--------+--------+
          |                 |
     execution          execution
     succeeds            fails
          |                 |
          v                 v
    +-----------+     +-----------+
    | executed  |     | failed    |
    +-----------+     +-----------+
                           |
                      RETRY (max 3)
                           |
                           v
                      (re-execute)
```

### 3.2 State Descriptions

| State | Description |
|-------|-------------|
| `draft` | Proposal is being written. Only the proposer can edit. Not visible to other members. |
| `active` | Proposal is published and open for voting. Terms are locked. |
| `passed` | Voting period ended. Quorum reached and approval threshold met. Awaiting execution. |
| `rejected` | Voting period ended. Quorum reached but approval threshold NOT met. |
| `no_quorum` | Voting period ended. Quorum NOT reached. Can be re-submitted with new voting period. |
| `executed` | Proposal actions have been successfully applied to the DAO state. Terminal. |
| `failed` | Proposal execution attempted but failed (on-chain error, invalid state, etc.). |
| `cancelled` | Proposer withdrew the draft before publishing. Terminal. |

### 3.3 Transition Table

| # | From State | Event | To State | Guard Condition | Action |
|---|-----------|-------|----------|-----------------|--------|
| P1 | `(none)` | `CREATE` | `draft` | `caller.is_dao_member AND caller.reputation >= min_proposal_reputation` | Create proposal record; assign proposer |
| P2 | `draft` | `PUBLISH` | `active` | `proposal.has_title AND proposal.has_description AND proposal.has_voting_config AND proposal.deposit_paid` | Lock proposal terms; start voting_period timer; notify all eligible voters; emit `proposal:published` |
| P3 | `draft` | `CANCEL` | `cancelled` | `caller == proposal.proposer` | Refund deposit; soft-delete |
| P4 | `active` | `VOTE` | `active` | `caller.is_eligible_voter AND NOT already_voted(caller) AND now < voting_end` | Record vote (see voting mechanics below); update tally; emit `proposal:vote_cast` |
| P5 | `active` | `VOTING_ENDS` | `passed` | `quorum_reached(proposal) AND approval_threshold_met(proposal)` | Lock results; emit `proposal:passed`; start execution_delay timer (timelock) |
| P6 | `active` | `VOTING_ENDS` | `rejected` | `quorum_reached(proposal) AND NOT approval_threshold_met(proposal)` | Lock results; refund deposit; emit `proposal:rejected` |
| P7 | `active` | `VOTING_ENDS` | `no_quorum` | `NOT quorum_reached(proposal)` | Lock results; refund deposit; emit `proposal:no_quorum` |
| P8 | `active` | `EXTEND_VOTING` | `active` | `caller.is_dao_admin AND extension_count < max_extensions` | Extend voting_end; notify voters; increment extension_count |
| P9 | `active` | `EMERGENCY_CANCEL` | `cancelled` | `caller.is_dao_admin AND proposal.flagged_malicious` | Cancel voting; refund deposit; notify all; emit `proposal:emergency_cancelled` |
| P10 | `passed` | `EXECUTE` | `executed` | `now >= execution_delay_end AND execution_payload_valid(proposal)` | Execute proposal actions (see below); emit `proposal:executed`; burn deposit |
| P11 | `passed` | `EXECUTE` | `failed` | `execution_throws_error` | Log error; emit `proposal:execution_failed`; increment retry_count |
| P12 | `passed` | `VETO` | `cancelled` | `caller.is_dao_guardian AND now < execution_delay_end` | Cancel execution; refund deposit; emit `proposal:vetoed` |
| P13 | `failed` | `RETRY` | `executed` | `retry_count < 3 AND execution_succeeds` | Re-execute; emit `proposal:executed` |
| P14 | `failed` | `RETRY` | `failed` | `retry_count >= 3` | Mark permanently failed; refund deposit; emit `proposal:permanently_failed` |
| P15 | `no_quorum` | `RESUBMIT` | `draft` | `caller == proposal.proposer AND resubmit_count < 2` | Clone proposal to new draft; increment resubmit_count; refund original deposit |

### 3.4 Voting Mechanics

The DAO supports four voting mechanisms. The active mechanism depends on the DAO phase (see section 6) and the proposal type.

#### 3.4.1 Token-Weighted Voting

```
vote_power = caller.token_balance * caller.delegation_multiplier
approval_threshold = 50% + 1 of total_votes_cast (simple majority)
                  OR 66.7% for constitutional amendments
quorum = 10% of total_token_supply must participate
```

**Delegation**: A token holder can delegate their voting power to another member. Delegation is transitive up to 3 levels. Delegated votes can be overridden by the original holder casting directly.

```
Token Holder A (100 tokens) --delegates--> Delegate B
Token Holder C (50 tokens)  --delegates--> Delegate B
                                           Delegate B votes with 150 weight
                                           (plus their own tokens)

If A votes directly: A's 100 tokens are removed from B's delegation
```

#### 3.4.2 One-Person-One-Vote

```
vote_power = 1 (regardless of token balance)
approval_threshold = simple majority (>50%)
quorum = 25% of total_members must participate
```

Used for: social decisions, role elections, community guidelines.

Sybil resistance: Requires verified identity (KYC level 2+) to participate.

#### 3.4.3 Quadratic Voting

```
vote_cost = (number_of_votes)^2 tokens
    1 vote  = 1 token
    2 votes = 4 tokens
    3 votes = 9 tokens
    n votes = n^2 tokens

voter can split votes across multiple proposals in same epoch
tokens spent on voting are burned (removed from circulating supply)
quorum = 5% of total_token_supply burned in votes
```

Used for: budget allocation, multi-option votes, resource prioritization.

Anti-whale mechanism: No single voter can cast more than `sqrt(total_supply * 0.01)` votes on a single proposal.

#### 3.4.4 Conviction Voting

```
conviction(t) = conviction(t-1) * decay + tokens_staked
decay_factor = 0.9 (per epoch, where epoch = 1 day)
trigger_threshold = f(requested_amount / total_treasury)

Small requests (<1% treasury): threshold reached quickly
Large requests (>10% treasury): requires sustained conviction over weeks
```

Used for: ongoing funding streams, continuous grant allocation.

No fixed voting period. Conviction accumulates over time. Proposal triggers when threshold crossed.

```
  conviction
      ^
      |                              ___________  threshold for 5% treasury
      |                         ____/
      |                    ____/
      |               ____/
      |          ____/
      |     ____/
      |____/
      |
      +-----------------------------------------> time (days)
         d1   d5   d10   d15   d20   d25   d30
```

### 3.5 Quorum Rules Summary

| Voting Type | Quorum Requirement | Approval Threshold | Used In Phase |
|-------------|--------------------|--------------------|---------------|
| Token-Weighted | 10% of token supply | 50%+1 (simple) or 66.7% (constitutional) | All phases |
| One-Person-One-Vote | 25% of members | >50% | Growth+ |
| Quadratic | 5% of supply burned | Most votes wins | Scale+ |
| Conviction | N/A (continuous) | Dynamic threshold | Mature |

### 3.6 Execution Triggers

When a proposal passes, the `execution_payload` determines what happens:

| Payload Type | Action | Example |
|-------------|--------|---------|
| `transfer_tokens` | Move tokens from treasury to recipient | Fund a bounty: 1000 SODA to contributor |
| `create_agreement` | Instantiate a new agreement in draft state | Partnership with external DAO |
| `update_parameter` | Change a DAO configuration value | Change quorum from 10% to 15% |
| `grant_role` | Assign a role to a member | Promote member to arbitrator |
| `revoke_role` | Remove a role from a member | Remove admin privileges |
| `upgrade_contract` | Deploy new smart contract logic | Upgrade token vesting contract |
| `create_bounty` | Create a new bounty | Bug bounty: 500 SODA |
| `phase_transition` | Advance the DAO to next phase | Move from growth to scale |
| `custom_action` | Execute arbitrary approved code | Integration with external protocol |

### 3.7 Edge Cases

- **Voter token balance changes during voting**: Vote weight is snapshotted at `proposal.snapshot_block`. Balance changes after snapshot do not affect existing votes.
- **Proposal execution changes DAO parameters that affect other active proposals**: Proposals are executed serially (FIFO by pass timestamp). A parameter change affects proposals that execute AFTER it.
- **Two conflicting proposals both pass**: The one with the earlier `passed_at` timestamp executes first. The second one fails execution due to state conflict and enters `failed` state.
- **Proposer leaves DAO while proposal is active**: Voting continues. Execution proceeds if passed. The "proposer left" event is logged but does not cancel the proposal.
- **Flash loan attack on token-weighted vote**: Mitigated by snapshot mechanism. Tokens must be held at `snapshot_block`, which is set to `publish_block - 1` (the block BEFORE the proposal was published).

---

## 4. Token Vesting

Token vesting governs the release schedule of SODA tokens allocated through agreements, bounties, contributor grants, and founding team allocations. Vesting protects the DAO from immediate sell pressure and ensures long-term alignment.

### 4.1 State Diagram

```
    CREATE_VESTING_SCHEDULE
              |
              v
         +--------+
         |        |
         | locked |<---------+
         |        |          |
         +---+----+     REVOKE_AND_RELOCK
             |           (partial)
             |
        CLIFF_REACHED
             |
             v
         +----------+
         |          |
         | vesting  |------+
         |          |      |
         +----+-----+      |
              |             |
         VEST_CHUNK    VEST_CHUNK (periodic)
              |             |
              v             v
         +----------+  (accumulate unlocked)
         |          |
         | unlocked |
         |          |
         +----+-----+
              |
          CLAIM
              |
              v
         +---------+
         |         |
         | claimed |
         |         |
         +---------+

    Special paths:

    locked/vesting ----EARLY_TERMINATE----> terminated
                                               |
                                               v
                                          (pro-rate calculation)
                                               |
                                     +---------+----------+
                                     |                    |
                                vested portion      unvested portion
                                 -> unlocked          -> returned to
                                                        treasury

    locked/vesting ----ACCELERATE----> unlocked (full)
         (only via passed proposal)
```

### 4.2 State Descriptions

| State | Description | Token Access |
|-------|-------------|--------------|
| `locked` | Tokens allocated but not yet accessible. Cliff period has not been reached. | None. Cannot transfer, vote with, or claim. |
| `vesting` | Cliff reached. Tokens are unlocking on a schedule (linear or stepped). | Unlocked portion can be claimed. Locked portion remains inaccessible. |
| `unlocked` | Tokens have fully vested or a chunk has been released. Awaiting claim. | Can be claimed (transferred to wallet). |
| `claimed` | Tokens have been transferred to the beneficiary's wallet. Terminal. | Fully in beneficiary's control. |
| `terminated` | Vesting terminated early. Pro-rated calculation applied. | Vested portion -> unlocked. Unvested -> treasury. |

### 4.3 Transition Table

| # | From State | Event | To State | Guard Condition | Action |
|---|-----------|-------|----------|-----------------|--------|
| V1 | `(none)` | `CREATE_SCHEDULE` | `locked` | `caller.is_authorized_creator AND beneficiary.is_dao_member AND amount > 0 AND treasury_has_sufficient_balance` | Create vesting record; lock tokens from source (treasury/agreement); set cliff_date and end_date; emit `vesting:created` |
| V2 | `locked` | `CLIFF_REACHED` | `vesting` | `now >= schedule.cliff_date` | Calculate first vest chunk; mark chunk as unlocked; emit `vesting:cliff_reached`; notify beneficiary |
| V3 | `locked` | `EARLY_TERMINATE` | `terminated` | `(caller == agreement.terminator OR caller.is_dao_admin) AND termination_allowed(schedule)` | Return ALL locked tokens to treasury; emit `vesting:terminated`; notify beneficiary |
| V4 | `vesting` | `VEST_CHUNK` | `vesting` | `now >= next_vest_date AND remaining_locked > 0` | Calculate chunk size (linear or stepped); move chunk from locked to unlocked; update next_vest_date; emit `vesting:chunk_unlocked` |
| V5 | `vesting` | `VEST_CHUNK` (final) | `unlocked` | `remaining_locked == 0 after this chunk` | Move final chunk to unlocked; emit `vesting:fully_vested`; notify beneficiary |
| V6 | `vesting` | `EARLY_TERMINATE` | `terminated` | Same as V3 | Pro-rate: unlocked portion stays with beneficiary; remaining locked returns to treasury; emit `vesting:terminated` |
| V7 | `unlocked` | `CLAIM` | `claimed` | `caller == schedule.beneficiary AND unlocked_balance > 0` | Transfer tokens to beneficiary wallet; emit `vesting:claimed`; log transaction |
| V8 | `unlocked` | `PARTIAL_CLAIM` | `unlocked` | `caller == schedule.beneficiary AND claim_amount <= unlocked_balance AND claim_amount > 0` | Transfer claim_amount to beneficiary; reduce unlocked_balance; emit `vesting:partial_claim` |
| V9 | `locked` | `ACCELERATE` | `unlocked` | `acceleration_proposal_passed AND caller.is_execution_engine` | Unlock ALL tokens immediately; emit `vesting:accelerated`; notify beneficiary |
| V10 | `vesting` | `ACCELERATE` | `unlocked` | Same as V9 | Unlock ALL remaining tokens; emit `vesting:accelerated` |

### 4.4 Vesting Schedules

#### 4.4.1 Linear Vesting

Tokens unlock continuously over the vesting period after the cliff.

```
  tokens
  unlocked
      ^
  100%|                              ___________
      |                         ____/
      |                    ____/
      |               ____/
      |          ____/
      |     ____/
      |    |
   0% |____|
      +-----|-----------|-----------|-----------> time
           cliff      midpoint      end
           (6mo)      (18mo)       (36mo)

  Formula:
    unlocked(t) = total_amount * (t - cliff_date) / (end_date - cliff_date)
    where t >= cliff_date
    unlocked(t) = 0 where t < cliff_date
```

#### 4.4.2 Stepped Vesting (Monthly/Quarterly)

Tokens unlock in discrete chunks at regular intervals.

```
  tokens
  unlocked
      ^
  100%|                                    +-----
      |                              +-----+
      |                        +-----+
      |                  +-----+
      |            +-----+
      |      +-----+
      |      |
   0% |------+
      +------|-----|-----|-----|-----|-----|-----> time
           cliff  Q1    Q2    Q3    Q4   end
           (6mo)  (9mo) (12mo)(15mo)(18mo)(24mo)

  Formula:
    chunks = (end_date - cliff_date) / step_interval
    chunk_size = total_amount / chunks
    unlocked(t) = chunk_size * floor((t - cliff_date) / step_interval)
```

#### 4.4.3 Common Schedules

| Schedule Type | Cliff | Total Duration | Unlock Pattern | Used For |
|--------------|-------|----------------|----------------|----------|
| Founder | 12 months | 48 months | Monthly linear after cliff | Founding team |
| Core Contributor | 6 months | 24 months | Monthly linear after cliff | Full-time contributors |
| Advisor | 3 months | 12 months | Quarterly stepped | Advisors, consultants |
| Bounty | 0 (no cliff) | 0 (immediate) | Instant | Bounty completions |
| Partnership | 6 months | 36 months | Quarterly stepped | DAO partnerships |
| Grant | 1 month | 6 months | Monthly linear | Community grants |

### 4.5 Early Termination Handling

When vesting is terminated early (contributor leaves, agreement terminated, etc.):

```
Termination at time T:

  vested_amount   = unlocked(T)    -- already unlocked, stays with beneficiary
  unvested_amount = total - vested -- returns to treasury

  If termination_type == "for_cause":
    clawback_percentage applies to vested_amount (0-100%, set in agreement)
    returned = unvested_amount + (vested_amount * clawback_percentage)
    beneficiary_keeps = vested_amount * (1 - clawback_percentage)

  If termination_type == "without_cause":
    No clawback. Beneficiary keeps all vested tokens.
    returned = unvested_amount only

  If termination_type == "mutual":
    Custom split defined in agreement termination clause
```

### 4.6 Edge Cases

- **Beneficiary wallet compromised**: DAO admin can freeze vesting schedule (new state: `frozen`). Requires proposal to unfreeze with new beneficiary address.
- **Token redenomination**: Vesting amounts are stored as raw amounts. A redenomination event applies a multiplier to all active vesting schedules atomically.
- **Beneficiary dies/dissolves (entity)**: Vesting continues. Successor designated in agreement takes over. If no successor, DAO proposal required.
- **Multiple vesting schedules for same beneficiary**: Each schedule is independent. Beneficiary can have N active schedules.
- **Claim during network congestion**: Claim transactions are queued. If claim fails, tokens remain in `unlocked` state. Retry is safe (idempotent).

---

## 5. User Onboarding

The onboarding state machine captures a new user's journey from initial registration through AI-personalized experience. The goal is to extract maximum knowledge about the user to personalize their DAO experience and match them with relevant opportunities.

### 5.1 State Diagram

```
    REGISTER
       |
       v
    +-----+
    |     |
    | new |
    |     |
    +--+--+
       |
    CREATE_PROFILE
       |
       v
    +-----------------+
    |                 |
    | profile_created |
    |                 |
    +--------+--------+
             |
        EXTRACT_KNOWLEDGE
        (one or more methods)
             |
             v
    +---------------------+
    |                     |
    | knowledge_extracted |
    |                     |
    +----------+----------+
               |
          AI_PERSONALIZE
               |
               v
    +------------------+
    |                  |
    | ai_personalized  |
    |                  |
    +--------+---------+
             |
        COMPLETE_ONBOARDING
             |
             v
    +----------+
    |          |
    | complete |
    |          |
    +----------+

    At any point:

    (any state) ----SUSPEND----> suspended
    suspended   ----RESUME-----> (previous state)
    (any state) ----ABANDON----> abandoned (after 30 days inactivity)
```

### 5.2 State Descriptions

| State | Description | User Capabilities |
|-------|-------------|-------------------|
| `new` | User has authenticated (wallet connected or email verified) but no profile exists. | Can browse public DAO info. Cannot vote, propose, or claim. |
| `profile_created` | Basic profile completed: display name, avatar, timezone, language, interests. | Can view proposals. Cannot vote or propose. |
| `knowledge_extracted` | AI has extracted skills, experience, and preferences via one or more extraction methods. | Can receive AI-matched bounty suggestions. Cannot vote. |
| `ai_personalized` | AI modules have generated a personalized experience: dashboard layout, notification preferences, recommended DAOs, skill-matched roles. | Full read access. Can apply for roles. |
| `complete` | Onboarding finished. User is a full DAO member with voting rights. | Full access: vote, propose, claim, create agreements. |
| `suspended` | Account temporarily suspended (by admin or self-request). | No access. Tokens remain vested. |
| `abandoned` | User never completed onboarding within 30 days. | None. Can re-register to restart. |

### 5.3 Transition Table

| # | From State | Event | To State | Guard Condition | Action |
|---|-----------|-------|----------|-----------------|--------|
| O1 | `(none)` | `REGISTER` | `new` | `wallet_address_valid OR email_verified` | Create user record; generate user_id; emit `user:registered` |
| O2 | `new` | `CREATE_PROFILE` | `profile_created` | `profile.display_name.length >= 2 AND profile.display_name.length <= 50` | Store profile data; generate default avatar if none; emit `user:profile_created` |
| O3 | `profile_created` | `EXTRACT_KNOWLEDGE` | `knowledge_extracted` | `at_least_one_extraction_method_completed` | Store extracted knowledge graph; calculate initial skill_vector; emit `user:knowledge_extracted` |
| O4 | `knowledge_extracted` | `AI_PERSONALIZE` | `ai_personalized` | `knowledge_graph.skills.length > 0` | Run AI personalization pipeline; generate dashboard config; match roles; emit `user:personalized` |
| O5 | `ai_personalized` | `COMPLETE_ONBOARDING` | `complete` | `user.accepted_dao_constitution AND user.kyc_level >= required_level` | Grant DAO member role; mint welcome tokens (if configured); emit `user:onboarding_complete`; notify community |
| O6 | `(any)` | `SUSPEND` | `suspended` | `caller.is_dao_admin OR caller == user` | Freeze all user actions; preserve state for resume; emit `user:suspended` |
| O7 | `suspended` | `RESUME` | `(previous)` | `caller.is_dao_admin` | Restore previous state; unfreeze actions; emit `user:resumed` |
| O8 | `(any except complete)` | `ABANDON_TIMEOUT` | `abandoned` | `now > user.last_activity + 30_days` | Mark as abandoned; preserve data for 90 days then purge; emit `user:abandoned` |
| O9 | `abandoned` | `RE_REGISTER` | `new` | `user.wallet_address_valid` | Create new user record (or restore if within 90 days); emit `user:re_registered` |

### 5.4 Knowledge Extraction Methods

The system supports four methods for extracting user knowledge. Multiple methods can be combined for richer profiles. Each method populates the same knowledge graph schema.

#### 5.4.1 Chat-Based Extraction

```
Method: Interactive AI conversation
Duration: 5-15 minutes
Knowledge captured:
  - Self-reported skills (programming languages, frameworks, domains)
  - Experience level per skill (beginner/intermediate/expert)
  - Interests and motivations for joining the DAO
  - Communication style preferences
  - Timezone and availability
  - Past DAO/Web3 experience

Flow:
  AI: "Welcome to SodaWorld! I'd love to learn about you. What's your background?"
  User: "I'm a Rust developer with 5 years experience in DeFi protocols"
  AI: [extracts: {skill: "rust", level: "expert", domain: "defi", years: 5}]
  AI: "Impressive! What kind of contributions are you most excited about?"
  User: "Smart contract auditing and protocol design"
  AI: [extracts: {interests: ["security", "architecture"], role_fit: "security"}]
  ...continues for 5-10 exchanges...

AI Model used: Ollama (local, FREE tier) for initial extraction
               Claude Haiku for skill normalization
```

#### 5.4.2 CV/Resume Upload

```
Method: Parse uploaded document (PDF, DOCX, TXT, LinkedIn export)
Duration: Instant (async processing ~30 seconds)
Knowledge captured:
  - Work history with dates and roles
  - Education and certifications
  - Technical skills (parsed from job descriptions)
  - Project portfolio
  - Publications and speaking engagements
  - Inferred expertise level based on years + roles

Processing pipeline:
  1. Document -> text extraction (pdf-parse or mammoth)
  2. Text -> structured data (Claude Haiku)
  3. Structured data -> skill_vector normalization
  4. Deduplication against existing knowledge graph

Privacy: Original document is NOT stored. Only extracted knowledge graph is retained.
         User can delete their knowledge graph at any time.
```

#### 5.4.3 Cross-AI Import

```
Method: Import knowledge from other AI systems the user has interacted with
Duration: Depends on source API response time
Knowledge captured:
  - Interaction patterns (what topics they discuss with AI)
  - Code repositories analyzed (languages, frameworks, patterns)
  - Prior AI-assisted projects
  - Preference data (response length, formality, detail level)

Supported sources:
  - GitHub Copilot usage stats (via GitHub API)
  - ChatGPT conversation export (uploaded JSON)
  - Claude conversation history (via API with user consent)
  - Cursor/Windsurf usage data (local file import)

Privacy: Explicit user consent required for each source.
         Data is processed locally (Ollama) when possible.
         Only the knowledge graph is retained, not raw conversations.
```

#### 5.4.4 Profile Import

```
Method: Import from existing platforms
Duration: Instant via OAuth/API
Knowledge captured:
  - GitHub: repositories, stars, contributions, languages
  - LinkedIn: work history, skills, endorsements
  - Stack Overflow: reputation, tags, answer quality
  - Discord: server memberships, roles, activity level
  - ENS/Lens: on-chain identity, NFTs, protocol interactions

Processing:
  1. OAuth connection to source platform
  2. API data fetch (respecting rate limits)
  3. Normalization to knowledge graph schema
  4. Merge with existing knowledge (union, not replace)

Trust scoring:
  - GitHub (high trust: verified code contributions)
  - Stack Overflow (high trust: peer-reviewed knowledge)
  - LinkedIn (medium trust: self-reported, socially validated)
  - Discord (low trust: activity doesn't imply skill)
```

### 5.5 Knowledge Graph Schema

```typescript
interface UserKnowledgeGraph {
  user_id: string;

  skills: Skill[];           // [{name: "typescript", level: 0.85, source: "github", verified: true}]
  domains: Domain[];         // [{name: "defi", experience_years: 5, confidence: 0.9}]
  interests: string[];       // ["security", "governance", "education"]

  work_history: WorkEntry[]; // [{role, company, start, end, skills_used}]
  education: Education[];    // [{institution, degree, field, year}]
  projects: Project[];       // [{name, url, description, technologies, role}]

  preferences: {
    communication_style: 'concise' | 'detailed' | 'visual';
    notification_frequency: 'realtime' | 'daily' | 'weekly';
    timezone: string;
    languages: string[];     // spoken languages
    availability_hours_per_week: number;
  };

  ai_metadata: {
    extraction_methods_used: string[];
    confidence_score: number;        // 0-1, how confident the AI is in the profile
    last_updated: number;
    version: number;
  };
}
```

### 5.6 Edge Cases

- **User provides conflicting information across extraction methods**: AI uses confidence-weighted merge. Higher-trust sources (GitHub > self-report) take precedence. Conflicts are flagged for manual review.
- **User has no technical skills**: Knowledge graph still populated with interests, availability, communication style. User is matched with non-technical roles (community manager, content creator, governance participant).
- **User wants to delete all knowledge**: GDPR-compliant deletion. Knowledge graph purged. User returns to `profile_created` state. Must re-extract to proceed.
- **AI extraction hallucinates skills**: Each skill has a `source` field and `verified` flag. Only GitHub-sourced skills are auto-verified. Others require manual verification or peer endorsement.

---

## 6. DAO Phase

The DAO Phase state machine governs the overall maturity of the DAO. Each phase unlocks different governance mechanisms, feature sets, and operational parameters. Phase transitions are significant events that require community approval.

### 6.1 State Diagram

```
    DAO_CREATED
         |
         v
    +------------+
    |            |
    | foundation |
    |            |
    +-----+------+
          |
     GROWTH_CRITERIA_MET
     + PHASE_PROPOSAL_PASSED
          |
          v
    +-----------+
    |           |
    |  growth   |
    |           |
    +-----+-----+
          |
     SCALE_CRITERIA_MET
     + PHASE_PROPOSAL_PASSED
          |
          v
    +-----------+
    |           |
    |   scale   |
    |           |
    +-----+-----+
          |
     MATURE_CRITERIA_MET
     + PHASE_PROPOSAL_PASSED
          |
          v
    +-----------+
    |           |
    |  mature   |
    |           |
    +-----------+

    Emergency path (any phase):

    (any phase) ---EMERGENCY_REVERT---> (previous phase)
        requires: 75% supermajority vote + guardian approval
```

### 6.2 State Descriptions

| Phase | Description | Governance Style |
|-------|-------------|-----------------|
| `foundation` | DAO is newly created. Small team of founders. Core infrastructure being built. Centralized decision-making with founder multisig. | Founder multisig (3/5) for all decisions. No public proposals. |
| `growth` | DAO has initial traction. Community forming. Treasury seeded. Opening governance to members. | Token-weighted voting + one-person-one-vote enabled. Public proposals allowed. |
| `scale` | DAO has significant membership and treasury. Multiple active workstreams. Need for efficient capital allocation. | All voting types enabled including quadratic. Sub-DAOs can be created. |
| `mature` | DAO is fully decentralized. Autonomous operation. AI modules handle routine operations. Conviction voting for continuous funding. | Full governance suite. AI autonomous execution. Minimal human intervention needed. |

### 6.3 Transition Table

| # | From Phase | Event | To Phase | Guard Condition | Action |
|---|-----------|-------|----------|-----------------|--------|
| D1 | `(none)` | `DAO_CREATED` | `foundation` | `creator.has_deploy_capability AND initial_config_valid` | Deploy DAO contracts; set founder multisig; initialize treasury; emit `dao:created` |
| D2 | `foundation` | `ADVANCE_TO_GROWTH` | `growth` | `growth_criteria_met (see below) AND phase_transition_proposal_passed_by_founders` | Enable public proposals; enable token-weighted voting; open membership; emit `dao:phase_growth` |
| D3 | `growth` | `ADVANCE_TO_SCALE` | `scale` | `scale_criteria_met (see below) AND phase_transition_proposal_passed (66.7% supermajority)` | Enable quadratic voting; enable sub-DAO creation; increase treasury diversification limits; emit `dao:phase_scale` |
| D4 | `scale` | `ADVANCE_TO_MATURE` | `mature` | `mature_criteria_met (see below) AND phase_transition_proposal_passed (75% supermajority)` | Enable conviction voting; enable AI autonomous execution; remove founder special privileges; emit `dao:phase_mature` |
| D5 | `(any)` | `EMERGENCY_REVERT` | `(previous)` | `75%_supermajority AND guardian_approval AND emergency_condition_met` | Revert to previous phase; disable newly unlocked features; emit `dao:emergency_revert`; require post-mortem within 30 days |

### 6.4 Phase Transition Criteria

#### 6.4.1 Foundation to Growth

ALL of the following must be true:

```
1. MEMBERSHIP:    dao.member_count >= 10
2. TREASURY:      dao.treasury_value >= 10,000 USD equivalent
3. DURATION:      dao.age >= 30 days
4. AGREEMENTS:    dao.completed_agreements >= 3
5. INFRASTRUCTURE:
   - Token contract deployed and audited
   - Governance module deployed and tested
   - At least 2 extraction methods operational in onboarding
6. FOUNDER_VOTE:  All founders approve (multisig)
```

#### 6.4.2 Growth to Scale

ALL of the following must be true:

```
1. MEMBERSHIP:    dao.member_count >= 100
2. TREASURY:      dao.treasury_value >= 100,000 USD equivalent
3. ACTIVITY:      dao.proposals_passed_last_90_days >= 10
4. PARTICIPATION: dao.avg_voter_turnout_last_90_days >= 15%
5. DIVERSITY:     dao.unique_proposers_last_90_days >= 10
6. DURATION:      time_in_growth_phase >= 90 days
7. BOUNTIES:      dao.completed_bounties >= 20
8. COMMUNITY_VOTE: Phase transition proposal passes with 66.7% supermajority
```

#### 6.4.3 Scale to Mature

ALL of the following must be true:

```
1. MEMBERSHIP:    dao.member_count >= 1000
2. TREASURY:      dao.treasury_value >= 1,000,000 USD equivalent
3. ACTIVITY:      dao.proposals_passed_last_180_days >= 50
4. PARTICIPATION: dao.avg_voter_turnout_last_180_days >= 20%
5. DECENTRALIZATION:
   - No single entity holds > 10% of voting power
   - At least 5 active sub-DAOs
   - Gini coefficient of token distribution < 0.65
6. AI_READINESS:
   - All AI modules in 'calibrated' or 'autonomous' state
   - AI accuracy rate > 95% on routine decisions
   - AI Module Learning state machine shows at least 2 modules in 'autonomous'
7. DURATION:      time_in_scale_phase >= 180 days
8. COMMUNITY_VOTE: Phase transition proposal passes with 75% supermajority
```

### 6.5 Feature Unlock Matrix

| Feature | Foundation | Growth | Scale | Mature |
|---------|-----------|--------|-------|--------|
| Founder multisig governance | Yes | Yes (fallback) | No | No |
| Public proposals | No | Yes | Yes | Yes |
| Token-weighted voting | No | Yes | Yes | Yes |
| One-person-one-vote | No | Yes | Yes | Yes |
| Quadratic voting | No | No | Yes | Yes |
| Conviction voting | No | No | No | Yes |
| Sub-DAO creation | No | No | Yes | Yes |
| AI autonomous execution | No | No | No | Yes |
| Cross-DAO agreements | No | No | Yes | Yes |
| Treasury diversification | Limited | Moderate | Full | Full |
| Bounty creation (any member) | No | Yes | Yes | Yes |
| Role elections | No | No | Yes | Yes |
| Constitutional amendments | No | No | Yes (66.7%) | Yes (75%) |
| Emergency governance | Founders | Founders + Guardians | Guardians | Guardians |

### 6.6 Edge Cases

- **DAO permanently stuck in foundation**: If founders become inactive for 180+ days, a community override mechanism activates. Any 10 members can collectively trigger advancement to growth phase.
- **Criteria met but proposal fails**: The criteria check is a necessary but not sufficient condition. The community can vote against advancement even if metrics are met. No re-vote cooldown; a new proposal can be submitted immediately.
- **External shock reduces metrics below threshold**: Phase transitions are one-way (except emergency revert). Once in `growth`, the DAO does not automatically revert to `foundation` if member count drops below 10.
- **Multiple phase transitions in quick succession**: Each phase has a minimum duration requirement to prevent rushing. A DAO cannot advance from foundation to mature in less than 300 days (30 + 90 + 180).

---

## 7. Bounty Lifecycle

Bounties are task-based incentives for DAO contributors. They bridge the gap between proposal-approved work and individual contributor execution.

### 7.1 State Diagram

```
    CREATE_BOUNTY
         |
         v
    +---------+
    |         |
    | created |
    |         |
    +----+----+
         |
    APPROVE / AUTO_APPROVE
         |
         v
    +-----------+
    |           |
    | available |
    |           |
    +-----+-----+
          |
     CLAIM_BOUNTY
          |
          v
    +-------------+
    |             |
    | in_progress |
    |             |
    +------+------+
           |
      SUBMIT_WORK
           |
           v
    +-----------+
    |           |
    | submitted |
    |           |
    +-----+-----+
          |
     REVIEW_SUBMISSION
          |
          v
    +----------+
    |          |
    | reviewed |
    |          |
    +----+-----+
         |
    +----+----+
    |         |
  ACCEPT    REQUEST_REVISION
    |         |
    v         v
+---------+ +-----------+
|completed| | in_progress| (back to work)
+---------+ +-----------+
    |
    v
  (tokens released)

    Special paths:

    available ------EXPIRE--------> expired
    in_progress ----ABANDON-------> available (re-opened)
    in_progress ----DEADLINE------> overdue
    overdue --------EXTEND--------> in_progress
    overdue --------FORFEIT-------> available (re-opened)
    submitted ------DISPUTE-------> disputed
    disputed -------RESOLVE-------> completed OR rejected
    (any active) ---CANCEL--------> cancelled
```

### 7.2 State Descriptions

| State | Description |
|-------|-------------|
| `created` | Bounty defined but not yet approved for public listing. Pending moderator or auto-approval. |
| `available` | Bounty approved and listed. Any eligible contributor can claim it. |
| `in_progress` | A contributor has claimed the bounty and is working on it. Deadline timer active. |
| `submitted` | Work submitted by the contributor. Awaiting review by bounty creator or designated reviewer. |
| `reviewed` | Work has been reviewed. Pending final accept/reject decision or revision request. |
| `completed` | Work accepted. Tokens released to contributor. Terminal success state. |
| `rejected` | Work definitively rejected after max revisions. Bounty returns to available (or cancelled). |
| `expired` | No one claimed the bounty before its expiration date. |
| `overdue` | Contributor missed the work deadline. Grace period active. |
| `disputed` | Contributor or creator raised a dispute about the review outcome. |
| `cancelled` | Bounty cancelled by creator or admin. Escrowed tokens returned. |

### 7.3 Transition Table

| # | From State | Event | To State | Guard Condition | Action |
|---|-----------|-------|----------|-----------------|--------|
| B1 | `(none)` | `CREATE` | `created` | `caller.is_dao_member AND bounty.reward > 0 AND treasury_or_caller_has_funds` | Create bounty record; escrow reward tokens; emit `bounty:created` |
| B2 | `created` | `APPROVE` | `available` | `caller.is_bounty_moderator OR (caller.is_dao_admin)` | List bounty publicly; start expiration timer; emit `bounty:available`; notify matching skill profiles |
| B3 | `created` | `AUTO_APPROVE` | `available` | `bounty.reward <= auto_approve_threshold AND caller.reputation >= auto_approve_reputation` | Same as B2 but automatic |
| B4 | `created` | `REJECT_LISTING` | `cancelled` | `caller.is_bounty_moderator` | Return escrowed tokens; notify creator with reason; emit `bounty:listing_rejected` |
| B5 | `available` | `CLAIM` | `in_progress` | `caller.is_dao_member AND caller NOT bounty.creator AND caller.skills_match(bounty.required_skills) AND active_bounty_count(caller) < max_concurrent_bounties` | Assign contributor; start work_deadline timer; emit `bounty:claimed`; notify creator |
| B6 | `available` | `EXPIRE` | `expired` | `now > bounty.expiration_date` | Return escrowed tokens to creator; emit `bounty:expired` |
| B7 | `in_progress` | `SUBMIT` | `submitted` | `caller == bounty.contributor AND submission.has_deliverables` | Record submission; stop work_deadline timer; start review_deadline timer; emit `bounty:submitted`; notify reviewer |
| B8 | `in_progress` | `ABANDON` | `available` | `caller == bounty.contributor` | Remove contributor assignment; reputation penalty (-5); reset work_deadline; emit `bounty:abandoned`; re-list bounty |
| B9 | `in_progress` | `WORK_DEADLINE` | `overdue` | `now > bounty.work_deadline` | Start grace_period timer (48h default); notify contributor and creator; emit `bounty:overdue` |
| B10 | `overdue` | `SUBMIT` | `submitted` | `caller == bounty.contributor AND now <= grace_period_end` | Same as B7 but with late flag; late submissions may receive reduced reward |
| B11 | `overdue` | `EXTEND` | `in_progress` | `caller == bounty.creator AND extension_count < max_extensions` | Extend work_deadline; increment extension_count; emit `bounty:extended` |
| B12 | `overdue` | `FORFEIT` | `available` | `now > grace_period_end OR caller == bounty.creator` | Remove contributor; heavy reputation penalty (-15); re-list bounty; emit `bounty:forfeited` |
| B13 | `submitted` | `ACCEPT` | `completed` | `caller == bounty.reviewer AND submission_meets_criteria` | Release escrowed tokens to contributor; reputation bonus (+10); trigger vesting if applicable; emit `bounty:completed` |
| B14 | `submitted` | `REQUEST_REVISION` | `in_progress` | `caller == bounty.reviewer AND revision_count < max_revisions` | Provide revision feedback; restart work_deadline; increment revision_count; emit `bounty:revision_requested` |
| B15 | `submitted` | `REJECT` | `rejected` | `caller == bounty.reviewer AND revision_count >= max_revisions` | Return escrowed tokens to creator; reputation penalty for contributor (-5); emit `bounty:rejected` |
| B16 | `submitted` | `DISPUTE` | `disputed` | `(caller == bounty.contributor OR caller == bounty.creator) AND dispute_reason.length > 0` | Freeze escrowed tokens; assign arbitrator; emit `bounty:disputed` |
| B17 | `disputed` | `RESOLVE_ACCEPT` | `completed` | `caller.is_arbitrator` | Release tokens to contributor; emit `bounty:dispute_resolved` |
| B18 | `disputed` | `RESOLVE_REJECT` | `rejected` | `caller.is_arbitrator` | Return tokens to creator; emit `bounty:dispute_resolved` |
| B19 | `disputed` | `RESOLVE_SPLIT` | `completed` | `caller.is_arbitrator` | Split tokens per arbitrator ruling; emit `bounty:dispute_resolved` |
| B20 | `(any active)` | `CANCEL` | `cancelled` | `(caller == bounty.creator AND state IN [created, available]) OR caller.is_dao_admin` | Return escrowed tokens; compensate contributor if in_progress (configurable); emit `bounty:cancelled` |

### 7.4 Bounty Types

| Type | Description | Review Method | Typical Reward |
|------|-------------|---------------|----------------|
| `code` | Write code, fix bugs, implement features | PR review + CI pass | 100-5000 SODA |
| `design` | UI/UX design, graphics, branding | Visual review by creator | 50-2000 SODA |
| `content` | Write documentation, tutorials, blog posts | Content review | 25-500 SODA |
| `research` | Investigation, analysis, competitive research | Report quality review | 50-1000 SODA |
| `audit` | Security audit, code review, compliance check | Findings review | 500-10000 SODA |
| `community` | Event organization, moderation, outreach | Activity metrics review | 25-500 SODA |
| `translation` | Translate documents to other languages | Native speaker review | 25-200 SODA |

### 7.5 Edge Cases

- **Contributor claims bounty but creator updates requirements**: Requirements are frozen at claim time. Changes require creating a new bounty.
- **Multiple contributors want same bounty**: First valid claim wins. Others are notified. Creator can set `max_contributors > 1` for collaborative bounties.
- **Reviewer is biased**: Any party can escalate to arbitration via DISPUTE. Arbitrators are randomly selected from a pool of qualified members.
- **Bounty reward token price changes significantly**: Rewards are denominated in SODA tokens (not USD). Price volatility is accepted risk. Creator can set up USD-pegged bounties using stablecoin escrow.
- **Contributor submits plagiarized work**: Detected via AI similarity check (part of submission pipeline). Flagged submissions go to review with plagiarism warning. Confirmed plagiarism results in ban + reputation wipe.
- **Bounty creator abandons the DAO**: Reviewer role falls back to DAO admin. If no review within 30 days of submission, auto-accept triggers.

---

## 8. AI Module Learning

AI modules in SodaWorld learn from interactions and progressively gain autonomy. This state machine governs the lifecycle of each AI module from initial deployment to fully autonomous operation.

### 8.1 State Diagram

```
    DEPLOY_MODULE
         |
         v
    +---------+
    |         |
    | initial |
    |         |
    +----+----+
         |
    RECEIVE_FIRST_FEEDBACK
         |
         v
    +----------+
    |          |
    | learning |<----------+
    |          |           |
    +----+-----+      ACCURACY_DROP
         |                 |
    CALIBRATION_THRESHOLD  |
         |                 |
         v                 |
    +------------+         |
    |            |---------+
    | calibrated |
    |            |
    +-----+------+
          |
     AUTONOMY_CRITERIA_MET
     + DAO_APPROVAL
          |
          v
    +------------+
    |            |
    | autonomous |
    |            |
    +-----+------+
          |
    ACCURACY_DROP (severe)
          |
          v
    +------------+
    |            |
    | calibrated | (demoted, re-learning required)
    |            |
    +------------+

    Error paths:

    (any) ---CRITICAL_FAILURE---> disabled
    disabled ---REDEPLOY--------> initial
    (any) ---MANUAL_OVERRIDE----> (any, admin controlled)
```

### 8.2 State Descriptions

| State | Description | Decision Authority | Human Oversight |
|-------|-------------|-------------------|-----------------|
| `initial` | Module deployed with base configuration. No learned preferences. Uses default rules. | None (module makes no decisions) | 100% human decisions |
| `learning` | Module is observing human decisions and building a decision model. Suggests but does not act. | Suggestion only (human decides) | Human reviews all suggestions |
| `calibrated` | Module has been validated against historical decisions. Accuracy meets threshold. Can act with human approval. | Acts with human confirmation | Human approves/rejects each action |
| `autonomous` | Module operates independently for routine decisions. Only escalates edge cases and high-value decisions to humans. | Independent for routine tasks | Spot-check audits (10% sampling) |
| `disabled` | Module has been disabled due to critical failure, security concern, or manual intervention. | None | N/A |

### 8.3 Transition Table

| # | From State | Event | To State | Guard Condition | Action |
|---|-----------|-------|----------|-----------------|--------|
| M1 | `(none)` | `DEPLOY` | `initial` | `caller.is_dao_admin AND module.config_valid AND module.safety_checks_pass` | Initialize module; load base model; set learning_rate; emit `ai_module:deployed` |
| M2 | `initial` | `RECEIVE_FIRST_FEEDBACK` | `learning` | `feedback.count >= 1` | Begin collecting training data; initialize decision log; emit `ai_module:learning_started` |
| M3 | `learning` | `CALIBRATION_THRESHOLD` | `calibrated` | `module.accuracy >= 0.85 AND module.sample_size >= 100 AND module.false_positive_rate < 0.05` | Run calibration validation suite; freeze model version; generate accuracy report; emit `ai_module:calibrated` |
| M4 | `calibrated` | `AUTONOMY_CRITERIA_MET` | `autonomous` | `module.accuracy >= 0.95 AND module.sample_size >= 500 AND module.consecutive_correct >= 50 AND dao_approval_for_autonomy` | Enable autonomous execution; set escalation rules; configure audit sampling rate; emit `ai_module:autonomous` |
| M5 | `autonomous` | `ACCURACY_DROP` | `calibrated` | `module.rolling_accuracy < 0.90 OR module.false_positive_rate > 0.03` | Disable autonomous execution; require human confirmation again; trigger re-learning; emit `ai_module:demoted`; alert DAO admins |
| M6 | `calibrated` | `ACCURACY_DROP` | `learning` | `module.rolling_accuracy < 0.80 OR module.false_positive_rate > 0.10` | Reset model to last known good version; re-enter learning mode; emit `ai_module:accuracy_drop`; alert DAO admins |
| M7 | `(any)` | `CRITICAL_FAILURE` | `disabled` | `module.error_rate > 0.25 OR security_violation_detected OR manual_disable` | Immediately halt all operations; quarantine module; alert all admins; emit `ai_module:disabled`; generate incident report |
| M8 | `disabled` | `REDEPLOY` | `initial` | `caller.is_dao_admin AND root_cause_identified AND fix_deployed` | Reset module state; reload configuration; emit `ai_module:redeployed` |
| M9 | `(any)` | `MANUAL_OVERRIDE` | `(target)` | `caller.is_dao_admin AND override_reason.length > 0` | Force transition; log override reason; emit `ai_module:manual_override` |

### 8.4 AI Module Types

The DAO runs multiple AI modules, each governing a different domain:

| Module | Domain | Learns From | Autonomous Actions |
|--------|--------|-------------|-------------------|
| `proposal_classifier` | Categorize and prioritize proposals | Human proposal categorization decisions | Auto-tag, auto-assign reviewer, spam detection |
| `bounty_matcher` | Match contributors to bounties | Successful bounty completions | Auto-suggest bounties to users, skill gap analysis |
| `treasury_allocator` | Recommend treasury spending | Historical proposal outcomes + market data | Auto-approve micro-grants (<$100), budget forecasting |
| `dispute_resolver` | Suggest dispute resolutions | Arbitrator decisions | Auto-resolve low-value disputes (<$50), evidence summary |
| `risk_assessor` | Evaluate agreement and proposal risk | Historical outcomes, market conditions | Flag high-risk proposals, suggest risk mitigation |
| `onboarding_personalizer` | Customize user onboarding | User engagement metrics post-onboarding | Full onboarding flow, role recommendations |

### 8.5 Learning Process

```
Phase 1: INITIAL (Deployment)
  - Module loaded with pre-trained base model
  - Default rules configured (conservative thresholds)
  - No decision-making authority
  - Passively observes all relevant events

Phase 2: LEARNING (Observation)
  - For each human decision:
      1. Module generates its prediction BEFORE seeing human choice
      2. Human makes actual decision
      3. Module compares prediction to actual
      4. Model weights updated via gradient (learning_rate = 0.01)
  - Accuracy tracked as rolling window (last 100 decisions)
  - False positive rate tracked separately
  - Module suggestions shown to humans with confidence score

Phase 3: CALIBRATED (Validated)
  - Module has proven >= 85% accuracy over 100+ decisions
  - Enters "suggest + confirm" mode:
      1. Module generates decision with confidence score
      2. If confidence >= 0.90: presented as recommendation
      3. If confidence < 0.90: presented as suggestion with alternatives
      4. Human confirms, modifies, or rejects
      5. Feedback loop continues to refine model
  - Monthly accuracy report generated
  - Any accuracy drop triggers re-evaluation

Phase 4: AUTONOMOUS (Independent)
  - Module has proven >= 95% accuracy over 500+ decisions
  - Decision matrix:
      - Routine + high confidence (>= 0.95): autonomous execution
      - Routine + medium confidence (0.80-0.95): execute + flag for review
      - Non-routine OR low confidence (<0.80): escalate to human
      - High-value (> threshold): always escalate to human
  - Audit sampling: 10% of autonomous decisions randomly selected for human review
  - Real-time accuracy monitoring with automatic demotion on degradation
```

### 8.6 Graduation Criteria Detail

```
                    initial -> learning -> calibrated -> autonomous

Accuracy:              N/A      tracking     >= 85%      >= 95%
Sample size:           N/A        N/A        >= 100      >= 500
False positive rate:   N/A      tracking     < 5%        < 3%
Consecutive correct:   N/A        N/A         N/A        >= 50
Time in phase:         N/A      >= 14 days  >= 30 days  (permanent until drop)
DAO approval:          No         No          No          Yes (proposal)
Human oversight:      100%       100%        100%         10% (audit)
```

### 8.7 Edge Cases

- **Module trained on biased data**: Quarterly bias audit is mandatory. If bias detected (disparate impact on protected groups), module demoted to `learning` and retrained on balanced dataset.
- **Two modules produce conflicting recommendations**: Conflict resolution hierarchy defined per module pair. If no hierarchy, both recommendations presented to human with explanations.
- **Module achieves autonomous status but DAO reverts phase**: If DAO reverts from `mature` to `scale`, autonomous modules are demoted to `calibrated` (since autonomous execution requires mature phase).
- **Adversarial inputs designed to poison learning**: Input validation layer checks for statistical anomalies. Outlier decisions are quarantined and not included in training data without human approval.
- **Model drift over time**: Rolling accuracy window (last 100 decisions) provides early warning. Concept drift detection algorithm runs weekly. If distribution shift detected, module flags for human review.
- **Module needs to learn from cross-DAO data**: Only with explicit data-sharing agreement between DAOs. Cross-DAO learning uses federated learning protocol (model updates shared, not raw data).

---

## 9. Cross-Machine State Synchronization

Since the PIA system operates across multiple machines (Main PC, Laptop, VR Station), state machine transitions must be synchronized.

### 9.1 Sync Protocol

```
Machine A (state change) ---> PIA Hub (central) ---> Machine B (replicate)
                                  |
                                  +---> Machine C (replicate)

Event format:
{
  "type": "state_transition",
  "machine": "<machine_name>",
  "state_machine": "agreement | proposal | vesting | ...",
  "entity_id": "<uuid>",
  "from_state": "<state>",
  "to_state": "<state>",
  "event": "<EVENT_NAME>",
  "actor": "<user_id>",
  "timestamp": <unix_ms>,
  "data": { ... transition-specific payload ... },
  "vector_clock": { "machine_a": 42, "machine_b": 38, "machine_c": 41 }
}
```

### 9.2 Conflict Resolution

When two machines process conflicting transitions for the same entity:

1. **Last-Write-Wins** (default): Higher vector clock value wins.
2. **State Priority**: Terminal states (completed, terminated) always win over non-terminal states.
3. **Actor Priority**: Admin/arbitrator transitions win over regular member transitions.
4. **Manual Resolution**: If none of the above resolves, conflict flagged for human review.

### 9.3 Consistency Guarantees

- **Within single machine**: Strong consistency (SQLite transactions).
- **Across machines**: Eventual consistency with causal ordering (vector clocks).
- **Critical transitions** (token transfers, vote casting): Require hub acknowledgment before local commit (strong consistency at cost of latency).

---

## 10. Global Error States

Every state machine can encounter error conditions. These are handled consistently across all machines.

### 10.1 Common Error States

| Error State | Trigger | Recovery |
|-------------|---------|----------|
| `state_error` | Invalid transition attempted | Log error; return entity to previous valid state; alert admin |
| `timeout_error` | Guard condition check took > 30 seconds | Cancel transition; retry with exponential backoff (max 3 retries) |
| `database_error` | SQLite write failed | Transaction rollback; retry once; if persistent, enter maintenance mode |
| `sync_error` | Cross-machine sync failed | Queue transition for retry; continue local operations; alert hub |
| `permission_error` | Caller lacks required role/permission | Reject transition; log attempt; emit security alert if repeated |
| `resource_error` | Insufficient tokens/funds for transition | Reject transition; notify caller with required amounts |

### 10.2 Global Error Handler Pattern

```typescript
interface TransitionResult<T> {
  success: boolean;
  entity: T | null;
  error: TransitionError | null;
  warnings: string[];
}

interface TransitionError {
  code: string;              // e.g., "GUARD_FAILED", "ACTION_FAILED"
  message: string;
  state_machine: string;
  entity_id: string;
  from_state: string;
  attempted_event: string;
  timestamp: number;
  recoverable: boolean;
  recovery_action?: string;  // e.g., "RETRY", "ROLLBACK", "ESCALATE"
}
```

### 10.3 Circuit Breaker

If a state machine experiences > 5 errors in 60 seconds:

1. Circuit breaker OPENS -- all transitions for that entity type are rejected
2. Alert sent to all admins
3. Doctor module performs health check
4. After 5 minutes, circuit breaker enters HALF-OPEN -- allows 1 transition as test
5. If test succeeds: circuit breaker CLOSES (normal operation)
6. If test fails: circuit breaker re-OPENS for another 5 minutes

---

## 11. Implementation Notes

### 11.1 Database Schema Additions (SQLite)

```sql
-- State machine events log (append-only)
CREATE TABLE state_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state_machine TEXT NOT NULL,    -- 'agreement', 'proposal', 'vesting', etc.
  entity_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  event TEXT NOT NULL,            -- 'CREATE', 'SIGN', 'VOTE', etc.
  actor_id TEXT NOT NULL,
  data TEXT,                      -- JSON payload
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  machine_id TEXT,                -- source machine
  vector_clock TEXT               -- JSON vector clock
);

CREATE INDEX idx_state_events_entity ON state_events(entity_id);
CREATE INDEX idx_state_events_machine ON state_events(state_machine, entity_id);
CREATE INDEX idx_state_events_timestamp ON state_events(timestamp);

-- Agreements
CREATE TABLE agreements (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  terms_hash TEXT,
  state TEXT NOT NULL DEFAULT 'draft',
  parties TEXT NOT NULL,          -- JSON array of party objects
  signatures TEXT,                -- JSON array of signature objects
  terms TEXT,                     -- JSON agreement terms
  signature_deadline INTEGER,
  start_date INTEGER,
  end_date INTEGER,
  renewable BOOLEAN DEFAULT 0,
  sequential_signing BOOLEAN DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Proposals
CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  proposer_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  voting_type TEXT NOT NULL,       -- 'token_weighted', 'one_person', 'quadratic', 'conviction'
  voting_start INTEGER,
  voting_end INTEGER,
  snapshot_block INTEGER,
  quorum_threshold REAL,
  approval_threshold REAL,
  execution_payload TEXT,          -- JSON
  execution_delay INTEGER,         -- seconds
  votes_for REAL DEFAULT 0,
  votes_against REAL DEFAULT 0,
  votes_abstain REAL DEFAULT 0,
  voter_count INTEGER DEFAULT 0,
  deposit_amount REAL DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  resubmit_count INTEGER DEFAULT 0,
  extension_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Votes
CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id TEXT NOT NULL REFERENCES proposals(id),
  voter_id TEXT NOT NULL,
  vote TEXT NOT NULL,              -- 'for', 'against', 'abstain'
  weight REAL NOT NULL,
  delegated_from TEXT,             -- JSON array of delegator IDs
  timestamp INTEGER DEFAULT (unixepoch()),
  UNIQUE(proposal_id, voter_id)
);

-- Vesting schedules
CREATE TABLE vesting_schedules (
  id TEXT PRIMARY KEY,
  beneficiary_id TEXT NOT NULL,
  source_type TEXT NOT NULL,       -- 'agreement', 'bounty', 'grant', 'founding'
  source_id TEXT,                  -- reference to agreement/bounty/etc.
  state TEXT NOT NULL DEFAULT 'locked',
  total_amount REAL NOT NULL,
  unlocked_amount REAL DEFAULT 0,
  claimed_amount REAL DEFAULT 0,
  cliff_date INTEGER NOT NULL,
  start_date INTEGER NOT NULL,
  end_date INTEGER NOT NULL,
  vesting_type TEXT NOT NULL,      -- 'linear', 'stepped'
  step_interval INTEGER,           -- seconds between steps (for stepped)
  termination_type TEXT,           -- 'for_cause', 'without_cause', 'mutual'
  clawback_percentage REAL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- User onboarding
CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  wallet_address TEXT UNIQUE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  onboarding_state TEXT NOT NULL DEFAULT 'new',
  previous_state TEXT,             -- for suspend/resume
  kyc_level INTEGER DEFAULT 0,
  knowledge_graph TEXT,            -- JSON
  extraction_methods TEXT,         -- JSON array
  ai_personalization TEXT,         -- JSON
  reputation INTEGER DEFAULT 0,
  dao_constitution_accepted BOOLEAN DEFAULT 0,
  last_activity INTEGER DEFAULT (unixepoch()),
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- DAO configuration (phase tracking)
CREATE TABLE dao_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Bounties
CREATE TABLE bounties (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'created',
  bounty_type TEXT NOT NULL,       -- 'code', 'design', 'content', etc.
  reward_amount REAL NOT NULL,
  reward_token TEXT DEFAULT 'SODA',
  required_skills TEXT,            -- JSON array
  contributor_id TEXT,
  reviewer_id TEXT,
  submission TEXT,                 -- JSON submission data
  review_feedback TEXT,
  revision_count INTEGER DEFAULT 0,
  max_revisions INTEGER DEFAULT 3,
  max_contributors INTEGER DEFAULT 1,
  work_deadline INTEGER,
  expiration_date INTEGER,
  extension_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- AI modules
CREATE TABLE ai_modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module_type TEXT NOT NULL,       -- 'proposal_classifier', 'bounty_matcher', etc.
  state TEXT NOT NULL DEFAULT 'initial',
  accuracy REAL DEFAULT 0,
  sample_size INTEGER DEFAULT 0,
  false_positive_rate REAL DEFAULT 0,
  consecutive_correct INTEGER DEFAULT 0,
  learning_rate REAL DEFAULT 0.01,
  model_version TEXT,
  config TEXT,                     -- JSON
  last_decision_at INTEGER,
  deployed_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- AI module decision log
CREATE TABLE ai_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT NOT NULL REFERENCES ai_modules(id),
  decision_type TEXT NOT NULL,
  input_data TEXT,                 -- JSON
  prediction TEXT,                 -- JSON (module's prediction)
  actual_outcome TEXT,             -- JSON (human decision or verified outcome)
  correct BOOLEAN,
  confidence REAL,
  timestamp INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_ai_decisions_module ON ai_decisions(module_id, timestamp);
CREATE INDEX idx_bounties_state ON bounties(state);
CREATE INDEX idx_proposals_state ON proposals(state);
CREATE INDEX idx_agreements_state ON agreements(state);
CREATE INDEX idx_vesting_state ON vesting_schedules(state);
```

### 11.2 TypeScript State Machine Interface

```typescript
/**
 * Generic state machine interface used by all DAOV1 state machines.
 * Integrates with PIA's TaskQueue and ExecutionEngine for action dispatch.
 */
interface StateMachine<TState extends string, TEvent extends string, TEntity> {
  /** Current valid states */
  states: readonly TState[];

  /** Defined transitions */
  transitions: Transition<TState, TEvent, TEntity>[];

  /** Attempt a state transition */
  transition(entity: TEntity, event: TEvent, actor: Actor, data?: unknown): TransitionResult<TEntity>;

  /** Get valid events for current state */
  getValidEvents(entity: TEntity): TEvent[];

  /** Get transition history for an entity */
  getHistory(entityId: string): StateEvent[];
}

interface Transition<TState, TEvent, TEntity> {
  from: TState | TState[];
  event: TEvent;
  to: TState;
  guard: (entity: TEntity, actor: Actor, data?: unknown) => GuardResult;
  action: (entity: TEntity, actor: Actor, data?: unknown) => Promise<void>;
}

interface GuardResult {
  allowed: boolean;
  reason?: string;
}

interface Actor {
  id: string;
  roles: string[];
  reputation: number;
  token_balance: number;
}
```

### 11.3 Integration with PIA Infrastructure

The state machines integrate with existing PIA components:

- **TaskQueue** (`src/orchestrator/task-queue.ts`): State transition actions that require AI processing (e.g., AI classification of proposals, skill matching for bounties) are enqueued as tasks.
- **ExecutionEngine** (`src/orchestrator/execution-engine.ts`): Handles execution of proposal payloads and AI module decisions.
- **AgentFactory** (`src/agents/agent-factory.ts`): AI modules can spawn specialized agents (e.g., `@security` for risk assessment, `@reviewer` for bounty review).
- **Doctor** (`src/agents/doctor.ts`): Monitors state machine health. Detects stuck transitions, stale entities, and circuit breaker trips.
- **AIRouter** (`src/ai/ai-router.ts`): Routes AI module inference to appropriate provider (Ollama for routine, Claude for complex).
- **AgentBus** (`src/comms/agent-bus.ts`): Broadcasts state transition events to all connected clients and machines.
- **Delegation** (`src/hooks/delegation.ts`): Enforces role boundaries when agents trigger state transitions.

### 11.4 Testing Strategy

Each state machine requires:

1. **Unit tests**: Every transition tested in isolation (guard pass, guard fail, action success, action failure).
2. **Property-based tests**: Randomly generated event sequences to verify no invalid state is reachable.
3. **Integration tests**: Cross-machine sync tested with simulated network partitions.
4. **Chaos tests**: Random failures injected during transitions to verify rollback correctness.
5. **Performance tests**: 1000 concurrent transitions per state machine without deadlock.

### 11.5 Monitoring & Observability

```
Dashboard metrics (via PIA Fleet Dashboard):
  - State distribution per machine (pie chart)
  - Transition rate (transitions/minute)
  - Average transition latency
  - Error rate per state machine
  - Circuit breaker status
  - AI module accuracy (real-time)

Alerts (via PIA Alert System):
  - Transition failure rate > 5%
  - Entity stuck in non-terminal state > threshold
  - Circuit breaker opened
  - AI module accuracy drop
  - Cross-machine sync lag > 30 seconds
```

---

## Appendix A: State Machine Interaction Map

```
+-------------------+       creates        +-------------------+
|                   |--------------------->|                   |
|   Proposal Flow   |                     | Agreement         |
|                   |<----- amends -------|  Lifecycle        |
+--------+----------+                     +--------+----------+
         |                                         |
         | funds                            activates vesting
         v                                         |
+-------------------+                     +--------v----------+
|                   |<--- bounty payout --|                   |
|  Token Vesting    |                     |  Bounty           |
|                   |                     |  Lifecycle        |
+-------------------+                     +-------------------+
         ^                                         ^
         |                                         |
    phase unlocks                          skill matching
    features                                       |
         |                                         |
+--------+----------+                     +--------+----------+
|                   |                     |                   |
|   DAO Phase       |                     |  User Onboarding  |
|                   |                     |                   |
+-------------------+                     +--------+----------+
                                                   |
                                            feeds training data
                                                   |
                                          +--------v----------+
                                          |                   |
                                          | AI Module         |
                                          |  Learning         |
                                          +-------------------+
```

---

## Appendix B: Quick Reference -- All States

| State Machine | States |
|---------------|--------|
| Agreement | `draft`, `pending_signatures`, `active`, `completed`, `terminated`, `disputed`, `rejected`, `cancelled` |
| Proposal | `draft`, `active`, `passed`, `rejected`, `no_quorum`, `executed`, `failed`, `cancelled` |
| Token Vesting | `locked`, `vesting`, `unlocked`, `claimed`, `terminated` |
| User Onboarding | `new`, `profile_created`, `knowledge_extracted`, `ai_personalized`, `complete`, `suspended`, `abandoned` |
| DAO Phase | `foundation`, `growth`, `scale`, `mature` |
| Bounty | `created`, `available`, `in_progress`, `submitted`, `reviewed`, `completed`, `rejected`, `expired`, `overdue`, `disputed`, `cancelled` |
| AI Module | `initial`, `learning`, `calibrated`, `autonomous`, `disabled` |

**Total states**: 8 + 8 + 5 + 7 + 4 + 11 + 5 = **48 states**
**Total transitions**: 15 + 15 + 10 + 9 + 5 + 20 + 9 = **83 transitions**

---

*Specification authored by Machine #1 Hub -- PIA Orchestration System*
*For implementation in the DAOV1 repository of the SodaWorld DAO platform*
*All state machines designed for SQLite persistence, WebSocket real-time sync, and multi-machine operation*
