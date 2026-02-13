/**
 * Memory Manager — Add, retrieve, summarize, and prune soul memories
 *
 * Memories are categorized and scored by importance.
 * Old memories are periodically summarized so context doesn't grow forever.
 */

import { getDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MemoryManager');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryCategory =
  | 'experience'
  | 'decision'
  | 'learning'
  | 'interaction'
  | 'observation'
  | 'goal_progress'
  | 'summary';

export interface Memory {
  id: number;
  soul_id: string;
  category: MemoryCategory;
  content: string;
  importance: number;
  context: string | null;
  is_summarized: number;
  created_at: number;
}

export interface AddMemoryInput {
  soul_id: string;
  category: MemoryCategory;
  content: string;
  importance?: number;
  context?: string;
}

export interface MemoryStats {
  total: number;
  by_category: Record<string, number>;
  avg_importance: number;
  oldest: number | null;
  newest: number | null;
}

// ---------------------------------------------------------------------------
// Memory Manager
// ---------------------------------------------------------------------------

export class MemoryManager {
  /** Add a new memory for a soul */
  addMemory(input: AddMemoryInput): Memory {
    const db = getDatabase();
    const importance = Math.max(1, Math.min(10, input.importance ?? 5));

    const result = db.prepare(`
      INSERT INTO soul_memories (soul_id, category, content, importance, context)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.soul_id,
      input.category,
      input.content,
      importance,
      input.context || null,
    );

    logger.debug(`Memory added for ${input.soul_id}: [${input.category}] ${input.content.substring(0, 80)}`);

    return db.prepare('SELECT * FROM soul_memories WHERE id = ?').get(result.lastInsertRowid) as Memory;
  }

  /** Get recent memories for a soul */
  getRecentMemories(soulId: string, limit = 20): Memory[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM soul_memories
      WHERE soul_id = ? AND is_summarized = 0
      ORDER BY created_at DESC
      LIMIT ?
    `).all(soulId, limit) as Memory[];
  }

  /** Get the most important memories for a soul */
  getImportantMemories(soulId: string, limit = 10): Memory[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM soul_memories
      WHERE soul_id = ? AND importance >= 7
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(soulId, limit) as Memory[];
  }

  /** Get memories by category */
  getMemoriesByCategory(soulId: string, category: MemoryCategory, limit = 20): Memory[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM soul_memories
      WHERE soul_id = ? AND category = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(soulId, category, limit) as Memory[];
  }

  /** Search memories by content */
  searchMemories(soulId: string, query: string, limit = 20): Memory[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM soul_memories
      WHERE soul_id = ? AND content LIKE ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(soulId, `%${query}%`, limit) as Memory[];
  }

  /** Get memory stats for a soul */
  getMemoryStats(soulId: string): MemoryStats {
    const db = getDatabase();

    const total = (db.prepare('SELECT COUNT(*) as count FROM soul_memories WHERE soul_id = ?')
      .get(soulId) as { count: number }).count;

    const categories = db.prepare(`
      SELECT category, COUNT(*) as count FROM soul_memories
      WHERE soul_id = ? GROUP BY category
    `).all(soulId) as { category: string; count: number }[];

    const avg = (db.prepare('SELECT AVG(importance) as avg FROM soul_memories WHERE soul_id = ?')
      .get(soulId) as { avg: number | null }).avg;

    const oldest = (db.prepare('SELECT MIN(created_at) as ts FROM soul_memories WHERE soul_id = ?')
      .get(soulId) as { ts: number | null }).ts;

    const newest = (db.prepare('SELECT MAX(created_at) as ts FROM soul_memories WHERE soul_id = ?')
      .get(soulId) as { ts: number | null }).ts;

    const by_category: Record<string, number> = {};
    categories.forEach(c => { by_category[c.category] = c.count; });

    return { total, by_category, avg_importance: avg ?? 0, oldest, newest };
  }

  /**
   * Summarize old memories.
   * Takes all un-summarized memories older than `olderThanDays` days,
   * groups them by category, and creates summary memories.
   * Original memories are marked as summarized (not deleted).
   */
  summarizeOldMemories(soulId: string, olderThanDays = 7): number {
    const db = getDatabase();
    const cutoff = Math.floor(Date.now() / 1000) - (olderThanDays * 86400);

    const oldMemories = db.prepare(`
      SELECT * FROM soul_memories
      WHERE soul_id = ? AND is_summarized = 0 AND created_at < ?
      ORDER BY category, created_at
    `).all(soulId, cutoff) as Memory[];

    if (oldMemories.length === 0) return 0;

    // Group by category
    const grouped: Record<string, Memory[]> = {};
    oldMemories.forEach(m => {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m);
    });

    let summarized = 0;

    // Create summary for each category group
    for (const [category, memories] of Object.entries(grouped)) {
      if (memories.length < 3) continue; // Don't summarize tiny groups

      const maxImportance = Math.max(...memories.map(m => m.importance));
      const summaryContent = memories.map(m => `- ${m.content}`).join('\n');
      const summaryText = `Summary of ${memories.length} ${category} memories:\n${summaryContent}`;

      // Create summary memory
      db.prepare(`
        INSERT INTO soul_memories (soul_id, category, content, importance, context)
        VALUES (?, 'summary', ?, ?, ?)
      `).run(soulId, summaryText, Math.min(maxImportance + 1, 10), `Summarized from ${category}`);

      // Mark originals as summarized
      const ids = memories.map(m => m.id);
      db.prepare(`
        UPDATE soul_memories SET is_summarized = 1
        WHERE id IN (${ids.map(() => '?').join(',')})
      `).run(...ids);

      summarized += memories.length;
    }

    if (summarized > 0) {
      logger.info(`Summarized ${summarized} old memories for soul ${soulId}`);
    }

    return summarized;
  }

  /**
   * Prune low-importance summarized memories that are very old.
   * Only removes memories that have already been summarized AND
   * are older than `olderThanDays` days AND have importance <= threshold.
   */
  pruneMemories(soulId: string, olderThanDays = 30, importanceThreshold = 3): number {
    const db = getDatabase();
    const cutoff = Math.floor(Date.now() / 1000) - (olderThanDays * 86400);

    const result = db.prepare(`
      DELETE FROM soul_memories
      WHERE soul_id = ? AND is_summarized = 1 AND created_at < ? AND importance <= ?
    `).run(soulId, cutoff, importanceThreshold);

    if (result.changes > 0) {
      logger.info(`Pruned ${result.changes} old memories for soul ${soulId}`);
    }

    return result.changes;
  }

  /** Delete a specific memory */
  deleteMemory(memoryId: number): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM soul_memories WHERE id = ?').run(memoryId);
    return result.changes > 0;
  }
}
