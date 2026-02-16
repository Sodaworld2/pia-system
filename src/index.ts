import { config } from './config.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { createServer, startServer } from './api/server.js';
import { initWebSocketServer } from './tunnel/websocket-server.js';
import { ptyManager } from './tunnel/pty-wrapper.js';
// Force reload after ESM fix
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

  // Initialize Network Sentinel (intrusion detection) - BEFORE server so middleware captures it
  logger.info('Starting Network Sentinel...');
  const { initNetworkSentinel } = await import('./security/network-sentinel.js');
  initNetworkSentinel();

  // Create and start API server
  logger.info('Starting API server...');
  const app = createServer();
  startServer(app);

  // Initialize WebSocket server
  logger.info('Starting WebSocket server...');
  initWebSocketServer(config.server.wsPort);
  logger.info(`WebSocket server running on port ${config.server.wsPort}`);

  // Initialize Cross-Machine Relay
  logger.info('Starting Cross-Machine Relay...');
  const { initCrossMachineRelay } = await import('./comms/cross-machine.js');
  const os = await import('os');
  initCrossMachineRelay(
    `hub-${os.hostname().toLowerCase()}`,
    config.hub.machineName || os.hostname(),
  );

  // Initialize Repo Router
  logger.info('Starting Repo Router...');
  const { getRepoRouter } = await import('./comms/repo-router.js');
  getRepoRouter();

  // Initialize Hub Aggregator
  logger.info('Starting Hub Aggregator...');
  const { initAggregator } = await import('./hub/aggregator.js');
  initAggregator();

  // Initialize Alert Monitor
  logger.info('Starting Alert Monitor...');
  const { initAlertMonitor } = await import('./hub/alert-monitor.js');
  initAlertMonitor();

  // Start Heartbeat Service
  logger.info('Starting Heartbeat Service...');
  const { getHeartbeatService } = await import('./orchestrator/heartbeat.js');
  const heartbeat = getHeartbeatService();
  heartbeat.start(30000); // Every 30 seconds

  // Start Execution Engine (but don't auto-process - user starts it)
  logger.info('Initializing Execution Engine...');
  const { getExecutionEngine } = await import('./orchestrator/execution-engine.js');
  getExecutionEngine(); // Initialize but don't start - user controls via API

  // Start Doctor (auto-healing)
  logger.info('Starting Doctor (auto-healer)...');
  const { getDoctor } = await import('./agents/doctor.js');
  const doctor = getDoctor();
  doctor.start(60000); // Check every 60 seconds

  // Seed default Agent Souls
  logger.info('Seeding Agent Souls...');
  const { seedDefaultSouls } = await import('./souls/seed-souls.js');
  seedDefaultSouls();

  // Log startup complete
  logger.info('');
  logger.info('='.repeat(50));
  logger.info('  PIA Hub is ready!');
  logger.info('='.repeat(50));
  logger.info(`  Dashboard: http://localhost:${config.server.port}`);
  logger.info(`  Visor:     http://localhost:${config.server.port}/visor.html`);
  logger.info(`  API:       http://localhost:${config.server.port}/api`);
  logger.info(`  WebSocket: ws://localhost:${config.server.wsPort}`);
  logger.info('');
  logger.info('  Waiting for machines to connect...');
  logger.info('='.repeat(50));
  logger.info('');

  // Auto-open Visor in default browser (unless running inside Electron)
  if (!process.env.ELECTRON_RUN_AS_NODE && !process.env.PIA_NO_BROWSER) {
    try {
      const { exec } = await import('child_process');
      const visorUrl = `http://localhost:${config.server.port}/visor.html`;
      const platform = process.platform;
      const cmd = platform === 'win32' ? `start "" "${visorUrl}"`
        : platform === 'darwin' ? `open "${visorUrl}"`
        : `xdg-open "${visorUrl}"`;
      exec(cmd, (err) => {
        if (err) logger.warn(`Could not auto-open Visor: ${err.message}`);
        else logger.info('Visor opened in default browser');
      });
    } catch { /* ignore - browser open is best-effort */ }
  }
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

  // Stop background services
  try {
    const { getHeartbeatService } = require('./orchestrator/heartbeat.js');
    getHeartbeatService().stop();
  } catch { /* may not be initialized */ }

  try {
    const { getExecutionEngine } = require('./orchestrator/execution-engine.js');
    getExecutionEngine().stop();
  } catch { /* may not be initialized */ }

  try {
    const { getDoctor } = require('./agents/doctor.js');
    getDoctor().stop();
  } catch { /* may not be initialized */ }

  // Stop Network Sentinel
  try {
    const { getNetworkSentinel } = require('./security/network-sentinel.js');
    getNetworkSentinel().stop();
  } catch { /* may not be initialized */ }

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
