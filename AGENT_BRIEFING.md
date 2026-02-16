# PIA System — Agent Briefing

> Give this file to any new Claude agent so it has full context.
> Last updated: February 16, 2026 (Session 13)

---

## What Is PIA?

**Project Intelligence Agent (PIA)** is a multi-machine AI agent orchestration system built by SodaWorld. It lets you spawn, monitor, and control multiple Claude agents from a single web dashboard (Mission Control), with the architecture to control agents across multiple machines via WebSocket relay.

**Tech stack:** TypeScript, Express, WebSocket (ws), better-sqlite3, Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), node-pty
**Run:** `npm run dev` (tsx watch) — serves on `http://localhost:3000`
**Dashboard:** `http://localhost:3000/mission-control.html`

---

## Project Structure

```
pia-system/
├── src/
│   ├── index.ts                      # Express server entry point
│   ├── config.ts                     # Environment config
│   ├── api/routes/
│   │   ├── mission-control.ts        # Agent spawn/kill/respond/mode/templates API
│   │   ├── files.ts                  # File read/write/list/search API
│   │   ├── dao-modules.ts            # DAO backend (separate project, 40+ endpoints)
│   │   ├── agents.ts                 # Agent CRUD
│   │   ├── machines.ts               # Machine registration
│   │   ├── sessions.ts               # Work sessions
│   │   ├── tasks.ts                  # Task management
│   │   └── ... (20+ more route files)
│   ├── mission-control/
│   │   ├── agent-session.ts          # Core: AgentSessionManager — spawns SDK/PTY/API agents
│   │   └── prompt-manager.ts         # Core: Routes tool approvals to UI or auto-approves
│   ├── tunnel/
│   │   ├── websocket-server.ts       # Hub WebSocket server (broadcasts to dashboard)
│   │   └── pty-wrapper.ts            # PTY process wrapper for CLI agents
│   ├── local/
│   │   ├── service.ts                # Local agent service (PTY spawning)
│   │   └── hub-client.ts             # Spoke client (connects to hub, auto-reconnect)
│   ├── hub/
│   │   └── aggregator.ts             # Machine registry, heartbeat, agent tracking
│   ├── comms/
│   │   └── cross-machine.ts          # Cross-machine message routing
│   ├── db/
│   │   └── database.ts               # SQLite database (better-sqlite3)
│   └── utils/
│       └── logger.ts                 # Colored console logger
├── public/
│   ├── mission-control.html          # Main dashboard (single-page app, ~2800 lines)
│   └── favicon.svg                   # Dark red P favicon
├── dao-foundation-files/             # SEPARATE PROJECT — DAO backend (don't modify)
├── research/                         # Research documents
└── SESSION_JOURNAL_2026-02-14.md     # Full session history (13 sessions)
```

---

## How Agent Sessions Work

### Three Modes

| Mode | How It Works | Best For |
|------|-------------|----------|
| **SDK** (default) | Uses `@anthropic-ai/claude-agent-sdk` `query()` API. Clean events, streaming, tool approval callbacks. | Production use |
| **PTY** | Spawns real `claude` CLI as a pseudo-terminal. Parses ANSI output. | Interactive/debugging |
| **API** | Drives Claude API directly via autonomous-worker. | Legacy/simple tasks |

### Approval Modes

| Mode | Behavior |
|------|----------|
| **Auto** (default) | Auto-approves safe tools (Read, Write, Edit, Bash). Blocks dangerous patterns (`rm -rf`, `git push --force`). Shows green cards in UI. |
| **Manual** | Every tool call queued as orange prompt card. Agent BLOCKS until user clicks Allow. |
| **Yolo** | Approves everything. No checks. |
| **Plan** | Read-only. No tool execution. |

### Key Flow: SDK Mode Spawn

```
POST /api/mc/agents { cwd, task, mode: 'sdk', approvalMode: 'auto' }
  → AgentSessionManager.spawn() creates session
  → runSdkMode() calls query() from Claude Agent SDK
  → SDK streams events via async generator
  → handleSdkMessage() processes: system, stream_event, assistant, result, tool_progress
  → stream_event with text_delta → emits 'output' → WebSocket → dashboard
  → Tool calls → canUseTool() callback → prompt-manager evaluates → allow/deny
  → On completion → status 'idle', ready for follow-up messages via respond()
```

### Key Flow: Tool Approval

```
SDK wants to use Write tool
  → canUseTool('Write', { file_path, content }, options)
  → Check tool allowlist (if configured)
  → Check network policy (Bash only)
  → If yolo: return { behavior: 'allow' }
  → If auto: pm.addPrompt(..., 'auto') → evaluateForAutoResponse()
    → Matches safe pattern → auto-approve → emit to UI as green card
    → Matches dangerous pattern → escalate to manual queue
  → If manual: pm.addPromptAndWait() → block until user clicks
```

---

## Mission Control Dashboard (mission-control.html)

Single-page app with these sections:
- **Agent Grid** — tiles showing all agents with status, cost, model
- **Agent Detail** — output terminal, input bar, mode toggle, kill button
- **Spawn Modal** — full form: CWD (with folder browser + search), task, mode, model, budget, effort, system prompt, tool allowlist, network policy, additional directories (with folder browser + search)
- **Prompts Panel** — pending (orange) and auto-approved (green) tool approval cards
- **Templates** — save/load spawn configurations

### WebSocket Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `mc:output` | server→client | Agent text output (streaming) |
| `mc:status` | server→client | Agent status change |
| `mc:prompt` | server→client | New prompt (pending or auto-approved) |
| `mc:respond` | client→server | User responds to prompt |

### Streaming Output

SDK sends character-by-character `text_delta` events. The dashboard uses an **accumulator pattern** to buffer partial tokens until `\n`, showing a live preview of the current line. This prevents the one-word-per-line rendering bug.

---

## API Endpoints (Mission Control)

```
POST   /api/mc/agents              — Spawn agent session
GET    /api/mc/agents              — List all sessions
GET    /api/mc/agents/:id          — Get session details + output buffer
POST   /api/mc/agents/:id/respond  — Respond to prompt or send follow-up message
POST   /api/mc/agents/:id/mode     — Change approval mode (manual/auto/yolo/plan)
DELETE /api/mc/agents/:id          — Kill session
GET    /api/mc/agents/:id/journal  — Activity journal
GET    /api/mc/agents/fleet        — All agents across all machines
GET    /api/mc/machines            — Connected machines
POST   /api/mc/machines/:id/command — Send command to remote machine
GET    /api/mc/health              — Aggregate stats
GET    /api/mc/prompts             — All pending prompts
GET    /api/mc/settings            — Global security defaults
POST   /api/mc/settings            — Save settings
GET    /api/mc/templates           — List templates
POST   /api/mc/templates           — Save template
DELETE /api/mc/templates/:id       — Delete template
```

## API Endpoints (Files)

```
POST   /api/files/write            — Write file { path, content, encoding? }
GET    /api/files/read?path=...    — Read file
GET    /api/files/list?path=...    — List directory
GET    /api/files/search?q=...&root=...  — Search directories by name (BFS)
```

---

## SDK Query Options (agent-session.ts)

These are passed to `query()` from the Claude Agent SDK:

| Option | Default | Purpose |
|--------|---------|---------|
| `cwd` | (required) | Working directory for the agent |
| `model` | `claude-opus-4-6` | Model to use |
| `maxBudgetUsd` | `5.00` | Budget cap per session |
| `permissionMode` | `'default'` | SDK permission mode (`'default'` uses canUseTool) |
| `canUseTool` | (function) | Callback for tool approval decisions |
| `includePartialMessages` | `true` | Real-time streaming |
| `settingSources` | `['project']` | Load project CLAUDE.md |
| `enableFileCheckpointing` | `true` | File rollback support |
| `fallbackModel` | `claude-sonnet-4-5-20250929` | Auto-downgrade on rate limits |
| `maxTurns` | `100` | Prevent runaway loops |
| `effort` | (optional) | `'low'`, `'medium'`, `'high'`, `'max'` |
| `systemPrompt` | `claude_code` preset | Preset + optional appended instructions |
| `disallowedTools` | (optional) | Tools the agent cannot use |
| `additionalDirectories` | (optional) | Extra directories the agent can access |

### NOT yet wired (gaps):
- `mcpServers` — SDK supports this but we don't pass it yet (Task #6)

---

## Auto-Approval Rules (prompt-manager.ts)

**Always auto-approved:**
- Read/Glob/Grep/Search operations
- Write/Edit operations
- npm test, npx tsc, git status/diff/log/add/commit
- ls, cat, echo, pwd, node, python, npx
- cp, mv, mkdir, cd, tree
- Any Bash command not in the dangerous list
- Default: ALL tool_approval prompts approved unless dangerous

**Always blocked (escalated to manual):**
- `rm -rf`, `rm -r /`, `del /s`, `rmdir /s`
- `format`, `mkfs`, `dd if=`
- `npm publish`, `npm unpublish`
- `git push --force`, `git reset --hard`
- `deploy`, `kubectl`, `docker push`
- `shutdown`, `reboot`

---

## Security Features

- **Tool allowlist** — If `allowedTools` is set, ONLY those tools can run
- **Network policy** — `allowedDomains`, `blockedDomains`, `ecosystems` (npm/pip/github/anthropic)
- **Secret masking** — Env vars matching KEY/TOKEN/SECRET/PASSWORD patterns are masked in output
- **XSS sanitization** — Script tags and event handlers stripped from output
- **Budget caps** — `maxBudgetUsd` enforced per session
- **Auto-restart** — On transient errors, sessions auto-restart with exponential backoff (max 2 retries)

---

## Multi-Machine Architecture (Working but Stubs)

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Machine #1    │◄──────────────────►│   Hub (this PC)  │
│   (spoke)       │                    │   Port 3000      │
│   hub-client.ts │                    │   websocket-     │
│                 │                    │   server.ts      │
└─────────────────┘                    │   aggregator.ts  │
                                       │   Mission Control│
┌─────────────────┐     WebSocket      │                  │
│   Machine #2    │◄──────────────────►│                  │
│   (spoke)       │                    └─────────────────┘
└─────────────────┘
```

**Working:** Hub WS server, spoke auto-reconnect, heartbeat, machine registry, cross-machine router
**Stubs:** `hub-client.ts` receives `spawn_agent`/`kill_agent`/`send_input` commands but handlers are TODOs

---

## Important Notes

1. **PIA and DAO are SEPARATE projects.** The `dao-foundation-files/` folder is a different project. Don't conflate them.
2. **Server restart required** after backend TypeScript changes: `npm run dev` (auto-restarts with tsx watch)
3. **TypeScript check:** `npx tsc --noEmit --skipLibCheck` — ignore errors from `dao-foundation-files/`
4. **The HTML is big** — `mission-control.html` is ~2800 lines, single-file SPA with inline CSS + JS
5. **Session Journal** — `SESSION_JOURNAL_2026-02-14.md` has full history of 13 sessions of development

---

## Pending Tasks

| # | Task | Priority |
|---|------|----------|
| 9 | Server restart for backend changes | Do first |
| 8 | Verify streaming fix works (test after restart) | High |
| 5 | Visual activity indicator for working agents (pulsing dot) | Medium |
| 6 | Add MCP server support — pass `mcpServers` to SDK `query()` | Medium |
| 7 | Build Browser Agent with Playwright MCP (Gemini-powered) | Future |

---

## Quick Reference

```bash
# Start dev server
npm run dev

# TypeScript check
npx tsc --noEmit --skipLibCheck

# Open dashboard
http://localhost:3000/mission-control.html

# Spawn agent via API
curl -X POST http://localhost:3000/api/mc/agents \
  -H "Content-Type: application/json" \
  -d '{"cwd":"C:/Users/mic/Downloads/pia-system","task":"Hello","approvalMode":"auto"}'

# List agents
curl http://localhost:3000/api/mc/agents

# Kill agent
curl -X DELETE http://localhost:3000/api/mc/agents/AGENT_ID
```
