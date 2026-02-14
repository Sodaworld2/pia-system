# Videohoho - Claude Code Instructions

## Project
Electron desktop app for smart video+audio merging with professional fades. React 18 + Vite + Tailwind v4 + Electron + FFmpeg.

## Environment
- **Machine**: soda-yeti (Windows 11, AMD Ryzen 7 7700X, 32GB RAM)
- **Node**: v22.17.0, npm 10.9.2
- **Python**: 3.11.9
- **FFmpeg**: 8.0.1 (full build)
- **uv**: C:/Users/User/AppData/Roaming/Python/Python311/Scripts/uv.exe

## Key Files
- `src/App.tsx` - Main orchestrator (301 lines, ~15 useState hooks)
- `electron/main.ts` - Electron main process (302 lines, FFmpeg IPC)
- `electron/preload.ts` - IPC bridge (50 lines)
- `src/components/` - FileUpload, VideoPreview, FadeControls, ExportPanel
- `video-audio-mcp/server.py` - Python MCP server (1793 lines, 30+ tools)
- `JOURNAL.md` - Full development history (source of truth)

## Commands
```bash
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # Production build
npx vitest         # Unit tests
```

## MCP Server
The video-audio-mcp provides 30+ FFmpeg tools. Key tools:
- `merge_video_and_audio` - Core merge with fades
- `get_media_info` - FFprobe metadata
- `trim_video`, `trim_audio`, `add_text_overlay`, `extract_audio`

## Rules
1. Read JOURNAL.md before starting any work
2. Read VIDEOHOHO_AGENT_BRIEFING.md for the full build plan
3. Never ask questions - make autonomous decisions
4. Run `npm run dev` and test in browser after changes
5. Commit working code frequently
6. Update JOURNAL.md at end of session
7. Use existing code patterns (check App.tsx for conventions)
8. TypeScript strict mode - no `any` types
9. Tailwind v4 for all styling (no CSS files)
10. Test in browser at http://localhost:5173
