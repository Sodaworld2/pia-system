# PIA - Project Intelligence Agent

Control 43+ AI agents across multiple machines from one dashboard.

```
  Machine #1 (izzit7)          Machine #2 (NEW)           Machine #3 (soda-yeti)
  ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
  │  Windows 11 Pro  │       │   Coming Online  │       │  Windows 11 Pro  │
  │  RTX 5090        │◄─────►│   TBD specs      │◄─────►│  Ryzen 7 7700X   │
  │  HUB (primary)   │       │                  │       │  32GB RAM        │
  │  100.73.133.3    │       │                  │       │  100.102.217.69  │
  └──────────────────┘       └──────────────────┘       └──────────────────┘
         ▲                                                       ▲
         └──────────── Tailscale VPN (100.x.y.z) ───────────────┘
```

## Features

- **Visor Dashboard** - 7-tab governance UI (Chat, History, Health, Tasks, Network, Security, CLI)
- **Fleet Matrix** - See all agents across all machines in one view
- **CLI Tunnel** - Remote terminal access via WebSocket + xterm.js
- **Network Sentinel** - Intrusion detection (brute force, port scans, rate limits)
- **Multi-Model AI** - Claude, GPT, Gemini, Grok, Ollama all in one router
- **Agent Factory** - Spawn agents from templates
- **Auto-Healer** - AI-powered documentation drift detection
- **Desktop App** - Electron wrapper with system tray
- **Mobile PWA** - Control agents from your phone
- **Cross-Machine Relay** - REST + WebSocket inter-machine messaging

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system

# 2. Install dependencies
npm install

# 3. Create .env file (see below)

# 4. Build
npm run build

# 5. Start PIA
npm run dev        # development (hot reload)
npm start          # production

# 6. Open the Visor (dashboard)
# Browser:  http://localhost:3000/visor.html
# Desktop:  npm run desktop
```

## Environment Variables

Create a `.env` file:

```bash
PIA_MODE=hub                               # hub (primary) or local (spoke)
PIA_PORT=3000                              # API port
PIA_WS_PORT=3001                           # WebSocket port
PIA_SECRET_TOKEN=pia-local-dev-token-2024  # API auth token
PIA_HUB_URL=http://100.73.133.3:3000      # Hub URL (for spoke machines)
PIA_MACHINE_NAME=my-machine                # Machine name
PIA_OLLAMA_URL=http://localhost:11434      # Ollama (optional)
```

---

## MCP Servers - Where They Are & How to Set Up

MCPs (Model Context Protocol servers) give Claude extra capabilities. Here's every MCP used in PIA.

### 1. Playwright MCP (Browser Control)

**What it does:** Controls a real browser - takes screenshots, clicks buttons, fills forms, navigates pages. This is how we take screenshots of the Visor and test the UI.

**Where it runs:** Every machine that needs browser automation.

| Machine | Status |
|---------|--------|
| #1 izzit7 | INSTALLED |
| #2 new | NEEDS INSTALL |
| #3 soda-yeti | NEEDS CHECK |

**Install:**
```bash
claude mcp add playwright -- cmd /c npx -y @playwright/mcp@latest
```

**Key tools:** `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_type`, `browser_evaluate`

### 2. Windows MCP (System Control)

**What it does:** Windows system operations - window management, system info, clipboard, notifications.

**Where it runs:** Every Windows machine.

| Machine | Status |
|---------|--------|
| #1 izzit7 | INSTALLED |
| #2 new | NEEDS INSTALL |
| #3 soda-yeti | NEEDS CHECK |

**Install:**
```bash
# Requires Python + uv
pip install uv                    # or: winget install astral-sh.uv
claude mcp add windows-mcp -- cmd /c uvx windows-mcp
```

### 3. GitHub MCP (Git + Collaboration)

**What it does:** Direct GitHub access - PRs, issues, code search, repo management, cross-machine code sync, automated commits.

**Where it runs:** All machines (enables frequent code sync between machines).

| Machine | Status |
|---------|--------|
| #1 izzit7 | NEEDS INSTALL |
| #2 new | NEEDS INSTALL |
| #3 soda-yeti | NEEDS INSTALL |

**Install:**
```bash
# 1. Get a GitHub personal access token from github.com/settings/tokens
# 2. Add the MCP
claude mcp add github -- cmd /c npx -y @modelcontextprotocol/server-github

# 3. Set the token (add to your shell profile or .env)
set GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here
```

**Verify all MCPs:**
```bash
claude mcp list
# Should show all installed MCPs with "Connected" status
```

---

## Setting Up a NEW Machine

### Prerequisites

1. **Node.js 20+**: `winget install OpenJS.NodeJS.LTS`
2. **Git**: `winget install Git.Git`
3. **Tailscale**: `winget install Tailscale.Tailscale`
4. **Python + uv**: `winget install Python.Python.3.13` then `pip install uv`
5. **Claude Code CLI**: Follow Anthropic's install instructions

### Step-by-Step

```bash
# 1. Join Tailscale network
tailscale up
# Note your Tailscale IP (100.x.y.z)

# 2. Clone PIA
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system

# 3. Install dependencies
npm install

# 4. Create .env (spoke mode)
echo PIA_MODE=local > .env
echo PIA_PORT=3000 >> .env
echo PIA_WS_PORT=3001 >> .env
echo PIA_SECRET_TOKEN=pia-local-dev-token-2024 >> .env
echo PIA_HUB_URL=http://100.73.133.3:3000 >> .env

# 5. Build & start
npm run build && npm run dev

# 6. Install MCPs
claude mcp add playwright -- cmd /c npx -y @playwright/mcp@latest
claude mcp add windows-mcp -- cmd /c uvx windows-mcp
claude mcp add github -- cmd /c npx -y @modelcontextprotocol/server-github

# 7. Register with hub
curl -X POST http://100.73.133.3:3000/api/machines/register \
  -H "Content-Type: application/json" \
  -H "X-Api-Token: pia-local-dev-token-2024" \
  -d "{\"machineId\":\"machine-2\",\"name\":\"YOUR-NAME\",\"tailscaleIp\":\"YOUR-IP\",\"port\":3000,\"role\":\"spoke\"}"

# 8. Verify
curl http://100.73.133.3:3000/api/health -H "X-Api-Token: pia-local-dev-token-2024"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Browser / Visor / Desktop / Mobile              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Chat │ History │ Health │ Tasks │ Network │ Security│    │
│  └─────────────────────┬───────────────────────────────┘    │
└─────────────────────────┼────────────────────────────────────┘
                          │ HTTP + WebSocket
┌─────────────────────────▼────────────────────────────────────┐
│                    PIA Hub (Machine #1)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Express :3000│  │ WS :3001     │  │ Network Sentinel │    │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────┘    │
│  ┌──────▼──────────────────▼───────┐  ┌──────────────────┐    │
│  │  Hub Aggregator │ Alert Monitor │  │  Agent Factory   │    │
│  └──────┬──────────────────────────┘  └──────────────────┘    │
│  ┌──────▼──────────────────────────┐  ┌──────────────────┐    │
│  │  SQLite (machines,agents,etc)   │  │  Multi-Model AI  │    │
│  └─────────────────────────────────┘  └──────────────────┘    │
└──────────────────────────────────────────────────────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │ Machine #2  │        │ Machine #3  │
    │ (spoke)     │        │ soda-yeti   │
    │ PIA local   │        │ PIA local   │
    └─────────────┘        └─────────────┘
```

## API Endpoints

### Health & Stats
- `GET /api/health` - Health check (no auth required)
- `GET /api/stats` - Global statistics

### Machines
- `GET /api/machines` - List all machines
- `POST /api/machines` - Register machine
- `GET /api/machines/:id` - Get machine
- `POST /api/machines/:id/heartbeat` - Update heartbeat

### Agents
- `GET /api/agents` - List agents
- `POST /api/agents` - Create agent
- `GET /api/agents/:id` - Get agent
- `PATCH /api/agents/:id` - Update agent status
- `POST /api/agents/:id/task` - Assign task

### Sessions (CLI Tunnel)
- `GET /api/sessions` - List active sessions
- `POST /api/sessions` - Create session (spawns PTY)
- `GET /api/sessions/:id` - Get session + buffer
- `POST /api/sessions/:id/input` - Send input
- `DELETE /api/sessions/:id` - Close session

### Alerts
- `GET /api/alerts` - List alerts
- `POST /api/alerts/:id/ack` - Acknowledge
- `POST /api/alerts/ack-all` - Acknowledge all

## WebSocket Protocol

```javascript
// Authenticate
{ type: 'auth', payload: { token: 'xxx' } }

// Subscribe to session output
{ type: 'subscribe', payload: { sessionId: 'abc' } }

// Send terminal input
{ type: 'input', payload: { sessionId: 'abc', data: 'ls\n' } }

// Resize terminal
{ type: 'resize', payload: { sessionId: 'abc', cols: 120, rows: 40 } }

// Server responses
{ type: 'auth', success: true }
{ type: 'buffer', sessionId: 'abc', payload: '...' }
{ type: 'output', sessionId: 'abc', payload: '...' }
{ type: 'agent:update', payload: { id, status, progress } }
{ type: 'alert', payload: { id, type, message } }
```

## Security

- API token required for all endpoints (except `/api/health`)
- Rate limiting: 100 req/min API, 10/min session creation
- Helmet.js security headers
- CORS restrictions in production

## Project Structure

```
pia-system/
├── src/
│   ├── index.ts              # Entry point (hub/local modes)
│   ├── config.ts             # Environment configuration
│   ├── api/
│   │   ├── server.ts         # Express server + security
│   │   └── routes/           # API route handlers
│   ├── db/
│   │   ├── database.ts       # SQLite with migrations
│   │   └── queries/          # Database operations
│   ├── hub/
│   │   ├── aggregator.ts     # Machine/agent aggregation
│   │   └── alert-monitor.ts  # Automatic alert detection
│   ├── local/
│   │   ├── hub-client.ts     # Connect to central hub
│   │   └── service.ts        # Local agent management
│   ├── tunnel/
│   │   ├── pty-wrapper.ts    # node-pty CLI capture
│   │   └── websocket-server.ts # Real-time communication
│   ├── auto-healer/
│   │   ├── folder-watcher.ts # File change detection
│   │   ├── ai-assessor.ts    # Ollama integration
│   │   └── doc-updater.ts    # Auto documentation
│   └── utils/
│       └── logger.ts         # Colored logging
├── public/
│   ├── index.html            # Dashboard
│   ├── sw.js                 # Service worker (PWA)
│   ├── offline.html          # Offline page
│   ├── manifest.json         # PWA manifest
│   ├── css/styles.css        # Responsive styles
│   ├── js/app.js             # Dashboard logic
│   └── icons/                # App icons
└── data/
    └── pia.db                # SQLite database
```

## Development Status

| Phase | Status | Tickets |
|-------|--------|---------|
| Foundation | ✅ Complete | PIA-001 to PIA-006 |
| Dashboard | ✅ Complete | PIA-007 to PIA-011 |
| Multi-Machine | ✅ Complete | PIA-012 to PIA-015 |
| Mobile + Auto-Healer | ✅ Complete | PIA-016 to PIA-021 |
| Polish | ✅ Complete | PIA-022 to PIA-025 |

**Progress: 21/25 tickets complete (84%)**

## Documentation

| Document | Description |
|----------|-------------|
| [PROGRESS.md](PROGRESS.md) | Development progress log |
| [SPRINT_PLAN.md](SPRINT_PLAN.md) | Original implementation plan |
| [KNOWLEDGE_BASE.md](KNOWLEDGE_BASE.md) | Research on existing solutions |

## License

MIT

---

Built with Claude Code
