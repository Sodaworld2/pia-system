/**
 * Task Queue API Routes
 *
 * POST   /api/tasks              - Enqueue new task
 * GET    /api/tasks              - List tasks (query: ?status=&agent=)
 * GET    /api/tasks/stats        - Queue statistics
 * GET    /api/tasks/queue/next   - Dequeue next task
 * GET    /api/tasks/:id          - Get specific task
 * POST   /api/tasks/:id/assign   - Assign to agent
 * POST   /api/tasks/:id/complete - Mark complete
 * POST   /api/tasks/:id/fail     - Mark failed
 */

import { Router, Request, Response } from 'express';
import { getTaskQueue } from '../../orchestrator/task-queue.js';
import { getExecutionEngine } from '../../orchestrator/execution-engine.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('TasksAPI');

// POST /api/tasks - Enqueue a new task
router.post('/', (req: Request, res: Response) => {
  try {
    const { title, description, priority, assignedAgent, dependsOn } = req.body;

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const queue = getTaskQueue();
    const task = queue.enqueue({ title, description, priority, assignedAgent, dependsOn });

    logger.info(`Task enqueued: ${task.title}`);
    res.status(201).json(task);
  } catch (error) {
    logger.error(`Failed to enqueue task: ${error}`);
    res.status(500).json({ error: 'Failed to enqueue task' });
  }
});

// GET /api/tasks/stats - Queue statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const queue = getTaskQueue();
    res.json(queue.getStats());
  } catch (error) {
    logger.error(`Failed to get stats: ${error}`);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/tasks/queue/next - Dequeue next available task
router.get('/queue/next', (req: Request, res: Response) => {
  try {
    const agent = req.query.agent as string | undefined;
    const queue = getTaskQueue();
    const task = queue.dequeue(agent);

    if (!task) {
      res.json({ task: null, message: 'No tasks available' });
      return;
    }

    res.json(task);
  } catch (error) {
    logger.error(`Failed to dequeue: ${error}`);
    res.status(500).json({ error: 'Failed to dequeue task' });
  }
});

// GET /api/tasks - List all tasks
router.get('/', (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const agent = req.query.agent as string | undefined;
    const queue = getTaskQueue();

    let tasks;
    if (agent) {
      tasks = queue.getByAgent(agent);
    } else {
      tasks = queue.getAll(status);
    }

    res.json(tasks);
  } catch (error) {
    logger.error(`Failed to list tasks: ${error}`);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

// GET /api/tasks/:id - Get a specific task
router.get('/:id', (req: Request, res: Response) => {
  try {
    const queue = getTaskQueue();
    const task = queue.getById(req.params.id as string);

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(task);
  } catch (error) {
    logger.error(`Failed to get task: ${error}`);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

// POST /api/tasks/:id/assign - Assign task to agent
router.post('/:id/assign', (req: Request, res: Response) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      res.status(400).json({ error: 'agentId is required' });
      return;
    }

    const queue = getTaskQueue();
    const task = queue.assign(req.params.id as string, agentId);
    res.json(task);
  } catch (error) {
    logger.error(`Failed to assign task: ${error}`);
    res.status(500).json({ error: 'Failed to assign task' });
  }
});

// POST /api/tasks/:id/complete - Mark task complete
router.post('/:id/complete', (req: Request, res: Response) => {
  try {
    const { output } = req.body;
    const queue = getTaskQueue();
    const task = queue.complete(req.params.id as string, output);
    res.json(task);
  } catch (error) {
    logger.error(`Failed to complete task: ${error}`);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// POST /api/tasks/:id/fail - Mark task failed
router.post('/:id/fail', (req: Request, res: Response) => {
  try {
    const { error: errorMsg } = req.body;
    const queue = getTaskQueue();
    const task = queue.fail(req.params.id as string, errorMsg || 'Unknown error');
    res.json(task);
  } catch (error) {
    logger.error(`Failed to fail task: ${error}`);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// -------------------------------------------------------------------------
// Execution Engine Endpoints
// -------------------------------------------------------------------------

// GET /api/tasks/engine/stats - Execution engine stats
router.get('/engine/stats', (_req: Request, res: Response) => {
  try {
    const engine = getExecutionEngine();
    res.json(engine.getStats());
  } catch (error) {
    logger.error(`Failed to get engine stats: ${error}`);
    res.status(500).json({ error: 'Failed to get engine stats' });
  }
});

// POST /api/tasks/engine/start - Start the execution engine
router.post('/engine/start', (_req: Request, res: Response) => {
  try {
    const engine = getExecutionEngine();
    if (engine.isRunning()) {
      res.json({ status: 'already_running', stats: engine.getStats() });
      return;
    }

    engine.start();
    res.json({ status: 'started', stats: engine.getStats() });
  } catch (error) {
    logger.error(`Failed to start engine: ${error}`);
    res.status(500).json({ error: 'Failed to start execution engine' });
  }
});

// POST /api/tasks/engine/stop - Stop the execution engine
router.post('/engine/stop', (_req: Request, res: Response) => {
  try {
    const engine = getExecutionEngine();
    engine.stop();
    res.json({ status: 'stopped', stats: engine.getStats() });
  } catch (error) {
    logger.error(`Failed to stop engine: ${error}`);
    res.status(500).json({ error: 'Failed to stop execution engine' });
  }
});

// POST /api/tasks/engine/config - Update engine config
router.post('/engine/config', (req: Request, res: Response): void => {
  try {
    const { pollIntervalMs, maxConcurrent } = req.body;
    const engine = getExecutionEngine();
    const updates: Record<string, unknown> = {};

    if (typeof pollIntervalMs === 'number') updates.pollIntervalMs = pollIntervalMs;
    if (typeof maxConcurrent === 'number') updates.maxConcurrent = maxConcurrent;

    engine.updateConfig(updates as any);
    res.json({ config: engine.getConfig(), stats: engine.getStats() });
  } catch (error) {
    logger.error(`Failed to update engine config: ${error}`);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

export default router;
