/**
 * Seed default soul definitions into the database on startup.
 * Reads JSON personality files and upserts them.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSoulEngine, SoulDefinition } from './soul-engine.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SoulSeeder');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PERSONALITY_FILES = [
  'fisher2050.json',
  'ziggi.json',
  'eliyahu.json',
];

export function seedDefaultSouls(): void {
  const engine = getSoulEngine();
  let seeded = 0;

  for (const file of PERSONALITY_FILES) {
    try {
      const filePath = join(__dirname, 'personalities', file);
      const raw = readFileSync(filePath, 'utf8');
      const def = JSON.parse(raw) as SoulDefinition;
      engine.seedSoul(def);
      seeded++;
    } catch (err) {
      logger.error(`Failed to seed soul from ${file}: ${(err as Error).message}`);
    }
  }

  logger.info(`Soul seeding complete: ${seeded}/${PERSONALITY_FILES.length} processed`);
}
