# Project Plan: Agent Shops — Connecting Agents to Projects
**Created:** 2026-02-14
**Status:** DRAFT — Awaiting approval

---

## The Metaphor

We built the office, hired the team, installed the phones, set up security, and built the control room. Now we need to **hand each team member the keys to all 10 shops** and tell them **exactly what to look for**.

---

## Current State (What We Have)

| Layer | Component | Status |
|-------|-----------|--------|
| Infrastructure | Express API, SQLite, WebSocket | Done |
| Agent Engine | 6 templates, cost router, factory | Done |
| Mission Control | Spawn, approve, journal, kill, cost tracking | Done |
| Agent Souls | Eliyahu, Fisher2050, Ziggi (persistent memory) | Done |
| DAO Backend | 9 AI modules, 38+ endpoints, voting, signatures | Done |
| Security | Network sentinel, rate limiting, auth | Done |
| Frontend | Mission Control dashboard (live, wired) | Done |

---

## What We're Building

### The Project Definition Layer

A system that knows **what projects exist**, **what each agent should do** when assigned to one, and **how to report back** on project health.

---

## The 10 Projects (Shops)

These need to be confirmed, but based on the codebase, the natural project boundaries are:

| # | Project | Scope | What "Healthy" Means |
|---|---------|-------|---------------------|
| 1 | **PIA Core** | `src/agents/`, `src/orchestrator/`, `src/db/` | Agent factory spawns, heartbeat alive, DB writable |
| 2 | **Mission Control** | `src/mission-control/`, `public/mission-control.html` | Can spawn agent, receive output, approve prompts |
| 3 | **DAO Backend** | `src/api/routes/dao-*.ts`, DAO AI modules | All 38+ endpoints respond, modules return valid JSON |
| 4 | **Security** | `src/security/`, auth middleware | Sentinel running, rate limiter active, no breaches |
| 5 | **Tunnel / PTY** | `src/tunnel/`, WebSocket server | PTY spawn works, WebSocket connects, output streams |
| 6 | **Soul Engine** | `src/souls/`, personalities | Souls load, memory layers persist, recall works |
| 7 | **AI Router** | `src/ai/`, LLM clients | Ollama reachable, Claude API key valid, cost routing works |
| 8 | **Frontend / UI** | `public/*.html` | Pages load, API calls succeed, no console errors |
| 9 | **DevOps / Infra** | `.env`, `package.json`, Tailscale, multi-machine | Hub reachable, spokes registered, heartbeat < 60s old |
| 10 | **Documentation** | `*.md`, briefings, specs | Docs match reality, no stale references |

---

## Architecture

### New Database Tables

```sql
-- The 10 shops
CREATE TABLE projects (
  id TEXT PRIMARY KEY,           -- e.g. 'pia-core', 'mission-control'
  name TEXT NOT NULL,            -- Human name: "PIA Core"
  description TEXT,              -- What this project is
  scope TEXT,                    -- File paths / modules covered
  health_checks TEXT,            -- JSON array of check definitions
  briefing TEXT,                 -- System prompt injected into agents assigned here
  status TEXT DEFAULT 'unknown', -- 'healthy', 'degraded', 'down', 'unknown'
  last_checked_at TEXT,          -- ISO timestamp
  last_checked_by TEXT,          -- agent session ID
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Who's watching which shop
CREATE TABLE project_assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_template TEXT,           -- e.g. '@reviewer', '@security'
  soul_id TEXT,                  -- e.g. 'eliyahu', 'fisher2050' (optional)
  role TEXT DEFAULT 'monitor',   -- 'monitor', 'builder', 'reviewer', 'owner'
  schedule TEXT,                 -- 'on-demand', 'hourly', 'daily', 'continuous'
  last_run_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Results from each check
CREATE TABLE project_checks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_session_id TEXT,         -- MC agent that performed the check
  check_type TEXT,               -- 'health', 'review', 'security', 'build'
  result TEXT,                   -- 'pass', 'fail', 'warning'
  details TEXT,                  -- JSON with findings
  cost_usd REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### New API Endpoints

```
GET    /api/projects                  — List all 10 projects with status
GET    /api/projects/:id              — Project detail + recent checks
POST   /api/projects/:id/check        — Spawn agent to check this project
GET    /api/projects/:id/checks       — Check history
GET    /api/projects/:id/assignments   — Who's assigned
POST   /api/projects/:id/assignments   — Assign agent/soul to project
DELETE /api/projects/:id/assignments/:aid — Unassign
GET    /api/projects/dashboard         — Aggregate health overview (all 10)
```

### Context Injection (The "Briefing")

When Mission Control spawns an agent for a project, inject the project briefing into the task prompt:

```typescript
// In agent-session.ts, before spawning:
const project = await db('projects').where({ id: projectId }).first();

const enrichedTask = `
## Project Context
You are checking on: ${project.name}
Scope: ${project.scope}
Description: ${project.description}

## Your Assignment
${project.briefing}

## Health Checks to Perform
${JSON.stringify(project.health_checks, null, 2)}

## Original Task
${task}
`;
```

---

## Implementation Phases

### Phase 1: Schema + Seed Data (Small)
- [ ] Create migration for `projects`, `project_assignments`, `project_checks` tables
- [ ] Seed the 10 projects with descriptions, scopes, and basic health checks
- [ ] Add DB query helpers (`src/db/queries/projects.js`)

### Phase 2: API Routes (Medium)
- [ ] Create `src/api/routes/projects.ts`
- [ ] Wire all 8 endpoints listed above
- [ ] Mount in `src/api/server.ts`

### Phase 3: Context Injection (Small)
- [ ] Modify `agent-session.ts` to accept `projectId` parameter
- [ ] Load project briefing and inject into task prompt
- [ ] Update MC spawn endpoint to accept `projectId`
- [ ] Log check results to `project_checks` table on agent completion

### Phase 4: Dashboard Integration (Medium)
- [ ] Add project selector to Mission Control spawn modal
- [ ] Add "Projects" panel/tab to Mission Control UI
- [ ] Show project health grid (10 tiles, color-coded)
- [ ] Click project tile → see recent checks, assigned agents

### Phase 5: Scheduled Checks (Future)
- [ ] Cron-style scheduler for recurring project checks
- [ ] Auto-spawn agents based on `project_assignments.schedule`
- [ ] Alert when project status changes from healthy to degraded

---

## What Each Agent Template Does Per Project

| Agent | What They Check |
|-------|----------------|
| **@reviewer** | Code quality, patterns, tech debt in project scope |
| **@security** | Vulnerabilities, exposed secrets, OWASP issues |
| **@debug** | Run tests, check for runtime errors, trace failures |
| **@devops** | Build status, dependencies, deployment readiness |
| **@researcher** | Docs accuracy, API compatibility, library updates |
| **@local-coder** | Fix issues found by other agents (Ollama, free) |

---

## Example: "Check on Mission Control"

```
1. User clicks "Mission Control" in projects dashboard
2. Clicks "Run Check" → picks @reviewer template
3. System spawns MC agent with enriched prompt:
   "You are checking on: Mission Control
    Scope: src/mission-control/, public/mission-control.html
    Health checks: [can_spawn_agent, websocket_connects, prompt_queue_works]
    Task: Review this project for issues, run health checks, report findings."
4. Agent works autonomously (reads files, runs tests)
5. On completion → results saved to project_checks
6. Dashboard tile updates: green/yellow/red
```

---

## Files That Will Be Created/Modified

| Action | File |
|--------|------|
| CREATE | `src/db/migrations/XXXX_create_projects.ts` |
| CREATE | `src/db/queries/projects.js` |
| CREATE | `src/api/routes/projects.ts` |
| MODIFY | `src/api/server.ts` (mount new route) |
| MODIFY | `src/mission-control/agent-session.ts` (accept projectId, inject context) |
| MODIFY | `src/api/routes/mission-control.ts` (accept projectId in spawn) |
| MODIFY | `public/mission-control.html` (project selector + dashboard panel) |
| CREATE | `src/db/seeds/projects-seed.ts` (seed 10 projects) |

---

## Success Criteria

- [ ] All 10 projects defined in DB with descriptions and health checks
- [ ] Can spawn an agent scoped to a specific project from Mission Control
- [ ] Agent receives project context in its prompt automatically
- [ ] Check results are stored and visible in the dashboard
- [ ] Project health tiles show live status (green/yellow/red)

---

## Estimated Effort

| Phase | Size | Dependencies |
|-------|------|-------------|
| Phase 1: Schema + Seed | Small | None |
| Phase 2: API Routes | Medium | Phase 1 |
| Phase 3: Context Injection | Small | Phase 1 |
| Phase 4: Dashboard UI | Medium | Phase 2 + 3 |
| Phase 5: Scheduled Checks | Future | Phase 4 |

Phases 2 and 3 can run in parallel after Phase 1 is done.
