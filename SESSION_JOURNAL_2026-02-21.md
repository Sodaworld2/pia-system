# Session Journal — 2026-02-21 (Repair Day)

## Context
After all the Feb 20 builds (Tim Buc, email, CalendarSpawn, DB migrations 044-047, fleet auto-detection, soul system, PM2, etc.) the dashboard had UX breakage — agents couldn't be killed or removed from the list.

---

## Session 1: Agent Kill Fix + Per-Agent Kill Button

### Problem
- **Kill All / Kill Done / Kill Errors** buttons did nothing visible — agents stayed in the list even after "kill"
- **Root cause**: `kill()` in `src/mission-control/agent-session.ts` set status to `'done'` but never called `this.sessions.delete(sessionId)`. So the session remained in memory and the GET `/api/mc/agents` endpoint kept returning it.
- The DELETE endpoint returned 200 (success) but the agent was still in the in-memory map.

### Fix
1. **`src/mission-control/agent-session.ts` line ~1108**: Added `this.sessions.delete(sessionId)` immediately after `this.emit('complete', ...)` in the `kill()` method. Now killing an agent removes it from memory — Kill All/Done/Errors work correctly.

2. **`public/mission-control.html` — agent chips**: Each agent chip in the machine tile now has a `✕` button that calls `killAgentById(id)` directly without needing to navigate into the agent detail view.

3. **`public/mission-control.html` — `killAgentById()` function added**: Standalone function that calls `DELETE /api/mc/agents/:id`, shows toast, clears selectedAgent if it was the killed one, refreshes list.

### Files Changed
| File | Change |
|---|---|
| `src/mission-control/agent-session.ts` | Added `this.sessions.delete(sessionId)` in `kill()` — agents now disappear from list after kill |
| `public/mission-control.html` | Agent chips now clickable + have `✕` kill button; added `killAgentById()` function |

### Desktop App Impact
No new deps. Pure logic fix. React UI will need same pattern — agent list items should have individual kill buttons.

---

## What Was Broken Coming Into Today

Based on yesterday's journal (Feb 20 Session 32 — final state):
- ANTHROPIC_API_KEY now in .env ✅
- Tim Buc service built ✅
- Email service (SendGrid) built ✅
- Eliyahu 6am email built ✅
- agent_messages TTL cleanup ✅
- Fleet auto-detection fixed ✅
- 17 DB migrations applied ✅
- CalendarSpawnService running ✅
- Soul system (12 souls) seeded ✅

### Still Not Working / Needs Attention
| Item | Status |
|---|---|
| SENDGRID_API_KEY in .env | ⚠️ needs Mic to add |
| M2 git pull (fleet fix) | ⚠️ needs M2 machine action |
| Spawn Agent UI | 🔴 user reports not working — investigate next |
| Agent kill/remove | ✅ FIXED this session |
| 5-day soak test | 🔴 not started |

---

---

## Session 2: Spawn Agent Fix (FULLY RESOLVED)

### Problems Found (Three Root Causes)

**Bug A — Stale DB agents couldn't be killed**
- DELETE endpoint returned 404 for agents that were in the DB but not in memory (remote/stale agents from M2 or previous server runs)
- Fix: DELETE endpoint now falls back to `db.prepare('DELETE FROM agents WHERE id = ?').run(agentId)` when session not in memory

**Bug B — Kill buttons worked but agents stayed in list**
- Root already fixed in Session 1: `kill()` didn't call `this.sessions.delete()`, so GET /api/mc/agents kept returning killed agents

**Bug C — Spawn failed with "Machine X is not connected" (THE MAIN SPAWN BUG)**
- The dashboard's `spawnMachine` dropdown sends the DB machine ID (e.g. `adFxRSyo1ZCh9MFqbgWiW`) for LOCAL (IZZIT7)
- The spawn route checked `if machineId !== 'local'` → routed to WebSocket → failed because hub has no WS connection to itself
- First fix attempt: added `localMachineId()` check — but `localMachineId()` used `require()` which silently fails in ESM projects (`"type":"module"` in package.json) → returned empty string → fix didn't work
- **Final fix**: Added `import os from 'os'` + `getMachineByHostname` to proper ESM imports at top of file. Fixed `localMachineId()` to use real import instead of `require()`. Now correctly identifies when machineId is the local machine's DB ID and routes to local spawn.

### Files Changed
| File | Change |
|---|---|
| `src/api/routes/mission-control.ts` | Added `import os from 'os'`; added `getMachineByHostname` to machines import; fixed `localMachineId()` to use ESM imports; `isLocal` check in spawn route now works |
| `src/api/routes/mission-control.ts` | DELETE endpoint now purges from DB when agent not in memory (stale/remote agents) |
| `public/mission-control.html` | Added `✕` kill button to grid view tile header (per-agent kill in grid mode) |
| `public/mission-control.html` | Added `killAgentById()` function |

### Verified Working
- Kill Errors: 4 error agents → removed → 0 errors ✅
- Kill Done: 2 completed agents → removed → 0 agents ✅
- Spawn: POST /api/mc/agents with local machine DB ID → spawns successfully ✅
- Default model in spawn modal: `claude-opus-4-6` (Opus 4.6 most capable) ✅

### Key Lesson (Mic's Note)
"I always jump the gun — build ahead before we got the basics to work."
→ Going forward: verify core spawn/kill loop works before building new features on top.

### Desktop App Impact
No new deps. Spawn fix is pure routing logic. React UI must send `'local'` (not DB ID) for local machine spawns, or the backend fix handles it via `localMachineId()` comparison.

---

---

## Session 3: M2 Architecture Research + Activation Plan

### What We Investigated
Deep audit of M2 (soda-monster-hunter) role, detection logic, what it runs vs doesn't, and what it needs to activate.

### Key Findings

**How M2 knows it's M2:**
- `src/config.ts` has a `FLEET` table keyed by hostname
- `SODA-MONSTER-HUNTER` → `mode: 'local'`, `hubUrl: 'http://100.73.133.3:3000'`
- Hostname is read at boot — no manual config needed
- This was fixed in commits `dd07ba9` + `4aada49` (Feb 20) — hostname table is now the ONLY source of truth

**What M2 runs (startLocal):**
- Express API (port 3000), WebSocket (port 3001), SQLite DB, HubClient → connects to M1 every 30s heartbeat

**What M2 does NOT run:**
- Fisher2050, Tim Buc, Eliyahu, Ziggi, Cortex, CalendarSpawnService, Hub Aggregator — ALL M1 only

**M2's repo location:** `C:\Users\User\Documents\GitHub\pia-system`

**M2's current git state:** UNKNOWN — needs `git pull` to get at minimum `dd07ba9` + `4aada49`

**All Feb 21 fixes M2 gets automatically after git pull:**
- `kill()` deletes from sessions map (agents disappear after kill)
- DELETE falls back to DB purge (stale agents removable)
- Spawn with local machine DB ID works (ESM import fix)
- Per-agent `✕` kill buttons in sidebar + grid

### Files Created
| File | Purpose |
|---|---|
| `M2_ACTIVATION.md` | **NEW** — Complete M2 activation guide: who M2 is, what it runs, step-by-step activation, troubleshooting |

### M2 Activation Steps (Summary)
1. On M2: `git pull origin master && npm install`
2. Create/update `.env` — tokens MUST match M1 (PIA_SECRET_TOKEN, PIA_JWT_SECRET)
3. Create `MACHINE_IDENTITY.local.md` on M2 (gitignored — defines M2's role)
4. Start: `npm run dev` (test) or `npx pm2 start ecosystem.config.cjs` (production)
5. Verify: M1 dashboard shows M2 as Online (green dot)
6. Test spawn: M1 dashboard → select M2 → spawn agent → output streams back

### CLAUDE.md Identity Fix
Critical problem identified: CLAUDE.md is committed to git (same on every machine). If `MACHINE_IDENTITY.local.md` doesn't exist on M2, any agent reading the repo won't know it's M2.

**Fix applied to CLAUDE.md:**
- Added the full fleet table DIRECTLY into CLAUDE.md (hostname → role mapping)
- Added "Step 1: run hostname, match fleet table" instruction
- Explained why git pull never breaks identity (MACHINE_IDENTITY.local.md is gitignored, fleet table is in the committed file)
- Now any agent on any machine can self-identify even with zero local files

### Desktop App Impact
M2 architecture is backend-only. React UI needs to show machine mode (hub/local) per machine tile, and which services are running on each.

---

---

## Session 4: Fleet Identity Audit — M2 vs M3 vs Fresh Clone

### Three parallel agents investigated:

---

### Finding 1 — M3 (soda-yeti) is V2.0 DEFERRED

From `V1_DEFINITION.md` explicitly:
> "M2 and M3 agents — v1.0 runs entirely on M1. M2 and M3 stay offline for v1.0."

M3 is real hardware (Ryzen 7 7700X, 32GB, Tailscale 100.102.217.69) and has been cloned + booted once (Feb 12 journal). BUT it's not in scope for V1.

| | M2 (WORKER) | M3 (WORKER) |
|---|---|---|
| V1.0 scope | YES — activate now | NO — deferred to V2.0 |
| Agents | Bird Fountain + dynamic project boss | Farcake, Andy, Wingspan (ephemeral only) |
| Pattern | Resident on active project | Spawned by Fisher2050 calendar, terminates after task |
| Risk | Booted as `hub` once (Feb 12) — verify mode=local | Same risk |

M3 RISK: Feb 12 journal shows M3 booted in `hub` mode. When reactivated, must verify `[Main] Mode: LOCAL` in logs.

---

### Finding 2 — Fresh Clone Identity: System works, discoverability is the gap

**How identity works on fresh clone (step by step):**
1. `git clone` → all files identical across machines (CLAUDE.md, config.ts, etc.)
2. `npm run dev` → `src/index.ts` → `config.ts` reads `hostname()` → matches FLEET table
3. `SODA-MONSTER-HUNTER` → `mode='local'` → `startLocal()` runs (not `startHub()`)
4. HubClient connects to `ws://100.73.133.3:3001` → registered with M1

**Core system: works correctly** (commit `dd07ba9`). No manual config needed for runtime identity.

**The gap:** `MACHINE_IDENTITY.local.md` is never auto-created on fresh clone. Without it, a human or Claude agent reading the repo has no local context file. They must rely on CLAUDE.md fleet table (now embedded) — which works, but is less explicit.

**Three sync points that must stay identical:**
- `src/config.ts` FLEET table (runtime authority)
- `CLAUDE.md` Fleet Table (agent/human reading authority)
- `PIA_ARCHITECTURE.md` Current Fleet section

---

### Finding 3 — Solution: setup-machine.sh

Created `setup-machine.sh` — run once on any machine after clone:
- Auto-detects hostname, matches FLEET table
- Creates `MACHINE_IDENTITY.local.md` with role-specific content
- Validates `.env` for required tokens
- Warns on missing ANTHROPIC_API_KEY
- Provides role-specific next steps
- Safe to re-run (asks before overwriting)

**This script is the answer to "how does M2 know it's M2 every time."**

### Files Created/Changed
| File | Change |
|---|---|
| `setup-machine.sh` | **NEW** — one-time machine identity setup script |
| `SESSION_JOURNAL_2026-02-21.md` | This entry |

### What Still Needs to Happen
| Action | Who | Priority |
|---|---|---|
| Run `git pull` on M2 | M2 operator | HIGH — needs Feb 20+21 commits |
| Run `bash setup-machine.sh` on M2 | M2 operator | HIGH |
| Verify M2 shows `[Main] Mode: LOCAL` | M2 operator | HIGH |
| M2 ANTHROPIC_API_KEY in .env | Mic | HIGH — agents can't think without it |
| M3 stays offline | — | V2.0 |

### Desktop App Impact
`setup-machine.sh` is a one-time CLI script — no packaging impact. The MACHINE_IDENTITY.local.md file it creates must be gitignored in all builds.

---

## Remaining Repair Items (Priority Order)

| Item | Status | Notes |
|---|---|---|
| Spawn in browser UI (not just curl) | 🟡 test via dashboard now | Backend fixed, need browser verify |
| SENDGRID_API_KEY | ⚠️ Mic action | Add to .env for Eliyahu email |
| M2 git pull | ⚠️ M2 machine action | `git pull && npx pm2 restart pia-hub --update-env` |
| 5-day soak test | 🔴 not started | Final V1 gate |

---

## Session 5: Soul System Deep Audit + Agent Enrichment System Plan

### What We Investigated

Full deep-read of the entire soul system:
- `src/souls/soul-engine.ts` — SoulEngine class: CRUD, `generateSystemPrompt()`, `seedSoul()`
- `src/souls/memory-manager.ts` — MemoryManager: add/retrieve/search/summarize/prune memories
- `src/souls/seed-souls.ts` — startup seeder: reads 12 JSON files → upserts into SQLite `souls` table
- `src/souls/personalities/*.json` — all 12 soul definitions (Fisher2050, Eliyahu, Ziggi, Tim Buc, etc.)
- `src/api/routes/souls.ts` — full CRUD API at `/api/souls/*` — already exists and works
- `research/AGENT_PRODUCT_SHEETS.md` — per-agent product sheets

### Critical Gap Discovered

**Souls are seeded into SQLite at startup but NEVER injected at agent spawn time.**

- `src/mission-control/agent-session.ts` has ZERO soul references
- The SDK `query()` call gets a raw system prompt but never calls `getSoulEngine().generateSystemPrompt(soulId)`
- `src/api/routes/orchestrator.ts` accepts `soulId` but that's the old PTY route, not the SDK flow
- Fix: ~10 lines in `agent-session.ts` — accept optional `soulId` in spawn payload, call `generateSystemPrompt(soulId, taskContext)`, prepend to system prompt

### Soul Schema (Confirmed — 8 Fields + Memory Layer)

| Field | Type | Purpose |
|---|---|---|
| `id` | string | Unique key (e.g. `fisher2050`) |
| `name` | string | Display name |
| `role` | string | One-liner role description |
| `email` | string | Digital identity (fisher2050@sodalabs.ai) |
| `personality` | text | Prose: communication style, traits, quirks |
| `system_prompt` | text | Operational instructions — the "how to do the job" |
| `goals[]` | JSON array | Ordered list — drives prioritisation |
| `relationships{}` | JSON map | Agent-name → relationship description |
| `config{}` | JSON map | Machine, schedule times, flags (ephemeral, autoZiggiReview, etc.) |
| `status` | enum | active / inactive / archived |

Memory layer (`soul_memories` table): `category` (experience/decision/learning/interaction/observation/goal_progress/summary), `content`, `importance` (1–10), `context`, `is_summarized`.

### How `generateSystemPrompt()` Assembles at Spawn

Order of assembly (confirmed from source):
1. Identity block (name, role, email)
2. Personality prose
3. `system_prompt` (operational instructions)
4. Goals (numbered list)
5. Relationships (bulleted)
6. Recent memories (last 20; importance ≥7 float to top)
7. Extra context (task/project info passed at spawn time)

### The Agent Enrichment System — Full Plan (Not Built — Planning Only)

A **Souls** tab in `mission-control.html` + spawn wiring. Four components:

**Component 1 — Soul Roster Grid**
- 12 agent cards in fleet order (M1 → M2 → M3)
- Each card: avatar initial, name, role, machine badge, status dot, memory count, last-enriched date, soul health score %
- Drag to reorder fleet priority within tier
- Click to open Soul Editor

**Component 2 — Soul Editor (6-Section Form)**
1. Identity: name, role, email
2. Character (`personality`): full-height textarea — voice, traits, quirks
3. Mission (`system_prompt`): full-height textarea — step-by-step operational instructions
4. Goals: drag-to-reorder ordered list, add/remove
5. Relationships: key-value editor (agent name → description), autocomplete from 12 known agents
6. Config: machine selector, schedule time pickers, toggle flags

**Component 3 — Memory Panel**
- Add Memory: category dropdown, content textarea, importance slider (1–10)
- Recent Memories: last 20, sortable by importance or date
- Search: keyword across this soul's memory bank
- Stats: total count, avg importance, by-category breakdown

**Component 4 — System Prompt Preview**
- Live render of `generateSystemPrompt()` — updates as you edit
- Shows exactly what the agent receives when spawned
- "Test before save"

### Soul Fix (The Missing Spawn Wire)

```
agent-session.ts → accept optional soulId in spawn payload
  → getSoulEngine().generateSystemPrompt(soulId, taskContext)
  → prepend assembled soul to systemPrompt before query()
```
~10 lines. Makes every spawned agent actually use their soul for the first time.

### Soul Repair Concepts

Types of broken souls:
- **Thin soul**: personality written but no `system_prompt`. Agent has character but no job instructions. Fix: write the operational step-by-step.
- **Conflicting soul**: personality says "minimal comms" but system_prompt says "send daily updates". Fix: align both sections.
- **Stale soul**: goals set months ago, no longer reflect current job. Fix: update goals + add recent context as memories.
- **Orphan soul**: no relationship map — agent doesn't know who to report to. Fix: add at minimum `Mic` + `Tim Buc` to every relationships map.

### Soul Health Score (0–100%)

| Criterion | Points |
|---|---|
| `personality` present (200+ chars) | +20 |
| `system_prompt` present (300+ chars) | +20 |
| `goals` array (3+ items) | +20 |
| `relationships` map (3+ entries) | +20 |
| `config` with machine assignment | +10 |
| `soul_memories` count (5+ memories) | +10 |

### Soul Analysis (Eliyahu's Role)

Eliyahu periodic soul audit:
- Report health scores across all 12 agents
- Flag thin souls to Fisher2050 for enrichment scheduling
- Detect conflicting instructions (personality vs system_prompt)
- Identify stale souls (no new memories in 14+ days)
- Surface imbalances: "Fisher2050's goals unchanged 4 weeks; Ziggi has 47 new memories"

### Soul Independence / Separation Concepts

- Each soul independently editable without touching other souls or JSON files
- **Export**: download any soul as standalone JSON (same schema as personality files)
- **Import**: paste/upload JSON to create or overwrite a soul — enables soul sharing between machines
- **Version snapshot**: auto-save before every edit — roll back if enrichment degrades quality
- **Cross-machine sync**: soul lives in M1 SQLite, broadcast `soul:updated` WebSocket event to M2/M3 on save

### Build Order (when ready)

1. Wire `soulId` → `generateSystemPrompt()` into `agent-session.ts` spawn flow (~10 lines) — highest value, everything else depends on this
2. Souls tab + roster grid in dashboard
3. Soul editor form (Identity + Character + Mission)
4. Goals drag-to-reorder
5. Relationships editor
6. System prompt preview panel
7. Memory panel
8. Config section
9. Soul health score calculation
10. Export/import/version snapshot
11. Cross-machine soul sync via WebSocket

### Desktop App Impact
React UI needs a full Souls screen: roster grid + soul editor + memory panel + preview. All backed by existing `/api/souls/*` REST API. No new backend beyond spawn-wiring fix.
