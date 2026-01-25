import { config } from './config.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { createServer, startServer } from './api/server.js';
import { initWebSocketServer } from './tunnel/websocket-server.js';
import { ptyManager } from './tunnel/pty-wrapper.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('Main');

async function main(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('  PIA - Project Intelligence Agent');
  logger.info('='.repeat(50));
  logger.info(`Mode: ${config.mode.toUpperCase()}`);
  logger.info(`Version: 1.0.0`);
  logger.info('');

  if (config.mode === 'hub') {
    await startHub();
  } else {
    await startLocal();
  }

  // Handle graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function startHub(): Promise<void> {
  // Initialize database
  logger.info('Initializing database...');
  initDatabase();

  // Create and start API server
  logger.info('Starting API server...');
  const app = createServer();
  startServer(app);

  // Initialize WebSocket server
  logger.info('Starting WebSocket server...');
  initWebSocketServer(config.server.wsPort);
  logger.info(`WebSocket server running on port ${config.server.wsPort}`);

  // Initialize Hub Aggregator
  logger.info('Starting Hub Aggregator...');
  const { initAggregator } = await import('./hub/aggregator.js');
  initAggregator();

  // Initialize Alert Monitor
  logger.info('Starting Alert Monitor...');
  const { initAlertMonitor } = await import('./hub/alert-monitor.js');
  initAlertMonitor();

  // Log startup complete
  logger.info('');
  logger.info('='.repeat(50));
  logger.info('  PIA Hub is ready!');
  logger.info('='.repeat(50));
  logger.info(`  Dashboard: http://localhost:${config.server.port}`);
  logger.info(`  API:       http://localhost:${config.server.port}/api`);
  logger.info(`  WebSocket: ws://localhost:${config.server.wsPort}`);
  logger.info('');
  logger.info('  Waiting for machines to connect...');
  logger.info('='.repeat(50));
  logger.info('');
}

async function startLocal(): Promise<void> {
  // Initialize local database (minimal, for caching)
  logger.info('Initializing local database...');
  initDatabase();

  // Start local service
  logger.info('Starting PIA Local Service...');
  const { startLocalService } = await import('./local/service.js');
  await startLocalService();
}

function shutdown(): void {
  logger.info('');
  logger.info('Shutting down PIA...');

  // Kill all PTY sessions
  logger.info('Closing PTY sessions...');
  ptyManager.killAll();

  // Close database
  logger.info('Closing database...');
  closeDatabase();

  // Disconnect from Hub if in local mode
  if (config.mode === 'local') {
    try {
      const { getHubClient } = require('./local/hub-client.js');
      getHubClient().disconnect();
    } catch {
      // Hub client may not be initialized
    }
  }

  logger.info('Goodbye!');
  process.exit(0);
}

// Run
main().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
