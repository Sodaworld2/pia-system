/**
 * Electron Paths — Centralized path resolution for CLI + Electron packaged mode
 *
 * In CLI mode (npm run dev): uses process.cwd() like before
 * In Electron packaged mode: uses app.getAppPath() for source, app.getPath('userData') for data
 *
 * Usage: import { getAppRoot, getDataDir, getEnvPath, getPublicDir } from './electron-paths.js';
 */

import { resolve, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const isPackaged = !!process.env.ELECTRON_PACKAGED;

/**
 * Get the application root directory (where source files, dist/, public/ live)
 *
 * CLI mode: process.cwd()
 * Electron packaged: app.getAppPath() (inside ASAR or unpacked)
 */
export function getAppRoot(): string {
  if (isPackaged && process.env.ELECTRON_APP_PATH) {
    return process.env.ELECTRON_APP_PATH;
  }
  return process.cwd();
}

/**
 * Get the unpacked app root (files outside ASAR, e.g. dist/ for spawning)
 *
 * CLI mode: same as getAppRoot()
 * Electron packaged: ASAR path with .asar replaced by .asar.unpacked
 */
export function getUnpackedRoot(): string {
  const root = getAppRoot();
  if (isPackaged && root.includes('.asar')) {
    return root.replace('.asar', '.asar.unpacked');
  }
  return root;
}

/**
 * Get the data directory (database, machine-id, checkpoints, sessions)
 *
 * CLI mode: ./data (relative to cwd)
 * Electron packaged: %APPDATA%/pia-system/data/ (via ELECTRON_DATA_DIR env)
 */
export function getDataDir(): string {
  if (isPackaged && process.env.ELECTRON_DATA_DIR) {
    const dir = process.env.ELECTRON_DATA_DIR;
    ensureDir(dir);
    return dir;
  }
  const dir = resolve(process.cwd(), 'data');
  ensureDir(dir);
  return dir;
}

/**
 * Get the .env file path
 *
 * CLI mode: ./.env (relative to cwd)
 * Electron packaged: %APPDATA%/pia-system/.env
 */
export function getEnvPath(): string {
  if (isPackaged && process.env.ELECTRON_DATA_DIR) {
    return join(process.env.ELECTRON_DATA_DIR, '..', '.env');
  }
  return resolve(process.cwd(), '.env');
}

/**
 * Get the public/ directory for serving static files
 *
 * CLI mode: ./public (relative to cwd)
 * Electron packaged: <appRoot>/public
 */
export function getPublicDir(): string {
  return join(getAppRoot(), 'public');
}

/**
 * Get the dist/ directory (compiled JS)
 *
 * CLI mode: ./dist (relative to cwd)
 * Electron packaged: <unpackedRoot>/dist (outside ASAR for spawning)
 */
export function getDistDir(): string {
  return join(getUnpackedRoot(), 'dist');
}

/**
 * Get a specific data subdirectory, ensuring it exists
 */
export function getDataSubDir(subdir: string): string {
  const dir = join(getDataDir(), subdir);
  ensureDir(dir);
  return dir;
}

/**
 * Get database file path
 */
export function getDatabasePath(): string {
  return join(getDataDir(), 'pia.db');
}

/**
 * Get machine-id file path
 */
export function getMachineIdPath(): string {
  return join(getDataDir(), 'machine-id');
}

/**
 * Resolve a path relative to app root (for config files, Firebase creds, etc.)
 */
export function resolveFromAppRoot(...segments: string[]): string {
  return join(getAppRoot(), ...segments);
}

/** Whether running in Electron packaged mode */
export function isElectronPackaged(): boolean {
  return isPackaged;
}

/**
 * Get the Node.js binary path for spawning child processes.
 *
 * In CLI mode (npm run dev): uses system `process.execPath` (the node binary).
 * In Electron packaged mode: uses `process.execPath` (the Electron binary),
 *   which requires ELECTRON_RUN_AS_NODE=1 in the child's env to behave as Node.js.
 *
 * Always use `getNodeSpawnEnv()` together with this to get the correct env vars.
 */
export function getNodeBinary(): string {
  // In both CLI and Electron, process.execPath points to the right binary.
  // In CLI: /path/to/node
  // In Electron: /path/to/pia.exe (which can act as node with ELECTRON_RUN_AS_NODE=1)
  return process.execPath;
}

/**
 * Get environment variables needed for spawning Node.js child processes.
 *
 * In Electron packaged mode, the child process needs ELECTRON_RUN_AS_NODE=1
 * so that the Electron binary behaves as a plain Node.js runtime.
 * In CLI mode, this returns an empty object (no extra env needed).
 */
export function getNodeSpawnEnv(): Record<string, string> {
  if (isPackaged) {
    return { ELECTRON_RUN_AS_NODE: '1' };
  }
  return {};
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // May fail on read-only FS, caller will handle
    }
  }
}
