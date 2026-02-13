/**
 * Scheduler Routes — Manage scheduled jobs
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../../db.js';
import { nanoid } from 'nanoid';

const router = Router();

/** GET /api/scheduler/jobs — List scheduled jobs */
router.get('/jobs', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const jobs = db.prepare('SELECT * FROM scheduled_jobs ORDER BY name').all();
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/** POST /api/scheduler/jobs — Create a scheduled job */
router.post('/jobs', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const { name, cron_expression, task_description, soul_id, enabled } = req.body;

    if (!name || !cron_expression || !task_description) {
      res.status(400).json({ error: 'name, cron_expression, and task_description are required' });
      return;
    }

    const id = nanoid();
    db.prepare(`
      INSERT INTO scheduled_jobs (id, name, cron_expression, task_description, soul_id, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, cron_expression, task_description, soul_id || null, enabled !== false ? 1 : 0);

    const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id);
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create job' });
  }
});

/** PUT /api/scheduler/jobs/:id — Update a scheduled job */
router.put('/jobs/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Job not found' }); return; }

    const { name, cron_expression, task_description, soul_id, enabled } = req.body;
    const fields: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (cron_expression !== undefined) { fields.push('cron_expression = ?'); values.push(cron_expression); }
    if (task_description !== undefined) { fields.push('task_description = ?'); values.push(task_description); }
    if (soul_id !== undefined) { fields.push('soul_id = ?'); values.push(soul_id); }
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }

    if (fields.length === 0) { res.json(existing); return; }
    values.push(req.params.id);

    db.prepare(`UPDATE scheduled_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(req.params.id);
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update job' });
  }
});

/** DELETE /api/scheduler/jobs/:id — Delete a scheduled job */
router.delete('/jobs/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Job not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

export default router;
