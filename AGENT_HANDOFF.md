# PIA System + SodaWorld DAO — Agent Handoff Document
## Last Updated: 2026-02-13 | Written by Claude Opus 4.6

**READ THIS ENTIRE FILE BEFORE DOING ANYTHING.**

---

## 1. WHAT THIS PROJECT IS

PIA (Personal Intelligent Agent) is a **distributed AI orchestration system** that manages multiple Claude agents across multiple machines. On top of it sits a **DAO (Decentralized Autonomous Organisation) management platform** called SodaWorld.

**Two things are real and working:**
1. **PIA Hub** — multi-machine agent orchestration, 169 API endpoints, WebSocket relay, PTY sessions, soul personalities
2. **DAO Data Layer** — 20 API endpoints serving real DAO data (council, treasury, proposals, agreements, marketplace, etc.)

**Two things are sophisticated stubs:**
1. **9 AI Modules** — 6,000+ lines of typed business logic that aren't wired to a database
2. **Fisher2050** — project manager app skeleton

**Two things are paper only:**
1. **Solana smart contracts** — zero blockchain code exists
2. **Frontend integration** — DAOV1 frontend is a separate repo on a different machine

---

## 2. MACHINES & NETWORK

| Machine | Name | IP (Tailscale) | Role |
|---------|------|-----------------|------|
| #1 | izzit7 | localhost | Hub — runs PIA orchestrator |
| #3 | soda-yeti | 100.102.217.69 | DAO backend + DAOV1 frontend |

**Running Services on Machine #3:**
- DAO API: `http://100.102.217.69:5003` (Express, all 20 endpoints working)
- DAOV1 Frontend: `http://100.102.217.69:5174` (Vite React app)
- Videohoho (unrelated): port 5173 (crashes, ignore it)

**Running Services on Machine #1:**
- PIA Hub: `http://localhost:3000` (Express, 169 endpoints)
- PIA WebSocket: `ws://localhost:3001`

---

## 3. DIRECTORY STRUCTURE (what matters)

```
C:\Users\mic\Downloads\pia-system\
├── src/                          # PIA Hub (WORKING)
│   ├── index.ts                  # Startup: DB → Sentinel → API → WS → Services → Souls
│   ├── config.ts                 # All env vars (see Section 5)
│   ├── api/
│   │   ├── server.ts             # Express setup, 22 route groups, middleware
│   │   └── routes/               # 23 route files, 169 endpoints
│   │       ├── machines.ts       # Machine fleet management
│   │       ├── agents.ts         # Agent lifecycle
│   │       ├── sessions.ts       # PTY session management
│   │       ├── orchestrator.ts   # Claude instance spawning
│   │       ├── souls.ts          # Agent personality CRUD
│   │       ├── work-sessions.ts  # Work session tracking
│   │       ├── ai.ts             # AI provider routing
│   │       └── ...               # alerts, factory, tasks, relay, etc.
│   ├── db/
│   │   ├── database.ts           # SQLite init, 4 migrations (001-004)
│   │   └── queries/              # agents.ts, alerts.ts, machines.ts, sessions.ts
│   ├── orchestrator/             # Execution engine, autonomous worker
│   └── souls/                    # Soul engine, memory manager, personality JSONs
│
├── dao-foundation-files/         # DAO MODULE CODE (STUBS — not wired)
│   └── backend/src/
│       ├── modules/
│       │   ├── base-module.ts    # Abstract BaseModule class (212 lines)
│       │   ├── index.ts          # ModuleRegistry — lazy loads all 9
│       │   ├── coach.ts          # OKRs, milestones, SWOT (344 lines)
│       │   ├── legal.ts          # Agreements, compliance, clauses (483 lines)
│       │   ├── governance.ts     # Proposals, voting, constitution (1,107 lines)
│       │   ├── treasury.ts       # Budget, spending, reporting (407 lines)
│       │   ├── analytics.ts      # Metrics, KPIs (881 lines)
│       │   ├── community.ts      # Engagement, reputation (678 lines)
│       │   ├── product.ts        # Roadmap, features (598 lines)
│       │   ├── security.ts       # Risk, compliance (551 lines)
│       │   └── onboarding.ts     # User onboarding (678 lines)
│       └── database_migrations/
│           └── 015_foundation_tables.ts  # Knex migration: 12 DAO tables
│
├── fisher2050/                   # Project Manager (SCAFFOLDING)
│   ├── src/                      # Express app, 5 routes, SQLite
│   └── public/                   # Basic HTML dashboard
│
├── data/
│   └── pia.db                    # SQLite database (1.2 MB, WAL mode)
│
├── public/                       # Static HTML dashboards
│   ├── index.html                # PIA Visor main dashboard
│   ├── system-plan.html          # 10-section system wireframe
│   └── knowledge.html            # Knowledge viewer
│
├── JOURNAL_2026-02-12.md         # Day 1 journal (full system context)
├── JOURNAL_2026-02-13.md         # Day 2 journal (DAO testing, frontend discovery)
├── SESSION_JOURNAL_FETCHED.md    # Historical sessions 1-6 (planning, specs, decisions)
├── SESSION_JOURNAL_2026-02-13.md # Phase 1 build: Souls + Fisher2050
└── AGENT_HANDOFF.md              # THIS FILE
```

---

## 4. DATABASE SCHEMA

### SQLite (better-sqlite3) — `data/pia.db`

**Migration 001 — Core Infrastructure:**
- `machines` — id, name, hostname, ip_address, status, last_seen, capabilities
- `agents` — id, machine_id, name, type, status, current_task, progress, tokens_used
- `sessions` — id, agent_id, machine_id, pty_pid, command, cwd, status
- `session_output` — id, session_id, output, timestamp
- `tasks` — id, agent_id, title, description, status, blocked_by, blocks
- `watched_docs` — id, path, type, last_hash, auto_update
- `alerts` — id, machine_id, agent_id, type, message, acknowledged

**Migration 002 — AI Cost Tracking:**
- `ai_providers` — id, name, tier (0-3), base_url, is_local, is_configured
- `ai_usage` — provider, model, task_type, input/output tokens, cost_usd, duration_ms
- `ai_cost_daily` — date, provider, request_count, total_tokens, total_cost_usd
- `ai_budgets` — id, name, daily_limit_usd, monthly_limit_usd, alert_threshold

**Migration 003 — Agent Souls:**
- `souls` — id, name, role, personality, goals, relationships, system_prompt, email
- `soul_memories` — id, soul_id, category (experience|decision|learning|interaction|observation|goal_progress|summary), content, importance (1-10)
- `soul_interactions` — from_soul_id, to_soul_id, interaction_type, content

**Migration 004 — Work Sessions:**
- `work_sessions` — id, project_name, project_path, machine_name, status, git_branch, files_changed
- `known_projects` — id, name, path, machine_name, github_repo, session_count

### Knex Migration 015 — DAO Foundation (NOT yet running in main DB):
- `users` — id, firebase_uid, email, display_name, role, wallet_address
- `daos` — id, name, slug, description, phase, governance_model, treasury_address
- `dao_members` — id, dao_id, user_id, role, voting_power, reputation_score
- `agreements` — id, dao_id, title, type, status, version, content_markdown, terms
- `agreement_signatures` — id, agreement_id, user_id, signature_hash, ip_address
- `proposals` — id, dao_id, title, type, status, quorum_required, approval_threshold
- `votes` — id, proposal_id, user_id, choice, weight, reason
- `ai_conversations` — id, dao_id, module_id, user_id, role, content
- `knowledge_items` — id, dao_id, module_id, category, title, content, confidence, embedding_vector
- `bounties` — id, dao_id, title, reward_amount, reward_token, status
- `marketplace_items` — id, title, type, status, price, currency, author_id

---

## 5. CONFIGURATION

**Key Environment Variables:**

| Variable | Default | Notes |
|----------|---------|-------|
| `PIA_MODE` | `hub` | `hub` or `local` |
| `PIA_PORT` | `3000` | API server |
| `PIA_WS_PORT` | `3001` | WebSocket |
| `PIA_SECRET_TOKEN` | `dev-token-change-in-production` | API auth header |
| `PIA_DB_PATH` | `./data/pia.db` | SQLite file |
| `PIA_AI_PRIMARY` | `ollama` | `ollama` or `claude` |
| `PIA_OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `PIA_OLLAMA_MODEL` | `llama3:70b` | Model name |
| `PIA_CLAUDE_API_KEY` | `` | Anthropic key |
| `PIA_HEARTBEAT_INTERVAL` | `30000` | 30s |
| `PIA_STUCK_THRESHOLD` | `300000` | 5 min |

**Auth:** All `/api/*` routes require `x-api-token` header (except `/api/health`).

---

## 6. THE 9 AI MODULES — Current State

All modules live in `dao-foundation-files/backend/src/modules/`. They ALL have `// @ts-nocheck` at the top. They ALL extend `BaseModule` and take a `Knex` database instance. They are **not connected to any running database**.

| Module | Lines | Key Methods | DB Tables Used |
|--------|-------|-------------|----------------|
| **coach** | 344 | `generateOKRs()`, `planMilestones()`, `swotAnalysis()`, `saveCoachingPlan()` | knowledge_items |
| **legal** | 483 | `draftAgreement()`, `reviewAgreement()`, `transitionAgreementStatus()`, `getClausesForType()`, `addClause()` | agreements, knowledge_items |
| **governance** | 1,107 | `analyzeProposal()`, `recommendVotingParameters()`, `generateGovernanceReport()`, `draftConstitution()` | proposals, votes, dao_members, delegations, daos, knowledge_items |
| **treasury** | 407 | `analyzeBudget()`, `evaluateSpendingProposal()`, `generateFinancialReport()`, `trackExpense()` | knowledge_items |
| **analytics** | 881 | Metrics, data processing, KPI tracking | knowledge_items |
| **community** | 678 | Engagement, member management, reputation | knowledge_items, dao_members |
| **product** | 598 | Roadmap, feature tracking, user feedback | knowledge_items |
| **security** | 551 | Risk assessment, compliance, audit logs | knowledge_items |
| **onboarding** | 678 | User onboarding workflows | knowledge_items, dao_members |

**What they need to work:**
1. The Knex migration 015 needs to run (creates the DAO tables)
2. `// @ts-nocheck` needs to be removed and types fixed
3. The `ModuleRegistry` needs to be instantiated with a real Knex connection
4. The API routes need to call the registry instead of serving static data

---

## 7. DAO DATA — What's in the Database on Machine #3

The DAO backend on Machine #3 (port 5003) serves real data. Here's what exists:

**DAO:** "dcfwsedf" (placeholder name) | 25/25/25/25 tokenomics | US legal framework

**9 Council Members:**
- 3 Founders: Marcus Chen (CTO, 4M tokens), Sarah Williams (CEO, 4M), James Wright (Creative, 3M)
- 2 Advisors: Lisa Park (Legal, 2M), David Kumar (Blockchain, 1.5M)
- 2 Contributors: Emma Rodriguez (Dev, 1M), Alex Thompson (Community, 500K)
- 2 First Born Investors: Mia Foster (500K), Noah Baker (250K, non-voting)

**100M Token Supply:** Founders 20% | Advisors 15% | Community 40% | Public 25% | 35M circulating

**Treasury:** 1,025,000 tokens | 2-of-3 multi-sig | 5 transactions (2 pending)

**7 Agreements:** All active, terms 12-48 months, with milestones

**10 Milestones:** 5 completed, 3 in progress, 2 pending | 5M tokens total

**2 Governance Proposals:** Marketing budget (active), Oracle integration (passed)

**6 Idea Bubbles:** 102,500 SODA raised, 275 backers

**5 Marketplace Items:** NFTs, tickets, merch

**2 AI-Generated Legal Contracts:** Marcus and Sarah only (5 members still need contracts)

---

## 8. KNOWN DATA GAPS

| # | Gap | Priority | Fix |
|---|-----|----------|-----|
| 1 | DAO name is `dcfwsedf` | HIGH | UPDATE daos SET name = 'SodaWorld DAO' |
| 2 | Signatures table empty | HIGH | Build signature collection flow |
| 3 | Wallet addresses are test | HIGH | Replace `NxKXtg...` with real Solana addresses (before on-chain only) |
| 4 | Only 2/7 legal contracts | MEDIUM | Generate for James, Lisa, David, Emma, Alex |
| 5 | First Born have no agreements | MEDIUM | Create agreements for Mia and Noah |
| 6 | Vesting shows 0 on frontend | MEDIUM | Wire `firestarter_period_months` to display |
| 7 | Transaction addresses are fake | MEDIUM | Replace `0xAlice...` placeholders |
| 8 | Completed milestones have no date | LOW | Set `completed_date` on 5 milestones |

---

## 9. THE REVISED BUILD PLAN

The original 7-phase/24-week plan is obsolete. Here's what actually needs to happen:

### Phase 1: Wire the Modules (3-5 sessions) — HIGHEST PRIORITY
The 9 AI modules have real logic but aren't connected to anything.
- Run Knex migration 015 to create DAO tables in the database
- Remove `// @ts-nocheck` from all 9 modules, fix TypeScript errors
- Instantiate `ModuleRegistry` with a real Knex connection in the API server
- Create `/api/modules/:moduleId/chat` endpoint that routes to real module logic
- Test: send a message to coach module, get response that uses real DAO data
- **Success criteria:** `POST /api/modules/coach/chat` returns intelligent response using DB data

### Phase 2: Fix Data Gaps (1-2 sessions)
- Fix the 8 gaps listed in Section 8
- Quick database updates + contract generation
- **Success criteria:** All 8 gaps resolved, data is production-quality

### Phase 3: Frontend Integration (3-5 sessions)
- DAOV1 frontend exists on Machine #3 (`C:\Users\User\Documents\GitHub\DAOV1`)
- 13 routes, 16 pages, 20 template components (not yet wired)
- Firebase Auth with mock fallback (working)
- Point API calls at the real backend (port 5003)
- Wire template components into main app routes
- Add module chat UI (talk to coach/legal/treasury from the frontend)
- **Success criteria:** User can log in, see council, browse treasury, chat with AI modules

### Phase 4: Signatures & Agreements (2-3 sessions)
- Build digital signature collection flow
- Agreement PDF generation
- Signature verification and storage
- **Success criteria:** All 7 agreements have signatures, stored with hashes

### Phase 5: Tests (2 sessions)
- Zero tests exist. Vitest is configured but no test files.
- Write API endpoint tests for the 20 DAO routes
- Write module integration tests
- **Success criteria:** `npm test` passes with >80% coverage on DAO routes

### Phase 6: Solana On-Chain (10+ sessions, OPTIONAL)
- No blockchain code exists today — this is a full build from scratch
- Anchor/Rust smart contracts for: SPL Token, Governance, Treasury
- Only do this when off-chain system is solid and real tokens are needed
- **Success criteria:** Tokens deployed on devnet, governance working on-chain

---

## 10. WHAT NOT TO DO

1. **Don't write more planning docs.** There are 66 already. Build code.
2. **Don't rebuild PIA Hub.** It works. 169 endpoints, WebSocket relay, soul system — all functional.
3. **Don't touch the Videohoho app** (port 5173). It's unrelated and crashes.
4. **Don't start on Solana** before Phases 1-5 are done.
5. **Don't create new module files.** The 9 modules exist with real logic — wire them, don't rewrite them.
6. **Don't add dependencies** unless absolutely necessary. The stack is Express + SQLite + TypeScript.
7. **Don't change the API auth pattern.** It uses `x-api-token` header, that's fine.

---

## 11. HOW TO VERIFY THE SYSTEM IS RUNNING

```bash
# Machine #1 — PIA Hub
curl http://localhost:3000/api/health
# Expect: {"status":"healthy","mode":"hub",...}

# Machine #3 — DAO Backend
curl http://100.102.217.69:5003/api/health
# Expect: {"status":"healthy","database":{"status":"connected"},...}

# Machine #3 — DAO API (all should return 200)
curl http://100.102.217.69:5003/api/dao
curl http://100.102.217.69:5003/api/council
curl http://100.102.217.69:5003/api/treasury
curl http://100.102.217.69:5003/api/proposals
curl http://100.102.217.69:5003/api/modules
curl http://100.102.217.69:5003/api/modules/status

# Machine #3 — DAOV1 Frontend
# Open: http://100.102.217.69:5174/
# Login with any email → redirects to /council
```

---

## 12. KEY FILES TO READ FIRST

If you're a new agent picking this up, read in this order:
1. **This file** (`AGENT_HANDOFF.md`) — you're here
2. `src/config.ts` — all environment variables
3. `src/api/server.ts` — how the API is structured
4. `dao-foundation-files/backend/src/modules/base-module.ts` — module interface
5. `dao-foundation-files/backend/src/modules/index.ts` — module registry
6. `src/db/database.ts` — database migrations and setup

**Don't read the journals unless you need historical context.** They're 66 files of session logs. This handoff doc has everything you need.

---

## 13. TECH STACK SUMMARY

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | ≥ 22.17.0 |
| Language | TypeScript | 5.7.3 |
| API Framework | Express | 4.21.2 |
| Database | SQLite (better-sqlite3) | 11.7.0 |
| DAO DB Migration | Knex.js | (in dao-foundation-files) |
| WebSocket | socket.io + ws | 4.8.1 / 8.18.0 |
| Terminal | node-pty + xterm | 1.0.0 / 5.3.0 |
| Browser Automation | Playwright | 1.58.2 |
| Security | Helmet + rate-limit | 8.1.0 / 8.2.1 |
| Package Type | ES Modules | `"type": "module"` |
| Blockchain | None (planned: Solana/Anchor) | — |

---

*This handoff doc was generated from a complete audit of the codebase, live API testing, database schema extraction, and module interface analysis. It represents the ground truth of what exists as of 2026-02-13.*
