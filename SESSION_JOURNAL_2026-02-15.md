# Session Journal — 2026-02-15
## DAO Admin Dashboard + Multi-Machine Agent Control — Handoff Brief

---

### Status: PLAN READY — Implementation Not Started
**Agent:** Opus 4.6 session — research + planning phase complete
**Task:** Build DAO Admin Dashboard (`dao-admin.html`) + wire multi-machine agent control
**Handoff Reason:** User requested journal + brief for another agent to take over

---

## THE PLAN (Executive Summary)

Build a single-page DAO Admin Dashboard (`public/dao-admin.html`) with 6 tabbed sections that becomes the central control plane for the entire PIA network. This page aggregates ALL existing APIs (Mission Control agents, DAO governance, machines, templates, security) into one "single pane of glass" UI.

**Phase A (Start Here):** Build the dashboard HTML + add 4 new API endpoints
**Phase B (Later):** Wire remote agent spawning through hub-client
**Phase C (Later):** Remote streaming
**Phase D (Later):** Security hardening

---

## CODEBASE MAP — What I Read & Understood

### File: `public/mission-control.html` (~2300 lines)
**Purpose:** Existing agent control UI — machines panel (left), terminal/journal (center), prompt queue (right)
**CSS Patterns:**
- Dark theme: bg `#050508`, panels `#0a0a10`, cards `#0f0f18`, borders `#1e1e30`
- Accent colors: purple `#9b4dca`/`#bc8cff`, green `#3fb950`, orange `#d29922`, blue `#58a6ff`, red `#f85149`
- Font: 'Segoe UI' for UI, 'JetBrains Mono' for code
- Status dots: `.online` green, `.busy` orange, `.offline` gray, `.error` red
- Buttons: `.btn.green`, `.btn.purple`, `.btn.blue`, `.btn.red`, `.btn.ghost`
- Modals: `.modal-overlay.visible` with flex centering, `.modal` with `#12121e` bg
- Toast notifications: fixed top-right, slide in from right

**JS Patterns:**
- API helper: `async function api(path, opts)` — adds `x-api-token` header, returns parsed JSON
- Token: `API_TOKEN = 'pia-local-dev-token-2024'`
- WebSocket: connects to `ws://hostname:3001`, authenticates, subscribes to `mc:subscribe`
- State: `machines[]`, `agents[]`, `prompts[]`, `outputBuffers{}`, `selectedMachine`, `selectedAgent`
- Render cycle: `renderAll()` → `renderMachines()`, `renderPrompts()`, `renderStats()`
- Templates: loaded in spawn modal from `GET /api/mc/templates`
- Grid view: auto-fit tiles with live output, per-tile input fields

### File: `src/api/routes/mission-control.ts` (373 lines)
**Existing endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/agents` | Spawn agent (sdk/api/pty mode) |
| GET | `/agents` | List all active sessions |
| GET | `/agents/:id` | Agent details + output buffer |
| POST | `/agents/:id/respond` | Respond to prompt |
| POST | `/agents/:id/mode` | Toggle approval mode |
| GET | `/agents/:id/journal` | Get activity journal |
| DELETE | `/agents/:id` | Kill agent |
| GET | `/health` | Aggregate stats |
| GET | `/prompts` | Pending prompts |
| GET | `/templates` | List saved templates |
| POST | `/templates` | Save template |
| DELETE | `/templates/:id` | Delete template |

**Key patterns:**
- Uses `getAgentSessionManager()` singleton for agent operations
- Uses `getPromptManager()` singleton for prompt queue
- Uses `getDatabase()` for SQLite (better-sqlite3)
- Table creation inline (e.g., `mc_templates` created on first access)
- `wireEvents()` connects AgentSessionManager events → WebSocket broadcasts

**NEW endpoints needed (4):**
```
GET  /api/mc/settings          — Global security defaults
POST /api/mc/settings          — Save global security defaults
GET  /api/mc/agents/fleet      — All agents across all machines (from aggregator)
GET  /api/mc/machines          — All connected machines + status
```

### File: `src/hub/aggregator.ts` (319 lines)
**Purpose:** Receives machine registrations, heartbeats, agent updates from spoke machines
**Key methods:**
- `handleMachineRegister(data)` — creates/updates machine in DB, tracks in `connections` Map
- `handleMachineHeartbeat(data)` — updates last_seen, agent statuses
- `handleAgentRegister(data)` — creates agent in DB, broadcasts update
- `handleAgentUpdate(data)` — updates agent status, creates alerts for waiting/error
- `handleAgentRemove(data)` — deletes agent from DB
- `getConnectionStatus()` — returns Map<machineId, MachineConnection>
- Health check interval: 3 missed heartbeats = offline

### File: `src/local/hub-client.ts` (332 lines)
**Purpose:** Spoke-side — connects to hub WebSocket, sends registration + heartbeat
**TODO stubs (lines 170-180):**
```typescript
case 'spawn_agent':
  // TODO: Spawn new agent via Claude-Flow or direct CLI
  break;
case 'kill_agent':
  // TODO: Kill specified agent
  break;
case 'send_input':
  // TODO: Send input to agent session
  break;
```
**Key:** Uses `config.hub.url`, replaces http→ws, port 3001. Has `getOrCreateMachineId()` persisted to `data/machine-id`. Auto-reconnect with 5s delay.

### File: `src/local/service.ts` (295 lines)
**Purpose:** Spoke-side local agent manager. Currently PTY-only.
**Key methods:**
- `spawnAgent(opts)` — creates PTY session, monitors output for status changes
- `assignTask(agentId, task)` — writes task into PTY
- `sendInput(agentId, input)` — writes to PTY
- `killAgent(agentId)` — kills PTY, notifies hub
- `analyzeOutput(agent, output)` — heuristic status detection

**Phase B gap:** No SDK mode. Import `getAgentSessionManager()` and route to `AgentSessionManager.spawn()` when mode is 'sdk'.

### File: `src/mission-control/agent-session.ts` (1118 lines)
**Purpose:** The heart of agent control — wraps Claude in SDK, API, or PTY mode
**Key features:**
- `NetworkPolicy` — allowed/blocked domains, ecosystem presets (npm, pip, github, anthropic)
- `checkNetworkPolicy(cmd, policy)` — validates Bash commands against network rules
- `sanitizeOutput(text)` — masks secret env var values, strips XSS vectors
- `AgentSessionManager` class with `spawn()`, `respond()`, `kill()`, `setMode()`, `killAll()`
- SDK mode: uses `@anthropic-ai/claude-agent-sdk` query(), handles stream_event for real-time output
- PTY mode: spawns real `claude` CLI, parses ANSI output, injects tasks
- API mode: uses `runAutonomousTask()` from autonomous-worker
- Permission bridge: `canUseTool()` → tool allowlist check → network policy check → approval mode routing
- Auto-restart on transient errors with exponential backoff (max 2 restarts)
- Session persistence to SQLite `mc_agent_sessions` table

### File: `src/comms/cross-machine.ts` (363 lines)
**Purpose:** Unified cross-machine message relay (WebSocket, Tailscale, ngrok, Discord, REST)
**Key:** `CrossMachineRelay` class with `send()`, `subscribe()`, `handleIncoming()`, `getAllMachines()`, `getStats()`. Delivers via WebSocket first, falls back to HTTP POST.

### File: `src/tunnel/websocket-server.ts`
**Purpose:** Central WebSocket server on port 3001
**Key message types:** auth, subscribe, input, machine:register, machine:heartbeat, agent:register, agent:update, agent:remove, mc:subscribe, mc:respond, relay:register, relay:send, relay:broadcast
**Broadcasts:** `broadcastMc()` for Mission Control events, `sendAgentUpdate()` for agent changes

### File: `src/db/database.ts` (662 lines)
**Schema (migrations):**
- `001_initial_schema` — machines, agents, sessions, session_output, tasks, watched_docs, alerts
- `002_ai_cost_tracking` — ai_providers, ai_usage, ai_cost_daily, ai_budgets
- `003_agent_souls` — souls, soul_memories, soul_interactions
- `004_work_sessions` — work_sessions, known_projects
- `020_mission_control` — mc_agent_sessions, mc_prompts, mc_journal
- `025_dao_foundation` — users, daos, dao_members, agreements, agreement_signatures, proposals, votes, ai_conversations, knowledge_items, bounties, marketplace_items
- `030_sdk_mode` — expands mc_agent_sessions.mode CHECK to include 'sdk'
- `031_approval_modes` — expands approval_mode CHECK to include 'yolo', 'plan'

### File: `src/db/queries/machines.ts` (120 lines)
**Exports:** `createMachine`, `getMachineById`, `getMachineByHostname`, `getAllMachines`, `updateMachineStatus`, `updateMachineHeartbeat`, `deleteMachine`, `getOfflineMachines`

### File: `src/db/queries/agents.ts` (178 lines)
**Exports:** `createAgent`, `getAgentById`, `getAllAgents`, `getAgentsByMachine`, `getAgentsByStatus`, `updateAgentStatus`, `deleteAgent`, `getStuckAgents`, `getAgentStats`

### File: `src/api/routes/dao-modules.ts` (40+ endpoints)
**Purpose:** Full DAO backend — AI modules, governance, proposals, voting, agreements, bounties, marketplace
**Key:** Uses Knex (not better-sqlite3 directly) pointed at same DB. Has `ModuleRegistry` with Coach, Legal, Governance modules. LLM calls go through PIA's AI router (Ollama → Claude waterfall).

---

## IMPLEMENTATION PLAN (Phase A — What the Next Agent Should Build)

### Step 1: Add 4 new API endpoints to `src/api/routes/mission-control.ts`

**At the top, add imports:**
```typescript
import { getAllMachines } from '../../db/queries/machines.js';
import { getAllAgents, getAgentsByMachine, getAgentStats } from '../../db/queries/agents.js';
import { getAggregator } from '../../hub/aggregator.js';
```

**New endpoints:**

```typescript
// GET /api/mc/settings — global security defaults
router.get('/settings', (_req, res) => {
  const db = getDatabase();
  db.exec(`CREATE TABLE IF NOT EXISTS mc_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  )`);
  const rows = db.prepare('SELECT key, value FROM mc_settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = JSON.parse(row.value);
  // Return with defaults
  res.json({
    defaultApprovalMode: settings.defaultApprovalMode || 'auto',
    defaultMaxBudget: settings.defaultMaxBudget || 5,
    defaultAllowedTools: settings.defaultAllowedTools || [],
    defaultNetworkEcosystems: settings.defaultNetworkEcosystems || ['npm', 'github', 'anthropic'],
    defaultBlockedDomains: settings.defaultBlockedDomains || [],
    secretMaskingEnabled: settings.secretMaskingEnabled !== false,
    budgetAlertThresholds: settings.budgetAlertThresholds || [50, 80, 100],
  });
});

// POST /api/mc/settings — save global security defaults
router.post('/settings', (req, res) => {
  const db = getDatabase();
  db.exec(`CREATE TABLE IF NOT EXISTS mc_settings (...)`);
  const stmt = db.prepare('INSERT OR REPLACE INTO mc_settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(req.body)) {
    stmt.run(key, JSON.stringify(value));
  }
  res.json({ success: true });
});

// GET /api/mc/agents/fleet — all agents across all machines
// NOTE: Must be registered BEFORE the /agents/:id route
router.get('/agents/fleet', (_req, res) => {
  const dbAgents = getAllAgents();    // from agents table (hub-tracked)
  const mcAgents = getAgentSessionManager().getAllSessions();  // live MC sessions
  res.json({ dbAgents, mcAgents: mcAgents.map(s => ({...})), stats: getAgentStats() });
});

// GET /api/mc/machines — all connected machines
router.get('/machines', (_req, res) => {
  const dbMachines = getAllMachines();
  let connectionStatus = {};
  try { connectionStatus = Object.fromEntries(getAggregator().getConnectionStatus()); } catch {}
  res.json({ machines: dbMachines, connections: connectionStatus });
});
```

**IMPORTANT:** The `/agents/fleet` route must be registered BEFORE `/agents/:id` or Express will match "fleet" as an `:id` parameter.

### Step 2: Create `public/dao-admin.html`

This is a single HTML file (~2500 lines) with 6 tabbed sections. Follow the exact same CSS patterns from `mission-control.html`:

**Structure:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>/* Same dark theme, same variables as mission-control.html */</style>
</head>
<body>
  <!-- Header with title + nav links -->
  <div class="admin-header">
    <h1>PIA DAO ADMIN</h1>
    <nav>
      <a href="/mission-control.html">Mission Control</a>
      <a href="/dao-admin.html" class="active">DAO Admin</a>
    </nav>
  </div>

  <!-- Tab Bar -->
  <div class="tab-bar">
    <div class="tab active" data-tab="machines">Machines</div>
    <div class="tab" data-tab="fleet">Agent Fleet</div>
    <div class="tab" data-tab="security">Security</div>
    <div class="tab" data-tab="templates">Templates</div>
    <div class="tab" data-tab="governance">DAO Governance</div>
    <div class="tab" data-tab="health">System Health</div>
  </div>

  <!-- Tab Content Panels -->
  <div class="tab-content" id="tab-machines">...</div>
  <div class="tab-content" id="tab-fleet">...</div>
  <div class="tab-content" id="tab-security">...</div>
  <div class="tab-content" id="tab-templates">...</div>
  <div class="tab-content" id="tab-governance">...</div>
  <div class="tab-content" id="tab-health">...</div>

  <script>/* JS: same api() helper, same WS connect pattern */</script>
</body>
</html>
```

**Tab 1: Machines** — `GET /api/mc/machines` + `GET /api/machines`
- Table: name, IP, status dot, CPU%, memory%, agent count
- "Enroll Machine" button → modal with generated token + install script
- Click row → show agents on that machine

**Tab 2: Agent Fleet** — `GET /api/mc/agents` + `GET /api/mc/agents/fleet`
- Grid of ALL agents (reuse `.grid-tile` CSS from mission-control)
- "Spawn Agent" → same modal as mission-control (can copy the HTML)
- Machine name badge on each tile
- Live output streaming via WebSocket `mc:output`
- Send input, kill, toggle mode actions per agent

**Tab 3: Security** — `GET /api/mc/settings` + `POST /api/mc/settings`
- Form with all global defaults:
  - Default approval mode (select: manual/auto/yolo/plan)
  - Default max budget (number input)
  - Default allowed tools (textarea, comma-separated)
  - Network ecosystems (checkboxes: npm, pip, github, anthropic)
  - Blocked domains (textarea)
  - Secret masking toggle
  - Budget alert thresholds (number inputs: 50%, 80%, 100%)
- Per-machine overrides table
- Audit log (fetch alerts from `/api/alerts`)

**Tab 4: Templates** — `GET /api/mc/templates` + `POST /api/mc/templates` + `DELETE /api/mc/templates/:id`
- List of saved templates with name, description, config preview
- "Create Template" form with all spawn fields
- Delete button per template

**Tab 5: DAO Governance** — Uses existing `/api/dao/*` endpoints
- Proposals list: `GET /api/dao/proposals`
- Members list: `GET /api/dao/members`
- Agreements: `GET /api/dao/data` (agreements section)
- Bounties: `GET /api/dao/bounties`
- Create proposal form: `POST /api/dao/proposals/create`

**Tab 6: System Health** — `GET /api/mc/health` + `GET /api/machines`
- Machine heartbeat status grid (green/yellow/red dots)
- Aggregate cost across all agents
- Token usage summary
- Alert history from DB

### Step 3: Add nav links between pages

In `mission-control.html`, add a link to `/dao-admin.html` in the header.
In `dao-admin.html`, add a link back to `/mission-control.html`.

---

## API ENDPOINTS AVAILABLE (for the dashboard to call)

### Mission Control (existing)
- `GET /api/mc/agents` — list sessions
- `GET /api/mc/agents/:id` — session detail + output buffer
- `POST /api/mc/agents` — spawn (machineId, mode, task, cwd, approvalMode, model, maxBudget, ...)
- `POST /api/mc/agents/:id/respond` — send response
- `POST /api/mc/agents/:id/mode` — toggle mode
- `GET /api/mc/agents/:id/journal` — activity journal
- `DELETE /api/mc/agents/:id` — kill
- `GET /api/mc/health` — aggregate stats
- `GET /api/mc/prompts` — pending prompts
- `GET /api/mc/templates` — list templates
- `POST /api/mc/templates` — save template
- `DELETE /api/mc/templates/:id` — delete template

### Machines (existing)
- `GET /api/machines` — list all registered machines

### DAO Modules (existing — 40+ endpoints)
- `GET /api/dao/data` — full DAO data dump
- `GET /api/dao/members` — member list
- `GET /api/dao/proposals` — proposal list
- `GET /api/dao/health` — DAO health check
- `GET /api/dao/bounties` — bounty board
- `GET /api/dao/signatures-summary` — signature stats
- `POST /api/dao/proposals/create` — create proposal
- `POST /api/dao/proposals/:id/vote` — cast vote
- `GET /api/dao/proposals/:id` — proposal detail
- `POST /api/dao/signatures/sign` — sign agreement
- `GET /api/dao/marketplace` — marketplace items

### Files (existing)
- `GET /api/files/list?path=...` — directory listing (used by folder browser)

### Alerts (may need to add)
- `GET /api/alerts` — from alerts table in DB

---

## VERIFICATION CHECKLIST

1. `npx tsc --noEmit --skipLibCheck` — zero new errors
2. Open `http://localhost:3000/dao-admin.html` — all 6 tabs render
3. Machines tab shows local machine with green status
4. Agent Fleet tab shows all active agents (same data as mission-control)
5. Templates tab lists saved templates, create/delete works
6. Security tab shows current defaults, save persists to DB
7. DAO tab shows proposals, members from existing API
8. Health tab shows aggregate stats
9. Nav links work between mission-control.html ↔ dao-admin.html

---

## GOTCHAS & WARNINGS

1. **Route order matters:** `/agents/fleet` must be registered BEFORE `/agents/:id` in Express
2. **Same auth token:** Dashboard uses `x-api-token: pia-local-dev-token-2024` header
3. **WebSocket port:** 3001 (not 3000)
4. **mc_templates table:** Created inline on first access (no migration needed)
5. **mc_settings table:** Also create inline (same pattern as mc_templates)
6. **DAO endpoints prefix:** `/api/dao/...` (not `/api/mc/...`)
7. **TypeScript:** The project compiles with `npx tsc --noEmit --skipLibCheck` — keep it that way
8. **CSS consistency:** Match the exact hex colors and gradient patterns from mission-control.html
9. **No `<script src>`:** Mission control uses inline `<script>` in the HTML. Follow the same pattern.
10. **Escape HTML:** Use an `esc()` function (already exists in mission-control) to prevent XSS
11. **File serving:** Public files are served from `public/` directory by Express static middleware

---

## FILES TO CREATE/MODIFY

| File | Action | Lines (est.) |
|------|--------|-------------|
| `public/dao-admin.html` | **CREATE** | ~2500 |
| `src/api/routes/mission-control.ts` | **MODIFY** | +80 lines (4 new endpoints) |
| `public/mission-control.html` | **MODIFY** | +2 lines (nav link to dao-admin) |

---

## WHAT IS NOT IN SCOPE (Phase B/C/D — Later)

- Wiring hub-client.ts command stubs (spawn_agent, kill_agent, send_input)
- Adding SDK mode to local/service.ts
- Remote spawn routing in agent-session.ts
- Remote agent output streaming
- Per-machine enrollment tokens
- Budget alerts at thresholds
- Audit log persistence

These are documented in the plan but should NOT be implemented yet. Phase A (dashboard + endpoints) is the priority.
