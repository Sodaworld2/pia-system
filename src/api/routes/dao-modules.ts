/**
 * DAO Module API Routes — Wire the 9 AI modules to the API
 *
 * Exposes:
 *   GET  /api/modules          — List all available modules
 *   GET  /api/modules/status   — Get status of all instantiated modules
 *   GET  /api/modules/:id      — Get module info
 *   POST /api/modules/:id/chat — Send a message to a module
 *   POST /api/modules/:id/learn — Teach a module something
 *   GET  /api/modules/:id/knowledge — Get module's knowledge for a DAO
 */

import { Router, Request, Response } from 'express';
import knex, { Knex } from 'knex';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';

// Module imports — these use @ts-nocheck internally, import works fine at runtime
import { ModuleRegistry } from '../../../dao-foundation-files/backend/src/modules/index.js';
import type { AIModuleId, AgentMessage } from '../../../dao-foundation-files/types/foundation.js';

const router = Router();
const logger = createLogger('DAOModules');

// ── Knex instance (shared across all modules, pointed at same SQLite DB) ──

let db: Knex | null = null;
let registry: InstanceType<typeof ModuleRegistry> | null = null;

function getKnex(): Knex {
  if (!db) {
    db = knex({
      client: 'better-sqlite3',
      connection: {
        filename: config.database.path,
      },
      useNullAsDefault: true,
    });
    logger.info(`Knex connected to ${config.database.path}`);
  }
  return db;
}

function getRegistry(): InstanceType<typeof ModuleRegistry> {
  if (!registry) {
    registry = new ModuleRegistry(getKnex());
    logger.info('ModuleRegistry initialized');
  }
  return registry;
}

/** Helper to extract string param */
function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

const VALID_MODULES: AIModuleId[] = [
  'coach', 'legal', 'treasury', 'governance',
  'community', 'product', 'security', 'analytics', 'onboarding',
];

// ─── Routes ────────────────────────────────────────────────────────────────

/** GET /api/modules — List all available modules */
router.get('/', (_req: Request, res: Response) => {
  try {
    const reg = getRegistry();
    const modules = reg.availableModules.map(id => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      available: true,
    }));
    res.json({ modules });
  } catch (error) {
    logger.error(`Failed to list modules: ${error}`);
    res.status(500).json({ error: 'Failed to list modules' });
  }
});

/** GET /api/modules/status — Get status of all instantiated modules */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const reg = getRegistry();
    const status = await reg.getStatus();
    res.json({ status });
  } catch (error) {
    logger.error(`Failed to get module status: ${error}`);
    res.status(500).json({ error: 'Failed to get module status' });
  }
});

/** GET /api/modules/:id — Get a specific module's info */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, 'id') as AIModuleId;
    if (!VALID_MODULES.includes(moduleId)) {
      res.status(404).json({ error: `Unknown module: ${moduleId}` });
      return;
    }

    const reg = getRegistry();
    const mod = reg.getModule(moduleId);
    const status = await mod.getStatus();

    res.json({
      id: moduleId,
      name: mod.moduleName,
      status,
    });
  } catch (error) {
    logger.error(`Failed to get module ${param(req, 'id')}: ${error}`);
    res.status(500).json({ error: 'Failed to get module info' });
  }
});

/** POST /api/modules/:id/chat — Send a message to a module */
router.post('/:id/chat', async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, 'id') as AIModuleId;
    if (!VALID_MODULES.includes(moduleId)) {
      res.status(404).json({ error: `Unknown module: ${moduleId}` });
      return;
    }

    const { content, dao_id, user_id, context, parent_message_id } = req.body;

    if (!content || !dao_id) {
      res.status(400).json({ error: 'Missing required fields: content, dao_id' });
      return;
    }

    const message: AgentMessage = {
      content,
      dao_id,
      user_id: user_id || 'anonymous',
      context,
      parent_message_id,
    };

    const reg = getRegistry();
    const mod = reg.getModule(moduleId);
    const response = await mod.processMessage(message);

    res.json({ success: true, response });
  } catch (error) {
    logger.error(`Module chat error (${param(req, 'id')}): ${error}`);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/** POST /api/modules/:id/learn — Teach a module new knowledge */
router.post('/:id/learn', async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, 'id') as AIModuleId;
    if (!VALID_MODULES.includes(moduleId)) {
      res.status(404).json({ error: `Unknown module: ${moduleId}` });
      return;
    }

    const { dao_id, category, title, content: itemContent, source, created_by, tags } = req.body;

    if (!dao_id || !category || !title || !itemContent) {
      res.status(400).json({ error: 'Missing required fields: dao_id, category, title, content' });
      return;
    }

    const reg = getRegistry();
    const mod = reg.getModule(moduleId);
    const item = await mod.learn(dao_id, {
      dao_id,
      module_id: moduleId,
      category,
      title,
      content: itemContent,
      source: source || 'user_input',
      confidence: 1.0,
      tags: tags || [],
      embedding_vector: null,
      created_by: created_by || 'anonymous',
      expires_at: null,
    });

    res.json({ success: true, item });
  } catch (error) {
    logger.error(`Module learn error (${param(req, 'id')}): ${error}`);
    res.status(500).json({ error: 'Failed to store knowledge' });
  }
});

/** GET /api/modules/:id/knowledge — Get module's knowledge for a DAO */
router.get('/:id/knowledge', async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, 'id') as AIModuleId;
    if (!VALID_MODULES.includes(moduleId)) {
      res.status(404).json({ error: `Unknown module: ${moduleId}` });
      return;
    }

    const daoId = req.query.dao_id as string;
    const category = req.query.category as string | undefined;

    if (!daoId) {
      res.status(400).json({ error: 'Missing required query param: dao_id' });
      return;
    }

    const reg = getRegistry();
    const mod = reg.getModule(moduleId);
    const items = await mod.getKnowledge(daoId, category as any);

    res.json({ items });
  } catch (error) {
    logger.error(`Module knowledge error (${param(req, 'id')}): ${error}`);
    res.status(500).json({ error: 'Failed to get knowledge' });
  }
});

export default router;
