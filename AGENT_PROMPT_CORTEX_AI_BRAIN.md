# Agent Prompt: Design "The Cortex" — PIA's Fleet Intelligence Brain

Copy and paste this entire prompt to give to a Claude agent.

---

## Your role

You are a **systems architect and product designer**. Your job is to design "The Cortex" — the AI intelligence layer that sits on top of all PIA machines and makes sense of everything happening across the fleet. This is an exploration and design session. Ask the user questions. Present options. Think big but stay practical.

## IMPORTANT: Parallel workstream awareness

Another agent is simultaneously working on getting **Machine 2 (soda-monster-hunter)** and **Machine 3 (soda-yeti)** set up with PIA. When they come online, they'll be the first real data sources for The Cortex. Design with this in mind — your architecture should be ready to receive data from those machines as soon as they're live.

The machines:
- **Machine 1** — izzit7 (`100.73.133.3`) — running PIA, the current main machine
- **Machine 2** — soda-monster-hunter (`100.127.165.12`) — being set up now
- **Machine 3** — soda-yeti (`100.102.217.69`) — being set up now

All connected via Tailscale mesh + local LAN (`192.168.0.x`).

## Context

PIA (Project Intelligence Agent) is a multi-machine system where each machine runs its own PIA instance. All machines are **equal peers** — no master, no slave. They communicate via a cross-machine relay system.

**Repository:** `https://github.com/Sodaworld2/pia-system.git`

### What already exists in PIA

| System | What it does | Data it produces |
|---|---|---|
| **Agent Sessions** (`src/mission-control/agent-session.ts`) | Spawns and manages Claude AI agents | Agent status, journals, tool usage, cost, errors, output |
| **Agent Bus** (`src/comms/agent-bus.ts`) | Agent-to-agent messaging (in-memory) | Message flow, communication patterns |
| **Cross-Machine Relay** (`src/comms/cross-machine.ts`) | Machine-to-machine communication | Messages, heartbeats, connection status, latency |
| **Machine Message Board** (`src/api/routes/machine-board.ts`) | Persistent machine messaging | Inbox/outbox, message types, read status |
| **PTY Wrapper** (`src/tunnel/pty-wrapper.ts`) | Local terminal control | Terminal output, command history, exit codes |
| **Doctor** (`src/api/routes/doctor.ts`) | Health checks | System health, dependency status, disk/memory |
| **Database** (`src/db/database.ts`) | SQLite per machine | Machines, agents, sessions, alerts, tasks, messages |
| **Security** (`src/security/network-sentinel.ts`) | Network monitoring | Blocked requests, rate limits, suspicious activity |
| **WhatsApp Bot** (`src/comms/whatsapp-bot.ts`) | WhatsApp integration | External messages, response times |
| **WebSocket Server** (`src/tunnel/websocket-server.ts`) | Real-time updates | Live event stream |

### The user's vision

> "An ecology of data coming from all the PIA applications on the machines. It should be clever and agile enough that I can pull the data into Vision Pro or view it on a tablet."

---

## What you need to design

### 1. The Data Ecology — What does The Cortex collect?

Design the data streams that flow from each machine into The Cortex. Think of every PIA machine as an organism sending vital signs.

**Per-machine telemetry:**
- System health (CPU, memory, disk, uptime)
- PIA server status (running, version, uptime, port)
- Active agents (count, status, what they're working on, cost so far)
- Terminal sessions (active PTYs, recent commands, output snippets)
- Error rate (last hour, last 24h, trending up/down?)
- Git status (current branch, commits ahead/behind, uncommitted changes)
- Network (connected peers, relay latency, messages sent/received)
- Database size, record counts

**Cross-machine patterns:**
- Which machines are in sync (same git commit)?
- Which machines are drifting (different versions, different configs)?
- Message flow between machines (who talks to who, how often)
- Workload distribution (which machine is busiest?)
- Agent delegation patterns (which machine spawns agents for what?)

**Temporal patterns:**
- Activity over time (when are machines busiest?)
- Error spikes (did something break across all machines at once?)
- Cost accumulation (total spend per machine per day)
- Task completion rates

### 2. The Intelligence Layer — What does The Cortex think?

The Cortex isn't just a dashboard — it's an AI that THINKS about the data.

**Observations** (what it notices):
- "Machine 2 hasn't pulled from git in 3 hours. Machine 1 has 5 new commits."
- "Agent on Machine 3 has been stuck for 10 minutes."
- "Error rate on Machine 1 spiked 300% in the last hour."
- "Machine 2 is idle. Machine 1 has 4 queued tasks."

**Suggestions** (what it recommends):
- "Machine 2 should git pull to stay in sync."
- "Restart the stuck agent on Machine 3 or reassign to Machine 1."
- "Investigate the error spike — started when deploy-agent ran."
- "Move 2 tasks from Machine 1 to Machine 2 to balance load."

**Actions** (what it can do, with permission):
- Send a `command` message via relay: "git pull && npm run build"
- Restart a stuck agent
- Rebalance workload between machines
- Alert the user via WhatsApp: "Machine 3 is down, last seen 5 min ago"

### 3. The Data Surface — How do you view The Cortex?

The Cortex data needs to be **surface-agnostic** — viewable on any device:

**Design a universal data API:**
```
GET /api/cortex/overview        — fleet-wide summary
GET /api/cortex/machine/:id     — deep dive on one machine
GET /api/cortex/timeline        — activity over time
GET /api/cortex/alerts          — active alerts/suggestions
GET /api/cortex/insights        — AI-generated observations
GET /api/cortex/health          — system-wide health score
GET /api/cortex/sync-status     — git/version sync across machines
GET /api/cortex/workload        — load distribution
```

**Viewing surfaces:**
| Surface | How it works | Data format |
|---|---|---|
| **Mission Control (browser)** | Already exists, add Cortex tab | HTML + WebSocket |
| **Vision Pro** | Spatial panels floating in 3D | WebXR + JSON API |
| **Tablet / Phone** | Responsive web dashboard | JSON API + responsive CSS |
| **WhatsApp** | Text summaries on demand | "How's the fleet?" → text response |
| **Watch / Notification** | Push alerts for critical issues | Push API |
| **Terminal / CLI** | `pia cortex status` command | Formatted text |

The key insight: **The Cortex is a JSON API.** Every surface just consumes the same API and renders it differently. The data is the same — only the presentation changes.

### 4. Where does The Cortex run?

Options to consider:

**Option A: On one machine (simple)**
- One PIA instance is the "Cortex host" — it pulls data from all others
- Pros: Simple, single database
- Cons: If that machine goes down, no intelligence

**Option B: Distributed (resilient)**
- Every machine runs a partial Cortex — collects its own data locally
- Any machine can serve the full view by pulling from peers on demand
- Pros: No single point of failure, matches the "all equal" philosophy
- Cons: More complex queries across machines

**Option C: Separate service (dedicated)**
- The Cortex runs as its own lightweight service (could be on any machine or in the cloud)
- It subscribes to all machines' WebSocket streams and collects telemetry
- Pros: Clean separation, doesn't burden any one machine
- Cons: Extra service to maintain

**Recommend one and explain why.**

### 5. The AI Engine — What powers The Cortex's brain?

The Cortex needs to actually think — not just collect data. Options:

- **Ollama (local LLM)** — runs on one machine, analyzes data locally, no API costs
- **Claude API** — more capable reasoning, but costs money per analysis
- **Rule-based first, AI later** — start with simple rules ("if error rate > X, alert"), add LLM analysis later
- **Hybrid** — rules for urgent stuff (instant), LLM for insights (periodic)

Consider:
- How often should The Cortex "think"? Every minute? Every 5 minutes? On-demand?
- Should it proactively alert, or only respond when asked?
- What's the cost model? (If using Claude API, each analysis costs tokens)
- Can it learn from past patterns? (e.g., "last time this error happened, restarting fixed it")

### 6. Vision Pro / Tablet Experience

This is the user's big vision — pulling Cortex data into spatial computing.

**Vision Pro experience:**
- Each machine is a floating card/panel in 3D space
- Health = color (green/yellow/red)
- Active agents shown as smaller particles orbiting the machine
- Data flows between machines shown as glowing lines
- Pinch a machine to expand its details
- Voice: "Hey PIA, how's Machine 2 doing?"
- Pin important metrics to your wall

**Tablet experience:**
- Grid of machine cards (like a security camera wall)
- Tap to drill into one machine
- Swipe between machines
- Pull-to-refresh
- Push notifications for alerts

**Design the JSON API structure** that would power both of these surfaces. The same data, different renderers.

---

## Questions to explore with the user

1. **What matters most?** Is it knowing when something breaks? Or optimizing performance? Or keeping machines in sync?

2. **How hands-on vs autonomous?** Should The Cortex just observe and report? Or should it take action automatically (restart agents, send git pull commands)?

3. **Cost sensitivity?** Using Claude API for analysis is powerful but costs money. Is that OK, or should we lean on Ollama/rules?

4. **Real-time vs periodic?** Does the user want a live-updating dashboard, or is a summary every 5 minutes enough?

5. **What's the first thing you'd want to see** when you put on Vision Pro and look at your fleet?

---

## Deliverables

After your exploration, produce:

1. **Architecture diagram** (text-based) showing data flow from machines → Cortex → surfaces
2. **API specification** for the Cortex endpoints
3. **Data schema** for what gets collected and stored
4. **Phase 1 plan** — minimum viable Cortex (what to build first)
5. **Phase 2 plan** — full intelligence layer
6. **Phase 3 plan** — Vision Pro / spatial experience

---

## CRITICAL DESIGN PRINCIPLE: The Brain Gets Fat, Not the Repo

The git repositories must stay lean. Code only. The Cortex's memory/knowledge/learned data lives SEPARATELY from the codebase.

**The repo = the skeleton** (code, config, structure)
**The brain = the memory** (telemetry, patterns, learned insights, history)

Design it so:
- Telemetry data goes into a **separate database** (not the main PIA SQLite)
- Or a dedicated `data/cortex/` directory that is `.gitignore`'d
- Historical patterns, learned insights, AI analysis results — all stored in the brain DB
- The brain can grow to gigabytes without affecting git clone time
- Each machine has its own local brain data
- The Cortex can aggregate brain data from all machines on demand
- Old data can be compressed/archived without losing the learned patterns

Think about:
- **Hot data** (last 24h) — fast access, full detail
- **Warm data** (last 30 days) — summarized, key metrics only
- **Cold data** (older) — compressed archives, only accessed on request
- **Learned patterns** — permanent, small footprint (rules extracted from data, not raw data)

The brain should be like human memory — you don't remember every detail of every day, but you remember the important patterns and lessons.

---

## CRITICAL: Systems already built that ARE The Cortex's foundation

PIA already has massive infrastructure you MUST read and build on top of. DO NOT rebuild these — extend them.

### Memory & Intelligence (the brain already exists)
| File | What it does | Cortex use |
|---|---|---|
| `src/souls/soul-engine.ts` | Persistent agent personality, memory, goals, relationships | Agent memory IS Cortex memory |
| `src/souls/memory-manager.ts` | Categorized memories (experience, decision, learning, observation), importance scoring, summarization, pruning of old memories | **Already implements "brain gets fat" pattern** — use this for Cortex data storage |
| `src/souls/seed-souls.ts` | Pre-built agent personalities | Template for Cortex personality |

### Orchestration (the execution loop already exists)
| File | What it does | Cortex use |
|---|---|---|
| `src/orchestrator/execution-engine.ts` | Task queue → AI route → execute → track cost → notify | The main work loop to observe |
| `src/orchestrator/autonomous-worker.ts` | Claude API tool loop — receives task, runs tools locally, no prompts | **This IS remote command execution** — the missing piece we discussed |
| `src/orchestrator/task-queue.ts` | Task queue with priority and dequeue | Workload data source |
| `src/orchestrator/heartbeat.ts` | Heartbeat monitoring | Machine liveness |

### Communication (the transport layer already exists)
| File | What it does | Cortex use |
|---|---|---|
| `src/comms/mqtt-broker.ts` | Pub/sub with topics (`pia/machine/event`), wildcards, retained messages | **Perfect telemetry transport** — machines publish, Cortex subscribes |
| `src/comms/repo-router.ts` | Registry of repos across machines, route tasks by capability | Cross-machine task routing |
| `src/comms/cross-machine.ts` | Machine-to-machine relay (WebSocket, Tailscale, ngrok, Discord, API) | Data transport |
| `src/comms/agent-bus.ts` | Agent-to-agent messaging | Agent activity data |
| `src/comms/discord-bot.ts` | Discord integration | Another Cortex surface |
| `src/comms/whatsapp-bot.ts` | WhatsApp integration | Another Cortex surface |
| `src/comms/webhooks.ts` | Webhook system | External notifications |

### AI & Cost (multi-model support already exists)
| File | What it does | Cortex use |
|---|---|---|
| `src/ai/ai-router.ts` | Routes to Claude, Ollama, OpenAI, Gemini, Grok | Cortex brain engine options |
| `src/ai/cost-tracker.ts` | Tracks spend per model/agent | Budget intelligence |
| `src/agents/cost-router.ts` | Routes to cheapest/best model for task | Cost optimization data |
| `src/agents/doctor.ts` | System health checks | Health telemetry |
| `src/agents/agent-factory.ts` | Create agents with capabilities | Agent spawning data |

### Existing UI
| File | What it does |
|---|---|
| `FLEET_DASHBOARD_MOCKUP.html` | Already designed fleet dashboard UI |
| `public/mission-control.html` | Live Mission Control with agents, terminals, messages |
| `public/visor.html` | Visor panel |

### Key files to also read
| File | Why |
|---|---|
| `src/db/database.ts` | All database tables — what data already exists |
| `src/api/server.ts` | All API routes — understand the full API surface |
| `SESSION_JOURNAL_2026-02-16.md` | Full session history — understand everything built |
| `CLAUDE.md` | Project overview and conventions |

---
