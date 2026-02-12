/**
 * Agent Factory API Routes
 *
 * POST /api/factory/spawn         - Spawn agent from template
 * GET  /api/factory/templates     - List all templates
 * GET  /api/factory/status        - Full factory status (templates + running)
 * POST /api/factory/stop/:id      - Stop a specific agent
 * POST /api/factory/stop-all      - Stop all agents (optional: by template)
 * GET  /api/factory/cost/status   - Cost router tier status
 * GET  /api/factory/cost/estimate - Estimate cost for a tier
 */

import { Router, Request, Response } from 'express';
import { getAgentFactory } from '../../agents/agent-factory.js';
import { getCostRouter } from '../../agents/cost-router.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('FactoryAPI');

// POST /api/factory/spawn - Spawn an agent from a template
router.post('/spawn', (req: Request, res: Response) => {
  try {
    const { template, task, machineId, autoStart, metadata } = req.body;

    if (!template || !task) {
      res.status(400).json({ error: 'template and task are required' });
      return;
    }

    const factory = getAgentFactory();
    const result = factory.spawn(template, {
      taskDescription: task,
      machineId,
      autoStart,
      metadata,
    });

    logger.info(`Spawned ${result.agent.name} for: ${task}`);

    res.status(201).json({
      agent: result.agent,
      template: {
        name: result.template.name,
        displayName: result.template.displayName,
        costTier: result.template.costTier,
      },
      costEstimate: result.costEstimate,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Spawn failed: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

// GET /api/factory/templates - List all available templates
router.get('/templates', (_req: Request, res: Response) => {
  try {
    const factory = getAgentFactory();
    const templates = factory.getTemplates().map(t => ({
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      capabilities: t.capabilities,
      modelPreference: t.modelPreference,
      costTier: t.costTier,
      maxConcurrent: t.maxConcurrent,
    }));
    res.json(templates);
  } catch (error) {
    logger.error(`Failed to list templates: ${error}`);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// GET /api/factory/status - Full factory status
router.get('/status', (_req: Request, res: Response) => {
  try {
    const factory = getAgentFactory();
    const status = factory.list();

    res.json({
      templates: status.templates.map(t => ({
        name: t.name,
        displayName: t.displayName,
        costTier: t.costTier,
        maxConcurrent: t.maxConcurrent,
      })),
      running: status.running,
      totalSpawned: status.totalSpawned,
      byTemplate: status.byTemplate,
    });
  } catch (error) {
    logger.error(`Failed to get factory status: ${error}`);
    res.status(500).json({ error: 'Failed to get factory status' });
  }
});

// POST /api/factory/stop/:id - Stop a specific agent
router.post('/stop/:id', (req: Request, res: Response) => {
  try {
    const factory = getAgentFactory();
    const agent = factory.stop(req.params.id as string);

    logger.info(`Stopped agent: ${agent.name}`);
    res.json({ status: 'stopped', agent });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Stop failed: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

// POST /api/factory/stop-all - Stop all agents (optionally by template)
router.post('/stop-all', (req: Request, res: Response) => {
  try {
    const { template } = req.body;
    const factory = getAgentFactory();
    const count = factory.stopAll(template);

    logger.info(`Stopped ${count} agents${template ? ` (template: ${template})` : ''}`);
    res.json({ status: 'stopped', count });
  } catch (error) {
    logger.error(`Stop-all failed: ${error}`);
    res.status(500).json({ error: 'Failed to stop agents' });
  }
});

// GET /api/factory/cost/status - Cost router tier availability
router.get('/cost/status', (_req: Request, res: Response) => {
  try {
    const costRouter = getCostRouter();
    const tiers = costRouter.getStatus().map(t => ({
      tier: t.tier,
      rank: t.rank,
      provider: t.provider,
      model: t.model,
      costPer1MInput: t.costPer1MInput,
      costPer1MOutput: t.costPer1MOutput,
      costLabel: t.costLabel,
      available: t.available,
    }));

    res.json({
      tiers,
      availableCount: tiers.filter(t => t.available).length,
      totalTiers: tiers.length,
    });
  } catch (error) {
    logger.error(`Failed to get cost status: ${error}`);
    res.status(500).json({ error: 'Failed to get cost status' });
  }
});

// GET /api/factory/cost/estimate - Estimate cost for a tier
router.get('/cost/estimate', (req: Request, res: Response) => {
  try {
    const tier = req.query.tier as string | undefined;
    const inputTokens = req.query.inputTokens as string | undefined;
    const outputTokens = req.query.outputTokens as string | undefined;

    if (!tier) {
      res.status(400).json({ error: 'tier query parameter is required' });
      return;
    }

    const costRouter = getCostRouter();
    const tierValue = tier as 'free' | 'cheap' | 'medium';
    const cost = costRouter.estimateCost(
      tierValue,
      Number(inputTokens) || 1000,
      Number(outputTokens) || 500
    );

    const routing = costRouter.route(tierValue);

    res.json({
      tier,
      provider: routing.provider,
      model: routing.model,
      inputTokens: Number(inputTokens) || 1000,
      outputTokens: Number(outputTokens) || 500,
      estimatedCostUsd: cost,
      costLabel: routing.costLabel,
      fallbackChain: routing.fallbackChain,
    });
  } catch (error) {
    logger.error(`Failed to estimate cost: ${error}`);
    res.status(500).json({ error: 'Failed to estimate cost' });
  }
});

export default router;
