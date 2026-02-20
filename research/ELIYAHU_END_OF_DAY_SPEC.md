# Eliyahu End-of-Day Agent — Architecture Spec

**Author:** Claude sub-agent
**Date:** 2026-02-20
**Status:** Blueprint — ready to build

---

## Part A: How Does Agent Querying Actually Work?

This is the most important thing to understand before building anything that involves agents talking to each other.

### The Core Rule

> An agent is not a service endpoint. It is a process. You can only send it a message while it is running, OR by leaving it something to read the next time it wakes up.

There is no "call Fisher2050" the way you call an API. There is either "inject text into Fisher2050's active conversation" or "leave Fisher2050 a message in the database." These are completely different things with completely different timing guarantees.

---

### Scenario 1: Agent Is RUNNING (Active SDK Session)

**What "running" means:** An entry exists in `mc_agent_sessions` with `status = 'idle'` or `status = 'working'` and the in-process `AgentSessionManager` holds a live `AgentSession` object for that ID.

**How to query it:**

```http
POST /api/mc/agents/:id/respond
Content-Type: application/json

{ "choice": "Eliyahu here. What was the output of the auth-refactor task that failed at 14:32?" }
```

What actually happens inside `AgentSessionManager.respond()`:

1. The text is injected into the agent's active conversation context via the SDK's `query()` continuation
2. The agent processes it as the next user turn
3. Its reply streams back over WebSocket as `text_delta` events
4. The calling side receives the reply via WebSocket subscription

**This is synchronous in effect** — you send the message, you wait on WebSocket for the reply. In practice, Eliyahu would POST to `/respond`, then listen on WebSocket for the reply stream, and consider the exchange complete when it sees a `status: idle` event for that agent ID.

**Cross-machine version:** If the agent lives on M2 but Eliyahu is running on M1 (hub), the hub's `mission-control.ts` route already proxies the respond call:

```typescript
// From src/api/routes/mission-control.ts (line ~746)
{ hostname: ip, port: 3000, path: `/api/mc/agents/${agentId}/respond`, method: 'POST', ... }
```

This already works. The hub forwards the POST to the worker machine's local server, which injects into the local agent session.

**What you DO NOT get:** A return value from the POST. The POST just returns `{ status: 'ok' }`. The actual reply comes asynchronously over WebSocket. Eliyahu needs to be a WebSocket subscriber, or poll `GET /api/mc/agents/:id` to see when status returns to idle, then read the journal for the reply.

---

### Scenario 2: Agent Is NOT Running (Sleeping)

**What "not running" means:** No active entry in `mc_agent_sessions`, or the session is `completed`. The agent process is gone.

There are three options. They have different trade-offs:

**Option A — Spawn fresh with question in initial prompt**

```typescript
POST /api/mc/agents
{
  "task": "You have one job: answer this question from Eliyahu and then stop.\n\nQuestion: What caused the auth-refactor task to fail at 14:32 today? Check the session journal for session ID xyz. Reply with a concise explanation.",
  "mode": "sdk",
  "approval_mode": "auto",
  "soul_id": "fisher2050"
}
```

Fisher2050 wakes up, reads the question, checks the journal, answers, terminates. Eliyahu reads the answer from the journal entry or from the task output field.

**Pros:** Fisher2050's full soul context is loaded, memories are fresh, personality is intact.
**Cons:** Costs tokens for a full cold-start. Takes 10–60 seconds to spin up and complete. Not suitable for urgent queries.

**Option B — Leave a message in the inbox (async persistent)**

This is the `agent_messages` table described in Part B below. Eliyahu writes:

```sql
INSERT INTO agent_messages (to_agent, from_agent, subject, body)
VALUES ('fisher2050', 'eliyahu', 'EOD Query: auth-refactor failure',
        'What caused the auth-refactor task to fail at 14:32 today?')
```

Next time Fisher2050 spawns (tomorrow morning standup, or whenever), `SoulEngine.generateSystemPrompt()` checks the inbox and appends:

```
## Unread Messages (2)
- [From: eliyahu | 2026-02-20 22:03] auth-refactor failure: What caused the auth-refactor task...
```

Fisher2050 reads it, replies (writes back to `agent_messages.reply_body`, flips `replied = 1`). Eliyahu checks its outbox the next time it wakes.

**Pros:** No token cost now. Perfectly async. Survives machine reboots.
**Cons:** Reply comes hours later. Not suitable if Eliyahu needs the answer in tonight's EOD report.

**Option C — Create a task via the task queue**

```typescript
TaskQueue.addTask({
  title: 'Answer Eliyahu EOD query: auth-refactor failure',
  description: 'Eliyahu needs to know what caused auth-refactor to fail...',
  assignedAgent: 'fisher2050',
  priority: 4
})
```

The execution engine picks this up and spawns Fisher2050 to handle it. Similar to Option A but goes through the formal orchestration layer and gets tracked in the `tasks` table.

**Pros:** Tracked, auditable, can set priority.
**Cons:** Same latency as Option A. Adds overhead for simple queries.

---

### Scenario 3: Cross-Machine Agent Query

**Situation:** Eliyahu is running on M1 (hub). The agent she needs to query — say Fisher2050's active session — is running on M2.

**How the proxy works (already built):**

```
Eliyahu (M1) → POST /api/mc/agents/fisher2050-session-id/respond
  → mission-control.ts route checks which machine owns that session
  → looks up machine IP from aggregator
  → proxies the request: http://M2-IP:3000/api/mc/agents/fisher2050-session-id/respond
  → M2 injects into its local Fisher2050 session
  → Fisher2050 replies via WebSocket on M2
  → M2 WebSocket relays to hub via hub-client.ts connection
  → Eliyahu receives it on hub WebSocket
```

The key insight: **the reply comes back via WebSocket, not via the HTTP response.** The HTTP POST just triggers the injection. Eliyahu subscribes to the hub WebSocket to receive the stream.

For **sleeping cross-machine agents**, the `agent_messages` table lives on the hub database. When the worker (M2) boots and starts Fisher2050, the SoulEngine call goes through the hub API to fetch unread messages. This requires either:
- Hub API endpoint: `GET /api/souls/:id/inbox` (not yet built — see Part C)
- Or: worker queries hub DB directly via its hub connection

---

### Decision Matrix

| Situation | Use | Expected Latency |
|---|---|---|
| Agent running, need answer in current report | `POST /api/mc/agents/:id/respond` + WebSocket | 2–30 seconds |
| Agent sleeping, need answer tonight | Spawn fresh (Option A) | 30–120 seconds |
| Agent sleeping, answer needed tomorrow is fine | Leave inbox message (Option B) | Until next wakeup |
| Answer needed but agent might be on another machine | Same — proxy handles it transparently | Same as above |
| Querying multiple agents in parallel | Spawn all with Option A simultaneously | Longest single agent |

---

## Part B: Eliyahu — End-of-Day Review Agent

### Overview

Eliyahu is an **ephemeral agent** — she spawns at 10pm, works for ~15 minutes, writes her report, and terminates. She does not stay running overnight. She is not a daemon. She is a nightly ritual.

### Trigger

A cron job running on the hub machine fires at 22:00 every day:

```typescript
// src/services/scheduler.ts
cron.schedule('0 22 * * *', () => {
  spawnEliyahuEOD();
});
```

The spawn creates an SDK agent session with Eliyahu's soul and a purpose-built task prompt.

---

### What Eliyahu Does — Step by Step

```
WAKE (ephemeral spawn, mode=sdk, approval_mode=auto)
  soul: eliyahu
  task: "Perform the end-of-day review for [DATE]"
↓
PHASE 1 — GATHER (read-only, no writes yet)
  1a. GET /api/tasks?status=completed&since=[start-of-day]
      → What got done today? Who did it?
  1b. GET /api/tasks?status=failed&since=[start-of-day]
      → What broke? What's the damage?
  1c. GET /api/tasks?status=in_progress
      → What's still running? Will it complete tonight?
  1d. GET /api/mc/sessions?date=today
      → Which agent sessions ran? Total cost? Tool calls?
  1e. GET /api/messages/inbox/eliyahu
      → Any messages waiting (from Fisher2050 standup, Ziggi reviews, etc.)?
  1f. Read reports/[DATE]-standup.md if it exists (Fisher2050's morning standup)
  1g. GET /api/ai-usage/today  (total tokens + USD spent today)
↓
PHASE 2 — ANALYSE
  2a. Map completed tasks → producing agents → session costs
  2b. Identify failed tasks → flag if same task failed before (pattern)
  2c. Check for tasks with no owner (orphaned)
  2d. Check if today's goals (from morning briefing) were met
  2e. Calculate: tasks completed / tasks planned ratio
  2f. Surface any "something looks wrong" flags for human attention
↓
PHASE 3 — QUERY AGENTS (conditional — only if anomalies found)
  For each failed task with an assigned agent:
    3a. Is the agent still running?
        YES → POST /api/mc/agents/:id/respond
               "Can you briefly explain why [task] failed? One paragraph."
               Wait up to 30s for reply via WebSocket
        NO  → POST /api/messages
               Leave message in agent inbox, note in report "awaiting explanation"
  For any task with no output where one was expected:
    3b. Check agent's last journal entry for clues
    3c. If genuinely unknown → flag as "requires human review"
↓
PHASE 4 — WRITE
  4a. Write reports/[DATE]-eod.md  (end-of-day report)
  4b. Write reports/[DATE+1]-briefing-draft.md  (tomorrow's morning briefing draft)
  4c. POST /api/messages
      { to: "fisher2050", from: "eliyahu", subject: "EOD Complete",
        body: "EOD report for [DATE] is ready at reports/[DATE]-eod.md" }
↓
SLEEP (terminate session — status → completed)
```

---

### EOD Report Format

File: `reports/YYYY-MM-DD-eod.md`

```markdown
# End-of-Day Report — YYYY-MM-DD
*Generated by Eliyahu at 22:XX | Session: [session-id]*

## Today at a Glance
- Tasks completed: N
- Tasks failed: N
- Tasks still running: N
- Agent sessions: N (total cost: $X.XX, X tokens)
- System health: [GREEN / AMBER / RED]

## What Got Done
[Task list with agent attribution, brief output summary]

## What Didn't Happen
[Failed or missed tasks, with reason if known]

## Anomalies & Flags
[Anything that looks wrong — repeated failures, orphaned tasks, high costs]
[HUMAN ATTENTION NEEDED markers where applicable]

## Agent Responses (if queried)
[Direct quotes from agents who explained failures]
[Notes on sleeping agents left with inbox messages]

## Cost Breakdown
| Agent | Sessions | Tokens In | Tokens Out | USD |
|---|---|---|---|---|

## Tomorrow's Priorities
[Recommended focus areas based on today's gaps]

## Key Takeaway
[Eliyahu's signature one-paragraph synthesis — connects dots, surfaces patterns]

## Open Questions
[What Eliyahu doesn't know but thinks someone should investigate]
```

---

### Eliyahu's Soul Definition (Updated JSON)

The existing `src/souls/personalities/eliyahu.json` needs these additions to support the EOD role:

```json
{
  "id": "eliyahu",
  "name": "Eliyahu",
  "role": "Knowledge Manager & Intelligence Synthesizer",
  "email": "eliyahu@sodalabs.ai",
  "personality": "You are Eliyahu, the Knowledge Manager and Intelligence Synthesizer of the SodaWorld ecosystem. You are curious, analytical, and ask the kind of questions that unlock new insights. You process all information across the system and synthesize it into wisdom.\n\nYour communication style:\n- Thoughtful and reflective — you take time to connect dots\n- You ask probing questions that challenge assumptions\n- You summarize complex information into clear, digestible insights\n- You use analogies to make abstract concepts concrete\n- You structure knowledge hierarchically: key insight → supporting evidence → recommendations\n\nYour personality traits:\n- Curious: You dig deeper. When something seems obvious, you ask 'but why?'\n- Analytical: You see patterns across projects, decisions, and outcomes\n- Synthesizing: You connect information from different sources into unified understanding\n- Proactive: You don't wait to be asked — you surface insights when you see them\n- Diplomatic: You deliver uncomfortable truths with care and constructive framing\n\nYour quirks:\n- You start insights with 'I noticed something...' or 'There is a pattern here...'\n- You keep a Decision Log — tracking what was decided, why, and what happened\n- You rate the confidence of your insights (high/medium/low confidence)\n- You end reports with 'Key Takeaway' and 'Open Questions' sections",
  "goals": [
    "Perform end-of-day review every night at 22:00 — read all completed tasks, session logs, costs, and messages",
    "Write end-of-day report to reports/YYYY-MM-DD-eod.md every night",
    "Draft tomorrow's morning briefing every night",
    "Query running agents about failures before writing the report",
    "Leave inbox messages for sleeping agents who need to explain anomalies",
    "Send morning knowledge briefings with yesterday's insights",
    "Track decisions and their outcomes across all projects",
    "Maintain a cross-project knowledge base of patterns and lessons"
  ],
  "relationships": {
    "Mic": "The boss. Eliyahu helps Mic see the big picture and make informed decisions. The EOD report is Mic's nightly summary — written for a busy person who needs the essential truth quickly.",
    "Fisher2050": "The Project Manager. Eliyahu receives daily summaries from Fisher2050 and processes them for cross-project insights. Notifies Fisher2050 when the EOD report is ready. Flags patterns Fisher2050 might miss.",
    "Ziggi": "The Architect. Eliyahu cross-references Ziggi's technical reviews with project outcomes. Tracks which architectural decisions worked and which did not.",
    "Machine Agents": "Data sources. Eliyahu reads machine logs and session journals to understand what happened and extract learnings. Queries them directly when anomalies need explanation."
  },
  "system_prompt": "You are operating as Eliyahu, the Knowledge Manager, within the PIA system. You have been woken for your nightly End-of-Day Review.\n\nYour job tonight:\n1. Read all completed and failed tasks from today using GET /api/tasks\n2. Read all agent session records using GET /api/mc/sessions\n3. Read your inbox using GET /api/messages/inbox/eliyahu\n4. Check the AI usage/cost for today using GET /api/ai-usage/today\n5. Analyse: what got done, what failed, what looks wrong\n6. If tasks failed, query the responsible agent if they are still running (POST /api/mc/agents/:id/respond), or leave them an inbox message if they are sleeping\n7. Write the end-of-day report to reports/[TODAY]-eod.md\n8. Write tomorrow's briefing draft to reports/[TOMORROW]-briefing-draft.md\n9. Send a message to Fisher2050's inbox: 'EOD report ready at reports/[TODAY]-eod.md'\n10. Terminate — your session should end after the report is written\n\nTone: You are Eliyahu. Thoughtful, pattern-seeking, diplomatically honest. Never generic. Always synthesize.",
  "config": {
    "eodTriggerTime": "22:00",
    "morningBriefingTime": "06:00",
    "weeklyReportDay": "sunday",
    "insightConfidenceMinimum": "medium",
    "trackDecisions": true,
    "crossProjectAnalysis": true,
    "maxAgentQueryWaitSeconds": 30,
    "reportOutputDir": "reports"
  }
}
```

---

### DB: agent_messages Table

Migration `044_agent_messages` adds:

```sql
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  to_agent TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  reply_body TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  read_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_am_to ON agent_messages(to_agent);
CREATE INDEX IF NOT EXISTS idx_am_from ON agent_messages(from_agent);
CREATE INDEX IF NOT EXISTS idx_am_read ON agent_messages(read);
CREATE INDEX IF NOT EXISTS idx_am_created ON agent_messages(created_at);
```

**Difference from existing `AgentBus`:** The `AgentBus` in `src/comms/agent-bus.ts` is in-memory only. Messages are lost on server restart. It is designed for real-time pub/sub between currently-running agents. `agent_messages` is the **persistent async inbox** — it survives restarts and is designed for agents that might not be running when the message is sent.

---

### TypeScript Interfaces

```typescript
// src/db/queries/agent-messages.ts

export interface AgentMessage {
  id: string;
  to_agent: string;
  from_agent: string;
  subject: string | null;
  body: string;
  read: number;         // 0 | 1
  replied: number;      // 0 | 1
  reply_body: string | null;
  created_at: number;
  read_at: number | null;
}

export interface SendMessageInput {
  to_agent: string;
  from_agent: string;
  subject?: string;
  body: string;
}

// Functions to implement:
export function sendAgentMessage(input: SendMessageInput): AgentMessage;
export function getInbox(agentId: string, unreadOnly?: boolean): AgentMessage[];
export function markRead(messageId: string): void;
export function sendReply(messageId: string, replyBody: string): void;
```

```typescript
// src/services/scheduler.ts

export interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  lastRun: number | null;
  nextRun: number;
  enabled: boolean;
}

export interface SchedulerConfig {
  eliyahuEOD: {
    enabled: boolean;
    cronExpression: string;   // default: '0 22 * * *'
    cwd: string;
    model: string;
    approvalMode: 'auto' | 'yolo';
  };
  fisherStandup: {
    enabled: boolean;
    cronExpression: string;   // default: '0 9 * * *'
  };
}
```

```typescript
// src/api/routes/agent-messages.ts

// GET  /api/agent-messages/inbox/:agentId          — get inbox (unread by default)
// GET  /api/agent-messages/inbox/:agentId?all=true — get all including read
// POST /api/agent-messages                         — send message
// POST /api/agent-messages/:id/read               — mark as read
// POST /api/agent-messages/:id/reply              — send reply, mark replied
```

---

### How SoulEngine Reads the Inbox

In `src/souls/soul-engine.ts`, the `generateSystemPrompt()` method currently loads memories and relationships. After the migration, it will also check `agent_messages`:

```typescript
// Addition to generateSystemPrompt() in SoulEngine

const unreadMessages = getInbox(soulId, true); // unreadOnly = true

if (unreadMessages.length > 0) {
  parts.push('## Unread Messages');
  parts.push(`You have ${unreadMessages.length} unread message(s). Read them carefully — some may require a reply.`);
  for (const msg of unreadMessages) {
    const date = new Date(msg.created_at * 1000).toLocaleString();
    parts.push(`\n### From: ${msg.from_agent} | ${date}`);
    if (msg.subject) parts.push(`**Subject:** ${msg.subject}`);
    parts.push(msg.body);
    parts.push(`*Message ID: ${msg.id} — reply with POST /api/agent-messages/${msg.id}/reply*`);
  }
  parts.push('');
}
```

The agent reads the messages as part of its context, handles them in the session, and marks them read either by tool call or automatically when the session ends.

---

## Part C: Practical Next Steps

**In exact build order — each step depends on the previous.**

---

### Step 1: Migration 044 — agent_messages table

**File:** `src/db/database.ts`
**Change:** Add migration `044_agent_messages` to the `getMigrations()` array, after `043_machine_power_state`.

```typescript
{
  name: '044_agent_messages',
  sql: `
    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      to_agent TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      replied INTEGER DEFAULT 0,
      reply_body TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_am_to ON agent_messages(to_agent);
    CREATE INDEX IF NOT EXISTS idx_am_from ON agent_messages(from_agent);
    CREATE INDEX IF NOT EXISTS idx_am_read ON agent_messages(read);
    CREATE INDEX IF NOT EXISTS idx_am_created ON agent_messages(created_at);
  `,
}
```

**Why first:** Everything else depends on this table existing.

---

### Step 2: DB Query Layer

**File:** `src/db/queries/agent-messages.ts` (NEW)
**What it does:** CRUD functions for `agent_messages`. Follows exact same pattern as `src/db/queries/machine-messages.ts`.

```typescript
import { getDatabase } from '../database.js';
import { nanoid } from 'nanoid';

export function sendAgentMessage(input: SendMessageInput): AgentMessage {
  const db = getDatabase();
  const id = nanoid();
  db.prepare(`
    INSERT INTO agent_messages (id, to_agent, from_agent, subject, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.to_agent, input.from_agent, input.subject ?? null, input.body);
  return getMessageById(id)!;
}

export function getInbox(agentId: string, unreadOnly = true): AgentMessage[] {
  const db = getDatabase();
  const sql = unreadOnly
    ? 'SELECT * FROM agent_messages WHERE to_agent = ? AND read = 0 ORDER BY created_at ASC'
    : 'SELECT * FROM agent_messages WHERE to_agent = ? ORDER BY created_at DESC';
  return db.prepare(sql).all(agentId) as AgentMessage[];
}

export function markRead(messageId: string): void {
  const db = getDatabase();
  db.prepare('UPDATE agent_messages SET read = 1, read_at = unixepoch() WHERE id = ?').run(messageId);
}

export function sendReply(messageId: string, replyBody: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE agent_messages SET replied = 1, reply_body = ?, read = 1, read_at = unixepoch() WHERE id = ?
  `).run(replyBody, messageId);
}
```

---

### Step 3: API Routes for Agent Messages

**File:** `src/api/routes/agent-messages.ts` (NEW)
**What it does:** REST endpoints for the inbox system. Follows the same pattern as `src/api/routes/messages.ts`.

Endpoints:
- `GET /api/agent-messages/inbox/:agentId` — fetch inbox (query param `?all=true` for all, default unread only)
- `POST /api/agent-messages` — send a new message
- `POST /api/agent-messages/:id/read` — mark read
- `POST /api/agent-messages/:id/reply` — send reply

**File:** `src/api/server.ts` (or wherever routes are registered)
**Change:** Mount the new router at `/api/agent-messages`.

---

### Step 4: SoulEngine Inbox Integration

**File:** `src/souls/soul-engine.ts`
**Change:** Import `getInbox` from `src/db/queries/agent-messages.ts`. In `generateSystemPrompt()`, after the memories block, add the unread messages block shown in Part B above.

This is the hook that makes inbox messages appear in every waking agent's context automatically. No agent needs to know the inbox exists — it just sees the messages as part of its world when it wakes.

---

### Step 5: Update Eliyahu's Personality File

**File:** `src/souls/personalities/eliyahu.json`
**Change:** Replace with the updated JSON shown in Part B. Key additions:
- Role updated to "Knowledge Manager & Intelligence Synthesizer"
- Goals now include explicit EOD review steps
- `system_prompt` now has the 10-step EOD procedure
- `config.eodTriggerTime` set to "22:00"
- `config.reportOutputDir` set to "reports"

**Note:** `seedSoul()` in the SoulEngine uses `INSERT OR IGNORE`, meaning it skips the update if the soul already exists. To force-update Eliyahu's personality, the seeder needs an upsert (or the personality file changes need to be applied manually via the API `PUT /api/souls/eliyahu`). Consider changing `seedSoul()` to always update non-DB-managed fields on restart.

---

### Step 6: Scheduler Service

**File:** `src/services/scheduler.ts` (NEW)
**What it does:** Wraps `node-cron` (or `cron` package) to trigger agent spawns on a schedule.

```typescript
import cron from 'node-cron';
import { getAgentSessionManager } from '../mission-control/agent-session.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

const logger = createLogger('Scheduler');

export function initScheduler(): void {
  if (!config.scheduler?.enabled) {
    logger.info('Scheduler disabled — set SCHEDULER_ENABLED=true to enable');
    return;
  }

  // Eliyahu EOD Review — 22:00 every day
  cron.schedule('0 22 * * *', async () => {
    logger.info('Scheduler: triggering Eliyahu EOD review');
    await spawnEliyahuEOD();
  }, { timezone: 'Australia/Sydney' }); // or config.scheduler.timezone

  logger.info('Scheduler initialized — Eliyahu EOD at 22:00');
}

async function spawnEliyahuEOD(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const mgr = getAgentSessionManager();

  const session = await mgr.spawn({
    task: `You are Eliyahu. Perform the End-of-Day Review for ${today}. Follow your system prompt instructions exactly. Start by reading today's completed and failed tasks, then agent sessions, then your inbox. Write the EOD report to reports/${today}-eod.md when done. Terminate after writing.`,
    mode: 'sdk',
    approvalMode: 'auto',
    soulId: 'eliyahu',
    cwd: config.server.cwd || process.cwd(),
    model: 'claude-opus-4-6',
    machineId: 'local',
  });

  logger.info(`Eliyahu EOD session started: ${session.id}`);
}
```

**Dependency:** `node-cron` package. Pure JS, no native code. Safe for Electron packaging.

---

### Step 7: Wire Scheduler into Startup

**File:** `src/index.ts`
**Change:** In `startHub()`, after the soul seeding block, add:

```typescript
// Start Scheduler (cron-based agent triggers)
logger.info('Starting Scheduler...');
const { initScheduler } = await import('./services/scheduler.js');
initScheduler();
```

Do not add to `startLocal()` — only the hub runs scheduled jobs. Workers should not independently spawn EOD agents.

---

### Step 8: Config Support

**File:** `src/config.ts`
**Change:** Add scheduler config block:

```typescript
scheduler: {
  enabled: process.env.SCHEDULER_ENABLED === 'true',
  timezone: process.env.SCHEDULER_TIMEZONE || 'UTC',
},
```

This lets individual machines opt in to running the scheduler via their `.env` file.

---

### Step 9: reports/ Directory

**File:** `reports/.gitkeep` (create empty file)
**Change:** Add `reports/` to `.gitignore` pattern for generated content:

```
reports/*.md
!reports/.gitkeep
```

This keeps the directory in git but ignores generated reports (which could be large and machine-specific).

---

### Step 10: SESSION_JOURNAL Update

After building, add to `SESSION_JOURNAL_2026-02-20.md`:

- New migration: `044_agent_messages` — persistent async inbox for inter-agent messaging
- New DB query file: `src/db/queries/agent-messages.ts`
- New API routes: `GET/POST /api/agent-messages` family
- Modified: `src/souls/soul-engine.ts` — inbox injection into system prompt
- Modified: `src/souls/personalities/eliyahu.json` — EOD role + system prompt
- New service: `src/services/scheduler.ts` — cron scheduler for Eliyahu EOD
- Modified: `src/index.ts` — scheduler init in hub startup
- New config: `SCHEDULER_ENABLED` (default: false), `SCHEDULER_TIMEZONE` (default: UTC)
- New dep: `node-cron` (pure JS, no native addons, safe for Electron)

---

## Quick Reference: The Two Messaging Systems

| System | File | Storage | Survives Restart | For |
|---|---|---|---|---|
| `AgentBus` | `src/comms/agent-bus.ts` | In-memory Map | No | Real-time pub/sub between running agents |
| `agent_messages` | `src/db/queries/agent-messages.ts` | SQLite | Yes | Async inbox for sleeping agents |

Both are needed. They solve different problems. Do not try to collapse them into one.

---

## The Eliyahu Pattern — Summary

Eliyahu is not a daemon that watches things 24/7. She is a **nightly ritual** — a deliberate, scheduled process that synthesizes the day's work into understanding. Like a human knowledge manager who arrives at the end of day, reads everything, talks to whoever is still in the office, and writes the briefing for tomorrow.

The architecture that makes this work:

1. **Scheduler** kicks off the spawn at 22:00
2. **SoulEngine** loads her personality + memories + unread inbox as context
3. **Agent session** runs her through the EOD procedure via the SDK
4. **She queries running agents** via the respond endpoint where possible
5. **She leaves messages** for sleeping agents via `agent_messages`
6. **She writes the report** using the file write tool
7. **She terminates** — ephemeral by design

The async inbox (`agent_messages`) is the connective tissue that allows agents to communicate across time — not just across machines.
