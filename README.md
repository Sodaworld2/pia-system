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

**What it does:** Direct GitHub access - create/merge PRs, manage issues, push files, search code, list commits. 26 tools total. Claude can commit and sync code across machines through GitHub.

**Where it runs:** All machines.

| Machine | Status |
|---------|--------|
| #1 izzit7 | INSTALLED |
| #2 new | NEEDS INSTALL |
| #3 soda-yeti | NEEDS INSTALL |

**Install (new official way - old npm package is deprecated):**
```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```
Claude will handle OAuth authentication automatically when you first use it.

**Key tools:** `create_or_update_file`, `push_files`, `get_file_contents`, `create_pull_request`, `merge_pull_request`, `search_code`, `list_commits`, `create_issue`

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
claude mcp add --transport http github https://api.githubcopilot.com/mcp/

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
┌──────────────────────────────────────────────────────────────┐
│              Browser / Visor / Desktop / Mobile               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Chat | History | Health | Tasks | Network | Security │    │
│  └──────────────────────┬────────────────────────────────┘    │
└──────────────────────────┼────────────────────────────────────┘
                           │ HTTP + WebSocket
┌──────────────────────────▼────────────────────────────────────┐
│                    PIA Hub (Machine #1)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ Express :3000│  │ WS :3001     │  │ Network Sentinel  │   │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────┘   │
│  ┌──────▼──────────────────▼───────┐  ┌───────────────────┐   │
│  │  Hub Aggregator | Alert Monitor │  │  Agent Factory    │   │
│  └──────┬──────────────────────────┘  └───────────────────┘   │
│  ┌──────▼──────────────────────────┐  ┌───────────────────┐   │
│  │  SQLite (machines,agents,etc)   │  │  Multi-Model AI   │   │
│  └─────────────────────────────────┘  └───────────────────┘   │
└───────────────────────────────────────────────────────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │ Machine #2  │        │ Machine #3  │
    │ (spoke)     │        │ soda-yeti   │
    │ PIA local   │        │ PIA local   │
    └─────────────┘        └─────────────┘
```

## API Endpoints

All endpoints require header: `X-Api-Token: pia-local-dev-token-2024`

| Category | Endpoint | Description |
|----------|----------|-------------|
| Health | `GET /api/health` | System health check |
| Machines | `GET /api/machines` | List connected machines |
| Machines | `POST /api/machines/register` | Register a new machine |
| Sessions | `GET /api/sessions` | CLI tunnel sessions |
| Agents | `GET /api/agents` | List all agents |
| Factory | `POST /api/factory/spawn` | Spawn agent from template |
| Tasks | `GET /api/tasks` | Orchestrator tasks |
| AI | `POST /api/ai/chat` | Multi-model AI chat |
| Security | `GET /api/security/stats` | Network Sentinel stats |
| Security | `GET /api/security/events` | Security events log |
| Hooks | `GET /api/hooks` | Claude hook activity |
| MCPs | `GET /api/mcps` | MCP server status |
| Alerts | `GET /api/alerts` | System alerts |
| Doctor | `GET /api/doctor/health` | Deep health diagnosis |
| Relay | `POST /api/relay/send` | Cross-machine messaging |
| PubSub | `POST /api/pubsub/publish` | MQTT-style pub/sub |
| Webhooks | `POST /api/webhooks/register` | Register webhook |

## Claude Hooks

PIA uses Claude hooks for session tracking. Located in `.claude/hooks/`.

| Hook | File | Purpose |
|------|------|---------|
| Session Start | `session-start.cjs` | Records session begin |
| Post Tool Use | `post-tool-use.cjs` | Tracks tool usage |
| Stop | `stop.cjs` | Records session end |

Config: `.claude/settings.local.json` - hooks activate automatically after clone.

## Project Structure

```
pia-system/
├── src/
│   ├── index.ts              # Entry point (hub/local mode)
│   ├── config.ts             # .env configuration
│   ├── agents/               # Agent factory, cost router, doctor
│   ├── ai/                   # Multi-model AI (Claude, GPT, Gemini, Grok, Ollama)
│   ├── api/
│   │   ├── server.ts         # Express + middleware + sentinel
│   │   └── routes/           # 19 API route files
│   ├── comms/                # Cross-machine, Discord, MQTT, agent bus
│   ├── db/                   # SQLite database + queries
│   ├── hooks/                # Delegation rules
│   ├── hub/                  # Aggregator, alert monitor
│   ├── local/                # Hub client, local service
│   ├── orchestrator/         # Task queue, execution engine, heartbeat
│   ├── security/             # Network Sentinel (IDS)
│   ├── tunnel/               # PTY wrapper, WebSocket server
│   └── utils/                # Logger
├── public/
│   ├── visor.html            # Main dashboard (7 tabs)
│   ├── wireframes.html       # UI wireframes
│   ├── showcase.html         # API showcase
│   ├── index.html            # Landing page
│   └── css/, js/             # Frontend assets
├── electron-main.cjs         # Desktop app wrapper
├── .claude/
│   ├── settings.local.json   # Hook config
│   └── hooks/                # Session tracking hooks
└── package.json
```

## Desktop App

```bash
npm run desktop          # Launch Electron visor
npm run desktop:build    # Build then launch
```

System tray, minimize-to-tray, auto-detects running server.

## Machine Fleet

| Machine | Name | Role | Tailscale IP | Specs |
|---------|------|------|-------------|-------|
| #1 | izzit7 | Hub | 100.73.133.3 | RTX 5090, Windows 11 Pro |
| #2 | TBD | Spoke | TBD | Coming online |
| #3 | soda-yeti | Spoke | 100.102.217.69 | Ryzen 7 7700X, 32GB RAM |

## Development Status

| Phase | Status | Tickets |
|-------|--------|---------|
| Foundation | Done | PIA-001 to PIA-006 |
| Dashboard | Done | PIA-007 to PIA-011 |
| Multi-Machine | Done | PIA-012 to PIA-015 |
| Mobile + Auto-Healer | Done | PIA-016 to PIA-021 |
| Polish + Security | Done | PIA-022 to PIA-025 |
| Visor + Sentinel + Desktop | Done | Session 1-3 |

## Orchestration Techniques (Playbook)

Techniques discovered and proven during the DAO rebuild session. Use these patterns for future multi-machine AI projects.

### 1. Remote PTY Control
**What**: Create terminal sessions on remote machines via PIA API and run commands.
```bash
# Create session on remote machine
curl -X POST http://REMOTE_IP:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "X-Api-Token: pia-local-dev-token-2024" \
  -d '{"machine_id":"MACHINE_DB_ID","command":"powershell"}'

# Send command
curl -X POST http://REMOTE_IP:3000/api/sessions/SESSION_ID/input \
  -H "Content-Type: application/json" \
  -H "X-Api-Token: pia-local-dev-token-2024" \
  -d '{"data":"hostname\r\n"}'

# Read output (check .buffer field)
curl http://REMOTE_IP:3000/api/sessions/SESSION_ID \
  -H "X-Api-Token: pia-local-dev-token-2024"
```
**Best for**: Running builds, git operations, quick checks. **Not for**: Creating large files (use git push instead).

### 2. Git-Based Messaging
**What**: Use git push/pull as a reliable async message channel between machines.
```bash
# Hub writes a message file
echo "Instructions for Machine #3" > MESSAGE_FROM_HUB.md
git add MESSAGE_FROM_HUB.md && git commit -m "hub: message" && git push

# Machine #3 reads it
git pull && cat MESSAGE_FROM_HUB.md
```
**Best for**: Specs, journals, large documents, instructions. **Not for**: Real-time chat (use relay API instead).

### 3. Parallel Agent Swarm
**What**: Launch 5+ agents simultaneously for maximum throughput.
```
Hub launches in parallel:
├── Agent 1: Write API contracts spec
├── Agent 2: Write state machines spec
├── Agent 3: Deploy implementation to Machine #3 via PTY
├── Agent 4: QA review agent analyzing code on Machine #3
└── Agent 5: Read knowledge base from GitHub
```
**Key rule**: Agents must be independent (no dependencies between them). If Agent 3 needs Agent 1's output, run Agent 1 first.

### 4. Relay Broadcasting
**What**: Send status updates to all machines via the cross-machine relay.
```bash
curl -X POST http://localhost:3000/api/relay/send \
  -H "Content-Type: application/json" \
  -H "X-Api-Token: pia-local-dev-token-2024" \
  -d '{"to":"*","content":"[HUB] Status update here","type":"chat"}'
```
Visible on every machine's Visor Chat tab. Good for keeping the fleet informed.

### 5. Spec-First Development
**What**: Write complete specifications before touching any code.
```
Phase A: SPECIFY
  1. Foundation Spec (DB, auth, types)
  2. API Contracts (every endpoint)
  3. State Machines (every lifecycle)

Phase B: IMPLEMENT
  - All agents share the same blueprint
  - Parallel implementation across machines

Phase C: QA
  - Automated review agents check work
  - Devil's advocate analysis on decisions
```

### 6. Decision Journal with Devil's Advocate
**What**: Track every architectural decision with WHY, alternatives rejected, and self-criticism.
```markdown
## Decision #1: SQLite over PostgreSQL
**WHY**: Zero infrastructure cost, portable...
**ALTERNATIVES REJECTED**: PostgreSQL (adds complexity), Supabase (adds cost)...
**DEVIL'S ADVOCATE**: No concurrent writes, no pgvector...
**VERDICT**: Keep SQLite, plan migration at 100+ users.
```

### 7. Cross-Machine QA Agent
**What**: Launch a review agent on a DIFFERENT machine to analyze code independently.
```
Hub creates PTY on Machine #3 → Runs build → Checks for errors →
Runs tests → Counts TODOs → Checks security → Reports back via relay
```
Separation between builder and reviewer prevents blind spots.

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `MACHINE-2-SETUP.md` | Step-by-step setup for Machine #2 |
| `MACHINE-3-SETUP.md` | Update instructions for Machine #3 |
| `THREE-MACHINE-SIMULATION.md` | Full 3-machine orchestration simulation + issues |
| `MESSAGE_FROM_HUB.md` | Latest hub-to-fleet message |
| `DAO_FOUNDATION_SPEC.md` | Foundation specification (DB, auth, types) |
| `DAO_API_CONTRACTS.md` | API endpoint contracts |
| `DAO_STATE_MACHINES.md` | State machine specifications |
| `DAO_DECISION_JOURNAL.md` | Decision log with devil's advocate analysis |
| `PIA_IMPROVEMENTS_JOURNAL.md` | PIA system improvement proposals |
| `HANDOFF.md` | Quick reference for next agent session |

## License

MIT
