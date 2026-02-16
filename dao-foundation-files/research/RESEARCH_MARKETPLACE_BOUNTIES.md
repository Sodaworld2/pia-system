# SodaWorld DAO — Marketplace & Bounties Research

**Date:** February 15, 2026 | **Sources:** 25+ references

---

## Executive Summary

Research across Dework, Gitcoin, Layer3, Colony, Coordinape, Zora, OpenSea, Braintrust, Kleros, and CharmVerse reveals SodaWorld has a solid marketplace and bounty foundation but needs: multi-applicant bounty flow, submission/review workflow, escrow for services, gamification (XP/levels), and reputation-based gating.

---

## Current State Gaps

**Marketplace:** No escrow, no ratings endpoints, no dispute resolution, no royalties, type mismatch between foundation types and backend types.

**Bounties:** No application system, no submission/review workflow, no milestone payouts, no reputation tracking, no gamification, no recurring bounties.

---

## Key Findings by Section

### 1. DAO Internal Marketplaces
- Unify type system: `NFT | Template | Module | Service | Legal | Ticket | Merch`
- Add 2.5% DAO treasury fee on sales (sustainable revenue)
- Add category taxonomy and role-gated listings

### 2. NFT Architecture (Zora, OpenSea, Rarible)
- Implement royalty tracking (`royalty_pct`, `original_creator_id`)
- Standardize metadata JSON schema (preview_url, attributes, license)
- Support editions via `marketplace_editions` table
- Add secondary market (resale with auto-royalty)

### 3. Service Marketplaces (Braintrust, Layer3, Gitcoin)
- Expand service listings with delivery_time, revisions, requirements
- Adopt Braintrust fee model: charge buyer (5-10%), not provider
- Add `marketplace_orders` table with full delivery status flow

### 4. Template Marketplaces
- Add versioning + changelog for templates
- Preview content (truncated markdown) before purchase
- Legal doc categories: Operating Agreements, NDAs, IP Assignments, etc.
- Licensing tiers: personal | dao | unlimited
- AI-assisted template customization via Legal module

### 5. Escrow Patterns (Kleros, SmarTrust)

**New tables needed:**
```sql
escrow_transactions (id, order_id, buyer_id, seller_id, total, released, status)
escrow_milestones (id, escrow_id, title, amount, status, deliverable_url)
```

- Milestone-based releases
- Dispute resolution via existing council voting
- 7-day auto-release timer if buyer doesn't review

### 6. Bounty Platform Deep-Dive

**Dework model (proven at 500+ DAOs):**
- Kanban-style: Suggested → To Do → In Progress → In Review → Done
- Wallet = identity, tasks = resume
- Cross-DAO portable reputation

**Layer3 model (1M+ users):**
- Quest-based gamified bounties
- XP, levels, CUBE NFTs, achievements
- 40M+ rewards distributed

**New table:**
```sql
bounty_applications (id, bounty_id, applicant_id, pitch, estimated_days, status)
```

### 7. Bounty Lifecycle (8-stage)
```
draft → open → assigned → in_progress → submitted → revision → completed | cancelled
```

**New table:**
```sql
bounty_submissions (id, bounty_id, submitter_id, submission_url, revision_number, status, review_notes)
```

### 8. Quality Assurance
- Multi-reviewer assignment (1-3 reviewers per bounty)
- Review scoring (1-5 scale + recommendation)
- Auto-approval when all reviewers score >= 4
- Reputation gating by bounty value

**New table:**
```sql
bounty_reviews (id, submission_id, reviewer_id, score, feedback, recommendation)
```

### 9. Pricing Models
1. **Fixed price** (already supported, keep as default)
2. **Milestone-based** — `bounty_milestones` table with partial payouts
3. **Bidding** — applications include `proposed_amount`
4. **Peer allocation** (Coordinape GIVE model) — future enhancement

### 10. Reputation System

**Formula:**
```
reputation_delta = base_points * difficulty_multiplier * quality_score
  base_points = bounty_reward / 1000
  difficulty_multiplier = 1.0 (easy) | 1.5 (medium) | 2.0 (hard) | 3.0 (expert)
  quality_score = avg_reviewer_score / 5.0
```

**Decay:** 5% per month for inactive contributors (Colony model)

**Gating by reputation:**
- 0-25: Easy bounties only
- 25-50: Medium bounties + can vote
- 50-80: Hard bounties + can create proposals
- 80+: Expert bounties + can review + can create bounties

### 11. Gamification (Layer3/Zealy-inspired)

**XP rewards:**
- Complete bounty: 50-500 XP (by difficulty)
- Submit proposal: 25 XP
- Vote: 10 XP
- Review submission: 30 XP
- List marketplace item: 15 XP

**Level formula:** `Level = floor(sqrt(xp_total / 100)) + 1`
- Level 2: 100 XP, Level 5: 1600 XP, Level 10: 8100 XP

**Achievements:** "First Blood", "Hat Trick", "Centurion", "Voter", "Reviewer", "Merchant", "Streak Master", "Domain Expert"

**Quests/Campaigns:** Time-limited bundles of bounties with bonus XP + special badges

### 12. Recurring Bounties

Add fields to bounties:
- `is_recurring`, `recurrence_interval`, `max_completions_per_period`, `parent_bounty_id`
- Auto-generation job creates new instances when period expires
- Budget linked to treasury proposals (monthly bounty = quarterly budget vote)

---

## Implementation Priority

### Phase 1 — Must-Have (Next Sprint)
| Feature | Effort | Impact |
|---------|--------|--------|
| Unify marketplace types | Low | Fixes type mismatch |
| Bounty applications table | Medium | Multi-applicant flow |
| Bounty submissions table | Medium | Review workflow |
| Expanded 8-status lifecycle | Low | Full lifecycle |
| Difficulty levels | Low | Better pricing/reputation |
| Review scoring | Medium | Quality assurance |
| Reputation formula | Medium | Contributor tracking |

### Phase 2 — Should-Have (Next Month)
| Feature | Effort | Impact |
|---------|--------|--------|
| XP + Levels | Medium | Engagement |
| Leaderboard API | Low | Competition |
| Milestone-based pricing | Medium | Large projects |
| Escrow for services | High | Service trust |
| Royalty tracking | Medium | Creator incentives |
| Template versioning | Medium | Template quality |
| Reputation gating | Low | Quality control |

### Phase 3 — Nice-to-Have (Next Quarter)
| Feature | Effort | Impact |
|---------|--------|--------|
| Achievements/Badges | Medium | Long-term engagement |
| Recurring bounties | Medium | Operational efficiency |
| Secondary marketplace | High | NFT ecosystem |
| Dispute resolution | Medium | Trust framework |
| Quest chains | High | Guided onboarding |
| AI template customization | Medium | Legal module integration |

---

*25+ sources: Dework, Gitcoin, Layer3, Colony, Coordinape, Zora, OpenSea, Rarible, Braintrust, Kleros, CharmVerse, Superteam DAO, and more*
