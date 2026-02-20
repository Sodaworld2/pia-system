import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { hostname } from 'os';
import { getEnvPath, getDatabasePath } from './electron-paths.js';

// Fleet registry — each machine auto-identifies by hostname.
// PIA_MODE and PIA_HUB_URL in .env still override if set explicitly.
const FLEET: Record<string, { mode: 'hub' | 'local'; hubUrl: string; machineName: string }> = {
  'IZZIT7':               { mode: 'hub',   hubUrl: 'http://localhost:3000',        machineName: 'Izzit7 (M1 Hub)' },
  'SODA-MONSTER-HUNTER':  { mode: 'local', hubUrl: 'http://100.73.133.3:3000',     machineName: 'soda-monster-hunter (M2)' },
  'SODA-YETI':            { mode: 'local', hubUrl: 'http://100.73.133.3:3000',     machineName: 'soda-yeti (M3)' },
};

const machineHostname = hostname().toUpperCase();
const fleetEntry = FLEET[machineHostname];

// Load .env file
const envPath = getEnvPath();
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
}

export interface PIAConfig {
  mode: 'hub' | 'local';
  server: {
    port: number;
    host: string;
    wsPort: number;
  };
  security: {
    secretToken: string;
    jwtSecret: string;
  };
  hub: {
    url: string;
    machineName: string;
    projectRoots: string[];
  };
  ai: {
    primary: 'ollama' | 'claude';
    fallback: 'ollama' | 'claude' | 'none';
    ollamaUrl: string;
    ollamaModel: string;
    claudeApiKey: string;
  };
  database: {
    path: string;
  };
  features: {
    autoHealer: boolean;
    pushNotifications: boolean;
    heartbeatInterval: number;
    stuckThreshold: number;
    ollamaUrl: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  return val === 'true' || val === '1';
}

function getEnvInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Fleet entry takes priority over PIA_MODE env var when hostname matches a known machine.
// This prevents PM2 env sections from accidentally overriding per-machine identity.
const resolvedMode = (fleetEntry?.mode ?? (process.env.PIA_MODE as 'hub' | 'local')) ?? 'hub';

export const config: PIAConfig = {
  mode: resolvedMode,

  server: {
    port: getEnvInt('PIA_PORT', 3000),
    host: getEnv('PIA_HOST', '0.0.0.0'),
    wsPort: getEnvInt('PIA_WS_PORT', 3001),
  },

  security: {
    secretToken: getEnv('PIA_SECRET_TOKEN', 'dev-token-change-in-production'),
    jwtSecret: getEnv('PIA_JWT_SECRET', 'dev-jwt-secret-change-in-production'),
  },

  hub: {
    url: getEnv('PIA_HUB_URL', fleetEntry?.hubUrl || 'http://localhost:3000'),
    machineName: getEnv('PIA_MACHINE_NAME', fleetEntry?.machineName || machineHostname || 'Unknown Machine'),
    /** Extra directories to scan for git repos (comma-separated). Added to default scan paths. */
    projectRoots: getEnv('PIA_PROJECT_ROOTS', '').split(',').map(s => s.trim()).filter(Boolean),
  },

  ai: {
    primary: getEnv('PIA_AI_PRIMARY', 'ollama') as 'ollama' | 'claude',
    fallback: getEnv('PIA_AI_FALLBACK', 'claude') as 'ollama' | 'claude' | 'none',
    ollamaUrl: getEnv('PIA_OLLAMA_URL', 'http://localhost:11434'),
    ollamaModel: getEnv('PIA_OLLAMA_MODEL', 'llama3:70b'),
    claudeApiKey: getEnv('PIA_CLAUDE_API_KEY', ''),
  },

  database: {
    path: getEnv('PIA_DB_PATH', getDatabasePath()),
  },

  features: {
    autoHealer: getEnvBool('PIA_ENABLE_AUTO_HEALER', true),
    pushNotifications: getEnvBool('PIA_ENABLE_PUSH_NOTIFICATIONS', true),
    heartbeatInterval: getEnvInt('PIA_HEARTBEAT_INTERVAL', 30000),
    stuckThreshold: getEnvInt('PIA_STUCK_THRESHOLD', 300000),
    ollamaUrl: getEnv('PIA_OLLAMA_URL', 'http://localhost:11434'),
  },

  logging: {
    level: getEnv('PIA_LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
  },
};

export default config;
