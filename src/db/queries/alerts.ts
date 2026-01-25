import { getDatabase } from '../database.js';

export type AlertType =
  | 'agent_stuck'
  | 'agent_error'
  | 'agent_waiting'
  | 'machine_offline'
  | 'resource_high'
  | 'context_overflow'
  | 'task_failed';

export interface Alert {
  id: number;
  machine_id: string | null;
  agent_id: string | null;
  type: AlertType;
  message: string;
  acknowledged: boolean;
  created_at: number;
}

export interface AlertInput {
  machine_id?: string;
  agent_id?: string;
  type: AlertType;
  message: string;
}

export function createAlert(input: AlertInput): Alert {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO alerts (machine_id, agent_id, type, message)
    VALUES (?, ?, ?, ?)
  `).run(
    input.machine_id || null,
    input.agent_id || null,
    input.type,
    input.message
  );

  return getAlertById(result.lastInsertRowid as number)!;
}

export function getAlertById(id: number): Alert | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as (Omit<Alert, 'acknowledged'> & { acknowledged: number }) | undefined;

  if (!row) return null;

  return {
    ...row,
    acknowledged: Boolean(row.acknowledged),
  };
}

export function getUnacknowledgedAlerts(): Alert[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM alerts
    WHERE acknowledged = 0
    ORDER BY created_at DESC
  `).all() as (Omit<Alert, 'acknowledged'> & { acknowledged: number })[];

  return rows.map(row => ({
    ...row,
    acknowledged: Boolean(row.acknowledged),
  }));
}

export function getAllAlerts(limit: number = 100): Alert[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM alerts
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as (Omit<Alert, 'acknowledged'> & { acknowledged: number })[];

  return rows.map(row => ({
    ...row,
    acknowledged: Boolean(row.acknowledged),
  }));
}

export function getAlertsByMachine(machineId: string): Alert[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM alerts
    WHERE machine_id = ?
    ORDER BY created_at DESC
  `).all(machineId) as (Omit<Alert, 'acknowledged'> & { acknowledged: number })[];

  return rows.map(row => ({
    ...row,
    acknowledged: Boolean(row.acknowledged),
  }));
}

export function getAlertsByAgent(agentId: string): Alert[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM alerts
    WHERE agent_id = ?
    ORDER BY created_at DESC
  `).all(agentId) as (Omit<Alert, 'acknowledged'> & { acknowledged: number })[];

  return rows.map(row => ({
    ...row,
    acknowledged: Boolean(row.acknowledged),
  }));
}

export function acknowledgeAlert(id: number): void {
  const db = getDatabase();
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(id);
}

export function acknowledgeAllAlerts(): void {
  const db = getDatabase();
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0').run();
}

export function deleteOldAlerts(daysOld: number): number {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - daysOld * 24 * 60 * 60;

  const result = db.prepare(`
    DELETE FROM alerts
    WHERE acknowledged = 1 AND created_at < ?
  `).run(cutoff);

  return result.changes;
}

export function getAlertCounts(): Record<AlertType, number> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM alerts
    WHERE acknowledged = 0
    GROUP BY type
  `).all() as { type: AlertType; count: number }[];

  const counts: Record<AlertType, number> = {
    agent_stuck: 0,
    agent_error: 0,
    agent_waiting: 0,
    machine_offline: 0,
    resource_high: 0,
    context_overflow: 0,
    task_failed: 0,
  };

  for (const row of rows) {
    counts[row.type] = row.count;
  }

  return counts;
}
