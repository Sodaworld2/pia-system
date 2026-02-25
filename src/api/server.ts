import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { getAppRoot, getPublicDir, resolveFromAppRoot } from '../electron-paths.js';

// Firebase Admin SDK
import admin from 'firebase-admin';

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
try {
  const serviceAccount = JSON.parse(readFileSync(resolveFromAppRoot(serviceAccountPath), 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('[Firebase] Admin SDK initialized successfully');
} catch (e) {
  console.warn('[Firebase] Admin SDK not initialized:', (e as Error).message);
}

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
import factoryRouter from './routes/factory.js';
import tasksRouter from './routes/tasks.js';
import messagesRouter from './routes/messages.js';
import doctorRouter from './routes/doctor.js';
import delegationRouter from './routes/delegation.js';
import relayRouter from './routes/relay.js';
import reposRouter from './routes/repos.js';
import webhooksRouter from './routes/webhooks.js';
import pubsubRouter from './routes/pubsub.js';
import securityRouter from './routes/security.js';
import filesRouter from './routes/files.js';
import execRouter from './routes/exec.js';
import soulsRouter from './routes/souls.js';
import workSessionsRouter from './routes/work-sessions.js';
import missionControlRouter from './routes/mission-control.js';
import daoModulesRouter from './routes/dao-modules.js';
import daoProxyRouter from './routes/dao-proxy.js';
import daoAuthRouter from './routes/dao-auth.js';
import browserRouter from './routes/browser.js';
import machineBoardRouter from './routes/machine-board.js';
import whatsappRouter from './routes/whatsapp.js';
import settingsRouter from './routes/settings.js';
import cortexRouter from './routes/cortex.js';
import systemRouter from './routes/system.js';
import fisherRouter from './routes/fisher.js';
import emailInboundRouter from './routes/email-inbound.js';
import calendarRouter from './routes/calendar.js';
import voiceNotesRouter from './routes/voice-notes.js';
import { getNetworkSentinel } from '../security/network-sentinel.js';

const logger = createLogger('API');

// Cache the version from package.json at module load (avoid reading on every health check)
let cachedVersion = 'unknown';
try {
  const pkg = JSON.parse(readFileSync(join(getAppRoot(), 'package.json'), 'utf8'));
  cachedVersion = pkg.version;
} catch {
  logger.warn('Could not read package.json for version');
}

// API token validation middleware — supports BOTH static API tokens AND Firebase auth
// NOTE: This middleware is mounted at app.use('/api', ...) so req.path is relative to /api
// (e.g., '/files/list' not '/api/files/list'). Use req.originalUrl for full-path checks.
async function validateApiToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip public endpoints
  if (req.originalUrl === '/api/health' ||                   // Health check for monitoring tools
      req.originalUrl.startsWith('/api/dao/auth')) {         // DAO auth (Firebase)
    next();
    return;
  }

  // 1. Try static API token first (x-api-token header)
  const apiToken = req.headers['x-api-token'] as string | undefined;
  if (apiToken && apiToken === config.security.secretToken) {
    next();
    return;
  }

  // 2. Try Bearer token — could be static token OR Firebase ID token
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : undefined;

  // Check if bearer token matches static secret
  if (bearerToken && bearerToken === config.security.secretToken) {
    next();
    return;
  }

  // 3. Try to verify as Firebase ID token
  if (bearerToken) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(bearerToken);
      // Attach Firebase user info to request for downstream handlers
      (req as any).firebaseUser = decodedToken;
      (req as any).firebaseUid = decodedToken.uid;
      next();
      return;
    } catch (firebaseError) {
      // Firebase verification failed — fall through to unauthorized
      logger.debug(`Firebase token verification failed: ${firebaseError}`);
    }
  }

  // All auth methods failed
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    getNetworkSentinel().recordFailedAuth(ip);
  } catch { /* sentinel may not be initialized yet */ }
  res.status(401).json({ error: 'Unauthorized: Invalid or missing API token' });
  return;
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

  // Security middleware (relaxed for development / Tailscale LAN)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "unpkg.com", "apis.google.com", "www.gstatic.com", "https://www.gstatic.com/firebasejs/"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
        connectSrc: ["'self'", "ws:", "wss:", "https://*.googleapis.com", "https://*.google.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"],
        frameSrc: ["'self'", "*.firebaseapp.com", "*.google.com"],
        fontSrc: ["'self'"],
        upgradeInsecureRequests: null, // Disable — no HTTPS on Tailscale LAN
      },
    },
    crossOriginEmbedderPolicy: false, // Allow xterm.js
    hsts: false, // Disable — no HTTPS on Tailscale LAN
  }));

  // CORS with restrictions
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? [/localhost/, /127\.0\.0\.1/]
      : true,
    credentials: true,
  }));

  app.use(express.json({ limit: '10mb' })); // Increased for file transfers

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Network Sentinel - intrusion detection middleware
  app.use(getNetworkSentinel().middleware());

  // Apply rate limiting to all API routes
  app.use('/api', apiLimiter);

  // Mount DAO auth routes BEFORE the validateApiToken middleware (these are public)
  app.use('/api/dao/auth', daoAuthRouter);

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
  app.use('/api/factory', factoryRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/doctor', doctorRouter);
  app.use('/api/delegation', delegationRouter);
  app.use('/api/relay', relayRouter);
  app.use('/api/repos', reposRouter);
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/pubsub', pubsubRouter);
  app.use('/api/security', securityRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/exec', execRouter);
  app.use('/api/souls', soulsRouter);
  app.use('/api/work-sessions', workSessionsRouter);
  app.use('/api/mc', missionControlRouter);
  app.use('/api/modules', daoModulesRouter);
  app.use('/api/dao-proxy', daoProxyRouter);
  app.use('/api/browser', browserRouter);
  app.use('/api/machine-board', machineBoardRouter);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/cortex', cortexRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/fisher', fisherRouter);
  app.use('/api/email', emailInboundRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/voice-notes', voiceNotesRouter);

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      mode: config.mode,
      version: cachedVersion,
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
  const publicPath = getPublicDir();
  app.use(express.static(publicPath));

  // Serve root-level HTML mockups (MASTER_DASHBOARD.html, etc.)
  const rootPath = getAppRoot();
  app.get('/*.html', (req: Request, res: Response, next: Function) => {
    const filePath = join(rootPath, req.path);
    if (filePath.startsWith(rootPath) && !req.path.startsWith('/api')) {
      res.sendFile(filePath, (err: any) => { if (err) next(); });
    } else {
      next();
    }
  });

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
    logger.error(`Unhandled error: ${err.message}\n${err.stack}`);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
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
