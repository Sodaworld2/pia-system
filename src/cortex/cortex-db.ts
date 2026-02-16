/**
 * Cortex Database — Separate SQLite for fleet intelligence data.
 *
 * Follows the "brain gets fat, not the repo" principle:
 * - Stored in data/cortex/cortex.db (gitignored)
 * - Hot data: last 24h, full detail
 * - Warm data: last 30 days, summarized
 * - Cold data: older, compressed/pruned
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { getAppRoot } from '../electron-paths.js';

const logger = createLogger('CortexDB');

let cortexDb: Database.Database | null = null;

export function getCortexDatabase(): Database.Database {
  if (!cortexDb) {
    throw new Error('Cortex database not initialized. Call initCortexDatabase() first.');
  }
  return cortexDb;
}

export function initCortexDatabase(): Database.Database {
  const dbDir = join(getAppRoot(), 'data', 'cortex');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info(`Created Cortex data directory: ${dbDir}`);
  }

  const dbPath = join(dbDir, 'cortex.db');
  cortexDb = new Database(dbPath);
  cortexDb.pragma('journal_mode = WAL');
  cortexDb.pragma('foreign_keys = ON');

  logger.info(`Cortex database initialized at: ${dbPath}`);
  runCortexMigrations(cortexDb);
  return cortexDb;
}

function runCortexMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cortex_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER DEFAULT (unixepoch())
    );
  `);

  const migrations = getCortexMigrations();
  const applied = new Set(
    (db.prepare('SELECT name FROM cortex_migrations').all() as { name: string }[]).map(r => r.name)
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      logger.info(`[Cortex] Applying migration: ${migration.name}`);
      db.exec(migration.sql);
      db.prepare('INSERT INTO cortex_migrations (name) VALUES (?)').run(migration.name);
    }
  }

  logger.info('[Cortex] Migrations complete');
}

interface Migration {
  name: string;
  sql: string;
}

function getCortexMigrations(): Migration[] {
  return [
    {
      name: '001_telemetry_snapshots',
      sql: `
        -- Per-machine telemetry snapshots (taken every collection interval)
        CREATE TABLE IF NOT EXISTS telemetry_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          machine_id TEXT NOT NULL,
          machine_name TEXT NOT NULL,
          hostname TEXT NOT NULL,
          status TEXT NOT NULL,
          cpu_usage REAL DEFAULT 0,
          cpu_count INTEGER DEFAULT 0,
          memory_total_mb INTEGER DEFAULT 0,
          memory_free_mb INTEGER DEFAULT 0,
          memory_used_percent INTEGER DEFAULT 0,
          uptime_hours REAL DEFAULT 0,
          agent_count INTEGER DEFAULT 0,
          agents_working INTEGER DEFAULT 0,
          agents_idle INTEGER DEFAULT 0,
          agents_error INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          cost_today_usd REAL DEFAULT 0,
          platform TEXT,
          node_version TEXT,
          collected_at INTEGER DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_ts_machine ON telemetry_snapshots(machine_id);
        CREATE INDEX IF NOT EXISTS idx_ts_collected ON telemetry_snapshots(collected_at);
        CREATE INDEX IF NOT EXISTS idx_ts_machine_collected ON telemetry_snapshots(machine_id, collected_at);
      `,
    },
    {
      name: '002_fleet_insights',
      sql: `
        -- AI/rule-generated insights about the fleet
        CREATE TABLE IF NOT EXISTS fleet_insights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK(type IN ('observation', 'suggestion', 'warning', 'critical')),
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          machine_id TEXT,
          machine_name TEXT,
          severity INTEGER DEFAULT 5 CHECK(severity BETWEEN 1 AND 10),
          data TEXT DEFAULT '{}',
          acknowledged INTEGER DEFAULT 0,
          auto_action_taken INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (unixepoch()),
          expires_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_fi_type ON fleet_insights(type);
        CREATE INDEX IF NOT EXISTS idx_fi_category ON fleet_insights(category);
        CREATE INDEX IF NOT EXISTS idx_fi_severity ON fleet_insights(severity);
        CREATE INDEX IF NOT EXISTS idx_fi_acknowledged ON fleet_insights(acknowledged);
        CREATE INDEX IF NOT EXISTS idx_fi_created ON fleet_insights(created_at);
        CREATE INDEX IF NOT EXISTS idx_fi_machine ON fleet_insights(machine_id);
      `,
    },
    {
      name: '003_fleet_timeline',
      sql: `
        -- Fleet-wide timeline events (significant occurrences)
        CREATE TABLE IF NOT EXISTS fleet_timeline (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          machine_id TEXT,
          machine_name TEXT,
          agent_id TEXT,
          title TEXT NOT NULL,
          detail TEXT,
          data TEXT DEFAULT '{}',
          created_at INTEGER DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_ft_type ON fleet_timeline(event_type);
        CREATE INDEX IF NOT EXISTS idx_ft_machine ON fleet_timeline(machine_id);
        CREATE INDEX IF NOT EXISTS idx_ft_created ON fleet_timeline(created_at);
      `,
    },
    {
      name: '004_daily_summaries',
      sql: `
        -- Daily aggregated summaries per machine (warm data tier)
        CREATE TABLE IF NOT EXISTS daily_summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          machine_id TEXT NOT NULL,
          machine_name TEXT NOT NULL,
          avg_cpu_usage REAL DEFAULT 0,
          max_cpu_usage REAL DEFAULT 0,
          avg_memory_percent REAL DEFAULT 0,
          max_memory_percent REAL DEFAULT 0,
          total_agents_spawned INTEGER DEFAULT 0,
          total_errors INTEGER DEFAULT 0,
          total_cost_usd REAL DEFAULT 0,
          uptime_percent REAL DEFAULT 100,
          snapshot_count INTEGER DEFAULT 0,
          UNIQUE(date, machine_id)
        );

        CREATE INDEX IF NOT EXISTS idx_ds_date ON daily_summaries(date);
        CREATE INDEX IF NOT EXISTS idx_ds_machine ON daily_summaries(machine_id);
      `,
    },
  ];
}

// ---------------------------------------------------------------------------
// Data tier management — prune old data
// ---------------------------------------------------------------------------

/**
 * Prune hot data older than 24 hours into daily summaries.
 * Delete cold data older than the retention period.
 */
export function pruneOldData(
  hotRetentionHours = 24,
  warmRetentionDays = 30,
): { snapshotsPruned: number; insightsPruned: number; timelinePruned: number } {
  const db = getCortexDatabase();
  const now = Math.floor(Date.now() / 1000);
  const hotCutoff = now - (hotRetentionHours * 3600);
  const warmCutoff = now - (warmRetentionDays * 86400);

  // Prune old telemetry snapshots (keep daily summaries)
  const snapResult = db.prepare(
    'DELETE FROM telemetry_snapshots WHERE collected_at < ?'
  ).run(hotCutoff);

  // Prune old insights (acknowledged + old)
  const insightResult = db.prepare(
    'DELETE FROM fleet_insights WHERE acknowledged = 1 AND created_at < ?'
  ).run(warmCutoff);

  // Prune old timeline events
  const timelineResult = db.prepare(
    'DELETE FROM fleet_timeline WHERE created_at < ?'
  ).run(warmCutoff);

  const result = {
    snapshotsPruned: snapResult.changes,
    insightsPruned: insightResult.changes,
    timelinePruned: timelineResult.changes,
  };

  if (result.snapshotsPruned > 0 || result.insightsPruned > 0) {
    logger.info(`Cortex data pruned: ${result.snapshotsPruned} snapshots, ${result.insightsPruned} insights, ${result.timelinePruned} timeline events`);
  }

  return result;
}

export function closeCortexDatabase(): void {
  if (cortexDb) {
    cortexDb.close();
    cortexDb = null;
    logger.info('Cortex database closed');
  }
}
