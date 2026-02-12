# PIA System - Complete Specification for New Machine Setup

**READ THIS ENTIRE FILE BEFORE DOING ANYTHING.**

You are a Claude instance on a NEW machine joining the PIA network.
This document is your complete briefing. It contains everything you need to know
about PIA, what exists, every API endpoint, every communication channel, and
exactly what to do to bring this machine online.

---

## 1. WHAT IS PIA

**PIA (Project Intelligence Agent)** is a multi-machine, multi-channel AI orchestration system.

The user (mic) has multiple computers and multiple code repositories.
Every repository is an autonomous "alive" agent with its own identity, knowledge base,
task queue, and job history. PIA hub is the central brain that connects everything.

```
                    ┌─────────────────┐
                    │   Human (mic)   │
                    │  Web / Visor    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    PIA HUB      │
                    │   (izzit7)      │
                    │ 100.73.133.3    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
 ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
 │  Machine 1  │     │  Machine 3  │     │  Machine N  │
 │  (izzit7)   │     │ (soda-yeti) │     │  (future)   │
 │  Wingspan   │     │  DAO        │     │  ...        │
 │  Farcake    │     │  Other repos│     │             │
 └─────────────┘     └─────────────┘     └─────────────┘
```

### Core Concepts

- **Hub**: Central server on izzit7 (100.73.133.3). Runs API on :3000, WebSocket on :3001.
- **Machine**: Any computer connected to the hub via Tailscale/Ngrok/WebSocket.
- **Alive Repo**: Any code repository with a `.pia/` directory. Has identity, knowledge, task queue, job history.
- **Task**: A unit of work sent to a repo. "Wingspan, update the deck." "DAO, deploy contracts."
- **Job**: A task that's been executed, with status, result, and duration logged forever.
- **Visor**: A browser-based heads-up display at `/visor.html` showing live messages, repos, jobs, machines.

---

## 2. NETWORK INFORMATION

| Key | Value |
|-----|-------|
| **Hub Machine** | izzit7 |
| **Hub Tailscale IP** | `100.73.133.3` |
| **Hub API** | `http://100.73.133.3:3000` |
| **Hub WebSocket** | `ws://100.73.133.3:3001` |
| **Hub Dashboard** | `http://100.73.133.3:3000` |
| **Hub Visor** | `http://100.73.133.3:3000/visor.html` |
| **API Token** | `pia-local-dev-token-2024` |
| **JWT Secret** | `pia-jwt-secret-2024` |

### Known Machines

| Machine | Tailscale IP | Status | Role |
|---------|-------------|--------|------|
| izzit7 | 100.73.133.3 | Hub | Central controller |
| soda-yeti | 100.102.217.69 | Machine #3 | Remote worker |

---

## 3. SETUP STEPS

### Step 1: Install and Build

```bash
cd <pia-repo-directory>
npm install
npm run build
```

### Step 2: Verify Tailscale

```bash
tailscale status
```

Must show `100.73.133.3 izzit7 mic@` as online. If not installed: https://tailscale.com/download
Login with mic's account.

### Step 3: Test Connection to Hub

```bash
curl -H "X-Api-Token: pia-local-dev-token-2024" http://100.73.133.3:3000/api/health
```

Expected: `{"status":"ok","mode":"hub",...}`

If it fails: check Tailscale is connected, check firewall allows port 3000, try `ping 100.73.133.3`.

### Step 4: Register This Machine

```bash
curl -X POST http://100.73.133.3:3000/api/relay/register \
  -H "X-Api-Token: pia-local-dev-token-2024" \
  -H "Content-Type: application/json" \
  -d '{"id":"MACHINE_ID","name":"MACHINE_NAME","hostname":"HOSTNAME","project":"PROJECT","channels":["api","websocket"]}'
```

Replace MACHINE_ID, MACHINE_NAME, HOSTNAME, PROJECT with real values.

### Step 5: Make Repos Alive

For each repo the user wants alive:

```bash
cd <path-to-repo>
node <pia-path>/scripts/init-repo.cjs --name <repo-name> --capabilities "<caps>"
```

This creates `.pia/` with identity, knowledge base, job log, task queue.

### Step 6: Start Repo Agents

```bash
cd <path-to-repo>
node <pia-path>/scripts/repo-agent.cjs
```

Registers with hub, polls for tasks, logs jobs, reports state.

### Step 7: Open Visor

Open browser to `http://100.73.133.3:3000/visor.html` to see the full network state.

### Step 8: (Optional) Interactive Chat

```bash
npm install ws
node <pia-path>/scripts/remote-connect.cjs --hub http://100.73.133.3:3000 --name "MACHINE_NAME" --project "PROJECT"
```

### Step 9: (Optional) Register Webhooks

Register a webhook so this machine gets notified when events happen:

```bash
curl -X POST http://100.73.133.3:3000/api/webhooks/register \
  -H "X-Api-Token: pia-local-dev-token-2024" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-listener","url":"http://THIS_MACHINE_IP:PORT/webhook","events":["*"]}'
```

### Step 10: (Optional) Subscribe to PubSub Topics

```bash
curl -X POST http://100.73.133.3:3000/api/pubsub/subscribe \
  -H "X-Api-Token: pia-local-dev-token-2024" \
  -H "Content-Type: application/json" \
  -d '{"topic":"pia/#","subscriber":"THIS_MACHINE_NAME"}'
```

---

## 4. COMMUNICATION CHANNELS (6 Total)

### Channel 1: Tailscale (Direct Private Network)
- Private mesh VPN between all machines
- Zero config once installed and logged in
- Sub-20ms latency on LAN
- Always-on, survives reboots

### Channel 2: WebSocket Relay (Real-time)
- Hub runs WebSocket server on port 3001
- Machines connect, authenticate, then send/receive in real-time
- Message types: `relay:register`, `relay:send`, `relay:broadcast`
- Auto-reconnects on disconnect

### Channel 3: REST API (Request/Response)
- Hub runs Express API on port 3000
- Full CRUD for repos, tasks, jobs, machines, agents
- Token auth via `X-Api-Token` header
- Rate limited: 2000 req/min

### Channel 4: Webhooks (Push Notifications)
- Repos register callback URLs
- PIA fires HTTP POST to all subscribers when events happen
- Supports: `repo:task`, `job:completed`, `job:failed`, `incoming:*`, `*`
- External services (GitHub, Vercel, CI/CD) can push events in via `/api/webhooks/incoming/:source`

### Channel 5: MQTT-style PubSub (Publish/Subscribe)
- Topic-based messaging with wildcards
- Topics: `pia/repoName/event` (e.g., `pia/dao/task`, `pia/wingspan/job/completed`)
- Wildcards: `+` (single level), `#` (multi level)
- Retained messages: new subscribers get the last message on a topic
- HTTP polling or WebSocket delivery

### Channel 6: Visor (Browser Dashboard)
- Real-time browser app at `/visor.html`
- Shows: messages, repos, machines, jobs, stats
- Send messages and tasks from the browser
- Desktop notifications when events arrive
- Works on any machine that can reach the hub

---

## 5. COMPLETE API REFERENCE

All endpoints require `X-Api-Token: pia-local-dev-token-2024` header (except `/api/health`).

### Health & Stats
```
GET  /api/health                    - Health check (no auth needed)
GET  /api/stats                     - System statistics
```

### Machines
```
GET  /api/machines                  - List all machines
POST /api/machines                  - Register a machine
GET  /api/machines/:id              - Get machine details
PUT  /api/machines/:id              - Update machine
DELETE /api/machines/:id            - Remove machine
```

### Agents
```
GET  /api/agents                    - List all agents
POST /api/agents                    - Create agent
GET  /api/agents/:id                - Get agent details
PUT  /api/agents/:id                - Update agent
DELETE /api/agents/:id              - Remove agent
```

### Sessions (Terminal/PTY)
```
GET  /api/sessions                  - List PTY sessions
POST /api/sessions                  - Create new terminal session
GET  /api/sessions/:id              - Get session details
DELETE /api/sessions/:id            - Kill session
```

### Alerts
```
GET  /api/alerts                    - List alerts
POST /api/alerts                    - Create alert
PUT  /api/alerts/:id/acknowledge    - Acknowledge alert
DELETE /api/alerts/:id              - Delete alert
```

### MCPs (Model Context Protocol Servers)
```
GET  /api/mcps                      - List installed MCPs
POST /api/mcps/install              - Install an MCP
DELETE /api/mcps/:name              - Uninstall MCP
```

### AI
```
GET  /api/ai/status                 - AI provider availability
POST /api/ai/generate               - Generate text (Ollama/Claude)
GET  /api/ai/costs                  - Cost tracking
```

### Orchestrator
```
GET  /api/orchestrator/status       - Orchestrator state
POST /api/orchestrator/message      - Send command to orchestrator
POST /api/orchestrator/spawn        - Spawn Claude instance
```

### Tasks
```
GET  /api/tasks                     - List tasks
POST /api/tasks                     - Create task
GET  /api/tasks/:id                 - Get task details
PUT  /api/tasks/:id                 - Update task
```

### Messages (Agent Bus)
```
POST /api/messages/send             - Send direct message between agents
POST /api/messages/broadcast        - Broadcast to all agents
GET  /api/messages/stats            - Message statistics
GET  /api/messages/:agentId         - Get messages for an agent
POST /api/messages/:messageId/read  - Mark message as read
```

### Cross-Machine Relay
```
POST /api/relay/register            - Register a remote machine
POST /api/relay/send                - Send message to a machine
POST /api/relay/broadcast           - Broadcast to all machines
GET  /api/relay/machines            - List connected machines
GET  /api/relay/messages            - Message history
GET  /api/relay/poll/:machineId     - HTTP polling fallback
GET  /api/relay/stats               - Relay statistics
```

### Alive Repos
```
POST /api/repos/register            - Register a repo with hub
GET  /api/repos                     - List all alive repos
GET  /api/repos/stats               - Global repo statistics
GET  /api/repos/jobs/all            - All jobs across all repos
GET  /api/repos/find/:capability    - Find repos by capability
GET  /api/repos/:name               - Get repo details + recent jobs
GET  /api/repos/:name/state         - Get repo state
PUT  /api/repos/:name/state         - Update repo state (heartbeat)
POST /api/repos/:name/task          - Send a task to a repo
GET  /api/repos/:name/jobs          - Job history for a repo
GET  /api/repos/:name/jobs/:jobId   - Get specific job
PUT  /api/repos/:name/jobs/:jobId   - Update job status (repo reports back)
```

### Webhooks
```
POST /api/webhooks/register         - Register a webhook
DELETE /api/webhooks/:id            - Unregister webhook
PUT  /api/webhooks/:id/active       - Enable/disable webhook
GET  /api/webhooks                  - List all webhooks
GET  /api/webhooks/stats            - Webhook statistics
GET  /api/webhooks/deliveries       - Delivery history
POST /api/webhooks/incoming/:source - Receive external webhook (GitHub, Vercel, etc.)
GET  /api/webhooks/incoming         - View incoming webhook log
POST /api/webhooks/test/:id         - Test fire a webhook
```

### PubSub (MQTT-style)
```
POST /api/pubsub/publish            - Publish message to a topic
POST /api/pubsub/subscribe          - Subscribe to a topic (returns sub ID)
DELETE /api/pubsub/subscribe/:id    - Unsubscribe
GET  /api/pubsub/poll/:id           - Poll for messages on subscription
GET  /api/pubsub/topics             - List all active topics
GET  /api/pubsub/messages/*         - Get messages for a topic
GET  /api/pubsub/retained/*         - Get retained message for a topic
GET  /api/pubsub/subscriptions      - List all subscriptions
GET  /api/pubsub/stats              - PubSub statistics
```

### Other Routes
```
GET  /api/checkpoints               - State checkpoints
GET  /api/hooks                     - Lifecycle hooks
GET  /api/factory                   - Agent factory templates
GET  /api/doctor                    - Auto-healer status
GET  /api/delegation                - Delegation rules
```

---

## 6. THE ALIVE REPO SYSTEM

Every repo that's "alive" has a `.pia/` directory:

```
my-repo/
  .pia/
    identity.json           # WHO: name, capabilities, tech stack, hub connection
    state.json              # CURRENT: status (idle/working/error/offline), current task
    knowledge/              # BRAIN: everything the repo knows about itself
      agent-identity.md     #   Agent personality and rules
      readme-summary.md     #   Auto-extracted from README
      dependencies.md       #   Auto-extracted from package.json
      structure.md          #   Auto-generated directory tree
      custom/               #   Human-added knowledge docs
    jobs/
      history.jsonl         # MEMORY: every job ever executed (append-only log)
    queue/
      pending.json          # INBOX: tasks waiting to be executed
    hooks/
      on-task.md            # HOW: instructions for handling tasks
      on-health.md          # HOW: instructions for health checks
    log/                    # DIARY: daily activity logs
```

### identity.json Format
```json
{
  "name": "dao",
  "displayName": "DAO",
  "description": "Smart contracts and governance",
  "capabilities": ["smart-contracts", "deploy", "test", "governance"],
  "techStack": ["Solidity", "Hardhat", "TypeScript"],
  "hubUrl": "http://100.73.133.3:3000",
  "hubToken": "pia-local-dev-token-2024",
  "machineId": "machine-soda-yeti",
  "machineName": "soda-yeti",
  "port": 0,
  "acceptsTasksFrom": ["*"],
  "autoStart": true
}
```

### Job History Format (history.jsonl, one JSON per line)
```json
{"id":"abc123","action":"deploy","description":"Deploy to mainnet","requestedBy":"human","startedAt":1770891952752,"completedAt":1770891960000,"duration":7248,"status":"completed","result":"Deployed to 0x1234..."}
```

### Task Flow
```
1. Task arrives (via API, WebSocket, pubsub, or local queue)
2. Repo agent dequeues from .pia/queue/pending.json
3. Agent loads .pia/knowledge/* for context
4. Agent executes the task
5. Result logged to .pia/jobs/history.jsonl
6. State updated in .pia/state.json
7. Hub notified via PUT /api/repos/:name/jobs/:jobId
8. Webhooks fired, pubsub published to pia/:name/job/completed
```

---

## 7. EXISTING REPOS (as of 2026-02-12)

| Repo | Machine | Capabilities | Description |
|------|---------|-------------|-------------|
| **Wingspan** | izzit7 | presentations, passwords, docs, slides, credentials | Handles coding passwords and presentation decks |
| **DAO** | soda-yeti | smart-contracts, deploy, test, governance, tokenomics | Decentralized autonomous organization |
| **Farcake** | izzit7 | deploy, build, test, social, ai-generation | Farcaster social app with AI features |

---

## 8. SCRIPTS REFERENCE

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/init-repo.cjs` | Make any repo alive | `node init-repo.cjs --name dao --capabilities "deploy,test"` |
| `scripts/repo-agent.cjs` | Run alive agent in a repo | `node repo-agent.cjs` (run from repo with .pia/) |
| `scripts/remote-connect.cjs` | Interactive machine-to-machine chat | `node remote-connect.cjs --hub http://100.73.133.3:3000 --name "MyMachine"` |
| `scripts/start-tunnel.cmd` | Start ngrok tunnel | Double-click or `scripts\start-tunnel.cmd` |

---

## 9. SOURCE CODE MAP

```
src/
├── api/
│   ├── server.ts                 # Express server (19 route groups)
│   └── routes/
│       ├── agents.ts             # Agent CRUD
│       ├── ai.ts                 # AI routing + cost tracking
│       ├── alerts.ts             # Alert system
│       ├── checkpoints.ts        # State snapshots
│       ├── delegation.ts         # Task delegation rules
│       ├── doctor.ts             # Auto-healer
│       ├── factory.ts            # Agent factory templates
│       ├── hooks.ts              # Lifecycle hooks
│       ├── machines.ts           # Machine management
│       ├── mcps.ts               # MCP server management
│       ├── messages.ts           # Agent bus messaging
│       ├── orchestrator.ts       # Master Claude control
│       ├── pubsub.ts             # MQTT-style pub/sub API
│       ├── relay.ts              # Cross-machine relay API
│       ├── repos.ts              # Alive repos API
│       ├── sessions.ts           # Terminal/PTY sessions
│       ├── tasks.ts              # Task queue
│       └── webhooks.ts           # Webhook management API
├── comms/
│   ├── agent-bus.ts              # In-process inter-agent messaging
│   ├── cross-machine.ts          # Cross-machine relay (WebSocket + API)
│   ├── discord-bot.ts            # Discord bot (unused, code exists)
│   ├── mqtt-broker.ts            # MQTT-style pub/sub broker
│   ├── orchestrator.ts           # Master Claude orchestrator
│   ├── repo-router.ts            # Repo registry + task routing + job tracking
│   └── webhooks.ts               # Webhook manager (outgoing + incoming)
├── ai/
│   ├── ai-router.ts              # Cost-conscious AI routing (Ollama → Claude)
│   ├── cost-tracker.ts           # API cost tracking
│   ├── multi-model-panel.ts      # Gemini/OpenAI/Grok integrations
│   └── claude-client.ts          # Claude API client
├── orchestrator/
│   ├── task-queue.ts             # Priority task queue (SQLite-backed)
│   ├── execution-engine.ts       # Task execution
│   └── heartbeat.ts              # Machine heartbeat service
├── agents/
│   ├── agent-factory.ts          # Template-based agent creation
│   └── doctor.ts                 # Auto-healer for stuck agents
├── hub/
│   ├── aggregator.ts             # Hub-side machine/agent aggregation
│   └── alert-monitor.ts          # Alert monitoring
├── local/
│   ├── hub-client.ts             # Local machine → Hub WebSocket connection
│   └── service.ts                # PIA local service
├── tunnel/
│   ├── pty-wrapper.ts            # Terminal session management
│   └── websocket-server.ts       # WebSocket server (terminal + relay + pubsub)
├── db/
│   └── database.ts               # SQLite init + migrations
├── utils/
│   └── logger.ts                 # Logging utility
├── config.ts                     # Configuration from .env
└── index.ts                      # Main entry point

public/
├── index.html                    # Dashboard (11 views)
├── visor.html                    # Visor HUD (real-time messages, repos, jobs)
├── js/app.js                     # Dashboard JavaScript (~1200 lines)
├── css/styles.css                # Dashboard styles (~1500 lines)
├── manifest.json                 # PWA manifest
└── sw.js                         # Service worker

scripts/
├── init-repo.cjs                 # Initialize .pia/ in any repo
├── repo-agent.cjs                # Run alive agent in a repo
├── remote-connect.cjs            # Interactive machine-to-machine chat
└── start-tunnel.cmd              # Ngrok tunnel launcher
```

---

## 10. DASHBOARD VIEWS (at http://HUB:3000)

| View | Description |
|------|-------------|
| Fleet Matrix | Visual grid of all agents with status tiles |
| Command Center | Web chat with Orchestrator |
| CLI Tunnel | Terminal sessions via xterm.js |
| MCPs | Install/manage MCP servers |
| Hooks | Lifecycle hooks dashboard |
| Alerts | System notifications |
| AI Models | Cost tracking, provider status (Ollama, Gemini, OpenAI, Grok) |
| Tasks | Task queue management |
| Agent Bus | Inter-agent messaging |
| Doctor | Auto-healing stuck agents |
| Delegation | Task delegation rules |

Plus: **Visor** at `/visor.html` - real-time HUD for any machine.

---

## 11. VERIFICATION CHECKLIST

After setup, confirm everything works:

- [ ] `npm run build` succeeds
- [ ] `tailscale status` shows izzit7 (100.73.133.3) online
- [ ] `curl http://100.73.133.3:3000/api/health` returns `{"status":"ok"}`
- [ ] Machine registered: `curl http://100.73.133.3:3000/api/relay/machines` shows this machine
- [ ] At least one repo initialized: `.pia/identity.json` exists
- [ ] Repo agent running: `curl http://100.73.133.3:3000/api/repos` shows the repo
- [ ] Can send a task: `POST /api/repos/REPONAME/task` returns 201
- [ ] Can see jobs: `GET /api/repos/REPONAME/jobs` shows the task
- [ ] Visor loads: `http://100.73.133.3:3000/visor.html` shows repos and machines
- [ ] PubSub works: `POST /api/pubsub/publish` and `GET /api/pubsub/topics`
- [ ] Webhooks work: `POST /api/webhooks/register` returns 201

---

## 12. USER CONTEXT

- **User**: mic
- **Style**: Prefers ACTION over explanation. Wants to SEE things working. Values journaling.
- **OS**: Windows 11 Pro on all machines
- **GPU**: RTX 3070 Ti (8GB VRAM) on hub - runs qwen2.5-coder:7b via Ollama
- **Projects**: PIA (orchestration), DAO (smart contracts), Farcake (social app), Wingspan (presentations/credentials), and more
- **Goal**: Every repo alive, every machine connected, full visibility of all processes across all machines
- **Vision**: An n8n-like system where you can see task flows between repos, job execution timelines, and machine states in real-time

---

## 13. WHAT TO DO FIRST

1. Build the project (`npm install && npm run build`)
2. Verify Tailscale connectivity to 100.73.133.3
3. Register this machine with the hub
4. Ask the user which repos to make alive
5. Initialize each repo with `init-repo.cjs`
6. Start repo agents with `repo-agent.cjs`
7. Open the visor to confirm everything's connected
8. Send a test message: `POST /api/relay/broadcast` with `{"content":"Machine online!","type":"status"}`

---

*Complete specification generated by PIA Hub (izzit7) | 2026-02-12*
*This document should be read by any Claude instance joining the PIA network.*
*Also read: JOURNAL_2026-02-12.md for full session history and architectural decisions.*
