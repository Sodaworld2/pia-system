/**
 * Work Sessions API — The "sit down and work" flow
 *
 * This is the core user journey:
 * 1. Open app → see your projects
 * 2. Pick a project → "Start Working"
 * 3. System tracks what machine you're on, what changed
 * 4. End session → auto-triggers Ziggi review
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../../db/database.js';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';
import { nanoid } from 'nanoid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();
const logger = createLogger('WorkSessions');

function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

// ---------------------------------------------------------------------------
// Known Projects
// ---------------------------------------------------------------------------

/** GET /api/work-sessions/projects — List known projects for this machine */
router.get('/projects', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const machineName = config.hub.machineName;

    // Get all known projects, ordered by most recently worked on
    const projects = db.prepare(`
      SELECT * FROM known_projects
      ORDER BY last_worked_at DESC NULLS LAST, created_at DESC
    `).all();

    res.json({
      machine: machineName,
      projects,
    });
  } catch (error) {
    logger.error(`Failed to list projects: ${error}`);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

/** POST /api/work-sessions/projects — Register a project */
router.post('/projects', (req: Request, res: Response): void => {
  try {
    const db = getDatabase();
    const { name, path, github_repo } = req.body;

    if (!name || !path) {
      res.status(400).json({ error: 'name and path are required' });
      return;
    }

    const id = nanoid();
    const machineName = config.hub.machineName;

    db.prepare(`
      INSERT OR REPLACE INTO known_projects (id, name, path, machine_name, github_repo)
      VALUES (
        COALESCE((SELECT id FROM known_projects WHERE name = ?), ?),
        ?, ?, ?, ?
      )
    `).run(name, id, name, path, machineName, github_repo || null);

    const project = db.prepare('SELECT * FROM known_projects WHERE name = ?').get(name);
    res.status(201).json(project);
  } catch (error) {
    logger.error(`Failed to register project: ${error}`);
    res.status(500).json({ error: 'Failed to register project' });
  }
});

/** DELETE /api/work-sessions/projects/:id — Remove a known project */
router.delete('/projects/:id', (req: Request, res: Response): void => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM known_projects WHERE id = ?').run(param(req, 'id'));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ---------------------------------------------------------------------------
// Work Sessions
// ---------------------------------------------------------------------------

/** GET /api/work-sessions/active — Get the current active session on this machine */
router.get('/active', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const machineName = config.hub.machineName;

    const session = db.prepare(`
      SELECT ws.*, kp.github_repo
      FROM work_sessions ws
      LEFT JOIN known_projects kp ON ws.project_name = kp.name
      WHERE ws.status = 'active' AND ws.machine_name = ?
      ORDER BY ws.started_at DESC LIMIT 1
    `).get(machineName);

    if (!session) {
      res.json({ active: false, machine: machineName });
      return;
    }

    // Calculate live duration
    const now = Math.floor(Date.now() / 1000);
    const duration = now - (session as any).started_at;

    res.json({
      active: true,
      machine: machineName,
      session: { ...(session as any), live_duration_seconds: duration },
    });
  } catch (error) {
    logger.error(`Failed to get active session: ${error}`);
    res.status(500).json({ error: 'Failed to get active session' });
  }
});

/** POST /api/work-sessions/start — Start a work session */
router.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const machineName = config.hub.machineName;
    const { project_name, project_path, notes } = req.body;

    if (!project_name || !project_path) {
      res.status(400).json({ error: 'project_name and project_path are required' });
      return;
    }

    // Check for existing active session
    const existing = db.prepare(
      "SELECT id, project_name FROM work_sessions WHERE status = 'active' AND machine_name = ?"
    ).get(machineName) as any;

    if (existing) {
      res.status(409).json({
        error: `Already working on "${existing.project_name}". End that session first.`,
        activeSessionId: existing.id,
      });
      return;
    }

    // Grab git state before starting
    let gitBranch = '';
    let gitCommitsBefore = '';
    try {
      const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: project_path });
      gitBranch = branch.trim();
      const { stdout: commits } = await execAsync('git rev-parse HEAD', { cwd: project_path });
      gitCommitsBefore = commits.trim();
    } catch { /* not a git repo, that's fine */ }

    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO work_sessions (id, project_name, project_path, machine_name, status, started_at, git_branch, git_commits_before, notes)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(id, project_name, project_path, machineName, now, gitBranch, gitCommitsBefore, notes || null);

    // Update known projects
    db.prepare(`
      INSERT INTO known_projects (id, name, path, machine_name, last_session_id, last_worked_at, session_count)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(name) DO UPDATE SET
        path = excluded.path,
        machine_name = excluded.machine_name,
        last_session_id = excluded.last_session_id,
        last_worked_at = excluded.last_worked_at,
        session_count = session_count + 1
    `).run(nanoid(), project_name, project_path, machineName, id, now);

    logger.info(`Work session started: ${project_name} on ${machineName} (${id})`);

    const session = db.prepare('SELECT * FROM work_sessions WHERE id = ?').get(id);
    res.status(201).json({
      message: `Started working on "${project_name}"`,
      session,
    });
  } catch (error) {
    logger.error(`Failed to start session: ${error}`);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

/** POST /api/work-sessions/:id/end — End a work session + trigger review */
router.post('/:id/end', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const sessionId = param(req, 'id');
    const { notes, skip_review } = req.body;

    const session = db.prepare('SELECT * FROM work_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status !== 'active') {
      res.status(400).json({ error: 'Session is not active' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const duration = now - session.started_at;

    // Grab git state after session
    let gitCommitsAfter = '';
    let filesChanged = 0;
    try {
      const { stdout: commits } = await execAsync('git rev-parse HEAD', { cwd: session.project_path });
      gitCommitsAfter = commits.trim();

      if (session.git_commits_before && gitCommitsAfter !== session.git_commits_before) {
        const { stdout: diff } = await execAsync(
          `git diff --stat ${session.git_commits_before}..HEAD`,
          { cwd: session.project_path }
        );
        filesChanged = (diff.match(/\d+ files? changed/)?.[0] || '0').match(/\d+/)?.[0] ?
          parseInt(diff.match(/(\d+) files? changed/)?.[1] || '0') : 0;
      }
    } catch { /* not a git repo */ }

    // End the session
    db.prepare(`
      UPDATE work_sessions
      SET status = 'completed', ended_at = ?, duration_seconds = ?,
          git_commits_after = ?, files_changed = ?,
          notes = COALESCE(?, notes),
          review_status = ?
      WHERE id = ?
    `).run(now, duration, gitCommitsAfter, filesChanged, notes || null,
      skip_review ? 'skipped' : 'pending', sessionId);

    // Trigger Ziggi review (unless skipped)
    let reviewTaskId = null;
    if (!skip_review && filesChanged > 0) {
      try {
        const { runAutonomousTask } = await import('../../orchestrator/autonomous-worker.js');
        const taskId = nanoid();

        // Run review in background
        runAutonomousTask({
          id: taskId,
          description: `Post-session code review for "${session.project_name}". ` +
            `Session lasted ${Math.round(duration / 60)} minutes. ` +
            `${filesChanged} files changed. ` +
            `Git branch: ${session.git_branch || 'unknown'}. ` +
            `Review the changes since commit ${session.git_commits_before || 'start'}, ` +
            `assess code quality, and write a brief review report.`,
          soulId: 'ziggi',
          projectDir: session.project_path,
          model: 'claude-sonnet-4-6',
          maxBudgetUsd: 1.0,
        }).then(() => {
          db.prepare('UPDATE work_sessions SET review_status = ?, review_task_id = ? WHERE id = ?')
            .run('completed', taskId, sessionId);
          logger.info(`Ziggi review completed for session ${sessionId}`);
        }).catch(() => {
          db.prepare('UPDATE work_sessions SET review_status = ? WHERE id = ?')
            .run('completed', sessionId);
        });

        reviewTaskId = taskId;
        db.prepare('UPDATE work_sessions SET review_task_id = ?, review_status = ? WHERE id = ?')
          .run(taskId, 'running', sessionId);

        logger.info(`Ziggi review triggered for session ${sessionId}: task ${taskId}`);
      } catch (err) {
        logger.warn(`Failed to trigger Ziggi review: ${(err as Error).message}`);
      }
    }

    const updated = db.prepare('SELECT * FROM work_sessions WHERE id = ?').get(sessionId);

    const hours = Math.floor(duration / 3600);
    const mins = Math.floor((duration % 3600) / 60);
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    logger.info(`Work session ended: ${session.project_name} (${durationStr}, ${filesChanged} files changed)`);

    res.json({
      message: `Session ended. Worked on "${session.project_name}" for ${durationStr}. ${filesChanged} files changed.`,
      session: updated,
      review: reviewTaskId ? { taskId: reviewTaskId, status: 'running' } : null,
    });
  } catch (error) {
    logger.error(`Failed to end session: ${error}`);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/** GET /api/work-sessions/history — Recent work sessions */
router.get('/history', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const limit = parseInt(req.query.limit as string) || 20;
    const sessions = db.prepare(`
      SELECT * FROM work_sessions
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get history' });
  }
});

/** GET /api/work-sessions/:id — Get a specific session */
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM work_sessions WHERE id = ?').get(param(req, 'id'));
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get session' });
  }
});

export default router;
