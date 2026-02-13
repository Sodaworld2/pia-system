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
    {
      name: '003_agent_souls',
      sql: `
        -- Agent Souls: persistent AI personalities
        CREATE TABLE IF NOT EXISTS souls (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL,
          personality TEXT NOT NULL,
          goals TEXT DEFAULT '[]',
          relationships TEXT DEFAULT '{}',
          system_prompt TEXT,
          config TEXT DEFAULT '{}',
          email TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'archived')),
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );

        -- Soul Memories: what agents have learned and done
        CREATE TABLE IF NOT EXISTS soul_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          soul_id TEXT NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
          category TEXT NOT NULL CHECK(category IN ('experience', 'decision', 'learning', 'interaction', 'observation', 'goal_progress', 'summary')),
          content TEXT NOT NULL,
          importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
          context TEXT,
          is_summarized INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Soul Interaction Log: track inter-agent communication
        CREATE TABLE IF NOT EXISTS soul_interactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_soul_id TEXT NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
          to_soul_id TEXT NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
          interaction_type TEXT NOT NULL CHECK(interaction_type IN ('task_request', 'review_request', 'status_update', 'question', 'response', 'notification')),
          content TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER DEFAULT (unixepoch())
        );

        -- Indexes for soul tables
        CREATE INDEX IF NOT EXISTS idx_soul_memories_soul ON soul_memories(soul_id);
        CREATE INDEX IF NOT EXISTS idx_soul_memories_category ON soul_memories(category);
        CREATE INDEX IF NOT EXISTS idx_soul_memories_importance ON soul_memories(importance);
        CREATE INDEX IF NOT EXISTS idx_soul_memories_created ON soul_memories(created_at);
        CREATE INDEX IF NOT EXISTS idx_soul_interactions_from ON soul_interactions(from_soul_id);
        CREATE INDEX IF NOT EXISTS idx_soul_interactions_to ON soul_interactions(to_soul_id);
        CREATE INDEX IF NOT EXISTS idx_soul_interactions_created ON soul_interactions(created_at);
      `,
    },
    {
      name: '004_work_sessions',
      sql: `
        -- Work Sessions: track "sit down and work on a project" sessions
        CREATE TABLE IF NOT EXISTS work_sessions (
          id TEXT PRIMARY KEY,
          project_name TEXT NOT NULL,
          project_path TEXT NOT NULL,
          machine_name TEXT NOT NULL,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
          started_at INTEGER DEFAULT (unixepoch()),
          ended_at INTEGER,
          duration_seconds INTEGER,
          notes TEXT,
          git_branch TEXT,
          git_commits_before TEXT,
          git_commits_after TEXT,
          files_changed INTEGER DEFAULT 0,
          review_task_id TEXT,
          review_status TEXT CHECK(review_status IN ('pending', 'running', 'completed', 'skipped')),
          metadata TEXT DEFAULT '{}'
        );

        -- Known projects (remembered from past sessions)
        CREATE TABLE IF NOT EXISTS known_projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          path TEXT NOT NULL,
          machine_name TEXT,
          github_repo TEXT,
          last_session_id TEXT,
          last_worked_at INTEGER,
          session_count INTEGER DEFAULT 0,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_work_sessions_machine ON work_sessions(machine_name);
        CREATE INDEX IF NOT EXISTS idx_work_sessions_started ON work_sessions(started_at);
        CREATE INDEX IF NOT EXISTS idx_known_projects_name ON known_projects(name);
        CREATE INDEX IF NOT EXISTS idx_known_projects_last ON known_projects(last_worked_at);
      `,
    },
    {
      name: '020_mission_control',
      sql: `
        -- Mission Control agent sessions
        CREATE TABLE IF NOT EXISTS mc_agent_sessions (
          id TEXT PRIMARY KEY,
          machine_id TEXT NOT NULL DEFAULT 'local',
          mode TEXT NOT NULL CHECK (mode IN ('api', 'pty')),
          task TEXT NOT NULL,
          cwd TEXT NOT NULL,
          approval_mode TEXT NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('manual', 'auto')),
          model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
          status TEXT NOT NULL DEFAULT 'starting',
          cost_usd REAL DEFAULT 0,
          tokens_in INTEGER DEFAULT 0,
          tokens_out INTEGER DEFAULT 0,
          tool_calls INTEGER DEFAULT 0,
          error_message TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          completed_at INTEGER
        );

        -- Mission Control prompts queue
        CREATE TABLE IF NOT EXISTS mc_prompts (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          question TEXT NOT NULL,
          options TEXT,
          type TEXT NOT NULL DEFAULT 'tool_approval',
          status TEXT NOT NULL DEFAULT 'pending',
          response TEXT,
          auto_reason TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          responded_at INTEGER,
          FOREIGN KEY (agent_id) REFERENCES mc_agent_sessions(id) ON DELETE CASCADE
        );

        -- Mission Control activity journal
        CREATE TABLE IF NOT EXISTS mc_journal (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          FOREIGN KEY (agent_id) REFERENCES mc_agent_sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_mc_prompts_agent ON mc_prompts(agent_id);
        CREATE INDEX IF NOT EXISTS idx_mc_prompts_status ON mc_prompts(status);
        CREATE INDEX IF NOT EXISTS idx_mc_journal_agent ON mc_journal(agent_id);
      `,
    },
    {
      name: '025_dao_foundation',
      sql: `
        -- Users master table
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          firebase_uid TEXT UNIQUE,
          email TEXT UNIQUE,
          display_name TEXT,
          avatar_url TEXT,
          role TEXT DEFAULT 'member',
          wallet_address TEXT,
          metadata TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- DAOs
        CREATE TABLE IF NOT EXISTS daos (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT,
          description TEXT DEFAULT '',
          mission TEXT,
          phase TEXT DEFAULT 'inception',
          governance_model TEXT DEFAULT 'founder_led',
          treasury_address TEXT,
          settings TEXT DEFAULT '{}',
          founder_id TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- DAO Members
        CREATE TABLE IF NOT EXISTS dao_members (
          id TEXT PRIMARY KEY,
          dao_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT DEFAULT 'member',
          joined_at TEXT DEFAULT (datetime('now')),
          left_at TEXT,
          voting_power REAL DEFAULT 1,
          reputation_score REAL DEFAULT 0,
          metadata TEXT DEFAULT '{}'
        );

        -- Agreements
        CREATE TABLE IF NOT EXISTS agreements (
          id TEXT PRIMARY KEY,
          dao_id TEXT NOT NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT DEFAULT 'draft',
          version INTEGER DEFAULT 1,
          content_markdown TEXT DEFAULT '',
          terms TEXT DEFAULT '{}',
          created_by TEXT NOT NULL,
          parent_agreement_id TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Agreement Signatures
        CREATE TABLE IF NOT EXISTS agreement_signatures (
          id TEXT PRIMARY KEY,
          agreement_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          signed_at TEXT DEFAULT (datetime('now')),
          signature_hash TEXT NOT NULL,
          ip_address TEXT NOT NULL,
          metadata TEXT DEFAULT '{}'
        );

        -- Proposals
        CREATE TABLE IF NOT EXISTS proposals (
          id TEXT PRIMARY KEY,
          dao_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          type TEXT NOT NULL,
          status TEXT DEFAULT 'draft',
          author_id TEXT NOT NULL,
          voting_starts_at TEXT,
          voting_ends_at TEXT,
          quorum_required REAL DEFAULT 0.5,
          approval_threshold REAL DEFAULT 0.5,
          execution_payload TEXT,
          result_summary TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Votes
        CREATE TABLE IF NOT EXISTS votes (
          id TEXT PRIMARY KEY,
          proposal_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          choice TEXT NOT NULL,
          weight REAL DEFAULT 1,
          reason TEXT,
          cast_at TEXT DEFAULT (datetime('now'))
        );

        -- AI Conversations
        CREATE TABLE IF NOT EXISTS ai_conversations (
          id TEXT PRIMARY KEY,
          dao_id TEXT NOT NULL,
          module_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          parent_message_id TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Knowledge Items
        CREATE TABLE IF NOT EXISTS knowledge_items (
          id TEXT PRIMARY KEY,
          dao_id TEXT NOT NULL,
          module_id TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          confidence REAL DEFAULT 1.0,
          tags TEXT DEFAULT '[]',
          embedding_vector TEXT,
          created_by TEXT NOT NULL,
          expires_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Bounties
        CREATE TABLE IF NOT EXISTS bounties (
          id TEXT PRIMARY KEY,
          dao_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          reward_amount REAL NOT NULL,
          reward_token TEXT DEFAULT 'USDC',
          status TEXT DEFAULT 'open',
          created_by TEXT NOT NULL,
          claimed_by TEXT,
          deadline TEXT,
          deliverables TEXT DEFAULT '[]',
          tags TEXT DEFAULT '[]',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Marketplace Items
        CREATE TABLE IF NOT EXISTS marketplace_items (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          type TEXT NOT NULL,
          status TEXT DEFAULT 'draft',
          price REAL DEFAULT 0,
          currency TEXT DEFAULT 'USDC',
          author_id TEXT NOT NULL,
          dao_id TEXT,
          download_count INTEGER DEFAULT 0,
          rating_avg REAL DEFAULT 0,
          rating_count INTEGER DEFAULT 0,
          metadata TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Indexes for DAO tables
        CREATE INDEX IF NOT EXISTS idx_dao_members_dao ON dao_members(dao_id);
        CREATE INDEX IF NOT EXISTS idx_dao_members_user ON dao_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_agreements_dao ON agreements(dao_id);
        CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements(status);
        CREATE INDEX IF NOT EXISTS idx_agreement_sigs_agreement ON agreement_signatures(agreement_id);
        CREATE INDEX IF NOT EXISTS idx_proposals_dao ON proposals(dao_id);
        CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
        CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_dao ON ai_conversations(dao_id);
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_module ON ai_conversations(module_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_items_dao ON knowledge_items(dao_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_items_module ON knowledge_items(module_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_items_category ON knowledge_items(category);
        CREATE INDEX IF NOT EXISTS idx_bounties_dao ON bounties(dao_id);
        CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
        CREATE INDEX IF NOT EXISTS idx_marketplace_items_type ON marketplace_items(type);
        CREATE INDEX IF NOT EXISTS idx_marketplace_items_status ON marketplace_items(status);
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
