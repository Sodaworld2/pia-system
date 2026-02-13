/**
 * Soul API Routes — CRUD for agent souls and their memories
 */

import { Router, Request, Response } from 'express';
import { getSoulEngine } from '../../souls/soul-engine.js';
import { getDatabase } from '../../db/database.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('SoulsAPI');

/** Helper to extract string param (Express 5 types params as string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

// ---------------------------------------------------------------------------
// Soul CRUD
// ---------------------------------------------------------------------------

/** GET /api/souls — List all souls */
router.get('/', (_req: Request, res: Response) => {
  try {
    const includeArchived = _req.query.includeArchived === 'true';
    const souls = getSoulEngine().listSouls(includeArchived);
    res.json(souls);
  } catch (error) {
    logger.error(`Failed to list souls: ${error}`);
    res.status(500).json({ error: 'Failed to list souls' });
  }
});

/** GET /api/souls/:id — Get a soul by ID */
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const soul = getSoulEngine().getSoul(param(req, 'id'));
    if (!soul) {
      res.status(404).json({ error: 'Soul not found' });
      return;
    }
    res.json(soul);
  } catch (error) {
    logger.error(`Failed to get soul: ${error}`);
    res.status(500).json({ error: 'Failed to get soul' });
  }
});

/** POST /api/souls — Create a new soul */
router.post('/', (req: Request, res: Response): void => {
  try {
    const { id, name, role, personality, goals, relationships, system_prompt, config, email } = req.body;

    if (!id || !name || !role || !personality) {
      res.status(400).json({ error: 'id, name, role, and personality are required' });
      return;
    }

    const soul = getSoulEngine().createSoul({
      id, name, role, personality,
      goals: goals || [],
      relationships: relationships || {},
      system_prompt,
      config,
      email,
    });

    res.status(201).json(soul);
  } catch (error) {
    logger.error(`Failed to create soul: ${error}`);
    res.status(500).json({ error: 'Failed to create soul' });
  }
});

/** PUT /api/souls/:id — Update a soul */
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const updates = req.body;
    delete updates.id;

    const soul = getSoulEngine().updateSoul(param(req, 'id'), updates);
    if (!soul) {
      res.status(404).json({ error: 'Soul not found' });
      return;
    }

    res.json(soul);
  } catch (error) {
    logger.error(`Failed to update soul: ${error}`);
    res.status(500).json({ error: 'Failed to update soul' });
  }
});

/** DELETE /api/souls/:id — Delete a soul */
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const deleted = getSoulEngine().deleteSoul(param(req, 'id'));
    if (!deleted) {
      res.status(404).json({ error: 'Soul not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete soul: ${error}`);
    res.status(500).json({ error: 'Failed to delete soul' });
  }
});

/** PATCH /api/souls/:id/status — Set soul status */
router.patch('/:id/status', (req: Request, res: Response): void => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'archived'].includes(status)) {
      res.status(400).json({ error: 'status must be active, inactive, or archived' });
      return;
    }

    const updated = getSoulEngine().setSoulStatus(param(req, 'id'), status);
    if (!updated) {
      res.status(404).json({ error: 'Soul not found' });
      return;
    }

    res.json({ success: true, status });
  } catch (error) {
    logger.error(`Failed to update soul status: ${error}`);
    res.status(500).json({ error: 'Failed to update soul status' });
  }
});

// ---------------------------------------------------------------------------
// System Prompt Generation
// ---------------------------------------------------------------------------

/** GET /api/souls/:id/prompt — Generate full system prompt for a soul */
router.get('/:id/prompt', (req: Request, res: Response): void => {
  try {
    const extraContext = req.query.context as string | undefined;
    const prompt = getSoulEngine().generateSystemPrompt(param(req, 'id'), extraContext);
    res.json({ prompt });
  } catch (error) {
    logger.error(`Failed to generate prompt: ${error}`);
    res.status(500).json({ error: 'Failed to generate prompt' });
  }
});

// ---------------------------------------------------------------------------
// Memory Routes
// ---------------------------------------------------------------------------

/** GET /api/souls/:id/memories — Get memories for a soul */
router.get('/:id/memories', (req: Request, res: Response): void => {
  try {
    const soulId = param(req, 'id');
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const mm = getSoulEngine().getMemoryManager();

    let memories;
    if (search) {
      memories = mm.searchMemories(soulId, search, limit);
    } else if (category) {
      memories = mm.getMemoriesByCategory(soulId, category as any, limit);
    } else {
      memories = mm.getRecentMemories(soulId, limit);
    }

    res.json(memories);
  } catch (error) {
    logger.error(`Failed to get memories: ${error}`);
    res.status(500).json({ error: 'Failed to get memories' });
  }
});

/** GET /api/souls/:id/memories/stats — Get memory statistics */
router.get('/:id/memories/stats', (req: Request, res: Response): void => {
  try {
    const stats = getSoulEngine().getMemoryManager().getMemoryStats(param(req, 'id'));
    res.json(stats);
  } catch (error) {
    logger.error(`Failed to get memory stats: ${error}`);
    res.status(500).json({ error: 'Failed to get memory stats' });
  }
});

/** POST /api/souls/:id/memories — Add a memory */
router.post('/:id/memories', (req: Request, res: Response): void => {
  try {
    const { category, content, importance, context } = req.body;

    if (!category || !content) {
      res.status(400).json({ error: 'category and content are required' });
      return;
    }

    const memory = getSoulEngine().getMemoryManager().addMemory({
      soul_id: param(req, 'id'),
      category,
      content,
      importance,
      context,
    });

    res.status(201).json(memory);
  } catch (error) {
    logger.error(`Failed to add memory: ${error}`);
    res.status(500).json({ error: 'Failed to add memory' });
  }
});

/** DELETE /api/souls/:id/memories/:memoryId — Delete a specific memory */
router.delete('/:id/memories/:memoryId', (req: Request, res: Response): void => {
  try {
    const deleted = getSoulEngine().getMemoryManager().deleteMemory(parseInt(param(req, 'memoryId')));
    if (!deleted) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete memory: ${error}`);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

/** POST /api/souls/:id/memories/summarize — Summarize old memories */
router.post('/:id/memories/summarize', (req: Request, res: Response): void => {
  try {
    const olderThanDays = parseInt(req.body.olderThanDays) || 7;
    const count = getSoulEngine().getMemoryManager().summarizeOldMemories(param(req, 'id'), olderThanDays);
    res.json({ summarized: count });
  } catch (error) {
    logger.error(`Failed to summarize memories: ${error}`);
    res.status(500).json({ error: 'Failed to summarize memories' });
  }
});

/** POST /api/souls/:id/memories/prune — Prune old summarized memories */
router.post('/:id/memories/prune', (req: Request, res: Response): void => {
  try {
    const olderThanDays = parseInt(req.body.olderThanDays) || 30;
    const importanceThreshold = parseInt(req.body.importanceThreshold) || 3;
    const count = getSoulEngine().getMemoryManager().pruneMemories(param(req, 'id'), olderThanDays, importanceThreshold);
    res.json({ pruned: count });
  } catch (error) {
    logger.error(`Failed to prune memories: ${error}`);
    res.status(500).json({ error: 'Failed to prune memories' });
  }
});

// ---------------------------------------------------------------------------
// Interaction Log
// ---------------------------------------------------------------------------

/** GET /api/souls/:id/interactions — Get interaction log for a soul */
router.get('/:id/interactions', (req: Request, res: Response): void => {
  try {
    const db = getDatabase();
    const limit = parseInt(req.query.limit as string) || 50;
    const soulId = param(req, 'id');

    const interactions = db.prepare(`
      SELECT si.*, s1.name as from_name, s2.name as to_name
      FROM soul_interactions si
      JOIN souls s1 ON si.from_soul_id = s1.id
      JOIN souls s2 ON si.to_soul_id = s2.id
      WHERE si.from_soul_id = ? OR si.to_soul_id = ?
      ORDER BY si.created_at DESC
      LIMIT ?
    `).all(soulId, soulId, limit);

    res.json(interactions);
  } catch (error) {
    logger.error(`Failed to get interactions: ${error}`);
    res.status(500).json({ error: 'Failed to get interactions' });
  }
});

/** POST /api/souls/interact — Log an interaction between two souls */
router.post('/interact', (req: Request, res: Response): void => {
  try {
    const { from_soul_id, to_soul_id, interaction_type, content, metadata } = req.body;

    if (!from_soul_id || !to_soul_id || !interaction_type || !content) {
      res.status(400).json({ error: 'from_soul_id, to_soul_id, interaction_type, and content are required' });
      return;
    }

    const db = getDatabase();

    const result = db.prepare(`
      INSERT INTO soul_interactions (from_soul_id, to_soul_id, interaction_type, content, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(from_soul_id, to_soul_id, interaction_type, content, JSON.stringify(metadata || {}));

    const interaction = db.prepare('SELECT * FROM soul_interactions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(interaction);
  } catch (error) {
    logger.error(`Failed to log interaction: ${error}`);
    res.status(500).json({ error: 'Failed to log interaction' });
  }
});

export default router;
