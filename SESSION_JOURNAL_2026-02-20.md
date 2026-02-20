# Session Journal — 2026-02-20

## Session 1: Multi-Machine Agent Control + Dashboard Fixes

### Context
Continued from previous session. M1 (Izzit7, hub) controls M2 (soda-monster-hunter, 100.127.165.12) over Tailscale. Goal: spawn agents on M2 from M1, see them in M1's dashboard, and chat with them from M1.

---

### Changes

- **Bug fix**: `GET /api/mc/agents` — was only returning local `AgentSessionManager` sessions. Now async, also reads hub SQLite DB (`getAllAgents()`) and merges remote agents (those with a `machine_id` not equal to `'local'`). Remote agents now appear in M1's dashboard.

- **Bug fix**: `POST /api/mc/agents/:id/respond` — was calling local `mgr.respond()` only. Now proxies to remote machine via Node `http` module when agent is not found locally. Looks up machine IP from `getMachineById()`, sends `{ choice }` body to `http://<ip>:3000/api/mc/agents/:id/respond`.

- **Bug fix**: `src/tunnel/websocket-server.ts` — `agent:register` handler was only broadcasting `mc:status`. Now also broadcasts `mc:agent_spawned` event so the dashboard knows to create a new agent card.

- **New HTML event handler**: `public/mission-control.html` — added `case 'mc:agent_spawned'` in `handleWsMessage()` which calls `fetchAgents().then(renderAll)` to refresh the agent list when a remote agent is registered.

- **New file**: `public/pia-plan.html` — Visual HTML planning document. Explains PIA system simply (pizza shop analogy), shows M1/M2 architecture, documents the 3 fixes, roadmap timeline, terminal mirroring architecture diagram, Claude SDK streaming code, WebSocket broadcast patterns. Uses Context7 MCP + web research as sources.

### Files Changed

| File | Change |
|---|---|
| `src/api/routes/mission-control.ts` | `GET /api/mc/agents` now async + includes hub DB remote agents; `POST /agents/:id/respond` now proxies to remote machine IP |
| `src/tunnel/websocket-server.ts` | `agent:register` handler now also broadcasts `mc:agent_spawned` |
| `public/mission-control.html` | Added `case 'mc:agent_spawned'` handler → calls `fetchAgents()` |
| `public/pia-plan.html` | **NEW** — Visual planning document (served at `/pia-plan.html`) |

---

### Key Architecture Knowledge

**Agent spawn flow (M1 → M2):**
1. Dashboard POSTs to `POST /api/mc/agents` with `machineId` = M2's DB ID
2. M1 hub sends `spawn_agent` over WebSocket to M2's hub-client
3. M2's hub-client calls `AgentSessionManager.spawn()` directly
4. M2 sends `agent:register` back to M1 over WebSocket
5. M1 websocket-server broadcasts `mc:agent_spawned` to dashboard browsers
6. Dashboard calls `fetchAgents()` → agent card appears

**ID mapping:**
- M2's local agent ID may differ from hub DB ID
- `HubAggregator.clientToDbId` maps spoke local ID → DB ID
- `resolveDbId()` used to translate before DB lookups

**Chat routing:**
- `POST /api/mc/agents/:id/respond` with body `{ choice: "..." }` (not `message`)
- If agent not local → look up `machine.ip_address` in DB → proxy HTTP request to `http://<ip>:3000`
- Machine must have `ip_address` stored in DB for proxying to work

**WebSocket event types (Hub → Dashboard):**
- `mc:agent_spawned` — new agent registered (triggers fetchAgents)
- `mc:status` — agent status update
- `mc:output` — agent text output chunk
- `machine:update` — machine online/offline

**M2 direct API:**
- M2 is reachable at `http://100.127.165.12:3000` over Tailscale
- This enables direct HTTP proxying without needing WebSocket relay for respond calls

---

### Research Gathered (Context7 + Web)

**Claude Agent SDK streaming:**
- Set `includePartialMessages: true` in query options
- Yields `StreamEvent` messages with `event.type === "content_block_delta"` and `event.delta.type === "text_delta"`
- Use `event.delta.text` to get each chunk

**ws broadcast pattern:**
```typescript
wss.clients.forEach((client) => {
  if (client.readyState === WebSocket.OPEN) client.send(data);
});
```
- No built-in rooms — implement with `Map<string, Set<WebSocket>>`

**Industry context:**
- 75% of businesses expected to adopt AI agent orchestration by 2025 (23% CAGR)
- Leading platforms: CrewAI, LangChain, Ray, New Relic Fleet Control, Datadog
- PIA differentiator: local/private, Claude AI brain, self-hosted fleet dashboard

---

### Pending / Next Steps

| Priority | Feature | Notes |
|---|---|---|
| High | Terminal output mirroring M2 → M1 | M2 agent text_delta chunks need to relay through hub WebSocket to M1 dashboard |
| High | Two-way chat from M1 to remote agents | Respond proxy is done; need output to flow back |
| Medium | `ip_address` stored in DB on registration | Currently proxying relies on `machine.ip_address` — verify it's populated |
| Medium | Electron desktop app | React UI replacing mission-control.html |

### Research Logged to Knowledge Base

**Marc Nuri blog** (https://blog.marcnuri.com/boosting-developer-productivity-ai-2025):
- 10–15 → 25+ commits/day purely from async parallel agent workflow
- Context % display on agent cards = high value (unstable agent at high context)
- Git branch per card, mobile review, git worktrees for parallel safety
- Project quality = AI-readiness (well-tested = better AI results)

**Context7 — Claude Agent SDK usage tracking:**
- `ModelUsage.contextWindow` field gives total context window size
- `onMessage` callback gives per-step `inputTokens` to compute `% used`
- `result.usage.total_cost_usd` for cumulative session cost
- PIA action: add context % bar to agent cards (yellow >70%, red >90%)

**"Five Levels of Vibe Coding" + Dark Factory video:**
- Framework: L0 autocomplete → L5 dark factory (spec in, software out)
- 90% of "AI native" devs are at Level 2 — PIA targets Level 3–4
- StrongDM: 3 engineers, no sprints, behavioral scenarios stored OUTSIDE codebase
- J-curve: developers get 19% SLOWER when bolting AI to old workflow (METR study)
- Spec quality is now the bottleneck, not implementation speed

### Desktop App Impact
No breaking changes. New WebSocket event `mc:agent_spawned` and new HTTP proxy in respond endpoint are additive — React UI will need to subscribe to `mc:agent_spawned` the same way.

---

## Session 2: Research Synthesis + Architecture Diagrams

### Sources Studied
1. **Marc Nuri blog** — boosting-developer-productivity-ai-2025 — multi-machine agent orchestration, context % display, git branch on cards, git worktrees, mobile review
2. **Context7 MCP** — Claude Agent SDK cost-tracking docs — `ModelUsage.contextWindow` field, `onMessage` callback for per-step usage
3. **"Five Levels of Vibe Coding" video** — Dan Shapiro framework (L0–L5), StrongDM dark factory, J-curve warning, spec quality as bottleneck

### Key Findings
- `ModelUsage.contextWindow` from SDK gives total context window size → can compute context % per agent
- `onMessage` callback fires per assistant message with `inputTokens` + `contextWindow`
- StrongDM keeps behavioral "scenarios" OUTSIDE codebase so agent can't game tests
- 90% of "AI native" developers are stuck at Level 2 (multi-file changes, still reading all code)
- J-curve: developers get 19% SLOWER when bolting AI to unchanged workflows

### New Files
| File | Change |
|---|---|
| `public/pia-plan.html` | **NEW** — Visual planning document (pizza analogy, diagrams, research) |
| `public/pia-diagram.html` | **NEW** — Architecture diagram: now vs after, full to-do list |

### To-Do List (Prioritised)

| # | Task | Effort | Source |
|---|------|--------|--------|
| 1 | **Context % bar on agent cards** | 2 hrs | Context7 SDK: `ModelUsage.contextWindow` |
| 2 | **Git branch on agent cards** | 1 hr | Marc Nuri dashboard feature |
| 3 | **Terminal output mirroring M2→M1** | 1–2 days | Core missing feature |
| 4 | **Two-way chat visible on M1** | 1 day | Respond proxy done; output relay missing |
| 5 | **Mobile-responsive dashboard** | 1 day | Marc Nuri: review from phone |
| 6 | **Git worktree auto-create** | 1 day | Parallel agents on same repo safely |
| 7 | **External eval/scenario system** | 1 week | StrongDM pattern: holdout behavioral specs |

### Desktop App Impact
Context % bar and git branch are additive fields — React UI will need to display them. Terminal mirroring adds a new WebSocket event (`mc:terminal_output` or similar) that React UI must subscribe to.

---

## Session 3: Video Research Synthesis — Orchestrator Agent + Claude Code Native Multi-Agent

### Sources Studied
1. **"Orchestrator Agent" lesson** — Agentic Horizon series — full transcript synthesised
2. **"Claude Code Multi-Agent Orchestration" video** — Agentic Horizon series — new native tools synthesised

### New Knowledge Files Created
| File | What's In It |
|---|---|
| `research/ORCHESTRATOR-AGENT-VIDEO-SYNTHESIS.md` | Full synthesis of Orchestrator Agent lesson — 14 sections covering Core 4, CRUD for agents, Scout→Builder pattern, delete philosophy, PIA build checklist |
| `research/CLAUDE-CODE-MULTI-AGENT-NATIVE-SYNTHESIS.md` | Full synthesis of Claude Code native multi-agent tools — team_create, task_*, send_message, agent sandboxes (E2B), full workflow, PIA comparison table |

### Key Findings for PIA Planning (MM8)

**From Orchestrator Agent video:**
- The orchestrator agent = an AI that calls PIA's REST API as tools (create_agent, command_agent, list_agents, delete_agent, check_agent_status)
- PIA already has all the API — it just needs an AI with those tools pointing at itself
- Scout → Builder pattern: cheap read-only scout produces a file map → builder uses it → zero wasted writes
- Consumed/produced files per agent = high-value observability (files read vs files written per session)
- Core 4 must be visible on every agent card: Context %, Model, Prompt summary, Tools list
- Delete is a first-class operation — "treat agents as deletable temporary compute"

**From Claude Code native multi-agent video:**
- Claude Code now has built-in: team_create, team_delete, task_create, task_list, task_get, task_update, send_message
- Agent sandboxes (E2B cloud or local machine) = isolated compute, 12hr TTL, each with its own URL
- PIA's advantage over Claude Code native: multi-machine + visual dashboard
- Claude Code's advantage over PIA: native team/task tools + sandbox isolation
- **Ideal path:** PIA surfaces Claude Code's native multi-agent tools in its dashboard (PIA wraps them)
- Full workflow: create team → create tasks → spawn agents → parallel work → shutdown → delete team

### Updated Priority List for MM8 Planning

| # | Feature | Source | Why Now |
|---|---|---|---|
| 1 | **Orchestrator agent** (AI with agent-management tools) | Orchestrator video | Unlocks everything — scout/builder chains, auto-spawning, delegation |
| 2 | **Terminal output mirroring M2→M1** | Previous sessions | Core missing feature for multi-machine |
| 3 | **Context % bar on agent cards** | Both videos + SDK docs | Essential observability, SDK already exposes it |
| 4 | **Consumed/produced files per agent** | Orchestrator video | Result-oriented engineering — what did agent read/write? |
| 5 | **Delete all agents (bulk clean sweep)** | Both videos | First-class operation per philosophy |
| 6 | **Team grouping concept** | Claude Code video | Group related agents, delete as a set |
| 7 | **Agent sandbox isolation** | Claude Code video | Local machine protection, parallel safety |
| 8 | **Cost per agent** | Orchestrator video | From SDK `result.usage.total_cost_usd` |

### Desktop App Impact
New research files are documentation only — no code changes. React UI will eventually need to display: consumed/produced files, context % bar, cost per agent, team grouping. All additive.
