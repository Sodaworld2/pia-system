# Session Journal — 2026-02-24

---

## Session 1: Amama Jazz Club — Full Project Scoping + Knowledge Index

### Context
First deep-dive session on the Amama Jazz Club project. Agent BILLIE (named after Billie Holiday) introduced as the dedicated agent for this project. Full scoping of the Amama platform, PIA soul agent team, and Sodaworld white-label architecture completed. Knowledge indexed and documented.

### What Was Learned & Indexed

#### Amama Jazz Club — Venue Identity
- **Type:** Small, intimate jazz venue in Tel Aviv, Israel
- **Owner:** World-renowned double bassist (one of the great jazz performers of the last 20 years)
- **Purpose:** Soft-launch venue for the SodaWorld platform (target: end of February 2026)
- **Platform hard launch:** End of March 2026
- **Vibe:** Charming, intimate, world-class jazz

#### Sodaworld White-Label — What’s Already Built for Amama
Sodaworld already has Amama as a fully configured white-label deployment. DO NOT rebuild anything below:

| Feature | Status | Location in sodaworld |
|---|---|---|
| Amama theme (gold #f5d742 / near-black / Playfair Display + Space Mono) | ✅ DONE | `src/themes/venueThemes.ts` |
| Build command `npm run build:amama` | ✅ DONE | `package.json` |
| `.env.amama` config file | ✅ DONE | `sodaworld/.env.amama` |
| Jazz Cat bot (jazz host, bilingual Hebrew+English) | ✅ DONE | `src/config/venue.ts` |
| Venue seed scripts | ✅ DONE | `scripts/seed-amama-venue.mjs`, `scripts/seed-amama-real-events.mjs`, `scripts/seed-amama-upcoming-events.mjs` |
| Live URL: `amama-jazz-room.web.app` | ✅ DEPLOYED | Firebase Hosting |
| Firebase project: `sodaworld-de88e` (shared) | ✅ DONE | `.env.amama` |
| Venue slug: `amama-jazz-room` | ✅ DONE | `.env.amama` |
| Venue mode: `standalone` | ✅ DONE | `.env.amama` |
| Google Analytics: `G-H19CEPPELD` | ✅ DONE | `.env.amama` |
| Ticketing + Stripe (full checkout, webhooks, vouchers, group buys) | ✅ DONE | `functions/src/stripe/` |
| Screen system (physical venue displays, WebSocket real-time) | ✅ DONE | `src/pages/ScreenPage.tsx`, `src/components/screens/` |
| Smart TV apps (LG WebOS + Samsung Tizen) | ✅ DONE | `tv-apps/webos/`, `tv-apps/tizen/` |
| WebXR / VR (Meta Quest 3, 33 components) | ✅ DONE | `src/components/vr/` |
| Venue content upload / crowd-sourcing (“Claispile” workflow) | ✅ DONE | `src/components/venue/AddVenueContentModal.tsx`, `VenueContentGrid.tsx` |
| Artist pages | ✅ DONE | `src/pages/artist/`, `PublicArtistsPage.tsx`, `ArtistDashboardPage.tsx` |
| Chat + discussions | ✅ DONE | `src/components/comments/CommentFeed.tsx`, `UnifiedChatFeed.tsx` |
| Gamification (tokens, leaderboards, badges, achievements) | ✅ DONE | `functions/src/gamification/` |
| Archiving (Admin Vault, VOD management) | ✅ DONE | `src/pages/AdminVaultPage.tsx` |
| Google Sheets event calendar | ✅ CONFIGURED | Seed scripts read from Sheets |

#### White-Label Architecture Decision
- **Amama does NOT fork sodaworld**
- **Amama BUILDS FROM sodaworld** via `npm run build:amama`
- The `Amama-Jazz-Venue-` repo holds ONLY: config files, knowledge docs, PIA agent configs, seed data
- All platform improvements stay in sodaworld upstream
- **Technical term:** Config-driven white-label deployment
- **Backporting:** Any improvement made for Amama gets PR’d back to sodaworld upstream

#### PIA Soul Agent Team Assigned to Amama
| Soul | Role for Amama | Machine | Notes |
|---|---|---|---|
| **Farcake** | Artist research — verified, cross-referenced | M3 (Yeti) | Produces research structured for Andy |
| **Andy** | Event descriptions + editorials | M3 (Yeti) | Preserves venue’s voice; needs voice samples |
| **bird_fountain** (Bird Foundation) | Event flier batch production | M2 (Monster-Hunter) | Multi-format: Instagram, WhatsApp, print, screen |
| **Ziggi** | Quality gate for all outputs (8/10+) | M2 (Monster-Hunter) | Nothing ships without Ziggi sign-off |
| **Fisher2050** | Invisible orchestrator — schedules pipeline per event | M1 (Hub) | Runs 9am standup + 6pm summary |
| **Wingspan** | Pitch deck for website takeover proposal | M3 (Yeti) | Creates Amama pitch to take over their site |
| **Tim Buc** | Archives all content — IS the “chat discussions repository” | M1 (Hub) | Every research report, draft, flier batch filed |
| **Eliyahu** | Surfaces patterns from accumulated data over time | M1 (Hub) | Gets smarter as more events are archived |
| **Controller** | Entry point for all agent requests | M1 (Hub) | Route all Amama requests through Controller |

#### “Claispile” = Venue Content Uploader (CLARIFIED)
“Claispile” is the **venue uploader** — staff and attendees upload content (photos, videos) to the chat and timeline. This already exists in sodaworld:
- Upload UI: `src/components/venue/AddVenueContentModal.tsx` (tabs: Upload / Social URL / Vault)
- Display: `src/components/venue/VenueContentGrid.tsx` (Pinterest-style masonry gallery)
- Moderation: `src/components/venue/VenueContentModeration.tsx`
- Workflow: Upload → Moderation queue → Approved → Appears in venue timeline + chat
- No new soul needed — it’s a WORKFLOW, not an agent

#### Automated Event Pipeline Designed
```
New Event Added → Fisher2050 schedules:
  Day -7:  Farcake researches artist (M3) — verified, cross-referenced
  Day -6:  Tim Buc archives research to Records DB
  Day -5:  Andy writes event description + editorial (M3, in venue voice)
  Day -4:  Bird Foundation creates flier batch (M2):
           → Instagram story (1080×1920)
           → Instagram feed post (1080×1080)
           → WhatsApp status (1440×1440)
           → Venue screen display
           → Print PDF (A3)
  Day -4:  Ziggi reviews all outputs — must be 8/10+
  Day -3:  Delivery package to venue for approval
  Day -1:  Final reminder content
  Day  0:  Live event → Screen system activates, VR room opens
  Day +1:  Tim Buc archives all content + audience analytics
  Day +7:  Eliyahu surfaces insights for next event planning
```

#### Data Flywheel Reasoning (Why Build Now)
- Each event generates: artist research, editorial, 5 flier formats, audience data, recordings
- Tim Buc files everything → Eliyahu spots patterns → outputs get better automatically
- Building infrastructure NOW because data accumulation starts from Event 1
- Compound value: 50 events = 50 artist profiles + 50 editorials + 250 flier assets + patterns
- This intelligence makes the 51st event faster, cheaper, and better than the 1st

#### Amama Repo Setup
- **Location:** `C:/Users/mic/Downloads/Amama-Jazz-Venue-`
- **Remote:** `https://github.com/Sodaworld2/Amama-Jazz-Venue-.git`
- **Status when found:** Empty (just .git and .gitattributes)
- **What was created this session:** Full knowledge base + agent config files

### Files Created This Session

| File | Location | Purpose |
|---|---|---|
| `AMAMA_KNOWLEDGE_BASE.md` | `Amama-Jazz-Venue-/` | Master KB — venue, tech, agents, events |
| `CLAUDE.md` | `Amama-Jazz-Venue-/` | Agent onboarding — any agent reads this first |
| `AMAMA_AGENT_PLAYBOOK.md` | `Amama-Jazz-Venue-/` | How each soul serves Amama |
| `AMAMA_DEPLOYMENT.md` | `Amama-Jazz-Venue-/` | Build + deploy commands |
| `pia-config.json` | `Amama-Jazz-Venue-/` | PIA hub registration |
| `agents/event-pipeline.md` | `Amama-Jazz-Venue-/agents/` | Full 7-day automated event workflow |
| `agents/farcake-brief.md` | `Amama-Jazz-Venue-/agents/` | Jazz artist research instructions |
| `agents/andy-voice-samples.md` | `Amama-Jazz-Venue-/agents/` | Amama’s voice for content writing |
| `agents/bird-foundation-brand-kit.md` | `Amama-Jazz-Venue-/agents/` | Brand assets for flier production |
| `agents/claispile-config.md` | `Amama-Jazz-Venue-/agents/` | Venue uploader workflow |
| `proposals/amama-pitch-brief.md` | `Amama-Jazz-Venue-/proposals/` | Wingspan brief for website pitch |

### Open Items
- **Amama’s current website URL** — not found in any documents. Needed for the website mirror + Wingspan pitch. Ask the user.
- **Voice samples for Andy** — need actual past event descriptions or social posts from Amama to train Andy’s voice matching

### Desktop App Impact
No direct impact. These are knowledge/config files in a separate repo. The Amama-specific build (`npm run build:amama`) and Firebase deployment remain unchanged.

---

## Session 2: Voice Notes — Hold-to-Record Transcription for PIA

### Context
Added voice as an input channel for PIA. Hold-to-record on dashboard or phone, audio gets transcribed via OpenAI Whisper API, transcript auto-sent to the active agent. Standalone mobile page for recording on the go.

### Changes
- **New service**: `src/services/transcription-service.ts` — Whisper API transcription with swappable provider interface (OpenAI now, local GPU on M2 later). Uses Node 20 built-in `fetch`/`FormData`/`Blob` — zero new npm deps.
- **New endpoint**: `POST /api/voice-notes/transcribe` — accepts base64 audio, transcribes via Whisper, stores in SQLite, returns transcript
- **New endpoint**: `GET /api/voice-notes` — list recent voice notes (paginated)
- **New endpoint**: `GET /api/voice-notes/:id` — single voice note
- **New endpoint**: `DELETE /api/voice-notes/:id` — delete a voice note
- **Migration 052**: `voice_notes` table (id, transcript, duration_seconds, audio_size_bytes, language, source, model, cost_usd, agent_id, metadata, created_at)
- **Dashboard mic button (terminal bar)**: Hold to record → release → transcribe → auto-send to active agent as `> 🎤 [text]`
- **Dashboard mic button (header)**: Quick voice notes stored but not sent to an agent
- **New page**: `public/voice-notes.html` — mobile-friendly standalone recording page with agent selector dropdown
- **Route mount**: `/api/voice-notes` registered in `server.ts`

### Files Changed
| File | Change |
|---|---|
| `src/services/transcription-service.ts` | **NEW** — Whisper API provider + LocalWhisperProvider stub + singleton |
| `src/api/routes/voice-notes.ts` | **NEW** — 4 REST endpoints (transcribe, list, get, delete) |
| `public/voice-notes.html` | **NEW** — Mobile-first hold-to-record page, dark PIA theme |
| `src/db/database.ts` | Added migration `052_voice_notes` |
| `src/api/server.ts` | Import + mount `voiceNotesRouter` at `/api/voice-notes` |
| `public/mission-control.html` | Mic buttons (terminal bar + header), recording JS, pulsing red CSS, Voice Notes link |

### API Contract
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/voice-notes/transcribe` | `{ audio, mimeType?, source? }` | `{ success, id, transcript, duration, language, cost }` |
| GET | `/api/voice-notes?limit=N` | — | `{ notes: [...] }` |
| GET | `/api/voice-notes/:id` | — | `{ note: {...} }` |
| DELETE | `/api/voice-notes/:id` | — | `{ deleted: true }` |

### Key Design Decisions
- **Audio as base64 in JSON** — reuses existing `express.json({ limit: '10mb' })`. 2 min of webm/opus ≈ 720KB base64. No multipart needed.
- **No new npm deps** — Node 20 built-in `fetch`, `FormData`, `Blob` for Whisper API calls. Existing `nanoid`, `better-sqlite3`, `express` for the rest.
- **Provider interface** — `LocalWhisperProvider` stub ready for when M2 gets local GPU Whisper. Priority: local first (free), then OpenAI.
- **Reuses existing agent pipeline** — after transcription, dashboard calls `sendTerminalInput()` which hits `POST /api/mc/agents/:id/respond`. No new WebSocket events.
- **Safari support** — mobile page detects `audio/webm` vs `audio/mp4` mime type for iOS compatibility.

### Desktop App Impact
New API endpoints and a new HTML page need to be ported to the React UI. The `voice_notes` table is a new migration. No native dependencies added — all browser APIs (MediaRecorder, getUserMedia).
