import { Router, Request, Response } from 'express';
import {
  getAllAgents,
  getAgentById,
  getAgentsByMachine,
  getAgentsByStatus,
  createAgent,
  updateAgentStatus,
  deleteAgent,
  getAgentStats,
  AgentInput,
  Agent,
} from '../../db/queries/agents.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('AgentsAPI');

// GET /api/agents - List all agents
router.get('/', (req: Request, res: Response) => {
  try {
    const { machine, status } = req.query;

    let agents: Agent[];

    if (machine && typeof machine === 'string') {
      agents = getAgentsByMachine(machine);
    } else if (status && typeof status === 'string') {
      agents = getAgentsByStatus(status as Agent['status']);
    } else {
      agents = getAllAgents();
    }

    res.json(agents);
  } catch (error) {
    logger.error(`Failed to get agents: ${error}`);
    res.status(500).json({ error: 'Failed to get agents' });
  }
});

// GET /api/agents/stats - Get agent statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getAgentStats();
    res.json(stats);
  } catch (error) {
    logger.error(`Failed to get agent stats: ${error}`);
    res.status(500).json({ error: 'Failed to get agent stats' });
  }
});

// GET /api/agents/:id - Get agent by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const agent = getAgentById(req.params.id as string);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (error) {
    logger.error(`Failed to get agent: ${error}`);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// POST /api/agents - Create a new agent
router.post('/', (req: Request, res: Response) => {
  try {
    const { machine_id, name, type, metadata } = req.body as AgentInput;

    if (!machine_id || !name || !type) {
      res.status(400).json({ error: 'machine_id, name, and type are required' });
      return;
    }

    const agent = createAgent({ machine_id, name, type, metadata });
    logger.info(`Agent created: ${agent.name} (${agent.id})`);

    // Notify via WebSocket
    try {
      const { getWebSocketServer } = require('../../tunnel/websocket-server.js');
      const ws = getWebSocketServer();
      ws.sendAgentUpdate(agent.id, {
        status: agent.status,
        name: agent.name,
        type: agent.type,
        machine_id: agent.machine_id,
      });
    } catch {
      // WebSocket not available
    }

    res.status(201).json(agent);
  } catch (error) {
    logger.error(`Failed to create agent: ${error}`);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// PATCH /api/agents/:id - Update agent
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const agent = getAgentById(req.params.id as string);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const { status, progress, current_task, last_output, context_used, tokens_used } = req.body;

    if (status) {
      updateAgentStatus(agent.id, status, {
        progress,
        current_task,
        last_output,
        context_used,
        tokens_used,
      });
    }

    const updated = getAgentById(agent.id as string);

    // Notify via WebSocket
    try {
      const { getWebSocketServer } = require('../../tunnel/websocket-server.js');
      const ws = getWebSocketServer();
      ws.sendAgentUpdate(agent.id, {
        status: updated?.status,
        progress: updated?.progress,
        current_task: updated?.current_task,
        last_output: updated?.last_output?.substring(0, 200), // Truncate for WS
      });
    } catch {
      // WebSocket not available
    }

    res.json(updated);
  } catch (error) {
    logger.error(`Failed to update agent: ${error}`);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// POST /api/agents/:id/task - Assign task to agent
router.post('/:id/task', (req: Request, res: Response) => {
  try {
    const agent = getAgentById(req.params.id as string);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const { task } = req.body;
    if (!task) {
      res.status(400).json({ error: 'Task is required' });
      return;
    }

    updateAgentStatus(agent.id, 'working', {
      current_task: task,
      progress: 0,
    });

    const updated = getAgentById(agent.id as string);
    logger.info(`Task assigned to agent ${agent.name}: ${task}`);

    res.json(updated);
  } catch (error) {
    logger.error(`Failed to assign task: ${error}`);
    res.status(500).json({ error: 'Failed to assign task' });
  }
});

// DELETE /api/agents/:id - Delete agent
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const agent = getAgentById(req.params.id as string);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    deleteAgent(agent.id);
    logger.info(`Agent deleted: ${agent.name} (${agent.id})`);
    res.json({ status: 'deleted' });
  } catch (error) {
    logger.error(`Failed to delete agent: ${error}`);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export default router;
