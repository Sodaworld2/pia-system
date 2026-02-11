# PIA Usage Guide

## What is PIA?

PIA (Project Intelligence Agent) is a **remote control dashboard** for Claude Code CLI sessions. You can:

- Run Claude Code from a web browser
- Control terminals on multiple machines
- Monitor AI agent progress
- Get alerts when agents are stuck
- Access everything from your phone

---

## Quick Start (30 seconds)

```bash
# 1. Go to the PIA folder
cd C:\Users\mic\Downloads\pia-system

# 2. Start the server
npm start

# 3. Open browser
# Go to http://localhost:3000
```

---

## Using the Dashboard

### Fleet Matrix (Home)
Shows all AI agents across all machines. Each tile shows:
- Agent name and status (working/idle/error)
- Current task
- Progress bar
- Machine it's running on

### CLI Tunnel
Remote terminal access:
1. Click **"CLI Tunnel"** in the menu
2. Click **"New Session"** button
3. Select the session from dropdown
4. Type in the terminal - it runs on your PC

### Alerts
Shows problems:
- Agent stuck (waiting for input)
- Agent errors
- Machine offline
- High resource usage

---

## Creating a CLI Session

### From Dashboard
1. Go to CLI Tunnel tab
2. Click "New Session"
3. Terminal appears with PowerShell

### From API (curl)
```bash
# Get machine ID
MACHINE=$(curl -s http://localhost:3000/api/machines \
  -H "x-api-token: dev-token-change-in-production" | \
  grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Create session with Claude CLI
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-token: dev-token-change-in-production" \
  -d "{\"machine_id\":\"$MACHINE\", \"command\":\"claude\"}"

# Create session with PowerShell
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-token: dev-token-change-in-production" \
  -d "{\"machine_id\":\"$MACHINE\", \"command\":\"powershell.exe\"}"
```

### Send Input to Session
```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/input \
  -H "Content-Type: application/json" \
  -H "x-api-token: dev-token-change-in-production" \
  -d '{"data":"dir\\r\\n"}'
```

### Get Session Output
```bash
curl http://localhost:3000/api/sessions/SESSION_ID \
  -H "x-api-token: dev-token-change-in-production"
# Returns JSON with "buffer" field containing terminal output
```

---

## Remote Access (from phone/anywhere)

### Option 1: Cloudflare Tunnel (Recommended - Free & Secure)

```bash
# Install cloudflared
# Windows: winget install cloudflare.cloudflared
# Mac: brew install cloudflared

# Create tunnel (one-time)
cloudflared tunnel login
cloudflared tunnel create pia

# Run tunnel
cloudflared tunnel run --url http://localhost:3000 pia

# You get a URL like: https://pia-xxxxx.trycloudflare.com
```

### Option 2: ngrok (Quick Testing)

```bash
# Install: https://ngrok.com/download
ngrok http 3000

# You get a URL like: https://abc123.ngrok.io
```

### Option 3: Tailscale (Private VPN)

```bash
# Install Tailscale on all devices
# Access via: http://your-pc-name:3000
```

---

## API Reference

### Authentication
All endpoints require header:
```
x-api-token: dev-token-change-in-production
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (no auth) |
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/machines` | List all machines |
| POST | `/api/machines` | Register new machine |
| GET | `/api/sessions` | List active CLI sessions |
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/:id` | Get session + output buffer |
| POST | `/api/sessions/:id/input` | Send keyboard input |
| DELETE | `/api/sessions/:id` | Close session |
| GET | `/api/agents` | List all agents |
| GET | `/api/alerts` | List alerts |

---

## WebSocket (Real-time)

Connect to `ws://localhost:3001` for live updates.

```javascript
const ws = new WebSocket('ws://localhost:3001');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  payload: { token: 'dev-token-change-in-production' }
}));

// Subscribe to session output
ws.send(JSON.stringify({
  type: 'subscribe',
  payload: { sessionId: 'your-session-id' }
}));

// Send terminal input
ws.send(JSON.stringify({
  type: 'input',
  payload: { sessionId: 'your-session-id', data: 'ls\n' }
}));

// Receive messages
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'output') {
    console.log('Terminal output:', msg.payload);
  }
};
```

---

## Configuration

Create `.env` file:

```bash
# Server mode
PIA_MODE=hub              # 'hub' = central server, 'local' = worker

# Ports
PIA_PORT=3000             # HTTP API
PIA_WS_PORT=3001          # WebSocket

# Security (CHANGE THESE!)
PIA_SECRET_TOKEN=your-secret-token
PIA_JWT_SECRET=your-jwt-secret

# For multi-machine setup
PIA_HUB_URL=http://hub-ip:3000
PIA_MACHINE_NAME=my-machine
```

---

## Multi-Machine Setup

### On Hub Machine (central server)
```bash
PIA_MODE=hub npm start
```

### On Worker Machines
```bash
PIA_MODE=local \
PIA_HUB_URL=http://hub-ip:3000 \
PIA_MACHINE_NAME=worker-1 \
npm start
```

Worker machines:
- Connect to hub automatically
- Report their agents
- Can spawn local CLI sessions
- Show up in Fleet Matrix

---

## Troubleshooting

### Server won't start
```bash
# Check if port in use
netstat -ano | findstr :3000

# Kill existing node processes
taskkill /F /IM node.exe

# Rebuild
npm run build
npm start
```

### Can't connect to dashboard
- Make sure server is running: `curl http://localhost:3000/api/health`
- Check firewall allows port 3000
- Try different browser / incognito

### Terminal not showing output
- Refresh page (F5)
- Select session from dropdown again
- Check browser console for WebSocket errors

### Session input not working
- Session may have died - create new one
- Check PTY process exists: session has `pty_pid` in API response

---

## File Locations

```
C:\Users\mic\Downloads\pia-system\
├── data\pia.db          # SQLite database (sessions, machines, agents)
├── dist\                # Compiled JavaScript
├── public\              # Dashboard files
├── src\                 # TypeScript source
└── .env                 # Configuration (create this)
```

---

## Default Credentials

**API Token**: `dev-token-change-in-production`

Change this in `.env` for production!

---

## Summary Commands

```bash
# Start server
cd C:\Users\mic\Downloads\pia-system && npm start

# Open dashboard
start http://localhost:3000

# Create Claude session
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-token: dev-token-change-in-production" \
  -d '{"machine_id":"YOUR_MACHINE_ID", "command":"claude"}'

# List sessions
curl http://localhost:3000/api/sessions \
  -H "x-api-token: dev-token-change-in-production"
```

---

*Built for SodaWorld by Claude Code*
