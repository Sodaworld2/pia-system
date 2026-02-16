import { getDatabase } from '../database.js';

export interface MachineMessage {
  id: string;
  from_machine_id: string;
  from_machine_name: string;
  to_machine_id: string;
  to_machine_name: string;
  channel: string;
  type: string;
  content: string;
  metadata: string;
  read: boolean;
  created_at: number;
}

interface MachineMessageRow {
  id: string;
  from_machine_id: string;
  from_machine_name: string;
  to_machine_id: string;
  to_machine_name: string;
  channel: string;
  type: string;
  content: string;
  metadata: string;
  read: number;
  created_at: number;
}

export interface SaveMachineMessageInput {
  id: string;
  from_machine_id: string;
  from_machine_name: string;
  to_machine_id: string;
  to_machine_name: string;
  channel: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

function rowToMessage(row: MachineMessageRow): MachineMessage {
  return { ...row, read: Boolean(row.read) };
}

export function saveMachineMessage(input: SaveMachineMessageInput): MachineMessage {
  const db = getDatabase();

  db.prepare(`
    INSERT INTO machine_messages (id, from_machine_id, from_machine_name, to_machine_id, to_machine_name, channel, type, content, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.from_machine_id,
    input.from_machine_name,
    input.to_machine_id,
    input.to_machine_name,
    input.channel,
    input.type,
    input.content,
    JSON.stringify(input.metadata || {}),
  );

  return getMessageById(input.id)!;
}

export function getMessageById(id: string): MachineMessage | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM machine_messages WHERE id = ?').get(id) as MachineMessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function getMachineMessages(opts?: {
  from?: string;
  to?: string;
  type?: string;
  channel?: string;
  unread?: boolean;
  since?: number;
  limit?: number;
}): MachineMessage[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.from) {
    conditions.push('from_machine_id = ?');
    params.push(opts.from);
  }
  if (opts?.to) {
    conditions.push('(to_machine_id = ? OR to_machine_id = \'*\')');
    params.push(opts.to);
  }
  if (opts?.type) {
    conditions.push('type = ?');
    params.push(opts.type);
  }
  if (opts?.channel) {
    conditions.push('channel = ?');
    params.push(opts.channel);
  }
  if (opts?.unread) {
    conditions.push('read = 0');
  }
  if (opts?.since) {
    conditions.push('created_at >= ?');
    params.push(opts.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts?.limit || 100;
  params.push(limit);

  const rows = db.prepare(`
    SELECT * FROM machine_messages ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params) as MachineMessageRow[];

  return rows.map(rowToMessage);
}

export function getUnreadMessages(machineId: string): MachineMessage[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM machine_messages
    WHERE (to_machine_id = ? OR to_machine_id = '*') AND read = 0
    ORDER BY created_at DESC
  `).all(machineId) as MachineMessageRow[];

  return rows.map(rowToMessage);
}

export function markMessageRead(id: string): void {
  const db = getDatabase();
  db.prepare('UPDATE machine_messages SET read = 1 WHERE id = ?').run(id);
}

export function markAllRead(machineId: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE machine_messages SET read = 1
    WHERE (to_machine_id = ? OR to_machine_id = '*') AND read = 0
  `).run(machineId);
}

export function getMessageStats(): {
  total: number;
  unread: number;
  byType: Record<string, number>;
} {
  const db = getDatabase();

  const total = (db.prepare('SELECT COUNT(*) as count FROM machine_messages').get() as { count: number }).count;
  const unread = (db.prepare('SELECT COUNT(*) as count FROM machine_messages WHERE read = 0').get() as { count: number }).count;

  const typeRows = db.prepare(`
    SELECT type, COUNT(*) as count FROM machine_messages GROUP BY type
  `).all() as { type: string; count: number }[];

  const byType: Record<string, number> = {};
  for (const row of typeRows) {
    byType[row.type] = row.count;
  }

  return { total, unread, byType };
}

export function deleteOldMessages(daysOld: number): number {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - daysOld * 24 * 60 * 60;

  const result = db.prepare(`
    DELETE FROM machine_messages
    WHERE read = 1 AND created_at < ?
  `).run(cutoff);

  return result.changes;
}
