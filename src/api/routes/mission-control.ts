/**
 * Mission Control API Routes
 * Spawn, monitor, and control Claude agent sessions
 */

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { createLogger } from '../../utils/logger.js';
import { getAgentSessionManager } from '../../mission-control/agent-session.js';
import { getPromptManager } from '../../mission-control/prompt-manager.js';
import { getDatabase } from '../../db/database.js';
import { getAllMachines, deleteMachine, cleanupStaleMachines } from '../../db/queries/machines.js';
import { getAllAgents, getAgentsByMachine } from '../../db/queries/agents.js';

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
      // Use actual session status (may be 'idle' for PTY sessions that accept follow-ups)
      const s = mgr.getSession(evt.sessionId);
      const actualStatus = s ? s.status : 'done';
      ws.broadcastMc({ type: 'mc:status', payload: { sessionId: evt.sessionId, status: actualStatus } });
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
  try {
    await wireEvents();
    const { machineId = 'local', mode = 'sdk', task, cwd, approvalMode = 'auto', model, maxBudget,
            effort, systemPrompt, maxTurns, disallowedTools, allowedTools, additionalDirectories,
            networkPolicy, mcpServers, fallbackModel, enableCheckpointing, loadProjectSettings, autoRestart } = req.body;

    if (!cwd) {
      res.status(400).json({ error: 'cwd is required' });
      return;
    }

    if (mode !== 'sdk' && mode !== 'api' && mode !== 'pty') {
      res.status(400).json({ error: 'mode must be "sdk", "api", or "pty"' });
      return;
    }

    // Remote spawn: if machineId is not 'local', forward to the remote machine
    if (machineId && machineId !== 'local') {
      try {
        const { getWebSocketServer } = await import('../../tunnel/websocket-server.js');
        const ws = getWebSocketServer();
        const sent = ws.sendToMachine(machineId, {
          type: 'command',
          payload: {
            action: 'spawn_agent',
            data: { mode, task, cwd, approvalMode, model, maxBudget, effort, systemPrompt,
                    maxTurns, disallowedTools, allowedTools, additionalDirectories,
                    enableCheckpointing, loadProjectSettings, autoRestart,
                    networkPolicy, mcpServers, fallbackModel },
          },
        });

        if (sent) {
          logger.info(`Remote agent spawn request sent to machine ${machineId}`);
          res.status(202).json({
            message: `Spawn request sent to machine ${machineId}`,
            machineId,
            mode,
          });
        } else {
          res.status(503).json({ error: `Machine ${machineId} is not connected` });
        }
      } catch (err) {
        res.status(503).json({ error: `Failed to reach machine ${machineId}: ${err}` });
      }
      return;
    }

    // Local spawn
    const mgr = getAgentSessionManager();
    const session = mgr.spawn({
      machineId,
      mode,
      task: task || '',
      cwd,
      approvalMode,
      model,
      maxBudgetUsd: maxBudget,
      effort,
      systemPrompt,
      maxTurns,
      disallowedTools,
      allowedTools,
      additionalDirectories,
      networkPolicy,
      mcpServers,
      fallbackModel,
      enableCheckpointing: enableCheckpointing !== false, // default true
      loadProjectSettings: loadProjectSettings !== false, // default true
      autoRestart: autoRestart !== false, // default true
    });

    logger.info(`Agent session spawned via API: ${session.id} (mode: ${mode})`);
    res.status(201).json({
      id: session.id,
      status: session.status,
      message: `Agent session ${session.id} spawned in ${mode} mode`,
    });
  } catch (error) {
    logger.error(`Failed to spawn agent: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to spawn agent: ${error}` });
    }
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
      cwd: s.config.cwd,
      status: s.status,
      approvalMode: s.config.approvalMode,
      model: s.config.model || 'claude-opus-4-6',
      cost: s.cost,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      toolCalls: s.toolCalls,
      createdAt: s.createdAt,
      errorMessage: s.errorMessage,
      restartCount: s.restartCount,
      hasAllowlist: !!(s.config.allowedTools?.length),
      hasNetworkPolicy: !!(s.config.networkPolicy),
    }));
    res.json({ agents });
  } catch (error) {
    logger.error(`Failed to list agents: ${error}`);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * GET /api/mc/agents/fleet
 * All agents across all machines (aggregator + local MC sessions)
 */
router.get('/agents/fleet', (_req: Request, res: Response) => {
  try {
    const mgr = getAgentSessionManager();
    const localSessions = mgr.getAllSessions().map(s => ({
      id: s.id,
      machineId: s.config.machineId || 'local',
      machineName: 'LOCAL',
      mode: s.config.mode,
      task: s.config.task.substring(0, 200),
      cwd: s.config.cwd,
      status: s.status,
      approvalMode: s.config.approvalMode,
      model: s.config.model || 'claude-opus-4-6',
      cost: s.cost,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      toolCalls: s.toolCalls,
      createdAt: s.createdAt,
      errorMessage: s.errorMessage,
      source: 'mission-control',
    }));

    // DB agents from aggregator (remote machines)
    const dbAgents = getAllAgents().map(a => ({
      id: a.id,
      machineId: a.machine_id,
      machineName: a.machine_id,
      mode: a.type,
      task: a.current_task || '',
      cwd: '',
      status: a.status,
      approvalMode: 'unknown',
      model: 'unknown',
      cost: 0,
      tokensIn: a.tokens_used || 0,
      tokensOut: 0,
      toolCalls: 0,
      createdAt: a.started_at ? a.started_at * 1000 : 0,
      errorMessage: null,
      source: 'aggregator',
    }));

    // Merge: prefer MC sessions over DB records for the same agent
    const mcIds = new Set(localSessions.map(s => s.id));
    const remoteAgents = dbAgents.filter(a => !mcIds.has(a.id));

    res.json({ agents: [...localSessions, ...remoteAgents] });
  } catch (error) {
    logger.error(`Failed to get fleet: ${error}`);
    res.status(500).json({ error: 'Failed to get fleet agents' });
  }
});

/**
 * GET /api/mc/machines
 * All connected machines + status
 */
router.get('/machines', (_req: Request, res: Response) => {
  try {
    const dbMachines = getAllMachines();
    const machines = dbMachines.map(m => ({
      id: m.id,
      name: m.name,
      hostname: m.hostname,
      ipAddress: m.ip_address,
      status: m.status,
      lastSeen: m.last_seen,
      capabilities: m.capabilities,
      createdAt: m.created_at,
      agents: getAgentsByMachine(m.id).length,
    }));
    res.json({ machines });
  } catch (error) {
    logger.error(`Failed to get machines: ${error}`);
    res.status(500).json({ error: 'Failed to get machines' });
  }
});

/**
 * GET /api/mc/settings
 * Get global security defaults
 */
router.get('/settings', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.exec(`CREATE TABLE IF NOT EXISTS mc_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    )`);
    const rows = db.prepare('SELECT key, value FROM mc_settings').all() as Array<{ key: string; value: string }>;
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
    }
    res.json({ settings });
  } catch (error) {
    logger.error(`Failed to get settings: ${error}`);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * POST /api/mc/settings
 * Save global security defaults
 */
router.post('/settings', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.exec(`CREATE TABLE IF NOT EXISTS mc_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    )`);
    const entries = req.body;
    if (!entries || typeof entries !== 'object') {
      res.status(400).json({ error: 'Body must be an object of key-value pairs' });
      return;
    }
    const upsert = db.prepare(`INSERT INTO mc_settings (key, value, updated_at) VALUES (?, ?, unixepoch())
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        upsert.run(key, JSON.stringify(value));
      }
    });
    tx();
    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    logger.error(`Failed to save settings: ${error}`);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

/**
 * POST /api/mc/machines/:id/command
 * Send command to specific machine via relay
 */
router.post('/machines/:id/command', async (req: Request, res: Response): Promise<void> => {
  try {
    const { command, data } = req.body;
    const machineId = req.params.id as string;

    if (!command) {
      res.status(400).json({ error: 'command is required' });
      return;
    }

    // Send targeted command to specific machine via WebSocket
    try {
      const { getWebSocketServer } = await import('../../tunnel/websocket-server.js');
      const ws = getWebSocketServer();

      // If wait=true query param, use async send and wait for response
      if (req.query.wait === 'true') {
        try {
          const timeoutMs = parseInt(req.query.timeout as string) || 15000;
          const result = await ws.sendToMachineAsync(machineId, command, data || {}, timeoutMs);
          res.json({ success: true, result });
        } catch (err) {
          res.status(504).json({ error: `${err}` });
        }
        return;
      }

      const sent = ws.sendToMachine(machineId, {
        type: 'command',
        payload: { action: command, data },
      });

      if (sent) {
        res.json({ success: true, message: `Command '${command}' sent to machine ${machineId}` });
      } else {
        // Fallback: broadcast if machine not directly connected
        ws.broadcast({
          type: 'command',
          payload: { targetMachine: machineId, action: command, data },
        });
        res.json({ success: true, message: `Command '${command}' broadcast (machine ${machineId} not directly connected)` });
      }
    } catch {
      res.status(503).json({ error: 'WebSocket server not available' });
    }
  } catch (error) {
    logger.error(`Failed to send command: ${error}`);
    res.status(500).json({ error: 'Failed to send command' });
  }
});

/**
 * GET /api/mc/machines/:id/projects
 * List known git repositories on a machine (from project registry)
 */
router.get('/machines/:id/projects', (_req: Request, res: Response) => {
  try {
    const machineId = _req.params.id as string;
    const db = getDatabase();

    const projects = db.prepare(`
      SELECT id, name, path, machine_name, last_worked_at, session_count
      FROM known_projects
      WHERE machine_name = ?
      ORDER BY last_worked_at DESC NULLS LAST, name ASC
    `).all(machineId);

    res.json({ projects });
  } catch (error) {
    logger.error(`Failed to get projects: ${error}`);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

/**
 * GET /api/mc/machines/:id/files/list?path=...
 * List directory on a remote machine
 */
router.get('/machines/:id/files/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const machineId = req.params.id as string;
    const dirPath = req.query.path as string;

    if (!dirPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }

    // Local machine — use the local file API directly
    if (machineId === 'local' || machineId === localMachineId()) {
      const fs = await import('fs');
      const path = await import('path');
      if (!fs.existsSync(dirPath)) {
        res.status(404).json({ error: 'Directory not found' });
        return;
      }
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries.map(e => {
        try {
          const stat = fs.statSync(path.join(dirPath, e.name));
          return { name: e.name, type: e.isDirectory() ? 'directory' : 'file', size: e.isFile() ? stat.size : undefined, mtime: stat.mtimeMs };
        } catch {
          return { name: e.name, type: e.isDirectory() ? 'directory' : 'file' };
        }
      });
      res.json({ path: dirPath, items, count: items.length });
      return;
    }

    // Remote machine — proxy via WebSocket
    const { getWebSocketServer } = await import('../../tunnel/websocket-server.js');
    const ws = getWebSocketServer();
    const result = await ws.sendToMachineAsync(machineId, 'list_directory', { path: dirPath as string });

    if (result.success) {
      res.json({ path: result.path, items: result.items, count: result.count });
    } else {
      res.status(400).json({ error: result.error || 'Failed to list directory' });
    }
  } catch (error) {
    logger.error(`Remote file list failed: ${error}`);
    res.status(500).json({ error: `${(error as Error).message}` });
  }
});

/**
 * GET /api/mc/machines/:id/files/search?q=...&root=...
 * Search directories on a remote machine
 */
router.get('/machines/:id/files/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const machineId = req.params.id as string;
    const q = req.query.q as string;
    const root = req.query.root as string;
    const maxDepth = parseInt(req.query.maxDepth as string) || 4;
    const maxResults = parseInt(req.query.maxResults as string) || 20;

    if (!q || q.length < 2) {
      res.status(400).json({ error: 'q must be at least 2 characters' });
      return;
    }

    // Local machine — use the local file API directly
    if (machineId === 'local' || machineId === localMachineId()) {
      const fs = await import('fs');
      const path = await import('path');
      const searchRoot = root || 'C:\\Users';
      if (!fs.existsSync(searchRoot)) {
        res.status(404).json({ error: 'Root directory not found' });
        return;
      }
      const results: { name: string; path: string; depth: number }[] = [];
      const queue: { dir: string; depth: number }[] = [{ dir: searchRoot, depth: 0 }];
      while (queue.length > 0 && results.length < maxResults) {
        const { dir, depth } = queue.shift()!;
        if (depth > maxDepth) continue;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$Recycle.Bin' || entry.name === 'AppData') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.name.toLowerCase().includes(q.toLowerCase())) {
              results.push({ name: entry.name, path: fullPath, depth });
              if (results.length >= maxResults) break;
            }
            if (depth < maxDepth) queue.push({ dir: fullPath, depth: depth + 1 });
          }
        } catch { /* skip */ }
      }
      res.json({ query: q, root: searchRoot, results, count: results.length });
      return;
    }

    // Remote machine — proxy via WebSocket
    const { getWebSocketServer } = await import('../../tunnel/websocket-server.js');
    const ws = getWebSocketServer();
    const result = await ws.sendToMachineAsync(machineId, 'search_directory', { q: q as string, root: root as string, maxDepth, maxResults }, 15000);

    if (result.success) {
      res.json({ query: result.query, root: result.root, results: result.results, count: result.count });
    } else {
      res.status(400).json({ error: result.error || 'Failed to search directories' });
    }
  } catch (error) {
    logger.error(`Remote file search failed: ${error}`);
    res.status(500).json({ error: `${(error as Error).message}` });
  }
});

// Helper: get local machine ID for comparison
function localMachineId(): string {
  try {
    const { getMachineByHostname } = require('../../db/queries/machines.js');
    const os = require('os');
    const machine = getMachineByHostname(os.hostname());
    return machine?.id || '';
  } catch { return ''; }
}

/**
 * POST /api/mc/machines/:id/env
 * Push environment variables to a remote machine's .env file
 */
router.post('/machines/:id/env', async (req: Request, res: Response): Promise<void> => {
  try {
    const machineId = req.params.id as string;
    const { vars } = req.body;

    if (!vars || typeof vars !== 'object' || Object.keys(vars).length === 0) {
      res.status(400).json({ error: 'vars object is required' });
      return;
    }

    const { getWebSocketServer } = await import('../../tunnel/websocket-server.js');
    const ws = getWebSocketServer();
    const result = await ws.sendToMachineAsync(machineId, 'set_env', { vars });

    if (result.success) {
      res.json({ success: true, keys: result.keys, path: result.path });
    } else {
      res.status(400).json({ error: result.error || 'Failed to set env vars' });
    }
  } catch (error) {
    logger.error(`Set env failed: ${error}`);
    res.status(500).json({ error: `${(error as Error).message}` });
  }
});

/**
 * GET /api/mc/agents/:id
 * Get agent details + output buffer
 * For remote agents, requests buffer from the spoke machine
 */
router.get('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const mgr = getAgentSessionManager();
    const session = mgr.getSession(req.params.id as string);

    if (session) {
      // Local agent — return directly
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
      return;
    }

    // Not local — check if it's a remote agent in the DB
    const agentId = req.params.id as string;
    const machineId = req.query.machineId as string;

    if (machineId) {
      // Request buffer from remote spoke
      try {
        const { getWebSocketServer } = await import('../../tunnel/websocket-server.js');
        const ws = getWebSocketServer();
        ws.sendToMachine(machineId, {
          type: 'command',
          payload: { action: 'get_buffer', data: { agentId } },
        });
        // Buffer will arrive async via agent:buffer → mc:output WebSocket
        res.json({
          agent: { id: agentId, machineId, status: 'remote', source: 'aggregator' },
          buffer: '',
          bufferRequested: true,
          message: 'Buffer requested from remote machine — output will stream via WebSocket',
        });
      } catch {
        res.status(503).json({ error: 'WebSocket server not available' });
      }
      return;
    }

    // Try to find in DB (aggregator data)
    try {
      const dbAgents = getAllAgents();
      const dbAgent = dbAgents.find(a => a.id === agentId);
      if (dbAgent) {
        res.json({
          agent: {
            id: dbAgent.id,
            machineId: dbAgent.machine_id,
            status: dbAgent.status,
            type: dbAgent.type,
            current_task: dbAgent.current_task,
            source: 'aggregator',
          },
          buffer: '',
          message: 'Remote agent — add ?machineId=X to request output buffer',
        });
        return;
      }
    } catch { /* ignore */ }

    res.status(404).json({ error: 'Agent session not found' });
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

    if (!['manual', 'auto', 'yolo', 'plan'].includes(mode)) {
      res.status(400).json({ error: 'mode must be "manual", "auto", "yolo", or "plan"' });
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
 * GET /api/mc/health
 * Health check — aggregate stats for all agents
 */
router.get('/health', (_req: Request, res: Response) => {
  try {
    const mgr = getAgentSessionManager();
    const health = mgr.getHealth();
    res.json(health);
  } catch (error) {
    logger.error(`Health check failed: ${error}`);
    res.status(500).json({ error: 'Health check failed' });
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

/**
 * GET /api/mc/templates
 * List saved mission templates
 */
router.get('/templates', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    // Ensure table exists
    db.exec(`CREATE TABLE IF NOT EXISTS mc_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      config TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    )`);
    const rows = db.prepare(`SELECT id, name, description, config, created_at as createdAt FROM mc_templates ORDER BY created_at DESC`).all() as Array<{
      id: string; name: string; description: string; config: string; createdAt: number;
    }>;
    const templates = rows.map(r => ({ ...r, config: JSON.parse(r.config) }));
    res.json({ templates });
  } catch (error) {
    logger.error(`Failed to list templates: ${error}`);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * POST /api/mc/templates
 * Save a mission template
 */
router.post('/templates', (req: Request, res: Response) => {
  try {
    const { name, description, config } = req.body;
    if (!name || !config) {
      res.status(400).json({ error: 'name and config are required' });
      return;
    }
    const db = getDatabase();
    db.exec(`CREATE TABLE IF NOT EXISTS mc_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      config TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    )`);
    const id = nanoid();
    db.prepare(`INSERT INTO mc_templates (id, name, description, config) VALUES (?, ?, ?, ?)`)
      .run(id, name, description || '', JSON.stringify(config));
    res.status(201).json({ id, name, message: 'Template saved' });
  } catch (error) {
    logger.error(`Failed to save template: ${error}`);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

/**
 * DELETE /api/mc/templates/:id
 * Delete a mission template
 */
router.delete('/templates/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare(`DELETE FROM mc_templates WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete template: ${error}`);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ───── Machine Cleanup ─────

/** DELETE /machines/:id — Remove a specific machine from the registry */
router.delete('/machines/:id', (req: Request, res: Response) => {
  try {
    const machineId = String(req.params.id);
    deleteMachine(machineId);
    logger.info(`Machine ${machineId} deleted from registry`);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete machine: ${error}`);
    res.status(500).json({ error: 'Failed to delete machine' });
  }
});

/** POST /machines/cleanup — Remove machines offline for more than N days (default 7) */
router.post('/machines/cleanup', (req: Request, res: Response) => {
  try {
    const days = req.body.days || 7;
    const deleted = cleanupStaleMachines(days);
    logger.info(`Stale machine cleanup: removed ${deleted} machines offline > ${days} days`);
    res.json({ success: true, deleted, days });
  } catch (error) {
    logger.error(`Failed to cleanup machines: ${error}`);
    res.status(500).json({ error: 'Failed to cleanup machines' });
  }
});

// ───── Session Resumption ─────

/** POST /agents/:id/resume — Resume a previous agent session from database */
router.post('/agents/:id/resume', (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id);
    const task = req.body.task || req.body.message;

    if (!task) {
      res.status(400).json({ error: 'task or message is required in request body' });
      return;
    }

    const mgr = getAgentSessionManager();
    const session = mgr.resumeSession(sessionId, task);

    if (!session) {
      res.status(404).json({ error: 'Session not found or cannot be resumed (no claude_session_id)' });
      return;
    }

    res.json({
      success: true,
      sessionId: session.id,
      status: session.status,
      claudeSessionId: session.claudeSessionId,
    });
  } catch (error) {
    logger.error(`Failed to resume session: ${error}`);
    res.status(500).json({ error: 'Failed to resume session' });
  }
});

export default router;
