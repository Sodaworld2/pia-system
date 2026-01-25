# PIA Sprint Plan: Complete Implementation Guide

**Project**: Project Intelligence Agent (PIA)
**Version**: 1.0
**Created**: January 2026
**Duration**: 5 weeks (can parallelize to 3 weeks with multiple agents)

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture Decision](#architecture-decision)
3. [Technical Stack](#technical-stack)
4. [Sprint Structure](#sprint-structure)
5. [Detailed Tickets](#detailed-tickets)
6. [File Structure](#file-structure)
7. [API Contracts](#api-contracts)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Guide](#deployment-guide)

---

## Project Overview

### What PIA Does
PIA is a **supervisor system** that lets you control and monitor a fleet of 43+ AI coding agents across multiple machines from a single dashboard (including your phone).

### Core Value Propositions
1. **Remote Control** - Control any Claude CLI from your phone while at a coffee shop
2. **Fleet Visibility** - See all 43 agents across all machines in one view
3. **Auto-Documentation** - AI automatically updates your sitemaps and roadmaps
4. **Zero Cost Assessment** - RTX 5090 + Ollama = free local AI processing

### Target Setup
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Main PC      │     │     Laptop      │     │   VR Station    │
│  RTX 5090       │     │                 │     │                 │
│  20 agents      │     │   15 agents     │     │    8 agents     │
│  PIA Local      │     │   PIA Local     │     │   PIA Local     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      PIA Central Hub    │
                    │   (Aggregation Server)  │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
        ┌─────▼─────┐     ┌──────▼──────┐    ┌─────▼─────┐
        │  Desktop  │     │   Mobile    │    │  Tablet   │
        │  Browser  │     │    PWA      │    │  Browser  │
        └───────────┘     └─────────────┘    └───────────┘
```

---

## Architecture Decision

### Foundation: Claude-Flow
We use **Claude-Flow** (https://github.com/ruvnet/claude-flow) as the orchestration engine because:
- 60+ specialized agents already built
- Swarm coordination with anti-drift
- Ollama integration for RTX 5090
- MCP protocol for Claude Code integration
- MIT license (free, no restrictions)
- 12.9k GitHub stars (battle-tested)

### What We Build On Top
| Component | Description | Why Custom |
|-----------|-------------|------------|
| **CLI Tunnel** | PTY capture + WebSocket streaming | Unique to PIA |
| **Fleet Dashboard** | 43-agent high-density matrix | Scale requirement |
| **Central Hub** | Cross-machine aggregation | Multi-PC setup |
| **Mobile PWA** | Phone control interface | Remote access |
| **Auto-Healer** | Documentation auto-update | Workflow specific |

### What We DON'T Build
- Agent orchestration logic (Claude-Flow)
- Task decomposition (CC Mirror/Claude-Flow)
- Model routing (Claude-Flow)
- Consensus algorithms (Claude-Flow)
- Token optimization (Claude-Flow)

---

## Technical Stack

### Backend (Node.js)
```json
{
  "runtime": "Node.js 20+",
  "package-manager": "npm or pnpm",
  "dependencies": {
    "claude-flow": "^3.0.0",
    "node-pty": "^1.0.0",
    "ws": "^8.0.0",
    "express": "^4.18.0",
    "socket.io": "^4.7.0",
    "better-sqlite3": "^11.0.0",
    "chokidar": "^3.6.0",
    "ollama": "^0.5.0"
  }
}
```

### Frontend (Vanilla JS + Your Mockups)
```json
{
  "framework": "None (vanilla JS)",
  "styling": "CSS (already in mockups)",
  "bundler": "Vite (optional)",
  "pwa": "Workbox for service worker"
}
```

### Infrastructure
| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | SQLite (better-sqlite3) | Local state, fast |
| Real-time | WebSocket (ws/socket.io) | CLI streaming |
| Queue | BullMQ + Redis (optional) | Task distribution |
| AI Local | Ollama | RTX 5090 inference |
| AI Cloud | Claude API (fallback) | When local unavailable |

### Hardware Requirements
| Machine | Minimum | Recommended |
|---------|---------|-------------|
| Main PC | 16GB RAM, GPU | 32GB RAM, RTX 5090 |
| Laptop | 8GB RAM | 16GB RAM |
| VR Station | 16GB RAM | 32GB RAM, GPU |

---

## Sprint Structure

### Overview
```
Week 1: Foundation + CLI Tunnel
Week 2: Fleet Dashboard + Real-time
Week 3: Central Hub + Multi-machine
Week 4: Mobile PWA + Auto-Healer
Week 5: Polish + Testing + Documentation
```

### Sprint Velocity
- **Solo developer**: 5 weeks
- **2 parallel agents**: 3 weeks
- **4 parallel agents**: 2 weeks

### Ticket Format
```
PIA-XXX: [Component] Title
Priority: P0 (critical) | P1 (high) | P2 (medium) | P3 (low)
Estimate: Xh (hours)
Dependencies: PIA-XXX, PIA-XXX
```

---

## Detailed Tickets

### Phase 1: Foundation (Week 1)

#### PIA-001: Project Initialization
**Priority**: P0
**Estimate**: 2h
**Dependencies**: None

**Description**:
Initialize the PIA project with proper structure, dependencies, and configuration.

**Acceptance Criteria**:
- [ ] `npm init` with proper package.json
- [ ] Install all dependencies (see Technical Stack)
- [ ] Create folder structure (see File Structure section)
- [ ] TypeScript configuration (tsconfig.json)
- [ ] ESLint + Prettier configuration
- [ ] Git hooks (husky) for pre-commit checks
- [ ] README with setup instructions

**Commands**:
```bash
mkdir pia
cd pia
npm init -y
npm install claude-flow@v3alpha node-pty ws express socket.io better-sqlite3 chokidar
npm install -D typescript @types/node @types/ws @types/express eslint prettier
npx tsc --init
```

---

#### PIA-002: Claude-Flow Integration
**Priority**: P0
**Estimate**: 4h
**Dependencies**: PIA-001

**Description**:
Set up Claude-Flow as the orchestration engine and verify it works with local Ollama.

**Acceptance Criteria**:
- [ ] Claude-Flow installed and configured
- [ ] MCP server starts successfully
- [ ] Can spawn a test agent via CLI
- [ ] Ollama integration verified (if available)
- [ ] Configuration file created (pia.config.json)

**Technical Details**:
```javascript
// pia.config.json
{
  "orchestration": {
    "engine": "claude-flow",
    "maxAgents": 50,
    "defaultTopology": "hierarchical"
  },
  "ai": {
    "primary": "ollama",
    "fallback": "claude-api",
    "ollamaModel": "llama3:70b",
    "claudeModel": "claude-sonnet-4-20250514"
  },
  "machines": []
}
```

**Verification**:
```bash
npx claude-flow --list  # Should show available agents
npx claude-flow --agent coder --task "console.log hello"  # Test spawn
```

---

#### PIA-003: Database Schema
**Priority**: P0
**Estimate**: 3h
**Dependencies**: PIA-001

**Description**:
Create SQLite database schema for storing agent state, sessions, and history.

**Acceptance Criteria**:
- [ ] Database file created (pia.db)
- [ ] All tables created with proper indexes
- [ ] Migration system for future schema changes
- [ ] Basic CRUD functions for each table

**Schema**:
```sql
-- Machines registered with PIA
CREATE TABLE machines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  ip_address TEXT,
  status TEXT DEFAULT 'offline',  -- online, offline, error
  last_seen INTEGER,
  capabilities TEXT,  -- JSON: {gpu: true, ollama: true}
  created_at INTEGER DEFAULT (unixepoch())
);

-- Agents running on machines
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  machine_id TEXT REFERENCES machines(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- coder, tester, reviewer, etc.
  status TEXT DEFAULT 'idle',  -- idle, working, waiting, error
  current_task TEXT,
  progress INTEGER DEFAULT 0,
  context_used INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  started_at INTEGER,
  last_activity INTEGER,
  metadata TEXT  -- JSON
);

-- CLI sessions (for tunnel)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  machine_id TEXT REFERENCES machines(id),
  pty_pid INTEGER,
  status TEXT DEFAULT 'active',  -- active, paused, closed
  created_at INTEGER DEFAULT (unixepoch()),
  closed_at INTEGER
);

-- Session output buffer
CREATE TABLE session_output (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  output TEXT NOT NULL,
  timestamp INTEGER DEFAULT (unixepoch())
);

-- Tasks and their status
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',  -- pending, in_progress, completed, failed
  blocked_by TEXT,  -- JSON array of task IDs
  blocks TEXT,      -- JSON array of task IDs
  created_at INTEGER DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);

-- Documentation files being watched
CREATE TABLE watched_docs (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,  -- sitemap, roadmap, readme, etc.
  last_hash TEXT,
  last_updated INTEGER,
  auto_update BOOLEAN DEFAULT 1
);

-- Alerts and notifications
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id TEXT REFERENCES machines(id),
  agent_id TEXT REFERENCES agents(id),
  type TEXT NOT NULL,  -- error, warning, info, stuck
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX idx_agents_machine ON agents(machine_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_sessions_agent ON sessions(agent_id);
CREATE INDEX idx_tasks_agent ON tasks(agent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged);
```

---

#### PIA-004: PTY Wrapper (CLI Capture)
**Priority**: P0
**Estimate**: 6h
**Dependencies**: PIA-001, PIA-003

**Description**:
Create the node-pty wrapper that captures Claude CLI output and allows input injection.

**Acceptance Criteria**:
- [ ] Can spawn Claude CLI in a pseudo-terminal
- [ ] Captures all stdout/stderr output
- [ ] Can inject keystrokes into the terminal
- [ ] Handles terminal resize events
- [ ] Stores output in database (session_output table)
- [ ] Graceful shutdown on process exit

**Technical Details**:
```typescript
// src/tunnel/pty-wrapper.ts
import * as pty from 'node-pty';
import { EventEmitter } from 'events';

interface PTYOptions {
  command: string;      // 'claude' or 'npx claude-flow'
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export class PTYWrapper extends EventEmitter {
  private pty: pty.IPty | null = null;
  private outputBuffer: string[] = [];

  spawn(options: PTYOptions): void {
    this.pty = pty.spawn(options.command, options.args, {
      name: 'xterm-256color',
      cols: options.cols || 120,
      rows: options.rows || 30,
      cwd: options.cwd,
      env: { ...process.env, ...options.env }
    });

    this.pty.onData((data) => {
      this.outputBuffer.push(data);
      this.emit('output', data);
    });

    this.pty.onExit(({ exitCode }) => {
      this.emit('exit', exitCode);
    });
  }

  write(data: string): void {
    this.pty?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.pty?.resize(cols, rows);
  }

  kill(): void {
    this.pty?.kill();
  }

  getBuffer(): string[] {
    return this.outputBuffer;
  }
}
```

**Testing**:
```bash
# Manual test
node -e "
const { PTYWrapper } = require('./dist/tunnel/pty-wrapper');
const wrapper = new PTYWrapper();
wrapper.on('output', (data) => console.log(data));
wrapper.spawn({ command: 'echo', args: ['hello'], cwd: '.' });
"
```

---

#### PIA-005: WebSocket Server
**Priority**: P0
**Estimate**: 4h
**Dependencies**: PIA-004

**Description**:
Create WebSocket server that streams PTY output to connected clients and receives input.

**Acceptance Criteria**:
- [ ] WebSocket server starts on configurable port
- [ ] Clients can connect and authenticate
- [ ] Real-time streaming of PTY output to all connected clients
- [ ] Clients can send input that gets injected into PTY
- [ ] Handle client disconnect gracefully
- [ ] Support multiple simultaneous sessions

**Technical Details**:
```typescript
// src/tunnel/websocket-server.ts
import { WebSocketServer, WebSocket } from 'ws';
import { PTYWrapper } from './pty-wrapper';

interface Client {
  ws: WebSocket;
  sessionId: string;
  authenticated: boolean;
}

interface Message {
  type: 'auth' | 'input' | 'resize' | 'subscribe' | 'unsubscribe';
  payload: any;
}

export class TunnelServer {
  private wss: WebSocketServer;
  private sessions: Map<string, PTYWrapper> = new Map();
  private clients: Map<WebSocket, Client> = new Map();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.wss.on('connection', (ws) => {
      this.clients.set(ws, { ws, sessionId: '', authenticated: false });

      ws.on('message', (data) => {
        const msg: Message = JSON.parse(data.toString());
        this.handleMessage(ws, msg);
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  private handleMessage(ws: WebSocket, msg: Message): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (msg.type) {
      case 'auth':
        // Verify token, set authenticated = true
        client.authenticated = this.verifyToken(msg.payload.token);
        ws.send(JSON.stringify({ type: 'auth', success: client.authenticated }));
        break;

      case 'subscribe':
        if (!client.authenticated) return;
        client.sessionId = msg.payload.sessionId;
        // Send current buffer
        const session = this.sessions.get(client.sessionId);
        if (session) {
          ws.send(JSON.stringify({
            type: 'buffer',
            payload: session.getBuffer().join('')
          }));
        }
        break;

      case 'input':
        if (!client.authenticated) return;
        const pty = this.sessions.get(client.sessionId);
        pty?.write(msg.payload.data);
        break;

      case 'resize':
        if (!client.authenticated) return;
        const ptyResize = this.sessions.get(client.sessionId);
        ptyResize?.resize(msg.payload.cols, msg.payload.rows);
        break;
    }
  }

  createSession(sessionId: string, command: string, cwd: string): void {
    const pty = new PTYWrapper();
    pty.spawn({ command, args: [], cwd });

    pty.on('output', (data) => {
      // Broadcast to all clients subscribed to this session
      this.clients.forEach((client) => {
        if (client.sessionId === sessionId && client.authenticated) {
          client.ws.send(JSON.stringify({ type: 'output', payload: data }));
        }
      });
    });

    this.sessions.set(sessionId, pty);
  }

  private verifyToken(token: string): boolean {
    // Simple token verification - enhance for production
    return token === process.env.PIA_SECRET_TOKEN;
  }
}
```

**Protocol**:
```
Client → Server:
  { type: 'auth', payload: { token: 'xxx' } }
  { type: 'subscribe', payload: { sessionId: 'abc' } }
  { type: 'input', payload: { data: 'yes\n' } }
  { type: 'resize', payload: { cols: 120, rows: 40 } }

Server → Client:
  { type: 'auth', success: true }
  { type: 'buffer', payload: '...' }
  { type: 'output', payload: '...' }
  { type: 'exit', payload: { code: 0 } }
```

---

#### PIA-006: Basic REST API
**Priority**: P1
**Estimate**: 4h
**Dependencies**: PIA-003

**Description**:
Create REST API for dashboard to query agent state, machines, and sessions.

**Acceptance Criteria**:
- [ ] Express server with proper middleware
- [ ] CORS configured for dashboard access
- [ ] All endpoints return proper JSON
- [ ] Error handling with appropriate status codes
- [ ] Rate limiting for security

**Endpoints**:
```
GET  /api/machines              - List all machines
GET  /api/machines/:id          - Get machine details
POST /api/machines              - Register new machine

GET  /api/agents                - List all agents (with filters)
GET  /api/agents/:id            - Get agent details
POST /api/agents/:id/task       - Assign task to agent

GET  /api/sessions              - List active sessions
GET  /api/sessions/:id          - Get session details
POST /api/sessions              - Create new session (spawn CLI)
DELETE /api/sessions/:id        - Close session

GET  /api/alerts                - List alerts (unacknowledged)
POST /api/alerts/:id/ack        - Acknowledge alert

GET  /api/stats                 - Global statistics
GET  /api/health                - Health check
```

---

### Phase 2: Fleet Dashboard (Week 2)

#### PIA-007: Dashboard HTML Structure
**Priority**: P0
**Estimate**: 4h
**Dependencies**: PIA-006

**Description**:
Convert existing mockups into functional HTML with proper data binding points.

**Acceptance Criteria**:
- [ ] `public/index.html` - Main dashboard
- [ ] `public/fleet.html` - 43-agent matrix view
- [ ] `public/tunnel.html` - CLI viewer
- [ ] `public/mobile.html` - Mobile-optimized view
- [ ] All pages share common styles (styles.css)
- [ ] Data binding points marked with `data-*` attributes

**File Structure**:
```
public/
├── index.html          # Main dashboard
├── fleet.html          # Fleet matrix
├── tunnel.html         # CLI tunnel viewer
├── mobile.html         # Mobile PWA entry
├── css/
│   ├── styles.css      # Shared styles
│   ├── fleet.css       # Fleet-specific
│   └── tunnel.css      # Terminal styles
├── js/
│   ├── app.js          # Main app logic
│   ├── fleet.js        # Fleet matrix logic
│   ├── tunnel.js       # Terminal client
│   ├── websocket.js    # WS connection handler
│   └── api.js          # REST API client
└── assets/
    └── icons/          # Status icons, etc.
```

---

#### PIA-008: Agent Tile Component
**Priority**: P0
**Estimate**: 4h
**Dependencies**: PIA-007

**Description**:
Create the individual agent tile component for the fleet matrix.

**Acceptance Criteria**:
- [ ] Compact tile design (fits 43+ on screen)
- [ ] Status glow (green/yellow/red)
- [ ] Mini-CLI stream (last 3-5 lines)
- [ ] Progress indicator
- [ ] Click to expand/focus
- [ ] Hover shows quick stats

**Component Structure**:
```html
<div class="agent-tile" data-agent-id="agent-123" data-status="working">
  <div class="agent-header">
    <span class="agent-name">coder-01</span>
    <span class="agent-machine">main-pc</span>
  </div>
  <div class="agent-status-glow"></div>
  <div class="agent-mini-cli">
    <pre class="cli-output">Creating component...
Running tests...
✓ All tests pass</pre>
  </div>
  <div class="agent-progress">
    <div class="progress-bar" style="width: 65%"></div>
    <span class="progress-text">65%</span>
  </div>
  <div class="agent-stats">
    <span class="tokens">12.4k tokens</span>
    <span class="time">4m 32s</span>
  </div>
</div>
```

**CSS**:
```css
.agent-tile {
  width: 180px;
  height: 140px;
  border-radius: 8px;
  background: #1a1a2e;
  border: 1px solid #2a2a4e;
  padding: 8px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-tile:hover {
  transform: scale(1.05);
  border-color: #4a4a8e;
}

.agent-tile[data-status="working"] .agent-status-glow {
  background: radial-gradient(circle, #00ff88 0%, transparent 70%);
  animation: pulse 2s infinite;
}

.agent-tile[data-status="waiting"] .agent-status-glow {
  background: radial-gradient(circle, #ffaa00 0%, transparent 70%);
  animation: pulse 1s infinite;
}

.agent-tile[data-status="error"] .agent-status-glow {
  background: radial-gradient(circle, #ff4444 0%, transparent 70%);
  animation: pulse 0.5s infinite;
}

.agent-mini-cli {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  line-height: 1.2;
  background: #0a0a15;
  border-radius: 4px;
  padding: 4px;
  height: 45px;
  overflow: hidden;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}
```

---

#### PIA-009: Fleet Matrix Grid
**Priority**: P0
**Estimate**: 4h
**Dependencies**: PIA-008

**Description**:
Create the responsive grid layout that displays all 43+ agent tiles.

**Acceptance Criteria**:
- [ ] Auto-adjusts columns based on screen width
- [ ] Filtering by machine, status, type
- [ ] Sorting by activity, name, status
- [ ] Search/filter input
- [ ] Machine grouping (collapsible sections)
- [ ] Total stats header

**Layout**:
```
┌──────────────────────────────────────────────────────────────┐
│  FLEET MATRIX    [Filter: All ▼] [Sort: Activity ▼] [🔍]    │
│  43 agents • 3 machines • 12 working • 2 stuck               │
├──────────────────────────────────────────────────────────────┤
│  ▼ Main PC (20 agents) ──────────────────────────────────    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│  │tile │ │tile │ │tile │ │tile │ │tile │ │tile │ │tile │   │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘   │
│  ┌─────┐ ┌─────┐ ┌─────┐ ...                                │
│                                                              │
│  ▼ Laptop (15 agents) ───────────────────────────────────    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ...       │
│                                                              │
│  ▼ VR Station (8 agents) ────────────────────────────────    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ...                        │
└──────────────────────────────────────────────────────────────┘
```

---

#### PIA-010: Real-time Updates (Socket.IO)
**Priority**: P0
**Estimate**: 4h
**Dependencies**: PIA-005, PIA-009

**Description**:
Connect the dashboard to WebSocket for real-time agent status updates.

**Acceptance Criteria**:
- [ ] Dashboard connects to WS on load
- [ ] Agent tiles update in real-time (no polling)
- [ ] Mini-CLI streams update live
- [ ] Progress bars animate smoothly
- [ ] Status changes trigger visual feedback
- [ ] Reconnection handling with backoff

**Events**:
```javascript
// Server → Client events
socket.emit('agent:update', { id, status, progress, lastOutput });
socket.emit('agent:output', { id, output });
socket.emit('alert:new', { id, type, message, agentId });
socket.emit('machine:status', { id, status });

// Client → Server events
socket.emit('agent:subscribe', { agentIds: [...] });
socket.emit('session:input', { sessionId, data });
```

---

#### PIA-011: CLI Tunnel Viewer
**Priority**: P0
**Estimate**: 6h
**Dependencies**: PIA-005, PIA-007

**Description**:
Full-screen terminal viewer with input support using xterm.js.

**Acceptance Criteria**:
- [ ] xterm.js terminal rendering
- [ ] WebSocket connection for real-time output
- [ ] Keyboard input sent to server
- [ ] Copy/paste support
- [ ] Terminal resize handling
- [ ] Session selection dropdown
- [ ] Split view for multiple sessions

**Dependencies**:
```html
<script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
<script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
<script src="https://unpkg.com/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js"></script>
```

**Implementation**:
```javascript
// public/js/tunnel.js
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

class TunnelViewer {
  constructor(containerId, sessionId) {
    this.terminal = new Terminal({
      theme: {
        background: '#0a0a15',
        foreground: '#e0e0e0',
        cursor: '#00ff88'
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14,
      cursorBlink: true
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    this.terminal.open(document.getElementById(containerId));
    this.fitAddon.fit();

    this.connectWebSocket(sessionId);
    this.setupInputHandling();
  }

  connectWebSocket(sessionId) {
    this.ws = new WebSocket(`ws://${location.host}/tunnel`);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'auth',
        payload: { token: localStorage.getItem('pia_token') }
      }));
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        payload: { sessionId }
      }));
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output' || msg.type === 'buffer') {
        this.terminal.write(msg.payload);
      }
    };
  }

  setupInputHandling() {
    this.terminal.onData((data) => {
      this.ws.send(JSON.stringify({
        type: 'input',
        payload: { data }
      }));
    });

    window.addEventListener('resize', () => {
      this.fitAddon.fit();
      this.ws.send(JSON.stringify({
        type: 'resize',
        payload: { cols: this.terminal.cols, rows: this.terminal.rows }
      }));
    });
  }
}
```

---

### Phase 3: Central Hub (Week 3)

#### PIA-012: Machine Registration Protocol
**Priority**: P0
**Estimate**: 4h
**Dependencies**: PIA-003, PIA-006

**Description**:
Protocol for PIA Local instances to register with Central Hub.

**Acceptance Criteria**:
- [ ] Machine generates unique ID on first run
- [ ] Registration includes capabilities (GPU, Ollama, etc.)
- [ ] Heartbeat every 30 seconds
- [ ] Auto-reconnect on disconnect
- [ ] Machine appears offline after 3 missed heartbeats

**Protocol**:
```typescript
// Registration request
POST /api/machines
{
  "id": "machine-uuid",
  "name": "Main PC",
  "hostname": "MIC-DESKTOP",
  "capabilities": {
    "gpu": "RTX 5090",
    "vram": 24576,
    "ollama": true,
    "ollamaModels": ["llama3:70b", "mistral:latest"],
    "maxAgents": 20
  }
}

// Heartbeat
POST /api/machines/:id/heartbeat
{
  "agents": [
    { "id": "agent-1", "status": "working", "progress": 45 },
    { "id": "agent-2", "status": "idle" }
  ],
  "resources": {
    "cpuUsage": 45,
    "memoryUsage": 62,
    "gpuUsage": 78
  }
}
```

---

#### PIA-013: PIA Local Service
**Priority**: P0
**Estimate**: 6h
**Dependencies**: PIA-012, PIA-004

**Description**:
Standalone service that runs on each machine to manage local agents and report to Hub.

**Acceptance Criteria**:
- [ ] Runs as background service (or daemon)
- [ ] Manages local Claude-Flow agents
- [ ] Reports status to Central Hub
- [ ] Accepts remote commands from Hub
- [ ] Handles local Ollama integration
- [ ] Auto-starts on machine boot (optional)

**Architecture**:
```
┌─────────────────────────────────────────┐
│             PIA Local Service           │
├─────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ Agent       │  │ Hub Connection  │  │
│  │ Manager     │  │ (WebSocket)     │  │
│  └──────┬──────┘  └────────┬────────┘  │
│         │                  │           │
│  ┌──────▼──────┐  ┌────────▼────────┐  │
│  │ Claude-Flow │  │ Command Handler │  │
│  │ (60+ agents)│  │                 │  │
│  └─────────────┘  └─────────────────┘  │
│                                        │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ PTY Manager │  │ Ollama Client   │  │
│  │             │  │                 │  │
│  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────┘
```

**Commands from Hub**:
```typescript
interface HubCommand {
  type: 'spawn_agent' | 'kill_agent' | 'send_input' | 'get_logs' | 'update_config';
  payload: any;
}

// spawn_agent
{ type: 'spawn_agent', payload: { agentType: 'coder', task: 'Fix bug in auth.ts' }}

// send_input (to running CLI)
{ type: 'send_input', payload: { sessionId: 'xxx', input: 'yes\n' }}

// kill_agent
{ type: 'kill_agent', payload: { agentId: 'agent-123' }}
```

---

#### PIA-014: Central Aggregation Server
**Priority**: P0
**Estimate**: 6h
**Dependencies**: PIA-012, PIA-013

**Description**:
The main Hub that aggregates data from all machines and serves the dashboard.

**Acceptance Criteria**:
- [ ] Accepts connections from multiple PIA Local instances
- [ ] Aggregates agent data from all machines
- [ ] Serves dashboard (static files + API)
- [ ] Forwards commands to appropriate machines
- [ ] Stores historical data (SQLite)
- [ ] Generates global alerts

**Deployment Options**:
1. **Local** - Runs on your main PC (default)
2. **Cloud** - Deploy to VPS for remote access
3. **Hybrid** - Local with ngrok/Cloudflare tunnel

---

#### PIA-015: Global Alert System
**Priority**: P1
**Estimate**: 4h
**Dependencies**: PIA-014

**Description**:
Centralized alerting for issues across all machines.

**Acceptance Criteria**:
- [ ] Alerts when agent is stuck (no progress for 5+ min)
- [ ] Alerts on agent errors
- [ ] Alerts when machine goes offline
- [ ] Alerts on high resource usage
- [ ] Alerts display in dashboard header
- [ ] Alert sound/notification (optional)
- [ ] Alert acknowledgment

**Alert Types**:
```typescript
type AlertType =
  | 'agent_stuck'      // No progress for 5+ minutes
  | 'agent_error'      // Agent threw error
  | 'agent_waiting'    // Agent waiting for input
  | 'machine_offline'  // Machine missed heartbeats
  | 'resource_high'    // CPU/GPU/Memory above threshold
  | 'context_overflow' // Agent running out of context
  | 'task_failed';     // Task failed to complete
```

---

### Phase 4: Mobile + Auto-Healer (Week 4)

#### PIA-016: Mobile PWA Setup
**Priority**: P1
**Estimate**: 4h
**Dependencies**: PIA-007

**Description**:
Convert dashboard to Progressive Web App for mobile access.

**Acceptance Criteria**:
- [ ] `manifest.json` with app metadata
- [ ] Service worker for offline support
- [ ] Mobile-optimized layout (responsive)
- [ ] Add to home screen prompt
- [ ] Push notification permission

**Files**:
```json
// public/manifest.json
{
  "name": "PIA - Project Intelligence Agent",
  "short_name": "PIA",
  "description": "Control your AI agent fleet",
  "start_url": "/mobile.html",
  "display": "standalone",
  "background_color": "#0a0a15",
  "theme_color": "#00ff88",
  "icons": [
    { "src": "/assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

#### PIA-017: Mobile Dashboard UI
**Priority**: P1
**Estimate**: 6h
**Dependencies**: PIA-016

**Description**:
Touch-optimized mobile interface for controlling agents.

**Acceptance Criteria**:
- [ ] Single-column layout for phones
- [ ] Larger touch targets (44px minimum)
- [ ] Swipe gestures for navigation
- [ ] Quick actions (approve, reject, input)
- [ ] Compact agent cards
- [ ] Bottom navigation bar

**Screens**:
```
1. Fleet Overview (default)
   - Summary stats at top
   - Scrollable agent list
   - Tap agent → expand details

2. Alerts
   - List of pending alerts
   - Swipe to acknowledge
   - Tap for details

3. Tunnel (Quick Input)
   - List of agents waiting for input
   - Tap to open keyboard
   - Pre-defined quick responses

4. Settings
   - Machine visibility toggles
   - Notification preferences
   - Theme (dark/light)
```

---

#### PIA-018: Push Notifications
**Priority**: P2
**Estimate**: 4h
**Dependencies**: PIA-015, PIA-016

**Description**:
Send push notifications to phone when agents need attention.

**Acceptance Criteria**:
- [ ] Request notification permission
- [ ] Send notification when agent stuck
- [ ] Send notification when agent waiting for input
- [ ] Send notification on critical errors
- [ ] Notification tap opens relevant screen
- [ ] Configurable notification types

**Implementation**:
```javascript
// Service worker push handler
self.addEventListener('push', (event) => {
  const data = event.data.json();

  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/badge.png',
    data: { url: data.url },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'view') {
    clients.openWindow(event.notification.data.url);
  }
});
```

---

#### PIA-019: Folder Watcher (Auto-Healer)
**Priority**: P1
**Estimate**: 4h
**Dependencies**: PIA-003

**Description**:
Watch folders for agent output and trigger documentation updates.

**Acceptance Criteria**:
- [ ] Watch configurable directories
- [ ] Detect new/modified files
- [ ] Filter by file type (*.md, *.json, etc.)
- [ ] Debounce rapid changes
- [ ] Queue files for processing
- [ ] Store watch config in database

**Implementation**:
```typescript
// src/healer/folder-watcher.ts
import chokidar from 'chokidar';
import { EventEmitter } from 'events';

interface WatchConfig {
  paths: string[];
  ignore?: string[];
  fileTypes?: string[];
}

export class FolderWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;

  start(config: WatchConfig): void {
    this.watcher = chokidar.watch(config.paths, {
      ignored: config.ignore || [/node_modules/, /\.git/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    });

    this.watcher.on('add', (path) => this.handleFile(path, 'add'));
    this.watcher.on('change', (path) => this.handleFile(path, 'change'));
  }

  private handleFile(path: string, event: 'add' | 'change'): void {
    this.emit('file', { path, event, timestamp: Date.now() });
  }

  stop(): void {
    this.watcher?.close();
  }
}
```

---

#### PIA-020: AI Assessment Engine
**Priority**: P1
**Estimate**: 6h
**Dependencies**: PIA-019, PIA-002

**Description**:
Use Ollama/Claude to assess agent output and determine documentation updates.

**Acceptance Criteria**:
- [ ] Connect to Ollama for local inference
- [ ] Fallback to Claude API if Ollama unavailable
- [ ] Parse agent output files
- [ ] Generate structured assessment
- [ ] Identify documentation impacts
- [ ] Queue documentation updates

**Assessment Prompt**:
```typescript
const ASSESSMENT_PROMPT = `
You are a documentation analyst. Analyze this agent output and determine:

1. What was accomplished? (brief summary)
2. What files were created/modified?
3. Does the sitemap need updating? If yes, what changes?
4. Does the roadmap need updating? If yes, what changes?
5. Are there any new features to document?

Agent Output:
---
{agent_output}
---

Current Sitemap:
---
{current_sitemap}
---

Respond in JSON format:
{
  "summary": "...",
  "filesChanged": ["..."],
  "sitemapUpdates": [...] or null,
  "roadmapUpdates": [...] or null,
  "newFeatures": [...] or null
}
`;
```

---

#### PIA-021: Documentation Auto-Update
**Priority**: P1
**Estimate**: 4h
**Dependencies**: PIA-020

**Description**:
Automatically apply documentation updates based on AI assessment.

**Acceptance Criteria**:
- [ ] Parse AI assessment JSON
- [ ] Load target documentation file
- [ ] Apply diff-based updates
- [ ] Create backup before changes
- [ ] Git commit changes (optional)
- [ ] Log all updates for review

**Update Strategy**:
```typescript
interface DocUpdate {
  type: 'add_section' | 'modify_section' | 'add_link' | 'update_status';
  target: string;  // Section name or path
  content: string;
  position?: 'before' | 'after' | 'replace';
}

// Example: Add new page to sitemap
{
  type: 'add_link',
  target: 'Navigation > Features',
  content: '- [New Feature](/docs/new-feature.md)',
  position: 'after'
}
```

---

### Phase 5: Polish + Testing (Week 5)

#### PIA-022: End-to-End Testing
**Priority**: P0
**Estimate**: 6h
**Dependencies**: All previous tickets

**Description**:
Comprehensive testing of the entire system.

**Test Scenarios**:
```
1. Single Machine Flow
   - Start PIA Local
   - Spawn agent via dashboard
   - Verify agent appears in fleet
   - Send input via tunnel
   - Verify agent receives input
   - Complete task, verify status update

2. Multi-Machine Flow
   - Start PIA Local on 2+ machines
   - Verify all machines appear in Hub
   - Spawn agents on different machines
   - Verify fleet matrix shows all agents
   - Kill one machine, verify offline alert
   - Reconnect, verify recovery

3. Mobile Flow
   - Open PWA on phone
   - Verify agents visible
   - Receive push notification
   - Send input from phone
   - Verify agent receives input

4. Auto-Healer Flow
   - Create agent output file
   - Verify watcher detects it
   - Verify AI assessment runs
   - Verify documentation updated
   - Verify git commit (if enabled)

5. Stress Test
   - Spawn 43 agents
   - Verify dashboard performance
   - Verify WebSocket handles load
   - Measure memory usage
```

---

#### PIA-023: Performance Optimization
**Priority**: P1
**Estimate**: 4h
**Dependencies**: PIA-022

**Description**:
Optimize for 43+ agents and real-time updates.

**Optimizations**:
- [ ] Virtual scrolling for fleet matrix (if needed)
- [ ] Throttle WebSocket updates (max 10/sec per agent)
- [ ] Batch database writes
- [ ] Compress WebSocket messages
- [ ] Lazy load agent details
- [ ] Cache API responses

---

#### PIA-024: Security Hardening
**Priority**: P0
**Estimate**: 4h
**Dependencies**: PIA-006, PIA-005

**Description**:
Secure the system for remote access.

**Security Measures**:
- [ ] Authentication required for all endpoints
- [ ] JWT tokens with expiration
- [ ] HTTPS enforcement (in production)
- [ ] Rate limiting on API
- [ ] Input validation on all endpoints
- [ ] WebSocket authentication
- [ ] Secure token storage
- [ ] CORS configuration

---

#### PIA-025: Documentation
**Priority**: P1
**Estimate**: 4h
**Dependencies**: All previous tickets

**Description**:
Complete documentation for users and developers.

**Documents**:
- [ ] README.md - Quick start guide
- [ ] INSTALL.md - Detailed installation
- [ ] ARCHITECTURE.md - System design
- [ ] API.md - API reference
- [ ] MOBILE.md - Mobile app guide
- [ ] TROUBLESHOOTING.md - Common issues

---

## File Structure

```
pia/
├── package.json
├── tsconfig.json
├── pia.config.json           # Main configuration
├── .env                      # Environment variables
├── .env.example
│
├── src/
│   ├── index.ts              # Main entry point
│   ├── config.ts             # Configuration loader
│   │
│   ├── api/
│   │   ├── server.ts         # Express server
│   │   ├── routes/
│   │   │   ├── machines.ts
│   │   │   ├── agents.ts
│   │   │   ├── sessions.ts
│   │   │   └── alerts.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── rateLimit.ts
│   │
│   ├── tunnel/
│   │   ├── pty-wrapper.ts    # PTY management
│   │   ├── websocket-server.ts
│   │   └── session-manager.ts
│   │
│   ├── hub/
│   │   ├── aggregator.ts     # Central aggregation
│   │   ├── machine-registry.ts
│   │   └── alert-engine.ts
│   │
│   ├── local/
│   │   ├── service.ts        # PIA Local main
│   │   ├── agent-manager.ts
│   │   └── hub-client.ts
│   │
│   ├── healer/
│   │   ├── folder-watcher.ts
│   │   ├── ai-assessor.ts
│   │   └── doc-updater.ts
│   │
│   ├── db/
│   │   ├── database.ts       # SQLite connection
│   │   ├── migrations/
│   │   └── queries/
│   │
│   └── utils/
│       ├── logger.ts
│       └── helpers.ts
│
├── public/                   # Dashboard files
│   ├── index.html
│   ├── fleet.html
│   ├── tunnel.html
│   ├── mobile.html
│   ├── manifest.json
│   ├── sw.js                 # Service worker
│   ├── css/
│   ├── js/
│   └── assets/
│
├── scripts/
│   ├── install-service.sh    # Install as system service
│   └── dev.sh                # Development helper
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## API Contracts

### REST API

```yaml
openapi: 3.0.0
info:
  title: PIA API
  version: 1.0.0

paths:
  /api/machines:
    get:
      summary: List all machines
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Machine'
    post:
      summary: Register new machine
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MachineRegistration'

  /api/agents:
    get:
      summary: List all agents
      parameters:
        - name: machine
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Agent'

  /api/sessions:
    post:
      summary: Create new CLI session
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                machineId:
                  type: string
                command:
                  type: string
                cwd:
                  type: string

components:
  schemas:
    Machine:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        hostname:
          type: string
        status:
          type: string
          enum: [online, offline, error]
        agentCount:
          type: integer
        capabilities:
          type: object

    Agent:
      type: object
      properties:
        id:
          type: string
        machineId:
          type: string
        name:
          type: string
        type:
          type: string
        status:
          type: string
          enum: [idle, working, waiting, error]
        progress:
          type: integer
        currentTask:
          type: string
```

### WebSocket Protocol

```typescript
// Connection
ws://host:port/tunnel

// Authentication (client → server)
{ "type": "auth", "payload": { "token": "jwt-token" } }

// Subscribe to session (client → server)
{ "type": "subscribe", "payload": { "sessionId": "session-uuid" } }

// Terminal input (client → server)
{ "type": "input", "payload": { "data": "user input here" } }

// Terminal resize (client → server)
{ "type": "resize", "payload": { "cols": 120, "rows": 40 } }

// Auth response (server → client)
{ "type": "auth", "success": true }

// Terminal output (server → client)
{ "type": "output", "payload": "terminal output data" }

// Buffer (initial content on subscribe)
{ "type": "buffer", "payload": "full terminal buffer" }

// Agent update (server → client, broadcast)
{ "type": "agent:update", "payload": { "id": "...", "status": "...", "progress": 45 } }

// Alert (server → client, broadcast)
{ "type": "alert", "payload": { "id": "...", "type": "agent_stuck", "message": "..." } }
```

---

## Testing Strategy

### Unit Tests
- PTY wrapper spawn/kill
- WebSocket message handling
- Database CRUD operations
- AI assessment parsing
- Documentation diff application

### Integration Tests
- API endpoint responses
- WebSocket connection flow
- Hub ↔ Local communication
- Folder watcher → AI → Doc update pipeline

### E2E Tests
- Full agent lifecycle
- Multi-machine orchestration
- Mobile PWA flow
- Stress test (43 agents)

### Manual Testing Checklist
```
[ ] Dashboard loads in Chrome, Firefox, Safari
[ ] Fleet matrix displays 43+ tiles smoothly
[ ] CLI tunnel renders correctly
[ ] Mobile PWA installable
[ ] Push notifications received
[ ] Auto-documentation updates correctly
[ ] Multi-machine aggregation works
[ ] Alerts appear and can be acknowledged
```

---

## Deployment Guide

### Development
```bash
# Clone and install
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system
npm install

# Start development server
npm run dev

# Open dashboard
open http://localhost:3000
```

### Production (Single Machine)
```bash
# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name pia

# Or as systemd service
sudo cp scripts/pia.service /etc/systemd/system/
sudo systemctl enable pia
sudo systemctl start pia
```

### Production (Multi-Machine)

**On Central Hub (Main PC)**:
```bash
# Configure as hub
echo 'PIA_MODE=hub' >> .env
echo 'PIA_PORT=3000' >> .env

# Start hub
pm2 start dist/index.js --name pia-hub
```

**On Each Machine (Laptop, VR Station)**:
```bash
# Configure as local
echo 'PIA_MODE=local' >> .env
echo 'PIA_HUB_URL=http://main-pc-ip:3000' >> .env
echo 'PIA_MACHINE_NAME=Laptop' >> .env

# Start local service
pm2 start dist/index.js --name pia-local
```

### Cloud Deployment (Optional)
For remote access without VPN, deploy Hub to:
- **Railway** - Easy Node.js hosting
- **Fly.io** - Edge deployment
- **DigitalOcean** - VPS with more control

Or use tunneling:
- **ngrok** - Quick testing
- **Cloudflare Tunnel** - Production-ready, free

---

## Environment Variables

```bash
# .env

# Mode: 'hub' or 'local'
PIA_MODE=hub

# Server
PIA_PORT=3000
PIA_HOST=0.0.0.0

# Security
PIA_SECRET_TOKEN=your-secret-token-here
PIA_JWT_SECRET=your-jwt-secret-here

# Hub connection (for local mode)
PIA_HUB_URL=http://localhost:3000
PIA_MACHINE_NAME=Main PC
PIA_MACHINE_ID=auto-generated-on-first-run

# AI
PIA_AI_PRIMARY=ollama
PIA_AI_FALLBACK=claude
PIA_OLLAMA_URL=http://localhost:11434
PIA_OLLAMA_MODEL=llama3:70b
PIA_CLAUDE_API_KEY=sk-ant-...

# Database
PIA_DB_PATH=./pia.db

# Features
PIA_ENABLE_AUTO_HEALER=true
PIA_ENABLE_PUSH_NOTIFICATIONS=true

# Logging
PIA_LOG_LEVEL=info
```

---

## Quick Reference

### Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run all tests
npm run lint         # Lint code
npm run typecheck    # TypeScript check
```

### Default Ports
| Service | Port |
|---------|------|
| API Server | 3000 |
| WebSocket | 3001 |
| Ollama | 11434 |

### Status Codes
| Agent Status | Meaning |
|--------------|---------|
| `idle` | Ready for work |
| `working` | Actively processing |
| `waiting` | Waiting for user input |
| `error` | Something went wrong |
| `completed` | Task finished |

### Alert Types
| Alert | Trigger |
|-------|---------|
| `agent_stuck` | No progress 5+ min |
| `agent_error` | Exception thrown |
| `agent_waiting` | Needs user input |
| `machine_offline` | 3 missed heartbeats |
| `context_overflow` | Running out of tokens |

---

## Success Criteria

PIA v1.0 is complete when:

- [ ] Can spawn and monitor 43+ agents across 3 machines
- [ ] Fleet dashboard updates in real-time (<500ms latency)
- [ ] CLI tunnel allows typing from browser/phone
- [ ] Mobile PWA works offline with push notifications
- [ ] Auto-healer updates documentation correctly
- [ ] All tests pass
- [ ] Documentation complete
- [ ] Deployed and running on user's machines

---

*Sprint Plan v1.0 - Ready for implementation on RTX 5090*
