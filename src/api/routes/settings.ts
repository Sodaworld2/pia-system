/**
 * Settings API
 * Read/write PIA configuration from the settings page (browser mode + Electron IPC).
 *
 * GET  /api/settings         — Returns all current settings (API keys redacted)
 * PUT  /api/settings         — Updates .env file with provided settings
 * GET  /api/settings/export  — Returns settings JSON without sensitive keys
 * POST /api/settings/import  — Bulk-apply settings (like PUT but all at once)
 */

import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from '../../config.js';
import { getEnvPath } from '../../electron-paths.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('SettingsAPI');

// Keys that require a server restart to take effect
const RESTART_REQUIRED_KEYS = [
  'PIA_MODE',
  'PIA_HUB_URL',
  'PIA_PORT',
  'PIA_WS_PORT',
  'PIA_SECRET_TOKEN',
];

// Map from settings key names to .env variable names
const KEY_MAP: Record<string, string> = {
  machineName: 'PIA_MACHINE_NAME',
  mode: 'PIA_MODE',
  hubUrl: 'PIA_HUB_URL',
  serverPort: 'PIA_PORT',
  wsPort: 'PIA_WS_PORT',
  primaryAi: 'PIA_AI_PRIMARY',
  fallbackAi: 'PIA_AI_FALLBACK',
  ollamaUrl: 'PIA_OLLAMA_URL',
  ollamaModel: 'PIA_OLLAMA_MODEL',
  claudeApiKey: 'PIA_CLAUDE_API_KEY',
  logLevel: 'PIA_LOG_LEVEL',
  heartbeatInterval: 'PIA_HEARTBEAT_INTERVAL',
  secretToken: 'PIA_SECRET_TOKEN',
};

// Sensitive keys that should be redacted in GET responses
const SENSITIVE_KEYS = ['claudeApiKey', 'secretToken'];


/**
 * Read .env file into a Map of key=value pairs.
 * Preserves comments and blank lines as-is.
 */
function readEnvFile(): { lines: string[]; values: Map<string, string> } {
  const envPath = getEnvPath();
  const lines: string[] = [];
  const values = new Map<string, string>();

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      lines.push(line);
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          values.set(key, value);
        }
      }
    }
  }

  return { lines, values };
}

/**
 * Write values back to the .env file.
 * Updates existing lines in-place, appends new keys at the end.
 */
function writeEnvFile(updates: Map<string, string>): void {
  const envPath = getEnvPath();
  const { lines } = readEnvFile();
  const written = new Set<string>();

  // Update existing lines in-place
  const updatedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) return line;

    const key = trimmed.substring(0, eqIndex).trim();
    if (updates.has(key)) {
      written.add(key);
      return `${key}=${updates.get(key)}`;
    }
    return line;
  });

  // Append keys that weren't already in the file
  for (const [key, value] of updates) {
    if (!written.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  writeFileSync(envPath, updatedLines.join('\n'), 'utf8');
}

/**
 * Redact a sensitive value — show only last 4 characters.
 */
function redact(value: string | undefined): string {
  if (!value) return '';
  return `...${value.slice(-4)}`;
}

/**
 * Build the full settings object from current config.
 */
function getCurrentSettings() {
  return {
    machineName: config.hub.machineName,
    mode: config.mode,
    hubUrl: config.hub.url,
    serverPort: config.server.port,
    wsPort: config.server.wsPort,
    primaryAi: config.ai.primary,
    fallbackAi: config.ai.fallback,
    ollamaUrl: config.ai.ollamaUrl,
    ollamaModel: config.ai.ollamaModel,
    claudeApiKey: redact(config.ai.claudeApiKey),
    logLevel: config.logging.level,
    heartbeatInterval: config.features.heartbeatInterval,
    secretToken: redact(config.security.secretToken),
  };
}

/**
 * GET /api/settings
 * Returns all current settings with sensitive values redacted.
 */
router.get('/', (_req: Request, res: Response): void => {
  try {
    res.json(getCurrentSettings());
  } catch (error) {
    logger.error(`Failed to read settings: ${error}`);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

/**
 * PUT /api/settings
 * Write settings to the .env file. Only updates keys that are provided.
 * Skips values that look redacted (starting with "...").
 */
router.put('/', (req: Request, res: Response): void => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Request body must be a JSON object' });
      return;
    }

    const updates = new Map<string, string>();
    let needsRestart = false;

    for (const [settingsKey, envKey] of Object.entries(KEY_MAP)) {
      if (!(settingsKey in body)) continue;

      const value = String(body[settingsKey]);

      // Skip redacted values — user didn't change the sensitive field
      if (value.startsWith('...')) continue;

      updates.set(envKey, value);

      if (RESTART_REQUIRED_KEYS.includes(envKey)) {
        needsRestart = true;
      }
    }

    if (updates.size === 0) {
      res.json({ success: true, needsRestart: false, message: 'No settings changed' });
      return;
    }

    writeEnvFile(updates);

    logger.info(`Settings updated: ${[...updates.keys()].join(', ')}${needsRestart ? ' (restart required)' : ''}`);
    res.json({ success: true, needsRestart });
  } catch (error) {
    logger.error(`Failed to write settings: ${error}`);
    res.status(500).json({ error: `Failed to write settings: ${(error as Error).message}` });
  }
});

/**
 * GET /api/settings/export
 * Returns settings JSON without sensitive keys (for config export/backup).
 */
router.get('/export', (_req: Request, res: Response): void => {
  try {
    const settings = getCurrentSettings();

    // Remove sensitive keys entirely
    const exportable: Record<string, any> = { ...settings };
    for (const key of SENSITIVE_KEYS) {
      delete exportable[key];
    }

    res.json({
      exportedAt: new Date().toISOString(),
      settings: exportable,
    });
  } catch (error) {
    logger.error(`Failed to export settings: ${error}`);
    res.status(500).json({ error: 'Failed to export settings' });
  }
});

/**
 * POST /api/settings/import
 * Accepts settings JSON and applies it (like PUT but bulk).
 * Expects { settings: { ... } } in the body.
 */
router.post('/import', (req: Request, res: Response): void => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'Request body must contain a "settings" object' });
      return;
    }

    const updates = new Map<string, string>();
    let needsRestart = false;

    for (const [settingsKey, envKey] of Object.entries(KEY_MAP)) {
      if (!(settingsKey in settings)) continue;

      const value = String(settings[settingsKey]);

      // Skip redacted values
      if (value.startsWith('...')) continue;

      // Skip sensitive keys in import (must be set explicitly via PUT)
      if (SENSITIVE_KEYS.includes(settingsKey)) continue;

      updates.set(envKey, value);

      if (RESTART_REQUIRED_KEYS.includes(envKey)) {
        needsRestart = true;
      }
    }

    if (updates.size === 0) {
      res.json({ success: true, needsRestart: false, message: 'No settings imported' });
      return;
    }

    writeEnvFile(updates);

    logger.info(`Settings imported: ${[...updates.keys()].join(', ')}${needsRestart ? ' (restart required)' : ''}`);
    res.json({
      success: true,
      needsRestart,
      keysUpdated: [...updates.keys()],
    });
  } catch (error) {
    logger.error(`Failed to import settings: ${error}`);
    res.status(500).json({ error: `Failed to import settings: ${(error as Error).message}` });
  }
});

export default router;
