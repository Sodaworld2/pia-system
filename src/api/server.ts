import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

// Import routes
import machinesRouter from './routes/machines.js';
import agentsRouter from './routes/agents.js';
import sessionsRouter from './routes/sessions.js';
import alertsRouter from './routes/alerts.js';

const logger = createLogger('API');

export function createServer(): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use('/api/machines', machinesRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/alerts', alertsRouter);

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      mode: config.mode,
      timestamp: new Date().toISOString(),
    });
  });

  // Stats endpoint
  app.get('/api/stats', (_req: Request, res: Response) => {
    const { getAllMachines } = require('../db/queries/machines.js');
    const { getAgentStats } = require('../db/queries/agents.js');
    const { getAlertCounts } = require('../db/queries/alerts.js');
    const { getWebSocketServer } = require('../tunnel/websocket-server.js');
    const { ptyManager } = require('../tunnel/pty-wrapper.js');

    const machines = getAllMachines();
    const agentStats = getAgentStats();
    const alertCounts = getAlertCounts();

    let wsClients = 0;
    try {
      const ws = getWebSocketServer();
      wsClients = ws.getAuthenticatedClientCount();
    } catch {
      // WebSocket not initialized yet
    }

    res.json({
      machines: {
        total: machines.length,
        online: machines.filter((m: { status: string }) => m.status === 'online').length,
        offline: machines.filter((m: { status: string }) => m.status === 'offline').length,
      },
      agents: agentStats,
      alerts: alertCounts,
      sessions: {
        active: ptyManager.getSessionCount(),
      },
      websocket: {
        clients: wsClients,
      },
    });
  });

  // Serve static files (dashboard)
  const publicPath = join(process.cwd(), 'public');
  app.use(express.static(publicPath));

  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(publicPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // Error handling
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export function startServer(app: Express): void {
  const { port, host } = config.server;

  app.listen(port, host, () => {
    logger.info(`API server running at http://${host}:${port}`);
    logger.info(`Dashboard available at http://localhost:${port}`);
  });
}
