/**
 * Fisher2050 Database — SQLite setup and migrations
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './config.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function initDb(): Database.Database {
  const dbPath = config.database.path;
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER DEFAULT (unixepoch())
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT name FROM migrations').all() as { name: string }[]).map(r => r.name)
  );

  for (const migration of getMigrations()) {
    if (!applied.has(migration.name)) {
      console.log(`[Fisher2050] Applying migration: ${migration.name}`);
      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
    }
  }
}

function getMigrations() {
  return [
    {
      name: '001_fisher_core',
      sql: `
        -- Projects
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'archived')),
          github_repo TEXT,
          github_url TEXT,
          plan TEXT,
          architecture TEXT,
          team TEXT DEFAULT '[]',
          metadata TEXT DEFAULT '{}',
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );

        -- Tasks
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
          priority INTEGER DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
          assigned_to TEXT,
          due_date INTEGER,
          completed_at INTEGER,
          google_task_id TEXT,
          depends_on TEXT DEFAULT '[]',
          tags TEXT DEFAULT '[]',
          metadata TEXT DEFAULT '{}',
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );

        -- Meetings
        CREATE TABLE IF NOT EXISTS meetings (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT,
          attendees TEXT DEFAULT '[]',
          scheduled_at INTEGER,
          duration_minutes INTEGER DEFAULT 30,
          status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
          agenda TEXT,
          notes TEXT,
          action_items TEXT DEFAULT '[]',
          recording_url TEXT,
          transcript TEXT,
          google_event_id TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );

        -- Daily Reports
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('daily', 'weekly', 'project_status', 'custom')),
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          sent_to TEXT DEFAULT '[]',
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Activity Log (everything Fisher2050 does)
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          details TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Scheduled Jobs
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          cron_expression TEXT NOT NULL,
          task_description TEXT NOT NULL,
          soul_id TEXT,
          enabled INTEGER DEFAULT 1,
          last_run INTEGER,
          next_run INTEGER,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id);
        CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON meetings(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
        CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_scheduled_enabled ON scheduled_jobs(enabled);
      `,
    },
  ];
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
