/**
 * Fisher2050 Scheduler — Cron-based task scheduling
 *
 * Runs scheduled jobs at configured times:
 * - Daily standup prep (9am)
 * - Ziggi deep review (2am)
 * - Eliyahu morning briefing (6am)
 * - Custom jobs from the database
 */

import cron from 'node-cron';
import { getDb } from '../db.js';
import { getPiaClient } from '../integrations/pia.js';
import { nanoid } from 'nanoid';

const activeJobs = new Map<string, cron.ScheduledTask>();

function seedDefaultJobs(): void {
  const db = getDb();

  const defaults = [
    {
      id: 'daily-standup',
      name: 'Daily Standup Prep',
      cron_expression: '0 9 * * *',
      task_description: 'Prepare daily standup: review all active projects, check overdue tasks, identify blockers, prepare status summary for Mic.',
      soul_id: 'fisher2050',
    },
    {
      id: 'ziggi-deep-review',
      name: 'Ziggi Deep Review',
      cron_expression: '0 2 * * *',
      task_description: 'Deep code review: review all projects for code quality, update technical documentation, check for technical debt, browse web for dependency updates.',
      soul_id: 'ziggi',
    },
    {
      id: 'eliyahu-morning-briefing',
      name: 'Eliyahu Morning Briefing',
      cron_expression: '0 6 * * *',
      task_description: 'Morning knowledge briefing: process yesterday\'s work logs and session journals, identify patterns and insights, generate recommendations, prepare morning briefing.',
      soul_id: 'eliyahu',
    },
    {
      id: 'fisher-evening-summary',
      name: 'Fisher2050 Evening Summary',
      cron_expression: '0 18 * * *',
      task_description: 'Generate end-of-day summary: what was accomplished today, what\'s planned for tomorrow, any risks or blockers, overall project health.',
      soul_id: 'fisher2050',
    },
  ];

  for (const job of defaults) {
    const existing = db.prepare('SELECT id FROM scheduled_jobs WHERE id = ?').get(job.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO scheduled_jobs (id, name, cron_expression, task_description, soul_id, enabled)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(job.id, job.name, job.cron_expression, job.task_description, job.soul_id);
      console.log(`[Scheduler] Seeded default job: ${job.name}`);
    }
  }
}

async function executeJob(jobId: string, name: string, taskDescription: string, soulId: string | null): Promise<void> {
  console.log(`[Scheduler] Executing: ${name}`);

  const db = getDb();
  db.prepare('UPDATE scheduled_jobs SET last_run = ? WHERE id = ?')
    .run(Math.floor(Date.now() / 1000), jobId);

  try {
    const pia = getPiaClient();
    const result = await pia.runTask({
      task: taskDescription,
      soulId: soulId || undefined,
      model: 'claude-sonnet-4-5-20250929',
      maxBudgetUsd: 1.0,
    });

    db.prepare('INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run('scheduled_job', 'scheduled_job', jobId, `Executed: ${name} (PIA task: ${result.taskId})`);

    console.log(`[Scheduler] ${name} submitted to PIA: ${result.taskId}`);
  } catch (error) {
    console.error(`[Scheduler] Failed to execute ${name}:`, error);

    db.prepare('INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run('scheduled_job_error', 'scheduled_job', jobId, `Failed: ${(error as Error).message}`);
  }
}

export function initScheduler(): void {
  console.log('[Scheduler] Initializing...');

  seedDefaultJobs();

  const db = getDb();
  const jobs = db.prepare('SELECT * FROM scheduled_jobs WHERE enabled = 1').all() as any[];

  for (const job of jobs) {
    if (!cron.validate(job.cron_expression)) {
      console.warn(`[Scheduler] Invalid cron expression for ${job.name}: ${job.cron_expression}`);
      continue;
    }

    const task = cron.schedule(job.cron_expression, () => {
      executeJob(job.id, job.name, job.task_description, job.soul_id);
    }, { timezone: 'Asia/Jerusalem' });

    activeJobs.set(job.id, task);
    console.log(`[Scheduler] Registered: ${job.name} (${job.cron_expression})`);
  }

  console.log(`[Scheduler] ${activeJobs.size} jobs scheduled`);
}

export function stopScheduler(): void {
  for (const [id, task] of activeJobs) {
    task.stop();
  }
  activeJobs.clear();
  console.log('[Scheduler] All jobs stopped');
}

export function reloadScheduler(): void {
  stopScheduler();
  initScheduler();
}
