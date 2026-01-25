import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Load .env file
const envPath = resolve(process.cwd(), '.env');
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

export const config: PIAConfig = {
  mode: getEnv('PIA_MODE', 'hub') as 'hub' | 'local',

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
    url: getEnv('PIA_HUB_URL', 'http://localhost:3000'),
    machineName: getEnv('PIA_MACHINE_NAME', 'Unknown Machine'),
  },

  ai: {
    primary: getEnv('PIA_AI_PRIMARY', 'ollama') as 'ollama' | 'claude',
    fallback: getEnv('PIA_AI_FALLBACK', 'claude') as 'ollama' | 'claude' | 'none',
    ollamaUrl: getEnv('PIA_OLLAMA_URL', 'http://localhost:11434'),
    ollamaModel: getEnv('PIA_OLLAMA_MODEL', 'llama3:70b'),
    claudeApiKey: getEnv('PIA_CLAUDE_API_KEY', ''),
  },

  database: {
    path: getEnv('PIA_DB_PATH', './data/pia.db'),
  },

  features: {
    autoHealer: getEnvBool('PIA_ENABLE_AUTO_HEALER', true),
    pushNotifications: getEnvBool('PIA_ENABLE_PUSH_NOTIFICATIONS', true),
    heartbeatInterval: getEnvInt('PIA_HEARTBEAT_INTERVAL', 30000),
    stuckThreshold: getEnvInt('PIA_STUCK_THRESHOLD', 300000),
  },

  logging: {
    level: getEnv('PIA_LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
  },
};

export default config;
