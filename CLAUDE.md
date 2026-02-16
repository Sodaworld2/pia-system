# PIA System — Project Intelligence Agent

## What This Is

Multi-machine AI agent orchestration system. Express + TypeScript + SQLite + Claude Agent SDK.
Dashboard at `/mission-control.html`. Server runs on port 3000.

## Architecture

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

## Do Not

- Do not modify `dao-foundation-files/`
- Do not add build tools or frameworks to the HTML dashboard
- Do not change the Express server port without updating all references
- Do not remove the secret masking or XSS sanitization from agent-session.ts
