# SodaWorld DAO — Token Distribution & Vesting Research

**Date:** February 15, 2026 | **Sources:** 30+ references
**Target:** SODA token, 100M total supply

---

## Executive Summary

Research across Sablier, Hedgey, Superfluid, LlamaPay, TokenOps, and real-world tokenomics (MakerDAO, Curve, Aave, Uniswap) reveals that SodaWorld's cliff+linear vesting is well-aligned with 2025 norms. Key enhancements: fix the allocation inconsistency, implement veSODA governance staking, add milestone-based community unlocks, and build a revenue-driven buyback engine.

---

## 1. Vesting Protocol Implementations

### Sablier (Leading on-chain vesting)
- Singleton contract architecture on 28 EVM chains + Solana
- Linear (with/without cliff), tranches (periodic), custom curves
- NFT representation (ERC-721) of each stream — enables secondary market transfers
- Gas-efficient, 5+ years zero security incidents
- **Best fit** for SodaWorld's on-chain phase

### Hedgey Finance
- ERC-721 plan tokens representing vesting rights
- Post-vesting lockup periods (vested but still locked until separate date)
- Governance-integrated: voting power before full unlock
- **Key feature:** Post-vesting lockup for investor agreements

### Superfluid (Real-time streaming)
- Per-second continuous token flow via Super Tokens
- Distribution Pools for millions of recipients
- Tokens stay in sender's wallet until vested (DeFi yield opportunity)
- **Best for:** Scaling to large contributor payrolls

### LlamaPay
- 3.2-3.7x more gas-efficient than competitors
- Used by Curve, DefiLlama, Arbitrum, Gitcoin
- Compatible with Gnosis Safe
- **Most practical** streaming option for SodaWorld

### TokenOps (Orchestration layer)
- Integrates with Sablier, Hedgey, LlamaPay, Superfluid
- Cap table management + compliance tracking + tax withholding
- Managed $8.5B of token value in 2024
- **Could replace** custom vesting tables with audited solution

---

## 2. Vesting Patterns

### Standard: Cliff + Linear
Industry benchmarks (LiquiFi 2025):
- Founders: 4-year vest, 1-year cliff, monthly unlocks
- Investors: 2-3 year lockup, 6-month cliff
- Advisors: 1-2 year vest, 3-6 month cliff
- Community: Linear or milestone-based

**SodaWorld's current schedules match best practices.**

### Milestone-Based Vesting
- Tokens unlock when achievements reached (TVL, user count, revenue)
- Requires oracle for off-chain milestones
- **Recommendation:** Hybrid — time-based for core team, milestone for community:
  - 10M SODA when active members reach 100
  - 5M SODA when marketplace reaches 50 items
  - Bounty pool tied to completion rates

### Performance-Based
- KPI-linked acceleration/deceleration
- **Recommendation:** Use existing `reputation_score` as multiplier (1.5x above score 80)

### Acceleration Clauses
- **Single-trigger:** One event (acquisition, termination without cause)
- **Double-trigger:** Two conditions (acquisition AND termination)
- **Custom curves:** S-curve, exponential, logarithmic, TANH
- **Recommendation:** Double-trigger for founders, single-trigger for contributors

### Retroactive Distribution (Optimism/Arbitrum model)
- 88% of single-dump airdrops lose value in 3 months
- Multi-phase with ongoing engagement requirements works better
- **Recommendation:** Use existing tables (`bubble_score`, `votes`, `bounties`, `knowledge_items`) for eligibility scoring

---

## 3. Streaming vs Discrete Unlocks

| Factor | Streaming | Discrete |
|--------|-----------|----------|
| Granularity | Per-second | Monthly/quarterly |
| Sell pressure | Smooth, continuous | Spike on unlock dates |
| Complexity | High (smart contracts) | Low (database) |
| Tax treatment | Complex (continuous) | Clear (discrete events) |
| DeFi composability | High | Low |

**Recommendation:**
- Short-term: Continue discrete unlocks (appropriate for 9 members)
- Medium-term: Hybrid — discrete for core team, streaming for contributors
- Long-term: Full streaming for new grants

---

## 4. Recommended Token Allocation

Current allocation has inconsistency (seed data: 25/25/25/25 vs knowledge base: 20/15/40/25).

**Recommended (2025 best practices):**

```
Total Supply: 100,000,000 SODA

Core Team:        20% = 20,000,000  [12mo cliff, 48mo linear]
Advisors:          5% =  5,000,000  [6mo cliff, 24mo linear]
Community:        35% = 35,000,000  [milestone-based + retroactive]
Treasury Reserve: 20% = 20,000,000  [operational + strategic]
Investors:        10% = 10,000,000  [6mo cliff, 24mo linear]
Public Sale:      10% = 10,000,000  [LBP fair launch]
```

---

## 5. Distribution Mechanisms

### Liquidity Bootstrapping Pool (Balancer LBP)
- Dynamic AMM with shifting weights (99/1 → 1/99)
- Natural price discovery, disincentivizes whale front-running
- Minimal seed liquidity required
- **Recommended** for SODA public sale

### Multi-Phase Airdrops
1. Genesis Drop — retroactive rewards for early users
2. Governance Drop — rewards for voting participation
3. Builder Drop — bounty completions + marketplace contributions
4. Staking Drop — lock rewards
- Anti-dump: Each phase requires continued eligibility

---

## 6. Anti-Gaming Mechanisms

### Sybil Resistance
- Firebase UID verification (already in schema)
- `bubble_score` threshold (already tracked)
- `reputation_score` minimum (already tracked)
- Wallet address uniqueness
- 30+ days platform activity requirement

### Lockup Extensions
- Extend investor lockup from 12 → 24 months
- Proposal submission deposit (spam prevention)
- Bounty posting deposit (refundable on completion)

---

## 7. Buyback & Burn Mechanisms

### Real-World Models
- **MakerDAO:** 75M USDS on buybacks by Aug 2025. Smart Burn Engine uses surplus DAI
- **BNB:** Quarterly burns targeting 50% total supply reduction
- **Aave:** Protocol revenue buys AAVE, distributes to Safety Module stakers

### SodaWorld Revenue-to-Buyback Pipeline
1. Revenue: marketplace fees, AI subscriptions, legal template sales
2. Threshold: Activate when treasury exceeds 6 months runway
3. Allocation: 50% buys SODA, 25% burned, 25% to stakers
4. Cadence: Quarterly, aligned with financial reporting

---

## 8. Staking Mechanisms

### veSODA Model (Curve-inspired)
- Lock SODA 3-48 months → receive veSODA
- veSODA = governance voting weight (replaces static `voting_power`)
- veSODA holders receive share of marketplace/subscription fees
- veSODA boosts bounty rewards
- Decay mechanism incentivizes re-locking

### Single-Sided Staking (Aave Safety Module)
- Stake SODA → earn platform revenue share
- Staked SODA serves as insurance backstop
- Stakers receive veSODA proportional to duration

---

## 9. Token Utility Design

### Five-Dimensional Utility
| Utility | Mechanism | Implementation |
|---------|-----------|---------------|
| Governance | veSODA voting | Existing proposals + votes tables |
| Access | Token-gated AI tiers | Settings-based tier access |
| Payments | Marketplace + bounties | Existing tables |
| Staking | Lock for yield + governance boost | New staking_positions table |
| Fee Sharing | Revenue to stakers | New fee_distributions table |

### Token Sinks (remove from circulation)
1. veSODA governance lock
2. Marketplace fees (2-5%, partially burned)
3. AI premium access requires staking
4. Bounty posting deposit
5. Dispute resolution bonds
6. Proposal submission deposit

---

## 10. Case Studies

### Successful
- **ETH:** Real utility + EIP-1559 burn = sustainable value
- **MKR:** Revenue-to-burn self-reinforcing loop
- **UNI:** Governance over revenue-generating protocol
- **AAVE:** Staking as insurance + real yield
- **CRV:** veTokenomics creates deep long-term alignment

### Failed
- **Terra/LUNA ($40B collapse):** Self-referential backing, no real collateral
- **Iron Finance:** Unsustainable yield from emissions
- **Ghost tokens:** 50% of all tokens since 2021 have failed — no utility, no community

### Key Takeaways
1. Product first, token second
2. Real yield over inflationary emissions
3. Progressive decentralization (council → veSODA → full token governance)
4. Multiple utility dimensions
5. Buyback signals real value creation

---

## Implementation Priority

### Phase 1 — Immediate
- Fix allocation inconsistency (Low effort, High impact)
- Add acceleration clauses to VestingSchedule type (Low)
- Extend investor lockup to 24 months (Low)
- Add 20% treasury reserve allocation (Low)
- Proposal submission deposits (Medium)

### Phase 2 — Operating Stage
- veSODA governance staking (High effort, High impact)
- Milestone-based community unlocks (Medium)
- Marketplace fee collection (Medium)
- Multi-phase retroactive airdrop (Medium)
- TokenOps integration for cap table (Medium)

### Phase 3 — Growth
- On-chain vesting via Sablier (High)
- Buyback-and-burn engine (High)
- Token streaming for contributors (Medium)
- LBP fair launch for public sale (High)
- Sybil resistance for airdrops (Medium)

---

*30+ sources referenced — Sablier, Hedgey, Superfluid, LlamaPay, TokenOps, LiquiFi, DWF Labs, CoinGecko, CFA Institute, and protocol documentation*
