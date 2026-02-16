/**
 * Browser Agent API Routes
 * Spawn browser agents with Playwright MCP pre-configured
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';
import { spawnBrowserAgent } from '../../browser-agent/browser-session.js';
import { getAgentSessionManager } from '../../mission-control/agent-session.js';

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

export default router;
