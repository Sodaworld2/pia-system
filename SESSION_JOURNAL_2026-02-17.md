# Session Journal — 2026-02-17

## Session 1: Security Remediation — Firebase Credential Exposure (Opus 4.6)

### Background
Google Cloud sent an abuse notification: Firebase service account key (`a90beda8b12054486a57f8a86c3942c1a4509489`) was exposed in a public GitHub commit (`2afc70a`). Immediate action required.

### What Was Done

#### 1. Git History Scrubbed (completed Feb 16 late night)
- Deleted `firebase-service-account.json` and `.playwright-mcp` copy from disk
- Removed hardcoded Firebase Web API key from 4 DAO HTML files (replaced with `REPLACE_WITH_*` placeholders)
- Used `git-filter-repo` to scrub ALL of these from entire git history:
  - `firebase-service-account.json`
  - `.env.keys` (contained Anthropic API key)
  - Firebase Web API key string
- Force pushed clean history twice
- Updated `.gitignore` with broader patterns

#### 2. Google Cloud Console — Key Deletion (Feb 17)
- Opened Playwright browser automation for Google Cloud Console
- User logged in and navigated to Service Accounts
- Confirmed `firebase-adminsdk-fbsvc@sodaworld-de88e` service account
- **Compromised key `a90beda8b12054486a57f8a86c3942c1a4509489` — DELETED by user**
- Google had already auto-disabled it on Feb 16, 19:44 SAST

#### 3. Audit Log Review (Feb 17)
- **Usage logs (7 days): NO entries** — no unauthorized API calls made with the exposed key
- **Change logs (7 days): 3 entries only** — all legitimate:
  1. `2026-02-15 13:42` — `CreateServiceAccountKey` by `mic@sodaworld.tv`
  2. `2026-02-16 19:44` — `DisableServiceAccountKey` by `gcp-compromised-key-response@system.g...` (Google auto-disabled)
  3. `2026-02-17 04:56` — `DeleteServiceAccountKey` by `mic@sodaworld.tv`
- **Compute Engine: API NOT ENABLED** — no VMs could have been spun up (no crypto mining risk)

#### 4. Remaining Active Keys
5 active keys remain on the firebase-adminsdk service account:
| Key ID (prefix) | Created | Status |
|---|---|---|
| `e7c7def0e430...` | Oct 10, 2025 | Active |
| `069c9188f0aa...` | Oct 10, 2025 | Active |
| `ea5c25341226...` | Oct 27, 2025 | Active |
| `14234b4a2edf...` | Dec 31, 2025 | Active |
| `673d938b0f0f...` | Jan 5, 2026 | Active |

These may be from previous iterations — recommend cleaning up unused ones.

### Security Remediation Checklist

| Step | Status |
|---|---|
| Compromised key deleted from Google Cloud | DONE |
| Key auto-disabled by Google | CONFIRMED |
| Git history scrubbed (firebase key) | DONE |
| Git history scrubbed (.env.keys/Anthropic key) | DONE |
| Firebase Web API keys removed from code | DONE |
| .gitignore hardened | DONE |
| Force pushed clean history | DONE |
| Audit logs reviewed — no unauthorized access | CONFIRMED |
| Compute Engine checked — API not enabled | CONFIRMED |
| Rotate Anthropic API key | TODO |
| Clean up 5 old active Firebase keys | TODO |
| Submit Google Cloud appeal (if required) | TODO |

### Files Changed
| File | Change |
|---|---|
| `data/gcloud-helper.cjs` | **NEW** — Playwright command-loop script for Google Cloud Console |
| `data/screenshots/*.png` | **NEW** — Screenshots from browser automation |

### Desktop App Impact
None — this was a security remediation session, no code changes to the server.

---

## Session 2: Remote Agent Spawning — Hub-to-Spoke Command Dispatch (Opus 4.6)

### What Was Built

Implemented the missing hub-to-spoke command execution path that enables spawning, killing, and controlling agents on remote machines from Mission Control.

### Architecture

```
Dashboard → POST /api/mc/agents { machineId: "xyz" }
  → if machineId !== 'local':
    → ws.sendToMachine(machineId, { type: 'command', payload: { action: 'spawn_agent', data: {...} } })
    → spoke HubClient receives command
    → spoke calls AgentSessionManager.spawn() locally
    → spoke registers agent with hub via agent:register
    → spoke streams status updates back to hub
```

### Changes

#### 1. WebSocket Server — Machine Connection Tracking (`src/tunnel/websocket-server.ts`)
- Added `machineClients` map: tracks `machineId → WebSocket` for each connected spoke
- Machine WebSocket is recorded when `machine:register` message arrives
- Cleaned up on disconnect
- **New method**: `sendToMachine(machineId, msg)` — targeted command send to specific spoke
- **New method**: `getConnectedMachines()` — list of online machine IDs

#### 2. Hub Client — Command Handlers (`src/local/hub-client.ts`)
Implemented 3 previously-stubbed command handlers:
- **`spawn_agent`**: Receives spawn config from hub, calls `AgentSessionManager.spawn()` locally, registers agent with hub, wires up status/complete/error events to send updates back
- **`kill_agent`**: Receives agentId, kills via `AgentSessionManager.kill()`, removes from hub
- **`send_input`**: Receives agentId + input, routes to `AgentSessionManager.respond()`

All handlers send `command:result` messages back to hub for confirmation/error reporting.

#### 3. Mission Control API — Remote Routing (`src/api/routes/mission-control.ts`)
- **`POST /api/mc/agents`**: Now checks `machineId` — if not `'local'`, uses `sendToMachine()` to forward spawn request to remote spoke. Returns 202 Accepted (async operation).
- **`POST /api/mc/machines/:id/command`**: Changed from `broadcast()` to `sendToMachine()` for targeted delivery. Falls back to broadcast if machine not directly connected.

### Files Changed
| File | Change |
|---|---|
| `src/tunnel/websocket-server.ts` | Added `machineClients` map, `sendToMachine()`, `getConnectedMachines()`, machine tracking on register/disconnect |
| `src/local/hub-client.ts` | Implemented `handleSpawnAgent()`, `handleKillAgent()`, `handleSendInput()` with full agent lifecycle management |
| `src/api/routes/mission-control.ts` | Remote spawn routing (machineId check), targeted command sending |

### TypeScript Status
Zero PIA errors (all errors from dao-foundation-files/ which is excluded).

### Desktop App Impact
No changes to Electron paths or packaging. Remote spawning uses the same AgentSessionManager that already works in packaged mode via electron-paths.ts.

### New WebSocket Events
| Event | Direction | Purpose |
|---|---|---|
| `command` (with `action: spawn_agent`) | Hub → Spoke | Request agent spawn on remote machine |
| `command` (with `action: kill_agent`) | Hub → Spoke | Request agent kill on remote machine |
| `command` (with `action: send_input`) | Hub → Spoke | Send input to remote agent |
| `command:result` | Spoke → Hub | Confirmation/error from command execution |

### What's Still Missing
- Dashboard UI changes to show which machine an agent runs on

---

## Session 2b: Remote Agent Output Streaming (Opus 4.6)

### What Was Built

Real-time output streaming from remote agents on spokes back to the hub dashboard, completing the full remote agent lifecycle.

### Architecture

```
Spoke: AgentSessionManager emits 'output'
  → HubClient sends { type: 'agent:output', payload: { machineId, sessionId, data } }
  → Hub WebSocket receives 'agent:output'
  → broadcastMc({ type: 'mc:output', payload: { sessionId, data } })
  → Dashboard renders it exactly like local agent output
```

### Changes

#### 1. Spoke Output Forwarding (`src/local/hub-client.ts`)
- Wired `mgr.on('output')` in `handleSpawnAgent()` to send `agent:output` messages to hub in real-time
- New `handleGetBuffer()` handler: when hub sends `get_buffer` command, spoke responds with `agent:buffer` containing the last 50KB of the agent's output buffer
- Added `get_buffer` to the command switch

#### 2. Hub WebSocket Relay (`src/tunnel/websocket-server.ts`)
- Added `agent:output`, `agent:buffer`, `command:result` to `IncomingMessage` types
- **`agent:output`**: Received from spoke → broadcast as `mc:output` to all MC subscribers (dashboard sees it as if it were local)
- **`agent:buffer`**: Received from spoke → broadcast as `mc:output` with `isBuffer: true` flag
- **`command:result`**: Received from spoke → if spawn success, broadcast `mc:agent_spawned` to MC subscribers + log

#### 3. Remote Buffer Retrieval (`src/api/routes/mission-control.ts`)
- Modified `GET /api/mc/agents/:id` to handle remote agents:
  - If local session exists → return directly (unchanged)
  - If `?machineId=X` query param provided → send `get_buffer` command to spoke, return 200 with `bufferRequested: true` (buffer arrives via WebSocket)
  - If found in aggregator DB → return DB record with note about buffer retrieval
  - Otherwise → 404

### Files Changed
| File | Change |
|---|---|
| `src/local/hub-client.ts` | Output streaming in spawn handler, `handleGetBuffer()`, `get_buffer` command |
| `src/tunnel/websocket-server.ts` | `agent:output`/`agent:buffer`/`command:result` handling, relay to MC |
| `src/api/routes/mission-control.ts` | Remote agent detail + buffer request proxy |

### New WebSocket Events
| Event | Direction | Purpose |
|---|---|---|
| `agent:output` | Spoke → Hub | Real-time text output from remote agent |
| `agent:buffer` | Spoke → Hub | Full output buffer (on-demand request) |
| `command:result` | Spoke → Hub | Spawn/kill confirmation |
| `mc:agent_spawned` | Hub → Dashboard | Notification that remote agent was spawned |

### TypeScript Status
Zero PIA errors.

### Desktop App Impact
No Electron-specific changes. Output streaming uses the same WebSocket channel the dashboard already connects to.

---

## Machine 2 (soda-monster-hunter) Setup Instructions

### Give this ENTIRE block to Claude on Machine 2:

```
You are setting up PIA on this machine (soda-monster-hunter). Run ALL of these steps in order.
Every command must run in PowerShell as Administrator.

STEP 1 — Open firewall for Tailscale network (so M1 hub can reach us):
powershell -Command "New-NetFirewallRule -Name 'Allow-All-Tailscale' -DisplayName 'Allow All Tailscale' -Direction Inbound -RemoteAddress 100.64.0.0/10 -Action Allow"

STEP 2 — Install and start OpenSSH Server (for remote access):
powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0; Start-Service sshd; Set-Service -Name sshd -StartupType Automatic"

STEP 3 — Enable PowerShell Remoting:
powershell -Command "Enable-PSRemoting -Force -SkipNetworkProfileCheck; Set-Item WSMan:\localhost\Client\TrustedHosts -Value '100.73.133.3,100.102.217.69' -Force"

STEP 4 — Open firewall for PIA server ports:
powershell -Command "New-NetFirewallRule -Name 'PIA-Server' -DisplayName 'PIA Server' -Direction Inbound -LocalPort 3000,3001 -Protocol TCP -Action Allow"

STEP 5 — Clone PIA (the git history was rewritten, you need a fresh clone):
If C:\Users\mic\Downloads\pia-system already exists, delete it:
  rmdir /s /q "C:\Users\mic\Downloads\pia-system"
Then clone fresh:
  cd C:\Users\mic\Downloads
  git clone https://github.com/Sodaworld2/pia-system.git
  cd pia-system
  npm install

STEP 6 — Create .env file at C:\Users\mic\Downloads\pia-system\.env containing exactly:
PIA_MODE=local
PIA_MACHINE_NAME=soda-monster-hunter
PIA_HUB_URL=http://100.73.133.3:3000
PIA_SECRET_TOKEN=pia-fleet-token-2024
PORT=3000
WS_PORT=3001

STEP 7 — Start PIA:
  cd C:\Users\mic\Downloads\pia-system
  npm run dev

STEP 8 — Verify connectivity (run this AFTER PIA starts):
  curl http://100.73.133.3:3000/api/health

If step 8 returns {"status":"ok"}, the hub can see you and you should appear in Mission Control.
```

### Machine 3 (soda-yeti) Setup Instructions

Same as Machine 2, but change STEP 6 to:
```
PIA_MACHINE_NAME=soda-yeti
```

### Network Status (as of this session)
| Machine | Tailscale | Ping | SSH | PIA | SMB |
|---|---|---|---|---|---|
| M1 Izzit7 | Active | N/A | N/A | Running | N/A |
| M2 soda-monster-hunter | Active | Blocked | Blocked | Not running | Blocked |
| M3 soda-yeti | Active | OK (36ms) | Blocked | Not running | Open |

M2 has Windows firewall blocking ALL incoming. Steps 1-4 above fix this.
M3 is reachable but needs SSH + PIA installed.

---

## Session 3: Spoke-Side Bug Fixes & Architecture Audit (Opus 4.6)

### What Was Done

#### 1. Architecture Audit — Spoke Command Handlers
Deep audit of the end-to-end requestId flow between hub and spoke. Traced the full path:
```
Hub: sendToMachineAsync() generates requestId → stores in pendingRequests map
  → sendToMachine() → WebSocket message to spoke
Spoke: handleListDirectory/handleSearchDirectory → extracts requestId
  → does work → sends command:result with requestId back
Hub: receives command:result → matches requestId → resolves promise → returns to REST endpoint
```

Verified: The requestId flow is **correct and complete**. Three bugs identified and fixed.

#### 2. Bug Fix: requestId Validation (`src/local/hub-client.ts`)
**Problem**: `requestId` was extracted inside the try block. If extraction threw, the catch block used `(data as any).requestId` — inconsistent. If requestId was `undefined`, the hub's matching code (`if (p.requestId && ...`) would silently skip the response, leaving the API call hanging forever.

**Fix**: Extract requestId with `|| ''` fallback **before** the try block. Both success and error paths use the same variable.

#### 3. Bug Fix: Spoke Search Timeout (`src/local/hub-client.ts`)
**Problem**: `handleSearchDirectory()` had no time limit. BFS traversal of large directory trees could take 30+ seconds. Hub timeout is 15s. After hub gives up, spoke keeps scanning — wasting CPU and sending an orphan response that gets silently dropped.

**Fix**: Added `const deadline = Date.now() + 12000` (12s, finishing 3s before hub's 15s timeout). BFS loop checks deadline on every iteration, breaks early with partial results.

#### 4. Bug Fix: Error Path requestId Consistency (`src/local/hub-client.ts`)
**Problem**: Catch blocks used `(data as any).requestId` instead of the pre-extracted `requestId` variable.

**Fix**: Both paths now use the same `requestId` variable.

### Files Changed
| File | Change |
|---|---|
| `src/local/hub-client.ts` | requestId extracted before try block with `|| ''` fallback; 12s deadline on search BFS; error paths use consistent variable |

### TypeScript Status
Zero PIA errors.

### Desktop App Impact
None — spoke-side runtime fixes only. No new endpoints, events, or packaging changes.

---

## Session 4: Project Registry — Auto-Discover Repos Per Machine (Opus 4.6)

### What Was Built

Each machine now scans for git repos on startup and reports them to the hub. The spawn dialog shows a **project picker dropdown per machine** — pick a project, the working directory auto-fills. No more manual path entry or slow remote file browsing for common workflows.

### How It Works

```
Machine startup → scanGitRepos() walks common dirs (Documents/GitHub, Downloads, Desktop, etc.)
  → Finds .git folders → reports as capabilities.knownProjects on WebSocket registration
  → Hub stores in known_projects table (per-machine isolation)
  → Dashboard fetches GET /api/mc/machines/:id/projects
  → Project dropdown populates → user picks project → CWD auto-fills
```

### Changes

#### 1. Shared Project Scanner (`src/utils/project-scanner.ts`) — NEW
- BFS directory walker with 5s deadline, max depth 3
- Scans: `~/Documents/GitHub`, `~/Downloads`, `~/Desktop`, `~/Projects`, `~/dev`, `~/repos`, `~/Source`, `~/Code`
- Plus custom paths from `PIA_PROJECT_ROOTS` env var
- Skips: `node_modules`, `.git` internals, `__pycache__`, `venv`, `dist`, `build`, `.cache`, `.yarn`
- Used by both hub (aggregator) and workers (hub-client) — no code duplication

#### 2. Worker: Report repos on registration (`src/local/hub-client.ts`)
- `getCapabilities()` calls `scanGitRepos()` and includes results as `knownProjects`
- Hub receives projects when worker connects

#### 3. Hub: Self-register + store projects (`src/hub/aggregator.ts`)
- `scanHubProjects()` — hub scans its own filesystem on startup
- Hub self-registers as a machine if not already in DB (fixes first-startup edge case)
- Stores projects with hub's actual DB machine ID (no `'local'` special case)
- On worker registration: upserts worker's projects into `known_projects` table
- Stale project cleanup: removes projects the worker no longer reports

#### 4. API endpoint (`src/api/routes/mission-control.ts`)
- **New**: `GET /api/mc/machines/:id/projects` — returns projects for a specific machine
- Clean single query: `WHERE machine_name = ?`
- No special cases or hostname detection needed

#### 5. Dashboard project picker (`public/mission-control.html`)
- New `<select id="spawnProject">` dropdown between Template and Working Directory
- On target machine change → fetches that machine's projects → populates dropdown
- On project select → auto-fills CWD with project path
- "Custom path..." option always available as fallback
- Works for both hub and remote machines

#### 6. Config: Custom scan paths (`src/config.ts`)
- **New config**: `PIA_PROJECT_ROOTS` (env var, comma-separated)
- Allows defining extra directories to scan per machine
- Added `projectRoots: string[]` to `PIAConfig.hub` interface

#### 7. Migration 041: Fix unique constraint (`src/db/database.ts`)
- **Bug found**: `UNIQUE(name)` meant two machines with the same project name (e.g. "pia-system") would overwrite each other
- **Fix**: Recreated table with `UNIQUE(name, machine_name)` — per-machine isolation
- Added index on `machine_name` for faster queries

### Files Changed
| File | Change |
|---|---|
| `src/utils/project-scanner.ts` | **NEW** — shared BFS git repo scanner |
| `src/local/hub-client.ts` | Import shared scanner, report knownProjects in capabilities |
| `src/hub/aggregator.ts` | Hub self-registration, scanHubProjects using shared scanner, store worker projects on registration |
| `src/api/routes/mission-control.ts` | New `GET /api/mc/machines/:id/projects` endpoint |
| `public/mission-control.html` | Project picker dropdown in spawn dialog |
| `src/config.ts` | Added `PIA_PROJECT_ROOTS` config and `projectRoots` to interface |
| `src/db/database.ts` | Migration 041: `UNIQUE(name)` → `UNIQUE(name, machine_name)` |

### Verified Results
| Machine | Projects Found | Sample Path |
|---|---|---|
| M1 (Izzit7/hub) | 35 repos | `C:\Users\mic\Downloads\pia-system` |
| M2 (soda-monster-hunter) | 12 repos | `C:\Users\User\Documents\GitHub\pia-system` |
| M3 (soda-yeti) | Not yet updated | Needs `git pull` + restart |

### New API Endpoints
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/mc/machines/:id/projects` | List known git repos for a machine |

### New Config Options
| Env Var | Default | Purpose |
|---|---|---|
| `PIA_PROJECT_ROOTS` | `""` (empty) | Comma-separated extra directories to scan for git repos |

### TypeScript Status
Zero PIA errors.

### Desktop App Impact
- **New file**: `src/utils/project-scanner.ts` — pure Node.js, no native deps, Electron safe
- **New migration 041**: Runs automatically on startup
- **New API endpoint**: React UI will need to call `/api/mc/machines/:id/projects`
- **New HTML feature**: Project picker in spawn dialog — must be ported to React UI later

---

## Session 5: Remote Browser Control via Playwright MCP + Debugging (Opus 4.6)

### What Was Built

**Milestone: Successfully opened and controlled a Chrome browser on M2 (soda-monster-hunter) from the hub dashboard using Playwright MCP.**

The agent spawned on M2 with a Playwright MCP server attached, opened a browser window, and navigated to a page — all orchestrated remotely from M1.

### The Problem Chain

Remote agent spawning with MCP servers didn't work initially. Multiple issues found and fixed:

#### 1. MCP servers not forwarded to remote machines
**Problem**: When the hub sent a spawn command to a spoke, the `mcpServers` field was stripped from the payload. The spoke's `handleSpawnAgent()` also didn't pass it through to `AgentSessionManager.spawn()`.

**Fix** (`src/api/routes/mission-control.ts`):
- Added `mcpServers` and `fallbackModel` to the WebSocket payload sent to spokes

**Fix** (`src/local/hub-client.ts`):
- `handleSpawnAgent()` now extracts and passes `mcpServers` and `fallbackModel` to the local spawn call

#### 2. Wrong Playwright MCP package name
**Problem**: Used `@anthropic-ai/mcp-server-playwright` — this doesn't exist. The correct package is `@playwright/mcp`.

#### 3. npx hangs without -y flag
**Problem**: `npx @playwright/mcp` prompts "OK to proceed?" which hangs in a non-interactive spawn context.
**Fix**: Always pass `-y` flag: `npx -y @playwright/mcp`

#### 4. Better error reporting
**Fix** (`src/api/server.ts`):
- Error handler now includes stack trace in logs and error detail in response
- `res.status(500).json({ error: 'Internal server error', detail: err.message })`

**Fix** (`src/api/routes/mission-control.ts`):
- Spawn error handler checks `res.headersSent` to avoid double-response crash
- Includes actual error message: `Failed to spawn agent: ${error}`

#### 5. WebSocket debug logging
**Fix** (`src/tunnel/websocket-server.ts`):
- `sendToMachine()` now logs first 300 chars of message payload (debug level)
- Helps trace what's actually sent to spokes

### Working Spawn Config (for Playwright MCP on remote machine)

```json
{
  "machineId": "CPRCCmmvcH6PHSTyURmSK",
  "mode": "sdk",
  "task": "Use the Playwright MCP browser tools to navigate to https://example.com and take a screenshot",
  "cwd": "C:/Users/User/Documents/GitHub/pia-system",
  "approvalMode": "yolo",
  "model": "claude-haiku-4-5-20251001",
  "maxBudget": 2,
  "mcpServers": [{
    "name": "playwright",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@playwright/mcp"]
  }]
}
```

### Research: Multi-Machine Communication Patterns

Researched how other systems handle inter-machine orchestration:
- **AutoGen (Microsoft)**: Multi-agent framework, JSON-RPC messaging
- **Salt/Ansible**: Traditional hub-spoke infrastructure automation
- **Selenium Grid / Playwright remote**: Browser farm control
- **MCP over network**: SSE/HTTP transport for tool servers across machines
- **xterm.js + node-pty**: Remote terminal relay via WebSocket
- **noVNC / Guacamole**: Browser-based remote desktop (VNC/RDP)

### Files Changed
| File | Change |
|---|---|
| `src/api/routes/mission-control.ts` | mcpServers/fallbackModel in remote spawn payload; headersSent guard; error detail |
| `src/local/hub-client.ts` | Pass mcpServers/fallbackModel through handleSpawnAgent() |
| `src/api/server.ts` | Stack trace logging; error detail in response |
| `src/tunnel/websocket-server.ts` | Debug logging for sendToMachine() |

### New Capabilities Unlocked
| Capability | Status | How |
|---|---|---|
| Remote browser control (M2) | WORKING | Spawn agent + Playwright MCP |
| Remote agent spawn (M2) | WORKING | WebSocket command dispatch |
| Project picker per machine | WORKING | Auto-scanned repos in dropdown |
| MCP server forwarding | WORKING | Hub passes mcpServers config to spoke |

### TypeScript Status
Zero PIA errors.

### Desktop App Impact
- mcpServers forwarding uses existing WebSocket channel — no new deps or packaging changes
- Error detail in responses helps React UI show better error messages

---

## Session 6: Architecture Review, Risk Analysis & Research (Opus 4.6)

### What Was Done

Comprehensive review of PIA's architecture, risk analysis of the build style, research into Tailscale capabilities, screen sharing options, and competitive analysis of popular AI agent frameworks.

### New Files Created

- **`MACHINE_SETUP_GUIDE.md`** — Complete installation, cold-start recovery, and management guide for all machines

### Architecture Risk Analysis — Deep Dive

Below is a detailed analysis of every risk identified, proposed fixes, and devil's advocate counterarguments.

---

#### Risk 1: Single Point of Failure — The Hub

**The Problem**: M1 goes down = everything stops. No dashboard, no DB, no agent coordination. Workers can still run existing agents but can't be controlled.

**Proposed Fix A — Active/Passive Failover**:
- Replicate SQLite DB to a second machine using Litestream (SQLite → S3/file streaming)
- If hub is unreachable for 60s, a worker promotes itself to hub
- Workers try `PIA_HUB_URL` first, then `PIA_HUB_FAILOVER_URL`

**Devil's Advocate**: Failover is complex. Split-brain scenarios (both machines think they're hub). SQLite replication has consistency edge cases. For a 3-machine setup, the cure is worse than the disease.

**Proposed Fix B — Peer-to-Peer Mode**:
- No single hub. All machines are equal peers
- Uses a distributed consensus protocol (Raft/CRDT) for state
- Any machine can serve the dashboard

**Devil's Advocate**: Massive engineering effort. CRDTs are hard to get right. For 3 machines, just restart M1 faster — PM2 auto-restart takes 2 seconds.

**Pragmatic Fix**: Install PM2 with `--watch` on the hub. If PIA crashes, it restarts in under 3 seconds. Add a daily SQLite backup to cloud storage (costs ~$0/month for a few MB). This covers 99% of downtime scenarios.

---

#### Risk 2: WebSocket is the Only Communication Channel

**The Problem**: If the WS connection drops for even 1 second, commands sent during that gap are lost forever. No retry, no queue, no acknowledgment.

**Proposed Fix A — Message Queue (Redis/BullMQ)**:
- Hub pushes commands to a Redis queue per machine
- Workers pull from their queue
- Commands persist until acknowledged
- Handles disconnection, retry, ordering

**Devil's Advocate**: Adds Redis as a dependency. Another service to run on every machine. For 3 machines sending <100 messages/minute, a full message queue is massive overkill.

**Proposed Fix B — In-Memory Retry Buffer**:
- Hub keeps a `pendingCommands[]` per machine
- On WS disconnect → buffer commands
- On reconnect → replay buffered commands in order
- Cap buffer at 100 commands (oldest dropped)

**Devil's Advocate**: Simple and effective. But commands could be stale by the time they replay (e.g., "spawn agent" from 5 minutes ago when user already moved on). Need a TTL per command.

**Proposed Fix C — HTTP Fallback**:
- Workers expose an HTTP endpoint (`POST /api/local/command`)
- If WS is down, hub tries HTTP directly to the worker's Tailscale IP
- This already works because workers run Express on port 3000

**Devil's Advocate**: Best of both worlds. WS for real-time, HTTP as fallback. Workers already have the server running. Just need the worker to accept commands via HTTP when not connected to hub. This is the lowest-effort, highest-impact fix.

**Pragmatic Fix**: Implement Fix B (retry buffer) first — 2 hours of work. Then add Fix C (HTTP fallback) as a stretch goal.

---

#### Risk 3: SQLite Can't Scale Horizontally

**The Problem**: Single file, single writer. Can't run hub on multiple servers. Risk of corruption on crash.

**Proposed Fix A — Switch to PostgreSQL**:
- Proper multi-connection, multi-writer database
- Can run on a separate server
- Better backup/replication tools

**Devil's Advocate**: Way overkill for 3 machines. Adds a database server dependency. SQLite handles up to ~100K writes/second — PIA does maybe 10/second. PostgreSQL is for when you have 50+ machines.

**Proposed Fix B — WAL Mode + Regular Backups**:
- Enable WAL mode (Write-Ahead Logging) — allows concurrent reads during writes
- Daily backup to a cloud bucket or another machine
- Add `PRAGMA journal_mode=WAL` on database init

**Devil's Advocate**: WAL mode is already standard for server-use SQLite. Might already be enabled. Backups are the real value add.

**Pragmatic Fix**: Verify WAL mode is on. Add a daily backup cron (copy DB file to M2 via Tailscale). SQLite is fine for PIA's scale for years to come.

---

#### Risk 4: No Agent State Persistence

**The Problem**: Restart PIA → all running agents die. Output buffers lost. No recovery.

**Proposed Fix A — Full Agent Checkpointing**:
- Serialize agent session state (conversation history, tool results) to SQLite every N turns
- On restart, detect interrupted agents and resume them
- Claude Agent SDK would need to support session resumption

**Devil's Advocate**: The Claude Agent SDK doesn't support conversation resumption from serialized state. You'd need to re-send the entire conversation history as a prompt, which costs tokens and may produce different behavior. Checkpointing is a half-truth.

**Proposed Fix B — Graceful Shutdown + Output Persistence**:
- On SIGTERM/SIGINT, persist all agent output buffers to SQLite
- Mark agents as "interrupted" with their last status
- On restart, show interrupted agents in dashboard with their last output
- Don't try to resume — just preserve the record

**Devil's Advocate**: This is honest about what's possible. Users can see what happened before the restart and manually re-run if needed. No pretending we can resume a conversation mid-stream.

**Proposed Fix C — Agent Task Queue**:
- Instead of running agents immediately, add them to a task queue
- Queue persists in SQLite
- On restart, re-process any queued but uncompleted tasks

**Devil's Advocate**: Only works for fire-and-forget tasks. Interactive agents (follow-ups, approvals) can't be queued.

**Pragmatic Fix**: Fix B — persist output + mark interrupted. Takes 3-4 hours. Honest and useful.

---

#### Risk 5: Single-File HTML Dashboard (~3000+ lines)

**The Problem**: Monolithic HTML file with inline CSS + JS. No components, no type checking, no testing.

**Proposed Fix A — React + shadcn/ui Rebuild (already planned)**:
- Component-based architecture
- TypeScript type checking
- Proper state management
- Hot module replacement during development
- Component testing with Vitest

**Devil's Advocate**: It's a full rebuild that takes weeks. During that time, the HTML dashboard keeps growing. Two codebases to maintain. The HTML dashboard works — users can test features immediately without a build step.

**Proposed Fix B — Progressive Migration**:
- Keep mission-control.html as-is
- Build new features in React
- Serve React app at `/app/` alongside HTML at `/mission-control.html`
- Gradually migrate features over
- Both use the same API

**Devil's Advocate**: Best approach. No big-bang rewrite risk. Users can switch between old and new. New features get the React treatment, old features stay stable.

**Proposed Fix C — Split into Multiple HTML Files**:
- Break mission-control.html into separate pages (agents.html, machines.html, settings.html)
- Shared header/footer via server-side includes or a simple template engine
- Still no framework, but more manageable

**Devil's Advocate**: Lipstick on a pig. Splits the monolith but doesn't solve the fundamental problem of no components, no type checking, no testing. Save the effort for the React rebuild.

**Pragmatic Fix**: Fix B — progressive migration. Start building new features in React. Port existing features over time. Don't touch the HTML dashboard for existing features.

---

#### Risk 6: Manual Deployment

**The Problem**: Git pull + restart on each machine. No version checking, no rolling updates.

**Proposed Fix A — Self-Update Command**:
```bash
# Add to PIA CLI
pia update    # git pull, npm install if needed, restart
pia update --fleet  # Send update command to all workers
```
- Hub sends "update" command to each worker via WebSocket
- Worker runs git pull, npm install, restarts itself
- Reports back version after restart

**Devil's Advocate**: Beautiful. Remote fleet updates from one command. But if the update breaks something, you've broken ALL machines simultaneously. Need a rollback mechanism.

**Proposed Fix B — Version Mismatch Detection**:
- Workers report their git SHA on registration
- Hub compares with its own SHA
- Dashboard shows warning: "M2 is running version abc123, hub is at def456"
- No automatic update — just visibility

**Devil's Advocate**: Low effort, high value. Just awareness. User decides when to update each machine.

**Pragmatic Fix**: Both. Fix B first (1 hour), then Fix A (2 hours) with a confirmation prompt.

---

#### Risk 7: No Process Manager

**The Problem**: Close terminal = PIA dies. Crash = stays dead.

**Proposed Fix**: PM2.
```bash
npm install -g pm2
pm2 start "npm run dev" --name pia --watch
pm2 save
pm2 startup  # Auto-start on boot
```

**Devil's Advocate**: None. This is a no-brainer. PM2 is battle-tested, lightweight, and takes 5 minutes to set up. Should have been done from day one.

---

### Tailscale Capabilities Research

#### What Tailscale Already Does For Us
- **WireGuard encryption**: All traffic between machines is encrypted end-to-end
- **Stable IPs**: Each machine gets a permanent 100.x.x.x IP
- **NAT traversal**: Works through firewalls, no port forwarding needed
- **MagicDNS**: Access machines by hostname (e.g., `soda-monster-hunter`)

#### What We Could Use But Don't Yet

| Feature | What It Does | PIA Use Case |
|---|---|---|
| **Tailscale SSH** | SSH without passwords using Tailscale identity | Remote shell access to workers without key management |
| **Tailscale Funnel** | Expose local ports to the internet | Access dashboard from phone/anywhere |
| **ACL Tags** | Role-based access control | Separate "hub" and "worker" machine permissions |
| **Tailscale API** | REST API for machine management | Programmatic health checks, machine status |
| **Exit Nodes** | Route traffic through a specific machine | Not useful for PIA |
| **Subnet Routes** | Bridge non-Tailscale networks | Connect to machines without Tailscale installed |

#### Tailscale SSH — Passwordless Remote Access
Enable in Tailscale admin console → ACLs. Then from M1:
```bash
ssh user@soda-monster-hunter  # No password needed
```
This would let the hub execute commands directly on workers via SSH as a fallback to WebSocket.

#### Tailscale API — Machine Status
```bash
# Get all machines in tailnet
curl -s -H "Authorization: Bearer tskey-api-..." \
  https://api.tailscale.com/api/v2/tailnet/-/devices
```
Could poll this to detect machine online/offline status independently of PIA's own heartbeat.

### Screen Sharing / Remote Desktop Options

| Tool | Type | Latency | Install | Programmatic | Best For |
|---|---|---|---|---|---|
| **RDP** (built-in) | Full desktop | Low | 0 (built into Win Pro) | mstsc CLI | Full remote control |
| **Tailscale SSH** | Terminal only | Very low | Config only | Full CLI | Running commands |
| **RustDesk** | Open-source RDP alternative | Low | Easy install | CLI + API | Cross-platform remote desktop |
| **Parsec** | Game-grade streaming | Ultra-low | Easy install | Limited | Low-latency visual work |
| **Sunshine+Moonlight** | GPU streaming | Ultra-low | Medium | Limited | GPU-heavy tasks |
| **Apache Guacamole** | Browser-based RDP/VNC/SSH | Medium | Complex (Docker) | REST API | Access everything from browser |
| **noVNC** | Browser-based VNC | Medium | Medium | WebSocket | Lightweight browser access |
| **Playwright MCP** | Browser automation only | High (AI round-trip) | Already have it | Full API | Automated browser tasks |

**Recommendation for PIA**:
1. **RDP over Tailscale** — already built into Windows, zero install: `mstsc /v:100.127.165.12`
2. **Tailscale SSH** — for CLI-only tasks, enable in admin console
3. **RustDesk** — if you want an open-source alternative to RDP with better features
4. **Guacamole** — long-term goal: embed remote desktop in the PIA dashboard itself

---

### Popular AI Agent Frameworks — Competitive Landscape

*(Research agent still running — results will be added when complete)*

### Desktop App Impact
- **New file**: `MACHINE_SETUP_GUIDE.md` — operational guide, not code
- No code changes in this session — pure analysis and documentation

---

## Session 7: Context7 MCP Fix + Library Audit Request (Opus 4.6)

### What Was Done

#### 1. Diagnosed Why Context7 MCP Wasn't Loading
- **Root cause**: Context7 was configured in `~/.claude.json` for `sodaworld` and `sodalabs` projects, but **NOT** for `pia-system`
- Playwright and Windows-MCP worked because they WERE in the pia-system project config
- The project's `.mcp.json` file was a red herring — Claude Code loads MCP servers from `~/.claude.json` per-project configs

#### 2. Fixed Context7 Configuration
- Added Context7 to `~/.claude.json` under `projects["C:/Users/mic/Downloads/pia-system"].mcpServers`
- Used `cmd /c` wrapper (required on Windows, same as Playwright)
- Included API key: `ctx7sk-a1673372-5a85-42fb-b7a4-f7339d64db16`
- **Requires Claude Code restart to take effect**

#### 3. Attempted PIA Agent with Context7
- Spawned agent `ENWy_N9ltTHVhnPL_4sKZ` with Context7 MCP to audit libraries
- Agent finished (idle) but didn't produce output file — likely Context7 tool usage issues within PIA agent
- This task needs to be done by the next agent directly

### Files Changed
| File | Change |
|---|---|
| `~/.claude.json` | Added `context7` MCP server to pia-system project config |

### No Code Changes
This was a configuration-only session.

---

## Session 8: Context7 Library Audit Sprint — 6 Improvements Implemented (Opus 4.6)

### Background
Continuation from Session 7. Context7 MCP was now working. User requested a full sprint to implement all improvements identified across journals and Context7 library audit. User went to sleep and asked me to "do it right and slowly" and "play devil's advocate to my own work."

### What Was Done

#### 1. Context7 Library Audit (all 8 libraries)
- Resolved all 8 libraries to Context7-compatible IDs
- Queried each library's documentation for PIA-relevant patterns
- Cross-referenced findings with actual codebase usage
- Wrote comprehensive audit to `data/context7-libs-audit.md`

#### 2. SQLite Performance Pragmas (Task 1)
- Added 5 new pragmas to `src/db/database.ts` validated by Context7 docs
- `synchronous = NORMAL`, `cache_size = -64000` (64MB), `mmap_size = 268435456` (256MB), `busy_timeout = 5000`, `temp_store = MEMORY`

#### 3. WebSocket Heartbeat with Dead Connection Detection (Task 2)
- Added `isAlive: boolean` to Client interface in `src/tunnel/websocket-server.ts`
- Added `ws.on('pong')` handler in connection setup
- Rewrote `startHeartbeat()` to check pong responses, terminate dead connections, and clean up machine tracking maps
- Follows canonical ws library pattern from Context7 docs

#### 4. WebSocket Command Retry Buffer (Task 3)
- Added `BufferedCommand` interface with 100-command max and 5-minute TTL
- When `sendToMachine()` finds spoke disconnected, commands are buffered
- On `machine:register`, buffered commands replay automatically (FIFO)
- Buffer entries deleted after replay to prevent duplicate delivery

#### 5. ESM Shutdown Crash Fix (Task 4)
- Converted `shutdown()` in `src/index.ts` from sync to async
- Changed all 7 `require()` calls to `await import()` (same fix previously applied to websocket-server.ts)
- Was a real bug: `require()` crashes in ESM modules at runtime

#### 6. Agent Output Persistence on Shutdown (Task 5)
- Added `persistAllOutputBuffers()` to `AgentSessionManager`
- Creates `agent_output_snapshots` table, saves output buffers (max 100KB each) via transaction
- Called from shutdown handler before database close

#### 7. Stale Machine Cleanup (Task 6)
- Added `cleanupStaleMachines(days)` to `src/db/queries/machines.ts`
- Cascades: deletes orphaned agents and known_projects
- New endpoints: `DELETE /api/mc/machines/:id`, `POST /api/mc/machines/cleanup`

#### 8. TypeScript Fixes
- Fixed `s.costUsd` → `s.cost` in agent-session.ts (wrong property name)
- Fixed `req.params.id` type cast in mission-control.ts (Express types return `string | string[]`)

### Files Changed
| File | Change |
|---|---|
| `src/db/database.ts` | Added 5 SQLite performance pragmas |
| `src/tunnel/websocket-server.ts` | Added heartbeat ping/pong, command retry buffer |
| `src/index.ts` | Fixed shutdown ESM crash (require→import), added output persistence call |
| `src/mission-control/agent-session.ts` | Added `persistAllOutputBuffers()` method, fixed `costUsd` typo |
| `src/db/queries/machines.ts` | Added `cleanupStaleMachines()` function |
| `src/api/routes/mission-control.ts` | Added `DELETE /machines/:id` and `POST /machines/cleanup` endpoints |
| `data/context7-libs-audit.md` | Comprehensive library audit with sprint results and devil's advocate analysis |

### New API Endpoints
- `DELETE /api/mc/machines/:id` — Remove a specific machine from the registry
- `POST /api/mc/machines/cleanup` — Remove machines offline > N days (body: `{ days: 7 }`)

### New Database Table
- `agent_output_snapshots` — Created on first shutdown persistence (session_id, status, output_buffer, cost_usd, tokens_in, tokens_out, saved_at)

### Desktop App Impact
Two new REST endpoints need to be added to the React UI's machine management screen. The new SQLite table is auto-created and requires no migration file.

### Devil's Advocate Summary
See `data/context7-libs-audit.md` for full analysis. Key self-critiques:
- SQLite cache (64MB) and mmap (256MB) are oversized for our ~10MB database — harmless but unnecessary
- Command buffer "fire and forget" pattern silently drops commands after 5-min TTL with no caller notification
- Missing: client-side ping timeout in `hub-client.ts`, maxPayload on WebSocket server, Express error middleware

### Remaining Items (see audit for details)
1. ~~Client-side ping timeout in `src/local/hub-client.ts`~~ — DONE (Session 9)
2. ~~WebSocket `maxPayload: 1048576`~~ — DONE (Session 9)
3. Express error handling middleware — Already present in server.ts (lines 291-303)
4. ~~SDK `setPermissionMode()` wiring~~ — DONE (Session 9)
5. WAL checkpoint monitoring (low priority — default autocheckpoint sufficient)

---

## Session 9: Context7 Sprint Round 2 — Client Hardening + SDK Wiring (Opus 4.6)

### Background
Second pass through Context7 library docs to validate remaining items from Session 8. Discovered that Express was already fully covered (helmet, rate limiting, error middleware, 404 handler all present). Implemented the 5 remaining real fixes.

### What Was Done

#### 1. Hub Client Resilience (hub-client.ts)
- **Client-side ping timeout** — If hub stops sending pings for 31s, spoke terminates connection (Context7 ws pattern)
- **Handshake timeout** — 10s timeout on WebSocket constructor (was infinite)
- **Exponential backoff** — Reconnect delay: 5s → 10s → 20s → 40s → 60s cap (was fixed 5s)
- Backoff resets on successful connection

#### 2. WebSocket Server Hardening (websocket-server.ts)
- **maxPayload: 1MB** on WebSocketServer constructor — prevents OOM from oversized messages
- **Graceful shutdown** — `close()` now sends code 1001 ("Going away") to all clients before closing

#### 3. SDK Permission Mode Wiring (agent-session.ts)
- `setMode()` now calls `sdkQuery.setPermissionMode()` on the active SDK query
- Previously only updated in-memory config; SDK permission mode didn't actually change mid-session

#### 4. SDK Stop Reason Logging (agent-session.ts)
- Result handler now logs `subtype` (error_max_turns, error_max_budget_usd, refusal, etc.)
- Emits to dashboard so users see WHY an agent stopped

#### 5. Express Audit (server.ts) — No Changes Needed
- Verified helmet, rate limiting, JSON limits, 404 handler, error middleware all already present
- Removed from remaining items list

### Files Changed
| File | Change |
|---|---|
| `src/local/hub-client.ts` | Ping timeout, handshake timeout, exponential backoff |
| `src/tunnel/websocket-server.ts` | maxPayload 1MB, graceful shutdown with close code 1001 |
| `src/mission-control/agent-session.ts` | setPermissionMode() wiring, stop reason logging |

### Desktop App Impact
No new endpoints. Hub client improvements affect spoke mode only. WebSocket changes affect both hub and React UI WebSocket handling (close code 1001 should be handled gracefully).

---

## INSTRUCTIONS FOR NEXT AGENT

### Priority 1: Verify Context7 MCP Works
You should now have `mcp__context7__resolve_library_id` and `mcp__context7__get_library_docs` tools available. If you do, Context7 is working. If not, check `/mcp` for errors.

### Priority 2: Library Audit via Context7
The user wants you to use Context7 to look up latest docs for ALL libraries used in PIA and check for issues, improvements, and breaking changes. Use Context7 to query each of these:

1. **@anthropic-ai/claude-agent-sdk** — We use `query()` and `stream_event`. Check for session resumption, new features, breaking changes.
2. **better-sqlite3** — We use WAL mode + migrations. Check recommended pragmas (synchronous, cache_size, mmap_size, busy_timeout).
3. **express** — Port 3000 + WebSocket upgrade. Check security middleware best practices.
4. **ws** — Hub-to-spoke WebSocket communication. Check reconnection/heartbeat patterns.
5. **@playwright/mcp** — Remote browser control via MCP. Check latest config options.
6. **tsx** — Dev mode with watch. Check Windows stability issues.
7. **node-pty** — PTY agent sessions. Check Windows-specific issues.
8. **nanoid** — ID generation. Check security/collision concerns.

Write findings to `data/context7-libs-audit.md`.

### Priority 3: Cross-Reference Journal Changes
Review Sessions 1-6 in this journal. The user wants all problems identified and changes validated against current library docs. Key areas:
- Session 2-2b: WebSocket hub-spoke architecture — any ws library best practices we're missing?
- Session 3: requestId flow fixes — is there a better pattern?
- Session 4: SQLite migrations + project scanner — any better-sqlite3 optimizations?
- Session 5: Playwright MCP remote spawning — correct config format?
- Session 6: Risk analysis recommendations — validate against latest docs

### Context
- PIA is a multi-machine AI agent orchestration system (Express + TypeScript + SQLite + Claude Agent SDK)
- Read `PIA_ARCHITECTURE.md` for full system design
- Read `AI_AGENT_FRAMEWORKS_RESEARCH_2025_2026.md` for competitive landscape
- Read `data/context7-research.md` for previous Context7 findings (from a PIA agent, may be incomplete)
- Server runs on port 3000, dashboard at `/mission-control.html`

---

## Session 10: Final Sprint — WAL Monitoring, Playwright Config, Session Resumption (Opus 4.6)

### Background
Implementing the last 3 items from the Context7 audit: WAL checkpoint monitoring, Playwright MCP config file, and SDK session resumption. These were previously marked as "low priority / deferred" but the user asked to implement them all.

### What Was Done

#### 1. WAL Checkpoint Monitoring (database.ts)
- Added `startWalCheckpointMonitor()` — checks WAL file size every 60s
- If WAL exceeds 100MB, runs `wal_checkpoint(RESTART)` to reclaim space
- Uses `fs.stat` (async, non-blocking) and `.unref()` so interval doesn't prevent exit
- Cleaned up in `closeDatabase()`

#### 2. Playwright MCP Config File
- Created `playwright-mcp.config.json` at project root with Context7-recommended settings:
  - Chromium browser, Chrome channel, headed mode, 1280x720 viewport
  - Core + vision capabilities, trace saving enabled
  - Action timeout 10s, navigation timeout 30s
  - Output directory: `./data/playwright-output`
- Updated `src/browser-agent/browser-session.ts` to pass `--config` arg pointing to config file

#### 3. SDK Session Resumption
- **Migration 042**: Added `claude_session_id` column to `mc_agent_sessions` table
- **persistSession()**: Now saves `claude_session_id` to database on every persist
- **resumeSession()**: New method that loads a completed session from DB, reconstructs it in memory with its `claude_session_id`, and resumes via the SDK's `resume` option
- **New endpoint**: `POST /api/mc/agents/:id/resume` — takes `{ task: "continue message" }` body, returns resumed session info

### Files Changed
| File | Change |
|---|---|
| `src/db/database.ts` | WAL checkpoint monitor + migration 042 (claude_session_id column) |
| `playwright-mcp.config.json` | **NEW** — Playwright MCP config with Context7 settings |
| `src/browser-agent/browser-session.ts` | Pass `--config` arg to Playwright MCP CLI |
| `src/mission-control/agent-session.ts` | `persistSession()` saves claude_session_id, new `resumeSession()` method |
| `src/api/routes/mission-control.ts` | New `POST /agents/:id/resume` endpoint |

### New API Endpoints
- `POST /api/mc/agents/:id/resume` — Resume a previous agent session (body: `{ task: "message" }`)

### New Database Migration
- **042_session_resume_support**: Adds `claude_session_id TEXT` column to `mc_agent_sessions`

### Desktop App Impact
New REST endpoint needs to be added to the React UI agent management screen. Migration is auto-applied on startup. New config file should be included in Electron packaging.

---
