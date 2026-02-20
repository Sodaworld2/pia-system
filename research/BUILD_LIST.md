# PIA System — Master Build List

**Written: 2026-02-20**
**Source: MASTER_VISION.md, PIA_KNOWLEDGE_BASE.md, SITE_MAP.md, full session research**

> One thing leads to the next. This list is ordered by dependency — if item N depends on item M, M comes first. Do not skip ahead. Everything in Priority 1 must exist before Priority 2 makes sense.

---

## Priority 1: Foundation (Build First — everything else depends on these)

These items are either blocking other build work or are required for the system to function correctly as an always-on AI workforce.

| # | Item | What It Is | Depends On | Estimated Effort |
|---|---|---|---|---|
| 1.1 | **Fisher2050 Agent Spec (full soul + automation profile)** | Write the complete soul JSON for Fisher2050: identity, personality, goals, relationships, rules, schedule. Write the full automation profile: trigger rules (9am, 6pm, on-demand, calendar), machine preference (M1), input (Owl task list), task (break goal → schedule), output (calendar entries + standup emails). This spec is the document the system runs from. | Nothing — write this first | 1 day |
| 1.2 | **Agent Records DB (Claude SDK log capture)** | New SQLite migration (043+) storing per-session: full message history, tool calls, reasoning steps, tokens used, context % per step, cost (total_cost_usd), files consumed vs produced, session duration, agent soul ID, machine ID. Tim Buc cannot file anything until these records exist. This is the foundation of the intelligence pipeline. | 1.1 (need to know what metadata to capture for Fisher's sessions) | 1-2 days |
| 1.3 | **Context % Bar on Agent Cards** | In Mission Control dashboard, show how full each agent's context window is. SDK already exposes `ModelUsage.contextWindow` via `onMessage` callback. Calculate `inputTokens / contextWindow * 100`. Show as a progress bar on each agent card. Yellow at 70%, red at 90%. This is the most actionable real-time signal for knowing when an agent is about to become unstable. | 1.2 (needs records DB to also log context % per turn) | 2 hours |
| 1.4 | **Owl Persistence Layer** | A living task list for the system. At session start: Owl loads task state and feeds it to Controller and Fisher2050 ("here's where you left off"). At session end: Owl updates with what completed and what is still pending. Stored in SQLite — not ephemeral, lives forever, is the thread of continuity between all sessions. Without Owl, every session starts from zero. | 1.2 (Owl reads from and writes to Records DB) | 1 day |
| 1.5 | **Tim Buc Agent (event-triggered archivist)** | Ephemeral agent triggered on every agent session end. Reviews raw Claude SDK logs from Records DB, sorts by project/agent/type/date, applies tags (consumed files, produced files, quality flags, cost), files organised summaries back to Records DB, terminates. This is the event chain that makes the system learn: `session ends → Tim Buc files → Eliyahu reads → briefing`. Without Tim Buc, raw logs sit unread. With him, every session becomes institutional knowledge. | 1.2 (Records DB must exist), 1.4 (Owl must exist so Tim can update task state) | 1 day |
| 1.6 | **Process Manager (PM2)** | Install PM2 on M1, M2, M3. `pm2 start npm -- run dev`, `pm2 startup`, `pm2 save`. Auto-restart on crash, auto-start on machine boot. Without this, a machine reboot kills all PIA services and they do not restart. This is a 15-minute task that eliminates an entire category of outage. | None | 15 min |
| 1.7 | **Anthropic API Key Rotation** | The old API key was in git history (scrubbed from history, but key is still active). Rotate the key via Anthropic console. Update `.env` on M1, M2, M3. Until this is done, there is a live security exposure. | None | 10 min |
| 1.8 | **File API Authentication** | The `/api/files/read` and `/api/files/write` endpoints currently have no access restriction beyond the server being on port 3000. Anyone on the local network (or Tailscale) can read and write project files without authentication. Add the same token-based middleware that protects all other API routes. | None | 30 min |

---

## Priority 2: Agent Intelligence (Core AI workforce architecture)

These build the actual AI employee system from the soul layer outward. They depend on Priority 1 existing.

| # | Item | What It Is | Depends On | Estimated Effort |
|---|---|---|---|---|
| 2.1 | **Calendar-Triggered Spawn** | PIA hub watches a calendar (Google Calendar API or a local iCal/JSON calendar store). Fisher2050 writes calendar entries with: agent name, task description, machine preference, soul ID, input context path, on-complete hooks. At trigger time: PIA checks which machine is available → spawns agent with soul + context. This replaces all manual agent launching and makes the AI workforce schedule visible and editable by non-technical people. | 1.1 (Fisher's spec defines calendar entry format), 1.4 (Owl provides context fed into each entry) | 2-3 days |
| 2.2 | **Monitor Agent (continuous push-based watchdog)** | Always-running agent on M1. Watches: all agent statuses across M1/M2/M3, machine heartbeats, context window % on running agents, cost-per-hour burn rate, stall detection (no output delta for >5 min). When it detects a problem, it pushes to Controller immediately — it does not wait to be asked. This is the Observer pattern: Monitor pushes, Controller never has to poll. | 1.3 (context % data), 1.5 (Tim Buc session events to watch) | 1 day |
| 2.3 | **Eliyahu Agent (intelligence synthesis, 6am daily)** | Ephemeral agent triggered at 6am and when Tim Buc files new records. Reads Tim Buc's organised summaries from Records DB. Connects patterns across projects and agents: "this type of task fails Ziggi review 40% of the time", "that architecture decision from 3 weeks ago is now causing problems". Farms analysis lists to Fisher2050, Ziggi, Farcake. Produces a 2-minute morning briefing email: 3 things that matter today. This is the intelligence layer that transforms raw session data into strategic awareness. | 1.5 (Tim Buc must be filing records before Eliyahu has anything to read) | 1-2 days |
| 2.4 | **Agent Automation Profiles (for each agent)** | Write the full automation profile document for each planned agent: Controller, Monitor, Fisher2050, Eliyahu, Ziggi, Tim Buc, Owl, Farcake, Andy, Bird Fountain, Wingspan. Each profile specifies: Soul, Trigger, Machine, Input (what to read at startup), Task (step-by-step), Output, Reports To, Archives To, On Complete. These are the operating manuals that make the system run without instructions. | 2.1 (calendar-triggered spawn must exist to execute them), 2.3 (Eliyahu spec needed) | 2-3 days |
| 2.5 | **Ziggi Agent (2am quality auditor)** | Ephemeral agent spawned by cron/calendar at 2am. Reads last 24hrs of specialist output from Records DB. Reviews code, content, designs against quality standards. Rates 1-10. Explains the better way. If issues found, files a quality flag that Fisher2050 picks up and creates a re-do task from. The 2am cron is the canonical example of calendar-triggered ephemeral compute — Ziggi costs zero for 23:55 of every day. | 2.1 (calendar-triggered spawn), 1.2 (Records DB to read from), 1.1 (Fisher receives Ziggi's quality flags) | 1 day |
| 2.6 | **Controller Agent (single entry point)** | Always-on agent on M1. Knows all machines, all projects, all active agents (from Owl). When you interact, Controller greets by name, asks which project, loads context from Owl, routes to correct machine and activates the right project boss soul. This is the single door into the entire system — you never speak to M2 or M3 directly. | 1.4 (Owl provides the context Controller loads), 2.4 (all automation profiles must be written before Controller can route to them) | 1 day |
| 2.7 | **Farcake Soul + Profile (research specialist, M3)** | Farcake's complete soul and automation profile. Research engine: does not just search, investigates. Cross-references sources, validates claims, produces structured findings. Triggered by Fisher2050 calendar entry. Output: research report → Tim Buc (archived) + M2 project boss. This is the first execution-layer specialist. Building Farcake validates the full pipeline from Fisher scheduling to M3 execution to Tim Buc archiving. | 2.1 (calendar spawn), 2.4 (automation profiles) | 1 day |
| 2.8 | **Andy Soul + Profile (editorial engine, M3)** | Andy's complete soul and automation profile. Editorial engine: takes Farcake research output and writes in the client's voice. Triggered by Fisher2050 after Farcake completes (the pipeline). Input: Farcake output + voice samples + editorial brief. Output: draft content → GumballCMS or Videohoho + Tim Buc. | 2.7 (Farcake must exist and produce output that Andy consumes) | 1 day |
| 2.9 | **Activity Feed (AI-narrated briefing screen)** | New screen in Mission Control (or separate page). Shows what the AI workforce did today in plain English for non-technical stakeholders. Eliyahu produces the text (morning briefing format). Feed renders: what each agent worked on, any issues found by Ziggi, Fisher's scheduling decisions, cost summary. This is the "morning newspaper" surface. The last piece of the intelligence pipeline made visible. | 2.3 (Eliyahu produces the content), 2.5 (Ziggi quality reports feed in) | 2-3 days |

---

## Priority 3: Communications Infrastructure

The messaging layer that makes agents feel like real team members, not software you configure.

| # | Item | What It Is | Depends On | Estimated Effort |
|---|---|---|---|---|
| 3.1 | **Agent Email Addresses (outbound)** | Set up outbound email sending for each agent: `fisher2050@sodalabs.ai`, `eliyahu@sodalabs.ai`, `ziggi@sodalabs.ai`, `timbuc@sodalabs.ai`, etc. Use SendGrid or Mailgun for outbound (reliable delivery). Eliyahu sends 6am briefing. Fisher sends 9am standup and 6pm summary. Ziggi sends quality report. Configure DKIM/SPF. | 2.3 (Eliyahu needs outbound), 2.5 (Ziggi needs outbound) | 1 day |
| 3.2 | **Agent Email Addresses (inbound)** | Set up inbound email routing for `fisher2050@sodalabs.ai` and `controller@sodalabs.ai`. Email Fisher a goal → Fisher creates tasks and calendar entries. Use Mailgun inbound routing or Cloudflare Email Workers → webhook → `/api/webhooks/incoming/email`. This makes Fisher2050 taskable from any email client, including phone. | 3.1 (outbound must work first), 2.1 (Fisher must be able to create calendar entries from inbound email) | 1-2 days |
| 3.3 | **WebSocket Agent Channels (formalise internal messaging)** | Formalise the existing WebSocket pub/sub system into named agent channels: `#operations` (Fisher2050), `#briefings` (Eliyahu), `#quality` (Ziggi), `#library` (Tim Buc), `#company` (all agents), `#project-*` (per project). The pub/sub system (`/api/pubsub`) already exists. This is wiring it to agent identities and defining the channel contract so agents can publish and subscribe reliably. | Priority 1 complete, 2.4 (automation profiles define which channels each agent uses) | 1 day |
| 3.4 | **WhatsApp → Fisher2050 Bridge (via GumballCMS)** | Connect the existing WhatsApp integration (Baileys) to route inbound WhatsApp messages to Fisher2050. WhatsApp message arrives → WhatsApp bot receives → posts to `/api/messages/send` with `to: fisher2050` → Fisher creates task. This means you can task Fisher from your phone with a WhatsApp message. GumballCMS is the planned long-term home for this, but a direct Baileys webhook works in the interim. | 3.2 (inbound routing concept), existing WhatsApp route (`/api/whatsapp`) | 1-2 days |
| 3.5 | **Inter-Agent Messaging Tool (`send_message`)** | Add `send_message` as an MCP tool available to all agents. Allows agents to send structured messages to each other: `send_message({ to: "fisher2050", content: "Task X complete", type: "status" })`. Routes via the Machine Message Board (`/api/machine-board`) or pub/sub. This is how agents collaborate without human mediation — Fisher tells Andy to start because Farcake finished. | 3.3 (channels must exist), Priority 1 complete | 1 day |

---

## Priority 4: UI/Dashboard Improvements

Visual and UX improvements to Mission Control and the broader interface surface.

| # | Item | What It Is | Depends On | Estimated Effort |
|---|---|---|---|---|
| 4.1 | **Git Branch Display on Agent Cards** | Show which git branch each agent is working on. At spawn time, run `git branch --show-current` in the project cwd. Store on session record. Display on agent card next to project name. From Marc Nuri's research: this is one of the most useful pieces of context when monitoring multiple agents. | Nothing — independent UI improvement | 2-4 hours |
| 4.2 | **Git Worktree Support** | When spawning multiple agents on the same repo, automatically create separate git worktrees: `git worktree add ../agent-worktree-{id} main`. This prevents agents writing over each other's changes. Add worktree path to session config. Clean up worktree on session end. From Marc Nuri's research: this is how you safely run 5+ agents on one repo simultaneously. | 4.1 (branch display confirms worktree is working) | 1-2 days |
| 4.3 | **Mobile-Optimised Mission Control Dashboard** | Responsive CSS so the Mission Control dashboard is usable on a phone. Goals: view agent status/output, approve tool prompts, kill/spawn agents. This enables reviewing and approving AI work from anywhere — the phone becomes the approval interface. Marc Nuri reviews/approves PRs from his phone. We should be able to do the same. | Nothing — independent UI improvement | 2-3 days |
| 4.4 | **Fleet Dashboard (wire mockup to real data)** | `FLEET_DASHBOARD_MOCKUP.html` exists as a static mockup. Wire it to real Cortex API data: machine status, agent counts, cost burn rate, recent activity. This gives an at-a-glance fleet health view separate from the agent-detail Mission Control. | Priority 1 working (to have real data), Cortex already built | 2-3 days |
| 4.5 | **Visor — Machine Governance Screen** | `/visor.html` exists. Wire it to real job queue data from `/api/tasks` and machine status from `/api/machines`. Show per-machine: running agents, queued tasks, resource usage (CPU/RAM). This is the "factory floor" view — what is actually running on each machine right now. | Priority 1 complete | 1-2 days |
| 4.6 | **MQTT Broker → Cortex Telemetry Wiring** | The MQTT broker (`src/comms/mqtt-broker.ts`) exists but is not wired to the Cortex. Replace REST polling in the dashboard with MQTT subscriptions on topic `pia/machine/+/status`, `pia/agent/+/output`. Reduces dashboard HTTP traffic to near zero. Real-time telemetry instead of polling. | Nothing blocking — infrastructure improvement | 2-3 days |
| 4.7 | **Autonomous Worker Cross-Machine Triggering** | `src/orchestrator/autonomous-worker.ts` exists but is not triggered cross-machine. Wire the hub to be able to start an autonomous worker on a remote machine via the WebSocket command channel. Required for Fisher2050 to actually dispatch work to M3 autonomously. | 2.1 (calendar-triggered spawn is the trigger mechanism) | 2-3 days |
| 4.8 | **Version Mismatch Detection** | Workers report their git SHA (`git rev-parse HEAD`) during `machine:register`. Hub compares to its own SHA. Dashboard shows a warning badge if any machine is running a different version of the code. This catches drift before it causes bugs. | Nothing — small infrastructure addition | 1-2 hours |
| 4.9 | **HTTP Fallback for WebSocket Commands** | When a WebSocket command to a spoke machine fails (connection dropped), fall back to sending the same command via HTTP to the worker's `http://{tailscale_ip}:3000/api/...`. Workers already run Express. This dramatically improves fleet command reliability during transient network issues. | None | 1-2 days |

---

## Priority 5: Platform Integrations

Connecting PIA to the external platforms where output gets delivered and instructions arrive.

| # | Item | What It Is | Depends On | Estimated Effort |
|---|---|---|---|---|
| 5.1 | **GumballCMS Integration — Output Delivery** | Connect Andy and Bird Fountain's output to GumballCMS. When Andy produces a content draft: POST to GumballCMS API → creates draft for approval. When Bird Fountain produces assets: upload to GumballCMS media library. GumballCMS is the "last mile" — agents produce, GumballCMS ships. Define the API contract between PIA agents and GumballCMS. | 2.8 (Andy must produce output), Priority 3 (Tim Buc archives output before it ships) | 2-3 days |
| 5.2 | **GumballCMS WhatsApp Bridge (production)** | Replace the direct Baileys integration with GumballCMS as the WhatsApp bridge. GumballCMS already handles WhatsApp natively (it is a WhatsApp-first CMS). Route: you → WhatsApp → GumballCMS → Fisher2050 inbox. GumballCMS becomes both input channel (instructions via WhatsApp) and output channel (content goes live via WhatsApp approval). | 3.4 (interim WhatsApp bridge working), 5.1 (GumballCMS integration existing) | 2-3 days |
| 5.3 | **Videohoho Pipeline Integration (Phase 2)** | Videohoho Phase 2: ElevenLabs TTS for voiceovers, automatic captions, audio ducking, frame analysis. Connect PIA agents to Videohoho: Andy produces script + voiceover text → Videohoho renders video with AI narration → GumballCMS publishes. This completes the content pipeline from research (Farcake) → writing (Andy) → video (Videohoho) → publish (GumballCMS). | 5.1 (GumballCMS integration must exist for the final publish step) | 3-5 days |
| 5.4 | **Document Storage and Management System** | A structured document store in PIA: project briefs, research outputs, drafts, final deliverables. Beyond the Records DB (which stores session logs). Agents can write to it, read from it, and search it. This is the shared workspace that all agents reference. Without it, output lives scattered across file paths and Tim Buc has no canonical place to file produced documents. | 1.2 (Records DB architecture informs this), 1.5 (Tim Buc writes to it) | 2-3 days |
| 5.5 | **Coder Machine (dedicated build agent on M3)** | A specialist agent: receives a feature spec → implements it in an isolated git worktree → runs tests → submits a PR. Pure execution, no management. The PIA equivalent of "dark factory" — spec in, working code out. Required for PIA to build its own features autonomously. | 4.2 (git worktrees), Priority 3 (messaging so Fisher can dispatch specs to Coder), 5.4 (Document store for spec delivery) | 2-3 days |
| 5.6 | **Bird Fountain Production Pipeline** | Bird Fountain (design agent, M2) is listed as "Live" in the vision but needs a real production pipeline: receives creative brief → produces asset batch → delivers to GumballCMS or Videohoho. Define the input format (brief JSON), the output format (asset manifest), and the delivery mechanism. | 5.1 (GumballCMS), 5.3 (Videohoho for video assets) | 2-3 days |
| 5.7 | **Wingspan Deck Versioning System** | Wingspan (presentation agent, M3) tracks every version of every deck: which version went to which investor/client, what changed between versions, what the audience profile was. Needs a lightweight version store (could live in the Document Storage system). Wingspan reads version history at session start, writes new version record at session end. | 5.4 (Document store) | 1-2 days |

---

## Priority 6: Automation and Scheduling

Making the system genuinely self-running rather than requiring human initiation for most tasks.

| # | Item | What It Is | Depends On | Estimated Effort |
|---|---|---|---|---|
| 6.1 | **Queue/Producer-Consumer System** | Formalise the task queue as a proper producer-consumer system. Fisher2050 produces jobs (with machine preference, soul, context, priority). M3 specialists consume one job at a time (M3 can only run one agent at a time). Fisher manages: machine availability checks, slot booking, overrun detection, priority re-ordering, offline-machine rescheduling. The task queue (`/api/tasks`) already exists — this is making Fisher2050 the intelligent producer that manages capacity, not just creates tasks. | 2.1 (calendar-triggered spawn), 1.1 (Fisher2050 spec) | 2-3 days |
| 6.2 | **Fleet Self-Update Command** | `POST /api/system/update` already has the endpoint stub. Implement it: send git pull + npm install + restart command to all workers via WebSocket command channel. Each worker executes and reports back. Add version check before update (compare SHAs). The endpoint exists; the fleet-wide orchestration does not. | 4.8 (version detection), Priority 1 (workers must be stable first) | 1 day |
| 6.3 | **Hub Failover (auto-promote worker)** | If the hub is unreachable for 90 seconds (3 missed heartbeats), the highest-priority configured worker promotes itself to hub: starts dashboard, switches aggregator on, broadcasts its new hub address to other workers. Requires: priority list in each worker's config, workers able to detect hub absence, workers able to start hub services. High effort but eliminates the single point of failure in the entire architecture. | Priority 1 complete, 4.9 (HTTP fallback), all workers must be stable | 1-2 weeks |
| 6.4 | **9am Standup and 6pm Summary (Fisher2050 scheduled emails)** | Fisher2050 sends two scheduled emails per day: 9am standup (what's running today, what's queued, any blockers) and 6pm summary (what completed, cost spent, what Tim Buc filed, Ziggi's overnight quality results). Triggered by calendar entries Fisher writes for himself. These are the human-readable daily rhythm of the AI workforce — you see at a glance what the system did and what it plans. | 3.1 (outbound email), 2.1 (calendar-triggered spawn for Fisher himself) | 1 day |
| 6.5 | **Agent Failsafe and Auto-Restart Rules** | Define rules for what happens when an agent fails, stalls, or hits its budget limit: auto-restart (already built for SDK agents), notify Fisher2050 (so he can reschedule), notify Monitor (who pushes to Controller), back-off period before retry, maximum retry count. These rules need to be configurable per agent soul (a research agent should retry; a quality auditor should not retry on failure). | 2.2 (Monitor), 2.6 (Controller), 1.1 (Fisher receives the failure) | 1-2 days |
| 6.6 | **Weekly Performance Review (Eliyahu automated report)** | Eliyahu generates a weekly report every Friday 5pm: week's output across all agents, quality trends from Ziggi's audits, cost efficiency (output per dollar), patterns that need addressing, suggestions for the coming week. This is the weekly equivalent of the daily briefing — the system reviews its own performance and surfaces recommendations. | 2.3 (Eliyahu), 2.5 (Ziggi), 3.1 (outbound email) | 1 day |

---

## Priority 7: Desktop App (Electron)

Packaging PIA as a standalone installable application. This is a polished product layer on top of the working system.

| # | Item | What It Is | Depends On | Estimated Effort |
|---|---|---|---|---|
| 7.1 | **Electron Phase 4 — Production Hardening** | Phases 1-3 are built (electron-paths.ts, first-run wizard, settings page, auto-update, CI/CD). Phase 4: log rotation (logs in AppData, not stdout), native module edge cases (node-pty, better-sqlite3 on all platforms), npx path resolution in packaged app, crash reporter integration. | Phases 1-3 (already done) | 2 days |
| 7.2 | **React UI — Core Scaffolding** | Set up React + shadcn/ui alongside the existing HTML dashboard. Create the React app in `src/ui/`. Vite build config. Initial routes: `/` (fleet overview), `/agents` (agent list), `/mission-control` (main dashboard). This is the shell — no functionality yet, just the component library and routing working. Progressive migration: HTML dashboard stays live until React is feature-complete. | 7.1 (Electron packaging must handle both HTML and React) | 2-3 days |
| 7.3 | **React UI — Mission Control Port** | Port mission-control.html (~2800 lines) to React components. Priority order: Agent cards (with context % bar, branch display), spawn dialog, output terminal viewer, approval prompts, templates. This is the bulk of the UI migration work. Keep API calls identical — the backend contract does not change. | 7.2 (React scaffolding), Priority 4 improvements (port the improved version, not the old one) | 2-3 weeks |
| 7.4 | **React UI — Fleet Overview Screen** | Fleet-level view in React: all machines as cards with real-time status, agent counts, CPU/RAM gauges, cost burn rate, recent activity feed. This replaces and improves the fleet dashboard mockup. Uses Cortex API data. | 7.2 (React scaffolding), 4.4 (fleet dashboard data wired) | 3-5 days |
| 7.5 | **React UI — Souls/Agent Builder Screen** | Visual agent builder in React. Replace agent-generator.html. Form-based soul creation with live preview of the generated system prompt. Memory manager: view, add, prune memories per agent. Interaction history view. | 7.2 (React scaffolding) | 3-5 days |
| 7.6 | **React UI — Settings and Security Screen** | Settings screen in React: API keys, budget limits, approval mode defaults, network policy, security allowlist/blocklist, MCP server manager. One screen with all configuration rather than scattered HTML settings pages. | 7.2 (React scaffolding) | 2-3 days |
| 7.7 | **Electron + React Integration and Packaging** | Wire the React UI into Electron: main process loads the React build (or Vite dev server in dev mode), IPC bridge for desktop-only features (system tray, native notifications, Wake-on-LAN), electron-builder produces platform-specific installers (.exe for Windows, .dmg for Mac, .deb for Linux). | 7.3, 7.4, 7.5, 7.6 (React UI complete) | 3-5 days |
| 7.8 | **Electron System Tray Integration** | Minimise PIA to system tray. Tray icon shows: number of active agents (badge), colour indicator (green = all idle, yellow = agents working, red = error/attention needed). Right-click menu: Open Dashboard, Quick Spawn, Show Alerts, Quit. Makes PIA feel like a background service, not a window you have to keep open. | 7.7 (Electron + React) | 1 day |
| 7.9 | **NSIS Installer and Auto-Update for Windows** | Finish the NSIS Windows installer: Start Menu shortcut, desktop icon, "Uninstall PIA" in Add/Remove Programs, auto-start on Windows login option. Wire electron-updater to a GitHub releases feed. Users get a notification when a new version is available and can update with one click. | 7.7 (packaging working) | 1-2 days |

---

## Dependency Graph (Summary)

```
Priority 1 (Foundation)
   └── Priority 2 (Agent Intelligence)
         ├── Priority 3 (Communications)
         │     └── Priority 5 (Platform Integrations)
         ├── Priority 4 (UI Improvements)
         │     └── Priority 7 (Desktop App)
         └── Priority 6 (Automation)

Fisher2050 spec (1.1)
   └── Agent Records DB (1.2)
         └── Tim Buc (1.5)
               └── Eliyahu (2.3)
                     └── Activity Feed (2.9)
                     └── Weekly Report (6.6)
         └── Context % bar (1.3)
         └── Owl (1.4)
               └── Controller (2.6)
               └── Calendar-triggered spawn (2.1)
                     └── Ziggi (2.5)
                     └── Fisher queue/producer (6.1)
                           └── Coder Machine (5.5)

Email outbound (3.1)
   └── Email inbound (3.2)
         └── WhatsApp bridge (3.4, 5.2)
   └── Agent channels (3.3)
         └── Inter-agent messaging tool (3.5)

GumballCMS integration (5.1)
   └── Videohoho pipeline (5.3)
   └── Andy pipeline (2.8 → 5.1)

React scaffolding (7.2)
   └── Mission Control port (7.3)
   └── Fleet overview (7.4)
   └── Souls builder (7.5)
   └── Settings screen (7.6)
         └── Electron packaging (7.7)
               └── System tray (7.8)
               └── NSIS installer (7.9)
```

---

## Quick Wins (Can Be Done Any Time, Low Effort)

Items that do not depend on other work and can be slotted in between priority work:

| Item | Effort | What It Is |
|---|---|---|
| Anthropic API key rotation | 10 min | Eliminate live security exposure |
| File API authentication | 30 min | Block unauthenticated file read/write |
| PM2 process manager | 15 min | Auto-restart on crash/reboot across all 3 machines |
| Context % bar (1.3) | 2 hours | Most actionable real-time agent health signal |
| Git branch display on cards | 2-4 hours | From Marc Nuri's research — immediately useful |
| Version mismatch detection | 1-2 hours | Catches drift before it causes bugs |
| Clean up stale machine DB entries | 30 min | Remove "Main PC", "Main-PC", "Remote-Worker-1" |

---

*This list will evolve. When an item is completed, move it to the Session Journal. When new items are discovered, add them in the right priority slot.*

*Last updated: 2026-02-20*
