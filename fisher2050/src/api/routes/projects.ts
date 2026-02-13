/**
 * Project CRUD Routes
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../../db.js';
import { nanoid } from 'nanoid';

const router = Router();

/** GET /api/projects — List all projects */
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const status = _req.query.status as string || 'active';
    const projects = status === 'all'
      ? db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
      : db.prepare('SELECT * FROM projects WHERE status = ? ORDER BY updated_at DESC').all(status);

    // Parse JSON fields
    const parsed = (projects as any[]).map(p => ({
      ...p,
      team: JSON.parse(p.team || '[]'),
      metadata: JSON.parse(p.metadata || '{}'),
    }));

    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

/** GET /api/projects/:id — Get a project */
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    project.team = JSON.parse(project.team || '[]');
    project.metadata = JSON.parse(project.metadata || '{}');

    // Also get tasks for this project
    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY priority ASC, created_at DESC').all(req.params.id);

    res.json({ ...project, tasks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project' });
  }
});

/** POST /api/projects — Create a project */
router.post('/', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const { name, description, github_repo, github_url, plan, team, metadata } = req.body;

    if (!name) { res.status(400).json({ error: 'name is required' }); return; }

    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO projects (id, name, description, github_repo, github_url, plan, team, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, github_repo || null, github_url || null, plan || null,
      JSON.stringify(team || []), JSON.stringify(metadata || {}), now, now);

    // Log activity
    db.prepare('INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run('create_project', 'project', id, `Created project: ${name}`);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/** PUT /api/projects/:id — Update a project */
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Project not found' }); return; }

    const fields: string[] = [];
    const values: unknown[] = [];
    const { name, description, status, github_repo, github_url, plan, architecture, team, metadata } = req.body;

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (github_repo !== undefined) { fields.push('github_repo = ?'); values.push(github_repo); }
    if (github_url !== undefined) { fields.push('github_url = ?'); values.push(github_url); }
    if (plan !== undefined) { fields.push('plan = ?'); values.push(plan); }
    if (architecture !== undefined) { fields.push('architecture = ?'); values.push(architecture); }
    if (team !== undefined) { fields.push('team = ?'); values.push(JSON.stringify(team)); }
    if (metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(metadata)); }

    if (fields.length === 0) { res.json(existing); return; }

    fields.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(req.params.id);

    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    db.prepare('INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run('update_project', 'project', req.params.id, `Updated: ${fields.filter(f => f !== 'updated_at = ?').join(', ')}`);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/** DELETE /api/projects/:id — Delete (archive) a project */
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDb();
    const hard = req.query.hard === 'true';

    if (hard) {
      db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    } else {
      db.prepare("UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?")
        .run(Math.floor(Date.now() / 1000), req.params.id);
    }

    db.prepare('INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run(hard ? 'delete_project' : 'archive_project', 'project', req.params.id, '');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
