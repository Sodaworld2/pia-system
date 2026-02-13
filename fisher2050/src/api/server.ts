/**
 * Fisher2050 Express Server
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { join } from 'path';
import { config } from '../config.js';

import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';
import meetingsRouter from './routes/meetings.js';
import reportsRouter from './routes/reports.js';
import schedulerRouter from './routes/scheduler.js';

export function createFisherServer(): Express {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '5mb' }));

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      console.log(`[Fisher2050] ${req.method} ${req.path}`);
    }
    next();
  });

  // API routes
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/meetings', meetingsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/scheduler', schedulerRouter);

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      name: 'Fisher2050',
      role: 'Project Manager',
      timestamp: new Date().toISOString(),
      pia: config.pia.url,
    });
  });

  // Dashboard stats
  app.get('/api/stats', async (_req: Request, res: Response) => {
    try {
      const { getDb } = await import('../db.js');
      const db = getDb();

      const projects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").get() as { count: number };
      const pendingTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'").get() as { count: number };
      const inProgressTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'in_progress'").get() as { count: number };
      const overdueTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status IN ('pending','in_progress') AND due_date < unixepoch()").get() as { count: number };
      const upcomingMeetings = db.prepare("SELECT COUNT(*) as count FROM meetings WHERE status = 'scheduled' AND scheduled_at > unixepoch()").get() as { count: number };

      res.json({
        projects: projects.count,
        tasks: { pending: pendingTasks.count, inProgress: inProgressTasks.count, overdue: overdueTasks.count },
        meetings: { upcoming: upcomingMeetings.count },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // Serve static files (dashboard)
  const publicPath = join(process.cwd(), 'public');
  app.use(express.static(publicPath));

  // SPA fallback
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(publicPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(`[Fisher2050] Error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export function startFisherServer(app: Express): void {
  app.listen(config.port, config.host, () => {
    console.log(`[Fisher2050] Project Manager running at http://${config.host}:${config.port}`);
    console.log(`[Fisher2050] Dashboard: http://localhost:${config.port}`);
    console.log(`[Fisher2050] Connected to PIA: ${config.pia.url}`);
  });
}
