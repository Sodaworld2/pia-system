import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import geminiRouter from './routes/gemini';
import daoRouter from './routes/dao';
import treasuryRouter from './routes/treasury';
import agreementsRouter from './routes/agreements';
import founderAgreementsRouter from './routes/founder-agreements';
import advisorAgreementsRouter from './routes/advisor-agreements';
import contributorAgreementsRouter from './routes/contributor-agreements';
import firstbornAgreementsRouter from './routes/firstborn-agreements';
import councilRouter from './routes/council';
import milestonesRouter from './routes/milestones';
import signaturesRouter from './routes/signatures';
import contractsRouter from './routes/contracts';
import bubblesRouter from './routes/bubbles';
import proposalsRouter from './routes/proposals';
import tokenDistributionRouter from './routes/token_distribution';
import tokensRouter from './routes/tokens';
import marketplaceRouter from './routes/marketplace';
import adminRouter from './routes/admin';
import healthRouter from './routes/health';
import brainRouter from './routes/brain';
import modulesRouter from './routes/modules';
import { initializeDatabase } from './database';
import { ModuleRegistry } from './modules';
import { initializeRAG } from './ai';
import logger from './utils/logger';
import { requestLoggerMiddleware } from './middleware/requestLogger';
import { performanceMonitorMiddleware } from './middleware/performanceMonitor';
import {
  apiRateLimiter,
  adminRateLimiter,
  requestTimeout,
  validateRequestSize,
  sanitizeInput,
  getSecurityHeadersConfig,
  validateEnvironment
} from './middleware/security';

const app = express();
const port = process.env.PORT || 5003;

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================
// Validate required environment variables before starting server
const envValidation = validateEnvironment();
if (!envValidation.valid) {
  console.error('❌ CRITICAL: Missing required environment variables:');
  envValidation.missing.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease check backend/.env.example for required configuration.');
  process.exit(1);
}

console.log('✓ Environment variables validated successfully');

// Environment-aware CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production';

// Production origins (Firebase hosting)
const productionOrigins = [
  'https://dao-of-soda.web.app',
  'https://dao-of-soda.firebaseapp.com',
  process.env.PRODUCTION_FRONTEND_URL || '',
].filter(Boolean);

// Development origins (localhost ports)
const developmentOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://localhost:5180',
];

// Combine origins - always allow development origins for testing
// This allows local development to connect to the deployed backend
const allowedOrigins = [...productionOrigins, ...developmentOrigins];

// ============================================================
// SECURITY MIDDLEWARE (Applied before other middleware)
// ============================================================

// Security headers with helmet
app.use(helmet(getSecurityHeadersConfig()));

// Request timeout protection
app.use(requestTimeout);

// Request size validation
app.use(validateRequestSize);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      if (isDevelopment) {
        logger.info(`CORS allowed origin: ${origin}`);
      }
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`, {
        allowedOrigins: allowedOrigins.join(', ')
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// JSON body parser with size limit
const maxRequestSize = process.env.MAX_REQUEST_SIZE || '10mb';
app.use(express.json({ limit: maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: maxRequestSize }));

// Input sanitization (applied to all requests)
app.use(sanitizeInput);

// Performance monitoring middleware
app.use(performanceMonitorMiddleware);

// Request logging middleware
app.use(requestLoggerMiddleware);

// ============================================================
// RATE LIMITING (Applied to API routes)
// ============================================================

// General API rate limiting
app.use('/api/', apiRateLimiter);

// Stricter rate limiting for admin endpoints
app.use('/api/admin', adminRateLimiter);

// ============================================================
// ROUTES
// ============================================================

// Health check routes (exempt from rate limiting, checked before other routes)
app.use('/api/health', healthRouter);

app.use('/api/brain', brainRouter);
app.use('/api/modules', modulesRouter);
app.use('/api/mentor', geminiRouter); // Legacy — kept for backwards compatibility
app.use('/api/gemini', geminiRouter);
app.use('/api/dao', daoRouter);
app.use('/api/treasury', treasuryRouter);
// More specific routes must come before less specific ones
app.use('/api/agreements/founder', founderAgreementsRouter);
app.use('/api/agreements/advisor', advisorAgreementsRouter);
app.use('/api/agreements/contributor', contributorAgreementsRouter);
app.use('/api/agreements/firstborn', firstbornAgreementsRouter);
app.use('/api/agreements', agreementsRouter);
app.use('/api/council', councilRouter);
app.use('/api/milestones', milestonesRouter);
app.use('/api/signatures', signaturesRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/bubbles', bubblesRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/token-distribution', tokenDistributionRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/admin', adminRouter);

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
  });

  res.status(500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
});

// Initialize database and start server
if (process.env.NODE_ENV !== 'test') {
  initializeDatabase()
    .then(async () => {
      // Initialize DB Admin services
      try {
        const { backupService } = await import('./services/backup');
        const { migrationManager } = await import('./services/migrationManager');
        const { maintenanceScheduler } = await import('./services/maintenanceScheduler');

        // Initialize backup service
        await backupService.initialize();
        logger.info('✓ Backup service initialized');

        // Initialize migration manager
        await migrationManager.initialize();
        logger.info('✓ Migration manager initialized');

        // Start maintenance scheduler if enabled
        if (process.env.ENABLE_MAINTENANCE_SCHEDULER === 'true') {
          maintenanceScheduler.start();
          logger.info('✓ Maintenance scheduler started');
        }

        // Initialize AI Module Registry
        try {
          const registry = new ModuleRegistry(require('./database').default);
          (global as any).__moduleRegistry = registry;
          logger.info('Module Registry initialized', { modules: registry.availableModules });
        } catch (regErr) {
          logger.warn('Module Registry init failed (non-blocking)', { error: String(regErr) });
        }

        // Initialize RAG pipeline (non-blocking — works without ChromaDB)
        initializeRAG().then(available => {
          if (available) logger.info('✓ RAG pipeline initialized');
        }).catch(() => {});

        logger.info('✓ All DB Admin services initialized successfully');
      } catch (error) {
        logger.warn('Failed to initialize some DB Admin services', {
          error: error instanceof Error ? error.message : String(error)
        });
        // Don't exit - server can still run without advanced admin features
      }

      app.listen(port, () => {
        logger.info(`Server started successfully`, {
          port,
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
        });
      });
    })
    .catch((error) => {
      logger.error('Failed to initialize database', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason,
    promise,
  });
});

export default app;
