import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
}

// Also try parent .env for shared config
const parentEnvPath = resolve(process.cwd(), '..', '.env');
if (existsSync(parentEnvPath)) {
  loadEnv({ path: parentEnvPath });
}

export const config = {
  port: parseInt(process.env.FISHER_PORT || '3002', 10),
  host: process.env.FISHER_HOST || '0.0.0.0',

  pia: {
    url: process.env.PIA_URL || 'http://localhost:3000',
    token: process.env.PIA_TOKEN || process.env.PIA_SECRET_TOKEN || 'dev-token-change-in-production',
  },

  database: {
    path: process.env.FISHER_DB_PATH || './data/fisher2050.db',
  },

  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.PIA_CLAUDE_API_KEY || '',
  },

  soulId: 'fisher2050',
};

export default config;
