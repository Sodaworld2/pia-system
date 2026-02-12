# Three-Machine Orchestration: Full Simulation

What it looks like when all 3 machines are running PIA and communicating.

---

## Phase 1: Startup Sequence

### Machine #1 (izzit7 - Hub) starts first
```
[14:00:00] ==================================================
[14:00:00]   PIA - Project Intelligence Agent
[14:00:00] ==================================================
[14:00:00] Mode: HUB
[14:00:01] Initializing database... OK
[14:00:01] Starting Network Sentinel... OK
[14:00:01] Starting API server... OK (port 3000)
[14:00:01] Starting WebSocket server... OK (port 3001)
[14:00:01] Starting Cross-Machine Relay... OK
[14:00:02] Starting Hub Aggregator... OK
[14:00:02] Starting Alert Monitor... OK
[14:00:02] ==================================================
[14:00:02]   PIA Hub is ready!
[14:00:02]   Visor: http://localhost:3000/visor.html
[14:00:02]   Waiting for machines to connect...
[14:00:02] ==================================================
[14:00:02] Visor opened in default browser
```

### Machine #3 (soda-yeti - Spoke) starts
```
[14:01:00] ==================================================
[14:01:00]   PIA - Project Intelligence Agent
[14:01:00] ==================================================
[14:01:00] Mode: LOCAL
[14:01:01] Connecting to hub at http://100.73.133.3:3000...
[14:01:01] Hub connection: OK
[14:01:01] Registering with hub as "soda-yeti"...
[14:01:01] Visor opened in default browser
```

### Machine #2 (new - Spoke) starts
```
[14:02:00] ==================================================
[14:02:00]   PIA - Project Intelligence Agent
[14:02:00] ==================================================
[14:02:00] Mode: LOCAL
[14:02:01] Connecting to hub at http://100.73.133.3:3000...
[14:02:01] Hub connection: OK
[14:02:01] Registering with hub as "machine-2"...
[14:02:01] Visor opened in default browser
```

---

## Phase 2: All Machines Online - What the Visor Shows

### Hub Visor (Machine #1) Stats Bar:
```
┌──────────────────────────────────────────────────────────────────────┐
│ Repos: 0  Machines: 3  Jobs: 0  Queued: 0  Done: 0  Messages: 0   │
│ Agents: 0  PubSub: 0  Webhooks: 0  Tracked IPs: 3  Blocked: 0    │
└──────────────────────────────────────────────────────────────────────┘
```

### Chat Tab:
```
┌─ Send to: [All Machines (Broadcast) ▼] ─────────────────────────────┐
│                                                                      │
│  [14:01:01] soda-yeti connected                              status │
│  [14:02:01] machine-2 connected                              status │
│  [14:02:15] Machine #3: Soda-yeti updated and online!          chat │
│  [14:02:20] Machine #2: Machine #2 is online and ready!       chat │
│                                                                      │
│  ┌──────────────────────────────────────┐ ┌──────┐                  │
│  │ Type a message...                    │ │ Send │                  │
│  └──────────────────────────────────────┘ └──────┘                  │
│                                                                      │
│  ┌─ Machines ─────────────┐                                         │
│  │ izzit7 (Hub)     0s    │                                         │
│  │ soda-yeti        2s    │                                         │
│  │ machine-2        5s    │                                         │
│  └────────────────────────┘                                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Network Tab:
```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│   │  [H] izzit7 │─────│ [M] machine │─────│ [M] soda-   │          │
│   │  100.73.     │ 2s  │    -2       │ 3s  │    yeti     │          │
│   │  133.3       │     │  100.x.y.z  │     │ 100.102.    │          │
│   └─────────────┘     └─────────────┘     │  217.69     │          │
│                                            └─────────────┘          │
│                                                                      │
│  Cross-Machine Relay: 5 messages, 3 machines                        │
│  PubSub: 0 topics                                                   │
│  Webhooks: 0 hooks                                                  │
│  WebSocket: Connected                                               │
│  Tailscale VPN: 3 machines                                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase 3: Sending Work to Machines

### User types in Visor Chat (Machine #1):
```
You (broadcast): "All machines: pull latest code from github, run build, report status"
```

### This triggers on all machines via HTTP delivery:
```
Machine #1 → POST http://100.102.217.69:3000/api/relay/incoming  (soda-yeti)
Machine #1 → POST http://100.x.y.z:3000/api/relay/incoming      (machine-2)
```

### Each machine's Claude session sees the message and can act on it.

---

## Phase 4: Real Project Work

### Example: Building DAO project across machines

```
Hub Chat:
├── You: "Machine #2: clone DAO repo and start building the smart contracts"
├── You: "Machine #3: clone Farcake repo and build the frontend"
├── Machine #2: "DAO repo cloned. Starting Solidity compiler..."
├── Machine #3: "Farcake repo cloned. Running npm install..."
├── Machine #2: "Smart contracts compiled. 3 contracts, 0 errors."
├── Machine #3: "Frontend build complete. Starting dev server on port 5173."
└── You: "Good. Machine #2: run tests. Machine #3: take screenshot of frontend."
```

---

## POTENTIAL ISSUES (Devils Advocate)

### Issue 1: Message Delivery When Machine Is Offline
```
PROBLEM: If Machine #3 is powered off, HTTP delivery fails silently.
         Messages are stored on Hub but Machine #3 never gets them.

IMPACT:  Medium. Machine misses instructions.

CURRENT: Messages log "HTTP delivery failed" and store for polling.
         But no one polls if the machine is off.

FIX:     Need a message queue with retry. When machine comes back online,
         it should pull all missed messages since last seen.

WORKAROUND: Machine checks /api/relay/poll/{machineId} on startup.
```

### Issue 2: No Auto-Registration on Startup
```
PROBLEM: Every time a machine restarts, it needs to manually re-register
         with the hub AND register the hub on its own relay.

IMPACT:  High. Every restart breaks messaging until manual curl commands.

FIX:     Add auto-registration to src/local/service.ts:
         - On startup, POST to hub's /api/relay/register
         - Also register hub on local relay
         - Retry every 30s if hub is unreachable

STATUS:  NOT YET BUILT - needs implementing
```

### Issue 3: No Authentication Between Machines
```
PROBLEM: Any machine on the Tailscale network can POST to /api/relay/incoming
         using the shared token. No per-machine authentication.

IMPACT:  Low (Tailscale is already encrypted and authenticated).
         Medium if we add more machines or untrusted devices.

FIX:     Each machine gets its own token. Hub validates machine ID + token pair.

STATUS:  Not critical yet - Tailscale VPN handles trust.
```

### Issue 4: Single Point of Failure (Hub)
```
PROBLEM: If Machine #1 (hub) goes down, Machine #2 and #3 can't communicate
         through the hub. They CAN still talk directly via Tailscale IPs.

IMPACT:  High. No dashboard, no aggregation, no central view.

FIX:     Hub failover - Machine #3 (most powerful after hub) becomes backup hub.
         Or: peer-to-peer mode where machines talk directly.

STATUS:  Future work. For now, hub must stay up.
```

### Issue 5: Message History Lost on Restart
```
PROBLEM: CrossMachineRelay stores messages in memory (array).
         When server restarts, all message history is lost.

IMPACT:  Medium. Can't see previous conversations after restart.

FIX:     Store messages in SQLite (already have DB).
         Load message history from DB on startup.

STATUS:  NOT YET BUILT - needs implementing
```

### Issue 6: No Real-Time Push (Only Polling)
```
PROBLEM: Chat tab polls every 3 seconds for new messages.
         That's a 0-3 second delay on every message.

IMPACT:  Low. 3 seconds is acceptable for machine orchestration.

FIX:     WebSocket subscription for real-time message push.
         Already have WS server, just need to wire relay messages to WS.

STATUS:  Partially built (WS exists, relay subscription exists, not wired to browser)
```

### Issue 7: Claude Sessions Don't Auto-Read Messages
```
PROBLEM: Messages arrive at a machine's PIA API, but the Claude Code
         session running on that machine doesn't automatically see them.
         Someone has to ask Claude to check messages.

IMPACT:  High. This is the gap between "messaging works" and "orchestration works".

FIX:     Claude hooks could poll for new messages and inject them into context.
         Or: a watcher process that alerts Claude sessions of new messages.

STATUS:  NOT YET BUILT - this is the KEY missing piece for true orchestration
```

### Issue 8: No Task Delegation
```
PROBLEM: Sending "Machine #2: build DAO" as a chat message relies on a human
         reading it and telling Claude what to do. No automated task routing.

IMPACT:  High for automation, low for manual control.

FIX:     Use the existing task/delegation system:
         - POST /api/delegation/rules to set up routing
         - POST /api/tasks to create tasks
         - Machines poll for assigned tasks and execute

STATUS:  Routes exist but not wired to actual execution
```

---

## Priority Fix Order

1. **Auto-registration on startup** (Issue #2) - Highest impact, easy fix
2. **Message persistence in SQLite** (Issue #5) - Important for continuity
3. **Missed message catch-up on reconnect** (Issue #1) - Reliability
4. **Claude session message injection** (Issue #7) - Key for automation
5. **WebSocket real-time push** (Issue #6) - Nice to have
6. **Task delegation wiring** (Issue #8) - Full automation

---

## What Works RIGHT NOW

| Feature | Status | Notes |
|---------|--------|-------|
| Machine #1 ↔ Machine #3 messaging | WORKS | Via HTTP + Tailscale |
| Machine #1 ↔ Machine #2 messaging | WORKS | Once Machine #2 is online |
| Visor Chat tab | WORKS | Send/receive with machine selector |
| Visor message history | WORKS | Loads on tab open, polls every 3s |
| Network topology view | WORKS | Shows all machines + connection status |
| Security monitoring | WORKS | Tracks IPs, detects threats |
| Desktop Electron app | WORKS | System tray, auto-start server |
| Cross-machine HTTP delivery | WORKS | New /api/relay/incoming endpoint |
| Machine registration | MANUAL | Must run curl commands |
| Message persistence | NO | Lost on restart |
| Auto-registration | NO | Must manually register |
| Claude reads messages | NO | Must manually check |
| Task routing | NO | Routes exist, not wired |
