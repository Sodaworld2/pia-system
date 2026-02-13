/**
 * Meeting Management Routes
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../../db.js';
import { nanoid } from 'nanoid';

const router = Router();

/** GET /api/meetings — List meetings */
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { project_id, status, upcoming } = req.query;

    let query = 'SELECT * FROM meetings WHERE 1=1';
    const params: unknown[] = [];

    if (project_id) { query += ' AND project_id = ?'; params.push(project_id); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (upcoming === 'true') { query += " AND status = 'scheduled' AND scheduled_at > unixepoch()"; }

    query += ' ORDER BY scheduled_at DESC';
    const meetings = db.prepare(query).all(...params);

    const parsed = (meetings as any[]).map(m => ({
      ...m,
      attendees: JSON.parse(m.attendees || '[]'),
      action_items: JSON.parse(m.action_items || '[]'),
    }));

    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list meetings' });
  }
});

/** GET /api/meetings/:id — Get a meeting */
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id) as any;
    if (!meeting) { res.status(404).json({ error: 'Meeting not found' }); return; }

    meeting.attendees = JSON.parse(meeting.attendees || '[]');
    meeting.action_items = JSON.parse(meeting.action_items || '[]');
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get meeting' });
  }
});

/** POST /api/meetings — Create a meeting */
router.post('/', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const { project_id, title, description, attendees, scheduled_at, duration_minutes, agenda } = req.body;

    if (!title) { res.status(400).json({ error: 'title is required' }); return; }

    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO meetings (id, project_id, title, description, attendees, scheduled_at, duration_minutes, agenda, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id || null, title, description || null,
      JSON.stringify(attendees || []), scheduled_at || null,
      duration_minutes || 30, agenda || null, now, now);

    db.prepare('INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run('create_meeting', 'meeting', id, `Created meeting: ${title}`);

    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
    res.status(201).json(meeting);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

/** PUT /api/meetings/:id — Update a meeting */
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Meeting not found' }); return; }

    const fields: string[] = [];
    const values: unknown[] = [];
    const { title, description, attendees, scheduled_at, duration_minutes, status, agenda, notes, action_items, transcript, recording_url } = req.body;

    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (attendees !== undefined) { fields.push('attendees = ?'); values.push(JSON.stringify(attendees)); }
    if (scheduled_at !== undefined) { fields.push('scheduled_at = ?'); values.push(scheduled_at); }
    if (duration_minutes !== undefined) { fields.push('duration_minutes = ?'); values.push(duration_minutes); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (agenda !== undefined) { fields.push('agenda = ?'); values.push(agenda); }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
    if (action_items !== undefined) { fields.push('action_items = ?'); values.push(JSON.stringify(action_items)); }
    if (transcript !== undefined) { fields.push('transcript = ?'); values.push(transcript); }
    if (recording_url !== undefined) { fields.push('recording_url = ?'); values.push(recording_url); }

    if (fields.length === 0) { res.json(existing); return; }

    fields.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(req.params.id);

    db.prepare(`UPDATE meetings SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

/** DELETE /api/meetings/:id — Delete a meeting */
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM meetings WHERE id = ?').run(req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Meeting not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

export default router;
