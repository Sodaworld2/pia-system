# PIA System — Complete Site Map

**Generated: 2026-02-20**
**Server: http://localhost:3000 (hub, M1 Izzit7)**
**WebSocket: ws://localhost:3001**

---

## 1. Web Pages (HTML)

All pages served statically from `/public`. No auth required unless noted.

| Route | Title | Purpose |
|---|---|---|
| `/` | PIA — Project Intelligence Agent | PWA home screen. Shows machine/agent/cost stats, connection status. Mobile-optimised entry point. |
| `/mission-control.html` | PIA Mission Control | Main operator dashboard (~2800 lines). Spawn agents, view output streams, manage fleet, templates, settings. Primary interface. |
| `/mission-control-cli.html` | PIA Mission Control — CLI Experience | CLI-style dark terminal UI for spawning and monitoring agents. Alternative aesthetic. |
| `/visor.html` | PIA Visor — Machine Governance | Machine governance view. Job queues, task oversight, machine status per worker. |
| `/work.html` | PIA — Start Working | Quick-start "start working" launcher. Shortcut to spawn agents on a project. |
| `/agent-generator.html` | PIA — Agent Generator | Interactive wizard for building soul files. Set identity, personality, goals, rules, examples. |
| `/pia-admin.html` | PIA Admin | Administration panel. Template management, settings, fleet controls. |
| `/settings.html` | PIA Settings | Global settings UI. API keys, approval modes, network policy, budget limits. |
| `/first-run.html` | PIA — First Run Setup | Onboarding wizard. Machine identity setup, token config, hub URL entry. |
| `/guide.html` | PIA — Visual Setup Guide | Visual step-by-step setup guide with illustrated steps. |
| `/simple-guide.html` | AI Agents — The Simple Guide for Everyone | Non-technical explainer. What agents are, how they work, for stakeholders/clients. |
| `/how-it-works.html` | PIA — How It All Works | Technical explainer of the PIA hub/worker/agent architecture. |
| `/how-claude-learns.html` | How Claude Learns — The Simple Guide | Explains context windows, CLAUDE.md, project settings for non-technical readers. |
| `/handbook.html` | PIA Agent Handbook — Complete Guide | Complete reference for building agents: soul tokens, memory, system prompts, costs. |
| `/checklist.html` | PIA Agent Checklist | Pre-flight checklist for deploying a new agent. |
| `/knowledge.html` | PIA — Knowledge Index | Index of all project documentation and knowledge files. |
| `/terminology.html` | PIA System — Complete Terminology | Glossary of all PIA-specific terms: soul, cortex, Owl, Tim Buc, etc. |
| `/pia-book.html` | PIA System — The Book | Full visual knowledge base. HTML render of PIA_KNOWLEDGE_BASE.md. |
| `/showcase.html` | PIA System — Complete Showcase | Feature showcase. Demonstrates all current capabilities with screenshots/demos. |
| `/wireframes.html` | PIA Desktop App — Wireframes | Wireframes for the planned Electron desktop app UI. |
| `/pia-plan.html` | PIA System — The Big Plan | High-level roadmap. Vision, phases, timelines. |
| `/pia-plan-infographic.html` | PIA Orchestrator Plan — Visual Guide | Visual infographic of the PIA orchestration plan. |
| `/pia-diagram.html` | PIA — Architecture: Now vs After | Side-by-side architecture diagram: current state vs. target state. |
| `/pia-mindmap.html` | PIA x SodaLabs — System Architecture | Interactive mind map of the full system architecture. |
| `/pia-storyboard.html` | Club X Launch — Project Storyboard | Example project storyboard showing agent workflow in action (Club X case study). |
| `/system-plan.html` | PIA System v2 — Full System Plan & Wireframes | Detailed v2 technical plan with wireframes, DB schema, scheduled jobs diagram. |
| `/dao-dashboard.html` | SodaWorld DAO — Dashboard | DAO project dashboard. Shows proposals, votes, token balances. (Separate project — do not modify.) |
| `/dao-login.html` | SodaWorld DAO — Sign In | DAO authentication page. (Separate project.) |
| `/dao-tokens.html` | SodaWorld DAO — Token Ledger | DAO token transaction ledger. (Separate project.) |
| `/dao-voting.html` | SodaWorld DAO — Voting | DAO proposal voting interface. (Separate project.) |
| `/offline.html` | PIA — Offline | PWA offline fallback page. Shown when device has no network. |

---

## 2. API Routes

Base URL: `http://localhost:3000/api`

All routes require `Authorization: Bearer <PIA_SECRET_TOKEN>` unless noted.

### /api/agents — Agent Registry (aggregator DB)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/agents` | List all registered agents. Filter by `?machine=` or `?status=` |
| GET | `/api/agents/stats` | Agent counts by status |
| GET | `/api/agents/:id` | Get single agent record |
| POST | `/api/agents` | Create agent record in registry |
| PATCH | `/api/agents/:id` | Update agent metadata |
| POST | `/api/agents/:id/task` | Assign a task to an agent |
| DELETE | `/api/agents/:id` | Delete agent record |

### /api/mc — Mission Control (live session management)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/mc/agents` | Spawn new agent session (local or remote machine) |
| GET | `/api/mc/agents` | List all active sessions (local + remote from hub DB) |
| GET | `/api/mc/agents/fleet` | All agents across all machines (aggregator + MC sessions merged) |
| GET | `/api/mc/agents/:id` | Get agent details + output buffer (50KB) |
| DELETE | `/api/mc/agents/:id` | Kill an agent session |
| POST | `/api/mc/agents/:id/respond` | Send response to agent tool approval prompt |
| POST | `/api/mc/agents/:id/mode` | Set approval mode: `auto`, `manual`, `yolo`, `plan` |
| GET | `/api/mc/agents/:id/journal` | Get activity journal for agent |
| POST | `/api/mc/agents/:id/resume` | Resume a previous session from checkpoint (requires `task` in body) |
| GET | `/api/mc/machines` | All connected machines + status |
| DELETE | `/api/mc/machines/:id` | Remove machine from registry |
| POST | `/api/mc/machines/cleanup` | Remove stale machines offline > N days |
| POST | `/api/mc/machines/:id/command` | Send command to a specific machine via WebSocket relay |
| GET | `/api/mc/machines/:id/projects` | List known git repos on a machine |
| GET | `/api/mc/machines/:id/files/list?path=` | List directory on local or remote machine |
| GET | `/api/mc/machines/:id/files/search?q=&root=` | Search directories on a machine by name |
| POST | `/api/mc/machines/:id/env` | Push environment variables to remote machine's .env |
| GET | `/api/mc/settings` | Get global security defaults (stored in mc_settings table) |
| POST | `/api/mc/settings` | Save global security defaults |
| GET | `/api/mc/prompts` | Get all pending tool approval prompts across all agents |
| GET | `/api/mc/templates` | List saved mission templates |
| POST | `/api/mc/templates` | Save a mission template |
| DELETE | `/api/mc/templates/:id` | Delete a mission template |
| GET | `/api/mc/health` | Aggregate health stats for all agents |
| GET | `/api/mc/debug/command-results` | Last 50 command results from spoke machines (diagnostics) |

### /api/machines — Machine Registry

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/machines` | List all machines |
| GET | `/api/machines/:id` | Get single machine |
| POST | `/api/machines` | Register new machine |
| POST | `/api/machines/:id/heartbeat` | Update machine heartbeat + resource stats |
| PATCH | `/api/machines/:id` | Update machine metadata |
| GET | `/api/machines/:id/power-state` | Get machine power state (online/offline/sleeping) |
| POST | `/api/machines/:id/wake` | Send Wake-on-LAN to machine |
| POST | `/api/machines/:id/bootstrap` | Bootstrap a new machine with PIA config |
| POST | `/api/machines/enroll` | Enroll a new machine into the fleet |
| GET | `/api/machines/:id/agents` | List agents on a machine |
| POST | `/api/machines/:id/spawn` | Spawn agent on specific machine |
| DELETE | `/api/machines/:id` | Remove machine |

### /api/sessions — PTY Sessions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/sessions` | List all PTY sessions |
| GET | `/api/sessions/:id` | Get session details |
| POST | `/api/sessions` | Create new PTY session |
| POST | `/api/sessions/:id/input` | Send keyboard input to session |
| POST | `/api/sessions/:id/resize` | Resize terminal (cols/rows) |
| DELETE | `/api/sessions/:id` | Kill and remove session |

### /api/souls — Soul System

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/souls` | List all souls |
| GET | `/api/souls/:id` | Get single soul |
| POST | `/api/souls` | Create new soul |
| PUT | `/api/souls/:id` | Replace soul definition |
| DELETE | `/api/souls/:id` | Delete soul |
| PATCH | `/api/souls/:id/status` | Activate or deactivate a soul |
| GET | `/api/souls/:id/prompt` | Get rendered system prompt for soul |
| GET | `/api/souls/:id/memories` | List memories for soul |
| GET | `/api/souls/:id/memories/stats` | Memory usage statistics |
| POST | `/api/souls/:id/memories` | Add memory to soul |
| DELETE | `/api/souls/:id/memories/:memoryId` | Delete specific memory |
| POST | `/api/souls/:id/memories/summarize` | Summarise and compress memories |
| POST | `/api/souls/:id/memories/prune` | Prune old/low-relevance memories |
| GET | `/api/souls/:id/interactions` | List past interactions for soul |
| POST | `/api/souls/interact` | Run an interaction through a soul (loads personality + memory) |

### /api/tasks — Task Queue

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/stats` | Task queue statistics |
| GET | `/api/tasks/queue/next` | Peek at next task in queue |
| GET | `/api/tasks` | List tasks. Filter by `?status=`, `?agent=` |
| GET | `/api/tasks/:id` | Get single task |
| POST | `/api/tasks/:id/assign` | Assign task to agent |
| POST | `/api/tasks/:id/complete` | Mark task complete |
| POST | `/api/tasks/:id/fail` | Mark task failed |
| GET | `/api/tasks/engine/stats` | Task engine statistics |
| POST | `/api/tasks/engine/start` | Start task processing engine |
| POST | `/api/tasks/engine/stop` | Stop task processing engine |
| POST | `/api/tasks/engine/config` | Configure task engine (concurrency, retry policy) |

### /api/ai — AI Provider & Cost Management

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ai/status` | AI provider status (Claude, Ollama) |
| GET | `/api/ai/costs` | Total AI costs |
| GET | `/api/ai/costs/daily` | Daily cost breakdown |
| GET | `/api/ai/usage` | Token usage statistics |
| POST | `/api/ai/budget` | Set budget limits |
| POST | `/api/ai/generate` | Direct text generation via AI |
| POST | `/api/ai/review` | AI code/text review |
| POST | `/api/ai/classify` | Classify content with AI |
| GET | `/api/ai/ollama/models` | List available Ollama models |
| POST | `/api/ai/ollama/pull` | Pull a new Ollama model |
| GET | `/api/ai/claude/status` | Claude API connectivity check |

### /api/cortex — Intelligence Layer

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cortex/overview` | Full fleet overview (machines, agents, costs, alerts) |
| GET | `/api/cortex/machine/:id` | Detailed view of a specific machine |
| GET | `/api/cortex/timeline` | Event timeline across all machines |
| GET | `/api/cortex/alerts` | Active alerts from cortex analysis |
| GET | `/api/cortex/insights` | AI-generated insights about fleet state |
| GET | `/api/cortex/health` | Fleet-wide health assessment |
| GET | `/api/cortex/workload` | Workload distribution across machines |
| GET | `/api/cortex/status` | Cortex engine status |
| POST | `/api/cortex/insights/:id/acknowledge` | Acknowledge a specific insight |
| POST | `/api/cortex/insights/acknowledge-all` | Acknowledge all insights |

### /api/orchestrator — Agent Orchestration

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/orchestrator/status` | Orchestrator engine status |
| GET | `/api/orchestrator/instances` | List running orchestrator instances |
| POST | `/api/orchestrator/spawn` | Spawn orchestrated agent instance |
| POST | `/api/orchestrator/send/:instanceId` | Send message to specific instance |
| POST | `/api/orchestrator/broadcast` | Broadcast message to all instances |
| POST | `/api/orchestrator/message` | Send message to named agent |
| POST | `/api/orchestrator/run` | Run an orchestrated task (async) |
| POST | `/api/orchestrator/run-sync` | Run an orchestrated task (synchronous) |
| GET | `/api/orchestrator/task/:id` | Get task status |
| GET | `/api/orchestrator/active` | List active tasks |
| POST | `/api/orchestrator/cancel/:id` | Cancel a running task |

### /api/alerts — Alert System

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/alerts` | List alerts. Filter by `?status=`, `?type=` |
| GET | `/api/alerts/counts` | Alert counts by type/severity |
| GET | `/api/alerts/:id` | Get single alert |
| POST | `/api/alerts` | Create alert |
| POST | `/api/alerts/:id/ack` | Acknowledge alert |
| POST | `/api/alerts/ack-all` | Acknowledge all alerts |

### /api/checkpoints — Session Checkpointing

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/checkpoints` | List all checkpoints |
| GET | `/api/checkpoints/interrupted` | List interrupted sessions (resumable) |
| GET | `/api/checkpoints/:sessionId` | Get checkpoint for session |
| GET | `/api/checkpoints/:sessionId/handoff` | Get handoff document for session |
| POST | `/api/checkpoints/:sessionId/resume` | Resume from checkpoint |
| DELETE | `/api/checkpoints/cleanup` | Delete old checkpoints |

### /api/work-sessions — Project Work Sessions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/work-sessions/projects` | List all known projects |
| POST | `/api/work-sessions/projects` | Register a new project |
| DELETE | `/api/work-sessions/projects/:id` | Remove project |
| GET | `/api/work-sessions/active` | Get currently active work session |
| POST | `/api/work-sessions/start` | Start a work session on a project |
| POST | `/api/work-sessions/:id/end` | End a work session |
| GET | `/api/work-sessions/history` | Work session history |
| GET | `/api/work-sessions/:id` | Get single work session details |

### /api/files — Remote File Access

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/files/write` | Write file to disk |
| GET | `/api/files/read?path=` | Read file from disk |
| GET | `/api/files/list?path=` | List directory contents |
| GET | `/api/files/search?q=&root=` | Search for files by name |

### /api/hooks — Agent Lifecycle Hooks

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/hooks/events` | Submit agent lifecycle event |
| POST | `/api/hooks/done` | Signal agent task completion |
| GET | `/api/hooks/events` | Poll lifecycle events |
| GET | `/api/hooks/status` | Hook system status |

### /api/messages — Agent-to-Agent Messaging

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/messages/send` | Send message to an agent |
| POST | `/api/messages/broadcast` | Broadcast message to all agents |
| GET | `/api/messages/stats` | Message queue statistics |
| GET | `/api/messages/:agentId` | Get messages for an agent |
| POST | `/api/messages/:messageId/read` | Mark message as read |

### /api/machine-board — Machine Message Board

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/machine-board` | List all machine board messages |
| GET | `/api/machine-board/stats` | Message board statistics |
| GET | `/api/machine-board/unread/:machineId` | Get unread messages for machine |
| POST | `/api/machine-board/send` | Post message to machine board |
| POST | `/api/machine-board/:messageId/read` | Mark message read |
| POST | `/api/machine-board/read-all/:machineId` | Mark all messages read for machine |
| DELETE | `/api/machine-board/cleanup` | Delete old messages |

### /api/relay — Cross-Machine Relay

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/relay/register` | Register machine with relay |
| POST | `/api/relay/send` | Send message to specific machine |
| POST | `/api/relay/broadcast` | Broadcast to all relay machines |
| GET | `/api/relay/machines` | List relay-connected machines |
| GET | `/api/relay/messages` | List relay message history |
| GET | `/api/relay/poll/:machineId` | Long-poll for new messages |
| POST | `/api/relay/incoming` | Receive inbound relay message |
| GET | `/api/relay/stats` | Relay statistics |

### /api/repos — Repository Registry

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/repos/register` | Register a git repository |
| GET | `/api/repos` | List all registered repos |
| GET | `/api/repos/stats` | Repository statistics |
| GET | `/api/repos/jobs/all` | List all jobs across all repos |
| GET | `/api/repos/find/:capability` | Find repos by capability tag |
| GET | `/api/repos/:name` | Get repo details |
| GET | `/api/repos/:name/state` | Get repo current state |
| PUT | `/api/repos/:name/state` | Update repo state |
| POST | `/api/repos/:name/task` | Create task for repo |
| GET | `/api/repos/:name/jobs` | List jobs for repo |
| GET | `/api/repos/:name/jobs/:jobId` | Get specific job |
| PUT | `/api/repos/:name/jobs/:jobId` | Update job |

### /api/pubsub — Publish/Subscribe

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/pubsub/publish` | Publish message to topic |
| POST | `/api/pubsub/subscribe` | Subscribe to topic |
| DELETE | `/api/pubsub/subscribe/:id` | Unsubscribe |
| GET | `/api/pubsub/poll/:id` | Long-poll for messages on subscription |
| GET | `/api/pubsub/topics` | List active topics |
| GET | `/api/pubsub/messages/*` | Get messages on a topic |
| GET | `/api/pubsub/retained/*` | Get retained (last) message on topic |
| GET | `/api/pubsub/subscriptions` | List all subscriptions |
| GET | `/api/pubsub/stats` | Pub/sub statistics |

### /api/webhooks — Webhook Management

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/webhooks/register` | Register outbound webhook |
| DELETE | `/api/webhooks/:id` | Delete webhook |
| PUT | `/api/webhooks/:id/active` | Enable/disable webhook |
| GET | `/api/webhooks` | List webhooks |
| GET | `/api/webhooks/stats` | Webhook delivery statistics |
| GET | `/api/webhooks/deliveries` | Delivery history |
| POST | `/api/webhooks/incoming/:source` | Receive inbound webhook from external source |
| GET | `/api/webhooks/incoming` | List received inbound webhooks |
| POST | `/api/webhooks/test/:id` | Test fire a webhook |

### /api/browser — Browser Automation

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/browser/navigate` | Navigate browser to URL |
| POST | `/api/browser/task` | Execute browser automation task |
| GET | `/api/browser/sessions` | List browser sessions |
| POST | `/api/browser/controller/start` | Start browser controller |
| POST | `/api/browser/controller/command` | Send command to browser controller |
| GET | `/api/browser/controller/status` | Get browser controller status |
| POST | `/api/browser/controller/stop` | Stop browser controller |

### /api/whatsapp — WhatsApp Bridge

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/whatsapp/status` | WhatsApp connection status |
| GET | `/api/whatsapp/qr` | Get QR code for WhatsApp Web login |
| POST | `/api/whatsapp/send` | Send WhatsApp message |
| POST | `/api/whatsapp/start` | Start WhatsApp session |
| POST | `/api/whatsapp/stop` | Stop WhatsApp session |

### /api/settings — Global Configuration

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/settings` | Get all settings |
| PUT | `/api/settings` | Update settings |
| GET | `/api/settings/export` | Export settings as JSON |
| POST | `/api/settings/import` | Import settings from JSON |

### /api/security — Network Security

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/security/stats` | Security event statistics |
| GET | `/api/security/events` | Security event log |
| GET | `/api/security/connections` | Active connections |
| POST | `/api/security/block` | Block an IP address |
| POST | `/api/security/unblock` | Unblock an IP address |
| POST | `/api/security/allow-ip` | Add IP to allowlist |
| DELETE | `/api/security/allow-ip` | Remove IP from allowlist |
| GET | `/api/security/allowed-ips` | List allowed IPs |

### /api/mcps — MCP Server Management

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/mcps` | List all MCP server configurations |
| GET | `/api/mcps/project/*` | Get MCP config for a specific project path |
| POST | `/api/mcps` | Add new MCP server |
| DELETE | `/api/mcps/:name` | Remove MCP server |
| POST | `/api/mcps/install` | Install MCP server package |
| GET | `/api/mcps/available` | List available MCP servers from registry |
| POST | `/api/mcps/:name/test` | Test an MCP server connection |

### /api/factory — Agent Factory

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/factory/spawn` | Spawn agent from template |
| GET | `/api/factory/templates` | List agent templates |
| GET | `/api/factory/status` | Factory status |
| POST | `/api/factory/stop/:id` | Stop a factory-spawned agent |
| POST | `/api/factory/stop-all` | Stop all factory agents |
| GET | `/api/factory/cost/status` | Current cost status |
| GET | `/api/factory/cost/estimate` | Estimate cost for a task |

### /api/doctor — System Diagnostics

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/doctor/health` | System health check |
| GET | `/api/doctor/status` | Detailed diagnostics status |
| POST | `/api/doctor/heal/:id` | Attempt to heal a specific issue |
| GET | `/api/doctor/log` | Diagnostic log |
| POST | `/api/doctor/start` | Start diagnostics daemon |
| POST | `/api/doctor/stop` | Stop diagnostics daemon |

### /api/exec — Shell Execution

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/exec` | Execute shell command (returns stdout/stderr) |

### /api/delegation — Tool Delegation

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/delegation/validate` | Validate a tool delegation request |
| GET | `/api/delegation/rules` | List delegation rules |

### /api/system — System Management

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/system/update` | Trigger system update (git pull + restart) |
| POST | `/api/system/restart` | Restart the PIA server process |
| GET | `/api/system/info` | System info (version, uptime, platform) |

### /api/dao/auth — DAO Authentication (no token required)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/dao/auth/...` | DAO authentication endpoints (separate project) |

### /api/modules — DAO Modules (separate project)

| Method | Path | Purpose |
|---|---|---|
| `*` | `/api/modules/...` | DAO module proxy endpoints (separate project — do not modify) |

### /api/dao-proxy — DAO Proxy (separate project)

| Method | Path | Purpose |
|---|---|---|
| `*` | `/api/dao-proxy/...` | DAO proxy endpoints (separate project — do not modify) |

---

## 3. WebSocket Events

**Connection:** `ws://localhost:3001`

Authentication is required. Send `{ type: "auth", payload: { token: "..." } }` before any other message.

### Inbound Events (client → server)

| Event Type | Payload | Purpose |
|---|---|---|
| `auth` | `{ token }` | Authenticate the WebSocket connection |
| `ping` | — | Keep-alive ping. Server responds with `pong`. |
| `pong` | — | Application-level pong (from spoke hub-client) |
| `subscribe` | `{ sessionId }` | Subscribe to a PTY session output stream |
| `unsubscribe` | `{ sessionId }` | Unsubscribe from a PTY session |
| `input` | `{ sessionId, data }` | Send keyboard input to a PTY session |
| `resize` | `{ sessionId, cols, rows }` | Resize a PTY terminal |
| `mc:subscribe` | — | Subscribe to all Mission Control events |
| `mc:respond` | `{ promptId, choice }` | Respond to an agent tool approval prompt |
| `machine:register` | `{ id, name, hostname, capabilities }` | Register a worker machine with the hub |
| `machine:heartbeat` | `{ id, agents, resources }` | Periodic heartbeat from worker machine |
| `machine:status` | `{ id, status }` | Update machine status |
| `agent:register` | `{ machineId, agent }` | Register agent spawned on worker |
| `agent:update` | `{ machineId, agentId, status, progress, current_task }` | Update agent status from worker |
| `agent:remove` | `{ machineId, agentId }` | Signal agent terminated on worker |
| `agent:output` | `{ sessionId, data }` | Stream agent output from worker to hub dashboard |
| `agent:buffer` | `{ sessionId, buffer }` | Send buffered output for a remote agent |
| `command:result` | `{ requestId, action, success, ... }` | Result of a command sent to a spoke machine |
| `relay:register` | `{ id, name, hostname, project, tailscaleIp }` | Register with cross-machine relay |
| `relay:send` | `{ to, content, type, metadata }` | Send relay message to specific machine |
| `relay:broadcast` | `{ content, type, metadata }` | Broadcast relay message to all machines |

### Outbound Events (server → client)

| Event Type | Payload | Purpose |
|---|---|---|
| `auth` | `{ success, payload }` | Auth result |
| `pong` | — | Response to `ping` |
| `buffer` | `{ sessionId, payload }` | Initial buffer dump when subscribing to PTY session |
| `output` | `{ payload }` | Live PTY output delta |
| `exit` | `{ payload: { code } }` | PTY session exited |
| `error` | `{ payload: string }` | Error message |
| `agent:update` | `{ id, ...update }` | Agent state change broadcast |
| `alert` | `{ payload }` | System alert broadcast |
| `machine:update` | `{ payload }` | Machine status change |
| `command` | `{ payload: { action, data } }` | Command sent from hub to spoke machine |
| `relay:message` | `{ payload }` | Cross-machine relay message received |
| `relay:registered` | `{ payload: { status, hub, machine } }` | Relay registration confirmed |
| `mc:output` | `{ sessionId, data, isBuffer? }` | Mission Control agent output stream |
| `mc:status` | `{ sessionId, status, error? }` | Agent status change (running/idle/done/error) |
| `mc:prompt` | `{ id, agentId, question, options, type }` | Agent requesting tool approval from human |
| `mc:journal` | `{ payload }` | Agent activity journal entry |
| `mc:agent_spawned` | `{ id/agentId, machineId, status, task }` | New agent spawned (triggers dashboard card creation) |
| `mc:agent_killed` | `{ payload }` | Agent was killed |
| `mc:browser_status` | `{ payload }` | Browser automation status update |
| `mc:power_event` | `{ payload }` | Machine power state change event |

---

## 4. Agent Architecture

### Machine Fleet

| Machine | Hostname | Mode | Tailscale IP | Role |
|---|---|---|---|---|
| M1 | Izzit7 | `PIA_MODE=hub` | 100.73.133.3 | Hub: API server, WebSocket, aggregator, dashboard, Cortex |
| M2 | soda-monster-hunter | `PIA_MODE=local` | 100.127.165.12 | Worker: project orchestrator, Bird Fountain (design) |
| M3 | Yeti | `PIA_MODE=local` | TBD | Worker: execution layer — Farcake, Andy, Wingspan |

### Agent Hierarchy (Vision)

```
                    CONTROLLER (M1) — gateway, routes everything
                         │
              ┌──────────┴───────────┐
          MONITOR (M1)         FISHER2050 (M1) — resource scheduler
          (push watchdog)            │
                              ┌──────┴──────┐
                           ELIYAHU        OWL (M1)
                           (M1, 6am)     (persistent task list)
                              │
                           TIM BUC (M1) — archivist
                              │
                           RECORDS DB
                         (Claude SDK logs)

EXECUTION LAYER (dispatched by Fisher2050)
        ZIGGI (M2, 2am)    FARCAKE (M3)    ANDY (M3)
        quality auditor     researcher     editorial
        BIRD FOUNTAIN (M2)              WINGSPAN (M3)
        design batch                    presentations
```

### Agent Spawn Modes

| Mode | How | Use Case |
|---|---|---|
| `sdk` | Claude Agent SDK `query()` | Default — structured, streaming, tool approval |
| `pty` | PTY wrapper (node-pty) | Terminal-style interactive sessions |
| `api` | Direct Claude API calls | Lightweight, no SDK overhead |

### Agent Approval Modes

| Mode | Behaviour |
|---|---|
| `auto` | Auto-approves safe tools, blocks destructive patterns |
| `manual` | Every tool use requires human approval via `mc:prompt` |
| `yolo` | Approves everything — no restrictions |
| `plan` | Agent plans only — no tool execution |

---

## 5. Data Stores

### SQLite Database (`pia.db`)

| Table | Purpose |
|---|---|
| `machines` | Registered machines: id, name, hostname, ip, status, capabilities |
| `agents` | Registered agents: id, machine_id, name, type, status, current_task, tokens_used |
| `sessions` | PTY sessions: id, agent_id, status, started_at, ended_at |
| `session_output` | PTY output chunks stored for replay/buffer |
| `tasks` | Task queue: id, title, agent_id, status, priority, created_at |
| `watched_docs` | Files watched for changes (triggers agent actions) |
| `alerts` | System alerts: id, type, severity, message, acked |
| `ai_providers` | AI provider configs (Claude, Ollama) |
| `ai_usage` | Token usage per session/agent |
| `ai_cost_daily` | Daily cost rollups |
| `ai_budgets` | Budget limits and current spend |
| `souls` | Soul definitions: id, name, identity, personality, goals, rules, status |
| `soul_memories` | Persistent memory entries per soul |
| `soul_interactions` | Interaction history per soul |
| `work_sessions` | Active/past work sessions on projects |
| `known_projects` | Git repo registry: path, machine_name, last_worked_at |
| `mc_agent_sessions` | Mission Control agent sessions: id, claude_session_id, config, status, cost, tokens |
| `mc_prompts` | Pending tool approval prompts |
| `mc_journal` | Agent activity journal entries |
| `mc_settings` | Mission Control global settings (key-value) |
| `mc_templates` | Saved mission templates |
| `users` | User accounts (for DAO / auth) |
| `daos` | DAO records (separate project) |
| `dao_members` | DAO membership (separate project) |
| `agreements` | DAO agreements (separate project) |
| `agreement_signatures` | DAO signatures (separate project) |
| `proposals` | DAO proposals (separate project) |
| `votes` | DAO votes (separate project) |
| `ai_conversations` | AI conversation history |
| `knowledge_items` | Knowledge base entries |
| `bounties` | Bounty definitions |
| `marketplace_items` | Marketplace entries |
| `token_transactions` | Token transaction ledger |
| `machine_messages` | Machine board messages (inter-machine comms) |
| `migrations` | Migration tracking table |

### Configuration Files

| File | Purpose |
|---|---|
| `.env` | Environment variables: `PIA_MODE`, `PIA_MACHINE_NAME`, `PIA_HUB_URL`, `PIA_SECRET_TOKEN`, `PORT`, `WS_PORT`, `ANTHROPIC_API_KEY` |
| `MACHINE_IDENTITY.local.md` | Per-machine identity: which machine this is, role, permissions. Git-ignored. |
| `souls/*.json` | Soul definition files loaded into SQLite at startup |
| `pia.db` | SQLite database (all persistent state) |

---

*Last updated: 2026-02-20*
