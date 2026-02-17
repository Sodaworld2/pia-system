# PIA Architecture — Single Source of Truth

**Read this before making ANY changes to PIA.**

## The Rules

1. There is ONE hub (Machine 1). It coordinates everything.
2. All other machines are workers (`PIA_MODE=local`). They connect TO the hub.
3. Workers are autonomous — they keep working even if the hub goes down.
4. The Cortex is an intelligence layer that reads hub state. It is NOT infrastructure.

## How It Works

```
                    ┌─────────────────────┐
                    │   DASHBOARD (you)    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   HUB (Machine 1)    │
                    │   PIA_MODE=hub       │
                    │                      │
                    │  • API server :3000   │
                    │  • WebSocket :3001    │
                    │  • Aggregator (DB)    │
                    │  • Dashboard HTML     │
                    │  • Cortex brain       │
                    └────┬────────────┬────┘
                         │            │
                    WebSocket    WebSocket
                         │            │
              ┌──────────▼──┐  ┌──────▼──────────┐
              │  WORKER      │  │  WORKER          │
              │  PIA_MODE=   │  │  PIA_MODE=       │
              │    local     │  │    local          │
              │              │  │                   │
              │  • HubClient │  │  • HubClient      │
              │  • Agents    │  │  • Agents         │
              │  • Reports   │  │  • Reports        │
              │    to hub    │  │    to hub          │
              └──────────────┘  └───────────────────┘
```

## Modes

| Mode | `PIA_MODE=` | What it does |
|---|---|---|
| Hub | `hub` | Runs dashboard, API, WebSocket server, aggregator, Cortex. Only ONE machine runs this. |
| Worker | `local` | Connects to hub via WebSocket. Takes commands. Spawns agents locally. Streams output back. |

**There is no `spoke` mode. The correct value for workers is `local`.**

## Worker `.env` Template

```
PIA_MODE=local
PIA_MACHINE_NAME=your-machine-name
PIA_HUB_URL=http://100.73.133.3:3000
PIA_SECRET_TOKEN=pia-fleet-token-2024
PORT=3000
WS_PORT=3001
```

## Hub `.env` Template

```
PIA_MODE=hub
PIA_MACHINE_NAME=izzit7
PIA_SECRET_TOKEN=pia-fleet-token-2024
PORT=3000
WS_PORT=3001
```

## How Registration Works

1. Worker starts with `PIA_MODE=local`
2. `src/local/service.ts` → calls `initHubClient()`
3. `src/local/hub-client.ts` → opens WebSocket to hub (converts `PIA_HUB_URL` from http:3000 to ws:3001)
4. Sends `machine:register` with machineId, name, hostname, capabilities
5. Hub `aggregator.ts` records the machine in SQLite
6. Hub `websocket-server.ts` tracks the WebSocket in `machineClients` map
7. Worker sends heartbeat every 30 seconds
8. Hub marks machine offline after 3 missed heartbeats

## How Remote Agent Spawn Works

1. Dashboard sends `POST /api/mc/agents { machineId: "xyz", prompt: "...", cwd: "..." }`
2. Hub checks: is machineId `local`? If yes, spawn locally. If no, continue:
3. Hub calls `sendToMachine(machineId, { type: 'command', action: 'spawn_agent', data: {...} })`
4. Worker receives command via WebSocket
5. Worker calls `AgentSessionManager.spawn()` locally
6. Worker registers agent with hub via `agent:register`
7. Worker streams output back via `agent:output` messages
8. Hub relays output to dashboard via `mc:output`

## What the Cortex Is

The Cortex is a **read-only intelligence layer** that sits on top of the hub. It:
- Reads machine status, agent activity, costs, errors, alerts
- Spots patterns and provides insights
- Does NOT make infrastructure decisions
- Does NOT replace the hub/worker architecture
- If the hub moves (failover), Cortex just points at the new hub

## What NOT To Do

- Do NOT set `PIA_MODE=hub` on worker machines
- Do NOT invent new modes (there is no `spoke` mode)
- Do NOT make workers connect to each other (no peer-to-peer)
- Do NOT put Cortex logic in the WebSocket plumbing
- Do NOT modify `dao-foundation-files/` (separate project)

## Future: Failover

Not built yet. When we add it:
- Workers keep working if hub dies (they are autonomous)
- A designated backup machine can become the new hub
- When the original hub returns, it re-syncs
- State that must survive: worker registration, auth keys, running job control
- State that can be lost temporarily: UI history, old logs, dashboards

## Current Fleet

| Machine | Hostname | Role | Tailscale IP |
|---|---|---|---|
| M1 | Izzit7 | Hub | 100.73.133.3 |
| M2 | SODA-MONSTER-HUNTER | Worker | 100.127.165.12 |
| M3 | SODA-YETI | Worker | 100.102.217.69 |

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point — routes to `startHub()` or `startLocal()` based on mode |
| `src/local/hub-client.ts` | Worker's WebSocket connection to hub + command handlers |
| `src/local/service.ts` | Worker's local agent management |
| `src/hub/aggregator.ts` | Hub's machine registry + heartbeat tracking |
| `src/tunnel/websocket-server.ts` | Hub's WebSocket server + machine targeting |
| `src/api/routes/mission-control.ts` | REST API for spawning/controlling agents |
| `src/config.ts` | All config options and env vars |
