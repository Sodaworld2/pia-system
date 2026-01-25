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

  // Log startup complete
  logger.info('');
  logger.info('='.repeat(50));
  logger.info('  PIA is ready!');
  logger.info('='.repeat(50));
  logger.info(`  Dashboard: http://localhost:${config.server.port}`);
  logger.info(`  API:       http://localhost:${config.server.port}/api`);
  logger.info(`  WebSocket: ws://localhost:${config.server.wsPort}`);
  logger.info('='.repeat(50));
  logger.info('');

  // Handle graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
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

  logger.info('Goodbye!');
  process.exit(0);
}

// Run
main().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
