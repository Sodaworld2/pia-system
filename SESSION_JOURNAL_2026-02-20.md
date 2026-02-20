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

---

## Session 4: Architecture Vision Planning — Full System Design

### Context
Pure planning session (no code written). User sketched architecture on Canva and discussed the full PIA × SodaLabs system vision. Everything below is new architectural knowledge to be built.

---

### New Agents Defined

#### Tim Buc — The Librarian (NEW — invented this session)
- **Role**: Archivist. Triggered every time an agent session ends.
- **Trigger**: Event-driven (pinged on session completion)
- **Behaviour**: Wakes (ephemeral spawn) → reviews raw Claude SDK logs → sorts by project/agent/type/date → files to Records DB → sleeps
- **Machine**: M1
- **Output feeds**: Eliyahu reads Tim Buc's filed summaries

#### Monitor Agent — The Watchdog (formalised this session)
- **Role**: Continuously checks all agents across all machines. Pushes status to Controller.
- **Key distinction**: PUSHES (not polls) — no one needs to ask it "what's happening?"
- **Trigger**: Continuous (always running)
- **Machine**: M1

#### Agent Records (NEW — defined this session)
- **What it stores**: Full Claude SDK session logs per agent — messages, tool calls, thinking/reasoning, tokens used, context %, cost (total_cost_usd), files consumed (read) and produced (written)
- **Who writes**: Tim Buc files here after every session
- **Who reads**: Eliyahu reads to build briefings and spot patterns
- **Location**: M1 SQLite (extending existing DB)

---

### New Architectural Patterns Defined

#### 1. Calendar-Triggered Ephemeral Agent Spawn
- Instead of cron jobs baked in code, a **calendar is the schedule**
- Fisher2050 creates calendar entries for each agent task
- PIA hub watches the calendar → event fires → checks which machine is available → spawns agent on best available machine
- **Machine-agnostic dispatch**: agent doesn't care which machine runs it — PIA picks the available one
- Calendar entry carries: agent name, task, context, machine preference ("any" or specific)
- **Technical term**: Event-driven scheduling / scheduled webhook trigger

#### 2. Dynamic Machine Roles — Machine-as-Project-Orchestrator
- Machines do NOT have fixed roles. When a project activates on a machine, that machine BECOMES the boss of that project.
- **Three-tier hierarchy**:
  - **M1 (Strategic)**: Controller, Fisher2050, Eliyahu — company-wide
  - **M2 (Project)**: Activated as boss of ONE project (e.g. Farcake). Loads project soul + task list. Dispatches to M3.
  - **M3 (Execution)**: Farcake + Andy — actual specialist workers
- M2 dispatches work DOWN to M3, M3 sends results BACK UP to M2
- Multiple projects can run simultaneously — each on its own boss machine

#### 3. Project Activation Pattern
When a project activates on a machine:
- "Update me where we last left off" → Owl reads task list → agent loads context
- Two interaction modes:
  - **BUILD**: Autonomous execution — agent works without being prompted
  - **PROMPT**: Conversational — human gives new instructions
- On session end: Owl agent updates task list ("what got done, what's next")

#### 4. Agent Automation Profiles (Soul + Responsibilities)
Every agent needs one complete spec:
```
SOUL:            Identity, personality, goals, relationships, rules, memory
TRIGGER:         When do I wake? (calendar / event / on-demand)
MACHINE:         Where do I run? (M1 / M2 / M3 / any available)
INPUT:           What do I read at startup?
TASK:            What do I do?
OUTPUT:          What do I produce?
REPORTS TO:      Who gets my results?
ARCHIVES TO:     Tim Buc (always)
ON COMPLETE:     What gets triggered next?
```
Writing this spec for each agent = the entire system runs automatically.

#### 5. Machine Time Scheduling (Fisher2050 as Resource Scheduler)
- Fisher2050 manages machine CAPACITY, not just tasks
- M3 has Farcake + Andy — only one can run at a time
- Fisher2050 knows M3's schedule, books time slots, queues tasks
- **"Move things along"**: Fisher proactively queues the next task when previous completes — no one has to ask
- If machine offline: Fisher reschedules automatically
- If quality issue (Ziggi verdict): Fisher creates re-do task + reschedules machine time
- **Technical term**: Resource scheduling / workload management / job queue management

#### 6. Messaging System — Digital Worker Identity
Every machine and agent gets a real addressable identity:

**Machine addresses:**
- M1 (Izzit7): m1@sodalabs.ai + channel #m1
- M2 (Monster): m2@sodalabs.ai + channel #m2
- M3 (Yeti): m3@sodalabs.ai + channel #m3

**Agent addresses:**
- controller@sodalabs.ai, fisher2050@sodalabs.ai, eliyahu@sodalabs.ai
- ziggi@sodalabs.ai, timbuc@sodalabs.ai, farcake@sodalabs.ai
- andy@sodalabs.ai, birdfountain@sodalabs.ai, wingspan@sodalabs.ai

**Message types:**
- Inbound (you → agent): Email Fisher2050 a goal / WhatsApp via GumballCMS bridge
- Outbound (agent → you): Eliyahu 6am briefing, Fisher standup/summary, Ziggi quality report
- Internal (agent → agent): PIA WebSocket channels (already exists, needs formalising)

**Channels:**
- #company (all agents), #project-farcake, #quality (Ziggi+Fisher), #briefings, #m1-m2, #m1-m3

**PIA hub = postmaster**: Routes WebSocket internal + Email external
**GumballCMS = WhatsApp bridge**: You → WhatsApp → GumballCMS → Fisher2050 inbox

**Technical term**: Unified Communications (UC) + Message-Oriented Middleware + Digital Worker Identity

---

### Updated Agent Roster (Complete)

| Agent | Layer | Role | Trigger | Machine |
|---|---|---|---|---|
| Controller | Interface | Wakes with soul, routes via voice | On-demand | M1 |
| Monitor | Watchdog | Pushes status to Controller | Continuous | M1 |
| Fisher2050 | Operations | Task breakdown, scheduling, dispatch | 9am + 6pm + on-demand | M1 |
| Eliyahu | Intelligence | Reads Tim Buc files, briefings, farms lists | 6am + event | M1 |
| Ziggi | Quality | Reviews output, rates 1-10, 2am audits | 2am cron + task complete | M2 |
| Tim Buc | Library | Reviews, sorts, files all session records | Event (session end) | M1 |
| Owl | Memory | Persistent task list across sessions | Session start + end | M1 (DB) |
| Farcake | Research | Investigates, cross-references | Fisher2050 calendar | M3 |
| Andy | Editorial | Writes in your voice | Fisher2050 calendar | M3 |
| Bird Fountain | Design | Image production at scale | Fisher2050 calendar | M2 |
| Wingspan | Presentations | Deck tracking and intelligence | Fisher2050 calendar | M3 |

---

### New Products / Tools Added to Architecture

#### GumballCMS (already built, now integrated into agent pipeline)
- WhatsApp-first publishing platform (Status: Live)
- Role in architecture: Output delivery layer for Andy, Bird Fountain, Wingspan
- Also: WhatsApp bridge — you message GumballCMS → routes to Fisher2050
- Builds UI and websites — sits at the end of the content/design pipeline

#### Videohoho (already built, now placed in architecture)
- Electron desktop video editor (Status: Working, Phase 2 pending)
- Role: Andy (content) + Bird Fountain (assets) pipe output here for video production
- Location: C:\Users\mic\Downloads\Videohoho\
- Phase 2: ElevenLabs TTS, captions, audio ducking

---

### How PIA/SodaLabs Differs from Industry

| System | What It Lacks vs PIA/SodaLabs |
|---|---|
| CrewAI | No soul, no multi-machine, no identity, no scheduling |
| AutoGen | No personality, no self-hosting, no calendar dispatch |
| LangGraph | Developer tool only, no product layer |
| Claude Code native | Single machine, terminal only, no soul |
| Zapier/Make | Not intelligent, no memory, no personality |
| OpenAI Assistants | Cloud-only, no multi-machine, no soul |

**Unique differentiators:**
1. Soul-first architecture (identity before capability)
2. Multi-machine fleet on YOUR hardware
3. Calendar-triggered machine-agnostic ephemeral spawn
4. Tim Buc pipeline (session archiving → intelligence)
5. Digital Worker Identity (agents with email + channels)
6. Machine-as-project-orchestrator (dynamic role assignment)
7. SodaLabs eats its own cooking — runs agency on same system it sells

---

### New Files Created This Session

| File | What It Is |
|---|---|
| `public/pia-mindmap.html` | Interactive D3.js mind map — full PIA × SodaLabs architecture. Zoom/pan, click nodes for detail. Served at `/pia-mindmap.html` |

---

### Priority Build Order (Extracted from Session)

| # | What to Build | Why First |
|---|---|---|
| 1 | **Fisher2050 Agent Spec** | He activates all others — without him nothing is schedulable |
| 2 | **Agent Records DB** (Claude SDK log capture) | Tim Buc needs this to exist before he can file anything |
| 3 | **Tim Buc** (event-triggered archivist) | Enables Eliyahu's intelligence pipeline |
| 4 | **Calendar-triggered spawn** | Replaces manual agent launching, enables all scheduled agents |
| 5 | **Messaging system** (email per agent + channels) | Digital worker identity — makes agents feel like real team members |
| 6 | **Owl persistence layer** | Session continuity — "update me where we left off" |
| 7 | **Context % bar on agent cards** | Core observability (SDK already exposes it) |

---

### Desktop App Impact
All new concepts are additive — no breaking changes to existing PIA code. React UI will need:
- Agent Spec editor (soul + responsibilities form per agent)
- Messaging inbox view (agent emails + channels)
- Calendar view (Fisher2050's schedule of agent tasks)
- Activity feed with AI narration (non-technical briefing screen)

---

## Session 5: Storyboard + Queue System + Coder Machine + Parallel Agent Wave

### Context
Continuation of Session 4 planning. Storyboard completed, then 4 parallel sub-agents launched to work concurrently while controller handles journaling. User confirmed pia-diagram.html needs updating and wants document ecosystem indexed.

---

### New Concepts Defined This Session

#### Queue System / Producer-Consumer Pattern
- **Fisher2050 = Producer** — creates jobs, puts them on the queue
- **Specialist agents = Consumers** — pick up jobs when their machine slot is available
- **Job structure**: `{ id, type, agent, machine, status: queued/running/done/failed/revision, priority, ETA, requester, context_file }`
- **Fisher owns the queue**: adds jobs, reorders by priority, reassigns if machine offline
- **Technical name**: Producer-Consumer Pattern / Task Queue / Job Scheduler
- Shown visually in pia-storyboard.html as live queue panel (11 jobs across Club X launch project)

#### Coder Machine (Dedicated Build Agent)
- A dedicated machine/agent whose only job is writing and running code
- Always running, always ready for build jobs
- Has its own build job queue (separate from general task queue)
- Fisher2050 schedules coding tasks → lands in coder machine's queue
- **Technical names**: Dedicated Build Agent / CI/CD Runner / Build Server
- NOT M3 — it's a specialised compute node

#### GumballCMS in Pipeline (finalised placement)
- Sits at END of all creative pipelines
- Andy (editorial) → GumballCMS (publish)
- Bird Fountain (assets) → GumballCMS (website/WhatsApp)
- Wingspan (presentations) → GumballCMS (deck delivery)
- Videohoho → GumballCMS (video publish to WhatsApp Status)
- GumballCMS also acts as **inbound**: WhatsApp → GumballCMS → Fisher2050 (your instructions become tasks)

#### Document Storage and Management
- All agent-produced files need a structured store
- Structure: `{project}/{agent}/{date}/{output_type}.{ext}`
- Tim Buc responsible for filing; Eliyahu responsible for reading
- Need an index/search layer so agents can find previous work

---

### New Files Created This Session

| File | What It Is |
|---|---|
| `public/pia-storyboard.html` | 15-scene interactive storyboard — Club X venue launch. All agents shown working, speech bubbles, live queue panel, auto-play (4s), keyboard nav (arrows/space), cost tracker, progress bar. Served at `/pia-storyboard.html` |
| `public/d3.min.js` | D3 v7 minified (279KB), downloaded locally from jsDelivr. Required because PIA CSP blocks external CDN scripts. |
| `research/MASTER_VISION.md` | Comprehensive 500+ line vision document — full system diagram, every agent spec (11 agents), 5 architectural patterns, intelligence pipeline, messaging system, scheduling, build order, open questions |

---

### Parallel Agent Wave (This Session)

Controller spawned 4 background agents to work simultaneously:

| Agent | Task | Output File |
|---|---|---|
| **Site Map + Build List** | Create `SITE_MAP.md` + `research/BUILD_LIST.md` | Ordered build list for entire system |
| **Agent Product Sheets** | Create `research/AGENT_PRODUCT_SHEETS.md` | One spec per agent (soul, trigger, inputs, outputs, training notes) |
| **pia-diagram.html + KB update** | Add new ecosystem section to pia-diagram.html + update `PIA_KNOWLEDGE_BASE.md` | Updated HTML + KB |
| **Document Index + Style Analysis** | Index all docs in InvestorDome/sodalabs/sodaworld + create `research/DOCUMENT_INDEX.md` + `research/USER_WORKING_STYLE.md` | Style analysis for agent training |

**Pattern used**: Controller stays as orchestrator; delegates research/writing to parallel agents; journals while they work.

---

### Key Insights (Controller's Notes)

1. **This conversation IS a spec** — every dialogue session produces architecture. The system that journals these sessions and makes them searchable is itself a product.

2. **The Queue is the brain of operations** — if Fisher2050 owns a live queue that every agent reads from, you don't need to manually dispatch anything. The queue becomes the operating system.

3. **Tim Buc unlocks all intelligence** — without session archiving (Tim Buc's job), Eliyahu has nothing to synthesize, briefings are generic, and the system has no memory. Tim Buc is the foundation of the intelligence pipeline.

4. **pia-storyboard.html is a sales tool** — a 15-scene visual walkthrough of an agent-run project launch is exactly what you show investors and clients to explain what PIA does.

5. **GumballCMS as inbound channel** — using GumballCMS as a WhatsApp bridge means you can manage your entire agent fleet from your phone. Text Fisher2050 on WhatsApp, he creates the task. This is the killer UX.

---

### Updated Priority Build Order

| # | What to Build | Depends On |
|---|---|---|
| 1 | **Fisher2050 Agent Spec** (complete soul + automation profile) | Nothing |
| 2 | **Agent Records DB** (extend SQLite with session_logs table) | Fisher2050 spec |
| 3 | **Tim Buc** (event-triggered session log archivist) | Records DB |
| 4 | **Owl** (persistent task list, session continuity) | Tim Buc |
| 5 | **Calendar-triggered ephemeral spawn** | Fisher2050 + PIA hub |
| 6 | **Queue System** (jobs table, status tracking UI) | Fisher2050 |
| 7 | **Messaging system** (agent email + WebSocket channels) | PIA hub |
| 8 | **Monitor Agent** (push-based status broadcaster) | All agents |
| 9 | **Context % bar on agent cards** | SDK already exposes it |
| 10 | **GumballCMS WhatsApp bridge** (inbound to Fisher2050) | Messaging system |
| 11 | **Coder Machine** (dedicated build agent always on) | Queue system |
| 12 | **Document storage layer** (files from agents, indexed) | Tim Buc |

---

### New Files (Complete List — Sessions 4 + 5 combined)

| File | Created | Notes |
|---|---|---|
| `public/pia-plan.html` | Session 2 | Visual planning doc (pizza analogy) |
| `public/pia-diagram.html` | Session 2 | Architecture: Now vs After + full to-do |
| `public/pia-mindmap.html` | Session 4 | Interactive D3.js mind map — full architecture |
| `public/d3.min.js` | Session 4 | Local D3 v7 (CSP fix) |
| `public/pia-storyboard.html` | Session 5 | 15-scene Club X project storyboard |
| `research/MASTER_VISION.md` | Session 4 | Comprehensive vision + all agent specs |
| `research/ORCHESTRATOR-AGENT-VIDEO-SYNTHESIS.md` | Session 3 | Orchestrator video synthesis |
| `research/CLAUDE-CODE-MULTI-AGENT-NATIVE-SYNTHESIS.md` | Session 3 | Native multi-agent tools synthesis |

---

### Desktop App Impact
New HTML pages (mindmap, storyboard) are standalone visualizations — no backend changes. Queue system will need a new `jobs` table in SQLite + queue management API routes. React UI will need queue panel component.

---

## Session 5 Addendum: Late-Session Concepts (journaled in-flight)

---

## Session 6: Codebase Audit — Far More Already Built Than We Knew

### Critical Discovery
The codebase has substantial infrastructure already built that wasn't reflected in the planning sessions. This changes the build order significantly.

### What Already Exists (Not Known Before This Session)

| Path | What It Is | Status |
|---|---|---|
| `src/souls/soul-engine.ts` | Full SoulEngine class — loads souls from DB, injects into system prompt, saves memories | **BUILT** |
| `src/souls/memory-manager.ts` | Memory management for agents | **BUILT** |
| `src/souls/seed-souls.ts` | Pre-seeded soul definitions | **BUILT** |
| `src/souls/personalities/` | Personality files per agent | **BUILT** |
| `src/orchestrator/task-queue.ts` | Full TaskQueue class — priority queue, pending→in_progress→completed/failed, blocked_by, blocks, output | **BUILT** |
| `src/orchestrator/execution-engine.ts` | Execution engine | **BUILT** |
| `src/orchestrator/autonomous-worker.ts` | Autonomous worker | **BUILT** |
| `src/orchestrator/heartbeat.ts` | Heartbeat monitoring | **BUILT** |
| `src/comms/agent-bus.ts` | Inter-agent communication bus | **BUILT** |
| `src/comms/cross-machine.ts` | Cross-machine communication | **BUILT** |
| `src/comms/whatsapp-bot.ts` | WhatsApp bot integration | **BUILT** |
| `src/comms/discord-bot.ts` | Discord bot | **BUILT** |
| `src/comms/mqtt-broker.ts` | MQTT message broker | **BUILT** |
| `src/api/routes/tasks.ts` | Tasks REST API | **BUILT** |
| `src/api/routes/souls.ts` | Souls REST API | **BUILT** |
| `src/api/routes/messages.ts` | Agent messages API | **BUILT** |
| `src/api/routes/work-sessions.ts` | Work sessions API | **BUILT** |
| `src/api/routes/webhooks.ts` | Webhooks API | **BUILT** |
| `src/api/routes/whatsapp.ts` | WhatsApp API | **BUILT** |
| `fisher2050/` | Fisher2050 project manager app (separate sub-project) | **EXISTS** |

### Key Soul Schema (Already Implemented)
```typescript
interface Soul {
  id: string;
  name: string;
  role: string;
  personality: string;
  goals: string[];
  relationships: Record<string, string>;
  system_prompt: string | null;
  config: Record<string, unknown>;
  email: string | null;  // ← already has email field!
  status: 'active' | 'inactive' | 'archived';
}
```

### Key TaskQueue Schema (Already Implemented)
```typescript
interface TaskRecord {
  id: string;
  agent_id: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: number;  // 1-5
  blocked_by: string[] | null;
  blocks: string[] | null;
  output: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}
```

### Implication for Build Order
The "build Fisher2050 soul + task queue" items are NOT starting from scratch. We're wiring agents INTO existing infrastructure. Priority shifts to:
1. **Seed Fisher2050 soul** into existing `seed-souls.ts`
2. **Google Calendar integration** (no equivalent exists yet)
3. **Google OAuth + token storage** (no equivalent exists yet)
4. **Cron scheduler** for agent triggers (node-cron, may not exist yet)
5. **Agent inbox table** (DB: `agent_messages`) — check if it exists in migrations

### New Agents Spawned This Session

| Agent | Task | Output File |
|---|---|---|
| **Implementation Design** | Audit existing code + design Fisher2050/Calendar/Tasks practical spec | `research/IMPLEMENTATION_SPEC.md` |
| **Eliyahu End-of-Day + Query Pattern** | Design Eliyahu EOD review + answer "how does agent querying work?" | `research/ELIYAHU_END_OF_DAY_SPEC.md` |

### Critical Answer: How Does Agent Querying Work?
(Journaled for training all future agents)

Three scenarios:
1. **Agent IS running** → `POST /api/mc/agents/:id/respond` with `{ choice: "..." }` — synchronous reply via WebSocket
2. **Agent is NOT running** → Either: spawn it with question in initial prompt (ephemeral query), OR leave message in `agent_messages` DB table (async inbox)
3. **Cross-machine** → M1 proxies respond call to M2's IP — already built

**Core rule**: An agent is not a service endpoint. It's a process. Query it while running OR leave it a message for when it wakes.

### Pending: Sync Agent (Post All-Agent Completion)
Once all current agents finish, launch a **sync agent** to ensure:
- Everything in technical `.md` files is reflected in HTML pages (pia-diagram.html, pia-mindmap.html)
- Everything in HTML pages is reflected in `.md` knowledge base
- No knowledge lives in only one place

### Dedicated Browser/Testing Machine
- Worker dev machines can be armed with MCP servers + browser controller (Playwright MCP etc.)
- A dedicated **testing machine** — optimised for the best possible browser control
- This machine runs automated browser tests, visual regression, QA workflows
- It's the browser-native equivalent of the Coder Machine
- **Technical name**: Headless Browser Farm / Browser Automation Slave / QA Node
- Ziggi (quality agent) dispatches to this machine for automated quality checks
- Separate from general workers because browser control is resource-intensive + needs isolation

### Ziggi + Farcake QA Pattern (formalised)
Testing is a core loop, not an afterthought. Pattern:
```
Something is built
↓
Ziggi (devil's advocate) challenges it — questions assumptions, finds weaknesses
+ Farcake (deep research) searches:
  - Context7 (official library docs)
  - Influencer content (Mic's reference people)
  - Competitive landscape
  - Prior session records
↓
Combined verdict → quality score (1-10) + suggested improvements
↓
Fisher2050 either approves → deliver, OR creates re-do task → re-queues
```
This loop should run on EVERY build, not just final review.

### Influencer / Reference Research as First-Class Agent Tool
Farcake needs a curated list of Mic's influencers, references, and thought leaders.
When researching or reviewing, Farcake cross-checks against what these people have said.
This makes agent output contextually aligned with Mic's taste and philosophy.
**Action needed**: Create `research/INFLUENCER_INDEX.md` — Mic's reference people, their relevance, where to find their content.

### Building in Testing from the Start
Every agent that builds something should know:
- What "done" looks like (success criteria)
- Who reviews it (Ziggi)
- What research to cross-check (Farcake's search list)
- How to submit for QA (send to Ziggi queue)
This should be part of every **Agent Automation Profile** (the "SUCCESS CRITERIA" field).
- Machine status with dynamic role display (M2 = "Boss of Farcake")

---

## Session 6: Agent Product Sheets — Internal Bible

### Context
Sub-agent task: create `research/AGENT_PRODUCT_SHEETS.md` — the internal bible for every agent in the PIA × SodaLabs system. Sources: MASTER_VISION.md, SODALABS-CREATIVE-DECK.md, AGENCY-AGENTS-SALES-COPY.md, SESSION_JOURNAL_2026-02-20.md. Covered all 12 agents in the fleet.

---

### Changes

- **New file**: `research/AGENT_PRODUCT_SHEETS.md` — Complete internal product sheet for every agent: Controller, Fisher2050, Eliyahu, Ziggi, Tim Buc, Owl, Farcake, Andy, Bird Fountain, Wingspan, Monitor Agent, Coder Machine. Each sheet includes: role, type, machine assignment, soul system (all 7 layers), trigger, inputs, outputs, success criteria, and training notes.

---

### Files Changed

| File | Change |
|---|---|
| `research/AGENT_PRODUCT_SHEETS.md` | **NEW** — Internal bible for all 12 agents. Soul system, triggers, inputs, outputs, training notes per agent. |
| `SESSION_JOURNAL_2026-02-20.md` | Updated — Added Session 6 journal entry |

---

### Desktop App Impact
No backend changes. This is a documentation file. React UI could eventually render these product sheets as agent configuration screens in the settings panel — no immediate work required.

---

## Session 7: pia-diagram.html + PIA_KNOWLEDGE_BASE.md Updated

### Context
Sub-agent completed update of architecture diagram and master knowledge base to reflect all new agents and patterns from Sessions 4-6.

### Changes

- **Updated**: `public/pia-diagram.html` — New section `#ecosystem` added with:
  - Three-tier hierarchy (M1 Strategic → M2 Project Boss → M3 Execution) displayed as tier rows
  - All 12 agent cards with emoji, role, trigger, machine tags
  - 6 architectural pattern cards with code flow diagrams:
    - Calendar-Triggered Ephemeral Spawn
    - Records Pipeline (Intelligence Loop)
    - Queue / Producer-Consumer Pattern
    - Messaging System — Digital Worker Identity
    - Push-Based Monitoring (Observer Pattern)
    - Ephemeral Compute — Pay Only While Working
  - Full ASCII hierarchy diagram
  - Tools & platforms row (GumballCMS, Videohoho, Queue System)
  - New nav link `#ecosystem` added to sticky nav

- **Updated**: `PIA_KNOWLEDGE_BASE.md`:
  - Section 1: 10 new terms added (Tim Buc, Ephemeral Agent, Calendar-Triggered Spawn, Agent Records, Soul System, Agent Automation Profile, Queue System, Producer-Consumer Pattern, Coder Machine, Dark Factory)
  - Section 4: 3 new working capabilities (pia-diagram, pia-mindmap, pia-storyboard)
  - Section 5: 9 new high-priority build items (B1–B9, Feb 2026 from MASTER_VISION.md build order)

### Files Changed

| File | Change |
|---|---|
| `public/pia-diagram.html` | Added `#ecosystem` section — full agent hierarchy, patterns, tools |
| `PIA_KNOWLEDGE_BASE.md` | Added 10 terms, 3 capabilities, 9 build items |

### Desktop App Impact
New pia-diagram section is documentation only. React UI will eventually need: Agent Spec editor, tier hierarchy view, pattern library screen. All additive.

---

## Session 8: SITE_MAP.md + BUILD_LIST.md Created

### Context
Sub-agent audited every source file in the codebase to produce the complete system site map and master build list.

### Changes

- **New file**: `SITE_MAP.md` — Complete system inventory:
  - **31 HTML pages** — every `/public/*.html` with route, title, purpose
  - **All API routes** — every REST endpoint across 33 route files, grouped by prefix
  - **37 WebSocket events** — 20 inbound (client→server) + 17 outbound (server→client) — this is the live contract for any future React UI
  - **Agent architecture** — machine fleet (M1/M2/M3 with Tailscale IPs), agent hierarchy, spawn modes (sdk/pty/api), approval modes (auto/manual/yolo/plan)
  - **30+ SQLite tables** — every data store with purpose

- **New file**: `research/BUILD_LIST.md` — 53-item master build list across 7 priorities:
  - **P1 Foundation** (8 items): Fisher2050 spec, Agent Records DB, Owl persistence, Tim Buc, PM2, API key rotation, File API auth
  - **P2 Agent Intelligence** (9 items): Calendar spawn, Monitor, Eliyahu, all automation profiles, Ziggi, Controller, Farcake, Andy, Activity Feed
  - **P3 Communications** (5 items): Email outbound/inbound, WebSocket channels, WhatsApp bridge, send_message tool
  - **P4 UI Improvements** (9 items): Git branch display, worktrees, mobile dashboard, fleet dashboard, MQTT telemetry, version detection
  - **P5 Platform Integrations** (7 items): GumballCMS output + WhatsApp bridge, Videohoho Phase 2, document storage, Coder Machine, Bird Fountain pipeline
  - **P6 Automation** (6 items): Producer-consumer queue, fleet self-update, hub failover, standup emails, agent failsafe rules, weekly review
  - **P7 Desktop App** (9 items): Electron Phase 4, React scaffolding, all UI screens, packaging, tray, NSIS installer
  - Includes dependency graph + "Quick Wins" table

### Files Changed

| File | Change |
|---|---|
| `SITE_MAP.md` | **NEW** — Complete system site map (HTML, API, WebSocket, DB, agents) |
| `research/BUILD_LIST.md` | **NEW** — 53-item master build list across 7 priority tiers |

### Key Finding
WebSocket events are the live contract between Express backend and future React UI. The SITE_MAP.md documents all 37 events — this is essential for the React migration.

### Desktop App Impact
SITE_MAP.md is the blueprint for the React UI component map. BUILD_LIST.md P7 is the full Electron packaging plan. Both are critical planning documents for the desktop app build.

---

## Session 9: Document Ecosystem Index + User Working Style Analysis

### Context
Sub-agent explored 200+ documents across InvestorDome, sodalabs, sodaworld, and pia-system/research to build a complete document index and deep working style analysis for agent training.

### Documents Discovered
| Location | Count | Notable Files |
|---|---|---|
| `Downloads/` root .md files | 56 | Strategy, product guides, Soda World docs |
| `InvestorDome/` | 40+ | Pitch clarity, investor thesis, meeting journals (Robbie Brozin, CVVC) |
| `sodalabs/` | 50+ | Sodacast product bible, ideas canvas, course philosophy |
| `sodaworld/` | 60+ | BMAD framework agents, agentdash system, DAO docs |
| `pia-system/research/` | 9 | All synthesis files created this session |

### Methodology Frameworks Identified
All referenced across Mic's documents — essential for agent training:
| Framework | Source | Application |
|---|---|---|
| **Taoism** | "Tao of Soda" | Flow, naturalness, non-forcing |
| **Alchemy / Rory Sutherland** | Multiple docs | Reframing value, perception over reality |
| **Hooked / Nir Eyal** | Sodalabs courses | Habit-forming product design |
| **Design Thinking / IDEO** | Workshop docs | Human-centered process |
| **Positive Psychology / Seligman** | Culture docs | Wellbeing-first culture design |
| **Yuk Hui Cosmotechnics** | Cultural tech docs | African/non-Western technology philosophy |
| **PIE Model** | Product docs | Phygital integration |
| **Ubuntu** | Cultural docs | "I am because we are" — community technology |
| **DAO/Web3** | DAO docs | Decentralised ownership, token economy |

### Key Agent Training Rules Extracted (CRITICAL)
These rules apply to EVERY agent in the fleet:

| Rule | What It Means |
|---|---|
| **Lead with the answer** | Conclusion first, reasoning after. Never bury the lead. |
| **3-item briefings** | Cap at 3 key points. Never dump. |
| **Anti-sycophancy** | Push back to earn trust. Mic calls this the "Dafka Gene." Validation without substance is disrespectful. |
| **Never re-explain** | Assume Mic knows the context. Skip preamble and intros. |
| **Time-sensitive first** | Deadlines and blockers before ideas and plans. |
| **Use analogies** | Mic thinks in systems AND narrative. Analogies are the primary cognitive bridge. |
| **Anti-extraction** | Non-negotiable value position. Never frame technology as extracting from community. |
| **25-year horizon, sprint urgency** | Think long, act fast. Strategic patience + tactical speed. |

### Key People in Mic's Network
Robbie Brozin (Nando's founder), Avishai Cohen (musician), Carlo Mombelli, Teddy Blatcher, CVVC/Brenton (investor lead)

### New Files Created

| File | What's In It |
|---|---|
| `research/DOCUMENT_INDEX.md` | 7-section index of 200+ documents with path, description, key content |
| `research/USER_WORKING_STYLE.md` | 8-section deep analysis — thinking style, communication, philosophy, visual preferences, methodology, agent-specific training rules |

### Files Changed

| File | Change |
|---|---|
| `research/DOCUMENT_INDEX.md` | **NEW** — Complete document ecosystem map (285 lines) |
| `research/USER_WORKING_STYLE.md` | **NEW** — Agent training rules + working style analysis (284 lines) |
| `memory/MEMORY.md` | Updated — Added Mic's communication rules + methodology frameworks to persistent agent memory |

### Desktop App Impact
USER_WORKING_STYLE.md should be injected into every agent's system_prompt as a training context block. It's the "how to work with Mic" guide that makes agents feel like they understand him. High-value addition to all agent soul definitions.

---

## Session 10: ELIYAHU_END_OF_DAY_SPEC.md + Async Agent Query Pattern

### Context
Sub-agent read the full comms layer (agent-bus.ts, cross-machine.ts, messages.ts) and designed the complete Eliyahu End-of-Day agent spec plus answered the critical architectural question about async agent querying.

### Key Answer: How Does Agent Querying Work?

**Three scenarios (permanent architectural record):**

1. **Agent IS running** → `POST /api/mc/agents/:id/respond { choice: "..." }` → synchronous reply via WebSocket. Works cross-machine (M1 proxies to M2 IP).

2. **Agent is NOT running** → Two options:
   - **Spawn-and-query**: Spawn it fresh with the question in the initial prompt. It answers and terminates. Best for one-off questions.
   - **Inbox pattern**: Write to `agent_messages` table (to_agent, from_agent, body). Next time agent wakes, SoulEngine reads unread inbox and injects into context. Async — don't wait for reply.

3. **Cross-machine query** → Already works. M1 proxies `respond` calls to `http://M2-IP:3000/api/mc/agents/:id/respond`.

**Core rule (permanent):** An agent is not a service endpoint. It's a process. Query it while running OR leave it a message for when it next wakes.

### New File: ELIYAHU_END_OF_DAY_SPEC.md

Full spec for the Eliyahu End-of-Day agent:

**Trigger**: 10pm cron

**Eliyahu's 9-step EOD loop:**
1. Read all tasks completed today
2. Read all agent session records (Tim Buc filings)
3. Read unread inbox messages
4. Read Fisher2050's standup summary
5. Analyse: done vs planned, quality issues, blockers, cost
6. Query agents if needed (running → respond; sleeping → inbox message)
7. Write EOD report → `reports/YYYY-MM-DD-eod.md`
8. Write tomorrow's briefing draft
9. Send notification to Fisher2050's inbox

**New DB table designed:** `agent_messages`
```sql
CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  to_agent TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  reply_body TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  read_at INTEGER
);
```

**10-step practical build order:**
1. `src/db/migrations/043_agent_messages.ts`
2. Modify `soul-engine.ts` — loadSoul() reads inbox, appends to context
3. `src/souls/personalities/eliyahu.ts` — full soul definition
4. `src/services/scheduler.ts` — cron-based agent trigger (node-cron)
5. `src/api/routes/agent-messages.ts` — inbox API
6. `src/api/routes/reports.ts` — write/read EOD reports
7. Modify `src/index.ts` — start scheduler on boot
8. Create Eliyahu task template (context loaded on every spawn)
9. Connect to Tim Buc (reads filings from Records DB)
10. Connect notification to Fisher2050 inbox

### Files Changed

| File | Change |
|---|---|
| `research/ELIYAHU_END_OF_DAY_SPEC.md` | **NEW** — Full Eliyahu EOD spec, async query pattern, agent_messages table, 10-step build order |
| `FILE_INDEX.md` | Updated by agent — ELIYAHU_END_OF_DAY_SPEC.md added to Research section |

### Desktop App Impact
`agent_messages` table = foundation for the React UI inbox view. EOD reports = new API route React UI subscribes to. Scheduler triggers = React UI needs a "Schedule" settings screen. All additive.

---

## Session 11: pia-diagram.html — Kids, After, and Comparison Sections Updated

### Context
Sub-agent sync task: update `public/pia-diagram.html` to reflect all new knowledge from Sessions 1–10. Sources: MASTER_VISION.md, SESSION_JOURNAL_2026-02-20.md. Sections `id="todo"` and `id="ecosystem"` were NOT touched (handled by other agents).

---

### Changes

- **Updated**: `public/pia-diagram.html` — `id="kids"` section rewritten entirely:
  - New title: "PIA is a Pizza Shop!"
  - Uses the Pizza Shop analogy consistently (established in pia-plan.html)
  - "The Big Idea" story walks through Controller, Fisher2050, Eliyahu, Ziggi, Tim Buc, Owl with pizza metaphors
  - "Meet the Kitchen Team" cast: Farcake, Andy, Bird Fountain, Wingspan, Monitor, Coder Machine
  - "The Three Buildings" cast: M1 (main restaurant), M2 (production kitchen), M3 (delivery centre)
  - "Special Tools" section: GumballCMS (delivery service), Queue System (order board)
  - "How One Job Gets Done" step-by-step: WhatsApp order → Fisher schedules → Farcake researches → Andy writes → Ziggi scores → Tim Buc files
  - "Cool Facts" updated: soul system, ephemeral agents, WhatsApp-from-phone, StrongDM dark factory

- **Updated**: `public/pia-diagram.html` — `id="after"` section updated:
  - Section title changed to "What We're Adding — Full Build Roadmap"
  - Dashboard panel: added Queue panel, agent inbox, Electron React UI as new additions
  - M1 Hub panel: now shows existing infrastructure (soul-engine.ts, task-queue.ts, agent-bus.ts) PLUS new items: Fisher2050 soul, Tim Buc, Eliyahu EOD, Monitor Agent, Google Calendar, agent_messages, output relay
  - M2 panel: added GumballCMS WhatsApp bridge, Coder Machine + Browser/QA Machine
  - Right panel split into 3 flow groups: Dashboard & Output Relay, Agent Intelligence Pipeline (Fisher2050/Tim Buc/Eliyahu/Monitor), Scheduling & Comms (Calendar/Queue/WhatsApp bridge)
  - Yellow callout updated: "Most infrastructure already exists — wiring agents INTO it, not starting from scratch"

- **Updated**: `public/pia-diagram.html` — `id="comparison"` table: added 6 new rows:
  - Queue system (producer-consumer) — partial now, wired to Fisher after
  - Soul system with email identity — partial now (SoulEngine built, not seeded), full after
  - Calendar-triggered ephemeral spawn — none now, Google Calendar after
  - Multi-machine fleet on your hardware — M1+M2 now, M1+M2+M3 after
  - WhatsApp bridge inbound (GumballCMS) — none now, text Fisher2050 after
  - Tim Buc intelligence pipeline — none now, full Session→TimBuc→Records→Eliyahu after

---

### Files Changed

| File | Change |
|---|---|
| `public/pia-diagram.html` | Updated `id="kids"` (pizza shop rewrite), `id="after"` (full roadmap with new agents), `id="comparison"` (6 new differentiator rows) |

### Desktop App Impact
No backend changes. pia-diagram.html is documentation only. The new comparison rows document differentiators the React UI will need to surface in an "About PIA" or investor-facing screen.

---

## Session 11: Mindmap Fully Rebuilt — 25 Nodes Live

### Context
Mindmap rebuild agent completed. pia-mindmap.html now reflects the full system including all new agents, infrastructure, and pipelines discovered this session.

### What's Now on the Mindmap (25 nodes total)

**Original 17 (kept + updated):**
You, Controller, Monitor, Owl, Eliyahu, Fisher2050, Ziggi, Tim Buc, Agent Records, Farcake, Andy, Bird Fountain, Wingspan, Videohoho, M1, M2, M3

**8 New Nodes Added:**
| Node | Type | Zone |
|---|---|---|
| GumballCMS | Tool | Tools & Platforms |
| Queue System | Data | Management Layer |
| Google Calendar | Tool | Tools & Platforms |
| WhatsApp | Tool | Tools & Platforms |
| Soul Engine | Data | Infrastructure (Built) |
| Comms Layer | Data | Infrastructure (Built) |
| Coder Machine | Machine | Physical Machines |
| Browser / QA | Machine | Physical Machines |

**6 Zones (updated):**
- MEMORY & RECORDS (purple)
- MANAGEMENT LAYER (blue)
- SPECIALIST WORKFORCE (green)
- TOOLS & PLATFORMS (cyan) — NEW
- INFRASTRUCTURE (BUILT) (purple) — NEW
- PHYSICAL MACHINES (grey) — expanded

**New connections added:**
- Fisher → Queue → all specialists (producer-consumer)
- Andy/Bird Fountain/Wingspan/Videohoho → GumballCMS (output pipeline)
- WhatsApp → GumballCMS → Fisher (inbound channel)
- Fisher → Google Calendar → Controller (triggers spawn)
- Ziggi → Browser/QA Machine + Farcake (QA loop)
- Soul Engine → Controller/Fisher (loads soul on wake)
- Comms Layer → M1 (infrastructure)

**Legend updated:** New "Built ⚡" entry for already-built infrastructure nodes

### Visual Verification (Screenshot)
Screenshot confirmed at http://localhost:3000/pia-mindmap.html:
- All 25 nodes visible with correct colors and zone membership
- All 6 zones labelled
- All pipeline connections drawn with directional arrows
- Hover/click/zoom/pan all working
- Detail panel opens on node click

### Files Changed

| File | Change |
|---|---|
| `public/pia-mindmap.html` | **REBUILT** — 25 nodes, 6 zones, full pipeline connections, new legend entry |

### Desktop App Impact
Mindmap is a standalone HTML visualization — no backend changes. Could be embedded in the React UI as a live system view panel. Interactive node click → agent detail card matches the React component pattern.

---

## Session N: Implementation Spec — Fisher2050, Google Calendar, Google Tasks

### Context
Sub-agent audit session. Read and analyzed 15+ source files across the PIA codebase + fisher2050/ standalone app. Produced a practical implementation spec as a builder's blueprint.

### Changes

- **New file**: `research/IMPLEMENTATION_SPEC.md` — complete implementation spec with TypeScript interfaces, DB schemas, API signatures, and ordered build steps for Fisher2050 integration + Google Calendar + Google Tasks

### Audit Findings

**What's already built and working:**
- Soul system: `soul-engine.ts`, `seed-souls.ts`, all 3 personality JSON files, souls REST API, DB migration 003
- Task queue: `task-queue.ts` with full priority/dependency system, tasks REST API
- Autonomous worker: `autonomous-worker.ts` full Claude API tool loop with soul injection
- Agent bus: `agent-bus.ts` in-memory pub/sub
- Fisher2050 standalone app (`fisher2050/`): cron scheduler (node-cron), PIA REST client, daily review logic, own SQLite DB
- Fisher2050 soul JSON: complete with personality, goals, relationships, config (schedule times)

**Critical gaps identified:**
- Fisher2050 runs as a **separate process** (port 3002) with its own disconnected DB — needs merging into PIA main process
- Google integration: zero implementation — no OAuth routes, no token storage, no calendar_events table
- `PATCH /api/tasks/:id` endpoint missing (only complete/fail/assign exist)
- FisherService not wired into `src/index.ts` — cron scheduling not active in main PIA server
- `calendar_events` table does not exist — the CalendarWatcher has no data to poll
- `integrations` table does not exist — no OAuth token storage

### New Files Designed (not yet created — spec only)

| File | Purpose |
|------|---------|
| `src/services/fisher-service.ts` | FisherService — cron + task completion hooks inside PIA main process |
| `src/services/calendar-watcher.ts` | CalendarWatcher — polls Google Calendar, triggers agent spawns |
| `src/services/google-tasks-sync.ts` | GoogleTasksSync — one-way PIA tasks → Google Tasks mirror |
| `src/api/routes/integrations.ts` | OAuth flow + calendar events + tasks sync REST endpoints |
| `src/api/routes/fisher.ts` | Fisher2050 on-demand run + status endpoints |

### New Endpoints Designed (spec only — not yet implemented)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/integrations/google/auth` | Start Google OAuth |
| `GET` | `/api/integrations/google/callback` | OAuth callback |
| `GET` | `/api/integrations/google/status` | Connection status |
| `POST` | `/api/integrations/google/calendar/events` | Create calendar event |
| `GET` | `/api/integrations/google/calendar/events` | List calendar events |
| `POST` | `/api/integrations/google/tasks/sync` | Sync tasks to Google Tasks |
| `POST` | `/api/fisher/run` | Run Fisher2050 on-demand |
| `PATCH` | `/api/tasks/:id` | Partial task update |

### New DB Tables Designed (migration 044 — not yet applied)

- `integrations` — OAuth token storage (access_token, refresh_token, expiry, google_email)
- `calendar_events` — bridge table: Google Calendar ↔ PIA agent spawns (start_time, agent_soul_id, task_context, status)
- `task_google_sync` — PIA task ID ↔ Google Task ID mapping for idempotent sync

### Key Architectural Decision in Spec

Fisher2050 should be **merged into PIA's main process** as a service (`FisherService`), not kept as a separate app. The sidecar pattern creates two disconnected databases and two separate schedulers. The spec designs `FisherService` to run inside `startHub()` alongside Doctor, Heartbeat, and The Cortex.

### Desktop App Impact
No runtime changes made this session (spec only). When implemented: new env vars `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` needed. Settings screen should expose Google integration connect/disconnect. CalendarWatcher and FisherService are background services — no new WebSocket events needed beyond existing `task_started`/`task_completed` patterns.

---

## Session 12: AGENT_PRODUCT_SHEETS.md — Final Version (848 lines)

### Context
Second pass by sub-agent on the product sheets — this produced the definitive version at 848 lines covering all 12 agents with complete soul system tables, cross-agent interaction map, and build status summary.

### Key Contents
- 12 complete agent specs (Controller, Fisher2050, Eliyahu, Ziggi, Tim Buc, Owl, Farcake, Andy, Bird Fountain, Wingspan, Monitor, Coder Machine)
- Every agent has: 30-second pitch, soul system table (7 layers), trigger, inputs, outputs, success criteria, training notes
- Cross-Agent Reference section: interaction map diagram, machine assignment table, communication addresses
- Build status table: live vs building vs spec-complete per agent

### Critical Architecture Notes (from this audit)
- **Owl is NOT an AI agent** — it's a DB layer (SQLite). The "update me where we left off" function is a DB read, not an agent conversation.
- **Tim Buc is the pipeline foundation** — without Tim Buc filing session records, Eliyahu has nothing to synthesize. Build Tim Buc before Eliyahu.
- **Fisher2050 already runs as separate app** (confirmed by Implementation Spec, Session N) — needs merging into main PIA process.

### Files Changed
| File | Change |
|---|---|
| `research/AGENT_PRODUCT_SHEETS.md` | **FINAL VERSION** — 848 lines, all 12 agents, cross-agent reference map, build status |

---

## Session 10 Addendum: Critical Clarifications from Full Eliyahu Spec

### AgentBus vs agent_messages — They Are Different Tools
(Definitive answer from reading agent-bus.ts source code)

| Tool | What It Is | When To Use |
|---|---|---|
| `AgentBus` | **In-memory pub/sub only** | Real-time events between agents that are BOTH running right now |
| `agent_messages` table | **Persistent async inbox** | Leave a message for an agent to read when it next wakes |

**Critical:** AgentBus messages are **lost on restart**. If M1 reboots, any in-flight AgentBus messages are gone. Only `agent_messages` table survives.

### Cross-Machine Proxy Already Exists
The respond proxy for cross-machine agent querying already exists in `mission-control.ts` around **line 746**. It transparently detects which machine owns the session and forwards the POST there. This is already working infrastructure.

### SoulEngine Inbox Injection
The `agent_messages` inbox should be injected into `SoulEngine.generateSystemPrompt()`. When any agent wakes, it automatically sees its unread messages as context with reply instructions embedded. This is one file modification after the `agent_messages` table is created.

### node-cron is Safe for Electron
`node-cron` (for the 10pm Eliyahu trigger) is **pure JS, no native addons** — fully safe for Electron packaging. No build complications.

---

## Session 13: Repository Discovery — Code Is Everywhere

### Context
User flagged that code exists across multiple repositories and standalone apps — much more than what PIA system knows about. Scout agent launched to map the complete ecosystem. Key mention: "Sheba" — an unknown app that needs identifying.

### What Was Found (Initial Scan)

**GitHub remote:** `https://github.com/Sodaworld2/pia-system` — PIA has a GitHub remote. Other repos in the Sodaworld2 org are unknown (scout will check).

**Standalone Agent Apps (already exist as separate codebases):**

| App | Location | What It Likely Is |
|---|---|---|
| `Farcake2025/` | `Downloads/` | Standalone Farcake research agent |
| `BirdfountainNov/` | `Downloads/` | Standalone Bird Fountain design agent |
| `sheba/` | `Downloads/` | **Unknown — user flagged specifically** |
| `SmartAgent/` | `Downloads/` | Unknown AI agent app |
| `Videohoho/` | `Downloads/` | Electron video editor (known, working) |
| `sodalabs/andy/` | `sodalabs/` | Andy editorial agent (sodalabs version) |
| `sodalabs/bird-fountain/` | `sodalabs/` | Bird Fountain (sodalabs version) |
| `sodalabs/farcake/` | `sodalabs/` | Farcake (sodalabs version) |
| `sodalabs/bots/` | `sodalabs/` | Bots collection |
| `sodalabs/GumballCMS/` | `sodalabs/` | GumballCMS (full platform codebase) |
| `sodalabs/explore/` | `sodalabs/` | Explorer tool |
| `sodalabs/sodacast/` | `sodalabs/` | Sodacast platform |
| `sodalabs/sodacolab/` | `sodalabs/` | Collaboration tool |
| `sodalabs/soda-academy/` | `sodalabs/` | Learning platform |
| `fisher2050/` | `pia-system/` | Fisher2050 (port 3002, own SQLite — already known) |

**Other Platform Apps:**

| App | Location | What It Likely Is |
|---|---|---|
| `Sodacast/` | `Downloads/` | Podcast/audio platform |
| `SodaRoid/` | `Downloads/` | Unknown |
| `SodaStubsv2/` | `Downloads/` | Unknown (v2 of something) |
| `sodastudio/` | `Downloads/` | Studio management app |
| `sodaworld-ticketing-mvp/` | `Downloads/` | Ticketing system MVP |
| `Video-kiosk-2-/` | `Downloads/` | Video kiosk (version 2) |
| `InvestorDome/` | `Downloads/` | Investor platform (has journals + research) |
| `agent_instructions/` | `Downloads/` | Agent instruction files |

**Also found:** `sodalabs/` has its own `CLAUDE.md` — the SodaLabs platform has its own Claude AI instructions. This is a parallel AI development track.

### Why This Matters for PIA

1. **Multiple versions of each agent exist** — `sodalabs/farcake/` vs `Downloads/Farcake2025/` vs `pia-system/fisher2050/farcake` (if it exists). Need to identify which version is most current and consolidate.

2. **GumballCMS is a full codebase** in `sodalabs/GumballCMS/` — not just a planned integration. The WhatsApp bridge may already be implemented.

3. **Sheba is unknown** — could be a key agent or platform that feeds into PIA. Need to investigate.

4. **SmartAgent** — could be a predecessor to PIA's agent system.

5. **sodalabs/ has its own CLAUDE.md** — there are TWO parallel AI agent development tracks (PIA system + SodaLabs platform). These need to be unified or clearly separated.

### Outputs Being Created by Scout Agent

| File | Contents |
|---|---|
| `research/CODE_REPOSITORY_MAP.md` | Complete map of all repos — stack, status, relation to PIA |
| `research/TERMINAL_SEARCH_BRIEFING.md` | **Self-contained briefing for a fresh terminal** to do deep code search + produce unification plan |

### Recommended Next Action (Once Scout Returns)
Open a NEW Claude terminal and paste `TERMINAL_SEARCH_BRIEFING.md` as the first prompt. That terminal does deep grep/audit work across all repos. This terminal stays as controller.

### 10-Step Build Order (Precise)
| Step | File | What |
|---|---|---|
| 1 | `src/db/database.ts` | Migration 044: `agent_messages` table |
| 2 | `src/db/queries/agent-messages.ts` | CRUD: sendAgentMessage, getInbox, markRead, sendReply |
| 3 | `src/api/routes/agent-messages.ts` | REST: GET inbox, POST message, POST reply |
| 4 | `src/souls/soul-engine.ts` | Inject unread messages into generateSystemPrompt() |
| 5 | `src/souls/personalities/eliyahu.json` | Updated soul with EOD 10-step system_prompt |
| 6 | `src/services/scheduler.ts` | node-cron: `0 22 * * *` → spawnEliyahuEOD() |
| 7 | `src/index.ts` | initScheduler() in startHub() only |
| 8 | `src/config.ts` | SCHEDULER_ENABLED, SCHEDULER_TIMEZONE env vars |
| 9 | `reports/.gitkeep` | Create output dir, gitignore generated reports |
| 10 | Journal | Log changes |

---

## Session 14: IMPLEMENTATION_SPEC.md — Fisher2050 + Google Calendar + Tasks

### Critical Audit Findings

| Component | Status | Key Finding |
|---|---|---|
| Soul System | ✅ BUILT | `soul-engine.ts` fully functional. Fisher2050 soul JSON complete with `dailyReviewTime: "09:00"`, `eveningSummaryTime: "18:00"` config. |
| Task Queue | ✅ BUILT | `task-queue.ts` — priority, blocking, full REST API. Missing only: `PATCH /api/tasks/:id`. |
| Autonomous Worker | ✅ BUILT | `autonomous-worker.ts` — full Claude tool loop with soul injection. |
| Fisher2050 Standalone | ⚠️ ISOLATED | Port 3002, **own disconnected SQLite DB**. Needs merging into PIA main process. |
| Google Calendar | ❌ ZERO | No OAuth, no token storage, no `calendar_events` table. Placeholders only. |
| Google Tasks | ❌ ZERO | No implementation at all. |

### What Was Designed (Spec Only — Not Yet Built)

**5 new files:**
- `src/services/fisher-service.ts` — FisherService merging Fisher2050 into PIA main process (4 crons + AgentBus subscription)
- `src/services/calendar-watcher.ts` — polls Google Calendar every 5 min, triggers agent spawns
- `src/services/google-tasks-sync.ts` — one-way PIA tasks → Google Tasks mirror
- `src/api/routes/integrations.ts` — 9 OAuth + calendar + tasks endpoints
- `src/api/routes/fisher.ts` — 3 on-demand Fisher endpoints

**Fisher2050's 6 AI tools** (injected when soulId === 'fisher2050'):
`list_tasks`, `create_task`, `update_task`, `spawn_agent`, `list_running_agents`, `create_calendar_event`

**3 new DB tables (migration 044):**
`integrations` (OAuth tokens), `calendar_events` (Google ↔ PIA bridge), `task_google_sync` (ID mapping)

### Files Changed
| File | Change |
|---|---|
| `research/IMPLEMENTATION_SPEC.md` | **COMPLETE** — TypeScript interfaces, SQL DDL, API signatures, 12-step build order |

### Desktop App Impact
New env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Settings screen needs Google connect/disconnect. FisherService + CalendarWatcher are background services on hub boot.

---

## Session 15: Machine Sync + M3 Registration Plan

### Git State (M1 — this machine, 2026-02-20)
- **Last commit:** `524a862` at 16:52 today — M1 is most current machine
- **15+ uncommitted files** from today: all research/, HTML pages, site map
- M2 and M3 need `git pull` after M1 commits and pushes

### Recommended Commit (awaiting user confirmation)
```bash
git add SITE_MAP.md research/ public/pia-mindmap.html public/pia-storyboard.html public/d3.min.js PIA_KNOWLEDGE_BASE.md FILE_INDEX.md SESSION_JOURNAL_2026-02-20.md public/pia-diagram.html public/pia-book.html
git commit -m "feat: Full planning session — 25-node mindmap, 12 agent specs, build list, site map, vision docs, impl spec"
git push
```

### M3 Connection Plan
Follow `MACHINE_3_INSTRUCTIONS.md` on SODA-YETI. Once connected: M3 appears in M1 dashboard, agents can spawn there from M1.

### Querying M2 Repos Through PIA
Two working methods:
1. Spawn agent on M2 with shell tools → access M2 filesystem
2. PIA Files API `/api/files/` cross-machine proxy (already built)
Scout producing `TERMINAL_SEARCH_BRIEFING.md` will specify which repos are on which machine.

---

## Session 16: Devil's Advocate Report — DEVILS_ADVOCATE.md

### Context
Independent agent read all specs and planning documents with a critical eye. No validation — only challenges, risks, and hard questions. This is the most important document created today.

### What's Genuinely Strong (only 5 — the agent was strict)
1. **Tim Buc Pipeline** — no competitor has a dedicated archivist-to-intelligence agent relay
2. **Soul-first identity as compounding asset** — trust built over months cannot be migrated away
3. **Calendar as scheduling layer (not code)** — solves non-technical visibility, genuine UX insight
4. **SodaLabs eating its own cooking** — live proof-of-concept competitors cannot fake
5. **Dynamic machine role assignment** — genuinely scalable architecture

### Critical Risks Found

#### Architectural Risks
| Risk | Severity | Detail |
|---|---|---|
| **M1 single point of failure** | HIGH | Every strategic agent, Owl DB, and hub all on M1. Hub failover is 20+ build items away. |
| **Context window collapse** | HIGH | Tim Buc → Eliyahu has NO RAG/retrieval layer. At month 4, Eliyahu can't fit 800+ session summaries in context. |
| **Google OAuth no fallback** | HIGH | If Google revokes token, entire scheduling system stops. No fallback defined. |
| **Tim Buc throughput bottleneck** | MEDIUM | 100 sessions/day = 100 Tim Buc spawns. No queue mechanism. Cost implications unaddressed. |
| **Fisher2050 serialization** | MEDIUM | Not always running. Who handles task completions overnight? |
| **agent_messages no TTL** | MEDIUM | No expiry or inbox size limit. Stale messages inflate every agent's context on startup indefinitely. |

#### Complexity Risk
- **53 items, 7 tiers, 1 person** — roadmap grows faster than it shrinks
- **Real MVP is 3 items**: Fisher2050 spec + Owl DB + Calendar spawn + Tim Buc minimal form
- **Soul system is theoretical** — elaborate spec but agents currently run vanilla system prompts. Not operational.

#### Business/Practical Risks
| Risk | Detail |
|---|---|
| **GumballCMS WhatsApp bridge contradiction** | Listed as "already live" AND as a future BUILD_LIST item 3.4. Which is true? |
| **Videohoho Phase 2 not built** | Two agents (Andy, Bird Fountain) depend on Phase 2 features before they can deliver |
| **Methodology frameworks not wired** | Taoism, Sutherland, Ubuntu exist in a research file. Not connected to any agent's system prompt. |
| **No one audits Fisher2050** | No escalation path when Mic is unavailable. Fisher creates bad tasks at 9am — who catches it? |

### Questions Nobody Asked
1. **What does "done" look like?** No milestone is defined anywhere. The list grows faster than it's built.
2. **Is multi-machine necessary right now?** Honest answer for a 1-person team with 2 live agents: NO.
3. **What is the 80% version?** → 4 agents on 1 machine, buildable in 2 weeks.

### 6 Recommended Immediate Fixes (Risk Reduction)
| # | Fix | Why |
|---|---|---|
| 1 | **Define v1.0 done** in a committed `V1_DEFINITION.md` | Without a finish line, scope creep is guaranteed |
| 2 | **Build local calendar fallback** before touching Google OAuth | Don't block the core feature on OAuth complexity |
| 3 | **Add TTL + inbox size limit** to `agent_messages` before deploying | Prevents context inflation at scale |
| 4 | **Write one integration test** for the core loop (Fisher → Task → Agent spawn) | Without it, regressions are invisible |
| 5 | **Merge Fisher2050** into PIA main process | Currently a disconnected sidecar — this is the #1 architectural risk to fix first |

### Techniques Named (for Mic's learning)
| Pattern | Official Name | Real Example | Failure Mode to Watch |
|---|---|---|---|
| Ephemeral agents | Serverless / FaaS | AWS Lambda | Cold start latency at scale |
| Queue / producer-consumer | Message Queue / Task Queue | Celery + RabbitMQ | Poison messages blocking the queue |
| Soul injection | Context injection / Persona priming | Character.ai | Context window competition (souls vs task content) |
| Monitor (push-based) | Observer Pattern / Push telemetry | Prometheus | Alert fatigue from too many events |
| Calendar-triggered spawn | Scheduled webhook trigger | GitHub Actions cron | Missed triggers if scheduler restarts |
| Async inbox | Async message passing / Actor model | Akka, AWS SQS | Message ordering violations |
| Three-tier orchestration | Hierarchical orchestration | SAP ERP | Middle layer becomes the bottleneck |

### Files Changed
| File | Change |
|---|---|
| `research/DEVILS_ADVOCATE.md` | **NEW** — 7-section critical analysis, 6 immediate fixes, technique dictionary |

### Action Required from Mic
Read `research/DEVILS_ADVOCATE.md` in full. The **#1 action is defining v1.0** — what does the system need to do before you call it working? Without that, the build list grows forever. The **#2 action is merging Fisher2050** — it's the architectural risk that blocks everything else.

---

## Session 17: Knowledge Sync — pia-book.html Updated + SYNC_REPORT.md

### Context
Knowledge sync sub-agent. Read all key `.md` source files and all HTML pages. Performed gap analysis. Updated `pia-book.html` with 8 new chapters covering the Feb 2026 vision. Created `SYNC_REPORT.md` documenting all findings.

### What Was Read
- `research/MASTER_VISION.md` — authoritative vision (727 lines)
- `research/BUILD_LIST.md` — 53-item build list P1-P7
- `research/AGENT_PRODUCT_SHEETS.md` — 12 agent product sheets (849 lines)
- `research/IMPLEMENTATION_SPEC.md` — Fisher2050 + Google Calendar buildable spec (1933 lines)
- `SESSION_JOURNAL_2026-02-20.md` — Sessions 1-16
- `PIA_KNOWLEDGE_BASE.md` — Master KB (578 lines)
- `public/pia-book.html` — full content (1014 lines before update)
- `public/pia-plan.html`, `public/system-plan.html`, `public/knowledge.html`, `public/handbook.html` — first 200 lines each

### Gaps Found (20 total)
Before this session, `pia-book.html` had zero coverage of:
- 12-agent ecosystem (only 3 agents mentioned)
- Three-tier hierarchy (M1 Strategic / M2 Project / M3 Execution)
- Tim Buc archivist agent and intelligence pipeline
- Agent Records DB (session logging in SQLite)
- Async Agent Inbox Pattern (agent_messages table)
- Soul System 7-layer full spec
- Calendar-triggered ephemeral spawn
- Queue / Producer-Consumer pattern
- GumballCMS (output + inbound), Browser/QA Machine, Coder Machine
- Ziggi + Farcake QA loop
- 9 methodology frameworks
- Build Order P1-P7
- Google Calendar / Tasks integration
- Competitive differentiation

### Changes Made

- **`public/pia-book.html`**: Added 8 new chapters (9-16), nav section "Feb 2026 Vision" with 8 links, updated stats bar (migrations 42→44, added "12 AI Agents", changed "10 Journals" → "16 Chapters")
- **`research/SYNC_REPORT.md`**: **NEW** — Full gap analysis: 20 gaps found, what was fixed, what is still outstanding, HTML page status table
- **`FILE_INDEX.md`**: Updated SYNC_REPORT.md entry (was "in progress"), fixed MASTER_VISION.md agent count (11→12)

### New Chapters Added to pia-book.html
| Chapter | Title | Gaps Closed |
|---------|-------|-------------|
| Ch 9 | Agent Ecosystem — The AI Workforce | Three-tier hierarchy, 12 agents, digital identity, Project Activation Pattern |
| Ch 10 | Architectural Patterns | Calendar-triggered spawn, Queue/Producer-Consumer, Ephemeral Compute, Push Over Poll |
| Ch 11 | Intelligence Pipeline | Tim Buc → Records → Eliyahu, Agent Records DB, Async Inbox Pattern, agent_messages SQL |
| Ch 12 | Soul System | All 7 layers, existing code files, Soul JSON schema |
| Ch 13 | Platforms and Tools | GumballCMS, Videohoho, Browser/QA Machine, Google Calendar integration |
| Ch 14 | QA Loop + Methodology | Ziggi+Farcake QA loop, 9 frameworks, agent training rules |
| Ch 15 | Build Order | P1-P3 (22 items) with status column, dependency chain |
| Ch 16 | How PIA Differs | 7 genuinely new concepts, competitive comparison table |

### Files Changed
| File | Change |
|------|--------|
| `public/pia-book.html` | Added Chapters 9-16 (~400 lines), nav links, updated stats bar |
| `research/SYNC_REPORT.md` | **NEW** — Knowledge sync gap analysis report |
| `FILE_INDEX.md` | Updated SYNC_REPORT.md and MASTER_VISION.md entries |

### Desktop App Impact
No backend changes. pia-book.html is a static documentation page — no React port required. SYNC_REPORT.md is a research doc only.

---

## Session 18: V1_DEFINITION.md Created

### Changes
- **New file**: `V1_DEFINITION.md` — Committed definition of done for PIA v1.0. Defines the finish line so the build list has a hard stop.

### Summary
After reading DEVILS_ADVOCATE.md (which identified "no definition of done" as the #1 risk), BUILD_LIST.md (53 items, no milestone), MASTER_VISION.md, and AGENT_PRODUCT_SHEETS.md, this session produced a crisp v1.0 scope document. Key decisions committed to:

- **v1.0 is a 4-agent system on M1 only**: Fisher2050, Farcake, Tim Buc, Eliyahu, plus Ziggi as quality gate. No M2, no M3, no multi-machine routing.
- **No Google OAuth for v1.0**: Local `calendar_events` SQLite table replaces Google Calendar. Google Calendar is a v2.0 enhancement, not a blocker.
- **17 build items, not 53**: Extracted only the items needed to pass the 12 acceptance criteria. Everything else is explicitly deferred to v2.0 with a named list.
- **5-week target from 2026-02-20**: 3-4 weeks build + 1 week soak test (5 consecutive days of unattended operation).
- **The finish line**: The core loop runs 5 days in a row without Mic touching a keyboard. Fisher2050 schedules, Farcake executes, Tim Buc archives, Ziggi reviews, Eliyahu briefs. That is v1.0.

The devil's advocate said the 80% version is "4 agents on 1 machine, buildable in 2 weeks." V1_DEFINITION.md is that 80% version, with 5 weeks budgeted to do it properly with validation.

### Files Changed
| File | Change |
|---|---|
| `V1_DEFINITION.md` | **NEW** — 12 acceptance criteria, explicit v2.0 deferral list, minimal machine setup, daily experience narrative, 17-item build sequence, 5 success metrics |
| `SESSION_JOURNAL_2026-02-20.md` | Added Session 18 entry |

### Desktop App Impact
V1_DEFINITION.md explicitly defers the Electron app to v2.0, so this clarifies that the desktop app is out of scope until the core agent loop is proven working. No changes to the Express server, API routes, or WebSocket events.

---

## Session 19: pia-diagram.html #todo Rebuilt (53-Item Build List)

### Changes
- **pia-diagram.html #todo section**: Replaced 8-item flat grid with full 53-item structured build list across 7 priority tiers + Quick Wins panel

### Summary
The old `#todo` section had only 8 items from early sessions (Sessions 1–3) with no tier structure. Agent rebuilt the entire section with:
- **P1 Foundation** (8 items): Fisher2050 spec, Agent Records DB, Owl, Tim Buc, PM2, API Key Rotation, File API Auth
- **P2 Agent Intelligence** (9 items): Calendar-Triggered Spawn, Monitor, Eliyahu, Ziggi, Controller, Farcake, Andy, Activity Feed, soul wiring
- **P3 Communications** (5 items): email addresses, WebSocket channels, WhatsApp bridge, inter-agent messaging
- **P4 UI** (9 items): fleet dashboard, visor, autonomous worker triggering, HTTP fallback, version detection
- **P5 Platform Integrations** (7 items): GumballCMS, Videohoho, Document Store, Coder Machine, Bird Fountain pipeline
- **P6 Automation** (6 items): Queue system, fleet self-update, hub failover, scheduled emails, failsafe rules
- **P7 Desktop App** (9 items): Electron build broken out properly
- **Quick Wins panel**: 7 specific actionable items

New CSS classes added for tier badges (`.todo-tier-header`, `.todo-tier-badge`, `.tier-p1` through `.tier-p7`, `.quick-wins-box`, `.qw-item`). All use existing CSS variables.

### Files Changed
| File | Change |
|---|---|
| `public/pia-diagram.html` | `#todo` section completely rebuilt — 8 items → 53 items across 7 tiers |

### Desktop App Impact
Pure UI/visual change. No backend or API changes.

---

## Session 20: PIA_KNOWLEDGE_BASE.md Updated

### Changes

- **Updated**: `PIA_KNOWLEDGE_BASE.md` — Consolidated all 16 sessions of new knowledge (Sessions 1–16 from today) into the master knowledge base.

### Summary

Read `PIA_KNOWLEDGE_BASE.md` (current state), `SESSION_JOURNAL_2026-02-20.md` (all 16 sessions), and `research/DEVILS_ADVOCATE.md` (6 immediate fixes). Made 9 targeted edits:

**Section 1 (Terminology):**
- Expanded AgentBus entry with the critical "in-memory only, lost on restart" distinction and contrast with `agent_messages`
- Added `agent_messages table` as a new term (persistent async inbox with TTL needed)
- Added new subsection "New Terms (Added Feb 2026 — Sessions 6–16)" with 6 new terms: FisherService, CalendarWatcher, Soul Seeding, RAG, V1.0 Definition, GumballCMS

**Section 3 (System Specification):**
- Added 3 new API endpoint groups (Integrations, Fisher2050, Agent Messages — all designed but not yet implemented)
- Added migration 043 spec (`agent_messages` table) and migration 044 spec (`integrations`, `calendar_events`, `task_google_sync` tables)
- Updated Fisher2050 subsystem entry to flag the architectural risk (disconnected sidecar)

**Section 4 (Current Capabilities):**
- Added 4 new Working entries: Soul Engine, Task Queue, Autonomous Worker, AgentBus
- Added 2 new Partial entries: Fisher2050 (isolated sidecar), GumballCMS (codebase exists, not connected)

**Section 5 (Still To Do):**
- Added new CRITICAL section at top: Devil's Advocate's 6 immediate fixes (DA1–DA6) with effort and rationale

**Section 6 (Session Timeline):**
- Added 18 new rows covering all sessions from Feb 20 (Sessions 1–16) plus Sessions 17–20

### Files Changed

| File | Change |
|------|--------|
| `PIA_KNOWLEDGE_BASE.md` | 9 targeted edits — new terms, API endpoints, DB tables, capabilities, CRITICAL fix list, session timeline |
| `SESSION_JOURNAL_2026-02-20.md` | Added this Session 20 entry |

### Desktop App Impact
Knowledge base updates are documentation only. The new API endpoints (Integrations, Fisher2050, Agent Messages) are all designed but not yet implemented — React UI will need to call them once built.

---

## Session 21: Fisher2050 Merged into PIA Main Process

### Changes

- **New file**: `src/services/fisher-service.ts` — `FisherService` class that runs 4 cron jobs inside PIA's main hub process. Replaces the need for the `fisher2050/` standalone sidecar app.
  - Cron `0 9 * * 1-5` (9am weekdays) — Fisher2050 morning standup (spawns `runAutonomousTask` with `soulId: 'fisher2050'`)
  - Cron `0 18 * * 1-5` (6pm weekdays) — Fisher2050 evening summary
  - Cron `0 2 * * *` (2am daily) — Ziggi overnight quality audit
  - Cron `0 6 * * *` (6am daily) — Eliyahu morning briefing prep
  - Subscribes to `AgentBus` broadcasts for `task_completed` events and reacts by queuing the next task for that agent
  - `runOnDemand(prompt): Promise<string>` method — fire-and-forget, returns task ID
  - `runStandup()` and `runEveningSummary()` methods for manual triggers
  - Exports `getFisherService()` singleton and `initFisherService(config?)` factory
  - Prompt builders (`buildStandupPrompt`, `buildSummaryPrompt`, `buildZiggiPrompt`, `buildEliyahuPrompt`) read live DB state via `getTaskQueue()` to produce context-rich prompts

- **Modified**: `src/index.ts` — `startHub()` now dynamically imports and starts `FisherService` after soul seeding. `shutdown()` now calls `getFisherService().stop()` for graceful cron cleanup. Both changes use the existing `await import()` pattern that all other services in this file use.

- **Modified**: `src/souls/personalities/fisher2050.json` — Updated `email` from `fisher2050@sodaworld.com` to `fisher2050@sodalabs.ai` (matches `MASTER_VISION.md`).

- **Dependency fix (applied by controller)**: `node-cron@^4.2.1` and `@types/node-cron@^3.0.11` installed into `package.json`. TypeScript import also fixed: changed `cron.ScheduledTask` namespace reference to named import `ScheduledTask` from `'node-cron'`. TypeScript now compiles clean.

### Files Changed

| File | Change |
|---|---|
| `src/services/fisher-service.ts` | **NEW** — FisherService class with 4 cron jobs + AgentBus subscription; TS import fix applied by controller |
| `src/index.ts` | Added FisherService init in `startHub()` and graceful stop in `shutdown()` |
| `src/souls/personalities/fisher2050.json` | Updated email to `fisher2050@sodalabs.ai` |
| `package.json` | Added `node-cron@^4.2.1` and `@types/node-cron@^3.0.11` |

### Desktop App Impact

`FisherService` runs only in hub mode inside the Express process. No new API endpoints or WebSocket events were added in this session. To expose manual triggers to the React UI, add `POST /api/fisher/run`, `GET /api/fisher/status`, and `POST /api/fisher/standup` routes as specified in `IMPLEMENTATION_SPEC.md` Section 8 — these are the next logical step.

---

## Session 22: All 12 Agent Souls Seeded

### Summary
The soul system was elaborate but non-operational — only 3 of 12 agents had personality files, and `seed-souls.ts` only seeded those 3. Every agent was running vanilla system prompts. This session fixes that: all 12 agents now have complete personality files with role-specific system prompts, and `seed-souls.ts` seeds all 12 on startup.

### What Was Done

| Agent | Action | File | Notes |
|---|---|---|---|
| controller | CREATED | `controller.json` | Gateway agent, M1, routes all requests |
| fisher2050 | UPDATED | `fisher2050.json` | Added Mic preamble, expanded relationships + config, email sodalabs.ai |
| eliyahu | UPDATED | `eliyahu.json` | Added Mic preamble, briefing constraints, email sodalabs.ai |
| ziggi | UPDATED | `ziggi.json` | Added Mic preamble, verdict format, email sodalabs.ai |
| tim_buc | CREATED | `tim_buc.json` | Archivist, ephemeral, event-triggered on session completion |
| owl | CREATED | `owl.json` | Persistent task state layer, no email (infrastructure) |
| farcake | CREATED | `farcake.json` | Research engine, M3, ephemeral |
| andy | CREATED | `andy.json` | Editorial engine, M3, ephemeral, voice-first |
| bird_fountain | CREATED | `bird_fountain.json` | Design production, M2, can be resident |
| wingspan | CREATED | `wingspan.json` | Presentation/deck specialist, M3, version-tracking |
| monitor | CREATED | `monitor.json` | Fleet watchdog, M1, always-on, no email (push-only) |
| coder_machine | CREATED | `coder_machine.json` | Build agent, dedicated hardware, queue-driven |

### Changes

- **9 new personality files**: Created in `src/souls/personalities/` for all agents missing souls
- **3 updated personality files**: `fisher2050.json`, `ziggi.json`, `eliyahu.json` — added Mic working style preamble, updated emails to sodalabs.ai domain, expanded relationships and config to match AGENT_PRODUCT_SHEETS.md spec
- **Updated `seed-souls.ts`**: Now seeds all 12 agents in logical order (strategic layer → quality gate → execution layer → design layer → build layer)
- **Mic working style preamble**: Added to EVERY agent's system_prompt — lead with answer, max 3 key points, anti-sycophancy, time-sensitive items first, never re-explain what Mic knows

### Files Changed

| File | Change |
|---|---|
| `src/souls/personalities/controller.json` | **NEW** — Gateway agent soul |
| `src/souls/personalities/tim_buc.json` | **NEW** — Archivist soul |
| `src/souls/personalities/owl.json` | **NEW** — Persistent task state soul |
| `src/souls/personalities/farcake.json` | **NEW** — Research engine soul |
| `src/souls/personalities/andy.json` | **NEW** — Editorial engine soul |
| `src/souls/personalities/bird_fountain.json` | **NEW** — Design production soul |
| `src/souls/personalities/wingspan.json` | **NEW** — Presentation specialist soul |
| `src/souls/personalities/monitor.json` | **NEW** — Fleet watchdog soul |
| `src/souls/personalities/coder_machine.json` | **NEW** — Build agent soul |
| `src/souls/personalities/fisher2050.json` | Updated — Mic preamble, expanded spec, sodalabs.ai email |
| `src/souls/personalities/ziggi.json` | Updated — Mic preamble, expanded spec, sodalabs.ai email |
| `src/souls/personalities/eliyahu.json` | Updated — Mic preamble, expanded spec, sodalabs.ai email |
| `src/souls/seed-souls.ts` | Updated — Seeds all 12 agents on startup |

### Desktop App Impact

No new API endpoints or WebSocket events. Soul seeding runs at server startup via `seedDefaultSouls()`. The React UI's agent configuration screen will need to surface all 12 souls when built. The `GET /api/souls` endpoint will now return all 12 souls instead of 3.

## Session 23: Full Code Repository Scout — Complete Ecosystem Map

### Summary
A repository scout agent systematically explored every known codebase on this machine, catalogued 26 codebases (14 with GitHub remotes), and produced two output documents: a complete repository map and a self-contained terminal briefing for a follow-up deep investigation.

### What Was Done
- Explored all named folders in `C:\Users\mic\Downloads\` (sheba, SmartAgent, Farcake2025, BirdfountainNov, Videohoho, Sodacast, SodaRoid, SodaStubsv2, sodastudio, sodaworld-ticketing-mvp, Video-kiosk-2-, agent_instructions, InvestorDome, sodaworld)
- Explored all sub-folders in `C:\Users\mic\Downloads\sodalabs\` (andy, bird-fountain, bots, GumballCMS, explore, farcake, sodacast, sodacolab, soda-academy, ts, viki, wingspan)
- Read `package.json`, `CLAUDE.md`, and `README.md` for every app with code
- Checked `git remote -v` for all repos
- Fetched GitHub org listing via `curl` to `api.github.com/users/Sodaworld2/repos`
- Identified SodaStubsv2 as empty (only .git), 3 empty sodalabs stubs (andy, farcake, soda-academy), and 12+ GitHub repos not cloned locally

### Key Findings
- **26 total codebases** found (16 with real code)
- **Critical: SodaRoid has NO git remote** — risk of data loss
- **sodaworld and sodaworld-ticketing-mvp share the same GitHub remote** — canonical version unclear
- **Sheba is architecture docs only** — no implementation code yet
- **SmartAgent is a design brief only** — designed to use Farcake2025 as foundation
- **GumballCMS is a marketing HTML page** — no backend implementation found
- **14 GitHub repos exist under Sodaworld2 that are NOT cloned locally** (DAODEN, Farcake2, personal_assistant-, RSVP, sodachat, etc.)

### Changes

- **New file**: `research/CODE_REPOSITORY_MAP.md` — complete ecosystem map (26 apps, stacks, remotes, Sheba section, GumballCMS section, recommendations table)
- **New file**: `research/TERMINAL_SEARCH_BRIEFING.md` — self-contained prompt for a fresh Claude terminal session to do deep investigation and produce `INTEGRATION_PLAN.md`

### Files Changed

| File | Change |
|---|---|
| `research/CODE_REPOSITORY_MAP.md` | **NEW** — Complete ecosystem map |
| `research/TERMINAL_SEARCH_BRIEFING.md` | **NEW** — Terminal investigation briefing |

### Desktop App Impact

No code changes to PIA itself. These are research/documentation files only. The CODE_REPOSITORY_MAP and TERMINAL_SEARCH_BRIEFING are inputs for future architectural decisions about which repos to merge or integrate.

---

## Session 24: pia-diagram.html — Kids / After / Comparison Sections Updated

### Changes

- **`#kids` section**: Full rewrite — "PIA is a Pizza Shop!" analogy. 7 strategic-layer characters as pizza roles. 6-agent execution cast grid. Three Buildings (M1/M2/M3). 6-step pipeline walkthrough. Special Tools. Cool Facts updated.

- **`#after` section**: Expanded to "Full Build Roadmap" — explicitly shows already-built infrastructure vs new items. 3-group flow: Dashboard Output, Intelligence Pipeline, Scheduling & Comms.

- **`#comparison` table**: 6 new rows — queue system, soul system with email, calendar-triggered spawn, M3 fleet, WhatsApp inbound, Tim Buc pipeline.

- **`#now`**: Verified accurate.

### Files Changed

| File | Change |
|------|--------|
| `public/pia-diagram.html` | `#kids` full rewrite, `#after` expanded, `#comparison` +6 rows |

### Desktop App Impact
Documentation/visual only. No backend changes.

---

## Session 25: Controller — node-cron Fix + TypeScript Compiles Clean

### Changes

- Installed `node-cron@^4.2.1` and `@types/node-cron@^3.0.11` to fix missing dependency in `fisher-service.ts`
- Fixed TypeScript error: `cron.ScheduledTask` namespace → named import `ScheduledTask from 'node-cron'`
- `npx tsc --noEmit --skipLibCheck` passes with zero errors (excluding dao-foundation-files)
- Updated `FILE_INDEX.md`: V1_DEFINITION.md added, CODE_REPOSITORY_MAP.md and TERMINAL_SEARCH_BRIEFING.md marked complete
- Updated `memory/MEMORY.md`: devil's advocate status updated (#1 and #2 marked done, soul system marked partial)

### Files Changed

| File | Change |
|------|--------|
| `package.json` | Added `node-cron@^4.2.1`, `@types/node-cron@^3.0.11` |
| `src/services/fisher-service.ts` | Fixed `ScheduledTask` import (TS named import, not namespace) |
| `FILE_INDEX.md` | Added V1_DEFINITION.md, updated repo scout entries |
| `memory/MEMORY.md` | Devil's advocate status, completed work, visual assets updated |

### Desktop App Impact
Dependency fix only. Fisher-service.ts now compiles and starts. No new API or WebSocket changes.

---

## Session N: Cross-System Knowledge Review — Is Discovered Work Useful?

### Context
Full review of all journals (Feb 17–20) + DAOV1 docs + M2 file inventory. No code written this session — pure intelligence gathering. Goal: assess whether work discovered across DAOV1, PIA, and M2 is of value to any agent or builder in the ecosystem, and record findings so nothing gets lost.

---

### What Was Found

#### 1. DAOV1 AI Mentor System — Large, Mostly Unknown to PIA Agents
All of the following exists in `C:\Users\mic\OneDrive\Documents\GitHub\DAOV1\` and is production-grade but under-connected to the rest of the ecosystem:

| Component | Location | What It Does |
|---|---|---|
| `AIMentorPanel.tsx` | `components/` | Full chat UI: speech recognition, persona selector, image gen placeholder, i18n |
| `AIMentorWidget.tsx` | `components/` | Floating trigger button (bottom-right, pulse animation) |
| `AIMentorIntake.tsx` | `components/` | Learning style intake: visual / oral / kinesthetic + Visionary / Builder / Diplomat |
| `useAIMentor.ts` | `hooks/` | Central hook: UUID sessions, persona routing, step-based coaching, Gemini API |
| `coaching_content.ts` | `coaching/` | 18 coaching sets (6 wizard steps × 3 learning styles) |
| `backend/src/ai/` | 8 files | Full AI brain: personas, classifier, router (multi-model waterfall), RAG, memory, cost-guard |
| `backend/src/modules/coach.ts` | `modules/` | OKR tracking, milestone planning, strengths assessment, performance coaching |
| `backend/src/routes/brain.ts` | `routes/` | `/api/brain/chat`, `/api/brain/classify`, `/api/brain/personas` endpoints |
| `backend/mentor_chats.db` | `backend/` | 589KB of real conversation history (M1 only) |
| `backend/backups/` | 21 files | Timestamped DB snapshots Nov–Dec 2025 |
| `docs/AI_MENTOR_NEXT_STEPS.md` | `docs/` | Production roadmap: 6 work areas, streaming, memory, voice, images, bubble-scope |
| `docs/PIA_INSIGHTS_ANALYSIS.md` | `docs/` | 7 PIA architectural recommendations mapped to DAOV1 gaps with effort/impact ratings |
| `dao-foundation-files/research/RESEARCH_AI_MENTOR_KNOWLEDGE.md` | PIA repo | 1,489 lines — 85+ academic/industry refs on RAG architecture, chunking, hybrid search |

**M2 confirmation:** DAOV1 on M2 is at the same git commit as M1 (post-pull). No unique mentor data on M2. Live `mentor_chats.db` lives on M1 only.

#### 2. DAOV1 System Specification — 35% Complete
Per `docs/SESSION_JOURNAL.md` (DAOV1), the full system spec is ~35% done. 22 planning docs exist but most are vision/UX only. Missing: database schemas per module, API contracts, state machines, notification logic, AI module programming specs, security model, inter-module comms, integration specs with Farcake/Manfred/PIA/Sheba, deployment architecture.

3 production sibling repos mapped with massive reusable infrastructure:
- **SodaWorld** — email (Resend+SendGrid dual), 58+ notification types, FCM push, AI/bot system, gamification, 140+ React hooks
- **SodaLabs** — 7 email templates, Google Calendar OAuth2, Mux video, reminder service
- **RiseAtlantisClientPortal** — full analytics, multi-tenant admin, bulk invite system, 3-tier RBAC, branding system

#### 3. PIA System — More Built Than Anyone Realised
Session 12 audit (earlier today) found significant infrastructure already in place that agents were not referencing:
- Soul engine complete (`soul-engine.ts`, `memory-manager.ts`, `seed-souls.ts`)
- Task queue complete (`task-queue.ts`, priority/blocking, full REST API)
- Agent bus complete (`agent-bus.ts` — in-memory pub/sub)
- Fisher2050 previously ran as separate process (port 3002, disconnected DB) — **now fixed**, merged into main via `fisher-service.ts`
- WhatsApp bot, Discord bot, MQTT broker all exist but not yet wired

---

### Is This Work Useful? — Assessment by Recipient

#### For Tim Buc (Archivist agent — not yet built)
**High value.** The DAOV1 `mentor_chats.db` and 21 backup snapshots are exactly the kind of session records Tim Buc is designed to file. Once Tim Buc exists, DAOV1 conversation logs should be fed through his pipeline → Agent Records DB → Eliyahu intelligence summaries. The 18 coaching sets in `coaching_content.ts` are pre-built training material for Tim Buc to index.

#### For Eliyahu (Intelligence agent — not yet built)
**High value.** `docs/PIA_INSIGHTS_ANALYSIS.md` is exactly the kind of cross-system intelligence Eliyahu should produce and maintain. It maps PIA patterns to DAOV1 gaps with effort/impact ratings. When Eliyahu is built, this document is a template for the kind of briefing notes he should generate daily.

#### For Fisher2050 (Operations — now merged into main process)
**Medium value.** The `RESEARCH_AI_MENTOR_KNOWLEDGE.md` (85+ refs on RAG/chunking) contains actionable specs for future tasks Fisher could schedule. Specifically: the RAG implementation task for DAOV1's AI mentor is well-enough specified to be a schedulable Fisher2050 task today.

#### For Farcake (Research agent — on M3)
**High value.** The 3 sibling repos (SodaWorld, SodaLabs, RiseAtlantis) and their reusable infrastructure are exactly the kind of cross-repo research Farcake should be cataloguing. The fact that DAOV1 needs email, notifications, calendar, and analytics — all of which exist battle-tested in sibling repos — is a prime research task Farcake could deliver on.

#### For Andy (Editorial — on M3)
**Low-medium value now.** The AI mentor coaching content (`coaching_content.ts`, 18 sets) has gaps — only the tokenomics step is fully written per `AI_MENTOR_NEXT_STEPS.md`. The other 5 steps need content written. That is an Andy task (writing in Mic's voice).

#### For Any Agent Building DAOV1
**Very high value.** The gap analysis and sibling repo map means no one should rebuild what already exists. Before writing any new code for DAOV1's email, notifications, calendar, or analytics — read what SodaWorld and SodaLabs already have. The DAOV1 `backend/src/ai/` layer (8 files, multi-model router, RAG, cost-guard) is production-grade and should be treated as the foundation — not rebuilt.

#### For the Electron Desktop App (future React UI)
**High value.** `docs/PIA_INSIGHTS_ANALYSIS.md` lists 7 specific PIA patterns that the DAO mentor needs: session persistence, cost waterfall/multi-model routing, personas-as-agents, DAO-spaces, mentor activity dashboard, automatic RAG, and security enforcement via middleware. The React UI team needs to know these exist as infrastructure requirements, not just features.

---

### Key Cross-Pollination Opportunities (Immediate)

| Opportunity | From | To | Effort |
|---|---|---|---|
| Enforce AI costs via middleware (not prompts) | PIA cost-guard pattern | DAOV1 brain router | Low — pattern is documented in `cost-guard.ts`, just copy |
| Session persistence: save on end, reload on start | PIA agent output persistence | DAOV1 `useAIMentor` hook | Low — `agent_output_snapshots` pattern already proven in PIA |
| Feed DAOV1 `mentor_chats.db` into Tim Buc pipeline | DAOV1 | PIA Agent Records | Medium — depends on Tim Buc being built first |
| Copy email templates from SodaLabs for DAOV1 | SodaLabs | DAOV1 Legal module | Low — templates exist, just needs route wiring |
| Copy notification types from SodaWorld for DAOV1 | SodaWorld | DAOV1 Community module | Medium — 58 types, needs mapping to DAO events |
| Andy writes missing coaching content (5 steps) | — | DAOV1 `coaching_content.ts` | Low — well-specified task, Andy's core job |
| Farcake catalogues sibling repo reuse map | — | DAOV1 build planning | Medium — Farcake research task |

---

### What Agents Need to Know Going Forward

1. **Don't re-research what's been found.** The sibling repo map (SodaWorld, SodaLabs, RiseAtlantis) is complete. Start from the existing code — file paths documented above.

2. **DAOV1 AI brain is production-grade.** The `/api/brain/` routes are live. Any agent building DAO features should route through `brain.ts`, not create new Gemini API calls from scratch.

3. **M2's DAOV1 is in sync.** No divergence. Both machines are at `847bf5d` post-pull.

4. **The real gap is specification, not code.** DAOV1 is 35% specified. The bottleneck for Phase C (building) is completing PRD + architecture docs per module. Priority: Coach module (maps directly to AI mentor) → Legal module (agreements have the most user-facing urgency per VISION_FEEDBACK_DOC).

5. **PIA soul engine, task queue, and agent bus are already built** and can be used now. Agents building new features should check these exist before designing new infrastructure.

6. **Fisher2050 is now merged into main PIA process** (port 3002 architecture risk resolved). Don't treat it as a separate service.

---

### Files Checked / Verified This Session

| File | Machine | Status |
|---|---|---|
| `C:\Users\mic\OneDrive\Documents\GitHub\DAOV1` (entire repo) | M1 | Up to date at `847bf5d` after pull |
| `C:\Users\User\Documents\GitHub\DAOV1` | M2 | In sync with M1 — same commit, same files |
| `backend/mentor_chats.db` (589KB) | M1 only | Live conversation data — not on M2 |
| `backend/backups/` (21 files) | M1 only | Nov–Dec 2025 DB snapshots |
| `dao-foundation-files/research/RESEARCH_AI_MENTOR_KNOWLEDGE.md` | PIA repo | 1,489 lines, 85+ RAG/chunking references |
| All SESSION_JOURNALs (Feb 17–20) | PIA repo | Fully read and synthesised |
| `docs/PIA_INSIGHTS_ANALYSIS.md` | DAOV1 | 7 cross-system recommendations documented |

### Desktop App Impact
No code changes this session. Cross-pollination opportunities identified will require React UI additions: mentor activity dashboard, DAO-space isolation per community, agent inbox view for mentor conversation history.

---

## Session 26: Deep Technical Audit — Current State Inventory

### Context
Pre-feature-addition audit of the entire PIA codebase. Read every file in `src/comms/`, `src/orchestrator/`, `src/services/`, `src/souls/`, plus `src/index.ts` and `src/api/routes/mission-control.ts`. Goal: produce an accurate "what is actually built and working TODAY" inventory before adding more features.

### Changes

- **New file**: `research/CURRENT_STATE_AUDIT.md` — full audit document with: executive summary, what is running at boot, what is built but not wired, credential requirements, real capability list (28 items), real gap list (10 items), recommended activation priority order (7 items).

### Files Changed

| File | Change |
|---|---|
| `research/CURRENT_STATE_AUDIT.md` | **NEW** — Deep technical audit of all comms, orchestrator, services, souls subsystems |

### Key Audit Findings

**What is definitely running at boot (hub mode):**
- AgentSessionManager, PromptManager, Mission Control API, WebSocket server, SQLite DB
- HeartbeatService (30s interval), Doctor (60s interval), FisherService (4 cron jobs)
- SoulEngine + SoulSeeder (12 personalities seeded at boot)
- CrossMachineRelay, RepoRouter (singletons initialized)
- AgentBus, MQTTBroker, WebhookManager (lazy singletons — active on first call)
- AutonomousWorker (callable via FisherService cron + `/api/orchestrator`)
- TaskQueue (SQLite-backed, always ready)
- The Cortex (fleet intelligence, 60s/120s intervals)

**What is built but NOT wired at boot:**
- Discord bot — needs `discordToken` + `initializeCommunications()` called in `startHub()`
- WhatsApp bot — API routes exist, bot not auto-started (user must POST `/api/whatsapp/start`)
- ExecutionEngine active loop — initialized but `.start()` never called (autoStart=false)
- PowerManager (WOL/SSH bootstrap) — fully coded, zero API routes expose it

**Single highest-leverage fix:**
- Set `ANTHROPIC_API_KEY` in `.env` — activates all FisherService crons, all SDK agent spawns, all autonomous tasks. Zero code changes.

**Second highest-leverage fix:**
- Change `getExecutionEngine()` to `initExecutionEngine({ autoStart: true })` in `startHub()` — activates the task queue processing loop.

### Desktop App Impact
Audit is documentation only — no code changes. The React UI will eventually need to surface: ExecutionEngine start/stop controls, PowerManager wake/bootstrap UI, Discord/WhatsApp bot status panel, soul memory stats. All additive.

---

## Session 27: ExecutionEngine Auto-Start + Weekly Memory Summarization

### Changes

Based on the CURRENT_STATE_AUDIT.md findings, applied two activation fixes to existing built code:

**Fix 1 — ExecutionEngine now auto-starts at boot** (`src/index.ts`):
- Changed `getExecutionEngine()` (initialize only, never start) → `initExecutionEngine({ autoStart: true })`
- TaskQueue now processes queued tasks automatically. Previously tasks accumulated but nothing ran them.
- Impact: FisherService can now create tasks and they will actually execute.

**Fix 2 — Weekly memory summarization added to FisherService** (`src/services/fisher-service.ts`):
- Added 5th cron job: `0 3 * * 0` (3am Sunday) — calls `getSoulEngine().listSouls()` then `summarizeOldMemories()` for each
- Added `memoryCron` to `FisherServiceConfig` interface and constructor defaults
- Prevents soul context window bloat as memories accumulate over weeks/months
- FisherService now manages 5 cron jobs (was 4)

TypeScript compiles clean after both changes.

### Files Changed

| File | Change |
|------|--------|
| `src/index.ts` | `getExecutionEngine()` → `initExecutionEngine({ autoStart: true })` |
| `src/services/fisher-service.ts` | Added `memoryCron` config + weekly memory summarization cron job |

### Desktop App Impact
ExecutionEngine start/stop is now automatic — no user action required. The React UI's "start engine" button (if built) would be redundant. Memory summarization is fully automatic — no UI required.

---

## Session 28: pia-diagram.html Updated to Reflect Real Current State (Audit)

### Changes
- **Updated `#now` section** in `public/pia-diagram.html`: replaced the old simplified machine-stack view (M1/M2 split with "missing" items) with a three-panel layout sourced directly from `research/CURRENT_STATE_AUDIT.md`
  - Panel 1 "Running at Boot — Always On": 25 items with green LIVE badges, grouped by Infrastructure / Agent Control / Orchestration / Souls System / Comms Infrastructure. Includes the corrected ExecutionEngine status (now auto-starts) and MemoryManager (weekly prune cron active).
  - Panel 2 "Built — One Step to Activate": 5 items with orange NEEDS WIRE badges — Discord Bot, WhatsApp Bot (auto-start), comms/Orchestrator (PTY, noted as obsolete), PowerManager, and comms/index.ts initializeCommunications. Each includes what's missing and the activation cost (lines of code).
  - Panel 3 "Needs External Credentials": 3 items with purple KEY/SCAN badges — ANTHROPIC_API_KEY (highest priority), Discord Bot Token, WhatsApp QR Scan.
- **Added 3 new rows** to the `#comparison` table (Feature Comparison — Now vs After):
  - ExecutionEngine task processing (built but not started → now auto-starts, 1-line fix applied)
  - Memory summarization for souls (accumulating forever → now weekly pruned via FisherService)
  - Discord bot activation (built but orphaned → activation known, 10 lines)

### Files Changed
| File | Change |
|---|---|
| `public/pia-diagram.html` | `#now` section replaced with audit-accurate 3-panel layout; 3 new rows added to `#comparison` table |

### Desktop App Impact
No functional code changed — HTML diagram only. The React UI port of this page should adopt the same three-panel (Live / Needs Wire / Needs Creds) structure when built.
