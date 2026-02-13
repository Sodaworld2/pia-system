/**
 * Task Management Routes
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../../db.js';
import { nanoid } from 'nanoid';

const router = Router();

/** GET /api/tasks — List tasks (optionally filtered) */
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { project_id, status, assigned_to, overdue } = req.query;

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: unknown[] = [];

    if (project_id) { query += ' AND project_id = ?'; params.push(project_id); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (assigned_to) { query += ' AND assigned_to = ?'; params.push(assigned_to); }
    if (overdue === 'true') { query += " AND status IN ('pending','in_progress') AND due_date < unixepoch()"; }

    query += ' ORDER BY priority ASC, due_date ASC, created_at DESC';

    const tasks = db.prepare(query).all(...params);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/** GET /api/tasks/:id — Get a task */
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get task' });
  }
});

/** POST /api/tasks — Create a task */
router.post('/', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const { project_id, title, description, priority, assigned_to, due_date, depends_on, tags } = req.body;

    if (!title) { res.status(400).json({ error: 'title is required' }); return; }

    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO tasks (id, project_id, title, description, priority, assigned_to, due_date, depends_on, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id || null, title, description || null, priority || 3,
      assigned_to || null, due_date || null, JSON.stringify(depends_on || []),
      JSON.stringify(tags || []), now, now);

    db.prepare('INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run('create_task', 'task', id, `Created task: ${title}`);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/** PUT /api/tasks/:id — Update a task */
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Task not found' }); return; }

    const fields: string[] = [];
    const values: unknown[] = [];
    const { title, description, status, priority, assigned_to, due_date, depends_on, tags, google_task_id, metadata } = req.body;

    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (status !== undefined) {
      fields.push('status = ?'); values.push(status);
      if (status === 'completed') { fields.push('completed_at = ?'); values.push(Math.floor(Date.now() / 1000)); }
    }
    if (priority !== undefined) { fields.push('priority = ?'); values.push(priority); }
    if (assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(assigned_to); }
    if (due_date !== undefined) { fields.push('due_date = ?'); values.push(due_date); }
    if (depends_on !== undefined) { fields.push('depends_on = ?'); values.push(JSON.stringify(depends_on)); }
    if (tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(tags)); }
    if (google_task_id !== undefined) { fields.push('google_task_id = ?'); values.push(google_task_id); }
    if (metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(metadata)); }

    if (fields.length === 0) { res.json(existing); return; }

    fields.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(req.params.id);

    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    db.prepare('INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run('update_task', 'task', req.params.id, `Updated: ${fields.filter(f => !f.includes('updated_at')).join(', ')}`);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/** DELETE /api/tasks/:id — Delete a task */
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/** GET /api/tasks/overdue/list — Get overdue tasks */
router.get('/overdue/list', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const tasks = db.prepare(`
      SELECT t.*, p.name as project_name FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.status IN ('pending', 'in_progress') AND t.due_date < unixepoch()
      ORDER BY t.due_date ASC
    `).all();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get overdue tasks' });
  }
});

export default router;
