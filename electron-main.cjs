/**
 * PIA System - Desktop App (Electron)
 *
 * Wraps the PIA system in a native desktop window with:
 * - System tray icon with status tooltip
 * - Native desktop notifications
 * - Always-on background mode (closing minimizes to tray)
 * - Starts PIA server automatically as a child process
 * - Server crash restart with retry limits
 * - Port conflict resolution (3000-3010)
 * - Proper ASAR-aware path resolution for packaged mode
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, shell, dialog, ipcMain, safeStorage } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

// ── Path Resolution ──────────────────────────────────────────────────────────
const IS_PACKAGED = app.isPackaged;
const APP_PATH = IS_PACKAGED ? app.getAppPath() : __dirname;
const UNPACKED_PATH = IS_PACKAGED ? APP_PATH.replace('.asar', '.asar.unpacked') : __dirname;

/**
 * Get or create the persistent data directory.
 * Packaged: %APPDATA%/pia-system/data/
 * Dev:      ./data/ (relative to project root)
 */
function getDataDir() {
  if (IS_PACKAGED) {
    const dir = path.join(app.getPath('userData'), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Preload script path
const PRELOAD_PATH = path.join(__dirname, 'electron-preload.cjs');

/**
 * Get the .env file path
 */
function getEnvFilePath() {
  if (IS_PACKAGED) {
    return path.join(app.getPath('userData'), '.env');
  }
  return path.join(__dirname, '.env');
}

/**
 * Get the secure keys directory
 */
function getKeysDir() {
  const dir = path.join(getDataDir(), 'keys');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get or create the log directory inside the data directory.
 */
function getLogDir() {
  const dir = path.join(getDataDir(), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get a writable file stream for today's log file (data/logs/pia-YYYY-MM-DD.log).
 */
function getLogStream() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logPath = path.join(getLogDir(), `pia-${today}.log`);
  return fs.createWriteStream(logPath, { flags: 'a' }); // append mode
}

/**
 * Remove .log files older than 7 days from the log directory.
 */
function cleanOldLogs() {
  const logDir = getLogDir();
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

  try {
    const files = fs.readdirSync(logDir);
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const filePath = path.join(logDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`[Electron] Cleaned old log: ${file}`);
      }
    }
  } catch (err) {
    console.error(`[Electron] Failed to clean old logs: ${err.message}`);
  }
}

/**
 * Check if this is a first run (no database exists)
 */
function isFirstRun() {
  const dbPath = path.join(getDataDir(), 'pia.db');
  return !fs.existsSync(dbPath);
}

/**
 * Read .env file into a key-value object
 */
function readEnvFile() {
  const envPath = getEnvFilePath();
  const result = {};
  if (!fs.existsSync(envPath)) return result;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

/**
 * Write key-value object to .env file (preserves comments, updates in place)
 */
function writeEnvFile(updates) {
  const envPath = getEnvFilePath();
  let lines = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  }

  const written = new Set();

  // Update existing lines
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key in updates) {
      lines[i] = `${key}=${updates[key]}`;
      written.add(key);
    }
  }

  // Append new keys
  for (const [key, value] of Object.entries(updates)) {
    if (!written.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, lines.join('\n'));
}

// ── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let piaProcess = null;
let isQuitting = false;
let serverReady = false;
let serverPort = 3000;
let wsPort = 3001;

// Crash restart tracking
const RESTART_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RESTARTS = 3;
let restartTimestamps = [];

// ── Single Instance Lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Tray Icon (SVG) ─────────────────────────────────────────────────────────
function createTrayIcon(color = '#58a6ff') {
  const size = 16;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="3" fill="${color}"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="white" font-size="10" font-weight="bold" font-family="Arial">P</text>
  </svg>`;
  const base64 = Buffer.from(svg).toString('base64');
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);
}

// ── Port Availability Check ──────────────────────────────────────────────────
/**
 * Returns true if the given port is free (nothing listening on it).
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      // EADDRINUSE means the port is taken
      resolve(err.code !== 'EADDRINUSE' ? true : false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port starting from `startPort`, trying up to `startPort + maxTries`.
 * Returns the first available port, or throws if none found.
 */
async function findAvailablePort(startPort, maxTries = 11) {
  for (let offset = 0; offset < maxTries; offset++) {
    const port = startPort + offset;
    if (await isPortAvailable(port)) {
      return port;
    }
    console.log(`[Electron] Port ${port} is occupied, trying next...`);
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + maxTries - 1}`);
}

// ── Server Health Check ──────────────────────────────────────────────────────
function checkServer() {
  return new Promise((resolve) => {
    const url = `http://localhost:${serverPort}/api/health`;
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.status === 'ok');
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ── Server Spawn ─────────────────────────────────────────────────────────────
/**
 * Start the PIA server as a child process with the correct environment
 * for both dev and packaged modes.
 */
async function startServer() {
  const dataDir = getDataDir();
  const dbPath = path.join(dataDir, 'pia.db');
  const distIndex = path.join(UNPACKED_PATH, 'dist', 'index.js');

  console.log(`[Electron] Spawning server: node ${distIndex}`);
  console.log(`[Electron]   Packaged: ${IS_PACKAGED}`);
  console.log(`[Electron]   APP_PATH: ${APP_PATH}`);
  console.log(`[Electron]   UNPACKED_PATH: ${UNPACKED_PATH}`);
  console.log(`[Electron]   Data dir: ${dataDir}`);
  console.log(`[Electron]   DB path: ${dbPath}`);
  console.log(`[Electron]   Server port: ${serverPort}, WS port: ${wsPort}`);

  // Verify dist/index.js exists
  if (!fs.existsSync(distIndex)) {
    const msg = `Server entry point not found: ${distIndex}`;
    console.error(`[Electron] ${msg}`);
    dialog.showErrorBox('PIA Startup Error', msg);
    app.quit();
    return;
  }

  const env = {
    ...process.env,
    PIA_PORT: String(serverPort),
    PIA_WS_PORT: String(wsPort),
    PIA_DB_PATH: dbPath,
    // Electron-specific env vars consumed by src/electron-paths.ts
    ELECTRON_PACKAGED: IS_PACKAGED ? '1' : '',
    ELECTRON_APP_PATH: APP_PATH,
    ELECTRON_DATA_DIR: dataDir,
    // Makes the Electron binary behave as a plain Node.js runtime for the child.
    // In packaged mode, 'node' may not be on PATH, so we use process.execPath
    // (the Electron binary) and set this env var to make it act as Node.js.
    ...(IS_PACKAGED ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  };

  // In packaged mode, 'node' might not be on PATH. Use process.execPath instead,
  // which points to the Electron binary. With ELECTRON_RUN_AS_NODE=1 it acts as Node.js.
  const nodeBinary = IS_PACKAGED ? process.execPath : 'node';

  console.log(`[Electron] Using node binary: ${nodeBinary}`);

  const logStream = getLogStream();

  piaProcess = spawn(nodeBinary, [distIndex], {
    cwd: IS_PACKAGED ? UNPACKED_PATH : __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    // On Windows, don't open a console window for the child
    windowsHide: true,
  });

  piaProcess.stdout.on('data', (data) => {
    const line = data.toString();
    process.stdout.write(`[PIA] ${line}`);
    const logLine = `[${new Date().toISOString()}] ${line}`;
    logStream.write(logLine);
    if (line.includes('PIA Hub is ready') || line.includes('listening on')) {
      serverReady = true;
    }
  });

  piaProcess.stderr.on('data', (data) => {
    process.stderr.write(`[PIA ERR] ${data}`);
    const logLine = `[${new Date().toISOString()}] [ERR] ${data}`;
    logStream.write(logLine);
  });

  piaProcess.on('exit', (code, signal) => {
    console.log(`[Electron] PIA server exited (code=${code}, signal=${signal})`);
    piaProcess = null;
    serverReady = false;

    // If we are quitting, do nothing
    if (isQuitting) return;

    // Unexpected exit — attempt restart
    handleServerCrash(code, signal);
  });
}

/**
 * Handle unexpected server exit with retry logic.
 */
async function handleServerCrash(code, signal) {
  const now = Date.now();

  // Prune timestamps older than the restart window
  restartTimestamps = restartTimestamps.filter((t) => now - t < RESTART_WINDOW_MS);

  if (restartTimestamps.length >= MAX_RESTARTS) {
    // Too many crashes — log and ask the user what to do
    const crashEntry = `[${new Date().toISOString()}] Server crashed - code=${code}, signal=${signal}, max restarts exceeded (${MAX_RESTARTS}/${MAX_RESTARTS})\n`;
    fs.appendFileSync(path.join(getDataDir(), 'crash-log.txt'), crashEntry);

    console.error(`[Electron] Server crashed ${MAX_RESTARTS} times in ${RESTART_WINDOW_MS / 1000}s — giving up auto-restart`);

    if (tray) {
      tray.setImage(createTrayIcon('#f85149'));
      tray.setToolTip('PIA - Server failed');
    }

    const { response } = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'error',
      title: 'PIA Server Failure',
      message: `The PIA server has crashed ${MAX_RESTARTS} times within 5 minutes.\n\nExit code: ${code}\nSignal: ${signal}`,
      buttons: ['Restart Server', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      // User chose Restart — reset counters and try again
      restartTimestamps = [];
      await startServer();
      await waitForServerReady();
      updateTrayMenu();
    } else {
      isQuitting = true;
      app.quit();
    }
    return;
  }

  // Auto-restart
  restartTimestamps.push(now);
  const attempt = restartTimestamps.length;

  // Append to crash log
  const crashEntry = `[${new Date().toISOString()}] Server crashed - code=${code}, signal=${signal}, attempt=${attempt}/${MAX_RESTARTS}\n`;
  fs.appendFileSync(path.join(getDataDir(), 'crash-log.txt'), crashEntry);

  console.log(`[Electron] Auto-restarting server (attempt ${attempt}/${MAX_RESTARTS})...`);

  if (Notification.isSupported()) {
    new Notification({
      title: 'PIA Server',
      body: `Server crashed and was restarted (attempt ${attempt}/${MAX_RESTARTS}).`,
    }).show();
  }

  // Brief delay before restart
  await new Promise((r) => setTimeout(r, 1500));

  await startServer();
  await waitForServerReady();
  updateTrayMenu();
}

// ── Ensure Server Is Running ─────────────────────────────────────────────────
/**
 * Check if a server is already running on our chosen port.
 * If not, spawn one. Wait until it responds to health checks.
 */
async function ensureServer() {
  // Find available ports
  try {
    serverPort = await findAvailablePort(3000);
    wsPort = serverPort + 1;

    // If wsPort is also occupied, bump it
    if (!(await isPortAvailable(wsPort))) {
      wsPort = await findAvailablePort(wsPort);
    }
  } catch (err) {
    console.error(`[Electron] ${err.message}`);
    dialog.showErrorBox('PIA Startup Error', `Could not find an available port.\n\n${err.message}`);
    app.quit();
    return;
  }

  console.log(`[Electron] Using port ${serverPort} (WS: ${wsPort})`);

  // Check if something is already serving health on that port (e.g. dev server)
  const alreadyRunning = await checkServer();
  if (alreadyRunning) {
    serverReady = true;
    console.log('[Electron] PIA server already running on port ' + serverPort);
    return;
  }

  // Spawn the server process
  await startServer();
  await waitForServerReady();
}

/**
 * Poll the health endpoint until the server responds or we time out.
 */
async function waitForServerReady() {
  const timeout = 20000; // 20 seconds
  const interval = 500;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, interval));
    if (await checkServer()) {
      serverReady = true;
      console.log('[Electron] PIA server is ready');
      return;
    }
  }

  console.error('[Electron] PIA server failed to start within 20 seconds');

  if (Notification.isSupported()) {
    new Notification({
      title: 'PIA Server',
      body: 'Server did not start in time. The dashboard may not load.',
    }).show();
  }
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const piaUrl = `http://localhost:${serverPort}/mission-control.html`;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PIA Mission Control',
    icon: createTrayIcon('#58a6ff'),
    backgroundColor: '#0a0a1a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD_PATH,
    },
    show: false,
  });

  mainWindow.loadURL(piaUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      if (Notification.isSupported()) {
        new Notification({
          title: 'PIA Mission Control',
          body: 'Running in system tray. Right-click tray icon to quit.',
        }).show();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// ── System Tray ──────────────────────────────────────────────────────────────
function buildTrayMenu() {
  const piaUrl = `http://localhost:${serverPort}/mission-control.html`;
  const healthUrl = `http://localhost:${serverPort}/api/health`;

  return Menu.buildFromTemplate([
    {
      label: 'Open PIA Mission Control',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(piaUrl),
    },
    { type: 'separator' },
    {
      label: 'Dashboard',
      click: () => shell.openExternal(`http://localhost:${serverPort}`),
    },
    {
      label: 'API Health',
      click: () => shell.openExternal(healthUrl),
    },
    { type: 'separator' },
    {
      label: serverReady ? `Server: Running (port ${serverPort})` : 'Server: Starting...',
      enabled: false,
    },
    {
      label: 'View Logs',
      click: () => shell.openPath(getLogDir()),
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        const settingsUrl = `http://localhost:${serverPort}/settings.html`;
        if (mainWindow) {
          mainWindow.loadURL(settingsUrl);
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
          mainWindow.loadURL(settingsUrl);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Restart Server',
      click: async () => {
        if (piaProcess) {
          console.log('[Electron] User-requested server restart');
          piaProcess.kill();
          piaProcess = null;
          serverReady = false;
        }
        // Reset crash counters on manual restart
        restartTimestamps = [];
        await startServer();
        await waitForServerReady();
        updateTrayMenu();
      },
    },
    {
      label: 'Quit PIA',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  tray = new Tray(createTrayIcon('#58a6ff'));
  tray.setToolTip(`PIA v${app.getVersion()} - Mission Control`);
  tray.setContextMenu(buildTrayMenu());

  // Click tray icon to show/focus window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });

  // Periodic health check — update tray icon and menu
  setInterval(async () => {
    try {
      const running = await checkServer();
      const wasReady = serverReady;
      serverReady = running;

      const iconColor = running ? '#3fb950' : '#f85149';
      tray.setImage(createTrayIcon(iconColor));
      tray.setToolTip(running ? `PIA v${app.getVersion()} - Connected (port ${serverPort})` : `PIA v${app.getVersion()} - Server Down`);

      // Only rebuild menu if status changed
      if (running !== wasReady) {
        updateTrayMenu();
      }
    } catch {
      /* ignore */
    }
  }, 10000);
}

function updateTrayMenu() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
  }
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// App info
ipcMain.handle('pia:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('pia:get-hostname', () => {
  return os.hostname();
});

ipcMain.handle('pia:is-first-run', () => {
  return isFirstRun();
});

ipcMain.handle('pia:server-status', () => {
  return { ready: serverReady, port: serverPort, wsPort };
});

// Settings — delegates to .env reading/writing
ipcMain.handle('pia:get-settings', () => {
  const env = readEnvFile();
  return {
    machineName: env.PIA_MACHINE_NAME || 'Unknown Machine',
    mode: env.PIA_MODE || 'hub',
    hubUrl: env.PIA_HUB_URL || 'http://localhost:3000',
    serverPort: env.PIA_PORT || '3000',
    wsPort: env.PIA_WS_PORT || '3001',
    primaryAi: env.PIA_AI_PRIMARY || 'ollama',
    fallbackAi: env.PIA_AI_FALLBACK || 'claude',
    ollamaUrl: env.PIA_OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: env.PIA_OLLAMA_MODEL || 'llama3:70b',
    claudeApiKey: env.PIA_CLAUDE_API_KEY ? `...${env.PIA_CLAUDE_API_KEY.slice(-4)}` : '',
    logLevel: env.PIA_LOG_LEVEL || 'info',
    heartbeatInterval: env.PIA_HEARTBEAT_INTERVAL || '30000',
    secretToken: env.PIA_SECRET_TOKEN ? `...${env.PIA_SECRET_TOKEN.slice(-4)}` : '',
  };
});

ipcMain.handle('pia:save-settings', (_event, settings) => {
  const RESTART_KEYS = ['PIA_MODE', 'PIA_HUB_URL', 'PIA_PORT', 'PIA_WS_PORT', 'PIA_SECRET_TOKEN'];
  const KEY_MAP = {
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

  const updates = {};
  let needsRestart = false;

  for (const [key, value] of Object.entries(settings)) {
    const envKey = KEY_MAP[key];
    if (!envKey) continue;
    // Skip redacted values
    if (typeof value === 'string' && value.startsWith('...')) continue;
    updates[envKey] = String(value);
    if (RESTART_KEYS.includes(envKey)) needsRestart = true;
  }

  writeEnvFile(updates);
  return { success: true, needsRestart };
});

// First-run config save — writes .env and starts server
ipcMain.handle('pia:save-config', async (_event, config) => {
  const updates = {};
  if (config.machineName) updates.PIA_MACHINE_NAME = config.machineName;
  if (config.mode) updates.PIA_MODE = config.mode;
  if (config.hubUrl) updates.PIA_HUB_URL = config.hubUrl;
  if (config.apiKey) updates.PIA_CLAUDE_API_KEY = config.apiKey;
  if (config.secretToken) updates.PIA_SECRET_TOKEN = config.secretToken;
  updates.PIA_PORT = String(serverPort);
  updates.PIA_WS_PORT = String(wsPort);
  updates.PIA_DB_PATH = path.join(getDataDir(), 'pia.db');

  writeEnvFile(updates);

  // Also encrypt API key if safeStorage is available
  if (config.apiKey && safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(config.apiKey);
      fs.writeFileSync(path.join(getKeysDir(), 'anthropic.enc'), encrypted);
    } catch (err) {
      console.error('[Electron] Failed to encrypt API key:', err.message);
    }
  }

  return { success: true };
});

// Server control
ipcMain.handle('pia:restart-server', async () => {
  if (piaProcess) {
    piaProcess.kill();
    piaProcess = null;
    serverReady = false;
  }
  restartTimestamps = [];
  await startServer();
  await waitForServerReady();
  updateTrayMenu();
  return { success: true };
});

// Secure API key storage
ipcMain.handle('pia:save-api-key', (_event, name, key) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { success: false, error: 'Encryption not available' };
  }
  try {
    const encrypted = safeStorage.encryptString(key);
    fs.writeFileSync(path.join(getKeysDir(), `${name}.enc`), encrypted);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pia:get-api-key', (_event, name) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }
  try {
    const filePath = path.join(getKeysDir(), `${name}.enc`);
    if (!fs.existsSync(filePath)) return null;
    const encrypted = fs.readFileSync(filePath);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
});

ipcMain.handle('pia:delete-api-key', (_event, name) => {
  try {
    const filePath = path.join(getKeysDir(), `${name}.enc`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tailscale peer discovery
ipcMain.handle('pia:discover-peers', async () => {
  try {
    return await discoverTailscalePeers();
  } catch (err) {
    return { error: err.message };
  }
});

/**
 * Discover PIA instances on the Tailscale network (simplified for CJS main process)
 */
async function discoverTailscalePeers() {
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  let status;
  try {
    const { stdout } = await execFileAsync('tailscale', ['status', '--json'], { timeout: 5000 });
    status = JSON.parse(stdout);
  } catch {
    try {
      const { stdout } = await execFileAsync(
        'C:\\Program Files\\Tailscale\\tailscale.exe',
        ['status', '--json'],
        { timeout: 5000 }
      );
      status = JSON.parse(stdout);
    } catch (err) {
      throw new Error('Tailscale not found or not running');
    }
  }

  const peers = [];
  const peerMap = status.Peer || {};

  for (const [_key, peer] of Object.entries(peerMap)) {
    if (!peer.Online) continue;
    const ip = peer.TailscaleIPs?.[0];
    if (!ip) continue;

    const peerInfo = {
      name: peer.HostName || 'unknown',
      ip,
      os: peer.OS || 'unknown',
      online: true,
    };

    // Probe for PIA on common ports
    for (const port of [3000, 3001, 3002, 3003]) {
      const result = await probePIAHealth(ip, port);
      if (result.running) {
        peerInfo.hasPIA = true;
        peerInfo.piaPort = port;
        peerInfo.piaMode = result.mode;
        break;
      }
    }

    peers.push(peerInfo);
  }

  return peers;
}

function probePIAHealth(ip, port) {
  return new Promise((resolve) => {
    const req = http.get(`http://${ip}:${port}/api/health`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ running: json.status === 'ok', mode: json.mode });
        } catch {
          resolve({ running: false });
        }
      });
    });
    req.on('error', () => resolve({ running: false }));
    req.on('timeout', () => { req.destroy(); resolve({ running: false }); });
  });
}

// Config export/import
ipcMain.handle('pia:export-config', () => {
  const env = readEnvFile();
  // Strip sensitive keys
  delete env.PIA_CLAUDE_API_KEY;
  delete env.PIA_SECRET_TOKEN;
  delete env.PIA_JWT_SECRET;
  return env;
});

ipcMain.handle('pia:import-config', (_event, config) => {
  // Don't import sensitive keys
  delete config.PIA_CLAUDE_API_KEY;
  delete config.PIA_SECRET_TOKEN;
  delete config.PIA_JWT_SECRET;
  writeEnvFile(config);
  return { success: true };
});

// ── Auto-Update (electron-updater) ──────────────────────────────────────────
let autoUpdater = null;

function initAutoUpdater() {
  try {
    // electron-updater is optional — only available in packaged app
    const { autoUpdater: updater } = require('electron-updater');
    autoUpdater = updater;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('[Update] Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log(`[Update] Update available: v${info.version}`);
      if (Notification.isSupported()) {
        new Notification({
          title: 'PIA Update Available',
          body: `Version ${info.version} is downloading...`,
        }).show();
      }
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[Update] No updates available');
    });

    autoUpdater.on('download-progress', (progress) => {
      if (tray) {
        tray.setToolTip(`PIA - Downloading update: ${Math.round(progress.percent)}%`);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[Update] Update downloaded: v${info.version}`);
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: 'PIA Update Ready',
          body: `Version ${info.version} will install on restart. Click to restart now.`,
        });
        notification.on('click', () => {
          autoUpdater.quitAndInstall();
        });
        notification.show();
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[Update] Error:', err.message);
    });

    // Check for updates after a short delay
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 10000);

  } catch (err) {
    console.log('[Update] electron-updater not available (dev mode):', err.message);
  }
}

// ── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  console.log('[Electron] PIA Desktop starting...');
  console.log(`[Electron] Packaged: ${IS_PACKAGED}`);
  console.log(`[Electron] App path: ${APP_PATH}`);
  console.log(`[Electron] Unpacked path: ${UNPACKED_PATH}`);
  console.log(`[Electron] Version: ${app.getVersion()}`);

  // Ensure data directory exists
  const dataDir = getDataDir();
  console.log(`[Electron] Data directory: ${dataDir}`);

  // Clean up old log files (older than 7 days)
  cleanOldLogs();

  // Decrypt API key from safeStorage if available and inject into env
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const keyFile = path.join(getKeysDir(), 'anthropic.enc');
      if (fs.existsSync(keyFile)) {
        const encrypted = fs.readFileSync(keyFile);
        const apiKey = safeStorage.decryptString(encrypted);
        process.env.PIA_CLAUDE_API_KEY = apiKey;
        console.log('[Electron] Decrypted API key from safeStorage');
      }
    } catch (err) {
      console.error('[Electron] Failed to decrypt API key:', err.message);
    }
  }

  // Check first-run
  const firstRun = isFirstRun();
  console.log(`[Electron] First run: ${firstRun}`);

  if (firstRun) {
    // Show first-run setup before starting server
    // We need the server running to serve the HTML, so start it first
    await ensureServer();
    createTray();

    mainWindow = new BrowserWindow({
      width: 800,
      height: 700,
      minWidth: 700,
      minHeight: 600,
      title: 'PIA Setup',
      icon: createTrayIcon('#58a6ff'),
      backgroundColor: '#0a0a1a',
      autoHideMenuBar: true,
      resizable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
      },
      show: false,
    });

    mainWindow.loadURL(`http://localhost:${serverPort}/first-run.html`);
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.focus();
    });

    mainWindow.on('closed', () => { mainWindow = null; });
  } else {
    // Normal startup
    await ensureServer();
    createTray();
    createWindow();
  }

  // Initialize auto-updater
  initAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit — app stays in tray
});

app.on('before-quit', () => {
  isQuitting = true;

  if (piaProcess) {
    console.log('[Electron] Stopping PIA server...');
    piaProcess.kill();
    piaProcess = null;
  }
});
