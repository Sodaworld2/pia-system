# Agent Prompt: Deploy PIA Fleet — Get Machine 2 & Machine 3 Running

Copy and paste this entire prompt to give to a Claude agent.

---

## Your role

You are a **deployment engineer**. Your job is to get PIA running on Machine 2 and Machine 3, verify they can communicate with Machine 1, and confirm the fleet is operational. Be methodical, test everything, report status.

## IMPORTANT: Parallel workstream awareness

Another agent is simultaneously designing **"The Cortex"** — PIA's Fleet Intelligence Brain. The Cortex will collect telemetry from all machines and provide AI-powered insights. When you get these machines online, they become the first real data sources for The Cortex. Make sure:
- Each machine's PIA is accessible via its Tailscale IP
- The relay system is working (machines can send messages to each other)
- The machine message board endpoints are functional
- Health/status endpoints respond correctly
- All machines are on the same git commit

The Cortex agent needs working machines to design against. You're building the body, they're designing the brain.

**Key discovery:** PIA already has an **Autonomous Worker** (`src/orchestrator/autonomous-worker.ts`) that can receive tasks and run them locally in a Claude API tool loop. It also has an **MQTT pub/sub broker** (`src/comms/mqtt-broker.ts`) for topic-based messaging, a **Repo Router** (`src/comms/repo-router.ts`) for cross-machine task routing, a **Soul Engine** (`src/souls/soul-engine.ts`) for persistent agent memory, and a **Memory Manager** (`src/souls/memory-manager.ts`) for categorized memories with importance scoring and summarization. These systems exist but need to be activated and wired up across the fleet.

---

## The fleet

| Machine | Hostname | Tailscale IP | LAN IP | Status |
|---|---|---|---|---|
| Machine 1 | izzit7 | `100.73.133.3` | `192.168.0.2` | Running PIA |
| Machine 2 | soda-monster-hunter | `100.127.165.12` | `192.168.0.4` | Online, needs PIA |
| Machine 3 | soda-yeti | `100.102.217.69` | `192.168.0.6` | Online, needs PIA |

All machines are Windows, connected via Tailscale mesh AND local LAN.
All machines are **equal peers** — no hub, no master. Every machine runs `PIA_MODE=hub`.

**Repository:** `https://github.com/Sodaworld2/pia-system.git`

---

## Step-by-step deployment

### Phase 1: Machine 2 (soda-monster-hunter)

**1.1 — Clone and install**
```bash
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system
npm install
```

If `npm install` fails on native modules (node-pty, better-sqlite3), install build tools:
```bash
npm install --global windows-build-tools
```
Or install Visual Studio Build Tools manually.

**1.2 — Create .env**
Create a `.env` file in the project root:
```env
# PIA Configuration — Machine 2 (soda-monster-hunter)

PIA_MODE=hub
PIA_PORT=3000
PIA_HOST=0.0.0.0
PIA_WS_PORT=3001

PIA_SECRET_TOKEN=pia-local-dev-token-2024
PIA_JWT_SECRET=pia-jwt-secret-2024

PIA_HUB_URL=http://100.73.133.3:3000
PIA_MACHINE_NAME=soda-monster-hunter

PIA_AI_PRIMARY=ollama
PIA_AI_FALLBACK=none
PIA_OLLAMA_URL=http://localhost:11434
PIA_OLLAMA_MODEL=qwen2.5-coder:7b

PIA_DB_PATH=./data/pia.db

PIA_ENABLE_AUTO_HEALER=true
PIA_ENABLE_PUSH_NOTIFICATIONS=true
PIA_LOG_LEVEL=info
```

NOTE: Set `PIA_AI_FALLBACK=none` unless this machine has an Anthropic API key. If the user provides a key, set `PIA_AI_FALLBACK=claude` and add `ANTHROPIC_API_KEY=...`.

**1.3 — Build and start**
```bash
npm run build
npm run dev
```

**1.4 — Verify**
```bash
# Dashboard loads
curl http://localhost:3000

# API responds
curl http://localhost:3000/api/machines

# Machine message board works
curl http://localhost:3000/api/machine-board/stats

# Relay works
curl http://localhost:3000/api/relay/stats
```

**1.5 — Test connectivity FROM Machine 1**
From Machine 1, these should work:
```bash
curl http://100.127.165.12:3000/api/machines
curl http://100.127.165.12:3000/api/relay/stats
```

If they don't, check Windows Firewall on Machine 2 — port 3000 needs to be open for inbound TCP.

**1.6 — Register with the fleet**
From Machine 2, register with Machine 1:
```bash
curl -X POST http://100.73.133.3:3000/api/relay/register \
  -H "Content-Type: application/json" \
  -d '{"id": "soda-monster-hunter", "name": "soda-monster-hunter", "hostname": "soda-monster-hunter", "tailscaleIp": "100.127.165.12", "channels": ["api", "websocket", "tailscale"]}'
```

From Machine 1 (or tell the user to run this), register Machine 2:
```bash
curl -X POST http://100.127.165.12:3000/api/relay/register \
  -H "Content-Type: application/json" \
  -d '{"id": "izzit7", "name": "izzit7", "hostname": "izzit7", "tailscaleIp": "100.73.133.3", "channels": ["api", "websocket", "tailscale"]}'
```

**1.7 — Test message board**
Send a message from Machine 2 to Machine 1:
```bash
curl -X POST http://localhost:3000/api/machine-board/send \
  -H "Content-Type: application/json" \
  -d '{"to": "izzit7", "content": "Machine 2 is online and reporting for duty!", "type": "status"}'
```

---

### Phase 2: Machine 3 (soda-yeti)

Repeat Phase 1 with these differences:

**.env for Machine 3:**
```env
# PIA Configuration — Machine 3 (soda-yeti)

PIA_MODE=hub
PIA_PORT=3000
PIA_HOST=0.0.0.0
PIA_WS_PORT=3001

PIA_SECRET_TOKEN=pia-local-dev-token-2024
PIA_JWT_SECRET=pia-jwt-secret-2024

PIA_HUB_URL=http://100.73.133.3:3000
PIA_MACHINE_NAME=soda-yeti

PIA_AI_PRIMARY=ollama
PIA_AI_FALLBACK=none
PIA_OLLAMA_URL=http://localhost:11434
PIA_OLLAMA_MODEL=qwen2.5-coder:7b

PIA_DB_PATH=./data/pia.db

PIA_ENABLE_AUTO_HEALER=true
PIA_ENABLE_PUSH_NOTIFICATIONS=true
PIA_LOG_LEVEL=info
```

Register Machine 3 with Machine 1 AND Machine 2:
```bash
# Machine 3 tells Machine 1 about itself
curl -X POST http://100.73.133.3:3000/api/relay/register \
  -H "Content-Type: application/json" \
  -d '{"id": "soda-yeti", "name": "soda-yeti", "hostname": "soda-yeti", "tailscaleIp": "100.102.217.69", "channels": ["api", "websocket", "tailscale"]}'

# Machine 3 tells Machine 2 about itself
curl -X POST http://100.127.165.12:3000/api/relay/register \
  -H "Content-Type: application/json" \
  -d '{"id": "soda-yeti", "name": "soda-yeti", "hostname": "soda-yeti", "tailscaleIp": "100.102.217.69", "channels": ["api", "websocket", "tailscale"]}'
```

And register the other machines on Machine 3:
```bash
# Tell Machine 3 about Machine 1
curl -X POST http://localhost:3000/api/relay/register \
  -H "Content-Type: application/json" \
  -d '{"id": "izzit7", "name": "izzit7", "hostname": "izzit7", "tailscaleIp": "100.73.133.3", "channels": ["api", "websocket", "tailscale"]}'

# Tell Machine 3 about Machine 2
curl -X POST http://localhost:3000/api/relay/register \
  -H "Content-Type: application/json" \
  -d '{"id": "soda-monster-hunter", "name": "soda-monster-hunter", "hostname": "soda-monster-hunter", "tailscaleIp": "100.127.165.12", "channels": ["api", "websocket", "tailscale"]}'
```

---

### Phase 3: Machine 3 DAO Recovery (AFTER PIA is running)

Machine 3 (soda-yeti) previously had the SodaWorld DAO project. Read `AGENT_PROMPT_MACHINE_3_DAO_RECOVERY.md` in the repo for full instructions on:
- Finding existing DAO files on the machine
- Comparing with the copy in PIA's `dao-foundation-files/` directory
- Setting up the DAO as its own GitHub repo

**Do this AFTER PIA is fully running and tested on Machine 3.**

---

### Phase 4: Fleet verification

Once all machines are running, verify the full mesh:

**From Machine 1:**
```bash
# Can reach Machine 2
curl http://100.127.165.12:3000/api/relay/stats
# Can reach Machine 3
curl http://100.102.217.69:3000/api/relay/stats
```

**From Machine 2:**
```bash
# Can reach Machine 1
curl http://100.73.133.3:3000/api/relay/stats
# Can reach Machine 3
curl http://100.102.217.69:3000/api/relay/stats
```

**From Machine 3:**
```bash
# Can reach Machine 1
curl http://100.73.133.3:3000/api/relay/stats
# Can reach Machine 2
curl http://100.127.165.12:3000/api/relay/stats
```

**Message round-trip test:**
Send a message from each machine to every other machine and verify delivery.

**Git sync check:**
All three machines should be on the same git commit:
```bash
git log --oneline -1
```

---

### Phase 5: Firewall setup (if connections fail)

Windows Firewall will likely block incoming connections. On EACH machine, run in PowerShell as Administrator:

```powershell
# Allow PIA API server
New-NetFirewallRule -DisplayName "PIA API" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow

# Allow PIA WebSocket
New-NetFirewallRule -DisplayName "PIA WebSocket" -Direction Inbound -Port 3001 -Protocol TCP -Action Allow
```

---

## Status report format

When done, report back with:

```
FLEET STATUS REPORT
==================
Machine 1 (izzit7)           - [RUNNING/DOWN] - git: [commit hash]
Machine 2 (soda-monster-hunter) - [RUNNING/DOWN] - git: [commit hash]
Machine 3 (soda-yeti)        - [RUNNING/DOWN] - git: [commit hash]

Connectivity:
  M1 → M2: [OK/FAIL]
  M1 → M3: [OK/FAIL]
  M2 → M1: [OK/FAIL]
  M2 → M3: [OK/FAIL]
  M3 → M1: [OK/FAIL]
  M3 → M2: [OK/FAIL]

Message Board:
  M1 → M2: [DELIVERED/FAIL]
  M2 → M1: [DELIVERED/FAIL]
  M3 → M1: [DELIVERED/FAIL]

Issues:
  - [any problems encountered]

DAO Recovery (Machine 3):
  - [status]
```

---

## Troubleshooting

- **npm install fails on node-pty:** Need Visual Studio Build Tools + Python 3
- **Port 3000 in use:** Change `PIA_PORT` in `.env`
- **Can't reach other machines:** Windows Firewall (see Phase 5)
- **Relay register fails:** Target machine's PIA must be running first
- **TypeScript build errors from dao-foundation-files/:** These are expected — the DAO files are excluded in tsconfig, ignore them
- **better-sqlite3 errors:** May need `npm rebuild better-sqlite3`

---
