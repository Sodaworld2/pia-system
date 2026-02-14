// @ts-nocheck
import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Helper to get the ModuleRegistry from global scope.
 * It's set during server startup in index.ts.
 */
function getRegistry() {
  const reg = (global as any).__moduleRegistry;
  if (!reg) throw new Error('ModuleRegistry not initialized');
  return reg;
}

// ---------------------------------------------------------------
// GET /api/modules — List all available AI modules
// ---------------------------------------------------------------
router.get('/', (_req: Request, res: Response) => {
  try {
    const registry = getRegistry();
    res.json({
      modules: registry.availableModules,
      count: registry.availableModules.length,
    });
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// GET /api/modules/status — Health status of all modules
// ---------------------------------------------------------------
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const registry = getRegistry();
    const status = await registry.getStatus();
    res.json({ status: 'operational', modules: status });
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/modules/:moduleId/chat — Send a message to a module
// ---------------------------------------------------------------
router.post('/:moduleId/chat', async (req: Request, res: Response) => {
  try {
    const registry = getRegistry();
    const { moduleId } = req.params;
    const { content, dao_id, user_id, context } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const mod = registry.getModule(moduleId);
    if (!mod) {
      return res.status(404).json({ error: `Module '${moduleId}' not found` });
    }

    const response = await mod.processMessage({
      content,
      dao_id: dao_id || 'default',
      user_id: user_id || 'anonymous',
      context: context || {},
    });

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// POST /api/modules/:moduleId/learn — Teach a module something
// ---------------------------------------------------------------
router.post('/:moduleId/learn', async (req: Request, res: Response) => {
  try {
    const registry = getRegistry();
    const { moduleId } = req.params;
    const { dao_id, category, title, content, source, created_by, tags } = req.body;

    if (!dao_id || !title || !content) {
      return res.status(400).json({ error: 'dao_id, title, and content are required' });
    }

    const mod = registry.getModule(moduleId);
    if (!mod) {
      return res.status(404).json({ error: `Module '${moduleId}' not found` });
    }

    const item = await mod.learn(dao_id, {
      category: category || 'general',
      title,
      content,
      source: source || 'api',
      created_by: created_by || 'anonymous',
      tags: tags || [],
    });

    res.json({ stored: true, item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// GET /api/modules/:moduleId/knowledge — Get module knowledge
// ---------------------------------------------------------------
router.get('/:moduleId/knowledge', async (req: Request, res: Response) => {
  try {
    const registry = getRegistry();
    const { moduleId } = req.params;
    const { dao_id, category, limit } = req.query;

    if (!dao_id) {
      return res.status(400).json({ error: 'dao_id query param is required' });
    }

    const mod = registry.getModule(moduleId);
    if (!mod) {
      return res.status(404).json({ error: `Module '${moduleId}' not found` });
    }

    const items = await mod.getKnowledge(
      dao_id as string,
      (category as string) || undefined,
      parseInt(limit as string) || 20,
    );

    res.json({ module: moduleId, dao_id, items, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// GET /api/modules/:moduleId/status — Single module status
// ---------------------------------------------------------------
router.get('/:moduleId/status', async (req: Request, res: Response) => {
  try {
    const registry = getRegistry();
    const { moduleId } = req.params;

    const mod = registry.getModule(moduleId);
    if (!mod) {
      return res.status(404).json({ error: `Module '${moduleId}' not found` });
    }

    const status = await mod.getStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
