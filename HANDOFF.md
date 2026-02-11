# PIA Project Handoff | Updated: 2026-02-11

## Quick Start for Next Agent

```bash
# Server is already running at:
http://localhost:3000

# API Token:
pia-local-dev-token-2024

# Working Directory:
C:\Users\mic\Downloads\pia-system
```

## IMPORTANT: Puppeteer MCP Installed

**You should have browser control tools now:**
- `puppeteer_navigate` - Go to URLs
- `puppeteer_screenshot` - See the screen
- `puppeteer_click` - Click elements
- `puppeteer_fill` - Type in fields

## First Actions

1. Use `puppeteer_navigate` to go to `http://localhost:3000`
2. Use `puppeteer_screenshot` to see the dashboard
3. Report what you see to the user
4. **DO NOT** use Playwright to spawn new browsers - use the MCP!

---

## Project Objective

Build a **Project Intelligence Agent (PIA)** - a multi-machine, multi-channel AI orchestration system where:
- Human communicates via Discord, Web Chat, or Email
- Master Claude (Orchestrator) receives and delegates commands
- Descendant Claudes run on individual machines

## Current System State (Observed 2026-02-11)

| Metric | Value |
|--------|-------|
| Machines | 2 registered |
| Agents | 6 active (4 working, 1 waiting, 1 idle) |
| CLI Sessions | 38 available |
| MCPs Installed | 8 |
| Orchestrator | Online with 2 instances |
| Alerts | 342 (need attention!) |
| WebSocket | Connected |
| Ollama | Available |

### Active Agents
1. CLI-Session-6 - working
2. CLI-Session-5 - working
3. Claude-Finance - waiting
4. Gemini-Docs - working
5. Claude-Research - idle

---

## What Has Been Built (Complete)

### Core Systems
- Express API Server with auth, rate limiting
- WebSocket real-time communication
- SQLite database
- PTY terminal sessions (node-pty + xterm.js)
- Agent/Machine management CRUD
- Auto-healer for stuck agents
- PWA mobile support

### Dashboard Views
- **Fleet Matrix** - Visual grid of all agents
- **Command Center** - Web chat with Orchestrator (NEW)
- **CLI Tunnel** - Terminal access
- **MCPs** - Install/manage MCP servers
- **AI Models** - Cost tracking, providers
- **Alerts** - System notifications

### Communication Layer
- **Orchestrator** (`src/comms/orchestrator.ts`) - Master Claude logic
- **Discord Bot** (`src/comms/discord-bot.ts`) - Ready, needs token
- **Web Chat** - Command Center in dashboard
- **API** - `/api/orchestrator/*` endpoints

---

## What Remains To Build

### Priority 1
- [ ] Enable Discord (add DISCORD_TOKEN to .env)
- [ ] Clear the 342 alerts
- [ ] Persistent chat history

### Priority 2
- [ ] Email integration (AgentMail)
- [ ] Multi-machine sync (hub/spoke)
- [ ] Task queue system

### Priority 3
- [ ] Agent specialization profiles
- [ ] Automated task routing
- [ ] Better monitoring/logging

---

## Key Files

| Purpose | File |
|---------|------|
| Main server | `src/api/server.ts` |
| Orchestrator | `src/comms/orchestrator.ts` |
| Discord bot | `src/comms/discord-bot.ts` |
| Dashboard HTML | `public/index.html` |
| Dashboard JS | `public/js/app.js` |
| Styles | `public/css/styles.css` |
| Config | `.env` |
| Full journal | `JOURNAL-2026-02-11.md` |
| Screenshots | `screenshots/watcher-*.png` |

---

## User's Working Style

- Prefers ACTION over explanation
- Wants to SEE Claude controlling things
- Likes working together in real-time
- Values documentation/journaling
- Working directory: `C:\Users\mic\Downloads\pia-system`

---

## API Endpoints Reference

```
GET  /api/health              - Health check
GET  /api/stats               - System statistics
GET  /api/orchestrator/status - Orchestrator state
POST /api/orchestrator/message - Send command (body: {message})
POST /api/orchestrator/spawn   - Spawn Claude instance
GET  /api/agents              - List agents
GET  /api/machines            - List machines
GET  /api/sessions            - List PTY sessions
```

---

*Updated by Claude Opus 4.5 | 2026-02-11*
*Previous handoff by: Antigravity (PIA Handoff Protocol)*
