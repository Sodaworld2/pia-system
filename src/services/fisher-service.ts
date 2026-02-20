/**
 * FisherService — Fisher2050 integrated into PIA's main process
 *
 * Replaces fisher2050/ standalone app for the core scheduling.
 * Runs cron jobs that invoke runAutonomousTask() with fisher2050 soul.
 *
 * Cron schedule:
 *   0 9 * * 1-5  — Morning standup (weekdays 9am)
 *   0 18 * * 1-5 — Evening summary (weekdays 6pm)
 *   0 2 * * *    — Ziggi overnight quality audit (daily 2am)
 *   0 6 * * *    — Eliyahu morning briefing prep (daily 6am)
 */

import cron, { ScheduledTask } from 'node-cron';
import { nanoid } from 'nanoid';
import { runAutonomousTask } from '../orchestrator/autonomous-worker.js';
import { getTaskQueue } from '../orchestrator/task-queue.js';
import { getAgentBus } from '../comms/agent-bus.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('FisherService');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface FisherServiceConfig {
  standupCron: string;      // default: '0 9 * * 1-5'  (9am weekdays)
  eveningCron: string;      // default: '0 18 * * 1-5' (6pm weekdays)
  ziggiCron: string;        // default: '0 2 * * *'    (2am daily)
  eliyahuCron: string;      // default: '0 6 * * *'    (6am daily)
  timezone: string;         // default: 'Asia/Jerusalem'
  maxBudgetPerJob: number;  // default: 1.0
  model: string;            // default: 'claude-sonnet-4-5-20250929'
}

// ---------------------------------------------------------------------------
// FisherService Class
// ---------------------------------------------------------------------------

export class FisherService {
  private config: FisherServiceConfig;
  private jobs: ScheduledTask[] = [];
  private running = false;

  constructor(config?: Partial<FisherServiceConfig>) {
    this.config = {
      standupCron:   config?.standupCron   ?? '0 9 * * 1-5',
      eveningCron:   config?.eveningCron   ?? '0 18 * * 1-5',
      ziggiCron:     config?.ziggiCron     ?? '0 2 * * *',
      eliyahuCron:   config?.eliyahuCron   ?? '0 6 * * *',
      timezone:      config?.timezone      ?? 'Asia/Jerusalem',
      maxBudgetPerJob: config?.maxBudgetPerJob ?? 1.0,
      model:         config?.model         ?? 'claude-sonnet-4-5-20250929',
    };
  }

  /**
   * Start all cron jobs and subscribe to task completion events.
   * Called once during hub startup.
   */
  start(): void {
    if (this.running) {
      logger.warn('FisherService already running — ignoring duplicate start()');
      return;
    }
    this.running = true;

    // Schedule the four core jobs
    this.scheduleJob(
      'Fisher2050 Morning Standup',
      this.config.standupCron,
      'fisher2050',
      () => this.buildStandupPrompt(),
    );

    this.scheduleJob(
      'Fisher2050 Evening Summary',
      this.config.eveningCron,
      'fisher2050',
      () => this.buildSummaryPrompt(),
    );

    this.scheduleJob(
      'Ziggi Overnight Quality Audit',
      this.config.ziggiCron,
      'ziggi',
      () => this.buildZiggiPrompt(),
    );

    this.scheduleJob(
      'Eliyahu Morning Briefing Prep',
      this.config.eliyahuCron,
      'eliyahu',
      () => this.buildEliyahuPrompt(),
    );

    // Subscribe to AgentBus task:completed events
    this.subscribeToTaskCompletions();

    logger.info('FisherService started — 4 cron jobs scheduled');
  }

  /**
   * Stop all cron jobs.
   */
  stop(): void {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    this.running = false;
    logger.info('FisherService stopped');
  }

  /**
   * Run Fisher2050 on-demand (e.g. from POST /api/fisher/run).
   * Returns the worker task ID.
   */
  async runOnDemand(prompt: string): Promise<string> {
    const taskId = nanoid();
    logger.info(`FisherService.runOnDemand — task ${taskId}`);

    // Fire and don't await so the HTTP response returns immediately
    runAutonomousTask({
      id: taskId,
      description: prompt,
      soulId: 'fisher2050',
      model: this.config.model,
      maxBudgetUsd: this.config.maxBudgetPerJob,
      maxTurns: 25,
    }).catch(err => logger.error(`Fisher2050 on-demand task failed: ${err}`));

    return taskId;
  }

  /**
   * Run the morning standup immediately (for testing or manual trigger).
   */
  async runStandup(): Promise<void> {
    logger.info('[FisherService] Running standup now (manual trigger)');
    try {
      await runAutonomousTask({
        id: nanoid(),
        description: this.buildStandupPrompt(),
        soulId: 'fisher2050',
        model: this.config.model,
        maxBudgetUsd: this.config.maxBudgetPerJob,
        maxTurns: 25,
      });
    } catch (err) {
      logger.error(`FisherService standup failed: ${err}`);
    }
  }

  /**
   * Run the evening summary immediately (for testing or manual trigger).
   */
  async runEveningSummary(): Promise<void> {
    logger.info('[FisherService] Running evening summary now (manual trigger)');
    try {
      await runAutonomousTask({
        id: nanoid(),
        description: this.buildSummaryPrompt(),
        soulId: 'fisher2050',
        model: this.config.model,
        maxBudgetUsd: this.config.maxBudgetPerJob,
        maxTurns: 20,
      });
    } catch (err) {
      logger.error(`FisherService evening summary failed: ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private scheduleJob(
    name: string,
    cronExpr: string,
    soulId: string,
    promptBuilder: () => string,
  ): void {
    if (!cron.validate(cronExpr)) {
      logger.error(`[FisherService] Invalid cron expression for "${name}": ${cronExpr}`);
      return;
    }

    const job = cron.schedule(
      cronExpr,
      async () => {
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
          logger.info(`[FisherService] Completed: ${name}`);
        } catch (err) {
          logger.error(`[FisherService] ${name} failed: ${err}`);
        }
      },
      { timezone: this.config.timezone },
    );

    this.jobs.push(job);
    logger.info(`[FisherService] Scheduled: ${name} (${cronExpr}, tz: ${this.config.timezone})`);
  }

  /**
   * Subscribe to AgentBus broadcasts.
   * When another agent reports a task:completed event, Fisher2050 checks
   * if a follow-up task is needed.
   */
  private subscribeToTaskCompletions(): void {
    const bus = getAgentBus();

    // Subscribe to wildcard '*' broadcasts (AgentBus broadcast goes to all subscribers)
    bus.subscribe('*', (msg) => {
      if (msg.metadata?.event === 'task_completed' && msg.metadata?.taskId) {
        const taskId = msg.metadata.taskId as string;
        this.onTaskCompleted(taskId).catch(err =>
          logger.error(`FisherService task-completion handler error: ${err}`),
        );
      }
    });

    // Also subscribe to the fisher2050 inbox directly
    bus.subscribe('fisher2050', (msg) => {
      if (msg.metadata?.event === 'task_completed' && msg.metadata?.taskId) {
        const taskId = msg.metadata.taskId as string;
        this.onTaskCompleted(taskId).catch(err =>
          logger.error(`FisherService fisher2050-inbox handler error: ${err}`),
        );
      }
    });

    logger.info('[FisherService] Subscribed to AgentBus task:completed events');
  }

  /**
   * React to a task completion event.
   * If Ziggi completed a review, look for the next task to queue.
   */
  private async onTaskCompleted(completedTaskId: string): Promise<void> {
    const queue = getTaskQueue();
    const task = queue.getById(completedTaskId);
    if (!task) return;

    logger.info(`[FisherService] Task completed: ${task.title} (agent: ${task.agent_id || 'unknown'})`);

    // If Ziggi completed a review, check if there's a follow-up pending task
    if (task.agent_id === 'ziggi') {
      const next = queue.dequeue('ziggi');
      if (next) {
        logger.info(`[FisherService] Ziggi finished — queuing next task for Ziggi: ${next.title}`);
        queue.assign(next.id, 'ziggi');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Prompt builders — read live DB state to produce context-rich prompts
  // ---------------------------------------------------------------------------

  private buildStandupPrompt(): string {
    const queue = getTaskQueue();
    const pending = queue.getPending();
    const inProgress = queue.getAll('in_progress');
    const now = Math.floor(Date.now() / 1000);
    const overdue = pending.filter(t => (t as any).due_date && (t as any).due_date < now);
    const dateStr = new Date().toISOString().split('T')[0];

    return `FISHER2050 MORNING STANDUP — ${dateStr}

Current task queue snapshot:
- Pending: ${pending.length} tasks
- In progress: ${inProgress.length} tasks
- Overdue: ${overdue.length} tasks

Your jobs for this standup:
1. Call list_tasks to review all pending and in-progress work (use run_command with curl or read from available tools)
2. Identify the top 3 highest-priority unblocked tasks
3. For each high-priority task that has no assigned agent: decide who should work on it and report why
4. Check if Ziggi needs to run today (code review)
5. Check if Eliyahu has received a knowledge update recently
6. Use report_progress to deliver your standup summary

Format your standup as:
## Morning Standup — ${dateStr}
**In Progress:** [list]
**Priorities Today:** [list with agent assignments]
**Blocked:** [list with blockers]
**Risks:** [any concerns]
**Project health: X%**

Stay in character as Fisher2050. Be concise. Use bullet points.`;
  }

  private buildSummaryPrompt(): string {
    const queue = getTaskQueue();
    const completed = queue.getAll('completed');
    const dayAgo = Math.floor(Date.now() / 1000) - 86400;
    const completedToday = completed.filter(t => t.completed_at && t.completed_at > dayAgo);
    const pending = queue.getPending();
    const dateStr = new Date().toISOString().split('T')[0];

    return `FISHER2050 EVENING SUMMARY — ${dateStr}

Today's stats:
- Tasks completed today: ${completedToday.length}
- Still pending: ${pending.length} tasks

Your jobs for the evening summary:
1. Review what was accomplished today
2. Identify the top priorities for tomorrow
3. Note any risks or blockers that weren't resolved today
4. If Eliyahu hasn't run today, note that for the morning
5. Use report_progress to deliver your evening summary

Format your summary as:
## Evening Summary — ${dateStr}
**Accomplished Today:** [list]
**Tomorrow's Priorities:** [list]
**Blockers/Risks:** [list or "None"]
**See you tomorrow — Project health: X%**

Stay in character as Fisher2050.`;
  }

  private buildZiggiPrompt(): string {
    const dateStr = new Date().toISOString().split('T')[0];

    return `ZIGGI OVERNIGHT QUALITY AUDIT — ${dateStr} 02:00

You are Ziggi, the Architect. Run the nightly code review.

1. Use run_command to check recent git changes: git log --oneline --since='24 hours ago'
2. For each changed file that is significant: use read_file to review the code
3. Assess: code quality (1-10), naming conventions, patterns, potential issues, technical debt
4. Use write_file to write a review report to the session journal if findings are significant
5. If issues found that need fixing: use report_progress to document them clearly
6. Use report_progress with status 'completed' to deliver your Ziggi verdict

Be meticulous. Flag architecture smells. Stay in character as Ziggi.
End with your signature: "Ziggi's Verdict: [PASS/CONCERN/FAIL] — [one sentence]"`;
  }

  private buildEliyahuPrompt(): string {
    const dateStr = new Date().toISOString().split('T')[0];

    return `ELIYAHU MORNING BRIEFING PREP — ${dateStr} 06:00

You are Eliyahu, the Knowledge Manager. Process yesterday's intelligence.

1. Use read_file to read any session journals from the last 24 hours
2. Use list_directory to check for new files in key project directories
3. Identify patterns across projects and decisions from yesterday
4. Generate your morning briefing: 2 minutes to read, 3 key insights
5. Use report_progress with status 'completed' to deliver the briefing

Format your briefing as:
## Eliyahu's Morning Briefing — ${dateStr}
**Key Insight 1:** ...
**Key Insight 2:** ...
**Key Insight 3:** ...
**Open Questions:** [what still needs answering]
**Key Takeaway:** [one sentence]

Stay curious. Connect dots across sessions. Stay in character as Eliyahu.`;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let fisherService: FisherService | null = null;

export function getFisherService(): FisherService {
  if (!fisherService) {
    fisherService = new FisherService();
  }
  return fisherService;
}

export function initFisherService(config?: Partial<FisherServiceConfig>): FisherService {
  fisherService = new FisherService(config);
  return fisherService;
}
