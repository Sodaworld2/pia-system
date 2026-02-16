/**
 * The Cortex — PIA's Fleet Intelligence Brain
 *
 * Initializes and exports all Cortex subsystems:
 * - CortexDB: Separate SQLite for telemetry data
 * - DataCollector: Pulls data from all PIA systems
 * - Intelligence: Rule-based observation & suggestion engine
 */

import { createLogger } from '../utils/logger.js';
import { initCortexDatabase, closeCortexDatabase } from './cortex-db.js';
import { getCortexCollector } from './data-collector.js';
import { getCortexIntelligence } from './intelligence.js';

const logger = createLogger('Cortex');

/**
 * Initialize The Cortex — call after main PIA database and services are up.
 */
export function initCortex(options?: {
  collectionIntervalMs?: number;
  analysisIntervalMs?: number;
}): void {
  const collectionInterval = options?.collectionIntervalMs || 60000;  // 1 min
  const analysisInterval = options?.analysisIntervalMs || 120000;     // 2 min

  logger.info('Initializing The Cortex...');

  // 1. Initialize separate database
  initCortexDatabase();

  // 2. Start data collector
  const collector = getCortexCollector();
  collector.start(collectionInterval);

  // 3. Start intelligence engine
  const intelligence = getCortexIntelligence();
  intelligence.start(analysisInterval);

  logger.info('The Cortex is online.');
}

/**
 * Shut down The Cortex cleanly.
 */
export function shutdownCortex(): void {
  logger.info('Shutting down The Cortex...');

  getCortexCollector().stop();
  getCortexIntelligence().stop();
  closeCortexDatabase();

  logger.info('The Cortex is offline.');
}

// Re-export key components
export { getCortexCollector } from './data-collector.js';
export { getCortexIntelligence } from './intelligence.js';
export { getCortexDatabase } from './cortex-db.js';
export type { FleetOverview, MachineOverview, TelemetrySnapshot } from './data-collector.js';
export type { Insight } from './intelligence.js';
