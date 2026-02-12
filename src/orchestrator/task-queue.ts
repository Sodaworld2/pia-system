/**
 * Task Queue - Priority-based task distribution for agents
 *
 * Distributes work to agents based on priority and dependencies.
 * Tasks flow: pending → in_progress → completed/failed
 */

import { getDatabase } from '../db/database.js';
import { nanoid } from 'nanoid';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('TaskQueue');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskInput {
  title: string;
  description?: string;
  priority?: number; // 1 (lowest) to 5 (highest), default 3
  assignedAgent?: string;
  dependsOn?: string[];
}

export interface TaskRecord {
  id: string;
  agent_id: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: number;
  blocked_by: string[] | null;
  blocks: string[] | null;
  output: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

// ---------------------------------------------------------------------------
// TaskQueue Class
// ---------------------------------------------------------------------------

export class TaskQueue {
  constructor() {
    this.ensureColumns();
    logger.info('TaskQueue initialized');
  }

  private ensureColumns(): void {
    const db = getDatabase();
    try { db.exec('ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 3'); } catch { /* exists */ }
    try { db.exec('ALTER TABLE tasks ADD COLUMN output TEXT'); } catch { /* exists */ }
  }

  private parseRow(row: Record<string, unknown>): TaskRecord {
    return {
      ...row,
      blocked_by: row.blocked_by ? JSON.parse(row.blocked_by as string) : null,
      blocks: row.blocks ? JSON.parse(row.blocks as string) : null,
    } as TaskRecord;
  }

  /**
   * Add a task to the queue.
   */
  enqueue(input: TaskInput): TaskRecord {
    const db = getDatabase();
    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO tasks (id, agent_id, title, description, status, priority, blocked_by, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      id,
      input.assignedAgent || null,
      input.title,
      input.description || null,
      input.priority || 3,
      input.dependsOn ? JSON.stringify(input.dependsOn) : null,
      now,
    );

    // Update blocks references on dependencies
    if (input.dependsOn) {
      for (const depId of input.dependsOn) {
        const dep = db.prepare('SELECT blocks FROM tasks WHERE id = ?').get(depId) as Record<string, unknown> | undefined;
        if (dep) {
          const existing: string[] = dep.blocks ? JSON.parse(dep.blocks as string) : [];
          existing.push(id);
          db.prepare('UPDATE tasks SET blocks = ? WHERE id = ?').run(JSON.stringify(existing), depId);
        }
      }
    }

    logger.info(`Enqueued task: ${input.title} (priority ${input.priority || 3})`);
    return this.getById(id)!;
  }

  /**
   * Get the next highest-priority unblocked pending task.
   */
  dequeue(agentId?: string): TaskRecord | null {
    const db = getDatabase();
    const pending = db.prepare(`
      SELECT * FROM tasks WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
    `).all() as Record<string, unknown>[];

    for (const row of pending) {
      const task = this.parseRow(row);

      // Check if blocked
      if (task.blocked_by && task.blocked_by.length > 0) {
        const allDone = task.blocked_by.every(depId => {
          const dep = db.prepare('SELECT status FROM tasks WHERE id = ?').get(depId) as { status: string } | undefined;
          return dep && (dep.status === 'completed' || dep.status === 'failed');
        });
        if (!allDone) continue;
      }

      // If agent filter, check assignment
      if (agentId && task.agent_id && task.agent_id !== agentId) continue;

      return task;
    }

    return null;
  }

  /**
   * Assign a task to an agent and set it in_progress.
   */
  assign(taskId: string, agentId: string): TaskRecord {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      UPDATE tasks SET agent_id = ?, status = 'in_progress', started_at = ? WHERE id = ?
    `).run(agentId, now, taskId);

    logger.info(`Assigned task ${taskId} to agent ${agentId}`);
    return this.getById(taskId)!;
  }

  /**
   * Mark a task as completed.
   */
  complete(taskId: string, output?: string): TaskRecord {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      UPDATE tasks SET status = 'completed', completed_at = ?, output = ? WHERE id = ?
    `).run(now, output || null, taskId);

    logger.info(`Task completed: ${taskId}`);
    return this.getById(taskId)!;
  }

  /**
   * Mark a task as failed.
   */
  fail(taskId: string, error: string): TaskRecord {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      UPDATE tasks SET status = 'failed', completed_at = ?, output = ? WHERE id = ?
    `).run(now, `ERROR: ${error}`, taskId);

    logger.info(`Task failed: ${taskId} - ${error}`);
    return this.getById(taskId)!;
  }

  /**
   * Get a task by ID.
   */
  getById(id: string): TaskRecord | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  /**
   * Get all pending tasks sorted by priority.
   */
  getPending(): TaskRecord[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority DESC, created_at ASC
    `).all() as Record<string, unknown>[];
    return rows.map(r => this.parseRow(r));
  }

  /**
   * Get tasks assigned to a specific agent.
   */
  getByAgent(agentId: string): TaskRecord[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM tasks WHERE agent_id = ? ORDER BY priority DESC, created_at ASC
    `).all(agentId) as Record<string, unknown>[];
    return rows.map(r => this.parseRow(r));
  }

  /**
   * Get all tasks.
   */
  getAll(status?: string): TaskRecord[] {
    const db = getDatabase();
    let rows: Record<string, unknown>[];
    if (status) {
      rows = db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at DESC').all(status) as Record<string, unknown>[];
    } else {
      rows = db.prepare('SELECT * FROM tasks ORDER BY priority DESC, created_at DESC').all() as Record<string, unknown>[];
    }
    return rows.map(r => this.parseRow(r));
  }

  /**
   * Get queue stats.
   */
  getStats(): { total: number; pending: number; inProgress: number; completed: number; failed: number } {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as { c: number }).c;
    const pending = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'pending'").get() as { c: number }).c;
    const inProgress = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'in_progress'").get() as { c: number }).c;
    const completed = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'completed'").get() as { c: number }).c;
    const failed = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'failed'").get() as { c: number }).c;
    return { total, pending, inProgress, completed, failed };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let queue: TaskQueue | null = null;

export function getTaskQueue(): TaskQueue {
  if (!queue) {
    queue = new TaskQueue();
  }
  return queue;
}
