# OpenClaw — Architecture Knowledge Base

> Source: Damian Galarza video breakdown (Feb 4, 2026, 158K views)
> Previously known as: ClawdBot / MoltBot
> Creator: Peter Steinberger (founder of PSPDFKit)
> Stars: 100,000 GitHub stars in 3 days (one of the fastest-growing repos in GitHub history)
> Coverage: Wired, Forbes, IBM, Cisco security analysis

---

## 1. What OpenClaw Is

An **open-source agent runtime with a gateway** in front of it. That's it.

- The **gateway** is a long-running process on your machine
- It connects to messaging apps (WhatsApp, Telegram, Discord, iMessage, Slack)
- It routes messages to AI agents that can execute actions on your computer
- The gateway doesn't think or reason — it accepts inputs and routes them

**Key insight:** The gateway is just a router. All intelligence comes from the LLM agents behind it.

---

## 2. The 5 Input Types

Everything OpenClaw does starts with an input. When you combine all five types, the system looks autonomous. But it's purely reactive.

### 2.1 Messages (Human → Agent)
- You send text via WhatsApp, iMessage, Slack, etc.
- Gateway receives and routes to the appropriate agent
- Sessions are **per-channel** (WhatsApp and Slack = separate sessions with separate contexts)
- Within one conversation, multiple requests queue up and process in order (no jumbled responses)

### 2.2 Heartbeats (Timer → Agent)
- A timer that fires on a regular interval (default: every 30 minutes)
- When it fires, the gateway schedules an agent turn — identical to a chat message
- The prompt is configurable: "Check my inbox for anything urgent. Review my calendar."
- If nothing needs attention, agent responds with `heartbeat_ack` token → system suppresses it (user never sees it)
- If something is urgent, user gets a ping
- Configurable: interval, prompt, active hours

**This is the "secret sauce" — time itself becomes an input.** Makes agents feel proactive even though they're just responding to preconfigured timer events.

### 2.3 Crons (Scheduled Events → Agent)
- More precise than heartbeats — specify exactly when and what
- Each cron is a scheduled event with its own prompt
- Examples:
  - 9:00 AM daily: check email, flag urgent items
  - Monday 3 PM: review week's calendar, flag conflicts
  - Midnight: browse Twitter feed, save interesting posts
  - 8 AM: text "Good morning" to someone
  - 10 PM: text "Good night"

**The "agent texting his wife" story:** Owner set up cron jobs for good morning/good night/random check-ins. The agent wasn't deciding to text her — a cron fired, the agent processed it, and the action was "send a message."

### 2.4 Hooks (Internal State → Agent)
- Triggered by the system itself (event-driven)
- Fires on: gateway startup, agent task begin, stop command, reset, etc.
- Used for: saving memory on reset, running setup on startup, modifying context before an agent runs
- Standard event-driven development pattern

### 2.5 Webhooks (External Systems → Agent)
- Standard webhooks from any external service
- Email arrives → webhook fires → agent processes
- Slack reaction → webhook → agent responds
- Jira ticket created → webhook → agent starts researching
- Calendar event approaching → webhook → agent reminds you
- Sources: Slack, Discord, GitHub, email, Jira, etc.

### Bonus: Agent → Agent Messaging
- Multi-agent setups with isolated workspaces
- Agents can pass messages between each other
- Each agent can have different profiles (research agent, writing agent, etc.)
- Agent A finishes job → queues work for Agent B
- Looks like collaboration but is just messages entering queues

---

## 3. The Formula

```
Time → Events → Agents → State → Loop
```

| Source | Mechanism | Creates |
|--------|-----------|---------|
| Time | Heartbeats + Crons | Scheduled events |
| Humans | Messages | Direct events |
| External systems | Webhooks | Reactive events |
| Internal state | Hooks | System events |
| Other agents | Agent messages | Chain events |

All events enter a **queue**. Queue gets processed. Agents execute. **State persists** (memory stored as local markdown files — preferences, conversation history, context from previous sessions).

When an agent wakes up on a heartbeat, it reads its memory files and remembers previous conversations. It's not learning in real time — it's reading from files you could open in a text editor.

**The loop continues. From the outside, it looks like sentience.**

---

## 4. The "3 AM Phone Call" Deconstructed

What happened:
1. Some event fired (cron or heartbeat — exact config unknown)
2. Event entered the queue
3. Agent processed it
4. Based on instructions + available tools, agent acquired a Twilio phone number
5. Agent made the call

The owner didn't ask for this in the moment, but somewhere in the setup, the behavior was enabled. The agent had tool access to acquire phone numbers and make calls.

**Nothing was thinking overnight. Time produced an event. The event kicked off an agent. The agent followed its instructions.**

---

## 5. Security Reality

Cisco's security team analyzed the OpenClaw ecosystem:

- **26% of 31,000 available skills contain at least one vulnerability**
- Cisco called it "a security nightmare"
- OpenClaw's own docs say "there's no perfectly secure setup"

### Risk vectors:
| Risk | Description |
|------|-------------|
| Prompt injection | Via emails or documents the agent processes |
| Malicious skills | In the marketplace (31K skills, minimal vetting) |
| Credential exposure | Agent has access to system credentials |
| Command misinterpretation | Agent deletes files you didn't mean to |
| Deep system access | Shell commands, file read/write, script execution, browser control |

### Mitigation advice:
- Run on a secondary machine
- Use isolated accounts
- Limit enabled skills
- Monitor logs
- Railway offers one-click isolated container deployment

---

## 6. PIA vs OpenClaw Comparison

### What PIA already has (same pattern)

| OpenClaw | PIA | Implementation |
|----------|-----|----------------|
| Gateway | Express server + mission-control routes | `server.ts`, `agent-session.ts` |
| Messages | Dashboard terminal, WhatsApp bridge, voice notes | Multiple input channels |
| Heartbeats | Fisher2050 cron service (9am, 6pm, 2am, 6am) | `fisher-service.ts` with node-cron |
| Crons | Calendar events + spawn service | `calendar_events` table, `calendar-spawn-service.ts` |
| Hooks | Agent bus events + hook_events table | `agent-bus.ts`, `hook_events` table |
| Webhooks | WhatsApp inbound, email inbound, GitHub webhooks | Route handlers in `src/api/routes/` |
| Agent → Agent | Agent messages table + bus | `agent_messages` table, agent bus |
| Persistent memory | Soul memories in SQLite + personality JSON | `soul_memories` table, `src/souls/personalities/` |
| Multi-agent | M1/M2/M3 fleet with hub-worker architecture | `hub-client.ts`, `aggregator.ts` |

### Where PIA exceeds OpenClaw

1. **Multi-machine fleet** — OpenClaw runs on one machine. PIA spans 3 machines with hub-worker architecture, heartbeat registration, remote spawning.

2. **Typed memory with importance scoring** — OpenClaw stores memory as flat markdown files. PIA has soul memories with categories (experience/decision/learning), importance 1-10, summarization, TTL cleanup.

3. **Quality gate (Ziggi)** — Every output scored. Nothing ships below 8/10. OpenClaw has no quality control.

4. **Intelligence loop** — Eliyahu→Fisher→Agents→Tim Buc→Eliyahu compound flywheel. Data accumulates, patterns surface, outputs improve automatically.

5. **Approval modes** — Manual/Auto/Yolo/Plan with tool-level auto-approval rules vs. OpenClaw's "give it full access and hope for the best."

### What OpenClaw has that PIA could adopt

1. **Heartbeat suppression (`heartbeat_ack`)** — Silent "nothing to report" token. Fisher crons always produce output; suppression would reduce noise.

2. **Per-channel session isolation** — Auto-separate contexts per input channel (WhatsApp session != dashboard session for the same agent).

3. **Skill/recipe marketplace** — Though 26% vulnerability rate argues for PIA's curated approach.

---

## 7. Key Takeaway

The pattern that makes agents feel alive:

```
Events (time/human/external/internal/agents)
  → Queue
    → Agent processes with LLM + tools
      → State persists (memory)
        → Loop continues
```

This pattern will show up in every AI agent framework. OpenClaw didn't invent it — they just packaged it well and went viral. Understanding this architecture means you can evaluate any agent tool intelligently, or build your own.

---

## 8. Resources

| Resource | URL |
|----------|-----|
| OpenClaw Docs | https://docs.openclaw.ai/ |
| Cisco Security Research | https://blogs.cisco.com/ai/personal-ai-agents |
| IBM Analysis | https://www.ibm.com/think/news/clawdbot |
| Creator (Peter Steinberger) | https://x.com/steipete |
| Official OpenClaw | https://x.com/clawdbot |
| Claire Vo's architecture thread | https://x.com/clairevo |
| Railway deployment guide | https://docs.openclaw.ai/railway |
| Video source (Damian Galarza) | www.damiangalarza.com/newsletter |
