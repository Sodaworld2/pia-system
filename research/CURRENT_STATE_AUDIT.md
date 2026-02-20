# PIA Current State Audit — 2026-02-20

## Executive Summary

PIA has a substantial amount of real, functional code across communications, orchestration, services, and souls systems. The core hub infrastructure (Express API, WebSocket, SQLite, AgentSessionManager, HeartbeatService, ExecutionEngine, FisherService, SoulEngine, CrossMachineRelay, RepoRouter) is fully wired and starts automatically at boot. The messaging subsystems (AgentBus, MQTTBroker, WebhookManager) are all instantiated as lazy singletons and become live the moment any code calls their getter. The two chat integrations (Discord, WhatsApp) and the old-style PTY-based comms Orchestrator are built and have API routes, but are NOT started at boot — they require explicit user action (a POST to `/api/whatsapp/start`) or an env var (Discord token) to activate.

---

## What Is Actually Running (wired into index.ts and functional)

| Component | File | What It Does | Status |
|---|---|---|---|
| Express API Server | `src/api/server.ts` | Hosts all REST endpoints on port 3000 | RUNNING |
| WebSocket Server | `src/tunnel/websocket-server.ts` | Broadcasts agent output to dashboard browsers, relays hub↔spoke commands | RUNNING |
| SQLite Database | `src/db/database.js` | Persists agents, machines, tasks, souls, memories, sessions | RUNNING |
| Network Sentinel | `src/security/network-sentinel.ts` | Intrusion detection middleware | RUNNING |
| AgentSessionManager | `src/mission-control/agent-session.ts` | Spawns SDK/PTY/API Claude agents, streams output | RUNNING |
| PromptManager | `src/mission-control/prompt-manager.ts` | Tool approval routing (auto/manual/yolo) | RUNNING |
| CrossMachineRelay | `src/comms/cross-machine.ts` | Relays messages between hub and worker machines, persists to DB | WIRED (hub mode only) |
| RepoRouter | `src/comms/repo-router.ts` | Registry and task routing for alive repos across machines | WIRED (hub mode only, singleton init only) |
| Hub Aggregator | `src/hub/aggregator.ts` | Machine registry + heartbeat aggregation from spokes | WIRED (hub mode only) |
| Alert Monitor | `src/hub/alert-monitor.ts` | Fires alerts when thresholds exceeded | WIRED (hub mode only) |
| HeartbeatService | `src/orchestrator/heartbeat.ts` | Reports local machine health (CPU, memory, disk) to DB every 30s | RUNNING |
| ExecutionEngine | `src/orchestrator/execution-engine.ts` | Pulls from TaskQueue, routes to AIRouter — initialized but NOT started (autoStart=false) | WIRED / NOT STARTED |
| Doctor | `src/agents/doctor.ts` | Auto-healer, checks every 60s | RUNNING |
| SoulEngine | `src/souls/soul-engine.ts` | Loads/saves/queries agent souls (personality, goals, memories) from DB | RUNNING |
| SoulSeeder | `src/souls/seed-souls.ts` | Seeds 12 default soul personalities from JSON files on startup | RUNNING |
| MemoryManager | `src/souls/memory-manager.ts` | Adds/retrieves/prunes memories for souls in DB | RUNNING (via SoulEngine) |
| FisherService | `src/services/fisher-service.ts` | Cron-based task scheduling: 4 jobs (standup, evening summary, Ziggi audit, Eliyahu briefing) | RUNNING |
| AutonomousWorker | `src/orchestrator/autonomous-worker.ts` | Claude API tool-loop executor (run_command, read_file, write_file, etc.) | RUNNING (called by FisherService + /api/orchestrator) |
| TaskQueue | `src/orchestrator/task-queue.ts` | Priority-based SQLite-backed task queue | RUNNING |
| The Cortex | `src/cortex/index.ts` | Fleet intelligence brain (collect+analyse intervals) | RUNNING |
| AgentBus | `src/comms/agent-bus.ts` | In-process inter-agent message bus (direct + broadcast) | RUNNING (lazy singleton, becomes live on first use) |
| MQTTBroker | `src/comms/mqtt-broker.ts` | In-process pub/sub with MQTT-style topic wildcards | RUNNING (lazy singleton) |
| WebhookManager | `src/comms/webhooks.ts` | Outgoing webhooks to registered URLs when events fire | RUNNING (lazy singleton) |
| Mission Control API | `src/api/routes/mission-control.ts` | REST API for spawn/list/kill/respond agents, machines, templates, settings | RUNNING |
| WhatsApp API Routes | `src/api/routes/whatsapp.ts` | HTTP endpoints to start/stop/status/send WhatsApp | RUNNING (routes live, bot not auto-started) |
| Local Hub Client | `src/local/hub-client.ts` | Spoke WebSocket client connecting worker to hub | RUNNING (local mode only) |

---

## What Is Built But NOT Wired (code exists, not started at boot)

| Component | File | What It Does | What's Missing to Wire It |
|---|---|---|---|
| Discord Bot | `src/comms/discord-bot.ts` | Full Discord bot via discord.js — receives messages, splits long replies, calls Orchestrator | Needs `discordToken` passed to `createDiscordBot()` + `discord.start()`. No env var wired in index.ts; `initializeCommunications()` from `src/comms/index.ts` is never called. |
| WhatsApp Bot (auto-start) | `src/comms/whatsapp-bot.ts` | Full WhatsApp bot via Baileys WebSocket — QR pairing, message receive/send, session persistence | Bot class is fully built. API routes exist. Bot is NOT auto-started at boot — user must POST `/api/whatsapp/start`. First run requires QR scan. |
| comms/index.ts initializeCommunications | `src/comms/index.ts` | Wires Discord + WhatsApp to the comms Orchestrator | Never imported or called from `src/index.ts`. Must be explicitly called with Discord token + WhatsApp enabled flag. |
| comms/Orchestrator (PTY-based) | `src/comms/orchestrator.ts` | Old-style orchestrator: spawns Claude instances via PTY sessions, routes Discord/WhatsApp messages to them | Referenced by `/api/orchestrator` status endpoint (Discord status check only). The `PIAOrchestrator.spawnClaudeInstance()` method exists but this is NOT the modern SDK-based orchestration. Never started at boot. |
| ExecutionEngine (active loop) | `src/orchestrator/execution-engine.ts` | The polling loop that pulls from TaskQueue and routes to AIRouter | Initialized at boot with `getExecutionEngine()` but `start()` is never called. User must call `POST /api/orchestrator/start` or call `engine.start()` to begin processing queued tasks. |
| PowerManager | `src/services/power-manager.ts` | Wake-on-LAN, TCP probe, SSH bootstrap for remote machines | Fully built (WOL magic packet, tcpProbe, sshBootstrapPIA). Not wired to any route or auto-start. No API routes call it. Must be imported and invoked manually. |

---

## What Needs External Credentials to Work

| Component | Env Var / Service | Current State |
|---|---|---|
| AutonomousWorker (runAutonomousTask) | `ANTHROPIC_API_KEY` or `PIA_CLAUDE_API_KEY` or `CLAUDE_API_KEY` | Required for any autonomous task. FisherService cron jobs will fail silently if missing. Worker returns error message instead of running. |
| AgentSessionManager (SDK mode) | `ANTHROPIC_API_KEY` (consumed by Claude Agent SDK) | Required for all SDK-mode agent spawns from Mission Control. |
| FisherService (cron jobs) | `ANTHROPIC_API_KEY` | All 4 cron jobs (standup, summary, Ziggi, Eliyahu) call `runAutonomousTask()` which requires the API key. |
| Discord Bot | Discord bot token (hardcoded into `createDiscordBot({token})`) — no env var defined in config.ts | `initializeCommunications()` with `discordToken` must be called. No standard env var currently wired. |
| WhatsApp Bot | No API key needed — uses Baileys WebSocket protocol with QR scan auth | Session stored at `data/whatsapp-session/`. First run requires physical QR scan with a real WhatsApp phone. |
| CrossMachineRelay HTTP delivery | `PIA_SECRET_TOKEN` (has hardcoded fallback: `pia-local-dev-token-2024`) | Works without it using the fallback, but should be set per-fleet for security. |
| AI Router (execution engine tasks) | Provider-specific keys (Anthropic, OpenRouter, Ollama, etc.) via config | Depends on which providers are configured in `src/ai/ai-router.ts`. |
| PowerManager (SSH bootstrap) | SSH access to remote machine (key-based or password), Tailscale IP in machine capabilities JSON | `macAddress` + `tailscaleIp` must be stored in machine's `capabilities` field in DB. |

---

## The Real Capability List (what PIA can actually do RIGHT NOW)

1. Spawn Claude SDK agents (claude-opus-4-6, claude-sonnet-*, etc.) via `POST /api/mc/agents` with full tool-approval routing (auto/manual/yolo/plan).
2. Stream agent output in real-time to the dashboard via WebSocket (`mc:output` events).
3. Remote spawn: send a spawn command from hub to a spoke machine over WebSocket, agent runs there, output relays back.
4. Manage a fleet of machines in the hub DB — register, heartbeat, last-seen tracking.
5. Track agent cost per session (tokens in/out, USD estimate) and display on dashboard.
6. Save and load mission templates (agent config presets) from DB.
7. Approve or deny individual tool calls for a running agent (manual approval mode).
8. Kill any running agent session.
9. Resume a previous agent session using its `claude_session_id` checkpoint.
10. Run autonomous tool-loop tasks (run_command, read_file, write_file, list_directory) against the Claude API directly, with budget + turn limits.
11. Automatically schedule 4 recurring tasks via cron (Fisher2050 standup, evening summary, Ziggi code review, Eliyahu briefing) — fires daily/weekdays at configured times if `ANTHROPIC_API_KEY` is set.
12. Load 12 agent soul personalities from JSON files into DB at boot (Fisher2050, Ziggi, Eliyahu, Tim Buc, Controller, Farcake, Andy, Wingspan, Bird Fountain, Coder Machine, Monitor, Owl).
13. Inject soul personality + goal + memory context into agent system prompts (SoulEngine.generateSystemPrompt).
14. Save memories back to soul after each autonomous task (task started / completed events).
15. Publish and subscribe to in-process messages between agents (AgentBus — direct and broadcast).
16. Topic-based pub/sub with MQTT-style wildcards via MQTTBroker (in-process only, no external MQTT server needed).
17. Register webhook URLs and fire HTTP POST callbacks when events happen (WebhookManager).
18. Route cross-machine messages via WebSocket relay, with HTTP fallback to Tailscale/ngrok URL.
19. Register repos with the RepoRouter, send tasks to repos by name, track job history.
20. Detect system resources (CPU, RAM, uptime) via HeartbeatService and store in DB.
21. View a full fleet dashboard at `/mission-control.html` including agent cards, machine list, machine board.
22. Start/stop WhatsApp bot on demand via API (`POST /api/whatsapp/start`) — routes messages through comms Orchestrator.
23. Store and retrieve per-soul memories (categorized, importance-scored, summarizable) in DB.
24. Send commands to remote machines and get async responses via `ws.sendToMachineAsync()`.
25. List directory contents and search directories on remote machines via mission-control API.
26. Push `.env` variable updates to remote machines via WebSocket relay.
27. Proxy agent respond calls to remote machines via HTTP (using stored IP in DB).
28. Auto-open Visor dashboard in browser on hub startup.

---

## The Real Gap List (what's built but not operational)

1. **Discord bot is not connected to anything.** `PIADiscordBot` is fully built but `initializeCommunications()` is never called. No Discord token env var is wired in `config.ts` or `index.ts`. To activate: add `DISCORD_BOT_TOKEN` to config, call `createDiscordBot({token})` + `.start()` in `startHub()`.

2. **ExecutionEngine never actually runs.** `getExecutionEngine()` is called at boot (creates the instance) but `.start()` is never called. The task queue can accumulate tasks but nothing processes them automatically. To activate: call `engine.start()` at the end of `startHub()`, or expose `POST /api/orchestrator/engine/start`.

3. **FisherService cron jobs silently do nothing without `ANTHROPIC_API_KEY`.** The scheduler fires correctly, but `runAutonomousTask()` returns an error object instead of running. The error is logged but no alert is raised. To activate: ensure `ANTHROPIC_API_KEY` is set in `.env`.

4. **PowerManager has no API routes.** Wake-on-LAN, TCP probe, and SSH bootstrap are fully coded but there are zero API routes that call them. The dashboard has no UI for it. To activate: create `/api/power/:machineId/wake` and `/api/power/:machineId/bootstrap` routes in a new `src/api/routes/power.ts`.

5. **WhatsApp bot requires manual start + physical QR scan.** The bot is NOT auto-started. User must call `POST /api/whatsapp/start` and then scan the QR code with a real phone. Session is persisted, so after first scan it auto-reconnects. To activate automatically: call `createWhatsAppBot().start()` in `startHub()` after checking if `PIA_WHATSAPP_ENABLED=true`.

6. **comms/Orchestrator (PTY-based) is obsolete.** The old `PIAOrchestrator` spawns Claude via PTY (`powershell.exe → claude`). This is superseded by the modern `AgentSessionManager` SDK flow. It is referenced only for a Discord status check. The `PIAOrchestrator.handleHumanMessage()` parser (status/spawn/broadcast commands) is unused.

7. **SoulEngine memories accumulate but are never summarized.** `MemoryManager` has methods for summarization and pruning but there is no scheduled job to call them. Over time, soul context windows will grow indefinitely. To activate: add a nightly cron job in FisherService calling `memoryManager.summarizeOldMemories()`.

8. **RepoRouter has no repos registered.** The singleton is initialized at boot, but no repos send registration calls to it. It will remain empty unless other repos (DAO, farcake, etc.) call `POST /api/repos/register`. The job routing infrastructure is ready but inert.

9. **MQTTBroker and WebhookManager have no external subscribers.** Both are lazy singletons that activate when first called (RepoRouter and FisherService use them). But no repos have registered webhooks and no external MQTT clients are connected. They are operational internally but produce no external effects.

10. **CrossMachineRelay's HTTP fallback path (Tailscale/ngrok) is untested.** WebSocket delivery works. HTTP delivery falls back to `tailscaleIp` or `ngrokUrl` stored on the `RemoteMachine` record, but these fields are never populated from the spoke registration payload. Only WebSocket delivery is proven.

---

## Recommended "Activate Now" Priority Order

**1. Set `ANTHROPIC_API_KEY` in `.env` (0 code changes needed)**
- Immediately activates: all SDK agent spawns from the dashboard, all FisherService cron jobs (standup, summary, Ziggi, Eliyahu), all autonomous task runs.
- This is the single highest-leverage action — most of the built code needs this key to do anything.

**2. Start the ExecutionEngine (1-line code change in `src/index.ts`)**
- Change `getExecutionEngine()` to `initExecutionEngine({ autoStart: true })` in `startHub()`.
- Immediately activates: task queue processing, AI Router waterfall (Anthropic → OpenRouter → Ollama), Doctor integration.
- Impact: agents can now have tasks assigned to them via the task queue API and will actually execute.

**3. Wire Discord bot (10 lines in `src/index.ts` + 1 env var)**
- Add `DISCORD_BOT_TOKEN` to `.env` and `config.ts`.
- In `startHub()`, call `initializeCommunications({ discordToken: config.discord.token })`.
- Immediately activates: Discord → PIA messaging, bot can relay commands to agents via the comms Orchestrator (or better, route directly to `AgentSessionManager`).

**4. Add PowerManager API routes (new file: `src/api/routes/power.ts`, ~80 lines)**
- Wire: `POST /api/power/:machineId/wake`, `POST /api/power/:machineId/bootstrap`, `GET /api/power/:machineId/state`.
- The PowerManager code is complete. Only the route layer is missing.
- Immediately activates: Wake-on-LAN remote machine control from the dashboard.

**5. Auto-start WhatsApp on hub boot (3 lines in `src/index.ts`)**
- Add `PIA_WHATSAPP_ENABLED=true` to `.env`.
- In `startHub()`, if env var is set: `createWhatsAppBot().start()`.
- Immediately activates: WhatsApp → PIA messaging pipeline on boot (after initial QR scan).

**6. Schedule memory summarization in FisherService (10 lines in `src/services/fisher-service.ts`)**
- Add a weekly cron job that calls `getSoulEngine().getMemoryManager().summarizeOldMemories()` for each active soul.
- Prevents soul context window bloat over time as memories accumulate.

**7. Fix Tailscale IP population in RemoteMachine registration**
- When spokes register via WebSocket in `src/hub/aggregator.ts`, store `tailscaleIp` from the registration payload into the `CrossMachineRelay.registerMachine()` call.
- Immediately activates: HTTP fallback delivery for machines that lose WebSocket but retain Tailscale connectivity.
