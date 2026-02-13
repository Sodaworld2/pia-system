# PIA Mission Control — Phase 1 Agent Briefing

## FIRST: Broaden Permissions

Run this before doing anything else to avoid constant approval prompts:

```
# Allow all file operations in this project
# Allow all bash commands in this project directory
# Allow all edit/write/read operations
```

When Claude Code asks to approve tools, select **"Always allow"** for:
- Read, Write, Edit, Glob, Grep (all file tools)
- Bash commands in the project directory
- Any npm/npx commands

Or set in `.claude/settings.local.json`:
```json
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "Bash(npm *)",
      "Bash(npx *)",
      "Bash(node *)",
      "Bash(git *)",
      "Bash(ls *)",
      "Bash(mkdir *)",
      "Bash(cat *)"
    ]
  }
}
```

---

## What You're Building

**PIA Mission Control Phase 1**: Spawn and supervise ONE Claude Code agent on the SAME machine from the PIA browser dashboard + terminal.

The user clicks "Spawn Agent" in the browser → PIA spawns a real Claude process → the user sees a live xterm.js terminal in the browser → when Claude asks for permission, the prompt appears in a queue with 1/2/3 buttons → user responds → Claude continues.

**This is NOT a mockup.** The mockups already exist at `public/mission-control.html` and `public/mission-control-cli.html`. You are building the **real backend**.

---

## Architecture

```
Browser (mission-control.html)
    ↕ WebSocket (port 3001)
    ↕ REST API (port 3000)
PIA Server (src/api/server.ts)
    ↕
Mission Control Module (src/mission-control/)
    ├── agent-session.ts    ← Wraps Claude process (API or PTY mode)
    ├── prompt-manager.ts   ← Routes prompts to user or auto-approves
    └── (future: safety-policy.ts, fleet-manager.ts)
    ↕
Existing Infrastructure:
    ├── autonomous-worker.ts  ← API mode: drives Claude API directly
    ├── pty-wrapper.ts        ← PTY mode: spawns real Claude CLI
    ├── websocket-server.ts   ← Real-time communication
    └── database.ts           ← SQLite storage
```

### Two Modes

| Mode | How it works | When to use |
|------|-------------|-------------|
| **API mode** | `autonomous-worker.ts` calls Claude API, executes tools locally | Structured tasks, cost tracking, full control |
| **PTY mode** | Spawns real `claude` CLI via `pty-wrapper.ts`, user sees actual terminal | Complex interactive work, existing Claude Code features |

**Phase 1 MVP: Implement BOTH modes.** API mode is easier. PTY mode gives the full terminal experience.

---

## Files to Create

### 1. `src/mission-control/agent-session.ts`

Agent session manager. Wraps both API and PTY modes.

```typescript
// Key interfaces:

interface AgentSessionConfig {
  id: string;
  machineId: string;            // 'local' for Phase 1
  mode: 'api' | 'pty';
  task: string;                 // Initial task description
  cwd: string;                  // Working directory
  approvalMode: 'manual' | 'auto';
  model?: string;               // Default: claude-sonnet-4-5-20250929
  maxBudgetUsd?: number;        // Default: 5.00
}

type AgentStatus = 'starting' | 'working' | 'waiting_for_input' | 'idle' | 'done' | 'error';

interface AgentSession {
  id: string;
  config: AgentSessionConfig;
  status: AgentStatus;
  createdAt: number;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  journal: JournalEntry[];
}

// Events emitted:
// 'output'   — terminal output or agent text
// 'prompt'   — agent is asking for permission/input
// 'tool_call' — agent called a tool
// 'status'   — status changed
// 'complete' — agent finished
// 'error'    — something went wrong

// Key methods:
class AgentSessionManager extends EventEmitter {
  spawn(config: AgentSessionConfig): AgentSession
  respond(sessionId: string, response: string | number): void
  setMode(sessionId: string, mode: 'manual' | 'auto'): void
  kill(sessionId: string): void
  getSession(sessionId: string): AgentSession | undefined
  getAllSessions(): AgentSession[]
  getJournal(sessionId: string): JournalEntry[]
}
```

**API mode implementation:**
- Use `runAutonomousTask()` from `src/orchestrator/autonomous-worker.ts`
- The worker already loops through Claude API calls and executes tools
- Extend it to PAUSE when it encounters a tool call that needs approval
- Emit 'prompt' event with the tool call details and options

**PTY mode implementation:**
- Use `ptyManager.create()` from `src/tunnel/pty-wrapper.ts`
- Spawn: `claude -p "task description" --output-format stream-json --allowedTools "Read" "Glob" "Grep"`
- OR spawn `claude` interactively and parse the terminal output for permission prompts
- Listen to PTY output events, detect when Claude is asking for permission
- The simpler approach: use `claude -p` with `--output-format stream-json` which gives structured JSON events

**Recommended approach for PTY mode:**
```typescript
// Spawn claude CLI in stream-json mode
const pty = ptyManager.create(sessionId, {
  command: 'claude',
  args: ['-p', task, '--output-format', 'stream-json'],
  cwd: config.cwd,
});

// Parse JSON events from output
pty.on('output', (data) => {
  // Each line is a JSON object:
  // { type: 'assistant', subtype: 'tool_use', tool: 'Bash', input: {...} }
  // { type: 'result', subtype: 'tool_result', output: '...' }
  // { type: 'assistant', subtype: 'text', text: '...' }
});
```

### 2. `src/mission-control/prompt-manager.ts`

Prompt routing and queue management.

```typescript
interface Prompt {
  id: string;
  agentId: string;
  timestamp: number;
  question: string;          // What the agent is asking
  options: string[];         // Numbered choices [1, 2, 3]
  type: 'tool_approval' | 'user_question' | 'confirmation';
  status: 'pending' | 'responded' | 'auto_approved' | 'auto_denied';
  response?: string;
  respondedAt?: number;
  autoReason?: string;       // Why it was auto-approved/denied
}

class PromptManager extends EventEmitter {
  addPrompt(agentId: string, question: string, options: string[], type: string): Prompt
  respond(promptId: string, choice: number | string): void
  getPending(): Prompt[]
  getAll(): Prompt[]

  // Auto-mode evaluation (Phase 4 will use safety-policy.ts)
  evaluateForAutoResponse(prompt: Prompt): { auto: boolean; response?: string; reason?: string }
}
```

**Manual mode flow:**
1. Agent hits a permission prompt
2. `addPrompt()` creates a Prompt object, emits 'new_prompt' event
3. WebSocket broadcasts `{ type: 'mc:prompt', payload: prompt }` to dashboard
4. User clicks 1/2/3 or types response
5. Dashboard POSTs to `/api/mc/agents/:id/respond`
6. `respond()` sends the answer back to the agent session
7. Agent continues working

**Auto mode flow (basic for Phase 1, full policy in Phase 4):**
1. Agent hits a permission prompt
2. `evaluateForAutoResponse()` checks basic rules:
   - Read file → auto-approve
   - Write new file → auto-approve
   - Run `npm test`, `npx tsc`, `git status/diff/log` → auto-approve
   - Delete, `rm`, deploy, install → DENY, escalate to human
   - Everything else → escalate to human
3. If auto-approved: log in journal with 'auto_approved' tag, send response, agent continues
4. If escalated: goes to prompt queue as normal

### 3. `src/api/routes/mission-control.ts`

REST API endpoints.

```typescript
import { Router } from 'express';

const router = Router();

// Spawn a new agent session
POST /api/mc/agents
  Body: { machineId, mode, task, cwd, approvalMode, model?, maxBudget? }
  Response: { id, status, message }

// List all active agents with status
GET /api/mc/agents
  Response: { agents: AgentSession[] }

// Get agent details + terminal buffer
GET /api/mc/agents/:id
  Response: { agent: AgentSession, buffer: string }

// Respond to an agent's prompt
POST /api/mc/agents/:id/respond
  Body: { promptId, choice: number | string }
  Response: { success, message }

// Toggle manual/auto mode
POST /api/mc/agents/:id/mode
  Body: { mode: 'manual' | 'auto' }
  Response: { success, mode }

// Get activity journal
GET /api/mc/agents/:id/journal
  Response: { journal: JournalEntry[] }

// Kill agent session
DELETE /api/mc/agents/:id
  Response: { success, message }

// Get all pending prompts across all agents
GET /api/mc/prompts
  Response: { prompts: Prompt[] }

export default router;
```

---

## Files to Modify

### 4. `src/api/server.ts`

Add one import and one route registration line:

```typescript
import missionControlRouter from './routes/mission-control.js';
// ... existing routes ...
app.use('/api/mc', missionControlRouter);
```

### 5. `src/tunnel/websocket-server.ts`

Add new WebSocket message types for mission control:

```typescript
// New incoming types to handle:
'mc:subscribe'      — Client wants mission control updates
'mc:respond'        — Client responding to a prompt (alternative to REST)

// New outgoing types to broadcast:
'mc:prompt'         — New prompt needs user input
'mc:output'         — Agent terminal output
'mc:status'         — Agent status changed (working → waiting → done)
'mc:journal'        — New journal entry
'mc:agent_spawned'  — New agent was created
'mc:agent_killed'   — Agent was terminated
```

### 6. `src/db/database.ts`

Add a new migration for mission control tables:

```sql
-- Migration: 020_mission_control

CREATE TABLE IF NOT EXISTS mc_agent_sessions (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL DEFAULT 'local',
  mode TEXT NOT NULL CHECK (mode IN ('api', 'pty')),
  task TEXT NOT NULL,
  cwd TEXT NOT NULL,
  approval_mode TEXT NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('manual', 'auto')),
  model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
  status TEXT NOT NULL DEFAULT 'starting',
  cost_usd REAL DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  tool_calls INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER,
  FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mc_prompts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT,                 -- JSON array of option strings
  type TEXT NOT NULL DEFAULT 'tool_approval',
  status TEXT NOT NULL DEFAULT 'pending',
  response TEXT,
  auto_reason TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  responded_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES mc_agent_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mc_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,           -- tool_call, output, prompt, response, auto_approved, error, cost
  content TEXT NOT NULL,
  metadata TEXT,                -- JSON blob for extra data
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (agent_id) REFERENCES mc_agent_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_mc_prompts_agent ON mc_prompts(agent_id);
CREATE INDEX idx_mc_prompts_status ON mc_prompts(status);
CREATE INDEX idx_mc_journal_agent ON mc_journal(agent_id);
```

---

## Existing Code Reference

### autonomous-worker.ts (API mode engine)
- `runAutonomousTask(task: WorkerTask): Promise<WorkerResult>` — main function
- Tracks cost via `MODEL_PRICING` map
- Safety: `BLOCKED_COMMANDS`, `isCommandSafe()`, `isPathSafe()`
- Emits progress via `report_progress` tool
- Location: `src/orchestrator/autonomous-worker.ts`

### pty-wrapper.ts (PTY mode engine)
- `ptyManager.create(sessionId, options)` — spawn a process
- `.on('output', data => ...)` — stream output
- `.write(data)` — send input
- `.resize(cols, rows)` — resize terminal
- `.kill()` — terminate
- Location: `src/tunnel/pty-wrapper.ts`

### websocket-server.ts (real-time comms)
- `getWebSocketServer()` — get singleton
- `.broadcastToSession(sessionId, msg)` — send to session subscribers
- `.broadcast(msg)` — send to all clients
- `.registerPTY(sessionId, ptyWrapper)` — auto-broadcast PTY output
- Auth token: check `config.security.secretToken`
- Location: `src/tunnel/websocket-server.ts`

### database.ts (storage)
- `getDatabase()` — get SQLite instance
- `.prepare(sql).run(params)` — write
- `.prepare(sql).get(params)` — read one
- `.prepare(sql).all(params)` — read many
- Uses WAL mode, foreign keys ON
- Location: `src/db/database.ts`

### server.ts (HTTP API)
- Routes registered as: `app.use('/api/mc', missionControlRouter)`
- All routes behind `validateApiToken` middleware
- Token header: `x-api-token` or `Authorization: Bearer`
- Location: `src/api/server.ts`

---

## Verification Checklist

When you're done, verify:

1. **Start the server**: `npm run dev` (or `npx tsx src/index.ts`)
2. **Spawn an agent**: `curl -X POST http://localhost:3000/api/mc/agents -H "x-api-token: pia-local-dev-token-2024" -H "Content-Type: application/json" -d '{"mode":"api","task":"List all TypeScript files in src/","cwd":"C:\\Users\\mic\\Downloads\\pia-system","approvalMode":"manual"}'`
3. **List agents**: `curl http://localhost:3000/api/mc/agents -H "x-api-token: pia-local-dev-token-2024"`
4. **Check prompts**: `curl http://localhost:3000/api/mc/prompts -H "x-api-token: pia-local-dev-token-2024"`
5. **Respond to prompt**: `curl -X POST http://localhost:3000/api/mc/agents/{id}/respond -H "x-api-token: pia-local-dev-token-2024" -H "Content-Type: application/json" -d '{"choice":1}'`
6. **Check journal**: `curl http://localhost:3000/api/mc/agents/{id}/journal -H "x-api-token: pia-local-dev-token-2024"`
7. **Kill agent**: `curl -X DELETE http://localhost:3000/api/mc/agents/{id} -H "x-api-token: pia-local-dev-token-2024"`
8. **WebSocket**: Open `mission-control.html` in browser, verify `mc:prompt` and `mc:output` events arrive

---

## Important Notes

- **Do NOT rewrite existing files.** Extend them. Add imports, add routes, add migrations. Don't refactor what exists.
- **Follow existing patterns.** Look at how `orchestrator.ts` routes are structured and mirror that.
- **Use the existing config/token system.** Don't create new auth. Token is in `config.security.secretToken`.
- **TypeScript with .js imports.** This project uses `"moduleResolution": "node16"` — import paths must end in `.js` even for `.ts` files.
- **Test with real Claude API.** You'll need `ANTHROPIC_API_KEY` in `.env` for API mode to work.
- **The dashboard mockup at `public/mission-control.html` already has the UI.** It just needs real WebSocket/API connections instead of mock data. That wiring is Phase 1b (after backend works).

---

## File Tree (what exists vs what to create)

```
src/
├── api/
│   ├── server.ts                    ← MODIFY (add mc route)
│   └── routes/
│       ├── orchestrator.ts          ← REFERENCE (pattern to follow)
│       └── mission-control.ts       ← CREATE
├── db/
│   └── database.ts                  ← MODIFY (add migration 020)
├── mission-control/                 ← CREATE DIRECTORY
│   ├── agent-session.ts             ← CREATE
│   └── prompt-manager.ts            ← CREATE
├── orchestrator/
│   └── autonomous-worker.ts         ← REFERENCE (API mode engine)
├── tunnel/
│   ├── pty-wrapper.ts               ← REFERENCE (PTY mode engine)
│   └── websocket-server.ts          ← MODIFY (add mc: message types)
└── index.ts                         ← REFERENCE (boot sequence)
```
