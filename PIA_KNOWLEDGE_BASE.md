# PIA System — Master Knowledge Base

> **Last Updated:** 2026-02-20
> **What This Is:** The single consolidated reference for everything about PIA — what it is, what it does, what was decided, what's still planned.
> **Visual Version:** Open `/pia-book.html` in your browser for the formatted HTML version.

---

## 1. Terminology

Plain-English definitions of every PIA-specific term.

### Core Concepts

| Term | What It Means |
|------|---------------|
| **PIA** | Project Intelligence Agent — a multi-machine AI agent orchestration system. Think of it as a brain that can control AI agents across multiple computers. |
| **Hub** | The central machine that coordinates everything. Runs the dashboard, database, API server, and WebSocket server. There is only ONE hub. Currently Machine 1 (Izzit7). |
| **Worker / Spoke** | A machine that connects TO the hub. It takes commands, spawns agents locally, and reports results back. Runs with `PIA_MODE=local`. |
| **The Cortex** | PIA's fleet intelligence brain. A layer that sits on top of the hub, collects telemetry from all machines, analyzes patterns, and provides insights. Named after the thinking layer of the brain. |
| **Mission Control** | The main web dashboard at `/mission-control.html`. This is where you see all agents, machines, terminals, and costs. |
| **Agent Session** | A running AI agent instance. Can be SDK mode (Claude Agent SDK), PTY mode (terminal), or API mode (direct API calls). Each session has an ID, status, output buffer, and cost tracker. |
| **Soul** | A persistent AI personality that survives across sessions and machines. Has its own name, role, personality prompt, goals, relationships, and memories. Think of it as giving an AI agent a consistent character. |
| **Fisher2050** | One of the pre-built Souls — acts as a Project Manager. Organized, proactive, follows up, uses confidence percentages. |
| **Ziggi** | A pre-built Soul — acts as a Code Quality Engineer. Meticulous, rates code 1-10, has "architecture smell" detection. |
| **Eliyahu** | A pre-built Soul — acts as a Curious Analyst. Uses "I noticed something..." pattern, keeps a Decision Log. |

### Architecture Terms

| Term | What It Means |
|------|---------------|
| **Aggregator** | The hub component (`src/hub/aggregator.ts`) that receives machine registrations, heartbeats, and agent updates from all workers. Stores everything in SQLite. |
| **Hub Client** | The worker-side component (`src/local/hub-client.ts`) that connects to the hub via WebSocket, sends heartbeats every 30 seconds, and handles commands from the hub. |
| **WebSocket Server** | The hub's real-time communication server (`src/tunnel/websocket-server.ts`) on port 3001. Broadcasts agent output, status changes, and machine events to the dashboard and workers. |
| **PTY Wrapper** | A pseudo-terminal wrapper (`src/tunnel/pty-wrapper.ts`) using `node-pty` that can spawn CLI processes (like Claude CLI) and stream their output over WebSocket. |
| **Approval Mode** | How an agent handles tool permission requests. Four modes: **Manual** (human approves everything), **Auto** (safe tools auto-approved, dangerous ones need human), **Yolo** (everything auto-approved), **Plan** (read-only, no tool execution). |
| **Permission Layers** | There are 6 layers a tool call passes through before executing: disallowedTools, permissionMode, settingSources, canUseTool callback, PromptManager auto-approval, Claude Code hooks. |
| **MCP** | Model Context Protocol — a standard for connecting AI models to external tools. PIA uses MCP servers like Playwright (browser control) and Context7 (live documentation). |
| **Tailscale** | A mesh VPN that connects all PIA machines over WireGuard encryption. Each machine gets a permanent `100.x.x.x` IP address. Works through firewalls. |

### Communication Terms

| Term | What It Means |
|------|---------------|
| **Cross-Machine Relay** | The system (`src/comms/cross-machine.ts`) that routes messages between machines via WebSocket, Tailscale, ngrok, Discord, or REST API. |
| **MQTT Broker** | A built-in publish/subscribe message broker (`src/comms/mqtt-broker.ts`) with topic hierarchy (`pia/machine/event`). Good for telemetry streaming. |
| **Machine Message Board** | A persistent messaging system between machines, backed by SQLite. Machines can send messages to each other that survive restarts. |
| **Agent Bus** | Inter-agent messaging system for agents to communicate with each other within PIA. |
| **Heartbeat** | A "still alive" signal sent every 30 seconds from workers to the hub. If 3 heartbeats are missed (90 seconds), the hub marks the worker as offline. |

### Development Terms

| Term | What It Means |
|------|---------------|
| **Session Journal** | A markdown file (`SESSION_JOURNAL_YYYY-MM-DD.md`) that every AI agent must update before finishing work. Records all changes, new endpoints, migrations, and decisions. |
| **File Index** | The `FILE_INDEX.md` file that catalogs every `.md` and `.html` file in the repository. Must be updated when files are created or deleted. |
| **Electron Paths** | A centralized path resolution module (`src/electron-paths.ts`) that returns the correct file paths whether PIA is running as CLI (`npm run dev`) or as a packaged Electron desktop app. |
| **Context7** | An MCP server that provides live, up-to-date documentation for any library. Used to audit PIA's dependencies and find best practices. |

### DAO Terms (Separate Project)

| Term | What It Means |
|------|---------------|
| **DAO** | Decentralized Autonomous Organization — the SodaWorld governance system. This is a SEPARATE project that lives in `dao-foundation-files/`. Do NOT modify it from PIA. |
| **SodaWorld** | The broader project umbrella. PIA is the infrastructure layer; SodaWorld DAO is the governance/token layer. |
| **DAOV1** | The DAO's GitHub repository (`Sodaworld2/DAOV1`). Contains all DAO modules, backend, and Solana smart contract. |

---

## 2. Ideas Discussed

Everything that's been discussed, debated, or brainstormed across all sessions.

### Architecture Decisions (Settled)

| Decision | What Was Decided | Why | Session |
|----------|-----------------|-----|---------|
| Hub/Spoke over Peer-to-Peer | One hub coordinates, workers connect to it | Every major orchestration platform (K8s, Docker Swarm, Consul) uses this. P2P needs consensus protocols — months of work for 3 machines. | Feb 16 |
| Tailscale for networking | All machines connected via Tailscale mesh VPN | Free, 5-min setup, WireGuard encryption, stable IPs, NAT traversal. Better than ngrok, SSH tunnels, or mTLS. | Feb 16 |
| Electron for desktop app | Wrap PIA in Electron (not Tauri, NW.js, or PWA) | PIA needs Node.js, node-pty (C++ addon), better-sqlite3 (C++ addon). Only Electron can run all of these internally. | Feb 16 |
| React + shadcn/ui for new UI | Rebuild dashboard with React, not wrap existing HTML | Component-based, TypeScript, testing, hot reload. Slack/Discord/Figma all use React + Electron. Progressive migration — keep old HTML alongside new React. | Feb 16 |
| Baileys over whatsapp-web.js | Switched WhatsApp library | No Chrome/Puppeteer needed (200MB savings), native TypeScript, pure WebSocket, pairing code auth. | Feb 16 |
| SQLite over PostgreSQL | Keep SQLite, don't switch to Postgres | SQLite handles 100K writes/sec, PIA does ~10/sec. Adding a DB server dependency is overkill for 3 machines. Just enable WAL mode and do daily backups. | Feb 16 |
| Gemini for browser vision | Use Gemini 2.0 Flash for screenshot analysis, not Claude | Much cheaper ($0.075/1M vs Claude's pricing), free tier available, vision-capable. Claude stays focused on reasoning/coding. | Feb 16 |

### External Research — Marc Nuri Blog (Feb 2026)

Source: https://blog.marcnuri.com/boosting-developer-productivity-ai-2025

Marc Nuri is a senior open-source developer who went from 10–15 → **25+ GitHub commits/day** purely by restructuring around async AI agent workflows. His findings validate and inform PIA's design:

| Insight | Relevance to PIA |
|---------|-----------------|
| **Parallelism is the real multiplier** — not faster typing, but running multiple agents simultaneously | PIA's multi-machine fleet is exactly this |
| **CLI agents are the game-changer** — they work semi-autonomously (read files, run tests, commit) | PIA uses Claude Agent SDK for exactly this |
| **Role shift: implementer → orchestrator** — you give tasks, review, course-correct | PIA Mission Control is the orchestrator dashboard |
| **Context % matters** — high context window usage = unstable agent, should be visible | ❌ PIA doesn't show this yet — high value to add |
| **Git branch per session** — his dashboard shows current branch per agent | ❌ PIA doesn't show branch — easy to add |
| **Git worktrees** — run multiple CLI agents on the SAME repo safely using separate worktrees | ❌ PIA doesn't use/suggest worktrees yet |
| **Mobile review** — he reviews/approves PRs from his phone | ❌ PIA dashboard not mobile-optimised |
| **Project quality = AI-readiness** — well-tested, consistent codebases get far better AI results | Design principle to adopt |
| **Burnout risk** — async productivity means you're tempted to never stop | Worth noting in PIA docs |

His dashboard (shown in YouTube demo) also displays: project name, initial prompt, git branch, machine name, session duration, model used, **context % used**, current status (waiting/working/needs permission).

### Ideas Explored (Future)

| Idea | What It Is | Status | Notes |
|------|-----------|--------|-------|
| **Hub Failover** | If the hub dies, a worker automatically promotes itself to become the new hub. Other workers reconnect to it. | Not built | Priority list in config. Worker detects hub down after 3 missed heartbeats (90s). Effort: 1-2 weeks. |
| **Vision Pro Spatial View** | Visualize PIA machines as floating 3D panels in Apple Vision Pro. Grab, move, resize data panels in space. | Research done | Start with WebXR in Safari (works with existing HTML), native visionOS later. Agent prompt ready. |
| **Self-Update Fleet Command** | `pia update --fleet` — sends update command to all workers. Each runs git pull, npm install, restarts. | Not built | Needs rollback mechanism. Start with version mismatch detection first. |
| **HTTP Fallback for WebSocket** | If WebSocket connection drops, hub can send commands via HTTP directly to worker's port 3000. | Not built | Workers already have Express running. Lowest-effort, highest-impact resilience improvement. |
| **Agent Checkpointing** | Save agent session state to SQLite every N turns, resume on restart. | Impractical | Claude Agent SDK doesn't support conversation resumption from serialized state. Instead: persist output buffers + mark as "interrupted" on shutdown (already built). |
| **DAO Separation** | Move `dao-foundation-files/` to its own repo (`Sodaworld2/DAOV1`). | Deferred | Waiting for Machine 3 reconciliation. DAOV1 repo already exists on GitHub. |
| **MQTT for Cortex Telemetry** | Use the built-in MQTT broker for streaming telemetry data instead of REST polling. | Planned | MQTT broker already exists (`src/comms/mqtt-broker.ts`). Topic hierarchy: `pia/machine/event`. |
| **Apache Guacamole Integration** | Embed remote desktop in the PIA dashboard — browser-based RDP/VNC/SSH. | Long-term | Would let you see remote machine screens right in the dashboard. Complex setup (Docker). |
| **Context % bar on agent cards** | Show how full the agent's context window is (like Marc Nuri's dashboard). High context = unstable agent. | Planned | SDK exposes `ModelUsage.contextWindow` — see Context7 findings below. |
| **Git branch on agent cards** | Show which branch the agent is working on. | Easy win | Call `git branch --show-current` in the project dir at spawn time. |
| **Git worktree support** | When spawning multiple agents on the same repo, create separate git worktrees automatically. | Planned | Prevents agents overwriting each other's changes. `git worktree add ../agent-worktree-1 main`. |
| **Mobile-optimised dashboard** | Responsive CSS so Mission Control works on phone. | Medium | Enables reviewing/approving agents from anywhere, not just at the desk. |
| **Agent Shops / Marketplace** | A marketplace where pre-built agent configurations can be shared and deployed. | Plan exists | `PROJECT_PLAN_AGENT_SHOPS.md` has the full plan. |

### Design Principles

| Principle | What It Means |
|-----------|--------------|
| **The Brain Gets Fat, Not the Repo** | Git repos stay lean (code only). All telemetry, memories, and knowledge live in local SQLite databases that are `.gitignore`'d. Hot data (24h) in full detail, warm data (30 days) summarized, cold data compressed. Like human memory — you remember patterns, not every raw detail. |
| **Surface-Agnostic Data** | The same JSON API powers every viewing surface — browser dashboard, Vision Pro, tablet, WhatsApp, terminal. The Cortex produces data; renderers consume it. |
| **Workers Are Autonomous** | If the hub dies, workers keep running their existing agents. They just can't receive new commands until the hub comes back (or a failover hub takes over). |
| **Same Codebase, Different Config** | All machines run the same PIA code (same git repo). The only difference is the `.env` file (`PIA_MODE=hub` or `PIA_MODE=local`, different machine name, hub URL for workers). |

---

## 3. System Specification

### What PIA Is Made Of

**Stack:** Express.js + TypeScript + SQLite (better-sqlite3) + Claude Agent SDK + WebSocket (ws)

**Runtime:** Node.js with ESM modules (`"type": "module"` in package.json). Dev mode via `tsx watch`.

**Ports:** HTTP API on 3000, WebSocket on 3001.

### Architecture Diagram

```
                    +---------------------+
                    |   DASHBOARD (you)    |
                    +----------+----------+
                               |
                    +----------v----------+
                    |   HUB (Machine 1)    |
                    |   PIA_MODE=hub       |
                    |                      |
                    |  - API server :3000   |
                    |  - WebSocket :3001    |
                    |  - Aggregator (DB)    |
                    |  - Dashboard HTML     |
                    |  - The Cortex         |
                    +----+------------+----+
                         |            |
                    WebSocket    WebSocket
                         |            |
              +----------v--+  +------v----------+
              |  WORKER      |  |  WORKER          |
              |  PIA_MODE=   |  |  PIA_MODE=       |
              |    local     |  |    local          |
              |              |  |                   |
              |  - HubClient |  |  - HubClient      |
              |  - Agents    |  |  - Agents         |
              |  - Reports   |  |  - Reports        |
              |    to hub    |  |    to hub          |
              +--------------+  +-------------------+
```

### Current Fleet

| Machine | Hostname | Role | CPU | RAM | Tailscale IP |
|---------|----------|------|-----|-----|-------------|
| M1 | Izzit7 | Hub | i9-12900H (20T) | 64 GB | 100.73.133.3 |
| M2 | soda-monster-hunter | Worker | Intel Ultra 7 265K (20T) | 64 GB | 100.127.165.12 |
| M3 | SODA-YETI | Worker | Ryzen 7 7700X (16T) | 32 GB | 100.102.217.69 |
| **TOTAL** | | | **56 threads** | **160 GB** | |

### Core Source Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/mission-control/agent-session.ts` | ~500 | Spawns SDK/PTY/API agents, handles tool approval, streaming, persistence |
| `src/mission-control/prompt-manager.ts` | ~100 | Auto-approval rules (dangerous patterns vs safe commands), prompt queue |
| `src/api/routes/mission-control.ts` | ~400 | REST API: spawn, list, kill, respond, templates, remote routing |
| `src/tunnel/websocket-server.ts` | ~400 | Hub WebSocket: machine tracking, output relay, heartbeat, command buffer |
| `src/tunnel/pty-wrapper.ts` | ~200 | PTY sessions for CLI agent mode |
| `src/local/hub-client.ts` | ~350 | Worker: connects to hub, handles commands (spawn, kill, input), heartbeat |
| `src/hub/aggregator.ts` | ~320 | Hub: machine registry, heartbeat tracking, agent database, project scanning |
| `src/config.ts` | ~100 | All configuration (env vars, defaults) |
| `src/db/database.ts` | ~300 | SQLite init, migrations (042+), WAL mode, performance pragmas |
| `src/index.ts` | ~150 | Entry point: routes to hub or worker mode |
| `src/api/server.ts` | ~300 | Express setup: middleware, routes, security, static files |
| `public/mission-control.html` | ~3000 | Dashboard SPA: agents, terminals, journal, cost, machines, prompts |

### Existing Subsystems (Built But Not Always Wired Together)

| Subsystem | Files | What It Does |
|-----------|-------|-------------|
| **Agent Souls** | `src/souls/soul-engine.ts`, `memory-manager.ts`, `seed-souls.ts` | Persistent AI personalities with memories, goals, relationships. Memories scored by importance, old ones summarized and pruned. |
| **Orchestrator** | `src/orchestrator/execution-engine.ts`, `autonomous-worker.ts`, `task-queue.ts`, `heartbeat.ts` | Task execution loop: pulls from queue, routes through AI, executes tools, tracks cost. Autonomous worker does Claude API tool loops. |
| **Communications** | `src/comms/cross-machine.ts`, `mqtt-broker.ts`, `repo-router.ts`, `discord-bot.ts`, `whatsapp-bot.ts`, `webhooks.ts` | Cross-machine relay (WebSocket/Tailscale/ngrok/Discord/API), MQTT pub/sub, repo registry, Discord/WhatsApp bots. |
| **AI Router** | `src/ai/ai-router.ts`, `cost-tracker.ts` | Routes requests to Claude, Ollama, OpenAI, Gemini, or Grok. Tracks spend per model/agent. |
| **Browser Controller** | `src/browser-controller/controller.ts`, `gemini-vision.ts`, `types.ts` | Playwright + Gemini Vision: screenshot pages, Gemini analyzes them, decides next action, Playwright executes. Multi-step task loop. |
| **The Cortex** | `src/cortex/index.ts`, `cortex-db.ts`, `data-collector.ts`, `intelligence.ts` | Fleet intelligence: collects telemetry every 60s, runs rule-based analysis every 120s, generates insights/alerts. Separate SQLite DB in `data/cortex/`. |
| **Electron App** | `electron-main.cjs`, `electron-preload.cjs`, `src/electron-paths.ts` | Desktop app packaging: ASAR paths, port conflict resolution, crash restart, IPC, auto-update via GitHub Releases. |
| **Fisher2050** | `fisher2050/` directory | Separate Express app on port 3002 — AI Project Manager with its own SQLite database. |

### API Endpoints (Complete)

#### Agent Management
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/mc/agents` | Spawn agent (sdk/api/pty mode, local or remote) |
| GET | `/api/mc/agents` | List all active sessions |
| GET | `/api/mc/agents/:id` | Agent details + output buffer |
| POST | `/api/mc/agents/:id/respond` | Respond to permission prompt |
| POST | `/api/mc/agents/:id/mode` | Change approval mode mid-session |
| POST | `/api/mc/agents/:id/resume` | Resume a previous session |
| DELETE | `/api/mc/agents/:id` | Kill agent |
| GET | `/api/mc/agents/:id/journal` | Activity journal |

#### Machine Management
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/mc/machines` | List all machines |
| GET | `/api/mc/machines/:id/projects` | List git repos for a machine |
| DELETE | `/api/mc/machines/:id` | Remove machine from registry |
| POST | `/api/mc/machines/cleanup` | Remove machines offline > N days |
| POST | `/api/mc/machines/:id/command` | Send command to specific machine |

#### Templates & Prompts
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/mc/templates` | List saved templates |
| POST | `/api/mc/templates` | Save template |
| DELETE | `/api/mc/templates/:id` | Delete template |
| GET | `/api/mc/prompts` | Pending permission prompts |
| GET | `/api/mc/health` | Aggregate stats |

#### The Cortex
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cortex/overview` | Fleet summary: machines, health score, top insights |
| GET | `/api/cortex/machine/:id` | Deep dive: CPU/memory/agent history |
| GET | `/api/cortex/timeline` | Activity over time |
| GET | `/api/cortex/alerts` | Active alerts and suggestions |
| GET | `/api/cortex/insights` | AI observations |
| GET | `/api/cortex/health` | System-wide health score |
| GET | `/api/cortex/workload` | Load distribution |
| POST | `/api/cortex/insights/:id/acknowledge` | Acknowledge insight |
| GET | `/api/cortex/status` | Cortex system status |

#### Browser Controller
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/browser/controller/start` | Launch headless Chromium |
| POST | `/api/browser/controller/command` | Execute browser command |
| GET | `/api/browser/controller/status` | State + last screenshot |
| POST | `/api/browser/controller/stop` | Close browser |

#### Communication
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/machine-board` | List machine messages |
| POST | `/api/machine-board/send` | Send machine-to-machine message |
| GET | `/api/machine-board/stats` | Message statistics |
| GET | `/api/whatsapp/status` | WhatsApp connection status |
| POST | `/api/whatsapp/start` | Start WhatsApp bot |
| POST | `/api/whatsapp/send` | Send WhatsApp message |

#### Settings & System
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/settings` | Read configuration |
| PUT | `/api/settings` | Write configuration |
| GET | `/api/health` | System health check |
| GET | `/api/files/read` | Read file from filesystem |
| POST | `/api/files/write` | Write file to filesystem |

### Database Migrations (as of Feb 17, 2026)

42 migrations from `001` to `042`, including:
- `003_agent_souls` — Souls, memories, interactions tables
- `025_dao_foundation` — DAO tables
- `040_machine_messages` — Machine message board
- `041_fix_unique_constraint` — Per-machine project isolation
- `042_session_resume_support` — Claude session ID for resumption

---

## 4. Current Capabilities

What PIA can actually do right now.

### Working

| Capability | How |
|-----------|-----|
| Spawn AI agents from dashboard | POST to API, choose SDK/PTY/API mode, set model, budget, approval mode |
| Real-time agent output streaming | WebSocket relay from agent to dashboard terminal |
| Multi-machine fleet | Hub + 2 workers connected via Tailscale, heartbeat monitoring |
| Remote agent spawning | Hub forwards spawn command to worker via WebSocket, worker spawns locally |
| Remote browser control | Playwright MCP attached to remote agents, opens real browser on worker |
| Project picker per machine | Auto-scans git repos on each machine, dropdown in spawn dialog |
| Permission system (6 layers) | Auto-approve safe tools, block dangerous patterns, human approval for unknowns |
| Agent Souls (persistent personalities) | Create/manage AI personalities with memories, goals, relationships |
| Machine message board | Persistent cross-machine messaging backed by SQLite |
| The Cortex (fleet intelligence) | Collects telemetry, generates insights/alerts, serves via API |
| Cost tracking | Per-agent token and dollar cost tracking |
| Templates | Save and reuse agent spawn configurations |
| WhatsApp integration | Baileys-based bot, QR auth, message handling (not fully tested) |
| Electron desktop app (Phase 1-3) | Packaged .exe, first-run wizard, settings page, auto-update pipeline |
| Browser automation (Gemini) | Playwright + Gemini Vision for multi-step browser tasks |
| SQLite performance tuning | WAL mode, 64MB cache, mmap, busy timeout, WAL checkpoint monitor |
| WebSocket resilience | Heartbeat ping/pong, dead connection detection, command retry buffer, exponential backoff reconnect |
| Graceful shutdown | Persists agent output buffers, closes WebSocket connections with proper codes |

### Partially Working

| Capability | Status |
|-----------|--------|
| WhatsApp bot | Library swapped to Baileys, code written, not fully tested end-to-end |
| Discord bot | Code exists (`src/comms/discord-bot.ts`), not actively used |
| MQTT broker | Code exists, not wired to Cortex telemetry yet |
| Autonomous Worker | Code exists (`src/orchestrator/autonomous-worker.ts`), not triggered cross-machine |
| Fleet Dashboard mockup | HTML exists (`FLEET_DASHBOARD_MOCKUP.html`), not wired to real data |
| DAO admin dashboard | Plan exists, implementation not started |

---

## 5. Still To Do

Ordered roughly by priority.

### High Priority

| # | Task | Effort | Notes |
|---|------|--------|-------|
| 1 | Commit + push all uncommitted work | 10 min | Multiple sessions of work sitting uncommitted |
| 2 | `/api/system/update` endpoint | 1 day | Remote git pull + npm install + restart across fleet |
| 3 | Version mismatch detection | 1 hour | Workers report git SHA on registration, dashboard shows warnings |
| 4 | Hub failover (auto-promote worker) | 1-2 weeks | Priority list in config, worker promotes itself if hub is down 90s |
| 5 | Wire Autonomous Worker cross-machine | 2-3 days | Already built, just needs cross-machine triggering |

### Medium Priority

| # | Task | Effort | Notes |
|---|------|--------|-------|
| 6 | React + shadcn/ui dashboard rebuild | 2-3 weeks | Progressive migration alongside HTML dashboard |
| 7 | Electron Phase 4 (production hardening) | 2 days | Log rotation, native module edge cases, npx paths |
| 8 | Wire MQTT broker to Cortex telemetry | 3 days | Replace REST polling with pub/sub streaming |
| 9 | Fleet Dashboard (wire mockup to real data) | 3 days | `FLEET_DASHBOARD_MOCKUP.html` ready |
| 10 | Clean up stale machine entries | 30 min | Old Main PC, Main-PC, Remote-Worker-1 in DB |
| 11 | HTTP fallback for WebSocket | 1-2 days | Workers accept commands via HTTP when WS is down |

### Lower Priority

| # | Task | Effort | Notes |
|---|------|--------|-------|
| 12 | DAO separation to DAOV1 repo | When ready | Move `dao-foundation-files/` out. DAOV1 repo exists. |
| 13 | Rotate Anthropic API key | 10 min | Old key was exposed (scrubbed from git, not yet rotated) |
| 14 | Clean up 5 old Firebase service account keys | 15 min | From Google Cloud Console |
| 15 | Process manager (PM2) | 15 min | Auto-restart on crash, auto-start on boot |
| 16 | Agent output persistence on restart | Already built | `persistAllOutputBuffers()` saves to `agent_output_snapshots` table |
| 17 | Vision Pro spatial view | Research done | WebXR first, native visionOS later. Agent prompt ready. |
| 18 | Onboarding / join code wizard | After failover | Makes it easy for new machines to join the fleet |

### Security To-Do

| Item | Status |
|------|--------|
| Firebase credential exposure | RESOLVED — Key deleted, git history scrubbed, audit logs clean |
| Anthropic API key rotation | TODO — Old key was in git history (scrubbed) |
| File API authentication | TODO — Anyone on port 3000 can read/write project files |
| WebSocket authentication hardening | Done — Token-based auth, strict comparison |
| .gitignore hardened | Done — Covers .env, keys, service accounts |

---

## 6. Session Timeline

A chronological summary of every major work session.

| Date | Session | What Happened |
|------|---------|--------------|
| Feb 10 | Journal | Early PIA development |
| Feb 11 | SodaWorld v2 | Research + master planning. Context7 library research. 7 parallel AI agents. Architecture defined. |
| Feb 12 | Hub session | Hub development, Machine 3 work |
| Feb 13 | Phase 1 build | Agent Souls framework + Fisher2050 Project Manager built. Memory manager, soul engine, 3 personality definitions, 15 API endpoints. Mission Control discussion. |
| Feb 14 | Mission Control wiring | Dashboard wired to real backend APIs. PTY mode fixed. 5 bugs found and fixed (WebSocket token, rate limiter, etc). |
| Feb 15 | DAO Admin plan | DAO Admin Dashboard planned (6 tabs). Multi-machine agent control wireframed. Full codebase mapped. |
| Feb 16 (AM) | Permission deep dive | 6-layer permission system discovered. Root cause: SDK `permissionMode: 'default'` blocks internally. Fix: map to `acceptEdits`/`bypassPermissions`. |
| Feb 16 (AM) | Feature sprint | Visual indicators, MCP support, browser agent prototype, permission fix implemented, auth conflict fix. |
| Feb 16 (PM) | Multi-machine | Tailscale chosen. 4 agent briefings created. 89 files committed to GitHub. |
| Feb 16 (PM) | Messaging + WhatsApp | Machine Message Board (SQLite, 7 endpoints). WhatsApp bot (whatsapp-web.js, 5 endpoints). |
| Feb 16 (PM) | Fleet & Cortex | Fleet deployment prompts. The Cortex concept. Discovered 80% already exists. Architecture: hub/spoke with failover confirmed. |
| Feb 16 (PM) | Electron analysis | Full Electron desktop app analysis. React + shadcn/ui. 15 path breakages found. 6-phase build plan. |
| Feb 16 (Eve) | Baileys swap | Replaced whatsapp-web.js (200MB Chrome) with Baileys (2MB WebSocket). |
| Feb 16 (Eve) | Electron build | Phase 1-3: electron-paths.ts, first-run wizard, settings page, auto-update, CI/CD. |
| Feb 16 (Eve) | Gemini browser | Browser controller: Playwright + Gemini Vision. 4 endpoints. Multi-step task loop. |
| Feb 16 (Eve) | Machine linking | All 3 machines online. ESM `require()` bug fixed. Cross-journal review. |
| Feb 16 (Eve) | Cortex Phase 1 | Fleet intelligence built: 5 files, 10 endpoints, separate SQLite DB, 12 rule-based analysis patterns. |
| Feb 17 (AM) | Security fix | Firebase credential exposure remediated. Git history scrubbed. Google Cloud audit — no unauthorized access. |
| Feb 17 (AM) | Remote spawning | Hub-to-spoke command dispatch: spawn, kill, send_input. Output streaming back to dashboard. |
| Feb 17 (PM) | Project registry | Auto-discover git repos per machine. Project picker dropdown in spawn dialog. Migration 041. |
| Feb 17 (PM) | Playwright MCP remote | Successfully controlled Chrome on M2 from M1 hub via Playwright MCP. |
| Feb 17 (PM) | Risk analysis | Architecture review, Tailscale capabilities, screen sharing options, AI framework comparison. |
| Feb 17 (Eve) | Context7 sprint | Library audit of all 8 dependencies. SQLite pragmas, WebSocket hardening, command buffer, shutdown fix, output persistence, stale cleanup. |
| Feb 17 (Eve) | Sprint round 2 | Client-side ping timeout, exponential backoff, maxPayload, graceful shutdown, SDK permission wiring. |
| Feb 17 (Eve) | Final sprint | WAL checkpoint monitor, Playwright MCP config, SDK session resumption (migration 042). |

---

## 7. Key Libraries

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@anthropic-ai/claude-agent-sdk` | Latest | AI agent spawning | Core. query(), stream_event, setPermissionMode(). Full usage tracking — see notes below. |
| `better-sqlite3` | Latest | Database | WAL mode, 5 performance pragmas, 42 migrations |
| `express` | 4.x | HTTP API | Port 3000, helmet, rate limiting, JSON limits |
| `ws` | Latest | WebSocket | Port 3001, heartbeat, maxPayload 1MB, command buffer |
| `node-pty` | Latest | Terminal | PTY sessions for CLI agents (C++ addon) |
| `tsx` | Latest | Dev runner | TypeScript execution with watch mode |
| `nanoid` | Latest | ID generation | Session IDs, machine IDs |
| `@whiskeysockets/baileys` | 7.x | WhatsApp | Pure WebSocket, no Chrome needed |
| `playwright` | Latest | Browser automation | Headless Chromium for browser tasks |
| `@playwright/mcp` | Latest | Browser MCP | MCP server for browser tool use |
| `electron` | Latest | Desktop app | Wraps Express server |
| `electron-builder` | 26.x | Packaging | NSIS + portable targets |
| `electron-updater` | Latest | Auto-update | GitHub Releases based |

### Claude Agent SDK — Context Window & Cost Tracking (Context7, Feb 2026)

**Key finding:** The SDK exposes a `ModelUsage` type with a `contextWindow` field — this is the exact number needed to show context % on agent cards (like Marc Nuri's dashboard).

```typescript
type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;   // ← TOTAL context window size for the model
}
```

**How to get it:**
- Use `onMessage` callback — fires for every assistant message with `.usage`
- Final result object has `result.usage.total_cost_usd` for cumulative cost
- Per-step cost formula: `input * 0.00003 + output * 0.00015 + cacheRead * 0.0000075`

```typescript
const result = await query({
  prompt: "...",
  options: {
    onMessage: (message) => {
      if (message.type === "assistant" && message.usage) {
        const pct = Math.round((message.usage.inputTokens / message.usage.contextWindow) * 100);
        console.log(`Context used: ${pct}%`);
      }
    }
  }
});
console.log("Total cost:", result.usage.total_cost_usd);
```

**PIA action:** Add `contextWindow` field to agent session tracking. Show a progress bar on each agent card: `tokensIn / contextWindow * 100`. Warn (yellow) at 70%, danger (red) at 90%.

Source: https://platform.claude.com/docs/en/agent-sdk/cost-tracking + https://platform.claude.com/docs/en/agent-sdk/typescript

---

### External Research — "Five Levels of Vibe Coding" + Dark Factory (Feb 2026)

Source: YouTube video transcript — Dan Shapiro's framework + StrongDM case study

#### The Five Levels Framework

| Level | Name | What Happens | Who's Here |
|-------|------|-------------|------------|
| 0 | Spicy Autocomplete | AI suggests next line, human types everything | Old Copilot users |
| 1 | Coding Intern | AI does a scoped task, human reviews everything | Most beginners |
| 2 | Junior Developer | AI does multi-file changes, human reads all code | **90% of "AI-native" devs** |
| 3 | Developer as Manager | Human directs AI, reviews at feature/PR level (not line-by-line) | Where most people top out |
| 4 | Developer as Product Manager | Write spec, walk away, check if tests pass, don't read code | Frontier teams |
| 5 | Dark Factory | Spec in → working software out. No human writes or reviews code | StrongDM, Anthropic, OpenAI |

**Where PIA sits:** PIA is the infrastructure that enables users to operate at **Level 3–4**. Mission Control is the orchestration layer. The goal is to give one person the leverage of a team at Level 4.

#### StrongDM Dark Factory — Key Insights

- 3 engineers, no sprints, no standups, no Jira. Just: write specs → evaluate outcomes.
- **Scenarios vs Tests:** Behavioral specs stored **OUTSIDE** the codebase so the agent cannot see (and cannot game) them during development. Like a holdout set in ML. The agent builds software; scenarios evaluate if it actually works. Agent never sees evaluation criteria.
- **Digital Twin Universe:** Simulated clones of every external service (Okta, Jira, Slack, Google Docs) — agents develop and test against twins, never touching real APIs or real data.
- **Metric:** If you haven't spent $1,000 per engineer per day in compute, your factory has room to improve.
- Output: 16,000 lines of Rust, 9,500 lines of Go, 700 lines of TypeScript — all shipped, all agent-written.

#### J-Curve Warning

Developers who bolt AI onto existing workflows get **19% SLOWER** (METR 2025 randomised control trial). They believed they were 24% faster — wrong on direction AND magnitude. The dip happens because the tool changes the workflow but the workflow is not redesigned around it. **PIA must help users redesign the workflow, not just add a tool.**

#### Spec Quality Is The New Bottleneck

> "The bottleneck has moved from implementation speed to spec quality."

The machines build what you describe. If the description is ambiguous, you get software that fills in gaps with machine guesses, not customer-centric guesses. This directly informs how PIA agent prompts and CLAUDE.md should be written — precision matters more than anything.

#### Relevant Numbers (2026)

- 90% of Claude Code's codebase written by Claude Code itself
- 4% of all public GitHub commits authored by Claude Code (projected 20%+ by end of 2026)
- Claude Code: $1B run rate in 6 months since launch
- Junior dev job postings down 67% in the US; UK grad tech roles down 46% in 2024
- AI-native startups averaging $3.5M revenue per employee (vs $600K SaaS average)

---

## 8. Configuration Reference

| Env Variable | Default | Purpose |
|-------------|---------|---------|
| `PIA_MODE` | `hub` | Machine role: `hub` or `local` |
| `PIA_MACHINE_NAME` | hostname | Human-readable machine name |
| `PIA_HUB_URL` | `http://localhost:3000` | Hub URL (for workers) |
| `PIA_SECRET_TOKEN` | `dev-token-change-in-production` | Auth token (must match between hub and all workers) |
| `PORT` | `3000` | HTTP API port |
| `WS_PORT` | `3001` | WebSocket port |
| `PIA_PROJECT_ROOTS` | empty | Extra directories to scan for git repos (comma-separated) |
| `ANTHROPIC_API_KEY` | — | Claude API key |
| `GEMINI_API_KEY` | — | Gemini API key (for browser vision) |

---

*This knowledge base is maintained by AI agents. See `CLAUDE.md` for update rules.*
