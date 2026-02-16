# Agent Prompt: Explore Building PIA as a Desktop App (Electron)

Copy and paste this entire prompt to give to a Claude agent.

---

## Your role

You are a **product architect and technical adviser**. Your job is NOT to build the app yet. Your job is to **explore, research, and present options** so the user can make informed decisions. Ask questions. Present trade-offs. Think out loud. This is a collaborative brainstorm.

## Context

PIA (Project Intelligence Agent) is a Node.js/TypeScript system for orchestrating AI agents across multiple machines. It currently runs as:
- A **Node.js API server** (Express, port 3000)
- **HTML dashboards** served as static files (Mission Control, Visor, Admin Panel, etc.)
- A **SQLite database** for local data
- A **WebSocket server** for real-time updates
- **PTY wrapper** (node-pty) for spawning and controlling local terminal sessions
- A **cross-machine relay** for machine-to-machine communication

The repository is at: `https://github.com/Sodaworld2/pia-system.git`

### The vision

Instead of developers doing `git clone` → `npm install` → `npm start`, we want people to **download a desktop app**, double-click it, and PIA just works. Like how you download Slack, Discord, or VS Code.

The app should work on **Windows** (primary), **Mac** (secondary), and ideally **Linux**.

Each machine that runs the PIA app is an **equal peer** — no machine is the boss. A central control system (Mission Control) can connect to and manage all machines.

### What the app needs to do

1. Run the Node.js API server internally (no separate terminal needed)
2. Display the Mission Control dashboard as the main app window
3. Spawn and manage AI agents (Claude SDK, PTY sessions)
4. Run in the system tray / background
5. Connect to other PIA instances on other machines
6. Auto-update when new versions are released
7. First-run setup wizard (machine name, connect to peers, API keys)
8. Settings screen (replaces manually editing `.env` files)

---

## What I need you to explore

### 1. Electron vs Tauri vs Other Options

Research and compare these desktop app frameworks for PIA's specific needs:

**Electron:**
- How does it work? What are the trade-offs?
- App size implications (Chromium bundled)
- Memory usage
- How does VS Code / Slack / Discord handle it?
- Can it run node-pty and better-sqlite3 (native Node modules)?
- Auto-update mechanisms (electron-updater, Squirrel, etc.)

**Tauri:**
- How does it differ from Electron?
- Can it run a full Node.js backend internally, or only Rust?
- How would PIA's Node.js server work inside Tauri?
- Native module support (node-pty, better-sqlite3)?
- App size comparison

**Other options to consider:**
- **Neutralinojs** — lightweight alternative
- **PKG / nexe** — compile Node.js to a single executable (no UI wrapper, just a server that opens the browser)
- **Progressive Web App (PWA)** — install from browser, no wrapper needed
- **NWJS (Node-Webkit)** — older alternative to Electron

For each option, evaluate:
- Can it run PIA's Node.js server internally?
- Can it handle native modules (node-pty, better-sqlite3)?
- App size on disk
- Memory usage at runtime
- Cross-platform support (Windows, Mac, Linux)
- Auto-update capability
- Developer ecosystem / community / long-term viability
- Time to build a working prototype

**Present your recommendation with reasoning.**

### 2. Architecture Questions

Think through and present options for these:

**How does the Node.js server run inside the app?**
- Does it run in the main process or a child process?
- What happens if the server crashes? Auto-restart?
- How do we handle port conflicts (what if port 3000 is already in use)?
- Should the app find a free port automatically?

**How do native modules work?**
- `node-pty` — needs to compile against the right Node.js version
- `better-sqlite3` — same issue
- `@anthropic-ai/claude-agent-sdk` — does it have native dependencies?
- How do we handle `npm rebuild` for the packaged app?
- What about pre-built binaries (prebuild, node-pre-gyp)?

**How does the UI work?**
- PIA already has HTML dashboards — do we just load them in the app window?
- Or do we build a new UI with React/Vue/Svelte?
- Can we keep the existing HTML and progressively enhance it?
- Multiple windows? (Mission Control in one, Terminal in another)
- Tab system inside the app?

**How does auto-update work?**
- Where do we host updates? (GitHub Releases, S3, custom server)
- Differential updates or full download?
- What about database migrations when updating?
- Can users opt out of updates?
- How to handle breaking changes?

### 3. Installation & Onboarding

Think through the first-run experience:

**Installation:**
- What does the installer look like on Windows? (.exe, .msi, MSIX, portable?)
- What about Mac? (.dmg, .pkg, Mac App Store?)
- Should we offer a portable/no-install version?
- Code signing — do we need certificates? What does it cost?
- Without code signing, users get "Windows protected your PC" warnings — how to handle?

**First-run wizard:**
- What information do we need from the user?
  - Machine name
  - API keys (Anthropic, etc.)
  - Connect to other machines? (Tailscale, direct IP, join code)
  - Working directory / project folder
- How to make this simple for non-technical users?
- Can we detect things automatically? (hostname, Tailscale IP, available ports)

**Settings screen:**
- What should be configurable from the UI vs requiring a restart?
- Hot-reload config changes?
- Import/export settings between machines?

### 4. Challenges & Risks

Think about what could go wrong:

**Technical challenges:**
- Native module compilation across platforms
- App signing and notarization (Apple is strict)
- Antivirus false positives on Windows (Electron apps sometimes trigger these)
- Firewall issues when machines try to connect to each other
- Large app size (Electron bundles Chromium ~150MB+)
- Memory usage (Electron + Node.js server + agents can be heavy)

**Product challenges:**
- How to handle updates that require database migrations?
- What if the user is running an old version and tries to connect to a new version?
- How to handle multiple PIA instances on the same machine?
- What about users who still want the developer/CLI experience?

**Security challenges:**
- Storing API keys securely in the app (not plain text .env)
- Should we use the OS keychain (Windows Credential Manager, macOS Keychain)?
- How to handle authentication between PIA instances?
- What about users on shared/public networks?

### 5. Build & Distribution Pipeline

How do we go from code to downloadable app?

- CI/CD pipeline (GitHub Actions?)
- Building for Windows, Mac, Linux from one codebase
- Versioning strategy (semver, auto-increment, etc.)
- Where to host downloads (GitHub Releases, own website, etc.)
- How to handle beta/preview versions?
- Size optimization (tree-shaking, excluding dev dependencies, etc.)

### 6. Timeline & Phases

Propose a phased approach:

**Phase 1 — MVP (what's the minimum to get a working app?)**
- What can we skip for now?
- What's absolutely required?
- How long would this take?

**Phase 2 — Production-ready**
- What needs to happen before real users can use it?
- Auto-update, settings UI, proper installer

**Phase 3 — Polish**
- What makes it feel like a real product?
- System tray, notifications, multi-window, themes

---

## How to present your findings

Structure your response as:

1. **Executive Summary** — 3-5 bullet points of key decisions the user needs to make
2. **Framework Comparison** — table comparing options with your recommendation
3. **Architecture Proposal** — how the app would be structured
4. **Challenges & Mitigations** — what could go wrong and how to handle it
5. **Phased Roadmap** — what to build first, second, third
6. **Questions for the User** — things you need the user to decide before we start building

**Ask the user questions throughout.** This is a conversation, not a report. If you need to know about their users, their timeline, their budget, their priorities — ask.

---

## Key files to read in the PIA repository

To understand what you're wrapping, read these:

| File | What it tells you |
|---|---|
| `package.json` | Dependencies, scripts, Node version requirement |
| `src/config.ts` | All configuration options and env vars |
| `src/api/server.ts` | How the Express server is created and started |
| `src/index.ts` | The main entry point |
| `public/mission-control.html` | The primary dashboard UI |
| `public/index.html` | The main landing page |
| `src/tunnel/pty-wrapper.ts` | Native module usage (node-pty) |
| `src/db/database.ts` | Native module usage (better-sqlite3) |
| `Dockerfile` | How PIA is containerized (similar concerns to desktop packaging) |
| `CLAUDE.md` | Project overview and conventions |

---
