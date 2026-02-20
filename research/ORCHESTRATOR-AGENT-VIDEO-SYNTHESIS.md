# Orchestrator Agent — Video Synthesis

> **Source:** "Orchestrator Agent" lesson — Agentic Horizon series
> **Logged:** 2026-02-20
> **Relevance to PIA:** Very High — directly describes PIA's target architecture

---

## 1. Core Thesis

The rate at which you can **create and command agents** is the constraint on your engineering output.
The "orchestrator agent" is the unlock for multi-agent orchestration at scale.

### Five Levels of Agentic Engineers

| Level | Description |
|---|---|
| L1 | Base agents |
| L2 | Better agents (multi-file, still reading all code) |
| L3 | More agents |
| L4 | Custom agents |
| **L5** | **Orchestrator agent — fleet management** |

> "If you can't measure it, you can't improve it. And if you can't measure it, you can't scale it."

---

## 2. The Three Pillars

The orchestrator pattern is not just one thing. It requires all three:

### Pillar 1 — Orchestrator Agent
- A single AI agent that serves as your unified interface to all other agents
- Has tools: `create_agent`, `command_agent`, `list_agents`, `delete_agent`, `check_agent_status`
- It does NOT watch all logs — it protects its context window
- It crafts detailed, specialised prompts for each sub-agent
- It sleeps between tasks, wakes to poll, then delegates

### Pillar 2 — CRUD for Agents
- Create, Read (list/status), Update (command), Delete agents programmatically
- Orchestrator spawns agents with a single prompt → multiple tool calls
- Example: one user prompt → orchestrator makes 6 tool calls (3× create, 3× command)
- Agents are **deletable temporary resources** — spin up, do work, delete

### Pillar 3 — Observability
- Real-time monitoring of every agent's: responses, tool calls, thinking/reasoning, cost, context %
- Filter by: response type, tool calls, individual agent
- See **consumed files** (reads) vs **produced files** (writes) per agent on completion
- One-click from result → open file in editor

---

## 3. The Orchestrator Agent's Behaviour

### What It Does
1. Receives a high-level user prompt
2. Thinks (reasoning enabled) about how to decompose the task
3. Creates focused, single-purpose agents
4. Crafts detailed written prompts for each agent (not just forwarding the user's prompt)
5. Commands each agent
6. Sleeps — does NOT stay in the loop watching agent logs
7. Periodically polls agent status (`check_agent_status` every ~15s)
8. On completion: reads produced files, verifies work, communicates summary back to user
9. Deletes agents when job is done

### What It Does NOT Do
- It does not do the actual work itself
- It does not observe every log line (would blow its context window)
- It does not blindly forward the user prompt — it prompt-engineers for each agent

### Context Window Protection
> "You always need to be monitoring and understanding the Core 4 of every agent you boot up."

The orchestrator's context stays lean because:
- It delegates all work to sub-agents
- It only reads **summaries/results**, not full logs
- Sub-agents are deleted after use

---

## 4. Core 4 — Every Agent, Always

At every critical moment, know these four levers for each agent:

| # | Lever | What to Monitor |
|---|---|---|
| 1 | **Context** | % used — yellow >70%, red >90% |
| 2 | **Model** | Which model, capability level |
| 3 | **Prompt** | What the agent was instructed to do |
| 4 | **Tools** | What it can and can't do |

---

## 5. Agent Card — What Should Be Visible

From the video demo, each agent card shows:
- Name + status
- Context window % used
- Response messages (filterable)
- Tool calls (filterable)
- Hooks
- Reasoning / thinking (brain icon when active)
- Model name
- Cost (running + cumulative)
- **Consumed assets** (files read during session)
- **Produced assets** (files written during session)

One-click from produced asset → open diff inline or launch editor.

---

## 6. Scout → Builder Pattern (Common Workflow)

The orchestrator uses specialised agent chains:

```
User prompt: "Build X"
  └─ Orchestrator thinks
       ├─ Creates "Scout" agent → reads codebase, finds exact files to change
       ├─ Scout completes → produces file map + change plan
       └─ Orchestrator commands "Builder" agent with Scout's findings
            └─ Builder makes precise changes (no exploration needed)
```

Why this works:
- Scout is cheap and focused (read-only)
- Builder gets a pre-researched plan → high precision, minimal hallucination
- Orchestrator orchestrates the handoff, does not do either job itself

For verification, a third "Reviewer" agent can be added after Builder.

---

## 7. Human-in-the-Loop Decision Points

The system should surface decision points where agents need human input:
- Agent surfaces a question → simple UI prompt appears
- Human answers → agent continues
- This is Tactic 8 in the series ("agents ask YOU questions, not the other way around")

---

## 8. Agent Forking (Future)

Described as "one tool away" with the Claude Agent SDK:
- Duplicate an agent's context window from a specific point
- Creates a branched agent with identical history
- Enables parallel exploration from the same state
- Not yet implemented — "a few modules away"

---

## 9. The Delete Philosophy

> "You must treat your agents as deletable temporary resources that serve a single purpose."

> "There's a journey every engineer goes through: read code → create → update → and then you learn the best code is no code at all. You learn to delete. Agentic engineering is no different."

- When work is done, blow away the agents
- `Command K → delete all agents` = 3 tool calls, all gone
- Forces focused context windows — no context rot
- Prevents agents from "context-switching" between tasks

---

## 10. In-Loop vs Out-Loop

| Mode | When to Use |
|---|---|
| **Out-loop** (orchestrator) | Most work — deploy compute, walk away, review results |
| **In-loop** (terminal) | Debugging, emergencies, work that needs tight human feedback |

The goal is to reduce your in-loop presence over time. Out-loop = leverage.

Specialised tools > general-purpose cloud tools because they know YOUR codebase, not everyone's.

---

## 11. Trade-offs & Honest Assessment

The video is candid about the cost:

**Upfront investment required:**
- Build the orchestrator agent (system prompt + tools)
- Manage the plumbing (database, WebSocket connections, agent lifecycle)
- Coordinate the orchestration layer

**Why it's worth it:**
- With a single prompt, deploy 3× the compute of a terminal engineer
- Agents can run async while you do other work
- Compute is cheap — engineers are not
- Specialised > generic, always

> "The right way to think about engineering now is the agentic way."

---

## 12. PIA Build Checklist (Extracted from Video)

Things the video shows that PIA needs to build/confirm:

| # | Feature | PIA Status | Notes |
|---|---|---|---|
| 1 | Orchestrator agent (AI with agent-management tools) | ❌ Not built | Highest priority — the whole unlock |
| 2 | Consumed / produced files per agent | ❌ Not built | Track read/write calls per session |
| 3 | One-click open file from agent result | ❌ Not built | Dashboard → editor jump |
| 4 | Context % bar on agent cards | ❌ Planned | Yellow >70%, red >90% |
| 5 | Delete all agents (bulk clean sweep) | ❌ Not built | One button/command |
| 6 | Thinking/reasoning visible on card | ⚠️ Partial | Brain icon when thinking active |
| 7 | Cost per agent (running + cumulative) | ❌ Not built | From SDK usage tracking |
| 8 | Filter logs by type (responses/tools) | ⚠️ Partial | Dashboard has some filtering |
| 9 | Human-in-the-loop prompt surface | ❌ Not built | Tactic 8 — agents ask you |
| 10 | Agent forking from context point | ❌ Not built | Future — Claude SDK |
| 11 | Command K quick-input modal | ❌ Not built | Hotkey for orchestrator prompt |
| 12 | Scout → Builder agent chain workflow | ❌ Not built | Depends on orchestrator agent |

---

## 13. Key Quotes

> "When you build something like this, you get specialisation all the way down."

> "If you do not adopt your agent's perspective, if you do not know what they can do, you do not know what you can do."

> "Don't force your agent to context-switch. You know what that feels like. Force it to focus and then let it go home back to the data centre. Delete it."

> "Every agent must produce a concrete result. Otherwise, what's the point?"

> "10 agents doing the wrong thing — does it matter that you have 10? Of course not. This is why observability is key."

> "Any release or system that enables you to increase the information rate between your agents and your work requires your attention."

---

## 14. Relationship to PIA

PIA already has:
- Multi-machine agent spawning (M1→M2 via WebSocket)
- REST API for agent CRUD (`/api/mc/agents`)
- Real-time dashboard (mission-control.html)
- WebSocket observability (mc:output, mc:status, mc:agent_spawned)

PIA needs to add to reach the video's vision:
1. **Orchestrator agent** — a Claude agent that calls PIA's own REST API as tools
2. **Consumed/produced file tracking** — hook into file read/write events per session
3. **Context % + cost on cards** — Claude Agent SDK already exposes this
4. **Delete all** — simple bulk delete endpoint + dashboard button
5. **Command K modal** — keyboard shortcut for orchestrator prompt input

The orchestrator agent (#1) is the prerequisite that unlocks the Scout→Builder pattern,
agent chaining, and the full out-loop workflow described in the video.
