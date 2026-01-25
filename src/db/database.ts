import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Database');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): Database.Database {
  const dbPath = config.database.path;

  // Ensure directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info(`Created database directory: ${dbDir}`);
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  logger.info(`Database initialized at: ${dbPath}`);

  // Run migrations
  runMigrations(db);

  return db;
}

function runMigrations(db: Database.Database): void {
  logger.info('Running database migrations...');

  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER DEFAULT (unixepoch())
    );
  `);

  const migrations = getMigrations();
  const applied = new Set(
    (db.prepare('SELECT name FROM migrations').all() as { name: string }[]).map((r) => r.name)
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      logger.info(`Applying migration: ${migration.name}`);
      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
    }
  }

  logger.info('Migrations complete');
}

interface Migration {
  name: string;
  sql: string;
}

function getMigrations(): Migration[] {
  return [
    {
      name: '001_initial_schema',
      sql: `
        -- Machines registered with PIA
        CREATE TABLE IF NOT EXISTS machines (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          hostname TEXT NOT NULL,
          ip_address TEXT,
          status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'offline', 'error')),
          last_seen INTEGER,
          capabilities TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Agents running on machines
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          machine_id TEXT REFERENCES machines(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT DEFAULT 'idle' CHECK(status IN ('idle', 'working', 'waiting', 'error', 'completed')),
          current_task TEXT,
          progress INTEGER DEFAULT 0,
          context_used INTEGER DEFAULT 0,
          tokens_used INTEGER DEFAULT 0,
          started_at INTEGER,
          last_activity INTEGER,
          last_output TEXT,
          metadata TEXT
        );

        -- CLI sessions (for tunnel)
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
          machine_id TEXT REFERENCES machines(id) ON DELETE CASCADE,
          pty_pid INTEGER,
          command TEXT,
          cwd TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'closed')),
          created_at INTEGER DEFAULT (unixepoch()),
          closed_at INTEGER
        );

        -- Session output buffer (last N lines)
        CREATE TABLE IF NOT EXISTS session_output (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
          output TEXT NOT NULL,
          timestamp INTEGER DEFAULT (unixepoch())
        );

        -- Tasks and their status
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
          blocked_by TEXT,
          blocks TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          started_at INTEGER,
          completed_at INTEGER
        );

        -- Documentation files being watched
        CREATE TABLE IF NOT EXISTS watched_docs (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          last_hash TEXT,
          last_updated INTEGER,
          auto_update INTEGER DEFAULT 1
        );

        -- Alerts and notifications
        CREATE TABLE IF NOT EXISTS alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          machine_id TEXT REFERENCES machines(id) ON DELETE CASCADE,
          agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
          type TEXT NOT NULL CHECK(type IN ('agent_stuck', 'agent_error', 'agent_waiting', 'machine_offline', 'resource_high', 'context_overflow', 'task_failed')),
          message TEXT NOT NULL,
          acknowledged INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_agents_machine ON agents(machine_id);
        CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
        CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
        CREATE INDEX IF NOT EXISTS idx_session_output_session ON session_output(session_id);
      `,
    },
  ];
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
