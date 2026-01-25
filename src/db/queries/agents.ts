import { getDatabase } from '../database.js';
import { nanoid } from 'nanoid';

export interface Agent {
  id: string;
  machine_id: string;
  name: string;
  type: string;
  status: 'idle' | 'working' | 'waiting' | 'error' | 'completed';
  current_task: string | null;
  progress: number;
  context_used: number;
  tokens_used: number;
  started_at: number | null;
  last_activity: number | null;
  last_output: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AgentInput {
  machine_id: string;
  name: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export function createAgent(input: AgentInput): Agent {
  const db = getDatabase();
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO agents (id, machine_id, name, type, status, started_at, last_activity, metadata)
    VALUES (?, ?, ?, ?, 'idle', ?, ?, ?)
  `).run(
    id,
    input.machine_id,
    input.name,
    input.type,
    now,
    now,
    input.metadata ? JSON.stringify(input.metadata) : null
  );

  return getAgentById(id)!;
}

export function getAgentById(id: string): Agent | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  } as Agent;
}

export function getAllAgents(): Agent[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM agents ORDER BY last_activity DESC').all() as Record<string, unknown>[];

  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  })) as Agent[];
}

export function getAgentsByMachine(machineId: string): Agent[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM agents WHERE machine_id = ? ORDER BY name').all(machineId) as Record<string, unknown>[];

  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  })) as Agent[];
}

export function getAgentsByStatus(status: Agent['status']): Agent[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM agents WHERE status = ?').all(status) as Record<string, unknown>[];

  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  })) as Agent[];
}

export function updateAgentStatus(
  id: string,
  status: Agent['status'],
  updates?: {
    progress?: number;
    current_task?: string | null;
    last_output?: string;
    context_used?: number;
    tokens_used?: number;
  }
): void {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const fields = ['status = ?', 'last_activity = ?'];
  const values: unknown[] = [status, now];

  if (updates?.progress !== undefined) {
    fields.push('progress = ?');
    values.push(updates.progress);
  }
  if (updates?.current_task !== undefined) {
    fields.push('current_task = ?');
    values.push(updates.current_task);
  }
  if (updates?.last_output !== undefined) {
    fields.push('last_output = ?');
    values.push(updates.last_output);
  }
  if (updates?.context_used !== undefined) {
    fields.push('context_used = ?');
    values.push(updates.context_used);
  }
  if (updates?.tokens_used !== undefined) {
    fields.push('tokens_used = ?');
    values.push(updates.tokens_used);
  }

  values.push(id);

  db.prepare(`
    UPDATE agents SET ${fields.join(', ')} WHERE id = ?
  `).run(...values);
}

export function deleteAgent(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM agents WHERE id = ?').run(id);
}

export function getStuckAgents(thresholdSeconds: number): Agent[] {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - thresholdSeconds;

  const rows = db.prepare(`
    SELECT * FROM agents
    WHERE status = 'working' AND last_activity < ?
  `).all(cutoff) as Record<string, unknown>[];

  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  })) as Agent[];
}

export function getAgentStats(): {
  total: number;
  byStatus: Record<string, number>;
  byMachine: Record<string, number>;
} {
  const db = getDatabase();

  const total = (db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number }).count;

  const byStatus: Record<string, number> = {};
  const statusRows = db.prepare('SELECT status, COUNT(*) as count FROM agents GROUP BY status').all() as { status: string; count: number }[];
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }

  const byMachine: Record<string, number> = {};
  const machineRows = db.prepare('SELECT machine_id, COUNT(*) as count FROM agents GROUP BY machine_id').all() as { machine_id: string; count: number }[];
  for (const row of machineRows) {
    byMachine[row.machine_id] = row.count;
  }

  return { total, byStatus, byMachine };
}
