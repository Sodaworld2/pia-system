/**
 * Repo API Routes - Alive Repository Management
 *
 * POST   /api/repos/register           - Register a repo with the hub
 * GET    /api/repos                     - List all registered repos
 * GET    /api/repos/stats               - Global repo statistics
 * GET    /api/repos/:name               - Get repo details
 * GET    /api/repos/:name/state         - Get repo state
 * PUT    /api/repos/:name/state         - Update repo state
 * POST   /api/repos/:name/task          - Send a task to a repo
 * GET    /api/repos/:name/jobs          - Get job history for a repo
 * GET    /api/repos/:name/jobs/:jobId   - Get specific job details
 * PUT    /api/repos/:name/jobs/:jobId   - Update job status (repo reports back)
 * GET    /api/repos/jobs/all            - All jobs across all repos
 * GET    /api/repos/find/:capability    - Find repos with a capability
 */

import { Router, Request, Response } from 'express';
import { getRepoRouter } from '../../comms/repo-router.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('ReposAPI');

// POST /api/repos/register - Register a repo
router.post('/register', (req: Request, res: Response) => {
  try {
    const { identity, state } = req.body;

    if (!identity?.name) {
      res.status(400).json({ error: 'identity.name is required' });
      return;
    }

    const repoRouter = getRepoRouter();
    const record = repoRouter.registerRepo(identity, state);

    logger.info(`Repo registered: ${identity.name}`);
    res.status(201).json(record);
  } catch (error) {
    logger.error(`Failed to register repo: ${error}`);
    res.status(500).json({ error: `Failed to register repo: ${error}` });
  }
});

// GET /api/repos - List all repos
router.get('/', (_req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    res.json({
      count: repoRouter.getAllRepos().length,
      repos: repoRouter.getAllRepos(),
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to list repos: ${error}` });
  }
});

// GET /api/repos/stats - Global statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    res.json(repoRouter.getStats());
  } catch (error) {
    res.status(500).json({ error: `Failed to get stats: ${error}` });
  }
});

// GET /api/repos/jobs/all - All jobs across all repos
router.get('/jobs/all', (req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    res.json({
      jobs: repoRouter.getAllJobs({ status, limit }),
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get jobs: ${error}` });
  }
});

// GET /api/repos/find/:capability - Find repos by capability
router.get('/find/:capability', (req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    const repos = repoRouter.findRepoByCapability(req.params.capability as string);
    res.json({
      capability: req.params.capability,
      count: repos.length,
      repos,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to find repos: ${error}` });
  }
});

// GET /api/repos/:name - Get repo details
router.get('/:name', (req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    const repo = repoRouter.getRepo(req.params.name as string);

    if (!repo) {
      res.status(404).json({ error: `Repo "${req.params.name}" not found` });
      return;
    }

    const jobs = repoRouter.getJobsForRepo(req.params.name as string, { limit: 10 });
    res.json({ ...repo, recentJobs: jobs });
  } catch (error) {
    res.status(500).json({ error: `Failed to get repo: ${error}` });
  }
});

// GET /api/repos/:name/state - Get repo state
router.get('/:name/state', (req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    const repo = repoRouter.getRepo(req.params.name as string);

    if (!repo) {
      res.status(404).json({ error: `Repo "${req.params.name}" not found` });
      return;
    }

    res.json(repo.state);
  } catch (error) {
    res.status(500).json({ error: `Failed to get state: ${error}` });
  }
});

// PUT /api/repos/:name/state - Update repo state
router.put('/:name/state', (req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    repoRouter.updateRepoState(req.params.name as string, req.body);
    res.json({ status: 'updated' });
  } catch (error) {
    res.status(500).json({ error: `Failed to update state: ${error}` });
  }
});

// POST /api/repos/:name/task - Send a task to a repo
router.post('/:name/task', (req: Request, res: Response) => {
  try {
    const { action, description, params, requestedBy } = req.body;

    if (!action) {
      res.status(400).json({ error: 'action is required' });
      return;
    }

    const repoRouter = getRepoRouter();
    const job = repoRouter.sendTask(
      req.params.name as string,
      action,
      description || action,
      requestedBy || 'human',
      params,
    );

    logger.info(`Task sent to ${req.params.name}: ${action}`);
    res.status(201).json(job);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send task: ${msg}`);
    res.status(400).json({ error: msg });
  }
});

// GET /api/repos/:name/jobs - Get job history
router.get('/:name/jobs', (req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;

    const jobs = repoRouter.getJobsForRepo(req.params.name as string, { status, limit });
    res.json({
      repoName: req.params.name,
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get jobs: ${error}` });
  }
});

// GET /api/repos/:name/jobs/:jobId - Get specific job
router.get('/:name/jobs/:jobId', (req: Request, res: Response) => {
  try {
    const repoRouter = getRepoRouter();
    const job = repoRouter.getJob(req.params.jobId as string);

    if (!job) {
      res.status(404).json({ error: `Job "${req.params.jobId}" not found` });
      return;
    }

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: `Failed to get job: ${error}` });
  }
});

// PUT /api/repos/:name/jobs/:jobId - Update job status (repo reports back)
router.put('/:name/jobs/:jobId', (req: Request, res: Response) => {
  try {
    const { status, result, error: jobError, startedAt, completedAt } = req.body;

    const repoRouter = getRepoRouter();
    const job = repoRouter.updateJob(req.params.jobId as string, {
      status,
      result,
      error: jobError,
      startedAt,
      completedAt,
    });

    if (!job) {
      res.status(404).json({ error: `Job "${req.params.jobId}" not found` });
      return;
    }

    logger.info(`Job ${req.params.jobId} updated: ${status}`);
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: `Failed to update job: ${error}` });
  }
});

export default router;
