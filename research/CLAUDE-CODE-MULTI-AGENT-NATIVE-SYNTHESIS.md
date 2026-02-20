# Claude Code — Native Multi-Agent Orchestration (New Feature Synthesis)

> **Source:** "Claude Code Multi-Agent Orchestration" video — Agentic Horizon series
> **Logged:** 2026-02-20
> **Relevance to PIA:** Very High — documents new Claude Code built-in tools PIA agents can use

---

## 1. What This Video Covers

Claude Code (the CLI tool) has shipped **native multi-agent orchestration** — a new built-in system for creating teams of agents, assigning tasks, running them in parallel, and shutting them down cleanly. This is distinct from PIA's own orchestration system — it's happening *inside* the Claude agent runner itself.

---

## 2. The New Claude Code Agent Tools (Three Categories)

### Team Management
| Tool | Purpose |
|---|---|
| `team_create` | Create a named team of agents |
| `team_delete` | Delete the team and all its agents |

### Task Management
| Tool | Purpose |
|---|---|
| `task_create` | Create a task (assign to an agent) |
| `task_list` | List all tasks and their status |
| `task_get` | Get details of a specific task |
| `task_update` | Update task status/details |

### Communications
| Tool | Purpose |
|---|---|
| `send_message` | Send a message between agents |

> `task` (spawn agent in parallel) has been around — the new tools ADD team and task management on top.

---

## 3. The Full Multi-Agent Workflow

```
1. Create the team
2. Create the tasks (assign work)
3. Spawn agents (parallel execution)
4. Agents work in parallel
5. Shut all agents down
6. Delete the team
```

**Key principle:** When work is done, delete. This forces good context engineering — clean slate every time, no context rot.

---

## 4. Agent Sandboxes

### What They Are
- Isolated, ephemeral compute environments for agents
- Live for 12 hours (or similar TTL)
- Agents operate inside the sandbox — local machine is protected
- Each sandbox has its own URL/endpoint

### Two Tiers
| Tier | Use Case |
|---|---|
| **Cloud (E2B)** | General work — scalable, cheap, disposable |
| **Local (Mac Mini/device)** | Privacy-sensitive work — stays on your hardware |

### Scale Shown in Video
- 24 sandboxes running simultaneously
- 2 teams of 4 agents each deployed in parallel
- Skill-based: an "agent sandbox skill" manages sandbox lifecycle

### Why This Matters
> "I have agents running on my device, but the work they're doing is operating off the device."

The local agent is the brain — the sandbox is the hands. This pattern:
- Protects the local machine from file system risk
- Enables massive parallel compute
- Keeps agents focused (one sandbox = one task)

---

## 5. The Task List Feature (Context)

Referenced from a prior video:
- User prompts primary agent
- Primary agent creates a task list
- Multiple agents in the team operate on the task list
- This is now enhanced by the new `task_create` / `task_list` / `task_update` tools

---

## 6. Multi-Agent Observability (New Tools Compatibility)

The speaker's existing multi-agent observability system needs updating to support new tools:
- See `team_create`, `team_delete`, `task_*`, `send_message` events
- Filter/view inter-agent communications
- Track task state across agents

**For PIA:** PIA's dashboard could surface these tool calls when a PIA-spawned agent uses the new Claude Code tools internally.

---

## 7. Core 4 Still Applies

Even with all these new tools, everything boils down to:
1. **Context** — what the agent knows
2. **Model** — which Claude is running
3. **Prompt** — what it was asked to do
4. **Tools** — what it can do

> "With every new capability, with every new feature, the question is always the same: how can we understand the capabilities available to us to accelerate our engineering work?"

---

## 8. Key Design Principle — Sandboxed Parallelism

From the video demo:
- Agents build real apps (portfolio tracker, recipe app, ad dashboard, mission briefings)
- Each runs in its own sandbox
- Orchestrator coordinates; sandboxes execute
- Issues can be fixed by spinning up a NEW agent team, giving them full context, and letting them resolve it

This is the **iterative agent team pattern**:
```
Deploy team → review results → identify issues → deploy fix team → verify → delete
```

---

## 9. PIA Implications

### What PIA Can Adopt Now

| Idea | How to Apply |
|---|---|
| **Sandbox concept** | Each PIA agent gets isolated working dir or Docker container |
| **Team + task tracking** | PIA already has agent CRUD — add `team` grouping concept |
| **send_message between agents** | PIA's WebSocket already does this — formalize as inter-agent message type |
| **Delete team on completion** | Already in session journal todo — add bulk delete |
| **Task list → agent assignment** | PIA agents can receive a task list, not just a freeform prompt |

### What PIA Knows vs. What Claude Code Does

| Layer | Claude Code Native | PIA |
|---|---|---|
| Agent execution | ✅ Built-in (SDK) | ✅ AgentSessionManager |
| Multi-machine | ❌ Single machine | ✅ M1→M2 via Tailscale |
| Observability dashboard | ❌ Terminal only | ✅ mission-control.html |
| Agent sandboxes | ✅ E2B cloud / local | ❌ Not yet |
| Team management tools | ✅ team_create/delete | ❌ Not yet (single agents only) |
| Task assignment | ✅ task_create/list | ❌ Not yet |
| Inter-agent messaging | ✅ send_message | ⚠️ Via orchestrator only |
| Visual result tracking | ❌ Terminal only | ✅ consumed/produced files (planned) |

**PIA's advantage:** Multi-machine + visual dashboard
**Claude Code's advantage:** Native team/task tools + sandbox isolation

**Ideal path:** PIA wraps and surfaces Claude Code's native multi-agent tools in its dashboard.

---

## 10. Quotes

> "Agent sandboxes are and will be a big, big, big trend as we scale up what our agents can do on our behalf."

> "Whatever agents need to accomplish their work without jeopardizing our local machine."

> "We always want to be operating on fresh instances."

> "You and I will always be the limitation. Models will improve, tools will change."

> "Scale your compute to scale your impact."
