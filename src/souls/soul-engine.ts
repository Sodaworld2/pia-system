/**
 * Soul Engine — Load, save, update agent souls
 *
 * Each agent has a "soul": persistent personality, memory, goals, and
 * relationships that survive across sessions and machines.
 * When an agent wakes up, their soul is loaded and injected into the
 * system prompt. After each session, new memories are saved back.
 */

import { getDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';
import { MemoryManager } from './memory-manager.js';

const logger = createLogger('SoulEngine');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Soul {
  id: string;
  name: string;
  role: string;
  personality: string;
  goals: string[];
  relationships: Record<string, string>;
  system_prompt: string | null;
  config: Record<string, unknown>;
  email: string | null;
  status: 'active' | 'inactive' | 'archived';
  created_at: number;
  updated_at: number;
}

export interface SoulDefinition {
  id: string;
  name: string;
  role: string;
  personality: string;
  goals: string[];
  relationships: Record<string, string>;
  system_prompt?: string;
  config?: Record<string, unknown>;
  email?: string;
}

interface SoulRow {
  id: string;
  name: string;
  role: string;
  personality: string;
  goals: string;
  relationships: string;
  system_prompt: string | null;
  config: string;
  email: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Row <-> Soul conversion
// ---------------------------------------------------------------------------

function rowToSoul(row: SoulRow): Soul {
  return {
    ...row,
    goals: JSON.parse(row.goals || '[]'),
    relationships: JSON.parse(row.relationships || '{}'),
    config: JSON.parse(row.config || '{}'),
    status: row.status as Soul['status'],
  };
}

// ---------------------------------------------------------------------------
// Soul Engine
// ---------------------------------------------------------------------------

export class SoulEngine {
  private memoryManager: MemoryManager;

  constructor() {
    this.memoryManager = new MemoryManager();
  }

  /** Get all souls */
  listSouls(includeArchived = false): Soul[] {
    const db = getDatabase();
    const query = includeArchived
      ? 'SELECT * FROM souls ORDER BY name'
      : "SELECT * FROM souls WHERE status != 'archived' ORDER BY name";
    const rows = db.prepare(query).all() as SoulRow[];
    return rows.map(rowToSoul);
  }

  /** Get a soul by ID */
  getSoul(id: string): Soul | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM souls WHERE id = ?').get(id) as SoulRow | undefined;
    return row ? rowToSoul(row) : null;
  }

  /** Get a soul by name (case-insensitive) */
  getSoulByName(name: string): Soul | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM souls WHERE LOWER(name) = LOWER(?)').get(name) as SoulRow | undefined;
    return row ? rowToSoul(row) : null;
  }

  /** Create a new soul from a definition */
  createSoul(def: SoulDefinition): Soul {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO souls (id, name, role, personality, goals, relationships, system_prompt, config, email, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      def.id,
      def.name,
      def.role,
      def.personality,
      JSON.stringify(def.goals),
      JSON.stringify(def.relationships),
      def.system_prompt || null,
      JSON.stringify(def.config || {}),
      def.email || null,
      now,
      now,
    );

    logger.info(`Soul created: ${def.name} (${def.id})`);
    return this.getSoul(def.id)!;
  }

  /** Update an existing soul */
  updateSoul(id: string, updates: Partial<Omit<SoulDefinition, 'id'>>): Soul | null {
    const db = getDatabase();
    const existing = this.getSoul(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
    if (updates.personality !== undefined) { fields.push('personality = ?'); values.push(updates.personality); }
    if (updates.goals !== undefined) { fields.push('goals = ?'); values.push(JSON.stringify(updates.goals)); }
    if (updates.relationships !== undefined) { fields.push('relationships = ?'); values.push(JSON.stringify(updates.relationships)); }
    if (updates.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(updates.system_prompt); }
    if (updates.config !== undefined) { fields.push('config = ?'); values.push(JSON.stringify(updates.config)); }
    if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email); }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(id);

    db.prepare(`UPDATE souls SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    logger.info(`Soul updated: ${existing.name} (${id})`);
    return this.getSoul(id);
  }

  /** Set soul status */
  setSoulStatus(id: string, status: Soul['status']): boolean {
    const db = getDatabase();
    const result = db.prepare('UPDATE souls SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Math.floor(Date.now() / 1000), id);
    return result.changes > 0;
  }

  /** Delete a soul permanently */
  deleteSoul(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM souls WHERE id = ?').run(id);
    if (result.changes > 0) {
      logger.info(`Soul deleted: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Generate the full system prompt for a soul.
   * This combines the soul's personality, goals, recent memories,
   * and relationships into one coherent system prompt.
   */
  generateSystemPrompt(soulId: string, extraContext?: string): string {
    const soul = this.getSoul(soulId);
    if (!soul) throw new Error(`Soul not found: ${soulId}`);

    const recentMemories = this.memoryManager.getRecentMemories(soulId, 20);
    const importantMemories = this.memoryManager.getImportantMemories(soulId, 10);

    // Deduplicate memories (important ones may overlap with recent)
    const seenIds = new Set<number>();
    const allMemories = [...importantMemories, ...recentMemories].filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });

    const parts: string[] = [];

    // Identity
    parts.push(`# Identity: ${soul.name}`);
    parts.push(`**Role:** ${soul.role}`);
    if (soul.email) parts.push(`**Email:** ${soul.email}`);
    parts.push('');

    // Personality
    parts.push('## Personality');
    parts.push(soul.personality);
    parts.push('');

    // Custom system prompt (if any)
    if (soul.system_prompt) {
      parts.push('## Instructions');
      parts.push(soul.system_prompt);
      parts.push('');
    }

    // Goals
    if (soul.goals.length > 0) {
      parts.push('## Current Goals');
      soul.goals.forEach((goal, i) => parts.push(`${i + 1}. ${goal}`));
      parts.push('');
    }

    // Relationships
    const relEntries = Object.entries(soul.relationships);
    if (relEntries.length > 0) {
      parts.push('## Relationships');
      relEntries.forEach(([name, desc]) => parts.push(`- **${name}**: ${desc}`));
      parts.push('');
    }

    // Memories
    if (allMemories.length > 0) {
      parts.push('## Recent Memory');
      allMemories.forEach(m => {
        const date = new Date(m.created_at * 1000).toISOString().split('T')[0];
        parts.push(`- [${m.category}/${date}] ${m.content}`);
      });
      parts.push('');
    }

    // Extra context (e.g., current task or project info)
    if (extraContext) {
      parts.push('## Current Context');
      parts.push(extraContext);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Load a soul definition from a JSON file and upsert it into the database.
   * Used during startup to seed/update default personalities.
   */
  seedSoul(def: SoulDefinition): Soul {
    const existing = this.getSoul(def.id);
    if (existing) {
      // Always update from JSON on startup — picks up config changes like preferred_model
      this.updateSoul(def.id, {
        name: def.name,
        role: def.role,
        personality: def.personality,
        goals: def.goals,
        relationships: def.relationships,
        system_prompt: def.system_prompt,
        config: def.config,
        email: def.email,
      });
      logger.info(`Soul refreshed: ${def.name}`);
      return this.getSoul(def.id)!;
    }
    return this.createSoul(def);
  }

  /** Get the memory manager for direct memory operations */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: SoulEngine | null = null;

export function getSoulEngine(): SoulEngine {
  if (!instance) {
    instance = new SoulEngine();
  }
  return instance;
}
