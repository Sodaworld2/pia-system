import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

// Import routes
import machinesRouter from './routes/machines.js';
import agentsRouter from './routes/agents.js';
import sessionsRouter from './routes/sessions.js';
import alertsRouter from './routes/alerts.js';
import mcpsRouter from './routes/mcps.js';
import checkpointsRouter from './routes/checkpoints.js';
import aiRouter from './routes/ai.js';
import orchestratorRouter from './routes/orchestrator.js';
import hooksRouter from './routes/hooks.js';

const logger = createLogger('API');

// API token validation middleware
function validateApiToken(req: Request, res: Response, next: NextFunction): void {
  // Skip validation for health check and static files
  if (req.path === '/api/health' || !req.path.startsWith('/api')) {
    next();
    return;
  }

  const token = req.headers['x-api-token'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!token || token !== config.security.secretToken) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API token' });
    return;
  }

  next();
}

// Rate limiter for API routes (very relaxed for development/testing)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2000, // 2000 requests per minute per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for session operations
const sessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5000, // 5000 session operations per minute
  message: { error: 'Too many session requests' },
});

export function createServer(): Express {
  const app = express();

  // Security middleware (relaxed for development)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "unpkg.com"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow xterm.js
  }));

  // CORS with restrictions
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? [/localhost/, /127\.0\.0\.1/]
      : true,
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' })); // Limit body size

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Apply rate limiting to all API routes
  app.use('/api', apiLimiter);

  // Apply token validation to protected routes
  app.use('/api', validateApiToken);

  // Apply stricter rate limit to session creation
  app.use('/api/sessions', sessionLimiter);

  // API routes
  app.use('/api/machines', machinesRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/mcps', mcpsRouter);
  app.use('/api/checkpoints', checkpointsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/orchestrator', orchestratorRouter);
  app.use('/api/hooks', hooksRouter);

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      mode: config.mode,
      timestamp: new Date().toISOString(),
    });
  });

  // Stats endpoint
  app.get('/api/stats', async (_req: Request, res: Response) => {
    try {
      const machinesModule = await import('../db/queries/machines.js');
      const agentsModule = await import('../db/queries/agents.js');
      const alertsModule = await import('../db/queries/alerts.js');
      const ptyModule = await import('../tunnel/pty-wrapper.js');

      const machines = machinesModule.getAllMachines();
      const agentStats = agentsModule.getAgentStats();
      const alertCounts = alertsModule.getAlertCounts();

      let wsClients = 0;
      try {
        const wsModule = await import('../tunnel/websocket-server.js');
        const ws = wsModule.getWebSocketServer();
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
          active: ptyModule.ptyManager.getSessionCount(),
        },
        websocket: {
          clients: wsClients,
        },
      });
    } catch (error) {
      logger.error(`Stats error: ${error}`);
      res.status(500).json({ error: 'Failed to get stats' });
    }
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
