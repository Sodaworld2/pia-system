# PIA System — Project Intelligence Agent

## Who Am I?

**Step 1 — Run `hostname` immediately.** Match it to the fleet table below. That tells you your role.

### The Fleet Table (Source of Truth)

| Hostname | Role | Machine Name | Hub URL | What I Run |
|---|---|---|---|---|
| `IZZIT7` | **HUB (M1)** | Local (Izzit7) | localhost:3000 | Everything: Fisher2050, Tim Buc, Eliyahu, Cortex, dashboard, all crons |
| `SODA-MONSTER-HUNTER` | **WORKER (M2)** | soda-monster-hunter | 100.73.133.3:3000 | Execution only: API, HubClient, agents. NO Fisher/Tim Buc/Eliyahu/crons. |
| `SODA-YETI` | **WORKER (M3)** | soda-yeti | 100.73.133.3:3000 | Execution only: same as M2 |

**You are the machine whose hostname matches above. Act accordingly.**

**Step 2 — Read `MACHINE_IDENTITY.local.md`** if it exists — it has machine-specific notes. It is `.gitignore`'d and survives every `git pull`. If it doesn't exist, create it from the template in `M2_ACTIVATION.md`.

### Why git pull never breaks your identity
- `MACHINE_IDENTITY.local.md` is in `.gitignore` — never overwritten by git
- The fleet table above is IN this file (committed) — always accurate after pull
- `src/config.ts` has the same table for the running server — hostname detection is automatic
- **You never need to set PIA_MODE manually.** Hostname determines everything.

## What This Is

Multi-machine AI agent orchestration system. Express + TypeScript + SQLite + Claude Agent SDK.
Dashboard at `/mission-control.html`. Server runs on port 3000.

## Architecture

**READ `PIA_ARCHITECTURE.md` FIRST** — it is the single source of truth for hub/worker design, modes, registration, and remote spawning. Do not contradict it.

```
src/mission-control/agent-session.ts  — Core: spawns SDK/PTY/API agent sessions
src/mission-control/prompt-manager.ts — Tool approval routing (auto/manual/yolo)
src/api/routes/mission-control.ts     — REST API for agent control
src/api/routes/files.ts               — File read/write/list/search API
src/tunnel/websocket-server.ts        — Hub WebSocket (broadcasts to dashboard)
src/tunnel/pty-wrapper.ts             — PTY wrapper for CLI agents
src/local/hub-client.ts               — Spoke client (connects to hub)
src/local/service.ts                  — Local agent service
src/hub/aggregator.ts                 — Machine registry + heartbeat
public/mission-control.html           — Dashboard SPA (~2800 lines)
```

## Rules

- **PIA and DAO are SEPARATE projects.** The `dao-foundation-files/` folder is a different project. Never modify it. Never call PIA features "DAO".
- Default approval mode is **Auto** — agents auto-approve safe tools, block dangerous patterns.
- TypeScript check: `npx tsc --noEmit --skipLibCheck` — ignore errors from `dao-foundation-files/`.
- Server runs with `npm run dev` (tsx watch, auto-restart on changes).
- The HTML dashboard is a single file. Keep it that way — no build tools, no framework.

## SDK Agent Spawn Flow

```
POST /api/mc/agents → AgentSessionManager.spawn() → runSdkMode()
  → query() from @anthropic-ai/claude-agent-sdk
  → canUseTool() callback handles approval (auto/manual/yolo)
  → stream_event text_delta → WebSocket → dashboard
  → On completion → status 'idle', ready for follow-ups via respond()
```

## Key Files When Working on Mission Control

- `src/mission-control/agent-session.ts` — Spawn logic, SDK options, tool approval, streaming
- `src/mission-control/prompt-manager.ts` — Auto-approval rules, prompt queue
- `src/api/routes/mission-control.ts` — All REST endpoints
- `public/mission-control.html` — Dashboard UI (CSS + JS inline)

## Tools Available To You

### PDF Reader
To read any PDF visually (see layouts, images, charts — not just text):
```bash
python tools/pdf-to-images.py "path/to/file.pdf"                    # all pages
python tools/pdf-to-images.py "path/to/file.pdf" --pages 1-5        # specific pages
python tools/pdf-to-images.py "path/to/file.pdf" --text             # text-only extraction
python tools/pdf-to-images.py "path/to/file.pdf" --dpi 200          # higher quality
```
This creates PNG images you can read with the Read tool to see the visual content.
Use this when the built-in Read tool fails on PDFs (large files, Windows, etc.).

### Browser Agent API
To control a browser (navigate, click, screenshot):
```
POST /api/browser/navigate  { "url": "https://example.com" }
POST /api/browser/task       { "task": "Take a screenshot of example.com" }
GET  /api/browser/sessions
```

## Session Journaling

**Every agent session MUST update `SESSION_JOURNAL_2026-02-16.md` (or current date) before finishing.**

A desktop app (Electron) is being built from this codebase. Other agents are building features in parallel. To keep everything in sync, journal these changes:

### What to Journal

| Change Type | What to Log | Why It Matters |
|---|---|---|
| **New API endpoints** | Route path, method, purpose | React UI needs to know what to call |
| **New database migrations** | Migration number, table/column changes | Migration numbering must stay sequential |
| **New config options** | Key name in `config.ts`, env var, default | Settings screen must expose all options |
| **New native dependencies** | Package name, whether it has C++ addons | Native modules affect Electron packaging |
| **New subprocess spawning** | What gets spawned, how path is resolved | Packaged app resolves paths differently |
| **New WebSocket events** | Event name, payload shape | React UI subscribes to these |
| **New HTML dashboard features** | What was added to mission-control.html | Must be ported to React UI later |
| **Bug fixes** | What broke, what fixed it | Prevents re-introducing in the app |

### Journal Entry Format

```markdown
## Session N: [Title]

### Changes
- **New endpoint**: `POST /api/foo/bar` — does X
- **Migration 041**: Added `new_column` to `agents` table
- **New config**: `PIA_NEW_THING` (default: `true`) — controls Y
- **New dep**: `some-package` (pure JS, no native code)
- **Bug fix**: Fixed Z in `src/file.ts` line N

### Files Changed
| File | Change |
|---|---|
| `src/api/routes/foo.ts` | **NEW** — description |
| `src/config.ts` | Added `newThing` option |

### Desktop App Impact
[One sentence: does this affect packaging, the React UI, or settings?]
```

### Current Desktop App Plan

See `ELECTRON_APP_ANALYSIS.md` for the full technical analysis. Key decisions:
- **Framework**: Electron (wraps the Express server)
- **UI**: Rebuilding with React + shadcn/ui (replaces mission-control.html)
- **Packaging**: electron-builder + NSIS
- **Both modes**: CLI (`npm run dev`) + Desktop (`electron`) from same codebase

The Express server, API routes, and WebSocket events are the **contract** between backend and frontend. Keep them stable and documented.

## Knowledge Base & File Index Maintenance

**Three files form the project's living documentation. Keep them updated.**

| File | What It Is | When to Update |
|------|-----------|----------------|
| `FILE_INDEX.md` | Index of every `.md` and `.html` file | When you CREATE or DELETE any `.md` or `.html` file |
| `PIA_KNOWLEDGE_BASE.md` | Master knowledge base (terminology, ideas, spec, capabilities, to-do) | When you add new features, make architectural decisions, or change capabilities |
| `public/pia-book.html` | Visual HTML version of the knowledge base (served at `/pia-book.html`) | When significant changes are made to the knowledge base |

### How to Update FILE_INDEX.md

When you create a new `.md` or `.html` file:
1. Open `FILE_INDEX.md`
2. Add the file to the correct category table
3. Include: file path, one-line purpose

When you delete a file, remove its entry.

### How to Update PIA_KNOWLEDGE_BASE.md

When you make changes that affect the project's knowledge:
- **New terminology?** Add to Section 1 (Terminology)
- **New decision or idea?** Add to Section 2 (Ideas Discussed)
- **New API endpoint, migration, or subsystem?** Update Section 3 (System Specification)
- **New working feature?** Add to Section 4 (Current Capabilities)
- **Completed a to-do item?** Move it from Section 5 (Still To Do) to Section 4

### Knowledge Organization Template

This is the standard template for organizing project knowledge. Use this pattern when consolidating documentation for any project:

```markdown
# [Project] — Master Knowledge Base

## 1. Terminology
Plain-English definitions. No jargon without explanation.
| Term | What It Means |

## 2. Ideas Discussed
Settled decisions (with reasoning) + Future ideas (with status)

## 3. System Specification
Architecture, stack, source files, API reference, config, libraries

## 4. Current Capabilities
What actually works today (Working vs Partial)

## 5. Still To Do
Ordered by priority: High / Medium / Lower

## 6. Session Timeline
Chronological record of every work session

## 7. Key Libraries
Dependencies with purpose and version

## 8. Configuration Reference
Every env variable with default and purpose
```

## Do Not

- Do not modify `dao-foundation-files/`
- Do not add build tools or frameworks to the HTML dashboard
- Do not change the Express server port without updating all references
- Do not remove the secret masking or XSS sanitization from agent-session.ts
