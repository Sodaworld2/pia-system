# Session Journal — 2026-02-16

## Investigation: PIA System Permission Architecture (Complete)

### Problem Statement
When Claude SDK agents are spawned through PIA Mission Control, they sometimes fail to use Edit, Write, and Bash tools. The agent retries the same operation multiple times using different approaches (Edit tool, sed via Bash, Write tool, Python scripts) — all get blocked. The agent eventually reports a "permission configuration issue" and gives up. This wastes budget ($0.98+ per failed session) and produces no useful output.

---

## Finding 1: There Are 6 Permission Layers

A tool call must pass through ALL six layers to execute. A denial at ANY single layer blocks the tool entirely.

### Layer 1 — `disallowedTools` (SDK Hard Block)
**Location:** `src/mission-control/agent-session.ts` lines 444-446
**What it does:** Tools listed here are completely removed from the agent's available toolset. The agent cannot even see these tools exist. The `canUseTool` callback is never invoked for them.
**How to control:** Pass a `disallowedTools` string array when creating a session via `POST /api/mc/agents`.
**Current default:** Empty array — no tools are hard-blocked.
**Example:** `disallowedTools: ['Bash', 'mcp__playwright__browser_navigate']` would prevent the agent from running any shell commands or navigating browsers.

### Layer 2 — `permissionMode` (SDK Execution Gate)
**Location:** `src/mission-control/agent-session.ts` lines 378-380
**What it does:** This is the Claude Agent SDK's own execution strategy. It determines HOW permissions are evaluated, before your custom callback is consulted.

**Available modes (from SDK type definitions):**
| Mode | Behavior |
|------|----------|
| `'default'` | Standard mode — SDK uses its own internal rules + your `canUseTool` callback. The SDK has its own notion of what's "dangerous" and will independently prompt/deny for those operations. |
| `'plan'` | No tool execution at all. Read-only planning mode. `canUseTool` is never called. |
| `'acceptEdits'` | Auto-accept all file edit operations (Edit, Write). Other tools still go through normal permission flow. |
| `'bypassPermissions'` | Skip ALL permission checks. Requires also setting `allowDangerouslySkipPermissions: true` in options. |
| `'delegate'` | Restricted to only Teammate and Task tools (for team leader agents). |
| `'dontAsk'` | Don't prompt the user — deny anything not already pre-approved by settings files. |

**How PIA currently maps approval modes to permission modes:**
```typescript
const permissionMode = session.config.approvalMode === 'plan' ? 'plan' : 'default';
```
This means `auto`, `manual`, and `yolo` all use `'default'` — which means the SDK's own internal rules are active and can independently block tools.

**How to control:** Set `approvalMode` when spawning. The mapping is hardcoded in agent-session.ts line 380.

### Layer 3 — `settingSources` (Project Settings Files)
**Location:** `src/mission-control/agent-session.ts` line 418
**What it does:** The SDK spawns a real Claude Code subprocess. When `settingSources: ['project']` is set, this subprocess loads `.claude/settings.json` or `.claude/settings.local.json` from the agent's working directory. These files define tool allow/deny rules that the Claude Code CLI enforces INTERNALLY, separate from your `canUseTool` callback.

**Current settings files in the project:**

**Root `.claude/settings.local.json`:**
- Very permissive — allows `Bash(*)`, all Playwright MCP tools, all Windows MCP tools, WebSearch, WebFetch for many domains
- BUT: Does NOT explicitly list core tools like `Edit`, `Write`, `Read`, `Glob`, `Grep` (these are usually implicitly allowed in normal CLI usage, but the SDK subprocess may handle them differently)
- Has hooks: SessionStart, PostToolUse, Stop (all run scripts in `.claude/hooks/`)

**`dao-foundation-files/.claude/settings.local.json`:**
- Also permissive: `Bash(*)`, MCP tools allowed

**`research/.claude/settings.local.json`:**
- More restrictive: Only specific Bash commands allowed

**How to control:** Set `loadProjectSettings: false` in the spawn config to pass `settingSources: []`, which prevents the subprocess from loading any project settings.

### Layer 4 — `canUseTool` Callback (PIA's Custom Logic)
**Location:** `src/mission-control/agent-session.ts` lines 317-375
**What it does:** This is the PIA system's custom permission handler. It's an async function passed to the SDK that gets called for each tool use. It runs these checks in order:

1. **Tool Allowlist Check** (lines 328-333):
   - If `config.allowedTools` is set and non-empty, the tool name must be in that list
   - If not in the list → immediate deny with message "Tool X blocked by allowlist policy"
   - If `allowedTools` is not set → this check is skipped entirely

2. **Network Policy Check** (lines 336-343):
   - Only applies to `Bash` tool calls
   - Extracts URLs from the command string
   - Checks against `networkPolicy.blockedDomains` (always denied) and `networkPolicy.allowedDomains` (if set, only these are permitted)
   - Supports ecosystem presets: `npm`, `pip`, `github`, `anthropic`

3. **Yolo Mode** (lines 346-349):
   - If `approvalMode === 'yolo'`: immediately return `{ behavior: 'allow' }` for everything
   - No safety checks, no human approval, no logging beyond journal

4. **Auto Mode** (lines 353-358):
   - Calls `PromptManager.addPrompt()` with `approvalMode: 'auto'`
   - PromptManager evaluates auto-approval rules (see Layer 5)
   - If auto-approved → return `{ behavior: 'allow' }`
   - If not auto-approved → fall through to manual queue

5. **Manual Mode / Auto-Escalated** (lines 362-374):
   - Calls `PromptManager.addPromptAndWait()` — blocks execution
   - Sets session status to `waiting_for_input`
   - Broadcasts prompt to UI via WebSocket
   - Waits for human to click "Allow" or "Deny"
   - Returns `{ behavior: 'allow' }` or `{ behavior: 'deny' }`

**How to control:** Set `approvalMode`, `allowedTools`, and `networkPolicy` when spawning.

### Layer 5 — PromptManager Auto-Approval Rules
**Location:** `src/mission-control/prompt-manager.ts` lines 42-101
**What it does:** When `approvalMode === 'auto'`, the PromptManager evaluates each tool call against pattern-matching rules:

**DANGEROUS_PATTERNS (always escalate to human):**
```
rm -rf, rm -r /, del /s, rmdir /s, format, mkfs, dd if=,
npm publish, npm unpublish, git push --force, git reset --hard,
deploy, kubectl, docker push, shutdown, reboot
```

**SAFE_COMMANDS (auto-approve):**
```
npm test, npx tsc, npx vitest, npm run, git status, git diff,
git log, git branch, git add, git commit, ls, dir, cat, type,
head, tail, find, wc, echo, pwd, whoami, which, where,
cp, copy, mv, move, mkdir, md, node, python, npx, cd, tree,
sort, uniq, diff
```

**Auto-Approval Logic (in order):**
1. Check dangerous patterns → if match, escalate to human (return `auto: false`)
2. Check read operations (read, glob, grep, search) → auto-approve
3. Check write/edit operations → auto-approve
4. Check safe commands → auto-approve
5. Check bash (not dangerous) → auto-approve
6. Default: auto-approve (line 96 — "no dangerous patterns detected")

**Key insight:** The auto-approval rules are VERY permissive. Write and Edit operations are explicitly auto-approved (line 79-81). The problem is NOT in this layer.

**How to control:** Modify the `SAFE_COMMANDS` and `DANGEROUS_PATTERNS` arrays in `prompt-manager.ts`.

### Layer 6 — Claude Code Hooks (Post-Decision Override)
**Location:** `.claude/settings.local.json` lines 128-164
**What it does:** The Claude Code CLI supports hooks that execute shell commands at specific lifecycle events. These hooks can return a `permissionDecision` field that OVERRIDES all previous permission decisions.

**Current hooks configured:**
- `SessionStart` → runs `node .claude/hooks/session-start.cjs` (timeout 5s)
- `PostToolUse` → runs `node .claude/hooks/post-tool-use.cjs` (timeout 5s)
- `Stop` → runs `node .claude/hooks/stop.cjs` (timeout 5s)

**Note:** There is no `PreToolUse` hook currently configured. If one were added, it could intercept tool calls before execution and return `permissionDecision: 'deny'` to block them regardless of what `canUseTool` returned.

**How to control:** Edit the `hooks` section in `.claude/settings.local.json`.

---

## Finding 2: Root Cause of Edit/Write Failures

### Why tools get denied despite auto-approval rules approving them

The auto-approval logic in PromptManager (Layer 5) correctly identifies Write/Edit as safe and returns `auto: true`. But the tool call never reaches Layer 5 because it gets blocked earlier.

**Primary cause: Layer 2 — `permissionMode: 'default'`**

When the PIA system uses `permissionMode: 'default'`, the SDK spawns a real Claude Code subprocess via `spawnClaudeCodeProcess` (lines 401-414). This subprocess has its OWN internal permission system that runs independently of your `canUseTool` callback.

The SDK's `'default'` permission mode means: "Apply standard Claude Code permission rules." In the standard Claude Code CLI, when you run `claude` interactively, it prompts you for permission to edit files. The SDK subprocess does the same thing — it tries to prompt. But since there's no interactive terminal (it's running as a subprocess with `stdio: ['pipe', 'pipe', 'pipe']`), the prompt fails and the tool is denied.

**Your `canUseTool` callback is one input to the decision, not the sole decider.** The SDK's internal permission system can independently deny tools even after `canUseTool` returns `{ behavior: 'allow' }`.

**Secondary cause: Layer 3 — Settings file context**

The `settingSources: ['project']` configuration loads `.claude/settings.local.json` from the agent's `cwd`. But the settings file at the project root lists permissions for Bash, MCP tools, and WebFetch — it does NOT explicitly list Edit, Write, Read, Glob, or Grep. In the normal CLI these are implicitly allowed, but the SDK subprocess may treat unlisted tools as requiring explicit permission.

**Tertiary cause: CWD and path inconsistency**

Line 395 normalizes the CWD to forward slashes for the SDK options:
```typescript
cwd: session.config.cwd.replace(/\\/g, '/')
```
But the `spawnClaudeCodeProcess` at line 409 uses `config.cwd` which comes from the SDK — this may or may not be normalized. Path mismatches on Windows can cause the subprocess to fail to find the `.claude/settings.local.json` file.

---

## Finding 3: The SDK's Internal Permission Model (from type definitions)

From `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`:

**`CanUseTool` callback signature:**
```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];      // SDK suggests permission rule updates
    blockedPath?: string;                  // Why it was blocked (filesystem path)
    decisionReason?: string;               // Explains what triggered the permission request
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;
```

**`PermissionResult` return type:**
```typescript
type PermissionResult =
  | { behavior: 'allow'; updatedInput?: {...}; updatedPermissions?: [...] }
  | { behavior: 'deny'; message: string; interrupt?: boolean };
```

Note the `options.blockedPath` and `options.decisionReason` fields — these tell you WHY the SDK is asking for permission. If the block comes from the SDK's internal rules, `decisionReason` will describe it. Currently, the PIA system does not log these fields — adding logging here would help debug future permission issues.

**Permission evaluation order inside the SDK:**
1. Settings files define baseline rules (`settingSources`)
2. `disallowedTools` hard filter (tool completely removed)
3. SDK's own internal permission rules evaluate the tool call
4. If the internal rules say "prompt needed" → `canUseTool` is called
5. `PreToolUse` hooks can override with `permissionDecision`
6. Tool executes (or is denied)

---

## Finding 4: All Controllable Parameters

### When spawning an agent (`POST /api/mc/agents`):

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `mode` | `'sdk' \| 'api' \| 'pty'` | `'sdk'` | Execution mode |
| `approvalMode` | `'manual' \| 'auto' \| 'yolo' \| 'plan'` | `'auto'` | Permission strategy |
| `allowedTools` | `string[]` | none | If set, ONLY these tools allowed |
| `disallowedTools` | `string[]` | none | These tools completely blocked |
| `networkPolicy` | `{allowedDomains, blockedDomains, ecosystems}` | none | URL restrictions for Bash |
| `additionalDirectories` | `string[]` | none | Extra directories agent can access |
| `loadProjectSettings` | `boolean` | `true` | Load `.claude/settings.local.json` |
| `enableCheckpointing` | `boolean` | `true` | File rollback support |
| `maxBudgetUsd` | `number` | `5.00` | Cost limit |
| `maxTurns` | `number` | `100` | Prevent runaway loops |
| `model` | `string` | `'claude-opus-4-6'` | AI model |
| `fallbackModel` | `string` | auto-detected | Fallback on errors/rate limits |
| `effort` | `'low' \| 'medium' \| 'high' \| 'max'` | none | Thinking effort |
| `systemPrompt` | `string` | none | Appended to claude_code preset |
| `autoRestart` | `boolean` | `true` | Auto-restart on transient errors |
| `maxRestarts` | `number` | `2` | Max restart attempts |

### Runtime controls:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/mc/agents/:id/mode` | Change approval mode mid-session |
| `POST /api/mc/agents/:id/respond` | Respond to pending permission prompt |
| `DELETE /api/mc/agents/:id` | Kill the agent |
| `GET /api/mc/agents/:id/journal` | View full activity log |
| `GET /api/mc/prompts` | View all pending permission prompts |

---

## Finding 5: Recommended Fixes (Not Yet Implemented)

### Fix 1: Map approval modes to better SDK permission modes
**File:** `src/mission-control/agent-session.ts` line 380
**Current:** Everything except `plan` uses `permissionMode: 'default'`
**Proposed:**
- `yolo` → `'bypassPermissions'` (with `allowDangerouslySkipPermissions: true`)
- `auto` → `'acceptEdits'` (auto-accept edits, prompt for other things, let `canUseTool` handle the rest)
- `manual` → `'default'` (standard behavior, `canUseTool` handles prompting)
- `plan` → `'plan'` (no execution)

### Fix 2: Disable settings loading for fully autonomous modes
**File:** `src/mission-control/agent-session.ts` line 418
**Proposed:** When `approvalMode === 'yolo'`, force `settingSources: []` to prevent project settings from interfering.

### Fix 3: Normalize CWD in spawner
**File:** `src/mission-control/agent-session.ts` line 409
**Proposed:** Apply `.replace(/\\/g, '/')` to `config.cwd` in `spawnClaudeCodeProcess`.

### Fix 4: Log SDK permission reasons
**File:** `src/mission-control/agent-session.ts` inside `canUseTool`
**Proposed:** Log `options.decisionReason` and `options.blockedPath` to the journal so permission blocks are diagnosable from the UI.

### Fix 5: Default `additionalDirectories` to project root
**File:** `src/mission-control/agent-session.ts` lines 449-451
**Proposed:** When `additionalDirectories` is not set, default to including the project root so the agent can access all project files.

---

## Summary

The permission system has 6 layers. The Edit/Write failures occur because `permissionMode: 'default'` activates the SDK's own internal permission rules which independently block tools — even though the PIA system's `canUseTool` callback approves them. The fix is to use more appropriate SDK permission modes (`acceptEdits` or `bypassPermissions`) and to optionally disable project settings loading to prevent interference.

Total code changes needed: ~15 lines across 1 file (`agent-session.ts`).

---
---

# Session 2: Implementation, Testing & Report (Claude Opus 4.6)

## What Was Done

### Phase 1: Feature Implementation
1. **Visual Activity Indicators** — CSS animations for agent status dots (working=green pulse, waiting=orange, idle=grey, error=red glow)
2. **MCP Server Support** — `mcpServers` field in config, textarea in spawn modal, JSON validation, passthrough in API
3. **Browser Agent Prototype** — `src/browser-agent/browser-session.ts` + `src/api/routes/browser.ts`, wired into server

### Phase 2: Permission Fix (from PERMISSION_FIX_HANDOFF.md)
4. **Permission Mode Mapping** — `auto/manual` → `acceptEdits`, `yolo` → `bypassPermissions`, `plan` → `plan`
5. **Settings Loading** — Disabled project settings in yolo mode
6. **CWD Normalization** — Backslash to forward slash for Windows

### Phase 3: Bug Fixes (discovered during testing)
7. **Auth Conflict Fix (CRITICAL)** — SDK agents crashed because both `ANTHROPIC_API_KEY` (from .env) and stored OAuth token coexisted. Fix: remove API key from subprocess env.
8. **MCP Servers Format Fix** — SDK expects `Record<string, Config>` not `Array`. Added conversion.

### Phase 4: Testing
- Spawned 3 SDK agents (Read, Write, Browser), captured 16+ screenshots
- Built HTML test report at `test-screenshots/TEST_REPORT.html`
- Viewable at `http://localhost:3000/test-screenshots/TEST_REPORT.html`

## Test Results: 10 PASS, 1 PARTIAL

## Top Improvement Priorities
1. **P1** — Resolve `npx` path for MCP server subprocess spawning
2. **P1** — Investigate Bash tool access in `acceptEdits` mode
3. **P2** — Agent persistence across server restarts
4. **P2** — Improve grid tile output display

---
---

# Session 3: Multi-Machine Strategy, Git Deployment & Agent Briefings

## 1. HTML Mockups Review

Identified all 19 HTML mockup pages showing how PIA's control panel works, served at `http://localhost:3000/<filename>`:
- `mission-control.html` — Main Mission Control panel
- `mission-control-cli.html` — CLI version
- `visor.html` — Visor panel
- `wireframes.html` — Wireframes
- `how-it-works.html`, `showcase.html`, `guide.html`, `handbook.html`, `system-plan.html`, `agent-generator.html`, `simple-guide.html`, `knowledge.html`, `terminology.html`, `how-claude-learns.html`, `checklist.html`, `work.html`, `pia-plan-infographic.html`, `index.html`, `offline.html`

---

## 2. Remote Terminal Control — Honest Assessment

**Question:** Can PIA control a terminal on another machine (e.g. Antigravity CLI on Machine 2)?

**Answer: No, not yet.** The PTY wrapper (`src/tunnel/pty-wrapper.ts`) uses `node-pty` which spawns **local processes only**. No SSH, no remote tunnel, no remote execution.

**What exists:**
- Local PTY — spawns processes on the PIA server machine only
- WebSocket server — streams local PTY output to browser (Mission Control)

**Key insight:** PIA doesn't remotely control another machine's terminal. Instead, each machine controls its OWN terminal — you just tell it what to do via the relay system. Like hiring someone — you give instructions, they do the work themselves.

---

## 3. Multi-Machine Architecture — Already Built (Mostly)

**Discovery:** PIA already has most of the multi-machine infrastructure:
- `src/comms/cross-machine.ts` — Cross-machine relay (WebSocket, Tailscale, ngrok, Discord, REST API)
- `src/api/routes/relay.ts` — Relay API (`/api/relay/register`, `/api/relay/send`, `/api/relay/broadcast`)
- `src/api/routes/machines.ts` — Machine registration and database
- `src/config.ts` — Already has `PIA_MODE=hub|local` and `PIA_HUB_URL`

**The gap:** Relay can send messages, but no handler to receive a message and execute it in local terminal. That's the bridge needed.

---

## 4. Secure Remote Access Research (Completed)

Researched 6 options for secure off-network communication:

| Option | Setup | Cost | Security | Verdict |
|---|---|---|---|---|
| **Tailscale** | 5 min/machine | Free (100 devices) | Excellent (WireGuard) | **Winner** |
| Cloudflare Tunnel | 15-30 min | Free-ish | Very Good | Backup |
| ngrok | Easy one-way | $8-20/mo | Decent | Already in code |
| WireGuard | Hard | Free | Excellent | Too manual |
| SSH Tunnels | Medium-hard | Free | Good | Fragile |
| mTLS | Hard | Free | Excellent | Overkill |

**Decision:** Tailscale for network layer (already installed on other machines), HMAC shared-secret for application-layer auth.

Code changes needed: mesh config, HMAC auth middleware, sign outgoing requests, Tailscale IP auto-detect. ~1-2 days work.

---

## 5. Git Deployment

### 5a. Committed PIA Core (89 files)

Carefully staged ONLY PIA core files, excluding DAO and secrets:

**Committed:** Mission Control upgrades, DAO frontend HTML, browser agent, Docker support, admin panel, test screenshots, session journals, CLAUDE.md, package updates.

**Excluded:** `dao-foundation-files/`, `Martin/`, `research/`, `firebase-service-account.json`, `.env.keys`, `.claude/settings.local.json`, loose DAO scripts.

**Commit:** `fa34f6e` — `feat: PIA core — Mission Control upgrades, DAO frontend, browser agent, Docker support`

### 5b. .gitignore Hardened

Added: `nul`, `.claude/settings.local.json`, `**/.claude/settings.local.json`, `.env.keys`, `firebase-service-account.json`, `**/firebase-service-account*.json`

### 5c. Push Blocked → Resolved

GitHub secret scanning found Anthropic API keys in older commits. User unblocked via GitHub security URLs and published to GitHub.

---

## 6. DAO Separation Strategy

### Problem
- `dao-foundation-files/` (108 files) lives inside PIA's repo
- DAO originally on Machine 3 (currently OFF)
- Machine 3 already has a DAO GitHub folder

### Decision: DEFER
- DAO files stay in PIA for now
- When Machine 3 comes back, agent will reconcile and create proper `sodaworld-dao` GitHub repo
- Then Machine 1 removes `dao-foundation-files/`

### PIA ↔ DAO Entanglements
- `src/api/routes/dao-modules.ts` — 4 imports from `dao-foundation-files/`
- `src/db/database.ts` — migration `025_dao_foundation` creates DAO tables
- `public/knowledge.html` and `public/terminology.html` — minor path references

---

## 7. Product Vision Brainstorm

### Desktop App (Electron)
Instead of `git clone` + `npm install`, download a PIA app. Electron wraps the existing Node.js server + HTML dashboards. System tray, auto-update, settings UI.

### Vision Pro Spatial View
Visualize each PIA machine as floating panels in 3D space. Grab, move, resize, arrange data. Start with WebXR in Safari (works with existing HTML), native visionOS later.

---

## 8. Agent Briefings Created

| File | Purpose | Status |
|---|---|---|
| `MACHINE_2_SETUP_BRIEFING.md` | PIA setup on Machine 2 as local agent | Ready — hand to Claude on Machine 2 |
| `AGENT_PROMPT_FIX_GITHUB_PUSH.md` | Fix leaked API keys blocking push | Ready — resolved by user |
| `AGENT_PROMPT_DAO_SEPARATION.md` | Clean DAO→own package separation | Ready — use AFTER Machine 3 reconciliation |
| `AGENT_PROMPT_MACHINE_3_DAO_RECOVERY.md` | Reconcile DAO + setup PIA on Machine 3 | Ready — for when Machine 3 comes back |

---

## 9. Task Board — What's Next

### Can do NOW
| # | Task |
|---|---|
| 1 | Fix GitHub push block (DONE — user unblocked) |
| 2 | Multi-machine mesh — Tailscale + secure relay |
| 4 | Electron desktop app — wrap PIA as downloadable app |

### Needs something first
| # | Task | Blocked by |
|---|---|---|
| 3 | Remote command execution | #2 (mesh) |
| 5 | Onboarding / join code wizard | #2 + #4 |
| 6 | Multi-machine dashboard | #2 + #3 |
| 7 | Vision Pro spatial view | #6 |
| 8 | DAO separation | Machine 3 coming back online |

### Build order
```
#1 Fix push ✅ DONE
#2 Mesh ──→ #3 Remote exec ──→ #6 Dashboard ──→ #7 Vision Pro
#4 Electron app ──→ #5 Onboarding wizard
#8 DAO separation ──→ (when Machine 3 is back)
```

---

## Key Decisions Made This Session
1. PIA multi-machine uses **hub/local model** — Machine 1 is hub, others are local agents
2. **Tailscale** for secure networking — already installed on other machines
3. DAO stays in PIA for now — separated when Machine 3 returns
4. **Desktop app** is a product goal — Electron wrapper
5. **Vision Pro** is future milestone — WebXR first, native later
6. Each machine owns its own repo copy — same code, different `.env`, different database
7. Created 4 agent briefing documents for delegating work to Claude on other machines

---
---

# Session 4: Machine Message Board + WhatsApp Integration

## 1. Machine Message Board (Persistent Cross-Machine Messaging)

### Problem
The Agent Bus (agent-to-agent) and Cross-Machine Relay (machine-to-machine) both store messages in memory only. Server restart = all messages lost. No persistent inbox for machines to leave messages for each other.

### What Was Built

**Database Layer:**
- Migration `040_machine_messages` — new `machine_messages` table with indexes on from/to/type/read/created_at
- Query file `src/db/queries/machine-messages.ts` — save, query (with filters), mark-read, mark-all-read, stats, cleanup old messages

**Persistence Wiring:**
- `src/comms/cross-machine.ts` — Both `send()` and `handleIncoming()` now call `saveMachineMessage()` to persist every cross-machine message to SQLite. Wrapped in try/catch so persistence failure doesn't break the relay.

**API Endpoints (`/api/machine-board`):**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List messages (filter by from, to, type, channel, unread, since, limit) |
| GET | `/unread/:machineId` | Unread count + messages for a machine |
| POST | `/send` | Send message (uses relay.send(), auto-persists) |
| POST | `/:messageId/read` | Mark message as read |
| POST | `/read-all/:machineId` | Mark all read for a machine |
| GET | `/stats` | Total, unread, breakdown by type |
| DELETE | `/cleanup?days=30` | Delete old read messages |

**Dashboard UI (Mission Control):**
- New "Messages" tab in center panel (alongside Terminal, Journal, Cost)
- Always visible when a machine is selected (even with no agents running)
- Compose form: target machine dropdown + message input + send button
- Message cards: from machine, arrow, to machine, type badge (chat/command/status/task/file), timestamp, content, read/unread indicator
- "Mark read" link on unread messages
- Unread badge counter on the Messages tab label
- Auto-refresh when `relay:message` WebSocket event arrives

### Files Changed
| File | Change |
|------|--------|
| `src/db/database.ts` | Added migration `040_machine_messages` |
| `src/db/queries/machine-messages.ts` | **NEW** — 7 query functions |
| `src/comms/cross-machine.ts` | Added `saveMachineMessage()` calls in send + handleIncoming |
| `src/api/routes/machine-board.ts` | **NEW** — 7 REST endpoints |
| `src/api/server.ts` | Mounted machine-board + whatsapp routes |
| `public/mission-control.html` | CSS + HTML + JS for Messages tab |

---

## 2. WhatsApp Integration

### What Was Built

**WhatsApp Bot Adapter (`src/comms/whatsapp-bot.ts`):**
- `PIAWhatsAppBot` class following the exact Discord bot pattern
- Uses `whatsapp-web.js` library (WhatsApp Web protocol via Puppeteer/Chrome)
- QR code authentication — scan with phone to link
- Session persisted in `data/whatsapp-session/` — only scan once
- Message handler callback pattern: `onMessage(async (msg, userId, respond) => {})`
- Allowed numbers whitelist (optional)
- Message splitting for long replies (4000 char chunks)
- Singleton pattern with `createWhatsAppBot()` / `getWhatsAppBot()`

**Communications Module (`src/comms/index.ts`):**
- Added WhatsApp initialization alongside Discord
- Same orchestrator bridge pattern: WhatsApp message → `orchestrator.handleHumanMessage()` → reply back
- Controlled by `whatsappEnabled` and `allowedWhatsAppNumbers` config

**Channel Type Updates:**
- `src/comms/cross-machine.ts` — Added `'whatsapp'` to channel union types
- `src/api/routes/relay.ts` — Added `'whatsapp'` to channel type cast

**API Endpoints (`/api/whatsapp`):**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/status` | Connection status (ready, phone number, QR pending) |
| GET | `/qr` | Get current QR code string |
| POST | `/send` | Send message to a WhatsApp number |
| POST | `/start` | Start the WhatsApp bot (auto-wires to orchestrator) |
| POST | `/stop` | Disconnect WhatsApp |

**Dashboard UI:**
- WhatsApp status indicator in Mission Control header (green=connected, orange=scan QR, grey=off)
- Click to start/stop
- QR pairing modal — instructs user to scan QR from server terminal
- Auto-polls every 3s during pairing to detect connection

### How It Works
1. Click "WhatsApp" in Mission Control header → `POST /api/whatsapp/start`
2. Server launches headless Chrome, connects to WhatsApp Web, generates QR
3. QR displays in server terminal — scan with phone (WhatsApp → Linked Devices)
4. Once paired, session saved to `data/whatsapp-session/`
5. Send a WhatsApp message → PIA orchestrator processes it → reply sent back
6. Use cases: "How many projects are you on?", "Spawn an agent on Machine 2", "What's the DAO status?"

### Files Changed
| File | Change |
|------|--------|
| `src/comms/whatsapp-bot.ts` | **NEW** — PIAWhatsAppBot class |
| `src/comms/index.ts` | Added WhatsApp init + exports |
| `src/comms/cross-machine.ts` | Added 'whatsapp' channel type |
| `src/api/routes/relay.ts` | Added 'whatsapp' channel type |
| `src/api/routes/whatsapp.ts` | **NEW** — 5 REST endpoints |
| `src/api/server.ts` | Mounted whatsapp route |
| `public/mission-control.html` | WhatsApp status indicator + QR modal |

---

## 3. WhatsApp Library Research

### Recommendation: Switch to Baileys

Researched current WhatsApp libraries for Node.js (Feb 2026):

| | whatsapp-web.js (installed) | Baileys (recommended) | Official Cloud API |
|---|---|---|---|
| Browser needed | Yes (Puppeteer/Chrome ~200MB) | **No** — pure WebSocket | No (HTTP) |
| TypeScript | JS + DT types | **Native TypeScript** | N/A |
| Weight | Heavy | **Lightweight (~2MB)** | Zero deps |
| Auth | QR code | QR code + **pairing code** | Meta Business account |
| Cost | Free | Free | $0.005+/msg |
| Repo | pedroslopez/whatsapp-web.js | WhiskeySockets/Baileys | Meta |

**Why Baileys is better for PIA:**
1. No Chrome/Puppeteer — just WebSocket. Way lighter for multi-machine deployments.
2. Native TypeScript — matches PIA codebase perfectly.
3. Pairing code auth — can pair without QR scanning (useful for headless servers).
4. Active community — WhiskeySockets maintains it, Baileys-2025-Rest-API exists as reference.
5. WhatsApp MCP server already built with Baileys (jlucaso1/whatsapp-mcp-ts).

**Action item:** Swap `whatsapp-web.js` → `baileys` in `whatsapp-bot.ts`. Drop-in replacement — same pattern, different underlying transport.

---

## Summary of All Changes This Session

### New Files (5)
1. `src/db/queries/machine-messages.ts` — Machine message board queries
2. `src/api/routes/machine-board.ts` — Machine message board API
3. `src/comms/whatsapp-bot.ts` — WhatsApp bot adapter
4. `src/api/routes/whatsapp.ts` — WhatsApp API endpoints

### Modified Files (5)
1. `src/db/database.ts` — Migration 040
2. `src/comms/cross-machine.ts` — Persistence + whatsapp channel type
3. `src/comms/index.ts` — WhatsApp initialization
4. `src/api/routes/relay.ts` — whatsapp channel type
5. `src/api/server.ts` — Mounted 2 new route modules
6. `public/mission-control.html` — Messages tab + WhatsApp status/QR modal

### Dependencies Added
- `whatsapp-web.js` — WhatsApp Web client (to be replaced with `baileys`)
- `qrcode-terminal` — QR code display in terminal

### TypeScript: Clean build (all errors are from dao-foundation-files/ which is excluded per CLAUDE.md)
