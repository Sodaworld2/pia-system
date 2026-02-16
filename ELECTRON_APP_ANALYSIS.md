# PIA Desktop App — Full Technical Analysis

> Compiled from research on frameworks, UI, packaging, and distribution.
> Based on your priorities: solid architecture, rebuild UI with framework, both CLI + desktop modes.

---

## Executive Summary — 5 Decisions You Need to Make

1. **Framework: Electron** — It's the only option that runs your Node.js server + native modules (node-pty, better-sqlite3) internally. You already have a working prototype. Tauri can't do this.
2. **UI: React + shadcn/ui + Tailwind** — Rebuild the dashboard. Professional desktop aesthetic, proven in Electron (Slack, Discord, Figma). Best xterm.js integration ecosystem.
3. **Build tool: electron-builder** — Not Forge. Better NSIS installer, auto-update from GitHub Releases, portable EXE option, handles native modules well.
4. **No code signing yet** — Accept SmartScreen warnings. Add Azure Trusted Signing ($10/month) later when available to individuals.
5. **Ship Windows first, macOS later** — macOS requires $99/year Apple Developer for notarization. Windows works unsigned.

---

## Chapter 1: Framework Decision

### Why Electron — No Real Alternative

| Requirement | Electron | Tauri 2.x | Neutralino | PKG/nexe |
|---|---|---|---|---|
| Run Express server internally | Yes (Node.js built in) | No (Rust backend, Node.js is a sidecar at best) | No (limited JS runtime) | Yes (but no UI wrapper) |
| node-pty (native C++ addon) | Yes (@electron/rebuild) | No (would need a separate Node.js process) | No | Yes (but no window) |
| better-sqlite3 (native C++ addon) | Yes (@electron/rebuild) | No (has its own SQLite via Rust) | No | Yes (but no window) |
| WebSocket server | Yes | Partial (via sidecar) | Limited | Yes (but no window) |
| Firebase Admin SDK | Yes | No (Node.js only) | No | Yes (but no window) |
| Playwright | Yes | No | No | Yes (but no window) |
| ESM modules ("type": "module") | Yes | N/A | N/A | Partial |
| App size | ~150-200MB installed | ~10-30MB (but can't run your server) | ~5-10MB (but can't run your server) | ~80MB (no GUI) |
| Memory usage | ~150-300MB | ~30-80MB | ~20-50MB | ~100MB |

**The verdict is simple**: PIA has 25+ Express route modules, native C++ addons, Firebase, Playwright, and Claude SDK. Only Electron can run all of this inside a desktop app. Tauri's Rust backend is irrelevant — your entire system is Node.js.

The Tauri "sidecar" approach (bundling Node.js alongside Tauri) would give you the worst of both worlds: Tauri's complexity + a separate Node.js process + no native module integration.

### What About Just Opening The Browser?

PKG/nexe can compile your Node.js server into a single .exe that auto-opens `localhost:3000` in the default browser. This is the simplest path but:
- No system tray
- No auto-update
- No native file dialogs
- No "close to tray" behavior
- Feels like a hack, not an app
- You already have more than this with your `electron-main.cjs`

**Skip this.** You want a real app.

### Electron v40 — What You're Working With

- Chromium 134 (latest as of early 2026)
- Node.js 22.x bundled
- V8 13.4
- ESM support in main process (with some caveats — your CJS main file is fine)
- Full native module support via @electron/rebuild

---

## Chapter 2: UI Architecture

### The Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **React 19** | Proven in Electron at scale. Slack, Discord, Figma, 1Password, Notion all use React + Electron. |
| Components | **shadcn/ui** (Radix + Tailwind) | Professional dark desktop aesthetic. Copy-paste model = you own everything. Official `shadcn-electron-app` template exists. |
| State management | **Zustand** | 2KB, no boilerplate, selective re-rendering. Perfect for multiple concurrent agent streams. |
| Build tool | **electron-vite** | Purpose-built for Electron's main/preload/renderer architecture. HMR in development. |
| Terminal | **xterm.js** (already in deps) | React wrappers available: `@pablo-lion/xterm-react` |
| Styling | **Tailwind CSS v4** | Pairs with shadcn/ui. Replaces 1000+ lines of custom CSS. |
| Charts | **Tremor** or **Recharts** | Tremor is built on shadcn/ui for dashboards. |

### Why React Over Svelte

Svelte is a better framework in isolation. But for Electron + xterm.js + complex real-time state:
- React has mature xterm.js wrappers; Svelte has none
- shadcn/ui (83K GitHub stars) has no Svelte equivalent at that quality level
- Slack, Discord, Figma prove React + Electron works at massive scale
- React's Zustand handles multiple concurrent WebSocket streams cleanly
- The bundle size difference is irrelevant inside Electron (loading from local disk)

### Architecture — How Everything Connects

```
Electron Main Process (electron/main.ts)
  |-- Spawns your Express server (src/index.ts) as child process
  |-- Manages window lifecycle, tray, notifications
  |-- Handles native OS integration (file dialogs, keychain)
  |
  |-- Preload Script (electron/preload.ts)
  |     Exposes: electronAPI.selectDirectory(), .showNotification(), etc.
  |
  |-- Renderer Process (React + shadcn/ui)
        |-- WebSocket to localhost:3001 → agent streams, real-time data
        |-- HTTP fetch to localhost:3000/api/* → REST endpoints
        |-- IPC to main process → ONLY for native OS features
```

**Key insight**: The renderer talks directly to your Express server via HTTP/WebSocket — same as the current HTML dashboard. Electron IPC is only for native OS features (file dialogs, notifications, tray control, app version). Do NOT route agent data through IPC.

### Suggested Project Structure

```
pia-system/
  electron/
    main.ts              # Electron main process (replaces electron-main.cjs)
    preload.ts           # contextBridge for native APIs
  src/
    renderer/            # NEW — React UI
      App.tsx
      components/
        layout/
          Sidebar.tsx
          TabPanel.tsx
          Header.tsx
          StatusBar.tsx
        agents/
          AgentCard.tsx
          AgentStream.tsx
          SpawnDialog.tsx
          AgentTerminal.tsx
        terminal/
          TerminalPanel.tsx     # xterm.js wrapper
        settings/
          SettingsForm.tsx
          ApiKeyManager.tsx
          MachineConfig.tsx
        dashboard/
          StatsOverview.tsx
          MachineList.tsx
          AlertPanel.tsx
      stores/
        agents.ts               # Zustand: agent state + streams
        websocket.ts            # WebSocket connection manager
        settings.ts             # App configuration
        machines.ts             # Connected machines
      hooks/
        useWebSocket.ts
        useAgentStream.ts
        useTerminal.ts
      lib/
        api.ts                  # HTTP client for Express API
        ipc.ts                  # Electron IPC wrappers
    server/                     # EXISTING — Express backend (untouched)
      index.ts
      config.ts
      api/
      mission-control/
      tunnel/
      db/
  public/                       # EXISTING — legacy HTML dashboards (keep for CLI mode)
  electron.vite.config.ts
  tailwind.config.ts
  electron-builder.yml
```

### IPC Pattern — Preload Script

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Native file dialog
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (filters) => ipcRenderer.invoke('dialog:selectFile', filters),

  // System notifications
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', title, body),

  // Window controls
  minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => process.platform,

  // Settings (secure storage)
  getSecureValue: (key) => ipcRenderer.invoke('keychain:get', key),
  setSecureValue: (key, value) => ipcRenderer.invoke('keychain:set', key, value),

  // Server control
  getServerStatus: () => ipcRenderer.invoke('server:status'),
  restartServer: () => ipcRenderer.invoke('server:restart'),
})
```

### State Management — Zustand Store Example

```typescript
// stores/agents.ts
import { create } from 'zustand'

interface Agent {
  id: string
  name: string
  status: 'idle' | 'running' | 'error'
  output: string
  soul?: string
}

interface AgentStore {
  agents: Map<string, Agent>
  activeAgentId: string | null
  setActiveAgent: (id: string) => void
  updateAgent: (id: string, update: Partial<Agent>) => void
  appendOutput: (id: string, text: string) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: new Map(),
  activeAgentId: null,
  setActiveAgent: (id) => set({ activeAgentId: id }),
  updateAgent: (id, update) => set((state) => {
    const agents = new Map(state.agents)
    const agent = agents.get(id)
    if (agent) agents.set(id, { ...agent, ...update })
    return { agents }
  }),
  appendOutput: (id, text) => set((state) => {
    const agents = new Map(state.agents)
    const agent = agents.get(id)
    if (agent) agents.set(id, { ...agent, output: agent.output + text })
    return { agents }
  }),
}))
```

---

## Chapter 3: Packaging & Distribution

### Build Tool: electron-builder (not Forge)

| Factor | electron-builder | electron-forge |
|---|---|---|
| Weekly npm downloads | ~620,000 | ~1,700 |
| Windows installer | NSIS (smallest, customizable) | Squirrel (larger, less control) |
| Auto-update | electron-updater (GitHub Releases) | Squirrel (more limited) |
| Portable EXE | Built-in | Not supported |
| Native module handling | Automatic rebuild | @electron/rebuild |
| Cross-platform | Matrix build (each OS) | Same |

### electron-builder.yml — Production Config

```yaml
appId: com.sodaworld.pia-system
productName: PIA System
copyright: Copyright 2026 SodaWorld

directories:
  output: release
  buildResources: build

# What goes into the app
files:
  - dist/**/*                    # Compiled TypeScript
  - public/**/*                  # Legacy HTML dashboards
  - electron-main.cjs            # Electron main process
  - package.json
  # Exclude everything unnecessary
  - "!**/dao-foundation-files/**"
  - "!**/*.{ts,tsx,map}"
  - "!**/node_modules/typescript/**"
  - "!**/node_modules/eslint/**"
  - "!**/node_modules/prettier/**"
  - "!**/node_modules/vitest/**"
  - "!**/node_modules/tsx/**"
  - "!**/node_modules/playwright/.local-browsers/**"
  - "!**/node_modules/*/{CHANGELOG.md,README.md,LICENSE,test,tests,__tests__,docs,.github}"

# Native modules MUST be unpacked from ASAR
asarUnpack:
  - "**/*.node"
  - "**/node-pty/**"
  - "**/better-sqlite3/**"

# Windows
win:
  target:
    - target: nsis
    - target: portable

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false

# Auto-update from GitHub Releases
publish:
  provider: github
  owner: Sodaworld2
  repo: pia-system

# Only English locale (saves ~4MB)
electronLanguages:
  - en
```

### Native Module Compilation — The Critical Challenge

`node-pty` and `better-sqlite3` are C++ addons. They compile against Node.js headers, but Electron uses different ABI headers. This means:

1. **@electron/rebuild** must recompile them against Electron's headers
2. **ASAR unpacking** is mandatory — `.node` binary files cannot load from inside ASAR archives
3. **Build tools required**: Windows needs Visual Studio Build Tools ("Desktop development with C++"), macOS needs Xcode CLI tools
4. **Cannot cross-compile** — you MUST build Windows installer on Windows, macOS on macOS

electron-builder handles step 1 automatically. Step 2 is the `asarUnpack` config above. Steps 3-4 are handled by GitHub Actions runners.

### Auto-Update — How It Works

```typescript
// In Electron main process
import { autoUpdater } from 'electron-updater'

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify()
})

autoUpdater.on('update-available', (info) => {
  // Notify user: "Version X.Y.Z available, downloading..."
})

autoUpdater.on('update-downloaded', (info) => {
  // Prompt: "Update ready. Restart now?"
})
```

When you run `electron-builder --publish always`, it:
1. Builds the installer
2. Creates a `latest.yml` manifest with version + checksum
3. Uploads both to a GitHub Release

The app checks `latest.yml` on startup, compares versions, downloads the new installer if needed. **Works without code signing on Windows.**

### Database Migrations During Updates

Neither electron-builder nor electron-updater handles schema changes. Use SQLite's built-in `PRAGMA user_version`:

```typescript
const db = new Database(dbPath)
const currentVersion = db.pragma('user_version', { simple: true })

const migrations = [
  () => { db.exec(`CREATE TABLE IF NOT EXISTS ...`); db.pragma('user_version = 1') },
  () => { db.exec(`ALTER TABLE agents ADD COLUMN ...`); db.pragma('user_version = 2') },
]

for (let i = currentVersion; i < migrations.length; i++) {
  db.transaction(() => migrations[i]())()
}
```

### Expected App Sizes

| Component | Size |
|---|---|
| Electron runtime (Chromium + Node.js) | ~85MB compressed |
| Your app code + dependencies | ~30-50MB |
| **NSIS installer** | **~80-120MB** |
| **Portable EXE** | **~100-150MB** |
| Installed on disk | ~150-200MB |

**Biggest size wins**: Exclude Playwright browser binaries (~150MB each!), exclude dao-foundation-files, exclude devDependencies.

---

## Chapter 4: Windows-Specific Challenges

### SmartScreen Without Code Signing

**How bad**: Users see "Windows protected your PC" with "Unknown publisher." They must click "More info" then "Run anyway." Non-technical users will often refuse.

**Mitigations**:
- Tell users explicitly how to bypass (right-click > Properties > Unblock)
- Submit binary to [Microsoft Security Intelligence](https://www.microsoft.com/en-us/wdsi/filesubmission) for review
- After thousands of downloads without reports, SmartScreen stops flagging (takes months)
- **Future**: Azure Trusted Signing at $10/month (currently restricted to US/Canadian businesses with 3+ years history — not yet available to individuals)

**Important (2024 change)**: EV code signing no longer gives instant SmartScreen bypass. Both OV and EV certificates now require building reputation organically.

### Antivirus False Positives

**Common with unsigned Electron apps.** Especially because:
- App is unsigned
- Electron spawns child processes (heuristic trigger)
- `node-pty` spawns shell processes (very suspicious to AV)

Mitigations: Code signing, submit false positive reports to AV vendors, use NSIS installer (trusted more than portable EXE).

### Installer Format

Use **NSIS** as primary + **portable EXE** for try-before-install. NSIS produces the smallest installer, is highly customizable, and supports per-user install (no admin required).

---

## Chapter 5: macOS Challenges

### Notarization Required

Since macOS Catalina, Apple blocks all non-notarized apps. Without it:
- Users see "this app cannot be opened because the developer cannot be verified"
- Workaround: right-click > Open > confirm, or `xattr -cr /path/to/App.app`
- Much worse UX than Windows SmartScreen

**Requires Apple Developer account: $99/year.** No workaround.

### Apple Silicon vs Intel

Build **separate arm64 and x64 installers** (not universal binary). Universal binaries with native modules (node-pty, better-sqlite3) are complex — each `.node` file must be compiled separately and lipo'd together. Separate builds are simpler and produce smaller downloads.

### Format

DMG for consumer distribution. Standard Mac expectation.

---

## Chapter 6: CI/CD Pipeline

### GitHub Actions Multi-Platform Build

```yaml
# .github/workflows/build-desktop.yml
name: Build Desktop App

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            platform: win
          - os: macos-latest
            platform: mac
          - os: ubuntu-latest
            platform: linux

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build TypeScript
        run: npm run build

      - name: Build Electron app
        run: npx electron-builder --${{ matrix.platform }} --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.platform }}-build
          path: |
            release/*.exe
            release/*.dmg
            release/*.AppImage
            release/latest*.yml
```

**Build costs** (GitHub Actions free tier):
- Linux: 2,000 min/month (fast, ~5 min per build)
- Windows: 1,000 effective min/month (2x billing, ~10 min per build)
- macOS: 200 effective min/month (10x billing, ~15 min per build)

---

## Chapter 7: Security — API Key Storage

### Current Problem

API keys live in `.env` files as plain text. In a desktop app, this is unacceptable.

### Solution: OS Keychain

Use [`keytar`](https://github.com/nicedoc/keytar) or Electron's [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) API:

```typescript
// Electron main process
import { safeStorage } from 'electron'

// Encrypt
const encrypted = safeStorage.encryptString(apiKey)
fs.writeFileSync(keyFile, encrypted)

// Decrypt
const encrypted = fs.readFileSync(keyFile)
const apiKey = safeStorage.decryptString(encrypted)
```

`safeStorage` uses:
- **Windows**: DPAPI (Data Protection API) — tied to the user account
- **macOS**: Keychain
- **Linux**: libsecret / gnome-keyring

The encrypted blob is useless without the user's OS login credentials.

---

## Chapter 8: First-Run Wizard

### What to collect:

1. **Machine name** — auto-detect hostname, let user change
2. **API keys** — Anthropic key (required), others optional
3. **Working directory** — where PIA stores data (default: `%APPDATA%/pia-system/`)
4. **Server port** — default 3000, auto-detect conflicts
5. **Connect to peers** — optional, skip for first run

### What to auto-detect:

- Hostname → machine name
- Available ports → server port
- Tailscale IP (if Tailscale is running)
- Existing `.env` file (migrate settings from CLI installation)

### Settings that need restart vs hot-reload:

| Setting | Hot-reload? |
|---|---|
| Machine name | Yes |
| API keys | Yes (re-inject into process.env) |
| Server port | No (requires server restart) |
| WebSocket port | No |
| Database path | No |
| Log level | Yes |
| Feature flags | Yes |

---

## Chapter 9: Phased Roadmap

### Phase 1 — MVP (Get a Working .exe)

**Goal**: Download → double-click → PIA runs. Wrap existing functionality.

| Task | What | Effort |
|---|---|---|
| 1.1 | Set up electron-builder with NSIS config | 1 day |
| 1.2 | Fix electron-main.cjs for packaged paths (userData, __dirname) | 1 day |
| 1.3 | Native module rebuild (node-pty, better-sqlite3) working | 1-2 days |
| 1.4 | ASAR unpacking for native modules | Half day |
| 1.5 | Auto-find free port if 3000 is taken | Half day |
| 1.6 | Server crash → auto-restart | Half day |
| 1.7 | Produce working NSIS installer + portable EXE | 1 day |
| 1.8 | GitHub Actions build pipeline | 1 day |

**Skip for MVP**: New UI, settings wizard, auto-update, code signing, macOS, Linux.
**Ship**: Windows .exe that wraps the existing HTML dashboards. Exactly what you have now, but packaged.

### Phase 2 — New UI Shell

**Goal**: Replace the HTML dashboard with React + shadcn/ui inside Electron.

| Task | What | Effort |
|---|---|---|
| 2.1 | Set up electron-vite + React + Tailwind + shadcn/ui | 1-2 days |
| 2.2 | Build layout shell (sidebar, tabs, header, status bar) | 2-3 days |
| 2.3 | Port WebSocket connection to Zustand store | 1-2 days |
| 2.4 | Agent list + agent stream panels | 2-3 days |
| 2.5 | Terminal panel (xterm.js React wrapper) | 1-2 days |
| 2.6 | Agent spawn dialog | 1 day |
| 2.7 | Machine list + stats overview | 1-2 days |
| 2.8 | Alert panel | 1 day |

**Keep**: Existing HTML dashboards still work in CLI mode (`npm run dev`).

### Phase 3 — Production Ready

**Goal**: Something you'd give to a non-team-member.

| Task | What | Effort |
|---|---|---|
| 3.1 | First-run wizard (machine name, API keys, directory) | 2-3 days |
| 3.2 | Settings screen (all config options from config.ts) | 2-3 days |
| 3.3 | Secure API key storage (safeStorage) | 1 day |
| 3.4 | Auto-update via electron-updater + GitHub Releases | 1-2 days |
| 3.5 | Database migration system | 1 day |
| 3.6 | Error handling + crash recovery (server restart, reconnect) | 2 days |
| 3.7 | macOS build + notarization ($99/year) | 2 days |
| 3.8 | Linux AppImage build | 1 day |

### Phase 4 — Polish

**Goal**: Feels like a real product (VS Code / Slack level).

| Task | What | Effort |
|---|---|---|
| 4.1 | System tray with live status + quick actions | 1 day |
| 4.2 | Native desktop notifications (agent done, alert, etc.) | 1 day |
| 4.3 | Multi-window support (pop out terminals, agents) | 2-3 days |
| 4.4 | Theme system (dark/light/custom) | 1-2 days |
| 4.5 | Keyboard shortcuts / command palette (like VS Code Ctrl+P) | 2 days |
| 4.6 | Drag-and-drop agent arrangement | 1-2 days |
| 4.7 | Search across agents, logs, files | 2 days |
| 4.8 | Code signing (when Azure Trusted Signing available) | 1 day |
| 4.9 | Delta updates (if electron-delta matures) | 1-2 days |
| 4.10 | Onboarding tour for new users | 1-2 days |

---

## Challenges & Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Native module compilation fails on CI | High | Test @electron/rebuild locally first. Pin exact Electron + module versions. |
| SmartScreen blocks downloads | Medium | Submit to Microsoft, add bypass instructions, sign later. |
| Antivirus false positives | Medium | Submit false positive reports. NSIS installer helps. Sign later. |
| App size too large (Playwright browsers) | High | Exclude browser binaries from package. Download at runtime if needed. |
| Port 3000 already in use | Low | Auto-detect free port. Already planned for Phase 1. |
| node-pty path breaks after packaging | High | Use `app.getPath('userData')` for data. Test PTY spawn in packaged app. |
| Database path changes after packaging | High | Resolve paths relative to `app.getPath('userData')`, not `process.cwd()`. |
| Memory usage too high (Electron + server + agents) | Medium | Profile early. Consider lazy-loading services. |
| macOS Gatekeeper blocks unsigned app | High | Requires $99/year Apple Developer account. No workaround. |
| Old PIA version connects to new version | Medium | Version handshake in WebSocket connection. Warn on mismatch. |

---

## Reference Links

### Official Documentation
- [Electron Docs](https://www.electronjs.org/docs/latest/) — main reference
- [electron-builder Docs](https://www.electron.build/) — packaging
- [electron-vite](https://electron-vite.org/) — build tooling
- [shadcn/ui](https://ui.shadcn.com/) — component library
- [Context7 — Electron Docs](https://context7.com/electron/electron) — 553 pages of indexed Electron documentation for LLM queries

### Key References
- [Electron Native Modules Guide](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Electron Code Signing Guide](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [electron-builder Auto Update](https://www.electron.build/auto-update.html)
- [electron-builder NSIS Config](https://www.electron.build/nsis.html)
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [shadcn-electron-app Template](https://github.com/nicedoc/shadcn-electron-app) — starting point for UI
- [Slack Engineering: Rebuilding on Electron](https://slack.engineering/rebuilding-slack-on-the-desktop/)
- [Azure Trusted Signing](https://azure.microsoft.com/en-us/pricing/details/artifact-signing/) — future code signing option

### Context7 MCP (for AI-assisted development)
- [Context7 GitHub](https://github.com/upstash/context7) — MCP server for pulling live documentation into your prompts
- Query: `resolve-library-id("electron")` then `query-docs(id, "native modules packaging")`
- Query: `resolve-library-id("electron-builder")` then `query-docs(id, "NSIS auto-update configuration")`

---

## Dual-Mode Architecture — CLI + Desktop

Your requirement: CLI mode (`npm run dev`) and Desktop mode (Electron app) from the same codebase.

```
package.json scripts:
  "dev"           → tsx watch src/index.ts          (CLI mode — opens browser)
  "desktop"       → electron electron/main.ts       (Desktop mode — Electron window)
  "desktop:build" → electron-builder --win           (Package for distribution)
```

The Express server code is identical in both modes. The difference:
- **CLI mode**: Server starts directly, auto-opens Visor in default browser
- **Desktop mode**: Electron spawns server as child process, loads UI in Electron window

Your existing `ELECTRON_RUN_AS_NODE` check in `src/index.ts:111` already handles this:
```typescript
if (!process.env.ELECTRON_RUN_AS_NODE && !process.env.PIA_NO_BROWSER) {
  // Auto-open browser (CLI mode only)
}
```

The React UI (Phase 2+) replaces the browser for desktop users. CLI users still get the HTML dashboards.
