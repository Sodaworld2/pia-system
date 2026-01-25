# PIA - Project Intelligence Agent

A supervisor system for controlling and monitoring AI coding agents across multiple machines from a single dashboard.

## Features

- **Fleet Matrix** - See all agents across all machines in one view
- **CLI Tunnel** - Remote terminal access via WebSocket + xterm.js
- **Real-time Updates** - WebSocket-based live status updates
- **Auto-Healer** - AI-powered documentation drift detection
- **Mobile PWA** - Control agents from your phone
- **Multi-Machine** - Hub/Local architecture for distributed workloads

## Quick Start

```bash
# Clone the repo
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system

# Install dependencies
npm install

# Start hub server
npm start

# Open dashboard
# http://localhost:3000
```

## Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Mode: 'hub' for central server, 'local' for worker machine
PIA_MODE=hub

# Server ports
PIA_PORT=3000
PIA_WS_PORT=3001

# Security (CHANGE IN PRODUCTION!)
PIA_SECRET_TOKEN=your-secret-token
PIA_JWT_SECRET=your-jwt-secret

# For local mode - connect to hub
PIA_HUB_URL=http://hub-ip:3000
PIA_MACHINE_NAME=my-machine

# AI (optional)
PIA_OLLAMA_URL=http://localhost:11434
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser / Mobile PWA                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Fleet Matrix   │  CLI Tunnel   │  Alerts          │   │
│  └─────────────────────┬───────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP + WebSocket
┌─────────────────────────▼───────────────────────────────────┐
│                    PIA Hub (Central)                         │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Express API     │  │ WebSocket Server│                   │
│  │ :3000           │  │ :3001           │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                            │
│  ┌────────▼────────────────────▼────────┐                   │
│  │  Hub Aggregator  │  Alert Monitor    │                   │
│  └────────┬─────────────────────────────┘                   │
│           │                                                  │
│  ┌────────▼─────────────────────────────┐                   │
│  │         SQLite Database               │                   │
│  │  machines | agents | sessions | alerts│                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────┐
    ▼                     ▼                 ▼
┌─────────┐         ┌─────────┐       ┌─────────┐
│ PIA Local│         │ PIA Local│       │ PIA Local│
│ Machine 1│         │ Machine 2│       │ Machine 3│
│ N agents │         │ N agents │       │ N agents │
└─────────┘         └─────────┘       └─────────┘
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
