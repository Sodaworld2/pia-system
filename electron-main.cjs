/**
 * PIA Visor - Desktop App (Electron)
 *
 * Wraps the PIA Visor web app in a native desktop window with:
 * - System tray icon with status tooltip
 * - Native desktop notifications
 * - Auto-start option
 * - Always-on background mode (closing minimizes to tray)
 * - Starts PIA server automatically if not running
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// ── Config ──
const PIA_PORT = 3000;
const PIA_URL = `http://localhost:${PIA_PORT}/visor.html`;
const HEALTH_URL = `http://localhost:${PIA_PORT}/api/health`;

let mainWindow = null;
let tray = null;
let piaProcess = null;
let isQuitting = false;
let serverReady = false;

// ── Create the tray icon (16x16 colored canvas) ──
function createTrayIcon(color = '#58a6ff') {
  // Create a simple colored square icon
  const size = 16;
  const canvas = nativeImage.createEmpty();

  // Use a simple data URL for the icon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="3" fill="${color}"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="white" font-size="10" font-weight="bold" font-family="Arial">P</text>
  </svg>`;

  const base64 = Buffer.from(svg).toString('base64');
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);
}

// ── Check if PIA server is already running ──
function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

// ── Start PIA server if not running ──
async function ensureServer() {
  const running = await checkServer();
  if (running) {
    serverReady = true;
    console.log('[Electron] PIA server already running');
    return;
  }

  console.log('[Electron] Starting PIA server...');

  const distIndex = path.join(__dirname, 'dist', 'index.js');
  piaProcess = spawn('node', [distIndex], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  piaProcess.stdout.on('data', (data) => {
    const line = data.toString();
    process.stdout.write(`[PIA] ${line}`);
    if (line.includes('PIA Hub is ready')) {
      serverReady = true;
    }
  });

  piaProcess.stderr.on('data', (data) => {
    process.stderr.write(`[PIA ERR] ${data}`);
  });

  piaProcess.on('exit', (code) => {
    console.log(`[Electron] PIA server exited with code ${code}`);
    piaProcess = null;
    serverReady = false;
  });

  // Wait for server to be ready (up to 15 seconds)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await checkServer()) {
      serverReady = true;
      console.log('[Electron] PIA server is ready');
      return;
    }
  }

  console.error('[Electron] PIA server failed to start within 15 seconds');
}

// ── Create the main window ──
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PIA Visor',
    icon: createTrayIcon('#58a6ff'),
    backgroundColor: '#0a0a1a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // Don't show until loaded
  });

  // Load the Visor
  mainWindow.loadURL(PIA_URL);

  // Show when ready
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
          title: 'PIA Visor',
          body: 'Running in system tray. Right-click tray icon to quit.',
          icon: createTrayIcon('#58a6ff'),
        }).show();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// ── Create system tray ──
function createTray() {
  tray = new Tray(createTrayIcon('#58a6ff'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open PIA Visor',
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
      click: () => shell.openExternal(PIA_URL),
    },
    { type: 'separator' },
    {
      label: 'Dashboard',
      click: () => shell.openExternal(`http://localhost:${PIA_PORT}`),
    },
    {
      label: 'API Health',
      click: () => shell.openExternal(HEALTH_URL),
    },
    { type: 'separator' },
    {
      label: 'Server Status',
      enabled: false,
      label: serverReady ? 'Server: Running' : 'Server: Starting...',
    },
    { type: 'separator' },
    {
      label: 'Quit PIA Visor',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('PIA Visor - Machine Governance');
  tray.setContextMenu(contextMenu);

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

  // Update tray tooltip periodically with live stats
  setInterval(async () => {
    try {
      const running = await checkServer();
      const icon = createTrayIcon(running ? '#3fb950' : '#f85149');
      tray.setImage(icon);
      tray.setToolTip(running ? 'PIA Visor - Connected' : 'PIA Visor - Server Down');

      // Update context menu with current status
      const menu = Menu.buildFromTemplate([
        {
          label: 'Open PIA Visor',
          click: () => {
            if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
            else createWindow();
          },
        },
        { label: 'Open in Browser', click: () => shell.openExternal(PIA_URL) },
        { type: 'separator' },
        { label: running ? 'Server: Running' : 'Server: Down', enabled: false },
        { type: 'separator' },
        { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
      ]);
      tray.setContextMenu(menu);
    } catch { /* ignore */ }
  }, 10000);
}

// ── App Lifecycle ──
app.whenReady().then(async () => {
  console.log('[Electron] PIA Visor Desktop starting...');

  // Start server if needed
  await ensureServer();

  // Create tray and window
  createTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on macOS (or when minimized to tray on Windows)
  // App stays in tray
});

app.on('before-quit', () => {
  isQuitting = true;

  // Stop PIA server if we started it
  if (piaProcess) {
    console.log('[Electron] Stopping PIA server...');
    piaProcess.kill();
    piaProcess = null;
  }
});

// Prevent multiple instances
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
