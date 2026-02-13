/**
 * Mission Control API Routes
 * Spawn, monitor, and control Claude agent sessions
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';
import { getAgentSessionManager } from '../../mission-control/agent-session.js';
import { getPromptManager } from '../../mission-control/prompt-manager.js';

const router = Router();
const logger = createLogger('MissionControlAPI');

/**
 * Wire AgentSessionManager + PromptManager events to WebSocket broadcasts.
 * Called lazily on first request to avoid circular init issues.
 */
let eventsWired = false;
async function wireEvents(): Promise<void> {
  if (eventsWired) return;
  eventsWired = true;

  try {
    const { getWebSocketServer } = await import('../../tunnel/websocket-server.js');
    const ws = getWebSocketServer();
    const mgr = getAgentSessionManager();
    const pm = getPromptManager();

    mgr.on('output', (evt: { sessionId: string; data: string }) => {
      ws.broadcastMc({ type: 'mc:output', payload: { sessionId: evt.sessionId, data: evt.data } });
    });

    mgr.on('status', (evt: { sessionId: string; status: string }) => {
      ws.broadcastMc({ type: 'mc:status', payload: evt });
    });

    mgr.on('complete', (evt: { sessionId: string }) => {
      ws.broadcastMc({ type: 'mc:status', payload: { sessionId: evt.sessionId, status: 'done' } });
    });

    mgr.on('error', (evt: { sessionId: string; error: string }) => {
      ws.broadcastMc({ type: 'mc:status', payload: { sessionId: evt.sessionId, status: 'error', error: evt.error } });
    });

    pm.on('new_prompt', (prompt: { id: string; agentId: string; question: string; options: string[]; type: string }) => {
      ws.broadcastMc({ type: 'mc:prompt', payload: prompt });
    });

    logger.info('Mission Control events wired to WebSocket');
  } catch (err) {
    logger.warn(`Could not wire MC events to WebSocket (may not be initialized yet): ${err}`);
  }
}

/**
 * POST /api/mc/agents
 * Spawn a new agent session
 */
router.post('/agents', async (req: Request, res: Response): Promise<void> => {
  wireEvents();
  try {
    const { machineId = 'local', mode = 'api', task, cwd, approvalMode = 'manual', model, maxBudget } = req.body;

    if (!task) {
      res.status(400).json({ error: 'task is required' });
      return;
    }

    if (!cwd) {
      res.status(400).json({ error: 'cwd is required' });
      return;
    }

    if (mode !== 'api' && mode !== 'pty') {
      res.status(400).json({ error: 'mode must be "api" or "pty"' });
      return;
    }

    const mgr = getAgentSessionManager();
    const session = mgr.spawn({
      machineId,
      mode,
      task,
      cwd,
      approvalMode,
      model,
      maxBudgetUsd: maxBudget,
    });

    logger.info(`Agent session spawned via API: ${session.id} (mode: ${mode})`);
    res.status(201).json({
      id: session.id,
      status: session.status,
      message: `Agent session ${session.id} spawned in ${mode} mode`,
    });
  } catch (error) {
    logger.error(`Failed to spawn agent: ${error}`);
    res.status(500).json({ error: 'Failed to spawn agent session' });
  }
});

/**
 * GET /api/mc/agents
 * List all active agent sessions
 */
router.get('/agents', (_req: Request, res: Response) => {
  try {
    const mgr = getAgentSessionManager();
    const agents = mgr.getAllSessions().map(s => ({
      id: s.id,
      mode: s.config.mode,
      task: s.config.task.substring(0, 200),
      status: s.status,
      approvalMode: s.config.approvalMode,
      cost: s.cost,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      toolCalls: s.toolCalls,
      createdAt: s.createdAt,
      errorMessage: s.errorMessage,
    }));
    res.json({ agents });
  } catch (error) {
    logger.error(`Failed to list agents: ${error}`);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * GET /api/mc/agents/:id
 * Get agent details + output buffer
 */
router.get('/agents/:id', (req: Request, res: Response) => {
  try {
    const mgr = getAgentSessionManager();
    const session = mgr.getSession(req.params.id as string);

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    res.json({
      agent: {
        id: session.id,
        config: session.config,
        status: session.status,
        cost: session.cost,
        tokensIn: session.tokensIn,
        tokensOut: session.tokensOut,
        toolCalls: session.toolCalls,
        createdAt: session.createdAt,
        errorMessage: session.errorMessage,
      },
      buffer: session.outputBuffer.substring(session.outputBuffer.length - 50000), // last 50KB
    });
  } catch (error) {
    logger.error(`Failed to get agent: ${error}`);
    res.status(500).json({ error: 'Failed to get agent details' });
  }
});

/**
 * POST /api/mc/agents/:id/respond
 * Respond to an agent's prompt
 */
router.post('/agents/:id/respond', (req: Request, res: Response) => {
  try {
    const { promptId, choice } = req.body;
    const agentId = req.params.id as string;

    if (choice === undefined) {
      res.status(400).json({ error: 'choice is required' });
      return;
    }

    const pm = getPromptManager();

    if (promptId) {
      // Respond to specific prompt
      pm.respond(promptId, choice);
    } else {
      // Send raw response to agent session (PTY mode)
      const mgr = getAgentSessionManager();
      mgr.respond(agentId, choice);
    }

    res.json({ success: true, message: `Response sent to agent ${agentId}` });
  } catch (error) {
    logger.error(`Failed to respond to agent: ${error}`);
    res.status(500).json({ error: 'Failed to send response' });
  }
});

/**
 * POST /api/mc/agents/:id/mode
 * Toggle manual/auto approval mode
 */
router.post('/agents/:id/mode', (req: Request, res: Response) => {
  try {
    const { mode } = req.body;

    if (mode !== 'manual' && mode !== 'auto') {
      res.status(400).json({ error: 'mode must be "manual" or "auto"' });
      return;
    }

    const mgr = getAgentSessionManager();
    mgr.setMode(req.params.id as string, mode);

    res.json({ success: true, mode });
  } catch (error) {
    logger.error(`Failed to set mode: ${error}`);
    res.status(500).json({ error: 'Failed to set approval mode' });
  }
});

/**
 * GET /api/mc/agents/:id/journal
 * Get activity journal for an agent
 */
router.get('/agents/:id/journal', (req: Request, res: Response) => {
  try {
    const mgr = getAgentSessionManager();
    const journal = mgr.getJournal(req.params.id as string);
    res.json({ journal });
  } catch (error) {
    logger.error(`Failed to get journal: ${error}`);
    res.status(500).json({ error: 'Failed to get journal' });
  }
});

/**
 * DELETE /api/mc/agents/:id
 * Kill an agent session
 */
router.delete('/agents/:id', (req: Request, res: Response) => {
  try {
    const mgr = getAgentSessionManager();
    const session = mgr.getSession(req.params.id as string);

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    mgr.kill(req.params.id as string);
    res.json({ success: true, message: `Agent ${req.params.id as string} killed` });
  } catch (error) {
    logger.error(`Failed to kill agent: ${error}`);
    res.status(500).json({ error: 'Failed to kill agent' });
  }
});

/**
 * GET /api/mc/prompts
 * Get all pending prompts across all agents
 */
router.get('/prompts', (_req: Request, res: Response) => {
  try {
    const pm = getPromptManager();
    const prompts = pm.getPending();
    res.json({ prompts });
  } catch (error) {
    logger.error(`Failed to get prompts: ${error}`);
    res.status(500).json({ error: 'Failed to get prompts' });
  }
});

export default router;
