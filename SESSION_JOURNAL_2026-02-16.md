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

---
---

# Session 5: Fleet Deployment, The Cortex, and System Architecture

## 1. Tailscale Fleet Discovery

Discovered the full machine fleet via Tailscale:

| Machine | Hostname | Tailscale IP | LAN IP | Status |
|---|---|---|---|---|
| Machine 1 | izzit7 | `100.73.133.3` | `192.168.0.2` | Running PIA |
| Machine 2 | soda-monster-hunter | `100.127.165.12` | `192.168.0.4` | Online, PIA being set up |
| Machine 3 | soda-yeti | `100.102.217.69` | `192.168.0.6` | Online, PIA being set up |
| (old) | desktop-i1vgjka | `100.83.158.49` | — | Offline 800 days |
| (old) | desktop-rm1ov6e | `100.99.94.110` | — | Offline 838 days |
| (phone) | samsung-sm-a125f | `100.66.124.25` | — | Offline 37 days |

All 3 active machines are on the same LAN (`192.168.0.x`) AND Tailscale mesh. Direct peer-to-peer connections confirmed with active traffic flowing.

---

## 2. Architecture Decision: All Machines Are Equal Peers

**Corrected earlier assumption.** The user clarified: no machine is master. All machines are equal.

- Changed from hub/local model to **peer model**
- Every machine runs `PIA_MODE=hub` (full capabilities)
- Mission Control can connect to and manage any machine
- A central control system sits above all machines, not on any one machine
- Git (GitHub) is the single source of truth — any machine can push/pull

---

## 3. Machine Setup Prompts

### Machine 2 Setup
Provided copy-paste prompt for Claude on soda-monster-hunter:
- Clone repo, npm install
- `.env` with `PIA_MODE=hub`, `PIA_MACHINE_NAME=soda-monster-hunter`
- Tailscale IPs for all machines
- Open own dashboard at localhost:3000

### Machine 3 Setup
Provided copy-paste prompt for Claude on soda-yeti:
- Same PIA setup as Machine 2 but with Machine 3 identity
- Plus DAO recovery task (read `AGENT_PROMPT_MACHINE_3_DAO_RECOVERY.md`)

---

## 4. Cross-Machine Update Problem Identified

**Problem:** When Machine 1 makes code changes and pushes to GitHub, Machine 2 and 3 don't know about it. No notification, no auto-pull.

**Solution needed:** A `/api/system/update` endpoint on each machine that:
1. Runs `git pull origin master`
2. Runs `npm install && npm run build`
3. Restarts the server

Machine 1 can then trigger updates across the fleet:
```bash
curl -X POST http://100.127.165.12:3000/api/system/update  # Machine 2
curl -X POST http://100.102.217.69:3000/api/system/update   # Machine 3
```

This is a prerequisite for the remote command execution task (#3).

---

## 5. "The Cortex" — Fleet Intelligence Brain

### Concept
An AI intelligence layer that sits on top of all PIA machines. It collects data from every machine, analyzes patterns, and provides insights. The data can be viewed on any surface — browser, Vision Pro, tablet, phone, WhatsApp.

### Name: "The Cortex"
The cortex = the thinking layer of the brain. Each PIA machine is a neuron. The Cortex processes signals from all neurons and generates understanding.

### Key Design Principle: The Brain Gets Fat, Not the Repo
- Git repositories stay lean (code only)
- The Cortex's memory/knowledge lives in a separate database (`.gitignore`'d)
- Hot data (24h): full detail, fast access
- Warm data (30 days): summarized
- Cold data (older): compressed archives
- Learned patterns: permanent, small footprint
- Like human memory — you remember patterns and lessons, not every raw detail

### Data Ecology (what The Cortex collects)
- Per-machine: CPU, memory, disk, PIA status, active agents, terminal sessions, errors, git status, network
- Cross-machine: sync status, message flow, workload distribution, delegation patterns
- Temporal: activity over time, error spikes, cost accumulation, completion rates

### Intelligence Layer (what The Cortex thinks)
- **Observes:** "Machine 2 is 5 commits behind", "Agent stuck for 10 min"
- **Suggests:** "Git pull Machine 2", "Restart stuck agent", "Balance load"
- **Acts (with permission):** Send commands via relay, restart agents, alert via WhatsApp

### Data Surfaces (where you view The Cortex)
Universal JSON API consumed by any renderer:
- Mission Control (browser) — Cortex tab
- Vision Pro — spatial 3D panels, machines as floating objects
- Tablet — responsive grid of machine cards
- WhatsApp — "How's the fleet?" → text summary
- Terminal — `pia cortex status`

### Agent Prompt Created
`AGENT_PROMPT_CORTEX_AI_BRAIN.md` — full exploration prompt covering:
- Data ecology design
- Intelligence layer architecture
- Surface-agnostic API design
- Where The Cortex runs (on one machine vs distributed vs separate)
- AI engine options (Ollama vs Claude API vs rules vs hybrid)
- Vision Pro / tablet experience design
- Brain-gets-fat storage principle

---

## 6. Fleet Deployment Prompt

`AGENT_PROMPT_DEPLOY_FLEET.md` — full deployment prompt covering:
- Machine 2 setup (clone, install, .env, build, verify)
- Machine 3 setup (same + DAO recovery)
- Cross-registration (every machine knows about every other)
- Full mesh verification (6 connectivity tests)
- Firewall setup (Windows firewall rules for ports 3000, 3001)
- Status report template
- Troubleshooting guide

Both agents are **aware of each other's existence** — the Cortex agent knows machines are being deployed, the deployment agent knows The Cortex is being designed. They're building the body and brain in parallel.

---

## 7. All Agent Briefings (8 total)

| File | Type | Status |
|---|---|---|
| `MACHINE_2_SETUP_BRIEFING.md` | Setup instructions | Ready |
| `AGENT_PROMPT_FIX_GITHUB_PUSH.md` | Fix task | Resolved by user |
| `AGENT_PROMPT_DAO_SEPARATION.md` | Build task | Deferred (Machine 3) |
| `AGENT_PROMPT_MACHINE_3_DAO_RECOVERY.md` | Recovery task | Ready for Machine 3 |
| `AGENT_PROMPT_MACHINE_MESSAGING.md` | Build task | Built in Session 4 |
| `AGENT_PROMPT_ELECTRON_APP_EXPLORATION.md` | Exploration | Ready |
| `AGENT_PROMPT_CORTEX_AI_BRAIN.md` | Design exploration | Ready — deploying to agent |
| `AGENT_PROMPT_DEPLOY_FLEET.md` | Deployment task | Ready — deploying to agent |

---

## 8. Key Decisions This Session

1. **All machines are equal peers** — no hub/master, `PIA_MODE=hub` everywhere
2. **The Cortex** is the name for PIA's Fleet Intelligence Brain
3. **Brain gets fat, repo stays lean** — telemetry/memory stored separately from code
4. **Surface-agnostic data** — same JSON API powers browser, Vision Pro, tablet, WhatsApp
5. **Two parallel workstreams** — fleet deployment + Cortex design, aware of each other
6. **Fleet update mechanism needed** — `/api/system/update` endpoint for remote git pull
7. **Tailscale mesh confirmed working** — all 3 machines connected, direct peer-to-peer

---

## 9. Major Discovery: PIA Already Has 80% of The Cortex Built

### Deep codebase search revealed massive existing infrastructure

Keyword search across 72 files revealed that PIA already has the foundations for fleet intelligence, autonomous execution, and memory management. These systems were built in earlier sessions but hadn't been connected to the multi-machine discussion.

### Existing systems map

**Memory & Intelligence (the brain already exists):**
- `src/souls/soul-engine.ts` — Persistent agent personality, memory, goals, relationships that survive across sessions and machines
- `src/souls/memory-manager.ts` — Categorized memories (experience, decision, learning, observation, goal_progress), importance scoring (0-1), automatic summarization of old memories, pruning. **Already implements the "brain gets fat, not the repo" pattern.**
- `src/souls/seed-souls.ts` — Pre-built agent personalities

**Orchestration (execution loop already exists):**
- `src/orchestrator/execution-engine.ts` — "The Brain of PIA" — pulls tasks from queue, routes through AI, executes, tracks cost, notifies
- `src/orchestrator/autonomous-worker.ts` — Claude API tool loop that receives a task description, calls Claude with tools, and executes in a loop until done. **This IS the remote command execution we said was missing (Task #3).**
- `src/orchestrator/task-queue.ts` — Priority task queue
- `src/orchestrator/heartbeat.ts` — Machine liveness monitoring

**Communication (transport already exists):**
- `src/comms/mqtt-broker.ts` — Full pub/sub with topic hierarchy (`pia/machine/event`), wildcards (`+` single, `#` multi), retained messages. **Perfect for Cortex telemetry streaming.**
- `src/comms/repo-router.ts` — Registry of repos across machines, task routing by capability, job history tracking
- `src/comms/cross-machine.ts` — Machine relay (WebSocket, Tailscale, ngrok, Discord, API)
- `src/comms/discord-bot.ts` — Discord integration
- `src/comms/whatsapp-bot.ts` — WhatsApp integration (built Session 4)
- `src/comms/webhooks.ts` — Webhook system

**AI & Cost (multi-model already exists):**
- `src/ai/ai-router.ts` — Routes to Claude, Ollama, OpenAI, Gemini, Grok
- `src/ai/cost-tracker.ts` — Spend tracking per model/agent
- `src/agents/cost-router.ts` — Routes to cheapest/best model
- `src/agents/doctor.ts` — System health checks
- `src/agents/agent-factory.ts` — Agent creation with capabilities

**Existing UI:**
- `FLEET_DASHBOARD_MOCKUP.html` — Already designed fleet dashboard ("Empire Fleet Dashboard")
- `public/mission-control.html` — Live Mission Control
- `public/visor.html` — Visor panel

### Impact on task board

Several tasks we thought needed building from scratch actually need WIRING UP:
- **Task #3 (Remote command execution):** The Autonomous Worker already does this — just needs cross-machine triggering
- **Task #2 (Multi-machine mesh):** MQTT Broker + Repo Router + Cross-Machine Relay already exist — need Tailscale auth layer
- **Task #6 (Multi-machine dashboard):** Fleet Dashboard mockup already designed

### Updated both agent prompts
- `AGENT_PROMPT_CORTEX_AI_BRAIN.md` — Added full inventory of existing systems the Cortex agent must read and build on
- `AGENT_PROMPT_DEPLOY_FLEET.md` — Added note about Autonomous Worker and existing infrastructure

---

## 10. Updated Task Board

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Fix GitHub push block | **DONE** | User unblocked via GitHub |
| 2 | Multi-machine mesh | Mostly built | MQTT + Repo Router + Relay exist, need Tailscale auth |
| 3 | Remote command execution | Mostly built | Autonomous Worker exists, need cross-machine trigger |
| 4 | Electron desktop app | Prompt ready | `AGENT_PROMPT_ELECTRON_APP_EXPLORATION.md` |
| 5 | Onboarding flow | Blocked by #2, #4 | |
| 6 | Multi-machine dashboard | Mockup exists | `FLEET_DASHBOARD_MOCKUP.html` |
| 7 | Vision Pro spatial view | In Cortex design | Part of Cortex surfaces |
| 8 | DAO separation | Deferred | Waiting for Machine 3 |
| NEW | The Cortex | Prompt ready | `AGENT_PROMPT_CORTEX_AI_BRAIN.md` |
| NEW | Fleet deployment | Prompt ready | `AGENT_PROMPT_DEPLOY_FLEET.md` |

---
---

# Session 6: Electron Desktop App — Full Technical Exploration (Opus 4.6)

## Goal
Explore and plan building PIA as a downloadable desktop app (Electron). Research frameworks, UI options, packaging, distribution, auto-update. Produce a comprehensive analysis and phased build plan.

## Key Decisions Made (with user input)

| Question | Decision |
|---|---|
| Target user | Devs first, non-technical later |
| Priority | Solid architecture — build it right |
| Code signing | Not yet — accept SmartScreen warnings |
| App size | Matters somewhat, won't reject Electron for size |
| UI approach | **Rebuild with React + shadcn/ui** (not wrap existing HTML) |
| CLI support | Yes — both `npm run dev` (CLI) and Electron (desktop) from same codebase |

## Research Conducted

Launched 3 parallel research agents:

### 1. Framework Comparison (Electron vs Tauri vs Others)
- **Electron is the only viable option** — PIA requires Node.js server, node-pty (C++ addon), better-sqlite3 (C++ addon), Firebase Admin SDK, Playwright, Claude Agent SDK. Only Electron can run all of this internally.
- Tauri can't run Node.js natively — would need a sidecar approach which breaks with native modules
- NW.js is viable but tiny ecosystem
- PWA/PKG/nexe not suitable (no PTY access, no system tray, no desktop UX)
- **Key insight**: Current `electron-main.cjs` spawns server as child process using stock Node.js (not Electron's modified Node.js), so native module ABI is simpler

### 2. UI Framework for Electron
- **React 19 + shadcn/ui + Zustand + electron-vite** recommended
- Proven in Electron at scale: Slack, Discord, Figma, 1Password, Notion all use React + Electron
- shadcn/ui: 83K GitHub stars, copy-paste model, professional dark desktop aesthetic, official Electron template exists
- Zustand for state management: 2KB, no boilerplate, perfect for multiple concurrent agent streams
- electron-vite for build tooling: purpose-built for Electron's main/preload/renderer architecture
- VS Code does NOT use React (hand-rolled) — not relevant for our scale
- Svelte rejected: no mature xterm.js wrappers, smaller component library ecosystem for Electron

### 3. Packaging & Distribution
- **electron-builder** (not Forge): 620K weekly downloads vs Forge's 1.7K, better NSIS installer, electron-updater for GitHub Releases, portable EXE option
- NSIS for Windows installer (smallest size, most customizable)
- Auto-update via electron-updater + GitHub Releases (zero infrastructure)
- Native modules: `@electron/rebuild` handles compilation, ASAR unpacking mandatory for `.node` files
- Cannot cross-compile — must build on each target OS (GitHub Actions matrix)
- Code signing: Azure Trusted Signing $10/month when available to individuals (currently restricted)
- macOS requires $99/year Apple Developer for notarization — defer

## Critical Technical Finding: 15 Path Breakages

Explored every file that uses `process.cwd()`, `__dirname`, or relative paths. Found **15 locations** that break in a packaged Electron app:

| Severity | File | Issue |
|---|---|---|
| CRITICAL | `electron-main.cjs:75` | `dist/index.js` inside ASAR can't be spawned |
| CRITICAL | `config.ts:6,93` | .env path + DB path use `process.cwd()` |
| CRITICAL | `server.ts:259,263` | `public/` path uses `process.cwd()` |
| CRITICAL | `agent-session.ts:437` | `process.execPath` is Electron binary, not Node |
| CRITICAL | `database.ts:19` | better-sqlite3 native module in ASAR |
| CRITICAL | `pty-wrapper.ts:1,53` | node-pty native module in ASAR |
| HIGH | `hub-client.ts:44` | machine-id path uses `process.cwd()` |
| HIGH | `checkpoint-manager.ts:31` | checkpoint dir relative path |
| HIGH | `browser-session.ts:18` | MCP CLI path uses `process.cwd()` |
| MEDIUM | `whatsapp-bot.ts:41` | session path uses `process.cwd()` |
| MEDIUM | `mcps.ts:274` | `npx` not in PATH in packaged app |
| HIGH | Multiple route files | `process.cwd()` as default cwd for spawns |

**Fix strategy**: Create `src/electron-paths.ts` — centralized path resolution module that returns correct paths in both CLI and Electron mode.

## Deliverables Created

| File | Purpose |
|---|---|
| `ELECTRON_APP_ANALYSIS.md` | Full 9-chapter technical analysis (framework, UI, packaging, challenges, roadmap) |
| `CLAUDE.md` (updated) | Added Session Journaling rules — all agents must journal API endpoints, migrations, config changes, native deps, subprocess spawning |
| `.mcp.json` (updated) | Added Context7 MCP server for live documentation queries |

## Phased Build Plan

```
Phase 1: Package what exists → working .exe               (1 day)
Phase 2: First-run wizard + settings → install on all     (2-3 days)
Phase 3: Auto-update → push once, all machines update     (1-2 days)
Phase 4: Crash recovery, logging, edge cases              (2 days)
Phase 5: New React UI → proper app feel                   (2-3 weeks)
Phase 6: Polish, signing, macOS/Linux                     (ongoing)
```

Full plan written to `C:\Users\mic\.claude\plans\floofy-cuddling-sutherland.md` with every file, every path fix, every verification step.

## Architecture Notes for Build Agent

1. **Server runs as child process** — `electron-main.cjs` spawns `dist/index.js` via `child_process.spawn`. This is the correct pattern. Don't change it.
2. **Native modules run in the child process** (stock Node.js), not Electron's modified Node.js. May not need `@electron/rebuild` for server-side modules.
3. **`dist/**` and native modules MUST be in `asarUnpack`** or the app crashes silently.
4. **Architecture changed to equal peers** — all machines run `PIA_MODE=hub`. First-run wizard doesn't need hub/spoke choice.
5. **Context7 MCP** is configured in `.mcp.json` — restart Claude Code to activate. Agents can pull live Electron + electron-builder docs into prompts.
6. **The codebase is evolving** — other agents are building chat, messaging, DAO admin, The Cortex. Journal rules in CLAUDE.md ensure changes are tracked.

## Files Changed

| File | Change |
|---|---|
| `ELECTRON_APP_ANALYSIS.md` | **NEW** — full technical analysis |
| `CLAUDE.md` | Added Session Journaling section with template and desktop app context |
| `.mcp.json` | Added Context7 MCP server |

## Desktop App Impact
This session was research + planning only. No code changes to the server. The analysis and plan are ready for a build agent to execute Phase 1.

## Updated Task Board

| # | Task | Status | Notes |
|---|---|---|---|
| 4 | Electron desktop app | **PLAN COMPLETE** | Analysis + 6-phase plan ready, handed to build agent |

---

## Sprint: Gemini Browser Controller (Built)

### What It Is
A Gemini-powered browser automation service inside PIA. Claude agents send commands via REST API; Gemini does the visual understanding of pages using its vision API (screenshots -> Gemini -> structured action decisions).

### Why Gemini, Not Claude?
- Gemini 2.0 Flash: $0.075/1M input, $0.30/1M output (much cheaper for browser tasks)
- Free tier: 15 req/min, 2M tokens/day
- Vision-capable: can analyze screenshots natively
- Claude stays focused on reasoning/coding tasks

### Architecture
```
Claude Agent -> POST /api/browser/controller/command -> BrowserController
                                                        |-- Playwright (headless Chromium)
                                                        |-- Gemini Vision (screenshot analysis)
                                                        |-- AgentBus (inter-agent messaging)
                                                        '-- WebSocket (dashboard updates)
```

### Files Created/Modified
| File | Action | Purpose |
|------|--------|---------|
| `src/browser-controller/types.ts` | NEW | Interfaces: BrowserCommand, BrowserCommandResult, ControllerState, TaskStep |
| `src/browser-controller/controller.ts` | NEW | Core: Playwright lifecycle, command dispatch, Gemini task loop, AgentBus |
| `src/browser-controller/gemini-vision.ts` | NEW | Prompt templates: describePage, decideNextAction, extractPageText |
| `src/ai/gemini-client.ts` | MODIFIED | Added `generateWithImage()` for Gemini vision (inlineData) |
| `src/api/routes/browser.ts` | MODIFIED | Added 4 controller endpoints (start/command/status/stop) |
| `src/tunnel/websocket-server.ts` | MODIFIED | Added `mc:browser_status` to OutgoingMessage type |
| `src/index.ts` | MODIFIED | Added browser controller to shutdown handler |
| `public/mission-control.html` | MODIFIED | Browser Controller panel in sidebar (status, URL, commands, screenshot) |

### API Endpoints
```
POST /api/browser/controller/start    -> Launch headless Chromium
POST /api/browser/controller/command  -> Execute: navigate/click/fill/screenshot/extractText/executeTask
GET  /api/browser/controller/status   -> State + last screenshot as data URL
POST /api/browser/controller/stop     -> Close browser cleanly
```

### Multi-Step Task Flow (executeTask)
1. Screenshot current page
2. Send to Gemini: "Here's the page. Task: {description}. What action should I take?"
3. Gemini returns JSON: `{ action: "click", selector: "#login-btn", reasoning: "..." }`
4. Execute the action via Playwright
5. Repeat until Gemini says `{ done: true }` or maxSteps (20) reached

### Prerequisite
- `GEMINI_API_KEY` in `.env` (get from https://aistudio.google.com -> Get API Key)
- `npm install playwright` (done)

### Dependencies Added
- `playwright` npm package (for direct Chromium control)

---

## External Feedback Integration

### ChatGPT — Hub/Spoke Architecture
- Hub/Spoke + automatic failover is the right call. NOT peer-to-peer.
- Cortex is a layer on top of hub, not an infrastructure replacement.
- When hub dies, workers keep working autonomously. Hub re-syncs on restart.
- Need: one `PIA_ARCHITECTURE.md` source of truth to stop agents inventing different designs.

### Gemini — MCP Strategy
- Local install (npm install) over npx — more robust, works offline.
- We already fixed this: `@playwright/mcp` installed locally, resolved via absolute path.

---

## Reference Links
- [Electron Docs](https://www.electronjs.org/docs/latest/)
- [electron-builder](https://www.electron.build/)
- [electron-vite](https://electron-vite.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Context7 Electron Docs](https://context7.com/electron/electron) — 553 indexed pages
- [Slack Engineering: Rebuilding on Electron](https://slack.engineering/rebuilding-slack-on-the-desktop/)
- [Google AI Studio](https://aistudio.google.com) — Get Gemini API key
- [Gemini Vision API](https://ai.google.dev/gemini-api/docs/image-understanding) — inlineData format

---
---

# Session 7: WhatsApp Library Swap — whatsapp-web.js → Baileys (Claude Code / Opus 4.6)

## What Changed

Replaced `whatsapp-web.js` with `@whiskeysockets/baileys` as the WhatsApp integration library.

### Why
| | whatsapp-web.js (removed) | Baileys (installed) |
|---|---|---|
| Runtime | Puppeteer + Chrome (~200MB) | Pure WebSocket (~2MB) |
| TypeScript | JS + DT types | Native TypeScript |
| Auth | QR code only | QR code + pairing code |
| Browser needed | Yes (headless Chrome) | No |
| Dependencies | Heavy (puppeteer, chrome) | Lightweight (ws, pino, protobufjs) |
| Multi-machine | Breaks on headless servers without Chrome | Works anywhere Node.js runs |

### Files Changed
| File | Change |
|------|--------|
| `src/comms/whatsapp-bot.ts` | Full rewrite — `PIAWhatsAppBot` now uses Baileys `makeWASocket` instead of whatsapp-web.js `Client`. Same class interface (onMessage, start, stop, sendMessage, getStatus, getQR). Added auto-reconnect with `DisconnectReason` handling. Session stored via `useMultiFileAuthState`. Preserved `getDataSubDir` from electron-paths.js (added by Electron session). |
| `src/api/routes/whatsapp.ts` | JID format: `@c.us` → `@s.whatsapp.net` (Baileys format) |
| `package.json` | Removed: `whatsapp-web.js`. Added: `@whiskeysockets/baileys`, `@hapi/boom`, `pino` |

### Key Technical Differences
- **No Chrome/Puppeteer** — Baileys connects directly to WhatsApp's WebSocket servers
- **JID format** — Baileys uses `12345678901@s.whatsapp.net` (not `@c.us`)
- **Connection events** — Uses `connection.update` event with `connection: 'open' | 'close' | 'connecting'` instead of `ready`/`disconnected`
- **Messages** — Uses `messages.upsert` event with `type: 'notify'` filter instead of `message` event
- **Sending** — `sock.sendMessage(jid, { text })` instead of `client.sendMessage(chatId, text)`
- **Auth persistence** — `useMultiFileAuthState(path)` stores Signal protocol keys to disk, `creds.update` event saves on changes
- **Auto-reconnect** — Built-in reconnect on temporary disconnects (408, 428, 515), no reconnect on logged out (401)
- **Quoted replies** — Messages are sent as quoted replies: `{ quoted: msg }` option

### What Stays the Same
- Class interface: `PIAWhatsAppBot` with same methods
- Singleton pattern: `createWhatsAppBot()` / `getWhatsAppBot()`
- Message handler callback: `onMessage(async (msg, userId, respond) => {})`
- Integration with orchestrator via `src/comms/index.ts`
- All 5 API endpoints: status, qr, send, start, stop
- Dashboard UI: WhatsApp status indicator + QR modal (unchanged)
- Session persistence path: `data/whatsapp-session/`

### TypeScript Status
- Zero WhatsApp-related TypeScript errors
- 3 pre-existing errors in `websocket-server.ts` (type narrowing, not from this change)

### Desktop App Impact
- Removed heavy Chrome/Puppeteer dependency — WhatsApp now works on any machine without Chrome installed
- Lighter package size for Electron bundling
- No native module dependency from WhatsApp (was a path breakage risk in Electron)

## Cross-Session Notes

### What Other Agents Have Done (from journals)
- **Claude Code (other instance)**: All 3 machines online (Izzit7 + SODA-YETI + soda-monster-hunter). Fixed critical `require()` ESM bug in websocket-server.ts. Hub/spoke with failover architecture recommended. Cross-journal review completed.
- **Session 5**: The Cortex fleet intelligence brain concept. 80% of infrastructure already exists (soul-engine, memory-manager, execution-engine, autonomous-worker, mqtt-broker).
- **Session 6**: Full Electron desktop app analysis. React + shadcn/ui + electron-vite. 15 path breakages identified. `src/electron-paths.ts` created for centralized path resolution.
- **Gemini sprint**: Browser controller built with Gemini vision for screenshot analysis. 4 new endpoints.

### Architecture Consensus
- Hub/spoke with automatic failover is confirmed approach (not pure peer)
- The Cortex sits on top of hub data, not an infrastructure change
- All machines run same codebase, different .env, different SQLite DB

---

## Session: Electron Desktop App — Phase 1-3 Build

### Summary
Built the complete Electron desktop app packaging pipeline: path abstraction for packaged mode, electron-builder config, first-run wizard, settings page, auto-updater, secure API key storage, Tailscale peer discovery, and GitHub Actions CI/CD.

### Changes

#### Phase 1: Working .exe Foundation
- **New file**: `src/electron-paths.ts` — Centralized path resolution (CLI vs Electron packaged). Exports getAppRoot(), getDataDir(), getEnvPath(), getPublicDir(), getDatabasePath(), getMachineIdPath(), etc.
- **Rewrite**: `electron-main.cjs` — Full rewrite for packaged ASAR paths, port conflict resolution (3000-3010), server crash restart (3 retries/5min), env injection (ELECTRON_PACKAGED, ELECTRON_APP_PATH, ELECTRON_DATA_DIR), data dir creation
- **Modified**: `src/config.ts` — .env path → getEnvPath(), DB path default → getDatabasePath()
- **Modified**: `src/api/server.ts` — Firebase path → resolveFromAppRoot(), public dir → getPublicDir(), root path → getAppRoot()
- **Modified**: `src/local/hub-client.ts` — machine-id → getMachineIdPath()
- **Modified**: `src/checkpoint/checkpoint-manager.ts` — dataDir default → getDataDir()
- **Modified**: `src/comms/whatsapp-bot.ts` — session path → getDataSubDir('whatsapp-session')
- **Modified**: `src/browser-agent/browser-session.ts` — MCP CLI → resolveFromAppRoot(), cwd → getAppRoot()
- **New file**: `electron-builder.yml` — NSIS + portable targets, asarUnpack for native modules
- **New file**: `build/icon.svg` — App icon (256x256)
- **Modified**: `package.json` — main → electron-main.cjs, added electron:dev/electron:build/electron:build:portable scripts
- **New dep**: `electron-builder` (dev dependency)

#### Phase 2: First-Run, Settings, Secure Storage
- **New file**: `public/first-run.html` — First-run setup wizard (machine name, role, hub URL, API key, secret token)
- **New file**: `public/settings.html` — Settings page (all config options, restart-required badges, config export/import)
- **New file**: `electron-preload.cjs` — contextBridge preload exposing window.pia API (IPC to main process)
- **New file**: `src/utils/tailscale-discovery.ts` — Discovers PIA instances on Tailscale network (runs `tailscale status --json`, probes /api/health)
- **New endpoint**: `GET/PUT /api/settings` — Read/write .env config via REST
- **New endpoint**: `GET /api/settings/export` — Export config (without sensitive keys)
- **New endpoint**: `POST /api/settings/import` — Import config
- **New file**: `src/api/routes/settings.ts` — Settings route implementation
- **Modified**: `src/api/server.ts` — Registered settings route
- **Modified**: `electron-main.cjs` — Added IPC handlers for all preload channels, safeStorage encrypt/decrypt for API keys, first-run detection, settings read/write, Tailscale peer discovery, tray Settings menu item
- **New dep**: `electron-updater` (production dependency)

#### Phase 3: Auto-Update + CI/CD
- **New file**: `.github/workflows/build-desktop.yml` — GitHub Actions workflow: triggered on tag v*, builds Windows NSIS + portable, publishes to GitHub Releases
- **Modified**: `electron-main.cjs` — electron-updater integration (auto-download, notifications, tray progress, quit-and-install)

### Files Changed
| File | Change |
|---|---|
| `src/electron-paths.ts` | **NEW** — Centralized path resolution for CLI + Electron |
| `electron-main.cjs` | **REWRITE** — Packaged paths, port conflict, crash restart, IPC, safeStorage, auto-update |
| `electron-builder.yml` | **NEW** — Build config for NSIS + portable |
| `electron-preload.cjs` | **NEW** — contextBridge preload script |
| `public/first-run.html` | **NEW** — First-run setup wizard |
| `public/settings.html` | **NEW** — Settings page |
| `src/api/routes/settings.ts` | **NEW** — Settings REST API |
| `src/utils/tailscale-discovery.ts` | **NEW** — Tailscale peer discovery |
| `.github/workflows/build-desktop.yml` | **NEW** — CI/CD for desktop builds |
| `build/icon.svg` | **NEW** — App icon |
| `create-icon.cjs` | **NEW** — Icon generation script |
| `src/config.ts` | Uses electron-paths for .env and DB |
| `src/api/server.ts` | Uses electron-paths for public/root paths + settings route |
| `src/local/hub-client.ts` | Uses electron-paths for machine-id |
| `src/checkpoint/checkpoint-manager.ts` | Uses electron-paths for data dir |
| `src/comms/whatsapp-bot.ts` | Uses electron-paths for session dir |
| `src/browser-agent/browser-session.ts` | Uses electron-paths for MCP CLI + cwd |
| `package.json` | electron-main.cjs as main, build scripts, new deps |

### Desktop App Impact
This IS the desktop app build. All Express server paths, API routes, and WebSocket events remain stable — the electron-paths module falls back to process.cwd() in CLI mode. No breaking changes to the backend contract.

### New WebSocket Events
None — all new functionality uses REST API (/api/settings) and Electron IPC channels.

### Build Commands
```bash
npm run electron:dev              # Dev: build + launch Electron
npm run electron:build            # Package: Windows NSIS + portable
npm run electron:build:portable   # Package: portable only
```

### Next Steps (Phase 4-6)
- Phase 4: Production hardening (log rotation, native module edge cases, npx/MCP path resolution in packaged mode)
- Phase 5: React + shadcn/ui rebuild of the dashboard
- Phase 6: Polish (command palette, multi-window, code signing, macOS/Linux builds)

---
---

# Consolidated Status Report — All Work Feb 16, 2026 (Claude Code / Opus 4.6)

## Purpose
This entry consolidates ALL work done across ALL agents on Feb 16, recording what exists, what's changed, and the full state of uncommitted work.

---

## Complete File Inventory — Everything Uncommitted

### Modified Files (19)

| File | What Changed | By Which Session |
|------|-------------|-----------------|
| `.claude/settings.local.json` | Settings updates | Multiple |
| `SESSION_JOURNAL_2026-02-16.md` | Sessions 4-7, Gemini sprint, Electron Phase 1-3, this consolidation | Multiple |
| `SESSION_JOURNAL_2026-02-16_claude_code.md` | Sections 7-18 (machine linking, bug fixes, all 3 online) | Claude Code (other instance) |
| `electron-main.cjs` | Full rewrite — ASAR paths, port conflict, crash restart, IPC, safeStorage, auto-update | Electron session |
| `package-lock.json` | Dependency tree changes | Multiple |
| `package.json` | +baileys +@hapi/boom +pino +electron-builder +electron-updater, -whatsapp-web.js, main→electron-main.cjs, new scripts | Baileys swap + Electron |
| `public/mission-control.html` | Messages tab, WhatsApp status/QR modal, Gemini browser controller panel, streaming line-break fix | Sessions 4, 7, 12 |
| `src/ai/gemini-client.ts` | Added `generateWithImage()` for Gemini vision | Gemini sprint |
| `src/api/routes/browser.ts` | Added 4 browser controller endpoints | Gemini sprint |
| `src/api/routes/mcps.ts` | MCP route updates | Electron session |
| `src/api/routes/whatsapp.ts` | JID format `@c.us` → `@s.whatsapp.net` | Baileys swap (Session 7) |
| `src/api/server.ts` | Mounted machine-board, whatsapp, settings routes + electron-paths | Sessions 4, 7, Electron |
| `src/browser-agent/browser-session.ts` | Uses electron-paths for MCP CLI + cwd | Electron session |
| `src/checkpoint/checkpoint-manager.ts` | Uses electron-paths for data dir | Electron session |
| `src/comms/whatsapp-bot.ts` | Full rewrite — whatsapp-web.js → Baileys (pure WebSocket) + electron-paths | Session 7 (Baileys swap) |
| `src/config.ts` | .env path → getEnvPath(), DB path → getDatabasePath() | Electron session |
| `src/index.ts` | Browser controller shutdown handler | Gemini sprint |
| `src/local/hub-client.ts` | Auth response field fix + electron-paths for machine-id | Claude Code (M2 fix) + Electron |
| `src/mission-control/agent-session.ts` | Permission mode fixes, streaming, MCP support | Sessions 2, 13 |

### New Files (23)

| File | Purpose | By Which Session |
|------|---------|-----------------|
| `src/electron-paths.ts` | Centralized path resolution (CLI vs Electron packaged) | Electron Phase 1 |
| `electron-builder.yml` | Build config for NSIS + portable targets | Electron Phase 1 |
| `electron-preload.cjs` | contextBridge preload — window.pia IPC API | Electron Phase 2 |
| `create-icon.cjs` | App icon generation script | Electron Phase 1 |
| `build/icon.svg` | App icon (256x256) | Electron Phase 1 |
| `public/first-run.html` | First-run setup wizard (name, role, hub URL, API key) | Electron Phase 2 |
| `public/settings.html` | Settings page (config, restart badges, export/import) | Electron Phase 2 |
| `src/api/routes/settings.ts` | Settings REST API (GET/PUT /api/settings) | Electron Phase 2 |
| `src/utils/tailscale-discovery.ts` | Tailscale peer discovery (runs `tailscale status --json`) | Electron Phase 2 |
| `.github/workflows/build-desktop.yml` | CI/CD — tag v* → Windows build → GitHub Releases | Electron Phase 3 |
| `src/browser-controller/types.ts` | Browser command/result/state interfaces | Gemini sprint |
| `src/browser-controller/controller.ts` | Playwright lifecycle, command dispatch, Gemini task loop | Gemini sprint |
| `src/browser-controller/gemini-vision.ts` | Prompt templates for page description, action decisions | Gemini sprint |
| `src/cortex/index.ts` | Cortex fleet intelligence module entry | Cortex session |
| `src/cortex/cortex-db.ts` | Cortex database layer | Cortex session |
| `src/cortex/data-collector.ts` | Machine telemetry collection | Cortex session |
| `src/cortex/intelligence.ts` | Fleet intelligence analysis | Cortex session |
| `src/api/routes/cortex.ts` | Cortex API endpoints | Cortex session |
| `AGENT_PROMPT_CORTEX_AI_BRAIN.md` | Cortex design exploration prompt | Session 5 |
| `AGENT_PROMPT_DEPLOY_FLEET.md` | Fleet deployment task prompt | Session 5 |
| `AGENT_PROMPT_VISION_PRO_EXPLORATION.md` | Vision Pro research prompt | Session 5 |
| `src/db/queries/machine-messages.ts` | Machine message board queries (7 functions) | Session 4 |
| `src/api/routes/machine-board.ts` | Machine message board REST API (7 endpoints) | Session 4 |

### Git State
- **Branch:** `master`
- **1 commit ahead of origin:** `dfb9517` — ESM require() fix + machine setup docs (unpushed)
- **19 modified + 23 new files** uncommitted
- **Screenshots:** 8 first-run wizard screenshots (untracked, probably shouldn't commit)

---

## What Each Session Built (Summary)

### Session 1-3 (ChatGPT — earlier today)
- Permission architecture deep dive (6 layers identified)
- Visual indicators, MCP support, browser agent prototype
- Multi-machine strategy (Tailscale), git deployment, 4 agent briefings

### Session 4 (ChatGPT/Opus — this conversation, earlier)
- **Machine Message Board** — `machine_messages` SQLite table, persistence wired into cross-machine relay, 7 API endpoints, Messages tab in Mission Control
- **WhatsApp Integration** — whatsapp-web.js bot, 5 API endpoints, dashboard status indicator + QR modal

### Session 5 (ChatGPT)
- Fleet deployment prompts, The Cortex concept
- Discovered 80% of Cortex already exists (soul-engine, memory-manager, execution-engine, mqtt-broker)
- Architecture: all machines equal peers (later revised to hub/spoke with failover)

### Session 6 (ChatGPT)
- Full Electron desktop app analysis — React + shadcn/ui + electron-vite
- 15 path breakages identified, 6-phase build plan

### Session 7 (This conversation — Opus 4.6)
- **Baileys swap** — Replaced whatsapp-web.js (200MB Chrome) with @whiskeysockets/baileys (2MB WebSocket)
- Same PIAWhatsAppBot class interface, native TypeScript, auto-reconnect
- JID format updated: `@c.us` → `@s.whatsapp.net`

### Electron Desktop App — Phase 1-3 (separate agent)
- **Phase 1:** `src/electron-paths.ts`, `electron-main.cjs` rewrite, `electron-builder.yml`, path abstraction across 6 files
- **Phase 2:** First-run wizard (`first-run.html`), settings page (`settings.html`), preload script, Tailscale peer discovery, settings REST API, safeStorage for API keys
- **Phase 3:** Auto-updater via electron-updater, GitHub Actions CI/CD workflow

### Gemini Browser Controller (separate sprint)
- Gemini-powered browser automation: Playwright + Gemini Vision for screenshot analysis
- 4 new API endpoints: start, command, status, stop
- Multi-step task loop: screenshot → Gemini decides action → Playwright executes → repeat

### Claude Code (other instance) — Machine Linking
- All 3 machines online (Izzit7 + SODA-YETI + soda-monster-hunter)
- Fixed critical `require()` ESM bug in websocket-server.ts
- Fixed auth response field mismatch in hub-client.ts (from M2's Claude)
- Token mismatch debugging, instruction files v2 for M2 and M3
- Hub/spoke with failover architecture recommended

### Session 12 (ChatGPT)
- Streaming line-breaking bug fixed — accumulator pattern replaces per-token div creation

### Session 13 (ChatGPT)
- Auto-approved prompts now visible as green cards in Mission Control
- Default spawn mode changed from Manual to Auto

---

## Architecture Decisions (Consolidated)

| Decision | Status | Source |
|----------|--------|--------|
| Hub/spoke with automatic failover | Confirmed | Claude Code + ChatGPT feedback |
| Tailscale for secure networking | Deployed | Session 3 + Claude Code |
| All machines same codebase, different .env/DB | Deployed | All sessions |
| Electron for desktop app | Plan complete, Phase 1-3 built | Session 6 + Electron sprint |
| React + shadcn/ui for new UI | Decision made, not started | Session 6 |
| Baileys for WhatsApp (not whatsapp-web.js) | Swapped | Session 7 |
| The Cortex for fleet intelligence | Module started | Session 5 |
| Gemini for browser vision tasks | Built | Gemini sprint |

---

## Fleet Status

| Machine | CPU | RAM | Status | PIA |
|---------|-----|-----|--------|-----|
| Izzit7 (M1) | i9-12900H (20T) | 64GB | Hub | Running |
| SODA-YETI (M3) | Ryzen 7 7700X (16T) | 32GB | Spoke | Online |
| soda-monster-hunter (M2) | Intel Ultra 7 265K (20T) | 64GB | Spoke | Online |
| **TOTAL** | **56 threads** | **160 GB** | | |

---

## Dependencies Changed

| Added | Version | Why |
|-------|---------|-----|
| `@whiskeysockets/baileys` | ^7.0.0-rc.9 | WhatsApp (replaces whatsapp-web.js) |
| `@hapi/boom` | ^10.0.1 | Baileys disconnect error typing |
| `pino` | ^10.3.1 | Baileys logging dependency |
| `electron-builder` | ^26.7.0 | Desktop app packaging (dev) |
| `electron-updater` | (bundled) | Auto-update for desktop |

| Removed | Why |
|---------|-----|
| `whatsapp-web.js` | Replaced by Baileys (no Chrome needed) |

---

## What's Next (Priority Queue)

| # | Task | Status | Effort |
|---|------|--------|--------|
| 1 | Commit + push all uncommitted work | Ready | 5 min |
| 2 | Remote agent spawning (hub → spoke) | Not started | 1-2 days |
| 3 | Clean stale machine entries in hub DB | Not started | 30 min |
| 4 | `/api/system/update` endpoint (remote git pull) | Not started | 1 day |
| 5 | Hub failover (auto-promote spoke if hub dies) | Not started | 1-2 weeks |
| 6 | Wire Autonomous Worker for cross-machine tasks | Not started | 2-3 days |
| 7 | The Cortex Phase 1 (wire existing infrastructure) | Module started | 1 week |
| 8 | Electron Phase 4 (production hardening) | Not started | 2 days |
| 9 | Fleet Dashboard (wire FLEET_DASHBOARD_MOCKUP.html) | Mockup exists | 3 days |
| 10 | DAO separation to DAOV1 repo | Deferred | When ready |

---

## Cross-Session Learnings

1. **PIA's File API is a remote management tool** — reconfigured Machine 3's .env over the network via REST
2. **Token synchronization is the #1 setup pain point** — code default differs from .env value
3. **`require()` in ESM modules is a silent killer** — hub message handler crashed on every spoke registration
4. **Electron path abstraction works** — `src/electron-paths.ts` with `getDataSubDir()` etc. falls back to `process.cwd()` in CLI mode
5. **Baileys >> whatsapp-web.js** — no browser, native TS, lighter, pairing code option
6. **80% of "The Cortex" already exists** — soul-engine, memory-manager, execution-engine, autonomous-worker, mqtt-broker just need wiring
7. **Hub/spoke beats pure peer** — every major orchestration platform (K8s, Docker Swarm, Consul, Nomad) uses this model
8. **Three Claudes across three machines sharing fixes through git** — the multi-agent collaboration pattern works
