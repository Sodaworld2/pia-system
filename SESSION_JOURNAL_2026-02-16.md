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
