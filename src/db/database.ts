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
    {
      name: '002_ai_cost_tracking',
      sql: `
        -- AI provider configurations
        CREATE TABLE IF NOT EXISTS ai_providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          tier INTEGER NOT NULL CHECK(tier IN (0, 1, 2, 3)),
          base_url TEXT,
          is_local INTEGER DEFAULT 0,
          is_configured INTEGER DEFAULT 0,
          is_available INTEGER DEFAULT 0,
          last_checked INTEGER,
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- AI usage tracking (per request)
        CREATE TABLE IF NOT EXISTS ai_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          task_type TEXT NOT NULL,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          cost_usd REAL DEFAULT 0,
          duration_ms INTEGER DEFAULT 0,
          session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
          agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
          success INTEGER DEFAULT 1,
          error_message TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Daily cost aggregates (for quick dashboard queries)
        CREATE TABLE IF NOT EXISTS ai_cost_daily (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          provider TEXT NOT NULL,
          request_count INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          total_cost_usd REAL DEFAULT 0,
          avg_duration_ms INTEGER DEFAULT 0,
          UNIQUE(date, provider)
        );

        -- Cost budget/limits
        CREATE TABLE IF NOT EXISTS ai_budgets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          daily_limit_usd REAL,
          monthly_limit_usd REAL,
          current_daily_usd REAL DEFAULT 0,
          current_monthly_usd REAL DEFAULT 0,
          alert_threshold REAL DEFAULT 0.8,
          last_reset_daily INTEGER,
          last_reset_monthly INTEGER,
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Insert default providers (Ollama + Claude waterfall)
        INSERT OR IGNORE INTO ai_providers (id, name, tier, is_local) VALUES
          ('ollama', 'Ollama (Local)', 0, 1),
          ('claude', 'Anthropic Claude', 1, 0);

        -- Migrate old providers to Claude if they exist
        DELETE FROM ai_providers WHERE id IN ('gemini', 'openai', 'grok');

        -- Insert default budget
        INSERT OR IGNORE INTO ai_budgets (id, name, daily_limit_usd, monthly_limit_usd)
          VALUES ('default', 'Default Budget', 10.00, 100.00);

        -- Indexes for AI tables
        CREATE INDEX IF NOT EXISTS idx_ai_usage_provider ON ai_usage(provider);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_session ON ai_usage(session_id);
        CREATE INDEX IF NOT EXISTS idx_ai_cost_daily_date ON ai_cost_daily(date);
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
