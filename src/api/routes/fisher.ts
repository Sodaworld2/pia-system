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

export default router;
