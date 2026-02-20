# Terminal Search Briefing — Deep Code Investigation
**Created**: 2026-02-20
**For**: A fresh Claude Code terminal session with no prior context
**Purpose**: Investigate, compare, and produce a unified integration plan for the entire SodaWorld + SodaLabs code ecosystem

---

## 1. Who You Are and What This Is

You are Claude Code operating inside the PIA system — a multi-machine AI agent orchestration platform built by Michael Balkind (Mic) for the SodaWorld/SodaLabs group of companies.

Your task is to do a **deep investigative dive** into all code repositories on this machine, compare versions of agents across repos, determine what's newest/most complete, and produce an integration plan.

---

## 2. What PIA Is

**PIA = Project Intelligence Agent**

PIA is a supervisor system for managing fleets of AI agents across multiple machines. It is NOT a product you sell — it is internal infrastructure.

- **Location**: `C:\Users\mic\Downloads\pia-system`
- **GitHub**: https://github.com/Sodaworld2/pia-system
- **Stack**: Express + TypeScript + SQLite + Claude Agent SDK (Anthropic)
- **Dashboard**: `/mission-control.html` — single-file SPA at port 3000
- **Key feature**: Spawns, monitors, and coordinates AI agent sessions across machines via WebSocket hub/spoke architecture
- **Sub-projects**: `fisher2050/` inside pia-system — a separate Express server (port 3002) for AI project management
- **CLAUDE.md** at `C:\Users\mic\Downloads\pia-system\CLAUDE.md` — read this for all PIA rules

PIA has a concept of "hub" and "worker" machines. The hub aggregates all agent activity. Workers run local agent sessions and report to hub.

---

## 3. The Complete Ecosystem — All Known Repos

### A. Repos With GitHub Remotes (all under Sodaworld2 org unless noted)

#### 1. PIA System
- **Local**: `C:\Users\mic\Downloads\pia-system`
- **GitHub**: https://github.com/Sodaworld2/pia-system
- **Stack**: Express + TypeScript + SQLite + Claude Agent SDK
- **Role**: Orchestrator — the supervisor for all agents

#### 2. Sodaworld (main platform)
- **Local**: `C:\Users\mic\Downloads\sodaworld`
- **GitHub**: https://github.com/Sodaworld2/sodaworld.git
- **Stack**: React 19 + TypeScript + Vite + Firebase (sodaworld-de88e) + Mux + Zustand + TailwindCSS
- **Role**: Main consumer product — live streaming, events, gamification, comments
- **Also has**: `control-server/` sub-folder (Express, auto-port) + `agents/core/` with 6 AI agent definition files + `ORCHESTRATOR.md`

#### 3. Sodaworld Ticketing MVP
- **Local**: `C:\Users\mic\Downloads\sodaworld-ticketing-mvp`
- **GitHub**: https://github.com/Sodaworld2/sodaworld.git (SAME remote as sodaworld!)
- **Package name**: `sodaworld-virtual-channel`
- **Stack**: React + Vite + Firebase + Mux + Stripe + Vitest + Playwright
- **Role**: More complete version of sodaworld — adds ticketing, payments, full test suite
- **NOTE**: These two repos share the same GitHub remote. Determine which is canonical.

#### 4. Farcake2025 (biggest monorepo)
- **Local**: `C:\Users\mic\Downloads\Farcake2025`
- **GitHub**: https://github.com/Sodaworld2/Farcake2025
- **Stack**: Turborepo monorepo:
  - `apps/api/` — FastAPI (Python), 28+ routers, PostgreSQL, Redis, Celery, Alembic
  - `apps/web/` — Next.js 14 + TypeScript + TailwindCSS + Framer Motion + Apollo Client + OpenTelemetry
  - `apps/mobile/` — React Native 0.73.2 (no Expo)
  - `packages/types/` etc.
- **Role**: AI-driven Editorial Intelligence Platform — venue discovery, agency CRM, editorial workflow, AI content synthesis
- **Has CLAUDE.md**: Full project instructions at `C:\Users\mic\Downloads\Farcake2025\CLAUDE.md`
- **Key docs**: `docs/VENUE_PIPELINE_MASTER.md`, `docs/VENUE_INTELLIGENCE_SYSTEM_V2.md`

#### 5. Sheba
- **Local**: `C:\Users\mic\Downloads\sheba`
- **GitHub**: https://github.com/Sodaworld2/sheba
- **Stack**: Architecture/docs ONLY — no running code exists yet
- **Role**: "Essential Life Services" — local-first personal data vault integrated with DAO. Design only.
- **Contents**: `docs/DATABASE_SCHEMA.md`, `docs/ESSENTIAL_LIFE_SERVICES_ARCHITECTURE.md`, `docs/KNOWLEDGE_OVERVIEW.html`

#### 6. BirdfountainNov
- **Local**: `C:\Users\mic\Downloads\BirdfountainNov`
- **GitHub**: https://github.com/Sodaworld2/BirdfountainNov
- **Stack**: React 19 + Vite + TypeScript
- **Role**: Bird Fountain AI image review system prototype (completed Nov 2025)
- **Has**: Full component library including `ReviewDemo.tsx`, `App.tsx`, `components/`

#### 7. Videohoho
- **Local**: `C:\Users\mic\Downloads\Videohoho`
- **GitHub**: https://github.com/Sodaworld2/Videohoho
- **Stack**: Electron 33 + React 18 + Vite + Tailwind + electron-builder
- **Role**: Desktop app — smart video + audio merger with fade effects
- **Has**: `video-audio-mcp/` subfolder (MCP integration), `dist-electron/`, `JOURNAL.md`

#### 8. Sodastudio
- **Local**: `C:\Users\mic\Downloads\sodastudio`
- **GitHub**: https://github.com/Sodaworld2/sodastudio
- **Stack**: React 19 + Vite + Firebase (sodaworld-de88e) + Mux + Google Gemini + React Router
- **Role**: Soda Studio platform — video management, production tools, studio booking
- **Shares**: Same Firebase project as sodaworld (sodaworld-de88e)

#### 9. Sodacast
- **Local**: `C:\Users\mic\Downloads\Sodacast`
- **GitHub**: https://github.com/Sodaworld2/Sodacast
- **Stack**: React 19 + Vite + TypeScript (minimal — mostly a landing page)
- **Role**: Soda Cast Interactive — broadcast-themed streaming teaser page with demo request modal

#### 10. SodaStubsv2
- **Local**: `C:\Users\mic\Downloads\SodaStubsv2`
- **GitHub**: https://github.com/Sodaworld2/SodaStubsv2
- **Stack**: EMPTY — only `.git` folder exists, initial commit only
- **Status**: Abandoned or placeholder

#### 11. InvestorDome
- **Local**: `C:\Users\mic\Downloads\InvestorDome`
- **GitHub**: https://github.com/Sodaworld2/InvestorDome
- **Stack**: React 19 + Vite + Supabase + Google Gemini + Recharts + React Router
- **Package name**: `dealflow-ai`
- **Role**: AI investor CRM — pitch decks, deal flow, research, contact management
- **Live at**: https://investordome.web.app

#### 12. Video-kiosk-2-
- **Local**: `C:\Users\mic\Downloads\Video-kiosk-2-`
- **GitHub**: https://github.com/Sodaworld2/Video-kiosk-2-.git
- **Stack**: React 19 + Vite + Google Gemini + HLS.js
- **Role**: Video booth kiosk system — client login interface

#### 13. SodaRoid
- **Local**: `C:\Users\mic\Downloads\SodaRoid`
- **GitHub**: NO REMOTE SET (risk!)
- **Stack**: React Native 0.81.5 + Expo SDK 54 + Firebase (sodaworld-de88e) + Zustand (24 stores) + EAS Build + Mux
- **Role**: SodaWorld companion app — phone app + Android TV app; cross-device sync via Firestore
- **Has CLAUDE.md**: Full project instructions at `C:\Users\mic\Downloads\SodaRoid\CLAUDE.md`

#### 14. SodaLabs
- **Local**: `C:\Users\mic\Downloads\sodalabs`
- **GitHub**: https://github.com/NotJordanZA/sodalabs.git (under Jordan's account)
- **Stack**: React 19 + TypeScript + Vite + Firebase (mission control dashboard in `ts/` sub-folder)
- **Role**: SodaLabs agency marketing site + `ts/` = full mission control dashboard (cameras, events, Google Calendar, email server)
- **Has CLAUDE.md**: `C:\Users\mic\Downloads\sodalabs\CLAUDE.md`

### B. Local Only (no git remote)

| Name | Path | Status |
|------|------|--------|
| fisher2050 | `C:\Users\mic\Downloads\pia-system\fisher2050` | Active sub-project of PIA |
| SmartAgent | `C:\Users\mic\Downloads\SmartAgent` | Docs/brief only — not built |
| agent_instructions | `C:\Users\mic\Downloads\agent_instructions` | Text trigger files only |

### C. GitHub Repos NOT Cloned Locally (need investigation)

These exist on `https://github.com/Sodaworld2/` but have no local clone found:

| Repo | Description |
|------|-------------|
| archivelab | Unknown |
| caryn-katz | Caryn Katz website |
| claw | Claw bot |
| DAODEN | Treasury DAO |
| Experimental | Experimental apps |
| Farcake2 | Earlier version of Farcake |
| farcakereplit | Farcake Replit version |
| Manfred | "Manfred the Ace" |
| MichaelBalkind | Personal website |
| personal_assistant- | Mic's personal assistant |
| RSVP | Event RSVP system |
| sodachat | Unknown |
| video-booth-kiosk | May duplicate Video-kiosk-2- |

---

## 4. Specific Search Tasks to Run

### Task A: Determine which sodaworld clone is canonical

```bash
# Compare the two clones that share the same GitHub remote
git -C "C:/Users/mic/Downloads/sodaworld" log --oneline -10
git -C "C:/Users/mic/Downloads/sodaworld-ticketing-mvp" log --oneline -10

# Check branches
git -C "C:/Users/mic/Downloads/sodaworld" branch -a
git -C "C:/Users/mic/Downloads/sodaworld-ticketing-mvp" branch -a

# See what's different
git -C "C:/Users/mic/Downloads/sodaworld" diff HEAD "C:/Users/mic/Downloads/sodaworld-ticketing-mvp" 2>/dev/null | head -100
```

### Task B: Find all agent definition files across all repos

```bash
# Search for agent task/instruction files
grep -rl "AGENT" C:/Users/mic/Downloads/sodaworld/agents/ 2>/dev/null
grep -rl "agent" C:/Users/mic/Downloads/Farcake2025/apps/api/agents/ 2>/dev/null
ls C:/Users/mic/Downloads/sodaworld-ticketing-mvp/agents/
```

### Task C: Find what Farcake2025 can do that Farcake (sodalabs stub) can't

```bash
ls C:/Users/mic/Downloads/Farcake2025/apps/api/routers/ 2>/dev/null
# Read the router files to understand full API surface
# Key question: does Farcake2025 have a running API for PIA to call?
cat C:/Users/mic/Downloads/Farcake2025/apps/api/main.py
```

### Task D: Map all Firebase projects across apps

```bash
grep -r "projectId\|databaseURL\|appId" C:/Users/mic/Downloads/sodaworld/firebase.json 2>/dev/null
grep -r "projectId\|databaseURL\|appId" C:/Users/mic/Downloads/sodaworld-ticketing-mvp/firebase.json 2>/dev/null
grep -r "projectId" C:/Users/mic/Downloads/sodastudio/firebase.json 2>/dev/null
grep -r "projectId" C:/Users/mic/Downloads/SodaRoid/app.json 2>/dev/null
grep -r "projectId" C:/Users/mic/Downloads/sodalabs/firebase.json 2>/dev/null
```

### Task E: Find all Stripe integration code

```bash
grep -rl "stripe" C:/Users/mic/Downloads/sodaworld-ticketing-mvp/src/ 2>/dev/null
grep -rl "stripe" C:/Users/mic/Downloads/SodaRoid/ 2>/dev/null
```

### Task F: Map all port numbers in use

```bash
grep -r "port\|PORT\|3000\|3001\|3002\|8000\|8080" C:/Users/mic/Downloads/pia-system/src/config.ts 2>/dev/null
grep -r "port" C:/Users/mic/Downloads/sodaworld/control-server/server.js 2>/dev/null
grep -r "PORT\|port" C:/Users/mic/Downloads/pia-system/fisher2050/src/index.ts 2>/dev/null
```

### Task G: Find all Mux integration code

```bash
grep -rl "mux\|MUX\|@mux" C:/Users/mic/Downloads/sodaworld/src/ 2>/dev/null | head -10
grep -rl "mux" C:/Users/mic/Downloads/SodaRoid/app/ 2>/dev/null | head -5
grep -rl "mux" C:/Users/mic/Downloads/sodastudio/src/ 2>/dev/null | head -5
```

### Task H: Investigate uncloned GitHub repos

```bash
# Clone and investigate these repos to understand what they are
# (requires internet)
curl -s "https://api.github.com/repos/Sodaworld2/DAODEN" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['description'], r['language'])"
curl -s "https://api.github.com/repos/Sodaworld2/personal_assistant-" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['description'], r['language'])"
curl -s "https://api.github.com/repos/Sodaworld2/Farcake2" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['description'], r['language'])"
```

### Task I: Find all PIA-adjacent agent instruction files

```bash
ls C:/Users/mic/Downloads/agent_instructions/processed/ 2>/dev/null
cat C:/Users/mic/Downloads/agent_instructions/trigger.txt 2>/dev/null
cat C:/Users/mic/Downloads/agent_instructions/test_list.txt 2>/dev/null
```

### Task J: Find all CLAUDE.md files across all repos

```bash
find "C:/Users/mic/Downloads" -name "CLAUDE.md" -not -path "*/node_modules/*" 2>/dev/null
find "C:/Users/mic/Downloads" -name "claude.md" -not -path "*/node_modules/*" 2>/dev/null
```

### Task K: Investigate fisher2050 architecture

```bash
cat C:/Users/mic/Downloads/pia-system/fisher2050/src/index.ts
ls C:/Users/mic/Downloads/pia-system/fisher2050/src/api/
ls C:/Users/mic/Downloads/pia-system/fisher2050/src/ai/
ls C:/Users/mic/Downloads/pia-system/fisher2050/src/scheduler/
```

### Task L: Check Videohoho MCP integration

```bash
ls C:/Users/mic/Downloads/Videohoho/video-audio-mcp/
cat C:/Users/mic/Downloads/Videohoho/JOURNAL.md | head -50
```

### Task M: Sodaworld control-server investigation

```bash
cat C:/Users/mic/Downloads/sodaworld/control-server/server.js
# What does this control server do? How does it relate to PIA?
```

### Task N: Full Farcake2025 API router list

```bash
ls C:/Users/mic/Downloads/Farcake2025/apps/api/routers/
# Read a few key routers to understand capabilities
cat C:/Users/mic/Downloads/Farcake2025/apps/api/routers/knowledge_base.py | head -50
cat C:/Users/mic/Downloads/Farcake2025/apps/api/routers/venues.py | head -50
```

---

## 5. Key Questions to Answer

1. **Sodaworld canonical version**: Which of `sodaworld` vs `sodaworld-ticketing-mvp` is the most up-to-date version of the sodaworld platform? They share the same GitHub remote — are they different branches? Which should be the primary working directory going forward?

2. **Farcake version history**: What is the difference between Farcake2025 (local monorepo) and `Farcake2` (GitHub only)? Is Farcake2025 the active v2, and Farcake2 an older repo, or vice versa?

3. **SodaRoid backup**: SodaRoid has NO git remote. Is there a backup anywhere? What is the latest commit SHA? Should we add it to Sodaworld2/SodaRoid on GitHub?

4. **SodaLabs vs sodalabs**: The sodalabs repo is under `NotJordanZA` (Jordan), not Sodaworld2. Is Jordan the primary maintainer? Should Mic have a fork under Sodaworld2?

5. **Fisher2050 role**: Fisher2050 is a standalone Express server for "AI Project Manager." Is it currently running? Is it connected to PIA? What does its API surface look like?

6. **SmartAgent**: The SmartAgent brief says to use Farcake2025 as a foundation. Is the Farcake2025 API running locally? What's the status of the SmartAgent build?

7. **GumballCMS**: Is GumballCMS purely a marketing concept, or is there a real implementation hidden in another repo?

8. **Sheba vs DAODEN**: Sheba (Essential Life Services) and DAODEN (treasury DAO) — are these part of the same larger DAO vision? DAODEN exists on GitHub but isn't cloned locally.

9. **Agent architectures**: Sodaworld has 6 AGENT_*.md files (AGENT_1 through AGENT_6 + ORCHESTRATOR.md), sodaworld-ticketing-mvp has similar agent files. Are these the same agents? Are they in sync?

10. **Control server overlap**: sodaworld has a `control-server/` (Express, local process manager). PIA IS a control server. Are these competing, or does the sodaworld control-server serve a different purpose?

---

## 6. What to Produce

After completing your investigation, produce a single document at:
`C:\Users\mic\Downloads\pia-system\research\INTEGRATION_PLAN.md`

Structure it as:

```markdown
# Unified Integration Plan — SodaWorld Ecosystem

## 1. Canonical Repo Decisions
[For each overlap/duplicate: which version wins, what to do with the other]

## 2. Firebase Project Map
[Which apps share which Firebase project; what's isolated]

## 3. PIA Integration Opportunities
[Specific APIs/agents from other repos that PIA should call or absorb]
- Farcake2025 API endpoints PIA should use for research
- Sodaworld agent patterns PIA should coordinate
- Fisher2050 integration with PIA mission control

## 4. Repos to Archive / Merge / Build
- Archive (no more work): [list]
- Merge into another repo: [list with destination]
- Build out (currently just docs): [list with recommended stack]

## 5. Missing Repos to Clone
[List of GitHub repos that aren't cloned locally yet, with priority]

## 6. SodaRoid Emergency Actions
[It has no remote — what to do immediately]

## 7. Cross-Repo Agent Architecture
[How all the AI agents across all repos relate to each other]
- Farcake2025 agents (FastAPI)
- Sodaworld agents (6-agent orchestration)
- PIA agents (Claude Agent SDK)
- Fisher2050 scheduler
- SmartAgent (planned)

## 8. Shared Infrastructure Opportunities
[What could be shared: auth, Firebase config, agent protocols, design system]

## 9. Priority Build Queue
Ordered list of what to build/fix next, with estimated effort
```

---

## 7. Important Rules and Context

- **Do not modify** `C:\Users\mic\Downloads\pia-system\dao-foundation-files\` — it's a separate project
- **PIA's CLAUDE.md** at `C:\Users\mic\Downloads\pia-system\CLAUDE.md` is the law for all PIA work
- **PIA runs on port 3000** — don't change this
- **Fisher2050 runs on port 3002** — already configured
- **Do not add build tools to PIA's HTML dashboard** (`public/mission-control.html`) — it must stay a single file
- **Session journaling**: After making any changes, update `SESSION_JOURNAL_2026-02-20.md` in pia-system
- Today's date: **2026-02-20**

---

## 8. Quick File Reference

| File | Purpose |
|------|---------|
| `C:\Users\mic\Downloads\pia-system\CLAUDE.md` | PIA project instructions |
| `C:\Users\mic\Downloads\pia-system\PIA_ARCHITECTURE.md` | Hub/worker architecture |
| `C:\Users\mic\Downloads\pia-system\PIA_KNOWLEDGE_BASE.md` | Master knowledge base |
| `C:\Users\mic\Downloads\pia-system\research\CODE_REPOSITORY_MAP.md` | This scout's output (already complete) |
| `C:\Users\mic\Downloads\Farcake2025\CLAUDE.md` | Farcake2025 project instructions |
| `C:\Users\mic\Downloads\SodaRoid\CLAUDE.md` | SodaRoid project instructions |
| `C:\Users\mic\Downloads\sodaworld\CLAUDE.md` | Sodaworld project instructions |
| `C:\Users\mic\Downloads\sodalabs\CLAUDE.md` | SodaLabs project instructions |
