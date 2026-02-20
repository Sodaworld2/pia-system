# PIA Implementation Spec — Fisher2050, Google Calendar, Google Tasks
**Written by Claude Sonnet 4.6 | 2026-02-20**
**Purpose: Practical, buildable spec — TypeScript interfaces, DB schemas, API signatures, function stubs**

---

## Section 1: What's Already Built (Audit)

### 1.1 Soul System

| File | Status | Notes |
|------|--------|-------|
| `src/souls/soul-engine.ts` | **Working** | Full CRUD: `getSoul()`, `createSoul()`, `updateSoul()`, `generateSystemPrompt()`, `seedSoul()`. Singleton via `getSoulEngine()`. |
| `src/souls/seed-souls.ts` | **Working** | Seeds `fisher2050.json`, `ziggi.json`, `eliyahu.json` on startup. |
| `src/souls/personalities/fisher2050.json` | **Working** | Full soul def: identity, personality, goals, relationships, system_prompt, config (`dailyReviewTime`, `eveningSummaryTime`, etc). |
| `src/souls/personalities/ziggi.json` | **Working** | Full soul def with `deepReviewTime: "02:00"` config. |
| `src/souls/personalities/eliyahu.json` | **Working** | Full soul def with `morningBriefingTime: "06:00"` config. |
| `src/api/routes/souls.ts` | **Working** | REST CRUD for souls + memories + interactions. |
| DB migration `003_agent_souls` | **Applied** | Tables: `souls`, `soul_memories`, `soul_interactions`. |

**Gap:** Soul `config` field stores Fisher2050's schedule times (`dailyReviewTime`, `eveningSummaryTime`) but nothing reads them to drive actual cron scheduling. The config is inert JSON today.

### 1.2 Task Queue

| File | Status | Notes |
|------|--------|-------|
| `src/orchestrator/task-queue.ts` | **Working** | Full queue: `enqueue()`, `dequeue()`, `assign()`, `complete()`, `fail()`, priority ordering, dependency blocking. |
| `src/api/routes/tasks.ts` | **Working** | Full REST API: POST/GET tasks, engine start/stop. |
| DB migration `001_initial_schema` | **Applied** | `tasks` table with `blocked_by`, `blocks`, `priority`. |

**Gap:** No `project_id` on PIA's core `tasks` table. Fisher2050's own DB (`fisher2050/src/db.ts`) has a separate `tasks` table with `project_id`, `google_task_id`, `assigned_to`, `due_date` — these are not the same table. Two parallel task systems exist and are not synced.

### 1.3 Autonomous Worker (Fisher2050's Execution Engine)

| File | Status | Notes |
|------|--------|-------|
| `src/orchestrator/autonomous-worker.ts` | **Working** | Full Claude API tool-loop. `runAutonomousTask()` accepts `soulId` for soul injection. Tools: `run_command`, `read_file`, `write_file`, `list_directory`, `report_progress`. Budget + turn limits. |
| `src/orchestrator/execution-engine.ts` | **Working** | Polls task queue every 5s, calls `AIRouter`, not `AutonomousWorker`. Separate code path. |

**Key distinction:** `ExecutionEngine` routes through `AIRouter` (simple text completion). `runAutonomousTask()` is the full tool-loop agent. Fisher2050 should use `runAutonomousTask()` directly, not `ExecutionEngine`.

### 1.4 Agent Bus

| File | Status | Notes |
|------|--------|-------|
| `src/comms/agent-bus.ts` | **Working** | In-memory pub/sub: `send()`, `broadcast()`, `subscribe()`. Messages not persisted across restarts. |

**Gap:** No durable message persistence. AgentBus is ephemeral — if the server restarts, all queued messages are lost.

### 1.5 Fisher2050 Standalone App (`fisher2050/`)

| File | Status | Notes |
|------|--------|-------|
| `fisher2050/src/index.ts` | **Working** | Standalone Express server on port 3002. |
| `fisher2050/src/scheduler/scheduler.ts` | **Working** | `node-cron` scheduling for 9am standup, 6am Eliyahu, 2am Ziggi, 6pm summary. Seeds `scheduled_jobs` table. Executes via `PiaClient.runTask()`. |
| `fisher2050/src/integrations/pia.ts` | **Working** | `PiaClient` — REST client that calls PIA API (`/api/orchestrator/run`, `/api/souls/*`, `/api/tasks`). |
| `fisher2050/src/ai/daily-review.ts` | **Working** | `runDailyReview()` — SQL-based overdue/risk analysis, health score calculation. |
| `fisher2050/src/db.ts` | **Working** | Own SQLite DB (`fisher2050.db`). Tables: `projects`, `tasks`, `meetings`, `reports`, `activity_log`, `scheduled_jobs`. |

**Key problem:** Fisher2050 runs as a **completely separate process** (port 3002). It has its own DB disconnected from PIA's main DB. The `tasks` table in `fisher2050.db` is not the same as `tasks` in `pia.db`. This split must be resolved for a unified system.

**Architecture decision needed:** Should Fisher2050 be merged into PIA's main server (recommended) or kept as a sidecar? This spec recommends **merging** — Fisher2050 becomes a service inside PIA's main process, not a separate app.

### 1.6 Google Calendar / Tasks

| File | Status | Notes |
|------|--------|-------|
| Any Google integration | **Does not exist** | No OAuth routes, no Google API calls, no `calendar_events` table, no `integrations` table. `google_event_id` column exists in `fisher2050/src/db.ts` meetings table — placeholder only, never populated. `google_task_id` column exists in Fisher2050's tasks table — same situation. |

### 1.7 Scheduling / Cron

| File | Status | Notes |
|------|--------|-------|
| `fisher2050/src/scheduler/scheduler.ts` | **Working (in sidecar)** | node-cron jobs exist but only in the Fisher2050 standalone app. PIA's main server has no cron. |
| PIA main server cron | **Does not exist** | `src/index.ts` has no cron or timer-based agent scheduling. |

### 1.8 What Is Genuinely Missing (Critical Gaps)

1. **Google OAuth flow** — no routes, no token storage, no scope definitions
2. **`calendar_events` table** — the bridge between Google Calendar and PIA task spawning
3. **`integrations` table** — for storing OAuth tokens per user/service
4. **CalendarWatcher service** — polls Google Calendar every N minutes, triggers agent spawns
5. **Fisher2050 merged into PIA** — cron scheduling not wired into main PIA server
6. **`PATCH /api/tasks/:id`** — task update endpoint missing (only complete/fail/assign exist)
7. **Google Tasks sync service** — no file, no routes

---

## Section 2: Fisher2050 — Project Manager Agent

### 2a. Soul Definition (Complete, Verified from Audit)

The soul definition already exists in `src/souls/personalities/fisher2050.json` and is seeded at startup. The definition is solid. No changes needed to the JSON itself.

For reference, the complete soul structure the system already seeds:

```json
{
  "id": "fisher2050",
  "name": "Fisher2050",
  "role": "Project Manager",
  "email": "fisher2050@sodaworld.com",
  "personality": "...(organised, proactive, action-oriented, uses confidence percentages)...",
  "goals": [
    "Keep all projects on track with clear status visibility",
    "Ensure every task has an owner, deadline, and priority",
    "Run daily reviews — flag overdue items and nudge owners",
    "Coordinate between agents (Ziggi for reviews, Eliyahu for knowledge)",
    "Send morning briefings and end-of-day summaries",
    "Maintain project documentation and decision logs"
  ],
  "relationships": {
    "Mic": "The boss. Ultimate decision-maker.",
    "Ziggi": "The Architect. Fisher2050 triggers Ziggi for code reviews.",
    "Eliyahu": "The Knowledge Manager. Fisher2050 sends daily summaries.",
    "Machine Agents": "The workers. Fisher2050 assigns tasks to machines."
  },
  "config": {
    "dailyReviewTime": "09:00",
    "eveningSummaryTime": "18:00",
    "followUpIntervalHours": 4,
    "maxTasksPerAgent": 5,
    "confidenceThreshold": 0.7
  }
}
```

**What DOES need to change:** The `email` field says `fisher2050@sodaworld.com` but `MASTER_VISION.md` specifies `fisher2050@sodalabs.ai`. Update the JSON.

### 2b. Trigger Logic — How Fisher2050 Wakes Up

Fisher2050 is **ephemeral** — it spawns, does its work, terminates. It never runs as a daemon. The triggers are:

**Trigger 1: Morning Standup (9:00 AM)**
```
node-cron "0 9 * * *"
  → runAutonomousTask({
      id: nanoid(),
      description: buildStandupPrompt(),
      soulId: 'fisher2050',
      model: 'claude-sonnet-4-5-20250929',
      maxBudgetUsd: 1.0,
      maxTurns: 20
    })
```

The `buildStandupPrompt()` function constructs context from live DB state:
```typescript
function buildStandupPrompt(): string {
  const queue = getTaskQueue();
  const pending = queue.getPending();
  const inProgress = queue.getAll('in_progress');
  const overdueCount = pending.filter(t => t.due_date && t.due_date < now).length;

  return `You are running the morning standup review.

Current task queue:
- Pending: ${pending.length} tasks
- In progress: ${inProgress.length} tasks
- Overdue: ${overdueCount} tasks

Your jobs:
1. Review the full task list
2. Identify blocked, overdue, or at-risk items
3. For each actionable item, call POST /api/tasks to create follow-up tasks
4. Send a summary (use report_progress with your Fisher2050 confidence percentage)
5. If any tasks are unassigned and high-priority, spawn the relevant agent via POST /api/orchestrator/run`;
}
```

**Trigger 2: Evening Summary (6:00 PM)**
```
node-cron "0 18 * * *"
  → runAutonomousTask({
      description: buildEveningSummaryPrompt(),
      soulId: 'fisher2050',
      maxBudgetUsd: 0.5
    })
```

**Trigger 3: On-Demand (Human Messages Fisher2050)**
```
POST /api/fisher/run { task: "...", context?: "..." }
  → runAutonomousTask({ description: task, soulId: 'fisher2050' })
```

**Trigger 4: On Task Completion (Another Agent Completes)**
```
AgentBus.subscribe('fisher2050', (msg) => {
  if (msg.metadata?.event === 'task_completed') {
    // Fisher2050 queues next task for that agent
    fisherhostScheduleNextTask(msg.metadata.taskId)
  }
})
```

This subscription is started once at server boot in the FisherService.

### 2c. Fisher2050 Tools — What It Calls

Fisher2050 runs via `runAutonomousTask()` which gives it these local tools: `run_command`, `read_file`, `write_file`, `list_directory`, `report_progress`.

But Fisher2050 needs to call the PIA REST API. The cleanest approach: **inject PIA API calls as curl commands that Fisher2050 executes via `run_command`**. This works immediately because `run_command` is already available.

Alternatively, add PIA-specific tools to the AutonomousWorker when the soul is `fisher2050`. The tool definitions below should be added to `autonomous-worker.ts` as Fisher2050-specific tools:

```typescript
// In autonomous-worker.ts, add to TOOLS array when soulId === 'fisher2050':
const FISHER_TOOLS: ToolDefinition[] = [
  {
    name: 'list_tasks',
    description: 'List tasks from the PIA task queue. Filter by status and agent.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: 'Filter by status' },
        agent: { type: 'string', description: 'Filter by assigned agent ID' },
      },
      required: [],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in the PIA task queue.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Detailed task description' },
        priority: { type: 'number', description: '1 (lowest) to 5 (highest), default 3' },
        assignedAgent: { type: 'string', description: 'Soul ID of the agent to assign (e.g. ziggi, eliyahu, farcake)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Update a task status or fields in the PIA task queue.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to update' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
        output: { type: 'string', description: 'Output/result text to store with the task' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'spawn_agent',
    description: 'Spawn a PIA autonomous agent to work on a task. Use this to dispatch Ziggi, Eliyahu, Farcake, Andy, etc.',
    input_schema: {
      type: 'object',
      properties: {
        soulId: { type: 'string', description: 'Which soul to spawn: ziggi, eliyahu, farcake, andy, fisher2050' },
        task: { type: 'string', description: 'Task description for the agent' },
        projectDir: { type: 'string', description: 'Working directory for the agent' },
        maxBudgetUsd: { type: 'number', description: 'Budget limit in USD (default 1.0)' },
      },
      required: ['soulId', 'task'],
    },
  },
  {
    name: 'list_running_agents',
    description: 'Check which agents are currently running across all machines.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Schedule an agent spawn on Google Calendar for a future time.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title (should include agent name, e.g. "[ZIGGI] Code Review")' },
        agentSoulId: { type: 'string', description: 'Soul ID of the agent to spawn at event time' },
        taskContext: { type: 'string', description: 'Full task description for the agent' },
        startTime: { type: 'string', description: 'ISO 8601 datetime, e.g. 2026-02-21T14:00:00+02:00' },
        durationMinutes: { type: 'number', description: 'Expected duration in minutes (default 60)' },
        machinePreference: { type: 'string', enum: ['any', 'm1', 'm2', 'm3'], description: 'Which machine to run on' },
      },
      required: ['title', 'agentSoulId', 'taskContext', 'startTime'],
    },
  },
];
```

**Tool execution handlers** (add to `executeTool()` in autonomous-worker.ts):

```typescript
case 'list_tasks': {
  const db = getDatabase();
  const statusFilter = input.status as string | undefined;
  const agentFilter = input.agent as string | undefined;
  let rows;
  if (agentFilter) {
    rows = db.prepare('SELECT * FROM tasks WHERE agent_id = ? ORDER BY priority DESC, created_at DESC LIMIT 50').all(agentFilter);
  } else if (statusFilter) {
    rows = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at DESC LIMIT 50').all(statusFilter);
  } else {
    rows = db.prepare('SELECT * FROM tasks ORDER BY priority DESC, created_at DESC LIMIT 50').all();
  }
  return JSON.stringify(rows, null, 2);
}

case 'create_task': {
  const queue = getTaskQueue();
  const created = queue.enqueue({
    title: input.title as string,
    description: input.description as string | undefined,
    priority: input.priority as number | undefined,
    assignedAgent: input.assignedAgent as string | undefined,
  });
  return JSON.stringify(created);
}

case 'update_task': {
  const db = getDatabase();
  const taskId = input.taskId as string;
  const status = input.status as string | undefined;
  const output = input.output as string | undefined;
  if (status === 'completed') {
    getTaskQueue().complete(taskId, output);
  } else if (status === 'failed') {
    getTaskQueue().fail(taskId, output || 'Failed by Fisher2050');
  } else if (status) {
    db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Math.floor(Date.now() / 1000), taskId);
  }
  return JSON.stringify(getTaskQueue().getById(taskId));
}

case 'spawn_agent': {
  const { runAutonomousTask } = await import('../orchestrator/autonomous-worker.js');
  const spawnTaskId = nanoid();
  // Fire and forget — Fisher2050 doesn't wait for it
  runAutonomousTask({
    id: spawnTaskId,
    description: input.task as string,
    soulId: input.soulId as string,
    projectDir: input.projectDir as string | undefined,
    maxBudgetUsd: (input.maxBudgetUsd as number) || 1.0,
    maxTurns: 30,
  }).catch(err => logger.error(`Spawned agent failed: ${err}`));
  return JSON.stringify({ taskId: spawnTaskId, status: 'spawned', soulId: input.soulId });
}

case 'list_running_agents': {
  const { getActiveTasks } = await import('../orchestrator/autonomous-worker.js');
  const activeTasks = getActiveTasks();
  return JSON.stringify({ activeTasks, count: activeTasks.length });
}

case 'create_calendar_event': {
  // Calls the calendar integration route (Section 3)
  const response = await fetch('http://localhost:3000/api/integrations/google/calendar/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Token': process.env.PIA_SECRET_TOKEN || '' },
    body: JSON.stringify({
      title: input.title,
      agentSoulId: input.agentSoulId,
      taskContext: input.taskContext,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes || 60,
      machinePreference: input.machinePreference || 'any',
    }),
  });
  return JSON.stringify(await response.json());
}
```

### 2d. Fisher2050 Decision Loop (Full Pseudocode)

```
TRIGGER: 9am cron fires

1. runAutonomousTask() → loads soul 'fisher2050' → injects full system prompt with memories

2. Fisher's system prompt includes:
   "You are running the daily standup. Call list_tasks to see the queue.
    Then call list_running_agents to see what's active.
    Then make decisions and take actions."

3. CLAUDE LOOP (up to 20 turns):

   Turn 1:
   → Tool: list_tasks(status='pending')
   → Gets: 12 pending tasks with priorities

   Turn 2:
   → Tool: list_tasks(status='in_progress')
   → Gets: 3 active tasks with agents

   Turn 3:
   → Tool: list_running_agents()
   → Gets: ['task-abc', 'task-def'] — 2 autonomous workers running

   Turn 4 (decision: spawn Ziggi if no review pending):
   → Tool: spawn_agent({
       soulId: 'ziggi',
       task: 'Post-session review of PIA codebase changes from last 24h',
       projectDir: 'C:/Users/mic/Downloads/pia-system'
     })
   → Gets: { taskId: 'xyz', status: 'spawned' }

   Turn 5 (decision: create task for high-priority item):
   → Tool: create_task({
       title: 'Complete Google Calendar OAuth integration',
       priority: 5,
       assignedAgent: 'fisher2050'
     })

   Turn 6 (decision: schedule future agent via calendar):
   → Tool: create_calendar_event({
       title: '[ELIYAHU] Knowledge synthesis — this week',
       agentSoulId: 'eliyahu',
       taskContext: 'Process this week session journals and generate insights',
       startTime: '2026-02-21T06:00:00+02:00',
       machinePreference: 'm1'
     })

   Turn 7 (report status):
   → Tool: report_progress({
       status: 'completed',
       message: `Fisher2050 Standup 09:00\n- 12 pending tasks (3 overdue)\n- Spawned Ziggi for review\n- 1 calendar event scheduled\nProject health: 74%`
     })

4. LOOP ENDS → soul memory saved: "Ran standup. 12 pending. Health 74%."
5. Worker terminates. Cost recorded.
```

### 2e. New File: `src/services/fisher-service.ts`

This file merges Fisher2050's standalone app functionality into PIA's main process. It replaces the need for a separate Fisher2050 process.

```typescript
/**
 * FisherService — Fisher2050 integrated into PIA's main process
 *
 * Replaces fisher2050/ standalone app for the core scheduling.
 * Runs cron jobs that invoke runAutonomousTask() with fisher2050 soul.
 */
import cron from 'node-cron';
import { nanoid } from 'nanoid';
import { runAutonomousTask } from '../orchestrator/autonomous-worker.js';
import { getSoulEngine } from '../souls/soul-engine.js';
import { getTaskQueue } from '../orchestrator/task-queue.js';
import { getAgentBus } from '../comms/agent-bus.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('FisherService');

export interface FisherServiceConfig {
  standupCron: string;       // default: '0 9 * * *'
  eveningCron: string;       // default: '0 18 * * *'
  ziggiCron: string;         // default: '0 2 * * *'
  eliyahuCron: string;       // default: '0 6 * * *'
  timezone: string;          // default: 'Asia/Jerusalem'
  maxBudgetPerJob: number;   // default: 1.0
  model: string;             // default: 'claude-sonnet-4-5-20250929'
}

export class FisherService {
  private config: FisherServiceConfig;
  private jobs: cron.ScheduledTask[] = [];
  private running = false;

  constructor(config?: Partial<FisherServiceConfig>) {
    this.config = {
      standupCron: config?.standupCron ?? '0 9 * * *',
      eveningCron: config?.eveningCron ?? '0 18 * * *',
      ziggiCron: config?.ziggiCron ?? '0 2 * * *',
      eliyahuCron: config?.eliyahuCron ?? '0 6 * * *',
      timezone: config?.timezone ?? 'Asia/Jerusalem',
      maxBudgetPerJob: config?.maxBudgetPerJob ?? 1.0,
      model: config?.model ?? 'claude-sonnet-4-5-20250929',
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.scheduleJob('Fisher2050 Standup', this.config.standupCron, 'fisher2050', this.buildStandupPrompt.bind(this));
    this.scheduleJob('Fisher2050 Evening', this.config.eveningCron, 'fisher2050', this.buildEveningPrompt.bind(this));
    this.scheduleJob('Ziggi Deep Review', this.config.ziggiCron, 'ziggi', this.buildZiggiPrompt.bind(this));
    this.scheduleJob('Eliyahu Morning', this.config.eliyahuCron, 'eliyahu', this.buildEliyahuPrompt.bind(this));

    // Subscribe to task completion events
    this.subscribeToTaskCompletions();

    logger.info('FisherService started — 4 cron jobs scheduled');
  }

  stop(): void {
    this.jobs.forEach(j => j.stop());
    this.jobs = [];
    this.running = false;
    logger.info('FisherService stopped');
  }

  /** Run Fisher2050 on-demand (e.g. from POST /api/fisher/run) */
  async runOnDemand(taskDescription: string): Promise<string> {
    const taskId = nanoid();
    const result = await runAutonomousTask({
      id: taskId,
      description: taskDescription,
      soulId: 'fisher2050',
      model: this.config.model,
      maxBudgetUsd: this.config.maxBudgetPerJob,
      maxTurns: 25,
    });
    return result.taskId;
  }

  private scheduleJob(name: string, cronExpr: string, soulId: string, promptBuilder: () => string): void {
    const job = cron.schedule(cronExpr, async () => {
      logger.info(`[FisherService] Running: ${name}`);
      try {
        await runAutonomousTask({
          id: nanoid(),
          description: promptBuilder(),
          soulId,
          model: this.config.model,
          maxBudgetUsd: this.config.maxBudgetPerJob,
          maxTurns: 25,
        });
      } catch (err) {
        logger.error(`[FisherService] ${name} failed: ${err}`);
      }
    }, { timezone: this.config.timezone });

    this.jobs.push(job);
    logger.info(`[FisherService] Scheduled: ${name} (${cronExpr})`);
  }

  private subscribeToTaskCompletions(): void {
    const bus = getAgentBus();
    bus.subscribe('*', (msg) => {
      if (msg.metadata?.event === 'task_completed' && msg.metadata?.taskId) {
        // Fisher2050 reacts to task completions asynchronously
        const taskId = msg.metadata.taskId as string;
        this.onTaskCompleted(taskId).catch(err =>
          logger.error(`FisherService task-complete handler error: ${err}`)
        );
      }
    });
  }

  private async onTaskCompleted(completedTaskId: string): Promise<void> {
    const queue = getTaskQueue();
    const task = queue.getById(completedTaskId);
    if (!task) return;

    // If Ziggi completed a review, Fisher2050 creates follow-up tasks
    if (task.agent_id === 'ziggi') {
      const nextTask = queue.dequeue();
      if (nextTask) {
        logger.info(`[FisherService] Ziggi done — queuing next task: ${nextTask.title}`);
        queue.assign(nextTask.id, nextTask.agent_id || 'fisher2050');
      }
    }
  }

  // Prompt builders — these get the current state from DB
  private buildStandupPrompt(): string {
    const queue = getTaskQueue();
    const pending = queue.getPending();
    const inProgress = queue.getAll('in_progress');
    const now = Math.floor(Date.now() / 1000);
    const overdue = pending.filter(t => (t as any).due_date && (t as any).due_date < now);

    return `FISHER2050 MORNING STANDUP — ${new Date().toISOString().split('T')[0]}

Current queue state:
- ${pending.length} pending tasks
- ${inProgress.length} in-progress tasks
- ${overdue.length} overdue tasks

Your jobs for this standup:
1. Call list_tasks(status='pending') to review all pending work
2. Call list_tasks(status='in_progress') to check active work
3. Call list_running_agents() to see machine capacity
4. For each high-priority (priority 4-5) unblocked task with no assigned agent: call spawn_agent()
5. For tasks that are overdue: call create_task() to create follow-up or escalation tasks
6. Check if Ziggi needs to run (if > 24h since last code review): call spawn_agent({soulId:'ziggi',...})
7. Call report_progress() with your Fisher2050 standup summary including project health percentage
8. If any tasks should be scheduled for later, call create_calendar_event()

Stay in character as Fisher2050. End with "Project health: X%" based on your assessment.`;
  }

  private buildEveningPrompt(): string {
    const queue = getTaskQueue();
    const completed = queue.getAll('completed');
    const recentCompleted = completed.filter(t => {
      const dayAgo = Math.floor(Date.now() / 1000) - 86400;
      return t.completed_at && t.completed_at > dayAgo;
    });

    return `FISHER2050 EVENING SUMMARY — ${new Date().toISOString().split('T')[0]}

Tasks completed today: ${recentCompleted.length}

Your jobs:
1. Call list_tasks(status='completed') to review today's achievements
2. Call list_tasks(status='pending') to identify tomorrow's priorities
3. Produce an evening summary report via report_progress()
4. If Eliyahu hasn't run today, call spawn_agent({soulId:'eliyahu',...})
5. Schedule tomorrow's priority work via create_calendar_event() if needed

End with your project health percentage and a "see you tomorrow" sign-off.`;
  }

  private buildZiggiPrompt(): string {
    return `ZIGGI DEEP REVIEW — ${new Date().toISOString().split('T')[0]} 02:00

You are Ziggi. Run the nightly code review.

1. run_command: git log --oneline --since='24 hours ago' to see recent changes
2. For each changed file that matters: read_file to review the code
3. Assess: code quality (1-10), naming, patterns, potential issues, technical debt
4. write_file a review report to the session journal
5. If issues found: call create_task() to queue remediation tasks
6. report_progress() with your Ziggi's Verdict

Be meticulous. Check architecture smells. Stay in character as Ziggi.`;
  }

  private buildEliyahuPrompt(): string {
    return `ELIYAHU MORNING BRIEFING — ${new Date().toISOString().split('T')[0]} 06:00

You are Eliyahu. Process yesterday's intelligence.

1. read_file any session journals from the last 24 hours
2. list_tasks to see what was completed and what's pending
3. Identify patterns across projects and decisions
4. Generate your morning briefing (2 minutes to read, 3 key insights)
5. report_progress() with the briefing in your Eliyahu style
6. End with your "Key Takeaway" and "Open Questions" sections

Stay curious. Connect dots. Stay in character as Eliyahu.`;
  }
}

// Singleton
let fisherService: FisherService | null = null;

export function getFisherService(): FisherService {
  if (!fisherService) fisherService = new FisherService();
  return fisherService;
}

export function initFisherService(config?: Partial<FisherServiceConfig>): FisherService {
  fisherService = new FisherService(config);
  return fisherService;
}
```

---

## Section 3: Google Calendar Integration

### 3a. OAuth Setup

**Required npm packages:**
```bash
npm install googleapis google-auth-library
npm install --save-dev @types/googleapis  # (types are included with googleapis)
```

**Google OAuth scopes needed:**
```typescript
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',         // read + write calendar events
  'https://www.googleapis.com/auth/calendar.events',  // narrower: just events (prefer this)
  'https://www.googleapis.com/auth/tasks',            // read + write tasks
];
```

**Environment variables required:**
```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
```

**Google Cloud Console setup steps (human does once):**
1. Create project at console.cloud.google.com
2. Enable "Google Calendar API" + "Google Tasks API"
3. Create OAuth 2.0 credentials (Web Application type)
4. Add redirect URI: `http://localhost:3000/api/integrations/google/callback`
5. Copy client ID + secret to `.env`

### 3b. New DB Tables: `integrations` and `calendar_events`

Add migration `044_google_integrations` to `src/db/database.ts`:

```typescript
{
  name: '044_google_integrations',
  sql: `
    -- OAuth token storage for external integrations
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,               -- e.g. 'google-main'
      service TEXT NOT NULL,             -- 'google'
      user_label TEXT NOT NULL,          -- 'Mic' (human-readable)
      access_token TEXT,
      refresh_token TEXT,
      token_expiry INTEGER,              -- unix timestamp when access_token expires
      scope TEXT,                        -- space-separated OAuth scopes granted
      google_email TEXT,                 -- the Google account email (from token info)
      calendar_id TEXT DEFAULT 'primary', -- which Google Calendar to use
      tasks_list_id TEXT,                -- which Google Tasks list to sync to
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Calendar events: bridge between Google Calendar and PIA agent spawns
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      google_event_id TEXT UNIQUE,       -- Google's event ID (null if PIA-only)
      integration_id TEXT REFERENCES integrations(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time INTEGER NOT NULL,       -- unix timestamp
      end_time INTEGER,                  -- unix timestamp
      duration_minutes INTEGER DEFAULT 60,
      agent_soul_id TEXT,                -- which soul to spawn (e.g. 'fisher2050', 'ziggi')
      task_context TEXT,                 -- full task description for the agent
      machine_preference TEXT DEFAULT 'any' CHECK(machine_preference IN ('any', 'm1', 'm2', 'm3')),
      status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'triggered', 'running', 'completed', 'cancelled', 'failed')),
      spawned_task_id TEXT,              -- autonomous-worker task ID after spawn
      error_message TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_integrations_service ON integrations(service);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_google_id ON calendar_events(google_event_id);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_agent ON calendar_events(agent_soul_id);
  `,
},
```

### 3c. CalendarWatcher Service

Create `src/services/calendar-watcher.ts`:

```typescript
/**
 * CalendarWatcher — Polls Google Calendar and triggers agent spawns
 *
 * Every 5 minutes, checks for upcoming calendar events that have
 * agent_soul_id set. When an event is within 2 minutes of its start time,
 * spawns the agent and marks the event as triggered.
 */
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getDatabase } from '../db/database.js';
import { runAutonomousTask } from '../orchestrator/autonomous-worker.js';
import { getAgentBus } from '../comms/agent-bus.js';
import { createLogger } from '../utils/logger.js';
import { nanoid } from 'nanoid';

const logger = createLogger('CalendarWatcher');

export interface CalendarWatcherConfig {
  pollIntervalMs: number;     // default: 5 * 60 * 1000 (5 minutes)
  triggerWindowMs: number;    // how close to event start to trigger (default: 2 * 60 * 1000 = 2 min)
  lookAheadMs: number;        // how far ahead to fetch events (default: 30 * 60 * 1000 = 30 min)
  defaultModel: string;       // default: 'claude-sonnet-4-5-20250929'
  defaultMaxBudget: number;   // default: 1.0
  defaultMaxTurns: number;    // default: 30
}

// DB row shapes
interface IntegrationRow {
  id: string;
  service: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
  google_email: string | null;
  calendar_id: string | null;
}

interface CalendarEventRow {
  id: string;
  google_event_id: string | null;
  title: string;
  start_time: number;
  agent_soul_id: string | null;
  task_context: string | null;
  machine_preference: string;
  status: string;
}

export class CalendarWatcher {
  private config: CalendarWatcherConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config?: Partial<CalendarWatcherConfig>) {
    this.config = {
      pollIntervalMs: config?.pollIntervalMs ?? 5 * 60 * 1000,
      triggerWindowMs: config?.triggerWindowMs ?? 2 * 60 * 1000,
      lookAheadMs: config?.lookAheadMs ?? 30 * 60 * 1000,
      defaultModel: config?.defaultModel ?? 'claude-sonnet-4-5-20250929',
      defaultMaxBudget: config?.defaultMaxBudget ?? 1.0,
      defaultMaxTurns: config?.defaultMaxTurns ?? 30,
    };
  }

  startWatching(): void {
    if (this.running) return;
    this.running = true;

    // Run immediately, then on interval
    this.checkUpcomingEvents().catch(err => logger.error(`CalendarWatcher initial check failed: ${err}`));

    this.intervalId = setInterval(() => {
      this.checkUpcomingEvents().catch(err => logger.error(`CalendarWatcher poll failed: ${err}`));
    }, this.config.pollIntervalMs);

    logger.info(`CalendarWatcher started (poll: ${this.config.pollIntervalMs / 1000}s)`);
  }

  stopWatching(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('CalendarWatcher stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Main polling function. Called every N minutes.
   * Checks Google Calendar + local calendar_events table for upcoming events.
   */
  async checkUpcomingEvents(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();
    const windowEnd = now + Math.floor(this.config.lookAheadMs / 1000);

    // Step 1: Sync from Google Calendar (if integration exists)
    await this.syncFromGoogleCalendar(now, windowEnd);

    // Step 2: Check local calendar_events for events to trigger
    const db = getDatabase();
    const upcoming = db.prepare(`
      SELECT * FROM calendar_events
      WHERE status = 'scheduled'
        AND start_time BETWEEN ? AND ?
        AND agent_soul_id IS NOT NULL
      ORDER BY start_time ASC
    `).all(now, windowEnd) as CalendarEventRow[];

    for (const event of upcoming) {
      const msUntilEvent = (event.start_time * 1000) - nowMs;

      // Trigger if within the trigger window
      if (msUntilEvent <= this.config.triggerWindowMs) {
        await this.triggerEvent(event);
      }
    }
  }

  /**
   * Pull upcoming events from Google Calendar and upsert into local calendar_events.
   */
  private async syncFromGoogleCalendar(fromUnix: number, toUnix: number): Promise<void> {
    const integration = this.getGoogleIntegration();
    if (!integration?.access_token) return;

    try {
      const auth = this.buildOAuth2Client(integration);
      const cal = google.calendar({ version: 'v3', auth });

      const response = await cal.events.list({
        calendarId: integration.calendar_id || 'primary',
        timeMin: new Date(fromUnix * 1000).toISOString(),
        timeMax: new Date(toUnix * 1000).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      for (const gEvent of events) {
        await this.upsertGoogleEvent(gEvent, integration.id);
      }
    } catch (err) {
      logger.warn(`Failed to sync from Google Calendar: ${err}`);
    }
  }

  /**
   * Upsert a Google Calendar event into local calendar_events.
   * Only upserts events that have PIA metadata in the description.
   */
  private async upsertGoogleEvent(gEvent: calendar_v3.Schema$Event, integrationId: string): Promise<void> {
    if (!gEvent.id || !gEvent.start) return;

    // Parse PIA metadata from event description
    // Expected format: description contains JSON block: <!-- PIA: {...} -->
    const piaData = this.parsePiaMetadata(gEvent.description || '');

    const db = getDatabase();
    const startTime = gEvent.start.dateTime
      ? Math.floor(new Date(gEvent.start.dateTime).getTime() / 1000)
      : Math.floor(new Date(gEvent.start.date!).getTime() / 1000);
    const endTime = gEvent.end?.dateTime
      ? Math.floor(new Date(gEvent.end.dateTime).getTime() / 1000)
      : null;

    const existing = db.prepare('SELECT id FROM calendar_events WHERE google_event_id = ?').get(gEvent.id);

    if (!existing) {
      db.prepare(`
        INSERT INTO calendar_events (
          id, google_event_id, integration_id, title, description,
          start_time, end_time, agent_soul_id, task_context, machine_preference,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', unixepoch(), unixepoch())
      `).run(
        nanoid(),
        gEvent.id,
        integrationId,
        gEvent.summary || 'Untitled',
        gEvent.description || null,
        startTime,
        endTime,
        piaData?.agentSoulId || null,
        piaData?.taskContext || gEvent.summary || null,
        piaData?.machinePreference || 'any',
      );
    } else {
      // Update title/times if event was modified in Google Calendar
      db.prepare(`
        UPDATE calendar_events
        SET title = ?, start_time = ?, end_time = ?, updated_at = unixepoch()
        WHERE google_event_id = ?
      `).run(gEvent.summary || 'Untitled', startTime, endTime, gEvent.id);
    }
  }

  /**
   * Parse PIA-specific metadata embedded in Google Calendar event description.
   * Format: <!-- PIA: {"agentSoulId":"ziggi","taskContext":"...","machinePreference":"m2"} -->
   */
  private parsePiaMetadata(description: string): {
    agentSoulId?: string;
    taskContext?: string;
    machinePreference?: string;
  } | null {
    const match = description.match(/<!--\s*PIA:\s*(\{.*?\})\s*-->/s);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  /**
   * Trigger a calendar event — spawn the assigned agent.
   */
  private async triggerEvent(event: CalendarEventRow): Promise<void> {
    const db = getDatabase();

    // Mark as triggered immediately to prevent double-firing
    db.prepare(`
      UPDATE calendar_events SET status = 'triggered', updated_at = unixepoch() WHERE id = ?
    `).run(event.id);

    logger.info(`[CalendarWatcher] Triggering: ${event.title} → agent: ${event.agent_soul_id}`);

    try {
      // Spawn the agent
      const workerTaskId = nanoid();
      const result = await runAutonomousTask({
        id: workerTaskId,
        description: event.task_context || event.title,
        soulId: event.agent_soul_id || undefined,
        model: this.config.defaultModel,
        maxBudgetUsd: this.config.defaultMaxBudget,
        maxTurns: this.config.defaultMaxTurns,
      });

      // Mark completed
      db.prepare(`
        UPDATE calendar_events
        SET status = 'completed', spawned_task_id = ?, updated_at = unixepoch()
        WHERE id = ?
      `).run(result.taskId, event.id);

      // Notify via AgentBus
      getAgentBus().broadcast('calendar-watcher', `Calendar event completed: ${event.title}`, {
        event: 'calendar_event_completed',
        calendarEventId: event.id,
        agentSoulId: event.agent_soul_id,
        workerTaskId: result.taskId,
      });

      logger.info(`[CalendarWatcher] ${event.title} completed — task: ${result.taskId}`);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      db.prepare(`
        UPDATE calendar_events
        SET status = 'failed', error_message = ?, updated_at = unixepoch()
        WHERE id = ?
      `).run(errMsg, event.id);
      logger.error(`[CalendarWatcher] Event trigger failed: ${event.title} — ${errMsg}`);
    }
  }

  /** Get active Google integration from DB */
  private getGoogleIntegration(): IntegrationRow | null {
    const db = getDatabase();
    return db.prepare("SELECT * FROM integrations WHERE service = 'google' LIMIT 1").get() as IntegrationRow | null;
  }

  /** Build OAuth2 client from stored tokens */
  private buildOAuth2Client(integration: IntegrationRow): OAuth2Client {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    auth.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
      expiry_date: integration.token_expiry ? integration.token_expiry * 1000 : undefined,
    });
    return auth;
  }
}

// Singleton
let watcher: CalendarWatcher | null = null;

export function getCalendarWatcher(): CalendarWatcher {
  if (!watcher) watcher = new CalendarWatcher();
  return watcher;
}

export function initCalendarWatcher(config?: Partial<CalendarWatcherConfig>): CalendarWatcher {
  watcher = new CalendarWatcher(config);
  return watcher;
}
```

### 3d. Integrations API Routes

Create `src/api/routes/integrations.ts`:

```typescript
/**
 * Google Integrations API
 *
 * GET  /api/integrations/google/auth          — Start OAuth flow
 * GET  /api/integrations/google/callback      — OAuth callback (receives code)
 * GET  /api/integrations/google/status        — Check connection status
 * DELETE /api/integrations/google             — Disconnect / revoke
 * POST /api/integrations/google/calendar/events      — Create calendar event (PIA → Google)
 * GET  /api/integrations/google/calendar/events      — List local calendar_events
 * PATCH /api/integrations/google/calendar/events/:id — Update event
 * POST /api/integrations/google/tasks/sync           — Sync PIA tasks → Google Tasks
 * POST /api/integrations/google/calendar/check       — Manual poll (for testing)
 */

import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { getDatabase } from '../../db/database.js';
import { getCalendarWatcher } from '../../services/calendar-watcher.js';
import { getGoogleTasksSync } from '../../services/google-tasks-sync.js';
import { createLogger } from '../../utils/logger.js';
import { nanoid } from 'nanoid';

const router = Router();
const logger = createLogger('IntegrationsAPI');

// ---------------------------------------------------------------------------
// OAuth Flow
// ---------------------------------------------------------------------------

/** GET /api/integrations/google/auth — Redirect to Google OAuth consent */
router.get('/google/auth', (_req: Request, res: Response) => {
  try {
    const oauth2Client = buildOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',      // get refresh_token
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/tasks',
        'email',
        'profile',
      ],
      prompt: 'consent',           // force consent screen to always get refresh_token
    });
    res.redirect(authUrl);
  } catch (err) {
    logger.error(`OAuth auth start failed: ${err}`);
    res.status(500).json({ error: 'Failed to start OAuth flow. Check GOOGLE_CLIENT_ID is set.' });
  }
});

/** GET /api/integrations/google/callback — Google redirects here with code */
router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).json({ error: 'No authorization code received' });
    return;
  }

  try {
    const oauth2Client = buildOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Get user email from token info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email || null;

    // Store tokens in DB
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const integrationId = 'google-main';

    const existing = db.prepare('SELECT id FROM integrations WHERE id = ?').get(integrationId);
    if (existing) {
      db.prepare(`
        UPDATE integrations SET
          access_token = ?,
          refresh_token = ?,
          token_expiry = ?,
          scope = ?,
          google_email = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        tokens.access_token,
        tokens.refresh_token || null,  // only set on first auth
        tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        tokens.scope || null,
        googleEmail,
        now,
        integrationId,
      );
    } else {
      db.prepare(`
        INSERT INTO integrations (id, service, user_label, access_token, refresh_token, token_expiry, scope, google_email, created_at, updated_at)
        VALUES (?, 'google', 'Mic', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        integrationId,
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        tokens.scope || null,
        googleEmail,
        now,
        now,
      );
    }

    logger.info(`Google OAuth connected: ${googleEmail}`);

    // Redirect to dashboard with success
    res.redirect('/?google_connected=true');
  } catch (err) {
    logger.error(`OAuth callback failed: ${err}`);
    res.status(500).json({ error: `OAuth failed: ${(err as Error).message}` });
  }
});

/** GET /api/integrations/google/status — Check if Google is connected */
router.get('/google/status', (_req: Request, res: Response) => {
  const db = getDatabase();
  const integration = db.prepare("SELECT id, google_email, scope, updated_at FROM integrations WHERE service = 'google'").get() as any;
  if (!integration) {
    res.json({ connected: false });
    return;
  }
  res.json({
    connected: true,
    email: integration.google_email,
    scope: integration.scope,
    lastUpdated: integration.updated_at,
    calendarWatcherRunning: getCalendarWatcher().isRunning(),
  });
});

/** DELETE /api/integrations/google — Disconnect Google */
router.delete('/google', (_req: Request, res: Response) => {
  const db = getDatabase();
  db.prepare("DELETE FROM integrations WHERE service = 'google'").run();
  res.json({ success: true, message: 'Google integration removed' });
});

// ---------------------------------------------------------------------------
// Calendar Events
// ---------------------------------------------------------------------------

/**
 * POST /api/integrations/google/calendar/events
 * Create a calendar event in PIA and optionally push to Google Calendar.
 *
 * Body: {
 *   title: string,
 *   agentSoulId: string,          // e.g. 'ziggi', 'fisher2050', 'eliyahu'
 *   taskContext: string,           // full task description
 *   startTime: string,             // ISO 8601
 *   durationMinutes?: number,      // default 60
 *   machinePreference?: string,    // 'any' | 'm1' | 'm2' | 'm3'
 *   pushToGoogle?: boolean,        // default true (if integration exists)
 * }
 */
router.post('/google/calendar/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      agentSoulId,
      taskContext,
      startTime,
      durationMinutes = 60,
      machinePreference = 'any',
      pushToGoogle = true,
    } = req.body;

    if (!title || !agentSoulId || !taskContext || !startTime) {
      res.status(400).json({ error: 'title, agentSoulId, taskContext, and startTime are required' });
      return;
    }

    const startUnix = Math.floor(new Date(startTime).getTime() / 1000);
    const endUnix = startUnix + durationMinutes * 60;
    const db = getDatabase();
    const eventId = nanoid();

    // Build PIA metadata for embedding in Google Calendar event description
    const piaMetadata = JSON.stringify({ agentSoulId, taskContext, machinePreference });
    const description = `${taskContext}\n\n<!-- PIA: ${piaMetadata} -->`;

    let googleEventId: string | null = null;

    // Push to Google Calendar if integration exists and pushToGoogle is true
    if (pushToGoogle) {
      const integration = db.prepare("SELECT * FROM integrations WHERE service = 'google'").get() as any;
      if (integration?.access_token) {
        try {
          const oauth2Client = buildOAuth2Client();
          oauth2Client.setCredentials({
            access_token: integration.access_token,
            refresh_token: integration.refresh_token,
          });
          const cal = google.calendar({ version: 'v3', auth: oauth2Client });
          const calResponse = await cal.events.insert({
            calendarId: integration.calendar_id || 'primary',
            requestBody: {
              summary: title,
              description,
              start: { dateTime: new Date(startUnix * 1000).toISOString() },
              end: { dateTime: new Date(endUnix * 1000).toISOString() },
              colorId: '5', // banana (yellow) — PIA events stand out
            },
          });
          googleEventId = calResponse.data.id || null;
          logger.info(`Created Google Calendar event: ${googleEventId}`);
        } catch (gErr) {
          logger.warn(`Failed to push to Google Calendar: ${gErr}`);
          // Continue — local event still created
        }
      }
    }

    // Insert local record
    db.prepare(`
      INSERT INTO calendar_events (
        id, google_event_id, title, description,
        start_time, end_time, duration_minutes,
        agent_soul_id, task_context, machine_preference,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', unixepoch(), unixepoch())
    `).run(
      eventId, googleEventId, title, description,
      startUnix, endUnix, durationMinutes,
      agentSoulId, taskContext, machinePreference,
    );

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId);
    res.status(201).json(event);
  } catch (err) {
    logger.error(`Failed to create calendar event: ${err}`);
    res.status(500).json({ error: `Failed: ${(err as Error).message}` });
  }
});

/** GET /api/integrations/google/calendar/events — List local calendar events */
router.get('/google/calendar/events', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    let events;
    if (status) {
      events = db.prepare('SELECT * FROM calendar_events WHERE status = ? ORDER BY start_time ASC LIMIT ?').all(status, limit);
    } else {
      events = db.prepare('SELECT * FROM calendar_events ORDER BY start_time ASC LIMIT ?').all(limit);
    }
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: `Failed: ${err}` });
  }
});

/** PATCH /api/integrations/google/calendar/events/:id — Update event status */
router.patch('/google/calendar/events/:id', (req: Request, res: Response): void => {
  try {
    const db = getDatabase();
    const { status, machinePreference } = req.body;
    const eventId = req.params.id as string;

    const updates: string[] = ['updated_at = unixepoch()'];
    const values: unknown[] = [];

    if (status) { updates.push('status = ?'); values.push(status); }
    if (machinePreference) { updates.push('machine_preference = ?'); values.push(machinePreference); }
    values.push(eventId);

    db.prepare(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: `Failed: ${err}` });
  }
});

/** POST /api/integrations/google/calendar/check — Manually trigger calendar poll */
router.post('/google/calendar/check', async (_req: Request, res: Response) => {
  try {
    await getCalendarWatcher().checkUpcomingEvents();
    res.json({ success: true, message: 'Calendar check complete' });
  } catch (err) {
    res.status(500).json({ error: `Check failed: ${err}` });
  }
});

// ---------------------------------------------------------------------------
// Google Tasks Sync
// ---------------------------------------------------------------------------

/** POST /api/integrations/google/tasks/sync — Sync PIA tasks → Google Tasks */
router.post('/google/tasks/sync', async (_req: Request, res: Response) => {
  try {
    const synced = await getGoogleTasksSync().syncAll();
    res.json({ success: true, synced });
  } catch (err) {
    res.status(500).json({ error: `Sync failed: ${err}` });
  }
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/google/callback',
  );
}

export default router;
```

---

## Section 4: Google Tasks Integration

### 4a. Sync Direction

- **Source of truth:** PIA's `tasks` table (always wins)
- **Google Tasks:** human-readable mirror — visible in Google Calendar sidebar and Google Tasks mobile app
- **Sync:** one-way, PIA → Google Tasks
- **Bidirectional not needed:** agents don't read Google Tasks; they read PIA's DB directly

### 4b. Task List Mapping

- One Google Tasks list named "PIA Tasks" (created automatically on first sync)
- The list ID is stored in `integrations.tasks_list_id`
- Each PIA task maps to one Google Task
- PIA task `id` stored in Google Task's `notes` field as metadata for idempotency

### 4c. Google Tasks Sync Service

Create `src/services/google-tasks-sync.ts`:

```typescript
/**
 * GoogleTasksSync — Sync PIA task queue to Google Tasks
 *
 * Direction: PIA → Google Tasks (one-way, PIA is source of truth)
 * Use: Human-readable mirror visible in Google Calendar + mobile app
 */
import { google, tasks_v1 } from 'googleapis';
import { getDatabase } from '../db/database.js';
import { getTaskQueue, TaskRecord } from '../orchestrator/task-queue.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GoogleTasksSync');

const PIA_TASKS_LIST_NAME = 'PIA Tasks';

export interface SyncResult {
  created: number;
  updated: number;
  completed: number;
  errors: number;
}

export class GoogleTasksSync {
  /** Sync all PIA tasks to Google Tasks. Returns count of operations. */
  async syncAll(): Promise<SyncResult> {
    const integration = this.getIntegration();
    if (!integration?.access_token) {
      logger.warn('GoogleTasksSync: No Google integration found. Skipping.');
      return { created: 0, updated: 0, completed: 0, errors: 0 };
    }

    const auth = this.buildAuth(integration);
    const tasksApi = google.tasks({ version: 'v1', auth });

    // Ensure PIA Tasks list exists
    const listId = await this.ensureTasksList(tasksApi, integration);

    const queue = getTaskQueue();
    const allTasks = queue.getAll();
    const result: SyncResult = { created: 0, updated: 0, completed: 0, errors: 0 };

    for (const piaTask of allTasks) {
      try {
        await this.syncTask(tasksApi, listId, piaTask, result);
      } catch (err) {
        logger.error(`Failed to sync task ${piaTask.id}: ${err}`);
        result.errors++;
      }
    }

    logger.info(`GoogleTasksSync complete: ${JSON.stringify(result)}`);
    return result;
  }

  /** Sync a single PIA task to Google Tasks. Called on task create/complete events. */
  async syncTask(
    tasksApi: tasks_v1.Tasks,
    listId: string,
    piaTask: TaskRecord,
    result?: SyncResult,
  ): Promise<void> {
    // Check if Google Task already exists for this PIA task ID
    const existingGoogleTaskId = this.getGoogleTaskId(piaTask.id);

    const taskBody: tasks_v1.Schema$Task = {
      title: piaTask.title,
      notes: this.buildTaskNotes(piaTask),
      status: piaTask.status === 'completed' ? 'completed' : 'needsAction',
      due: piaTask.created_at ? new Date(piaTask.created_at * 1000).toISOString() : undefined,
    };

    if (existingGoogleTaskId) {
      // Update existing Google Task
      await tasksApi.tasks.update({
        tasklist: listId,
        task: existingGoogleTaskId,
        requestBody: taskBody,
      });
      if (result) {
        if (piaTask.status === 'completed') result.completed++;
        else result.updated++;
      }
    } else {
      // Create new Google Task
      const created = await tasksApi.tasks.insert({
        tasklist: listId,
        requestBody: taskBody,
      });
      // Store Google Task ID in our sync map
      if (created.data.id) {
        this.storeGoogleTaskId(piaTask.id, created.data.id);
      }
      if (result) result.created++;
    }
  }

  private buildTaskNotes(task: TaskRecord): string {
    const lines = [
      `PIA Task ID: ${task.id}`,
      `Priority: ${task.priority}/5`,
      `Status: ${task.status}`,
    ];
    if (task.agent_id) lines.push(`Agent: ${task.agent_id}`);
    if (task.description) lines.push(`\n${task.description.substring(0, 500)}`);
    return lines.join('\n');
  }

  private async ensureTasksList(tasksApi: tasks_v1.Tasks, integration: any): Promise<string> {
    // Use stored list ID if available
    if (integration.tasks_list_id) return integration.tasks_list_id;

    // Check if list already exists
    const lists = await tasksApi.tasklists.list({ maxResults: 100 });
    const existing = lists.data.items?.find(l => l.title === PIA_TASKS_LIST_NAME);

    let listId: string;
    if (existing?.id) {
      listId = existing.id;
    } else {
      // Create the list
      const created = await tasksApi.tasklists.insert({
        requestBody: { title: PIA_TASKS_LIST_NAME },
      });
      listId = created.data.id!;
      logger.info(`Created Google Tasks list: ${PIA_TASKS_LIST_NAME} (${listId})`);
    }

    // Store list ID in integration row
    const db = getDatabase();
    db.prepare("UPDATE integrations SET tasks_list_id = ? WHERE service = 'google'").run(listId);
    return listId;
  }

  /** Google Task ID lookup — stored in a simple JSON file or DB column */
  private getGoogleTaskId(piaTaskId: string): string | null {
    const db = getDatabase();
    // Store sync map in a dedicated table (added in migration 044)
    const row = db.prepare('SELECT google_task_id FROM task_google_sync WHERE pia_task_id = ?').get(piaTaskId) as any;
    return row?.google_task_id || null;
  }

  private storeGoogleTaskId(piaTaskId: string, googleTaskId: string): void {
    const db = getDatabase();
    db.prepare(`
      INSERT OR REPLACE INTO task_google_sync (pia_task_id, google_task_id, synced_at)
      VALUES (?, ?, unixepoch())
    `).run(piaTaskId, googleTaskId);
  }

  private getIntegration(): any {
    const db = getDatabase();
    return db.prepare("SELECT * FROM integrations WHERE service = 'google' LIMIT 1").get();
  }

  private buildAuth(integration: any) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    auth.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
      expiry_date: integration.token_expiry ? integration.token_expiry * 1000 : undefined,
    });
    return auth;
  }
}

let syncInstance: GoogleTasksSync | null = null;

export function getGoogleTasksSync(): GoogleTasksSync {
  if (!syncInstance) syncInstance = new GoogleTasksSync();
  return syncInstance;
}
```

The `task_google_sync` table needs to be added to migration `044_google_integrations`:

```sql
-- Add to 044_google_integrations migration:
CREATE TABLE IF NOT EXISTS task_google_sync (
  pia_task_id TEXT PRIMARY KEY,
  google_task_id TEXT NOT NULL,
  synced_at INTEGER DEFAULT (unixepoch())
);
```

---

## Section 5: Practical Next Steps — Ordered Build Order

Each step below identifies exactly what to create or modify, in the order a developer should work.

---

### Step 1: Add `task_google_sync` to migration 044 and run migrations

**File: `src/db/database.ts`**

Add migration `044_google_integrations` to the `getMigrations()` array (after `043_machine_power_state`). The full SQL is in Section 3b above plus the `task_google_sync` table addition.

Also add `PATCH /api/tasks/:id` endpoint — currently missing:

**File: `src/api/routes/tasks.ts`** — add after the GET /:id handler:

```typescript
// PATCH /api/tasks/:id — Partial update (status, priority, assignedAgent)
router.patch('/:id', (req: Request, res: Response): void => {
  try {
    const { status, priority, assignedAgent, description } = req.body;
    const db = getDatabase();
    const taskId = req.params.id as string;

    const updates: string[] = ['updated_at = unixepoch()'];
    const values: unknown[] = [];

    if (status) { updates.push('status = ?'); values.push(status); }
    if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
    if (assignedAgent !== undefined) { updates.push('agent_id = ?'); values.push(assignedAgent); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }

    if (updates.length === 1) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(taskId);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const queue = getTaskQueue();
    const task = queue.getById(taskId);
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: `Failed: ${error}` });
  }
});
```

---

### Step 2: Install Google dependencies

```bash
cd C:/Users/mic/Downloads/pia-system
npm install googleapis google-auth-library node-cron
npm install --save-dev @types/node-cron
```

---

### Step 3: Create `src/services/fisher-service.ts`

Full file content is in Section 2e above. This is the merged FisherService that runs cron jobs inside PIA's main process.

Key dependencies this file needs:
- `node-cron` (installed in Step 2)
- `../orchestrator/autonomous-worker.js` (already exists)
- `../souls/soul-engine.js` (already exists)
- `../orchestrator/task-queue.js` (already exists)
- `../comms/agent-bus.js` (already exists)

---

### Step 4: Create `src/services/calendar-watcher.ts`

Full file content is in Section 3c above.

Key dependencies:
- `googleapis` (installed in Step 2)
- `google-auth-library` (installed in Step 2)

---

### Step 5: Create `src/services/google-tasks-sync.ts`

Full file content is in Section 4c above.

---

### Step 6: Add Fisher2050 tools to `src/orchestrator/autonomous-worker.ts`

Modify `autonomous-worker.ts` to inject Fisher2050-specific tools when `soulId === 'fisher2050'`.

**File: `src/orchestrator/autonomous-worker.ts`**

Add the `FISHER_TOOLS` array after the existing `TOOLS` array (Section 2c). Then modify `runAutonomousTask()`:

```typescript
// In runAutonomousTask(), when building the API call, replace:
tools: TOOLS,
// With:
tools: task.soulId === 'fisher2050' ? [...TOOLS, ...FISHER_TOOLS] : TOOLS,
```

Also add the tool execution cases to the `executeTool()` switch statement (full handlers in Section 2c).

**Import addition needed at top of file:**
```typescript
import { getDatabase } from '../db/database.js';
import { getTaskQueue } from './task-queue.js';
```

---

### Step 7: Create `src/api/routes/integrations.ts`

Full file content is in Section 3d above. Mount it in `src/api/server.ts`.

**File: `src/api/server.ts`** — add:
```typescript
import integrationsRouter from './routes/integrations.js';
// ... in createServer():
app.use('/api/integrations', integrationsRouter);
```

---

### Step 8: Add Fisher2050 on-demand route

Create `src/api/routes/fisher.ts`:

```typescript
/**
 * Fisher2050 API — on-demand Fisher invocation
 *
 * POST /api/fisher/run        — Run Fisher2050 on a task
 * GET  /api/fisher/status     — Fisher service status
 * POST /api/fisher/standup    — Force standup now (for testing)
 * POST /api/fisher/reload     — Reload cron schedule from soul config
 */
import { Router, Request, Response } from 'express';
import { getFisherService } from '../../services/fisher-service.js';
import { getSoulEngine } from '../../souls/soul-engine.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('FisherAPI');

/** POST /api/fisher/run — Run Fisher2050 with a task */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { task, context } = req.body;
    if (!task) {
      res.status(400).json({ error: 'task is required' });
      return;
    }
    const fullTask = context ? `${task}\n\nContext:\n${context}` : task;
    const taskId = await getFisherService().runOnDemand(fullTask);
    res.json({ taskId, status: 'spawned', soul: 'fisher2050' });
  } catch (err) {
    logger.error(`Fisher run failed: ${err}`);
    res.status(500).json({ error: `Failed: ${(err as Error).message}` });
  }
});

/** GET /api/fisher/status — Fisher service health */
router.get('/status', (_req: Request, res: Response) => {
  const soul = getSoulEngine().getSoul('fisher2050');
  res.json({
    soul: soul ? { id: soul.id, name: soul.name, status: soul.status } : null,
    serviceRunning: true,  // FisherService is always running in hub mode
  });
});

/** POST /api/fisher/standup — Manually trigger standup */
router.post('/standup', async (_req: Request, res: Response) => {
  try {
    const taskId = await getFisherService().runOnDemand(
      'Run an immediate morning standup review. Check all tasks, identify priorities, spawn agents if needed.'
    );
    res.json({ taskId, triggered: true });
  } catch (err) {
    res.status(500).json({ error: `Failed: ${err}` });
  }
});

export default router;
```

Mount in `src/api/server.ts`:
```typescript
import fisherRouter from './routes/fisher.js';
app.use('/api/fisher', fisherRouter);
```

---

### Step 9: Wire everything into `src/index.ts`

**File: `src/index.ts`** — in the `startHub()` function, add after soul seeding:

```typescript
// Start Fisher Service (cron-based agent scheduling)
logger.info('Starting Fisher Service...');
const { initFisherService } = await import('./services/fisher-service.js');
const fisherService = initFisherService();
fisherService.start();

// Start Calendar Watcher (polls Google Calendar every 5 minutes)
logger.info('Starting Calendar Watcher...');
const { initCalendarWatcher } = await import('./services/calendar-watcher.js');
const calendarWatcher = initCalendarWatcher();
calendarWatcher.startWatching();
```

Add to `shutdown()`:
```typescript
try {
  const { getFisherService } = await import('./services/fisher-service.js');
  getFisherService().stop();
} catch { /* may not be initialized */ }

try {
  const { getCalendarWatcher } = await import('./services/calendar-watcher.js');
  getCalendarWatcher().stopWatching();
} catch { /* may not be initialized */ }
```

---

### Step 10: Update Fisher2050 soul email

**File: `src/souls/personalities/fisher2050.json`**

Change `"email": "fisher2050@sodaworld.com"` to `"email": "fisher2050@sodalabs.ai"` to match `MASTER_VISION.md`.

Same for `ziggi.json` (`ziggi@sodalabs.ai`) and `eliyahu.json` (`eliyahu@sodalabs.ai`).

---

### Step 11: Environment variables — add to `.env`

```bash
# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback

# Fisher Service overrides (optional — defaults match soul config)
FISHER_STANDUP_CRON="0 9 * * *"
FISHER_EVENING_CRON="0 18 * * *"
FISHER_TIMEZONE="Asia/Jerusalem"
```

---

### Step 12: Update `FILE_INDEX.md` and session journal

After all files are created, update:
- `FILE_INDEX.md` — add the 4 new `.ts` files
- `SESSION_JOURNAL_2026-02-20.md` — document all new endpoints and migrations

---

## Appendix A: New Files Summary

| File | Type | Purpose |
|------|------|---------|
| `src/services/fisher-service.ts` | **NEW** | FisherService class — merged cron scheduling inside PIA main process |
| `src/services/calendar-watcher.ts` | **NEW** | CalendarWatcher — polls Google Calendar, triggers agent spawns |
| `src/services/google-tasks-sync.ts` | **NEW** | GoogleTasksSync — PIA tasks → Google Tasks one-way mirror |
| `src/api/routes/integrations.ts` | **NEW** | OAuth flow + calendar events + tasks sync REST API |
| `src/api/routes/fisher.ts` | **NEW** | Fisher2050 on-demand run + status endpoints |

## Appendix B: Modified Files Summary

| File | Change |
|------|--------|
| `src/db/database.ts` | Add migration `044_google_integrations` (integrations + calendar_events + task_google_sync tables) |
| `src/api/server.ts` | Mount `integrationsRouter` and `fisherRouter` |
| `src/index.ts` | Start FisherService + CalendarWatcher in hub boot sequence |
| `src/api/routes/tasks.ts` | Add `PATCH /api/tasks/:id` endpoint |
| `src/orchestrator/autonomous-worker.ts` | Add Fisher2050-specific tools + tool handlers |
| `src/souls/personalities/fisher2050.json` | Update email to `fisher2050@sodalabs.ai` |
| `src/souls/personalities/ziggi.json` | Update email to `ziggi@sodalabs.ai` |
| `src/souls/personalities/eliyahu.json` | Update email to `eliyahu@sodalabs.ai` |

## Appendix C: New API Endpoints Summary

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/integrations/google/auth` | Start Google OAuth flow |
| `GET` | `/api/integrations/google/callback` | OAuth callback, stores tokens |
| `GET` | `/api/integrations/google/status` | Check if Google is connected |
| `DELETE` | `/api/integrations/google` | Disconnect Google |
| `POST` | `/api/integrations/google/calendar/events` | Create calendar event (PIA + Google) |
| `GET` | `/api/integrations/google/calendar/events` | List local calendar events |
| `PATCH` | `/api/integrations/google/calendar/events/:id` | Update calendar event |
| `POST` | `/api/integrations/google/calendar/check` | Manual calendar poll trigger |
| `POST` | `/api/integrations/google/tasks/sync` | Sync PIA tasks → Google Tasks |
| `POST` | `/api/fisher/run` | Run Fisher2050 on-demand |
| `GET` | `/api/fisher/status` | Fisher service status |
| `POST` | `/api/fisher/standup` | Force standup now |
| `PATCH` | `/api/tasks/:id` | Partial task update (status, priority, agent) |

## Appendix D: DB Schema Delta (New Tables)

```sql
-- integrations (OAuth token storage)
id TEXT, service TEXT, user_label TEXT, access_token TEXT, refresh_token TEXT,
token_expiry INTEGER, scope TEXT, google_email TEXT, calendar_id TEXT,
tasks_list_id TEXT, created_at INTEGER, updated_at INTEGER

-- calendar_events (PIA-Google Calendar bridge)
id TEXT, google_event_id TEXT, integration_id TEXT, title TEXT, description TEXT,
start_time INTEGER, end_time INTEGER, duration_minutes INTEGER,
agent_soul_id TEXT, task_context TEXT, machine_preference TEXT,
status TEXT, spawned_task_id TEXT, error_message TEXT,
created_at INTEGER, updated_at INTEGER

-- task_google_sync (PIA task ID ↔ Google Task ID mapping)
pia_task_id TEXT, google_task_id TEXT, synced_at INTEGER
```

---

*Document written by Claude Sonnet 4.6 | 2026-02-20*
*Based on full codebase audit of pia-system at commit 8c8a4f4*
