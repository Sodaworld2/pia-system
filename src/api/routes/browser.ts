/**
 * Browser Agent API Routes
 * - Claude-powered browser agents (Playwright MCP)
 * - Gemini-powered browser controller (direct Playwright)
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';
import { spawnBrowserAgent } from '../../browser-agent/browser-session.js';
import { getAgentSessionManager } from '../../mission-control/agent-session.js';
import { getBrowserController } from '../../browser-controller/controller.js';
import type { BrowserCommand } from '../../browser-controller/types.js';

const router = Router();
const logger = createLogger('BrowserAPI');

/**
 * POST /api/browser/navigate
 * Quick-spawn a browser agent to navigate to a URL
 */
router.post('/navigate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, approvalMode, model } = req.body;

    if (!url) {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    const sessionId = spawnBrowserAgent({ url, approvalMode, model });
    logger.info(`Browser navigate: ${url} → session ${sessionId}`);

    res.status(201).json({
      id: sessionId,
      message: `Browser agent navigating to ${url}`,
    });
  } catch (error) {
    logger.error(`Failed to spawn browser agent: ${error}`);
    res.status(500).json({ error: 'Failed to spawn browser agent' });
  }
});

/**
 * POST /api/browser/task
 * Spawn a browser agent with a custom task
 */
router.post('/task', async (req: Request, res: Response): Promise<void> => {
  try {
    const { task, url, cwd, approvalMode, model, maxBudget } = req.body;

    if (!task && !url) {
      res.status(400).json({ error: 'task or url is required' });
      return;
    }

    const sessionId = spawnBrowserAgent({
      task,
      url,
      cwd,
      approvalMode,
      model,
      maxBudgetUsd: maxBudget,
    });

    res.status(201).json({
      id: sessionId,
      message: 'Browser agent spawned',
    });
  } catch (error) {
    logger.error(`Failed to spawn browser task: ${error}`);
    res.status(500).json({ error: 'Failed to spawn browser agent' });
  }
});

/**
 * GET /api/browser/sessions
 * List all browser agent sessions (filtered by the browser system prompt)
 */
router.get('/sessions', (_req: Request, res: Response) => {
  try {
    const mgr = getAgentSessionManager();
    const all = mgr.getAllSessions();
    const browserSessions = all
      .filter(s => s.config.mcpServers?.some(m => m.name === 'playwright'))
      .map(s => ({
        id: s.id,
        status: s.status,
        task: s.config.task.substring(0, 200),
        cost: s.cost,
        createdAt: s.createdAt,
      }));

    res.json({ sessions: browserSessions });
  } catch (error) {
    logger.error(`Failed to list browser sessions: ${error}`);
    res.status(500).json({ error: 'Failed to list browser sessions' });
  }
});

// ══════════════════════════════════════════════════════════════
// Gemini Browser Controller — direct Playwright + Gemini vision
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/browser/controller/start
 * Launch the Gemini browser controller
 */
router.post('/controller/start', async (_req: Request, res: Response): Promise<void> => {
  try {
    const controller = getBrowserController();
    const state = controller.getState();

    if (state.status !== 'stopped') {
      res.status(409).json({ error: 'Browser controller already running', state });
      return;
    }

    await controller.start();
    logger.info('Browser controller started via API');
    res.status(201).json({ message: 'Browser controller started', state: controller.getState() });
  } catch (error) {
    logger.error(`Failed to start browser controller: ${error}`);
    res.status(500).json({ error: `Failed to start: ${(error as Error).message}` });
  }
});

/**
 * POST /api/browser/controller/command
 * Execute a browser command (navigate, click, fill, screenshot, extractText, executeTask, etc.)
 */
router.post('/controller/command', async (req: Request, res: Response): Promise<void> => {
  try {
    const controller = getBrowserController();
    const state = controller.getState();

    if (state.status === 'stopped') {
      res.status(503).json({ error: 'Browser controller not running. POST /controller/start first.' });
      return;
    }

    if (state.status === 'busy') {
      res.status(429).json({ error: 'Browser controller is busy. Wait for current command to complete.' });
      return;
    }

    const command: BrowserCommand = req.body;
    if (!command.type) {
      res.status(400).json({ error: 'command.type is required' });
      return;
    }

    const result = await controller.execute(command);
    res.json(result);
  } catch (error) {
    logger.error(`Controller command failed: ${error}`);
    res.status(500).json({ error: `Command failed: ${(error as Error).message}` });
  }
});

/**
 * GET /api/browser/controller/status
 * Get controller state + last screenshot as data URL
 */
router.get('/controller/status', (_req: Request, res: Response) => {
  try {
    const controller = getBrowserController();
    const state = controller.getState();

    const response: Record<string, unknown> = { ...state };
    if (state.lastScreenshot) {
      response.screenshotDataUrl = `data:image/png;base64,${state.lastScreenshot}`;
      delete response.lastScreenshot; // Don't double-send the raw base64
    }

    res.json(response);
  } catch (error) {
    logger.error(`Failed to get controller status: ${error}`);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * POST /api/browser/controller/stop
 * Stop the browser controller
 */
router.post('/controller/stop', async (_req: Request, res: Response): Promise<void> => {
  try {
    const controller = getBrowserController();
    await controller.stop();
    logger.info('Browser controller stopped via API');
    res.json({ message: 'Browser controller stopped' });
  } catch (error) {
    logger.error(`Failed to stop browser controller: ${error}`);
    res.status(500).json({ error: `Failed to stop: ${(error as Error).message}` });
  }
});

export default router;
