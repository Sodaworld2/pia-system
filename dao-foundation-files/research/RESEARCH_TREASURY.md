# SodaWorld DAO — Treasury Component Research

**Date:** February 15, 2026 | **Sources:** 40+ references

---

## Executive Summary

Treasury is the financial backbone of any DAO. Research across Safe ($22B secured), Superfluid, Sablier, MakerDAO ($2.18B in T-bills), and others reveals a mature ecosystem of patterns SodaWorld can adopt. The current 2-of-3 / 3-of-3 multi-sig is a solid foundation — enhancements focus on tiered approvals, timelocks, streaming payments, diversification, and risk management.

---

## 1. Multi-Sig: Safe (Gnosis Safe) Architecture

**How it works:**
- Proxy contract delegates to singleton implementation
- Stores `owners` list + `threshold` (M-of-N)
- Transactions proposed off-chain, signatures collected, then `execTransaction()` on-chain
- Nonces prevent replay attacks

**Key patterns:**
- **Zodiac Roles Modifier**: Granular role-based permissions scoping target contracts, functions, and parameter values
- **Allowances**: Rate-limited spending quotas per role (refill amount, interval, max accrual)
- **SafeSnap**: Bridges Snapshot votes to on-chain execution via Reality.eth oracle
- **Guards**: Transaction guards reject policy-violating transactions

**SodaWorld recommendations:**
1. Configurable thresholds per transaction tier (2-of-3 under 10K, 3-of-3 above)
2. 24h timelock for transactions above 50K SODA
3. Roles/Allowances model for delegated spending without full multi-sig
4. Transaction guards: max amount, daily cap, blocked addresses

---

## 2. Treasury Management Best Practices

**Spending policies:**
- Formal governance proposals for expenditures above threshold
- Pipeline: proposal → discussion → vote → timelock → execution
- Ethereum Foundation benchmark: 2.5-year operational expense buffer

**Budget cycles:**
- Quarterly is most common
- Categories: operations (40-50%), development (25-30%), marketing (10-15%), reserves (15-20%)
- Each cycle requires governance vote

**Reserve ratios:**
- 12-18 months operating expenses in stablecoins
- Separate strategic reserve (15-20%) never touched for operations
- Runway monitor alerts at 6-month and 3-month thresholds

**SodaWorld recommendations:**
1. `treasury_budgets` table: period, category, allocated, spent, status
2. Runway calculator: `runway_months = balance / avg_monthly_burn`
3. Budget gates: verify category has remaining allocation before execution
4. Reserve policy in `treasury_policies`: minimum stablecoin ratio + runway target

---

## 3. Automated Treasury Operations

**Superfluid (streaming):**
- Continuous per-second token flow (0.00116 SODA/sec instead of 3,000/month)
- No per-transaction gas after stream creation
- Uses "Super Tokens" (ERC-20 with streaming capability)

**Sablier (time-locked escrow):**
- Linear or custom-curve streams over fixed duration
- Full amount deposited upfront, recipient withdraws accrued tokens
- Supports cliffs, exponential curves, stepped unlocks

**LlamaPay:**
- Tracks debt with negative balance when funds exhausted
- Simpler implementation used by Aave, Uniswap treasury managers

**SodaWorld recommendations:**
1. `treasury_streams` table: recipient, rate_per_second, total, streamed, status
2. `treasury_recurring` table: frequency, next_execution, amount, recipient
3. Phase 1: Simulate streaming with cron job updating `streamed_amount`
4. Phase 2: Integrate with Superfluid/Sablier for real token streaming

---

## 4. Treasury Security Patterns

**Timelocks:**
- 24-72h delay between approval and execution
- Circuit breaker: community can cancel during delay
- OpenZeppelin `TimelockController`: proposer/executor/canceller roles

**Spending limits:**
- Daily, weekly, per-transaction caps at contract level
- Zodiac Roles "allowances": refillable quotas with configurable refill rate
- Exceeding limit requires escalation to higher tier

**Anomaly detection:**
- Monitor: unauthorized withdrawals, ownership changes, price discrepancies
- Alert on: transaction 10x above 30-day average, velocity spikes

**Hot/Warm/Cold wallet architecture:**
- Hot (5-10%): day-to-day operations, fast access
- Warm (10-20%): operational with role-based access, HSMs/MPC
- Cold (70-85%): hardware wallets, 4-of-7 multi-sig, physical access required

**SodaWorld recommendations:**
1. Intermediate "Approved" status with `execution_eligible_at` timestamp
2. Spending limits on `treasury_policies`: daily, weekly, per-transaction
3. Anomaly detection in TreasuryModule: compare against 30-day moving average
4. `treasury_wallets` table: type (hot/warm/cold), address, balance, max_holding
5. Cancellation window during timelock period

---

## 5. Treasury Diversification

**Real-world examples:**
- MakerDAO: $2.18B in US T-bills, $263M other RWAs, $1B "Spark Tokenization Grand Prix"
- Uniswap: $2.3B but 100% UNI token (cautionary — total price exposure)
- Aave: GHO stablecoin as diversification tool, yield from own lending protocol

**Framework:**
- 40-50% stablecoins (operational stability)
- 20-30% native governance token (alignment)
- 10-20% yield-generating positions (Aave, Compound, Yearn)
- 5-10% blue-chip crypto (ETH, BTC)
- ~60% of large DAOs now use diversification strategies

**SodaWorld recommendations:**
1. `treasury_holdings` table: token, amount, value_usd, category, percentage
2. Diversification policy with target allocations per category
3. Rebalancing alert when drift exceeds 5%
4. `treasury_yield_positions` table: protocol, APY, deployed capital, accrued yield

---

## 6. On-Chain Treasury Transparency

**Tools:**
- DeepDAO: $30B+ tracked, hourly refresh, institutional-grade dashboards
- DefiLlama: open-source DeFi analytics, treasury breakdowns
- Quarterly transparency reports (Treasure DAO, Yearn, Rocket Pool)

**SodaWorld recommendations:**
1. `/api/treasury/dashboard` endpoint: total balance, holdings, burn rate, runway, budget utilization
2. `/api/treasury/report/:period`: structured JSON + downloadable PDF/CSV
3. Public treasury page (no auth required) for transparency
4. `treasury_snapshots` table: daily balance, composition, metrics for trend charts

---

## 7. Multi-Treasury (Vault) Architecture

**Common structure:**
- **Operational** (3-6 months costs, 2-of-3, lower threshold)
- **Reserve** (long-term, 4-of-7, governance vote required)
- **Grants/Ecosystem** (milestone-based, grants committee)
- **Growth/Investment** (strategic, professional management)

**Examples:**
- Gitcoin: workstream-based budgets (PGF, FDD, MC, MMM, DAO Ops)
- MakerDAO: SubDAOs with independent treasuries (Spark manages $1B+)
- ENS: separate endowment from operational

**SodaWorld recommendations:**
1. `treasury_vaults` table: name, type, balance, approval_threshold, limits
2. Default vaults: Operations (40%), Reserves (35%), Grants (15%), Growth (10%)
3. `vault_id` FK on transactions
4. Vault-specific approval rules

---

## 8. Accounting Standards (FASB ASU 2023-08)

**Key requirements (effective Jan 1, 2025):**
- Fair value measurement each reporting period
- Gains/losses in net income (not just impairment)
- Enhanced disclosure: significant holdings, changes, valuation methods

**SodaWorld recommendations:**
1. `treasury_valuations` table: token, date, quantity, fair_value, method
2. `treasury_liabilities` table: grant commitments, streaming obligations, vesting
3. Quarterly report generation aligned with FASB
4. `treasury_reports` table for historical storage

---

## 9. Insurance & Risk Management

**Nexus Mutual:** $190M capital pool, $194M active coverage, 100+ cover products
- Smart contract cover, custodian cover, protocol cover, governance attack cover
- Costs: 2-5% annually based on protocol risk profile

**Risk framework:**
- No single protocol >20% of treasury (concentration)
- Only audited protocols with 12+ month track records (smart contract)
- 6 months liquid obligations always available (liquidity)
- Timelock + quorum + veto (governance)

**SodaWorld recommendations:**
1. `treasury_risk_registry` table: risk_type, severity, mitigation, status
2. Concentration checks on new positions
3. `treasury_insurance` table: coverage, premium, provider, expiry
4. `/api/treasury/risks` dashboard endpoint

---

## 10. Approval Tiers & Emergency Procedures

**Tiered framework:**

| Tier | Amount | Approval | Timelock | Example |
|------|--------|----------|----------|---------|
| Micro | <1K | 1 role holder | None | Office supplies |
| Standard | 1K-10K | 2-of-3 | None | Bounty payouts |
| Major | 10K-100K | 3-of-3 | 24h | Quarterly budget |
| Critical | >100K | Governance vote + 3-of-3 | 72h | Strategic investments |
| Emergency | Any | 4-of-5 emergency signers | None | Security response |

**Emergency mechanisms:**
- **Pause Guardian**: Freeze all operations (2-of-5, can only pause)
- **Emergency Multi-sig**: Protective actions without governance (4-of-5 security council)
- **Break-glass**: Bypass timelock with unanimous agreement + time-limited window
- **Post-incident Review**: All emergency actions ratified by governance within 7 days

**SodaWorld recommendations:**
1. `treasury_approval_tiers` table: tier, min/max amount, signatures, timelock, requires_vote
2. Auto-assign tier based on transaction amount
3. `emergency_actions` table: action_type, initiated_by, approved_by, ratified
4. Pause mechanism: `treasury_status` column (active/paused)
5. `treasury_guardians` table: addresses that can cancel queued transactions

---

## Implementation Priority

### Phase 1 — Immediate
- Spending limits on policies (Low effort)
- Timelocked execution for large transactions (Medium)
- Runway calculator (Low)
- Budget tracking table (Medium)
- Approval tiers (Medium)

### Phase 2 — Near-term
- Multi-vault architecture (Medium)
- Holdings/diversification tracking (Medium)
- Recurring payments (Medium)
- Transaction guards (Medium)
- Risk registry (Low)

### Phase 3 — Strategic
- Payment streaming (High)
- Dashboard with historical snapshots (High)
- Quarterly FASB-aligned reports (High)
- Emergency procedures (Medium)
- Insurance tracking (Low)
- AI-powered anomaly detection (Medium)

---

*40+ sources referenced — see full agent transcript for complete bibliography*
