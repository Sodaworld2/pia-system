/**
 * AI API Routes
 * Endpoints for AI operations, cost tracking, and provider status
 *
 * Providers: Ollama (FREE) → Claude Haiku (CHEAP) → Claude Sonnet (MEDIUM)
 */

import { Router, Request, Response } from 'express';
import { getAIRouter } from '../../ai/ai-router.js';
import { getMultiModelPanel } from '../../ai/multi-model-panel.js';
import { getCostTracker } from '../../ai/cost-tracker.js';
import { getOllamaClient } from '../../ai/ollama-client.js';
import { getClaudeClient } from '../../ai/claude-client.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AI-API');
const router = Router();

/**
 * GET /api/ai/status
 * Get status of all AI providers
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const aiRouter = getAIRouter();
    const costTracker = getCostTracker();
    const claude = getClaudeClient();
    const ollama = getOllamaClient();

    const availability = await aiRouter.checkAvailability();
    const providerStatus = costTracker.getProviderStatus();

    // Update database with current availability
    const ollamaAvailable = availability.get('ollama') || false;
    const claudeAvailable = availability.get('claude') || false;

    costTracker.updateProviderStatus('ollama', ollamaAvailable, ollamaAvailable);
    costTracker.updateProviderStatus('claude', claude.isConfigured(), claudeAvailable);

    res.json({
      providers: providerStatus,
      availability: Object.fromEntries(availability),
      claude: {
        configured: claude.isConfigured(),
        models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
      },
      ollama: {
        available: ollamaAvailable,
        defaultModel: ollama.getDefaultModel(),
      },
      recommendations: {
        code: aiRouter.getRecommendation('code'),
        review: aiRouter.getRecommendation('review'),
        security: aiRouter.getRecommendation('security'),
        analysis: aiRouter.getRecommendation('analysis'),
      },
    });
  } catch (error) {
    logger.error(`Failed to get AI status: ${error}`);
    res.status(500).json({ error: 'Failed to get AI status' });
  }
});

/**
 * GET /api/ai/costs
 * Get cost summary
 */
router.get('/costs', (_req: Request, res: Response) => {
  try {
    const costTracker = getCostTracker();
    const summary = costTracker.getCostSummary();
    res.json(summary);
  } catch (error) {
    logger.error(`Failed to get costs: ${error}`);
    res.status(500).json({ error: 'Failed to get cost summary' });
  }
});

/**
 * GET /api/ai/costs/daily
 * Get daily cost breakdown
 */
router.get('/costs/daily', (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const costTracker = getCostTracker();
    const dailyCosts = costTracker.getDailyCosts(days);
    res.json(dailyCosts);
  } catch (error) {
    logger.error(`Failed to get daily costs: ${error}`);
    res.status(500).json({ error: 'Failed to get daily costs' });
  }
});

/**
 * GET /api/ai/usage
 * Get recent usage records
 */
router.get('/usage', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const costTracker = getCostTracker();
    const usage = costTracker.getRecentUsage(limit);
    res.json(usage);
  } catch (error) {
    logger.error(`Failed to get usage: ${error}`);
    res.status(500).json({ error: 'Failed to get usage records' });
  }
});

/**
 * POST /api/ai/budget
 * Update budget limits
 */
router.post('/budget', (req: Request, res: Response): void => {
  try {
    const { dailyLimit, monthlyLimit } = req.body;

    if (typeof dailyLimit !== 'number' || typeof monthlyLimit !== 'number') {
      res.status(400).json({ error: 'dailyLimit and monthlyLimit must be numbers' });
      return;
    }

    const costTracker = getCostTracker();
    costTracker.setBudgetLimits(dailyLimit, monthlyLimit);

    res.json({ success: true, dailyLimit, monthlyLimit });
  } catch (error) {
    logger.error(`Failed to update budget: ${error}`);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

/**
 * POST /api/ai/generate
 * Generate text using cost-optimized routing
 */
router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt, taskType = 'code', complexity, preferLocal } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    // Check budget
    const costTracker = getCostTracker();
    const budgetCheck = costTracker.checkBudget();
    if (!budgetCheck.allowed) {
      res.status(429).json({ error: budgetCheck.reason });
      return;
    }

    const aiRouter = getAIRouter();

    const response = await aiRouter.execute({
      prompt,
      taskType,
      complexity,
      preferLocal,
    });

    // Record usage
    costTracker.recordUsage({
      provider: response.provider,
      model: response.model,
      taskType,
      inputTokens: Math.floor(prompt.length / 4),
      outputTokens: Math.floor(response.content.length / 4),
      totalTokens: response.tokens || Math.floor((prompt.length + response.content.length) / 4),
      costUsd: response.cost,
      durationMs: response.duration,
      success: true,
    });

    res.json(response);
  } catch (error) {
    logger.error(`Failed to generate: ${error}`);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

/**
 * POST /api/ai/review
 * Multi-model code review (Ollama + Claude Haiku + Claude Sonnet)
 */
router.post('/review', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, context, security = false } = req.body;

    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    // Check budget
    const costTracker = getCostTracker();
    const budgetCheck = costTracker.checkBudget();
    if (!budgetCheck.allowed) {
      res.status(429).json({ error: budgetCheck.reason });
      return;
    }

    const panel = getMultiModelPanel();
    const availableModels = panel.getAvailableModels();

    if (availableModels.length === 0) {
      res.status(503).json({ error: 'No AI models available for review' });
      return;
    }

    const result = security
      ? await panel.securityReview(code, context)
      : await panel.reviewCode(code, context);

    // Record usage for each model that participated
    for (const review of result.reviews) {
      if (!review.error) {
        costTracker.recordUsage({
          provider: review.provider,
          model: review.model,
          taskType: security ? 'security' : 'review',
          inputTokens: Math.floor(code.length / 4),
          outputTokens: Math.floor(review.rawOutput.length / 4),
          totalTokens: Math.floor((code.length + review.rawOutput.length) / 4),
          costUsd: result.totalCost / result.reviews.length,
          durationMs: review.duration,
          success: true,
        });
      }
    }

    // Generate report
    const report = panel.generateReport(result);

    res.json({
      ...result,
      report,
      availableModels,
    });
  } catch (error) {
    logger.error(`Failed to review: ${error}`);
    res.status(500).json({ error: 'Failed to perform code review' });
  }
});

/**
 * POST /api/ai/classify
 * Classify task complexity
 */
router.post('/classify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    const aiRouter = getAIRouter();
    const complexity = await aiRouter.classifyTask(prompt);
    const recommendation = aiRouter.getRecommendation('code');

    res.json({
      complexity,
      recommendation,
    });
  } catch (error) {
    logger.error(`Failed to classify: ${error}`);
    res.status(500).json({ error: 'Failed to classify task' });
  }
});

/**
 * GET /api/ai/ollama/models
 * List available Ollama models
 */
router.get('/ollama/models', async (_req: Request, res: Response): Promise<void> => {
  try {
    const ollama = getOllamaClient();
    const available = await ollama.isAvailable();

    if (!available) {
      res.status(503).json({ error: 'Ollama not available' });
      return;
    }

    const models = await ollama.listModels();
    res.json(models);
  } catch (error) {
    logger.error(`Failed to list Ollama models: ${error}`);
    res.status(500).json({ error: 'Failed to list Ollama models' });
  }
});

/**
 * POST /api/ai/ollama/pull
 * Pull an Ollama model
 */
router.post('/ollama/pull', async (req: Request, res: Response): Promise<void> => {
  try {
    const { model } = req.body;

    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    const ollama = getOllamaClient();
    const available = await ollama.isAvailable();

    if (!available) {
      res.status(503).json({ error: 'Ollama not available' });
      return;
    }

    await ollama.pullModel(model);
    res.json({ success: true, model });
  } catch (error) {
    logger.error(`Failed to pull model: ${error}`);
    res.status(500).json({ error: 'Failed to pull model' });
  }
});

/**
 * GET /api/ai/claude/status
 * Check Claude API status
 */
router.get('/claude/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const claude = getClaudeClient();

    res.json({
      configured: claude.isConfigured(),
      models: [
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', tier: 'cheap' },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.5', tier: 'medium' },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'premium' },
      ],
      envVars: {
        PIA_CLAUDE_API_KEY: !!process.env.PIA_CLAUDE_API_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        CLAUDE_API_KEY: !!process.env.CLAUDE_API_KEY,
      },
    });
  } catch (error) {
    logger.error(`Failed to get Claude status: ${error}`);
    res.status(500).json({ error: 'Failed to get Claude status' });
  }
});

export default router;
