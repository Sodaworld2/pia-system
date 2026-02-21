/**
 * Fisher2050 API routes
 *
 * GET  /api/fisher/status  — last run times, next scheduled runs, running flag
 * POST /api/fisher/run     — manual trigger (standup, summary, or arbitrary prompt)
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('FisherAPI');

// In-memory log of last run times per job (cleared on restart)
const lastRun: Record<string, string | null> = {
  standup: null,
  summary: null,
  ziggi: null,
  eliyahu: null,
  memory: null,
};

/**
 * GET /api/fisher/status
 * Returns Fisher service status: running flag, last/next run times for each job.
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { getFisherService } = await import('../../services/fisher-service.js');
    const service = getFisherService();

    res.json({
      running: (service as any).running ?? false,
      jobs: {
        standup:  { label: 'Morning Standup',      cron: '0 9 * * 1-5',  lastRun: lastRun.standup  },
        summary:  { label: 'Evening Summary',       cron: '0 18 * * 1-5', lastRun: lastRun.summary  },
        ziggi:    { label: 'Ziggi Quality Audit',   cron: '0 2 * * *',    lastRun: lastRun.ziggi    },
        eliyahu:  { label: 'Eliyahu Morning Prep',  cron: '0 6 * * *',    lastRun: lastRun.eliyahu  },
        memory:   { label: 'Weekly Memory Prune',   cron: '0 3 * * 0',    lastRun: lastRun.memory   },
      },
    });
  } catch (err) {
    logger.error(`Fisher status error: ${err}`);
    res.status(500).json({ error: 'FisherService not initialized' });
  }
});

/**
 * POST /api/fisher/run
 * Body: { job?: 'standup' | 'summary' | 'ziggi' | 'eliyahu', prompt?: string }
 * Manually triggers a job or runs an arbitrary prompt via Fisher2050.
 */
router.post('/run', async (req: Request, res: Response): Promise<void> => {
  const { job, prompt } = req.body as { job?: string; prompt?: string };

  try {
    const { getFisherService } = await import('../../services/fisher-service.js');
    const service = getFisherService();

    if (job === 'standup') {
      lastRun.standup = new Date().toISOString();
      service.runStandup().catch((e: Error) => logger.error(`Standup error: ${e}`));
      res.json({ ok: true, triggered: 'standup' });
    } else if (job === 'summary') {
      lastRun.summary = new Date().toISOString();
      service.runEveningSummary().catch((e: Error) => logger.error(`Summary error: ${e}`));
      res.json({ ok: true, triggered: 'summary' });
    } else if (prompt) {
      const taskId = await service.runOnDemand(prompt);
      res.json({ ok: true, triggered: 'on_demand', taskId });
    } else {
      res.status(400).json({ error: 'Provide job ("standup" | "summary") or prompt string' });
    }
  } catch (err) {
    logger.error(`Fisher run error: ${err}`);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/fisher/records
 * Returns recent agent_records filed by Tim Buc.
 * ?limit=N (default 50)
 */
router.get('/records', async (req: Request, res: Response): Promise<void> => {
  try {
    const { getDatabase } = await import('../../db/database.js');
    const db = getDatabase();
    const limit = Math.min(parseInt(String(req.query.limit || '50')), 200);
    const rows = db.prepare(`
      SELECT * FROM agent_records
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
    res.json({ records: rows, total: rows.length });
  } catch (err) {
    logger.error(`Fisher records error: ${err}`);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/fisher/calendar
 * Returns upcoming calendar_events.
 * ?status=pending|running|completed|all (default: pending+running)
 */
router.get('/calendar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { getDatabase } = await import('../../db/database.js');
    const db = getDatabase();
    const status = String(req.query.status || 'upcoming');
    let rows;
    if (status === 'all') {
      rows = db.prepare(`SELECT * FROM calendar_events ORDER BY scheduled_at ASC LIMIT 100`).all();
    } else if (status === 'upcoming') {
      rows = db.prepare(`
        SELECT * FROM calendar_events
        WHERE status IN ('pending', 'running')
        ORDER BY scheduled_at ASC
        LIMIT 100
      `).all();
    } else {
      rows = db.prepare(`SELECT * FROM calendar_events WHERE status = ? ORDER BY scheduled_at DESC LIMIT 100`).all(status);
    }
    res.json({ events: rows, total: rows.length });
  } catch (err) {
    logger.error(`Fisher calendar error: ${err}`);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/fisher/calendar
 * Schedule a new agent run.
 * Body: { agent, task, scheduled_at (ISO or unix), context?, machine_id? }
 */
router.post('/calendar', async (req: Request, res: Response): Promise<void> => {
  const { agent, task, scheduled_at, context, machine_id } = req.body as {
    agent: string;
    task: string;
    scheduled_at: string | number;
    context?: Record<string, unknown>;
    machine_id?: string;
  };

  if (!agent || !task || !scheduled_at) {
    res.status(400).json({ error: 'agent, task, and scheduled_at are required' });
    return;
  }

  try {
    const { getDatabase } = await import('../../db/database.js');
    const { nanoid } = await import('nanoid');
    const db = getDatabase();

    const id = nanoid();
    const scheduledTs = typeof scheduled_at === 'number'
      ? scheduled_at
      : Math.floor(new Date(scheduled_at).getTime() / 1000);

    if (isNaN(scheduledTs)) {
      res.status(400).json({ error: 'Invalid scheduled_at date' });
      return;
    }

    db.prepare(`
      INSERT INTO calendar_events (id, agent, task, context_json, scheduled_at, machine_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'dashboard')
    `).run(id, agent, task, JSON.stringify(context || {}), scheduledTs, machine_id || null);

    const created = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    logger.info(`Calendar event created: ${agent} — "${task}" at ${new Date(scheduledTs * 1000).toISOString()}`);
    res.json({ ok: true, event: created });
  } catch (err) {
    logger.error(`Fisher calendar create error: ${err}`);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * DELETE /api/fisher/calendar/:id
 * Cancel a pending calendar event.
 */
router.delete('/calendar/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const { getDatabase } = await import('../../db/database.js');
    const db = getDatabase();
    const evt = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id) as { status: string } | undefined;
    if (!evt) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    if (evt.status === 'running') {
      res.status(409).json({ error: 'Cannot cancel a running event' });
      return;
    }
    db.prepare(`UPDATE calendar_events SET status = 'cancelled' WHERE id = ?`).run(id);
    logger.info(`Calendar event cancelled: ${id}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Fisher calendar cancel error: ${err}`);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
