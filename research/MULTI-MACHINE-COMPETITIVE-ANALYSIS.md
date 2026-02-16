# Multi-Machine Agent Orchestration — Competitive Analysis
## Compiled 2026-02-15 | PIA Mission Control

---

## The Hard Truth

**Almost nobody has solved true multi-machine agent orchestration.** The landscape is dominated by single-machine solutions. Only 3 projects genuinely cross machine boundaries:

1. **Warp Oz** — Cloud VMs behind a platform API
2. **Agentrooms** — HTTP REST to remote agent endpoints (simplest, works)
3. **GitHub gh-aw** — Actions VMs with layered security

---

## Architecture Comparison Matrix

| Project | Multi-Machine? | Architecture | Protocol | Auth | Status |
|---------|---------------|--------------|----------|------|--------|
| **Warp Oz** | Yes (cloud VMs) | Centralized hub | REST API | RBAC + secrets | Production |
| **Claude Flow** | No (single machine) | Hierarchical swarm | MCP + SQLite | Claude CLI | Open source |
| **Claude Swarm** | No (single machine) | Orchestrator-worker | Subprocess IPC | N/A | Hackathon |
| **Agentrooms** | Yes (HTTP to remote) | Hub + HTTP agents | REST | Claude CLI OAuth | Open source |
| **GitHub gh-aw** | Yes (Actions VMs) | Isolated VMs | Actions workflow | GitHub RBAC | Tech preview |
| **Anthropic Teams** | No (single machine) | Lead + teammates | Filesystem IPC | Inherited | Experimental |
| **OpenClaw** | No (remote UI only) | Gateway-skills | Messaging APIs | Platform OAuth | Open source |
| **AgentRails** | Delegates to n8n | Dashboard | n8n API | API keys | Open source |

---

## Project Deep Dives

### 1. Warp Oz (DIRECT COMPETITOR — HIGH THREAT)
- **URL:** https://www.warp.dev/oz
- **Launched:** Feb 10, 2026
- Three-tier: Agent Management → Resource Management → Integration Layer
- Each agent runs in a Docker container with cloned git repos
- REST API + CLI, TypeScript/Python SDKs
- **Why cloud VMs:** "Unlimited parallel agents" without SSH/Docker complexity
- **No agent-to-agent communication** — each agent is an isolated worker
- **Key insight:** They optimized for observability over agent autonomy

### 2. Claude Flow (60+ agents, swarm intelligence)
- **URL:** https://github.com/ruvnet/claude-flow
- 3 Queen Types (Strategic, Tactical, Adaptive) + 8 Worker Types
- 5 consensus algorithms: Raft, BFT, Gossip, CRDT, Weighted Voting
- **Reality check:** Despite distributed terminology, it's **single-machine SQLite**
- MCP integration path — plugs into Claude Code sessions
- **Max 6-8 agents recommended** — coordination costs scale superlinearly
- 60+ stars, ambitious architecture, implementation gap

### 3. Claude Swarm (Hackathon winner)
- **URL:** https://github.com/affaan-m/claude-swarm
- Simplest architecture: Planning (Opus) → Parallel execution (Haiku) → Quality gate (Opus)
- **Smart cost optimization:** Opus for planning, Haiku for execution (3x cheaper)
- Wave-based execution with dependency DAG (NetworkX topological sort)
- Pessimistic file locking prevents corruption
- **Honest about constraints:** Single-machine only

### 4. Agentrooms (@mention routing)
- **URL:** https://claudecode.run/
- **One of the few that ACTUALLY does multi-machine**
- Hub makes HTTP calls to remote agent endpoints (localhost:808X or remote:808X)
- Manual agent configuration — no service discovery
- Auth: Piggybacks on Claude CLI OAuth tokens
- React + TypeScript + Deno + Electron + SQLite
- **Simple and it works** — just REST calls, no fancy protocols

### 5. Anthropic Agent Teams (Official)
- **URL:** https://code.claude.com/docs/en/agent-teams
- **Deliberately single-machine only**
- Filesystem-based coordination: tasks in ~/.claude/tasks/, messages in ~/.claude/teams/
- File locking for task claiming
- Team Lead + Teammates pattern
- **Signal:** Anthropic believes networking complexity outweighs benefits right now
- Experimental, disabled by default

### 6. Anthropic Internal Multi-Agent System
- Lead spawns 3-5 subagents in parallel, waits for completion
- **Key lessons:**
  - Early versions "spawned 50 subagents for simple queries"
  - "Agents use ~4x more tokens than chat. Multi-agent = ~15x more"
  - Token usage explains 80% of quality variance
  - Chose synchronous over async (async adds state consistency nightmares)
  - "Rainbow deployments" for gradual agent version rollouts

### 7. OpenClaw / Moltbot (145K+ stars)
- Single-machine agent, messaging platforms as remote UI
- Gateway daemon + Skills layer + Memory layer + Execution layer
- **The bet:** Interface should be where people already are (Signal, Telegram)
- Palo Alto Networks flagged as security concern (broad system access)

---

## Emerging Protocol Standards

| Protocol | Scope | Transport | Best For |
|----------|-------|-----------|----------|
| **MCP** (Anthropic) | Tool access for LLMs | HTTP, stdio, SSE | LLM-to-tool integration |
| **A2A** (Google, 150+ partners) | Peer-to-peer agent delegation | HTTP, SSE, gRPC | Enterprise cross-platform |
| **ACP** | Infrastructure coordination | HTTP + TLS | Registry-based discovery |
| **ANP** | Open internet discovery | HTTPS, JSON-LD, DIDs | Decentralized marketplaces |

**A2A is most relevant** — Agent Cards at `/.well-known/agent.json`, task lifecycle states, SSE streaming, 150+ org support.

---

## Key Insights for PIA

1. **The winning pattern is the simplest.** Agentrooms just POSTs to `mac-mini.local:8081`. No fancy protocols.

2. **Anthropic deliberately chose NOT to go multi-machine.** Filesystem-based coordination is a feature, not a bug.

3. **Tailscale is the ideal networking primitive.** Flat networking, NAT traversal, per-device identity, keyless auth (Aperture).

4. **The hard problem is coordination, not communication.** Every project that tried agent-to-agent coordination found chaos.

5. **Token economics are the real constraint.** 15x more tokens at scale. Infrastructure cost is secondary.

6. **Constrain autonomy > enable autonomy.** The most successful systems LIMIT what agents can do.

7. **Steve Yegge runs 3 concurrent Claude Max accounts** — suggesting vertical scaling beats horizontal.

---

## PIA's Existing Cross-Machine Status

### What WORKS:
- Hub mode (port 3000/3001) with WebSocket server
- Spoke connects via WebSocket with token auth
- Hub Aggregator tracks machines + agent status
- Heartbeat service (CPU, memory, disk, every 30s)
- Hub Client auto-reconnects on disconnect
- Relay API endpoints exist (/api/relay/*)

### What's SCAFFOLDING:
- `machineId` in AgentSessionConfig — stored but NEVER USED for routing
- Relay endpoints exist but no message durability
- SSH fields in enrollment but never used

### What's MISSING:
- Remote agent spawn handler (spoke can't receive spawn commands)
- Remote session streaming (output doesn't flow to hub)
- Remote command execution (can't send input to remote agents)
- Per-machine auth keys (shared token = one breach = full compromise)
- Message queue persistence (in-memory only, lost on restart)
- Session migration between machines

---

## Community Wisdom

- "The bottleneck is integration and deployment, not code generation speed"
- "Strict serialization with dry-run proposals" is the most successful pattern
- "Module boundaries matter more than agent count"
- "Claude writes, Codex reviews" — cross-model QA shows promise
- 80-90% of agent pilot projects die in production

---

*Compiled by Claude Opus 4.6 | February 15, 2026*
*Sources: GitHub repos, Warp docs, Anthropic engineering blog, HN, Reddit, protocol specs*
