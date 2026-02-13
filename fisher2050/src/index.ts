/**
 * Fisher2050 — AI Project Manager
 * Entry point
 */

import { config } from './config.js';
import { initDb, closeDb } from './db.js';
import { createFisherServer, startFisherServer } from './api/server.js';
import { initScheduler, stopScheduler } from './scheduler/scheduler.js';
import { PiaClient } from './integrations/pia.js';

async function main() {
  console.log('='.repeat(50));
  console.log('  Fisher2050 — AI Project Manager');
  console.log('='.repeat(50));
  console.log(`  PIA: ${config.pia.url}`);
  console.log(`  Port: ${config.port}`);
  console.log('');

  // Initialize database
  console.log('[Fisher2050] Initializing database...');
  initDb();

  // Test PIA connection
  console.log('[Fisher2050] Testing PIA connection...');
  const pia = new PiaClient();
  try {
    const health = await pia.health();
    console.log(`[Fisher2050] PIA connected: ${health.status} (mode: ${health.mode})`);
  } catch (err) {
    console.warn(`[Fisher2050] PIA not reachable at ${config.pia.url} — will retry later`);
  }

  // Start Express server
  const app = createFisherServer();
  startFisherServer(app);

  // Start scheduler
  console.log('[Fisher2050] Starting scheduler...');
  initScheduler();

  console.log('');
  console.log('='.repeat(50));
  console.log('  Fisher2050 is ready!');
  console.log('='.repeat(50));
  console.log('');

  // Graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function shutdown() {
  console.log('\n[Fisher2050] Shutting down...');
  stopScheduler();
  closeDb();
  process.exit(0);
}

main().catch(err => {
  console.error(`[Fisher2050] Fatal error: ${err}`);
  process.exit(1);
});
