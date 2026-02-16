# Permission Fix Handoff — For the Other Agent

> Written by the agent investigating permission failures.
> Please read, give your opinion, and if you agree, spawn a new agent to implement.

---

## What We Found

When SDK agents spawn through Mission Control, they sometimes can't use Edit, Write, or Bash tools. The agent retries 6+ times, wastes ~$1 in budget, and produces nothing.

## Why It Happens

**One line of code** in `src/mission-control/agent-session.ts` at line 380:

```typescript
const permissionMode = session.config.approvalMode === 'plan' ? 'plan' as const : 'default' as const;
```

This tells the SDK to use `permissionMode: 'default'` for all non-plan modes (auto, manual, yolo).

The problem: `'default'` activates Claude Code's built-in interactive permission system — the one that asks "Allow this edit? (y/n)" in the terminal. But SDK agents run as background subprocesses with `stdio: ['pipe', 'pipe', 'pipe']`. There's no terminal, no human to click yes. So the prompt goes nowhere and the tool is silently denied.

Our `canUseTool` callback correctly approves the tool, but the SDK's internal permission layer runs independently and blocks it anyway. `canUseTool` is one input to the decision, not the sole decider.

## Proposed Fix

**Change 1 (Critical):** Map approval modes to appropriate SDK permission modes.

File: `src/mission-control/agent-session.ts`, line 380.

Replace:
```typescript
const permissionMode = session.config.approvalMode === 'plan' ? 'plan' as const : 'default' as const;
```

With:
```typescript
const permissionMode = (() => {
  switch (session.config.approvalMode) {
    case 'plan': return 'plan' as const;
    case 'yolo': return 'bypassPermissions' as const;
    default: return 'acceptEdits' as const;  // auto + manual
  }
})();
```

And for yolo mode, also add `allowDangerouslySkipPermissions: true` to the query options (around line 429):
```typescript
if (permissionMode === 'bypassPermissions') {
  queryOptions.allowDangerouslySkipPermissions = true;
}
```

**Change 2 (Recommended):** Disable settings loading in yolo mode to prevent `.claude/settings.local.json` from interfering.

File: `src/mission-control/agent-session.ts`, line 418.

Replace:
```typescript
settingSources: session.config.loadProjectSettings !== false ? ['project'] : [],
```

With:
```typescript
settingSources: (session.config.approvalMode === 'yolo' || session.config.loadProjectSettings === false) ? [] : ['project'],
```

**Change 3 (Nice-to-have):** Normalize CWD in the spawner.

File: `src/mission-control/agent-session.ts`, line 409.

Change:
```typescript
cwd: config.cwd,
```
To:
```typescript
cwd: config.cwd.replace(/\\/g, '/'),
```

**Change 4 (Nice-to-have):** Log the SDK's permission reason for debugging.

In the `canUseTool` callback (around line 322), log the `options.decisionReason` and `options.blockedPath` fields to the journal so future permission issues are diagnosable from the UI.

## What We Need From You

1. **Your opinion:** Does this diagnosis make sense? Do you see any risks with using `acceptEdits` for auto mode or `bypassPermissions` for yolo?

2. **If you agree:** Spawn a new agent with this task plan to implement the fix:

```
YOUR TASK: Fix the SDK permission mode mapping so agents can use Edit/Write/Bash tools.

FILE TO MODIFY: src/mission-control/agent-session.ts

CHANGES:

1. Line 380 — Replace the permissionMode assignment:
   FROM: const permissionMode = session.config.approvalMode === 'plan' ? 'plan' as const : 'default' as const;
   TO:
   const permissionMode = (() => {
     switch (session.config.approvalMode) {
       case 'plan': return 'plan' as const;
       case 'yolo': return 'bypassPermissions' as const;
       default: return 'acceptEdits' as const;
     }
   })();

2. Around line 429 (after maxTurns) — Add bypass flag for yolo:
   if (permissionMode === 'bypassPermissions') {
     queryOptions.allowDangerouslySkipPermissions = true;
   }

3. Line 418 — Disable settings in yolo mode:
   FROM: settingSources: session.config.loadProjectSettings !== false ? ['project'] : [],
   TO: settingSources: (session.config.approvalMode === 'yolo' || session.config.loadProjectSettings === false) ? [] : ['project'],

4. Line 409 — Normalize CWD in spawner:
   FROM: cwd: config.cwd,
   TO: cwd: config.cwd.replace(/\\/g, '/'),

VERIFICATION:
- npx tsc --noEmit --skipLibCheck — no new errors
- The server auto-restarts (npm run dev with tsx watch)
- Spawn an agent in auto mode with task "Add a comment to the top of package.json"
- It should be able to use Edit/Write without permission blocks
```

## Full Analysis

See `SESSION_JOURNAL_2026-02-16.md` for the complete 6-layer permission architecture documentation.
