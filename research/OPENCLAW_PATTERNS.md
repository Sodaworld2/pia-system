# OpenClaw — Design Patterns Extracted for PIA

**Source:** Video transcript analysis (YouTube breakdown of OpenClaw architecture)
**Relevance:** OpenClaw hit 100K GitHub stars in 3 days. The architecture patterns map directly to what PIA is building.

---

## What OpenClaw Actually Is

An **agent runtime with a gateway in front of it**. That's it.

- Gateway = long-running process on your machine
- Accepts connections from messaging apps (WhatsApp, Telegram, Discord, iMessage, Slack)
- Routes messages to AI agents that can act on your computer
- **The gateway doesn't think. It doesn't reason. It just routes inputs.**

---

## The Formula That Makes It Feel Alive

```
Time → Events → Agents → State → Loop
```

Four components:
1. **Time** produces events (heartbeats + crons)
2. **Events** trigger agents
3. **State** persists across interactions (local markdown files)
4. **Loop** keeps processing

That's it. Nothing is "thinking." Nothing is "deciding." It's **inputs, queues, and a loop.**

---

## The 5 Input Types

Everything starts with an input. When you combine all 5, the system looks autonomous. But it's purely reactive.

### 1. Messages (Human → Agent)
- You send a text via WhatsApp/Slack/iMessage
- Gateway receives and routes to agent
- Agent responds
- **Sessions are per-channel** — WhatsApp and Slack = separate contexts
- Multiple requests queue up and process in order (no jumbled responses)

### 2. Heartbeats (Timer → Agent)
- **This is the secret sauce** — why it feels proactive
- Timer fires every 30 minutes (configurable)
- Sends a pre-written prompt to the agent: "Check inbox. Review calendar. Look for overdue tasks."
- Agent responds to the prompt like any other message
- If nothing urgent → agent returns `heartbeat_ok` token → suppressed, you never see it
- If something urgent → you get pinged
- **Time itself becomes an input**

### 3. Crons (Schedule → Agent)
- More control than heartbeats — specify exact times
- Examples:
  - 9am daily: "Check email, flag urgent"
  - Monday 3pm: "Review calendar, flag conflicts"
  - Midnight: "Browse Twitter, save interesting posts"
- Each cron = scheduled event with its own prompt
- **The "texting wife" guy** = cron job. "Good morning" at 8am. "Good night" at 10pm. Agent wasn't deciding to text. A cron fired.

### 4. Hooks (Internal State → Agent)
- System triggers these on internal state changes
- Gateway startup → hook fires
- Agent begins task → hook fires
- Command issued (stop, reset) → hook fires
- Used for: save memory on reset, run setup on startup, modify context before agent runs
- **Event-driven development pattern**

### 5. Webhooks (External Systems → Agent)
- Email hits inbox → webhook fires → agent processes
- Slack reaction → webhook
- Jira ticket created → webhook
- GitHub event → webhook
- **Agent responds to your entire digital life, not just your messages**

### Bonus: Agent → Agent
- Multi-agent setups with isolated workspaces
- Agent A finishes job → queues work for Agent B
- Looks like collaboration, but it's just messages entering queues

---

## Deconstructing the "3am Phone Call"

From outside: Agent autonomously decided to get a phone number and call its owner at 3am.

What actually happened:
1. Some event fired (cron or heartbeat) — we don't know the exact config
2. Event entered the queue
3. Agent processed it
4. Based on instructions + available tools, it acquired a Twilio number and made the call
5. The owner didn't ask in the moment, but **the behavior was enabled in the setup**

> "Time produced an event. The event kicked off an agent. The agent followed its instructions."

---

## State Persistence

- Memory = **local markdown files**
- Stores: preferences, conversation history, context from previous sessions
- When agent wakes on heartbeat, it reads these files
- **Not learning in real-time. Reading from files you could open in a text editor.**
- The loop just continues

---

## Security Reality

Cisco's security team analyzed OpenClaw:
- **26% of 31,000 skills contain at least one vulnerability**
- Called it "a security nightmare"
- Risks:
  - Prompt injection through emails/documents
  - Malicious skills in marketplace
  - Credential exposure
  - Command misinterpretation (deletes files you didn't mean to)
- OpenClaw's own docs: "There's no perfectly secure setup"
- Recommendation: run on secondary machine, isolated accounts, limit skills, monitor logs

---

## What PIA Can Learn From This

### Already in PIA:
- ✅ Gateway/Hub pattern (PIA's Hub = OpenClaw's Gateway)
- ✅ Agent routing (Agent Factory + Cost Router)
- ✅ Multi-agent messaging (agents can message other agents)
- ✅ State persistence (Soul Engine + Memory Manager)
- ✅ Security controls (Network Policy, command validation, secret masking)
- ✅ WebSocket connections to messaging surfaces

### PIA Should Add/Strengthen:
| OpenClaw Pattern | PIA Equivalent | Gap |
|---|---|---|
| **Heartbeats** (timed prompts) | Cortex polls every 60s for telemetry | PIA's Cortex watches machines, not tasks. Need agent-level heartbeats that fire prompts. |
| **Cron jobs** (scheduled agent tasks) | Not implemented | Add a cron scheduler that fires agent prompts on schedule. Critical for "alive" feeling. |
| **Webhook ingestion** (external events) | Hub accepts WebSocket, not webhooks | Add HTTP webhook endpoint so external systems (email, Slack, GitHub) can trigger agents. |
| **Per-channel sessions** | Agent sessions are per-spawn | Consider persistent sessions per communication channel. |
| **Heartbeat suppression** (quiet when nothing to report) | Not implemented | Add `heartbeat_ok` pattern — agent returns "nothing to report" token, system suppresses. |
| **Hook system** (internal lifecycle events) | Agent status events exist | Formalize as a hook system — on_startup, on_reset, on_agent_begin, on_agent_end. |

### The Core Insight for PIA:

**The "alive" feeling comes from 3 things PIA partially has:**

1. **Time as input** — PIA has Cortex polling, but doesn't have agent-level heartbeats or cron-triggered prompts. Adding this = agents that proactively check things without being asked.

2. **Multiple input sources converging on one queue** — PIA routes from dashboard, but not from email/Slack/webhooks. Adding webhook ingestion = agents that respond to external events.

3. **State that persists across sessions** — PIA has Soul Engine + Memory Manager. This is already stronger than OpenClaw's markdown files.

**PIA is architecturally more sophisticated than OpenClaw** (distributed, multi-machine, cost-aware, soul system). But OpenClaw nails the UX of feeling alive through heartbeats + crons + webhooks. PIA should absorb these patterns.

---

## The Pattern (Universal)

Every AI agent framework that "feels alive" is doing some version of:

```
Scheduled Events (heartbeats/crons)
  + Human Messages
  + External Webhooks
  + Internal Hooks
  + Agent-to-Agent Messages
  ───────────────────────
  → Event Queue
  → Agent Processes
  → State Persists
  → Loop Continues
```

You don't need OpenClaw specifically. You need:
- A way to schedule events
- A way to queue them
- A way to process them with an LLM
- A way to maintain state

**PIA already has all four. It just needs to wire heartbeats + crons + webhooks to complete the pattern.**

---

*Extracted: February 25, 2026*
*For PIA system design reference*
