import { getDatabase } from '../database.js';
import { nanoid } from 'nanoid';

export interface Session {
  id: string;
  agent_id: string | null;
  machine_id: string;
  pty_pid: number | null;
  command: string | null;
  cwd: string | null;
  status: 'active' | 'paused' | 'closed';
  created_at: number;
  closed_at: number | null;
}

export interface SessionInput {
  machine_id: string;
  agent_id?: string;
  command?: string;
  cwd?: string;
}

export function createSession(input: SessionInput): Session {
  const db = getDatabase();
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO sessions (id, machine_id, agent_id, command, cwd, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(
    id,
    input.machine_id,
    input.agent_id || null,
    input.command || null,
    input.cwd || null,
    now
  );

  return getSessionById(id)!;
}

export function getSessionById(id: string): Session | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  return row || null;
}

export function getActiveSessions(): Session[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sessions WHERE status = 'active' ORDER BY created_at DESC
  `).all() as Session[];
}

export function getSessionsByMachine(machineId: string): Session[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sessions WHERE machine_id = ? AND status = 'active' ORDER BY created_at DESC
  `).all(machineId) as Session[];
}

export function updateSessionPid(id: string, pid: number): void {
  const db = getDatabase();
  db.prepare('UPDATE sessions SET pty_pid = ? WHERE id = ?').run(pid, id);
}

export function closeSession(id: string): void {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE sessions SET status = 'closed', closed_at = ? WHERE id = ?
  `).run(now, id);
}

export function pauseSession(id: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE sessions SET status = 'paused' WHERE id = ?`).run(id);
}

export function resumeSession(id: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE sessions SET status = 'active' WHERE id = ?`).run(id);
}

// Session output buffer management
export function appendSessionOutput(sessionId: string, output: string): void {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO session_output (session_id, output, timestamp)
    VALUES (?, ?, ?)
  `).run(sessionId, output, now);

  // Keep only last 1000 entries per session
  db.prepare(`
    DELETE FROM session_output
    WHERE session_id = ?
    AND id NOT IN (
      SELECT id FROM session_output
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT 1000
    )
  `).run(sessionId, sessionId);
}

export function getSessionOutput(sessionId: string, limit: number = 100): string[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT output FROM session_output
    WHERE session_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(sessionId, limit) as { output: string }[];

  return rows.reverse().map(r => r.output);
}

export function getSessionBuffer(sessionId: string): string {
  const outputs = getSessionOutput(sessionId, 500);
  return outputs.join('');
}

export function clearSessionOutput(sessionId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM session_output WHERE session_id = ?').run(sessionId);
}
