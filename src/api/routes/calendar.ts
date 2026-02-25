/**
 * Calendar Events API
 *
 * GET    /api/calendar          — list events (filter by status, agent, limit)
 * POST   /api/calendar          — create event (Fisher2050 or dashboard use)
 * PATCH  /api/calendar/:id      — update event status or reschedule
 * DELETE /api/calendar/:id      — cancel a pending event
 */

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { getDatabase } from '../../db/database.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('CalendarRoute');

// GET /api/calendar
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const status = (req.query.status as string) || undefined;
    const agent = (req.query.agent as string) || undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    let sql = 'SELECT * FROM calendar_events WHERE 1=1';
    const params: unknown[] = [];

    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (agent)  { sql += ' AND agent = ?';  params.push(agent); }

    sql += ' ORDER BY scheduled_at ASC LIMIT ?';
    params.push(limit);

    const events = db.prepare(sql).all(...params);
    res.json({ events });
  } catch (err) {
    logger.error(`GET /api/calendar failed: ${err}`);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// POST /api/calendar
router.post('/', (req: Request, res: Response) => {
  try {
    const { agent, task, scheduledAt, context, soulId, createdBy } = req.body as {
      agent: string;
      task: string;
      scheduledAt: number;
      context?: Record<string, unknown>;
      soulId?: string;
      createdBy?: string;
    };

    if (!agent || !task || !scheduledAt) {
      res.status(400).json({ error: 'agent, task, and scheduledAt are required' });
      return;
    }

    const db = getDatabase();
    const id = nanoid();

    db.prepare(`
      INSERT INTO calendar_events (id, agent, task, context_json, scheduled_at, status, created_by, soul_id)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, agent, task, JSON.stringify(context || {}), scheduledAt, createdBy || 'api', soulId || agent);

    logger.info(`Calendar event created: ${agent} at ${new Date(scheduledAt * 1000).toISOString()} (id=${id})`);
    res.status(201).json({ id, agent, task, scheduledAt, status: 'pending' });
  } catch (err) {
    logger.error(`POST /api/calendar failed: ${err}`);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// PATCH /api/calendar/:id
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { status, scheduledAt, task } = req.body as {
      status?: string;
      scheduledAt?: number;
      task?: string;
    };

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (status)      { fields.push('status = ?');       params.push(status); }
    if (scheduledAt) { fields.push('scheduled_at = ?'); params.push(scheduledAt); }
    if (task)        { fields.push('task = ?');          params.push(task); }

    if (fields.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

    params.push(req.params.id);
    db.prepare(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    res.json({ id: req.params.id, updated: true });
  } catch (err) {
    logger.error(`PATCH /api/calendar/${req.params.id} failed: ${err}`);
    res.status(500).json({ error: 'Failed to update calendar event' });
  }
});

// DELETE /api/calendar/:id (cancel — only pending events)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare(
      `UPDATE calendar_events SET status = 'cancelled' WHERE id = ? AND status = 'pending'`,
    ).run(req.params.id);

    if (result.changes === 0) {
      res.status(400).json({ error: 'Event not found or not in pending state' });
      return;
    }
    res.json({ id: req.params.id, cancelled: true });
  } catch (err) {
    logger.error(`DELETE /api/calendar/${req.params.id} failed: ${err}`);
    res.status(500).json({ error: 'Failed to cancel event' });
  }
});

export default router;
