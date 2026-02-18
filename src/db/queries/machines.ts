import { getDatabase } from '../database.js';
import { nanoid } from 'nanoid';

export interface Machine {
  id: string;
  name: string;
  hostname: string;
  ip_address: string | null;
  status: 'online' | 'offline' | 'error';
  last_seen: number | null;
  capabilities: Record<string, unknown> | null;
  created_at: number;
}

export interface MachineInput {
  name: string;
  hostname: string;
  ip_address?: string;
  capabilities?: Record<string, unknown>;
}

export function createMachine(input: MachineInput): Machine {
  const db = getDatabase();
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO machines (id, name, hostname, ip_address, status, last_seen, capabilities, created_at)
    VALUES (?, ?, ?, ?, 'online', ?, ?, ?)
  `).run(
    id,
    input.name,
    input.hostname,
    input.ip_address || null,
    now,
    input.capabilities ? JSON.stringify(input.capabilities) : null,
    now
  );

  return getMachineById(id)!;
}

export function getMachineById(id: string): Machine | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    ...row,
    capabilities: row.capabilities ? JSON.parse(row.capabilities as string) : null,
  } as Machine;
}

export function getMachineByHostname(hostname: string): Machine | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM machines WHERE hostname = ?').get(hostname) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    ...row,
    capabilities: row.capabilities ? JSON.parse(row.capabilities as string) : null,
  } as Machine;
}

export function getAllMachines(): Machine[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM machines ORDER BY name').all() as Record<string, unknown>[];

  return rows.map(row => ({
    ...row,
    capabilities: row.capabilities ? JSON.parse(row.capabilities as string) : null,
  })) as Machine[];
}

export function updateMachineStatus(id: string, status: Machine['status']): void {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    UPDATE machines SET status = ?, last_seen = ? WHERE id = ?
  `).run(status, now, id);
}

export function updateMachineHeartbeat(id: string, capabilities?: Record<string, unknown>): void {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  if (capabilities) {
    db.prepare(`
      UPDATE machines SET status = 'online', last_seen = ?, capabilities = ? WHERE id = ?
    `).run(now, JSON.stringify(capabilities), id);
  } else {
    db.prepare(`
      UPDATE machines SET status = 'online', last_seen = ? WHERE id = ?
    `).run(now, id);
  }
}

export function deleteMachine(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM machines WHERE id = ?').run(id);
}

export function getOfflineMachines(thresholdSeconds: number): Machine[] {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - thresholdSeconds;

  const rows = db.prepare(`
    SELECT * FROM machines
    WHERE status = 'online' AND last_seen < ?
  `).all(cutoff) as Record<string, unknown>[];

  return rows.map(row => ({
    ...row,
    capabilities: row.capabilities ? JSON.parse(row.capabilities as string) : null,
  })) as Machine[];
}

/** Delete machines that have been offline for more than `days` days. Returns count deleted. */
export function cleanupStaleMachines(days: number = 7): number {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);

  // Only delete machines that are offline AND haven't been seen in `days` days
  const result = db.prepare(`
    DELETE FROM machines
    WHERE status != 'online'
    AND (last_seen IS NULL OR last_seen < ?)
  `).run(cutoff);

  // Also clean up their agents and projects
  if (result.changes > 0) {
    db.prepare(`DELETE FROM agents WHERE machine_id NOT IN (SELECT id FROM machines)`).run();
    try {
      db.prepare(`DELETE FROM known_projects WHERE machine_name NOT IN (SELECT name FROM machines)`).run();
    } catch { /* known_projects table may not exist */ }
  }

  return result.changes;
}
