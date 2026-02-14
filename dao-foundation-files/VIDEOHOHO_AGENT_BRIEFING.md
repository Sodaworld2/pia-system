# VIDEOHOHO - Enterprise Build Agent Briefing

> **Target Machine**: soda-yeti (100.102.217.69) via Tailscale
> **Project Path**: `C:\Users\User\Documents\GitHub\Videohoho`
> **PIA Dashboard**: http://100.102.217.69:3000
> **PTY Session**: `HcEXHYVhqDI5OB-kaLreN` (PowerShell)
> **Date**: 2026-02-13

---

## 1. AUTONOMOUS OPERATION RULES

**ZERO QUESTIONS POLICY**: Never ask the user questions. Make decisions autonomously.

### Decision Framework
- When multiple approaches exist: choose the most standard/maintainable one
- When unclear about requirements: implement the most reasonable interpretation
- When errors occur: fix them immediately, try 3 approaches before escalating
- When blocked: document the blocker and move to next task
- When tests fail: fix the root cause, don't skip tests

### Autonomous Behavior
1. Read all relevant files BEFORE making changes
2. Run tests after EVERY significant change
3. Commit working code frequently with descriptive messages
4. Never leave broken code uncommitted
5. Document decisions in code comments when non-obvious
6. Use existing patterns in the codebase - don't reinvent

---

## 2. PROJECT OVERVIEW

**Videohoho** is an Electron desktop application for smart video+audio merging with professional fades. Think of it as a lightweight DaVinci Resolve for quick video+audio compositions.

### Tech Stack
| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend | React 18 + TypeScript | 18.3.1 |
| Bundler | Vite | 6.2.2 |
| CSS | Tailwind CSS v4 | 4.1.1 |
| Desktop | Electron | 35.2.1 |
| Video | FFmpeg (via MCP + IPC) | 8.0.1 |
| MCP | video-audio-mcp (Python) | Custom fork |
| State | useState (upgrading to Zustand) | - |
| Package | electron-builder | 26.0.12 |

### Current State (End of Session 6)
- **Core merge flow**: COMPLETE and E2E tested
- **Video+Audio**: Drag-drop, preview, fade controls, volume, trim, export - all working
- **6 bugs fixed**: including crossfade, volume, button states, export paths
- **Test artifacts**: 42.85MB test-output.mp4 (proven working merge, 120.4s, 1280x720)
- **Git**: All source committed, pushed to `https://github.com/Sodaworld2/Videohoho.git`

---

## 3. ENVIRONMENT ON SODA-YETI

### Software Installed
- **Node.js** v22.17.0
- **npm** 10.9.2
- **Python** 3.11.9
- **FFmpeg** 8.0.1 (full build, gyan.dev)
- **git** 2.49.0
- **Claude Code** (npm global)
- **uv** 0.10.2 at `C:\Users\User\AppData\Roaming\Python\Python311\Scripts\uv.exe`
- **GitHub CLI** (gh) authenticated as Sodaworld2

### Project Setup (ALREADY DONE)
- Repo cloned to `C:\Users\User\Documents\GitHub\Videohoho`
- `npm install` complete (487 packages)
- `video-audio-mcp` cloned inside project directory
- `uv sync` run for Python MCP deps
- `.mcp.json` updated with soda-yeti paths
- `.claude/settings.local.json` deployed with broad permissions
- GitHub auth configured via token

---

## 4. FILE STRUCTURE

```
C:\Users\User\Documents\GitHub\Videohoho\
├── electron/
│   ├── main.ts              # Electron main process (~302 lines)
│   └── preload.ts           # IPC bridge (~50 lines)
├── src/
│   ├── main.tsx             # React entry (10 lines)
│   ├── App.tsx              # Main orchestrator (~301 lines)
│   ├── index.css            # @import "tailwindcss"
│   ├── vite-env.d.ts        # TypeScript declarations
│   └── components/
│       ├── FileUpload.tsx   # Drag-drop + native dialog (121 lines)
│       ├── VideoPreview.tsx # HTML5 video player (49 lines)
│       ├── FadeControls.tsx # Fade sliders (98 lines)
│       └── ExportPanel.tsx  # Export button + progress (52 lines)
├── video-audio-mcp/         # Python FFmpeg MCP server (gitignored)
│   ├── server.py            # 1793 lines - 30+ tools + 2 custom
│   └── ...
├── .mcp.json                # MCP config (updated for soda-yeti)
├── .claude/settings.local.json  # Broad permissions
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── index.html
└── JOURNAL.md               # Full development history (700+ lines)
```

---

## 5. ENTERPRISE MCP RECOMMENDATIONS

The project already has `video-audio-mcp` with 30+ FFmpeg tools. To make this enterprise-level, add these MCPs:

### Tier 1 - Essential (Add Now)

#### A. ElevenLabs TTS MCP (Official)
- **Repo**: https://github.com/elevenlabs/elevenlabs-mcp
- **Install**: `npx @anthropic-ai/create-mcp --name elevenlabs`
- **Purpose**: Text-to-Speech for voiceovers, narration generation
- **Config**:
```json
{
  "elevenlabs": {
    "command": "npx",
    "args": ["-y", "@anthropic-ai/mcp-server-elevenlabs"],
    "env": { "ELEVENLABS_API_KEY": "YOUR_KEY" }
  }
}
```
- **Enterprise Value**: Professional voiceover generation, voice cloning, multi-language narration

#### B. Playwright MCP (Browser Testing)
- **Repo**: https://github.com/microsoft/playwright-mcp
- **Purpose**: Automated E2E testing of the Electron app in browser mode
- **Config**:
```json
{
  "playwright": {
    "command": "npx",
    "args": ["@anthropic-ai/mcp-server-playwright"]
  }
}
```
- **Enterprise Value**: Automated regression testing, screenshot comparison, CI/CD integration

#### C. SQLite MCP (Local Database)
- **Repo**: https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite
- **Purpose**: Project files metadata, user preferences, media library, export history
- **Config**:
```json
{
  "sqlite": {
    "command": "npx",
    "args": ["-y", "@anthropic-ai/mcp-server-sqlite", "--db-path", "./videohoho.db"]
  }
}
```
- **Enterprise Value**: Local-first data persistence, project management, analytics

### Tier 2 - Growth Phase

#### D. Cloudinary MCP (Cloud Media Storage)
- **Repo**: https://github.com/cloudinary/cloudinary-mcp-server
- **Purpose**: Cloud media asset management, CDN delivery, image/video transformations
- **Enterprise Value**: Team sharing, cloud backup, media optimization, thumbnails

#### E. Filesystem MCP (Enhanced File Access)
- **Repo**: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem
- **Purpose**: Safe file system access for media library management
- **Enterprise Value**: Organized media library, project file management

#### F. GitHub MCP (Version Control Integration)
- **Repo**: https://github.com/modelcontextprotocol/servers/tree/main/src/github
- **Purpose**: Issue tracking, PR management, release automation
- **Enterprise Value**: Professional development workflow, team collaboration

### Tier 3 - Enterprise Scale

#### G. Stripe MCP (Payments - when SaaS)
- **Purpose**: Subscription management, usage-based billing for TTS credits
- **Enterprise Value**: Monetization, licensing, team plans

#### H. Sentry MCP (Error Monitoring)
- **Purpose**: Crash reporting, performance monitoring, user session replay
- **Enterprise Value**: Production stability, user experience monitoring

### Recommended .mcp.json (Full Enterprise Stack)
```json
{
  "mcpServers": {
    "video-audio": {
      "command": "C:/Users/User/AppData/Roaming/Python/Python311/Scripts/uv.exe",
      "args": ["--directory", "C:/Users/User/Documents/GitHub/Videohoho/video-audio-mcp", "run", "server.py"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-playwright"]
    },
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-sqlite", "--db-path", "./videohoho.db"]
    }
  }
}
```

---

## 6. BUILD PLAN - Phase 2 Enterprise Features

### Phase 2A: State Management Migration (Priority: HIGH)
**Goal**: Replace useState chaos with Zustand for predictable state

1. Install Zustand: `npm install zustand`
2. Create `src/store/` directory with these stores:
   - `mediaStore.ts` - video/audio file state, metadata, loaded status
   - `fadeStore.ts` - all fade values, volume, trim points
   - `exportStore.ts` - export progress, history, settings
   - `settingsStore.ts` - API keys, preferences, output directory
3. Migrate App.tsx state to stores (reduce from ~301 lines)
4. Add devtools middleware for debugging
5. Test: every component should work identically after migration

### Phase 2B: Settings Panel (Priority: HIGH)
**Goal**: User-configurable settings with persistence

1. Create `src/components/SettingsPanel.tsx`:
   - API key management (ElevenLabs, Cloudinary)
   - Default output directory picker
   - Default fade values
   - Theme preference
   - FFmpeg path override
2. Create `src/components/SettingsButton.tsx` (gear icon, top-right)
3. Persist settings to localStorage (later to SQLite)
4. Add keyboard shortcut: Ctrl+, to open settings

### Phase 2C: Text-to-Speech Integration (Priority: HIGH)
**Goal**: Generate voiceovers from text directly in the app

1. Create `src/components/TTSPanel.tsx`:
   - Text input area (multi-line)
   - Voice selector dropdown (from ElevenLabs API)
   - Generate button with progress
   - Preview generated audio
   - "Use as Audio" button to load into the merge pipeline
2. Create `src/services/tts.ts`:
   - ElevenLabs API client
   - Voice listing, text-to-speech generation
   - Audio file caching
3. Wire into App.tsx alongside existing audio upload
4. Add rate limiting and cost estimation

### Phase 2D: Caption/Subtitle System (Priority: MEDIUM)
**Goal**: Auto-generate and burn subtitles into video

1. Create `src/components/CaptionEditor.tsx`:
   - Timeline-synced caption editor
   - Auto-generate from audio (Whisper API or ElevenLabs transcription)
   - Manual edit capability
   - Font/color/position controls
2. Create `src/services/captions.ts`:
   - SRT/VTT generation
   - Whisper API integration
   - Caption timing adjustment
3. Add FFmpeg subtitle burn command to video-audio-mcp or IPC
4. Preview captions overlaid on video

### Phase 2E: Audio Ducking (Priority: MEDIUM)
**Goal**: Automatically lower music when voiceover is playing

1. Add ducking controls to FadeControls.tsx:
   - Duck amount slider (0-100%)
   - Duck attack/release time
   - Threshold level
2. Implement in FFmpeg via sidechaincompress filter
3. Add to video-audio-mcp as `apply_audio_ducking` tool
4. Real-time waveform preview showing ducking effect

### Phase 2F: Keyboard Shortcuts (Priority: MEDIUM)
**Goal**: Professional-grade keyboard navigation

1. Install `react-hotkeys-hook` or use native event listeners
2. Shortcuts:
   - `Ctrl+E` - Export
   - `Ctrl+O` - Open video
   - `Ctrl+Shift+O` - Open audio
   - `Space` - Play/pause preview
   - `Ctrl+,` - Settings
   - `Ctrl+Z` - Undo (requires state history)
   - `Ctrl+S` - Save project
3. Show shortcuts in tooltips and settings panel

### Phase 2G: Project Save/Load (Priority: MEDIUM)
**Goal**: Save and restore complete project state

1. Create `src/services/project.ts`:
   - Serialize full state to JSON
   - Include file paths, fade values, captions, settings
   - Version the format for future compatibility
2. Add project file (.vhp) association with Electron
3. Recent projects list on startup
4. Auto-save every 60 seconds

---

## 7. TESTING STRATEGY

### Browser Testing (Vite Dev Mode)
```bash
npm run dev
# Opens at http://localhost:5173
# Test UI in browser (no Electron features)
```

### Electron Testing
```bash
npm run build
npx electron .
# Full desktop app with FFmpeg IPC
```

### Automated E2E (via Playwright MCP)
- Screenshot comparison for UI regression
- File upload flow testing
- Export flow testing
- Settings persistence testing

### Unit Tests (add Vitest)
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```
- Store tests (Zustand)
- Service tests (TTS, captions, project)
- Component tests (renders, interactions)

---

## 8. KEY PATTERNS IN CODEBASE

### FFmpeg IPC Pattern (electron/main.ts)
```typescript
ipcMain.handle('merge-video-audio', async (_event, config: MergeConfig) => {
  // FFmpeg command construction
  // Progress reporting via event emitter
  // Returns output path
});
```

### File Loading Pattern (App.tsx)
```typescript
const handleVideoSelect = (file: File) => {
  setVideoFile(file);
  // Uses local-media:// protocol for Electron preview
  // Falls back to URL.createObjectURL for browser
};
```

### MCP Tool Usage Pattern
The video-audio-mcp exposes 30+ tools. Key ones:
- `merge_video_and_audio` - Core merge with fades
- `get_media_info` - FFprobe metadata extraction
- `trim_video`, `trim_audio` - Cut segments
- `add_text_overlay` - Text on video
- `extract_audio` - Strip audio from video
- `adjust_volume` - Volume normalization

---

## 9. KNOWN ISSUES TO FIX

1. **No state management** - App.tsx has ~15 useState hooks, needs Zustand
2. **No error boundaries** - Crashes show white screen
3. **No loading states** - Some operations feel unresponsive
4. **No undo/redo** - Users can't reverse actions
5. **Hardcoded paths** - Some FFmpeg paths are hardcoded to dev machine
6. **No project persistence** - Lose all work on close
7. **No automated tests** - Only manual E2E testing done so far
8. **Large test files in repo** - test-output.mp4 (31MB) and test-output-v2.mp4 (5MB) are committed

---

## 10. SUCCESS CRITERIA

The build is successful when:
- [ ] Zustand stores replace all useState in App.tsx
- [ ] Settings panel works with persistence
- [ ] TTS integration generates audio from text
- [ ] Keyboard shortcuts work
- [ ] At least 10 unit tests pass
- [ ] Project save/load works
- [ ] Caption editor generates subtitles
- [ ] Audio ducking works
- [ ] Dev server runs without errors on soda-yeti
- [ ] All features tested in browser (http://localhost:5173)

---

## 11. COMMANDS REFERENCE

```bash
# Development
npm run dev                    # Start Vite dev server
npm run build                  # Build for production
npm run preview                # Preview production build

# Testing
npx vitest                     # Run unit tests
npx vitest --watch             # Watch mode

# Git
git add -A; git commit -m "feat: description"
git push origin main

# MCP
uv --directory video-audio-mcp run server.py  # Start MCP server

# FFmpeg
ffmpeg -version                # Verify FFmpeg
ffprobe -i video.mp4           # Inspect media file
```

---

## 12. CONTACT & ESCALATION

- **GitHub**: https://github.com/Sodaworld2/Videohoho
- **PIA Hub**: http://100.73.133.3:3000 (Machine #1 - Izzit7)
- **This Machine**: http://100.102.217.69:3000 (soda-yeti)
- **Report progress**: Update JOURNAL.md at end of each session
