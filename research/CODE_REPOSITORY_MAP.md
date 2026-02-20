# Code Repository Map — Complete Ecosystem
**Generated**: 2026-02-20
**Scout**: PIA repository scout agent

---

## Summary

**Total apps/repos found**: 26 codebases (plus ~8 stub/HTML-only micro-sites)
**With GitHub remotes**: 14 repos (all under Sodaworld2 org or NotJordanZA)
**Active codebases with real code**: 16
**Documentation/knowledge-only folders**: 4 (SmartAgent, sheba, sodalabs/farcake, sodalabs/andy/soda-academy — no code, just docs)
**Electron apps**: 1 (Videohoho)
**React Native / Expo apps**: 2 (SodaRoid, Farcake2025 mobile)
**Python/FastAPI backends**: 1 (Farcake2025 API)
**Node/Express servers**: 3 (PIA, Fisher2050, sodaworld control-server)
**Firebase-backed web apps**: ~8

---

## Active Repositories (with git remote)

| Repo | Local Path | GitHub URL | Description | Stack | Last Commit |
|------|-----------|-----------|-------------|-------|-------------|
| pia-system | `C:\Users\mic\Downloads\pia-system` | https://github.com/Sodaworld2/pia-system | Multi-machine AI agent orchestration supervisor | Express + TypeScript + SQLite + Claude Agent SDK | Active (2026-02) |
| sodaworld | `C:\Users\mic\Downloads\sodaworld` | https://github.com/Sodaworld2/sodaworld | SodaWorld live streaming platform — main product | React 19 + TypeScript + Vite + Firebase + Mux | Active (2026-02) |
| sodalabs | `C:\Users\mic\Downloads\sodalabs` | https://github.com/NotJordanZA/sodalabs | SodaLabs marketing site + mission control dashboard | React 19 + TypeScript + Vite + Firebase | Active (2026-02) |
| Farcake2025 | `C:\Users\mic\Downloads\Farcake2025` | https://github.com/Sodaworld2/Farcake2025 | Farcake AI CMS monorepo — venue/editorial intelligence | Next.js 14 + FastAPI + PostgreSQL + Redis + React Native | Active (2026-02) |
| sheba | `C:\Users\mic\Downloads\sheba` | https://github.com/Sodaworld2/sheba | Essential Life Services — local-first personal data vault | Architecture/docs only (no code yet); design: SQLite + CRDTs + Automerge | Docs only |
| BirdfountainNov | `C:\Users\mic\Downloads\BirdfountainNov` | https://github.com/Sodaworld2/BirdfountainNov | Bird Fountain AI image review system prototype | React 19 + Vite + TypeScript | Active (2025-11) |
| Videohoho | `C:\Users\mic\Downloads\Videohoho` | https://github.com/Sodaworld2/Videohoho | Smart video + audio merger with fade effects | Electron 33 + React 18 + Vite + Tailwind | Active (2026-02) |
| sodastudio | `C:\Users\mic\Downloads\sodastudio` | https://github.com/Sodaworld2/sodastudio | Soda Studio platform — video management + Google Gemini AI | React 19 + Vite + Firebase + Mux + Google Gemini | Active (2026-02) |
| Sodacast | `C:\Users\mic\Downloads\Sodacast` | https://github.com/Sodaworld2/Sodacast | Soda Cast Interactive — broadcast-themed streaming frontend | React 19 + Vite + TypeScript | Active (2026-02) |
| SodaStubsv2 | `C:\Users\mic\Downloads\SodaStubsv2` | https://github.com/Sodaworld2/SodaStubsv2 | Unknown — empty working tree (only .git exists, initial commit only) | Unknown | Abandoned? |
| sodaworld-ticketing-mvp | `C:\Users\mic\Downloads\sodaworld-ticketing-mvp` | https://github.com/Sodaworld2/sodaworld.git (same remote as sodaworld?) | SodaWorld virtual channel + ticketing + gamification | React + Vite + Firebase + Mux + Stripe + Vitest + Playwright | Active (2026-02) |
| InvestorDome | `C:\Users\mic\Downloads\InvestorDome` | https://github.com/Sodaworld2/InvestorDome | AI investor CRM + pitch deck hub | React 19 + Vite + Supabase + Google Gemini | Active (2026-02) |
| Video-kiosk-2- | `C:\Users\mic\Downloads\Video-kiosk-2-` | https://github.com/Sodaworld2/Video-kiosk-2-.git | Video booth kiosk — client login + admin | React 19 + Vite + Google Gemini + HLS.js | Active (2026-02) |
| SodaRoid | `C:\Users\mic\Downloads\SodaRoid` | No remote found | SodaRoid companion app — phone + TV sync for live events | React Native 0.81.5 + Expo SDK 54 + Firebase + Zustand + Mux | Active (2026-02) |

---

## Local Apps (no git remote / unknown)

| App | Local Path | Description | Stack | Notes |
|-----|-----------|-------------|-------|-------|
| fisher2050 | `C:\Users\mic\Downloads\pia-system\fisher2050` | Fisher2050 — AI Project Manager for SodaWorld ecosystem | Express + TypeScript + SQLite + node-cron | Sub-project inside pia-system; port 3002; standalone server |
| SmartAgent | `C:\Users\mic\Downloads\SmartAgent` | Personal AI assistant — proactive outreach, scheduled comms, knows Mic's life | Docs/brief only (no code); intended stack: FarCake2025 foundation | Design brief only — not built yet |
| agent_instructions | `C:\Users\mic\Downloads\agent_instructions` | Agent instruction files — processed triggers | Text files only | Not a code project |
| soda Strat | `C:\Users\mic\Downloads\soda Strat` | SodaWorld strategy documents | Docs only | Not a code project |

---

## Agent Apps (standalone versions of PIA agents / agent-adjacent)

| Agent | Local Path | Status | Notes |
|-------|-----------|--------|-------|
| Fisher2050 | `C:\Users\mic\Downloads\pia-system\fisher2050` | Active — Express server on port 3002 | AI Project Manager; own SQLite DB; cron scheduling; part of pia-system monorepo |
| Farcake2025 (full monorepo) | `C:\Users\mic\Downloads\Farcake2025` | Active | 4-app monorepo: FastAPI (Python), Next.js 14, React Native, shared packages. Venue/editorial intelligence agent. 28+ FastAPI routers. |
| SmartAgent | `C:\Users\mic\Downloads\SmartAgent` | Design brief only (not built) | Personal assistant agent — trigger-based proactive messaging; designed to use Farcake2025 as foundation |
| Farcake (sodalabs stub) | `C:\Users\mic\Downloads\sodalabs\farcake` | Empty directory | Placeholder only |
| Andy (sodalabs stub) | `C:\Users\mic\Downloads\sodalabs\andy` | Empty directory | Placeholder only |

---

## Platform Apps

| Platform | Local Path | Description | Integration with PIA |
|----------|-----------|-------------|---------------------|
| SodaWorld main platform | `C:\Users\mic\Downloads\sodaworld` | Live streaming, events, gamification, comments, Mux video. 6 agent task files + orchestrator. Firebase jhblive-c8549 | Firebase-first — separate from PIA. Has its own control-server (port auto-find) |
| SodaLabs mission control | `C:\Users\mic\Downloads\sodalabs` | SodaLabs agency site + React 19 mission control dashboard. Camera monitoring, event management, Google Calendar integration. Firebase. | Separate from PIA. Uses `ts/` as the main dashboard. |
| sodastudio | `C:\Users\mic\Downloads\sodastudio` | Soda Studio video platform with Google Gemini AI. Firebase sodaworld-de88e | Shares Firebase project with sodaworld |
| sodaworld-ticketing-mvp | `C:\Users\mic\Downloads\sodaworld-ticketing-mvp` | Full virtual channel platform — ticketing, Stripe payments, gamification, Mux streaming | Overlaps heavily with sodaworld main — likely a development branch/MVP variant |
| InvestorDome | `C:\Users\mic\Downloads\InvestorDome` | AI investor CRM + 4 live pitch deck URLs. Supabase backend. Google Gemini. | Standalone investor tool. Live at investordome.web.app |
| Video-kiosk-2- | `C:\Users\mic\Downloads\Video-kiosk-2-` | Video booth kiosk system — client login, HLS video, Google Gemini AI | Standalone kiosk. Live at video-booth-kiosk GitHub. |
| Videohoho | `C:\Users\mic\Downloads\Videohoho` | Electron desktop app — video + audio merger with fade effects | Fully standalone desktop tool |
| BirdfountainNov | `C:\Users\mic\Downloads\BirdfountainNov` | Bird Fountain AI image review system prototype. React 19. | Standalone UI prototype. Not connected to PIA or Firebase. |
| Sodacast | `C:\Users\mic\Downloads\Sodacast` | Soda Cast Interactive — broadcast-themed streaming teaser/demo page | Standalone marketing page, minimal code |
| SodaRoid | `C:\Users\mic\Downloads\SodaRoid` | SodaRoid: Android phone app + Android TV app for SodaWorld live events | Companion to sodaworld platform. Firebase sodaworld-de88e. No git remote locally. |

---

## SodaLabs Sub-Agents (HTML-only, marketing pages)

These live inside `C:\Users\mic\Downloads\sodalabs\` and are static HTML files deployed to Firebase Hosting (`sodalabs-ai.web.app`). They are NOT standalone codebases — they are product pages within the sodalabs monorepo.

| Page | File | Description |
|------|------|-------------|
| SodaLabs home | `index.html` | "AI Workforce for Agencies — 12 Trained AI Agents" |
| SodaLabs agents showcase | `home.html` | Agent workforce marketing overview |
| GumballCMS | `GumballCMS/gumball.html` + `GumballCMS/index.html` | AI-powered CMS — "Your Website Runs Itself". Saves R1.7M/year vs traditional teams. |
| Bird Fountain | `bird-fountain/bird-fountain.html` | AI image generation — custom-trained graphics AI |
| Bots/Agents | `bots/index.html` | "Soda Agents — Meet Your AI Workforce" |
| Sodacast knowledge | `sodacast/` | Sodacast product bibles (V1–V4), sales deck, knowledge map (docs, not running code) |
| SodaColab | `sodacolab/strategic-meeting.html` | SodaWorld Strategic Positioning |
| Wingspan | `wingspan/wingspan.html` | "Wingspan — Presentation Intelligence" |
| Virginia (sic) | `virgin.html` | Unknown |
| Video | `video.html` | Video showcase |
| Joburg Theatre Projections | `joburg-theatre-projections.html` | Theatre venue content |
| Products overview | `products-overview.html` | SodaLabs products overview |

---

## GitHub Org (Sodaworld2) — All Known Repos

Retrieved from `https://api.github.com/users/Sodaworld2/repos`:

| Repo | Description | Local Clone |
|------|-------------|-------------|
| pia-system | Project Intelligence Agent — supervisor for AI agent fleets | `C:\Users\mic\Downloads\pia-system` |
| sodaworld | Main live streaming platform | `C:\Users\mic\Downloads\sodaworld` |
| Farcake2025 | AI news/media aggregator intelligence CMS | `C:\Users\mic\Downloads\Farcake2025` |
| sheba | Essential Life Services / DAO ecosystem | `C:\Users\mic\Downloads\sheba` |
| BirdfountainNov | AI image review interface | `C:\Users\mic\Downloads\BirdfountainNov` |
| Videohoho | Video+audio merger Electron app | `C:\Users\mic\Downloads\Videohoho` |
| sodastudio | Soda Studio video platform | `C:\Users\mic\Downloads\sodastudio` |
| Sodacast | Soda Cast streaming teaser | `C:\Users\mic\Downloads\Sodacast` |
| SodaStubsv2 | Unknown — initial commit only | `C:\Users\mic\Downloads\SodaStubsv2` (empty) |
| InvestorDome | Investor CRM + pitch decks | `C:\Users\mic\Downloads\InvestorDome` |
| Video-kiosk-2- | Video booth kiosk | `C:\Users\mic\Downloads\Video-kiosk-2-` |
| archivelab | (No local clone found) | — |
| caryn-katz | Caryn Katz — Voice & Presence Coach website | — |
| claw | Claw bot | — |
| DAODEN | Treasury DAO | — |
| Experimental | Experimental apps | — |
| Farcake2 | AI news/media aggregator (older version) | — |
| farcakereplit | Farcake Replit version | — |
| Manfred | Manfred the Ace | — |
| MichaelBalkind | Michael Balkind personal website | — |
| personal_assistant- | Mic personal assistant | — |
| RSVP | RSVP for events system | — |
| sodachat | Unknown | — |
| video-booth-kiosk | Video kiosk (duplicate of Video-kiosk-2-?) | — |

Also: `sodalabs` is under `NotJordanZA` org (Jordan is a collaborator), not Sodaworld2.

---

## Sheba — What Is It?

**Local path**: `C:\Users\mic\Downloads\sheba`
**GitHub**: https://github.com/Sodaworld2/sheba
**Status**: Architecture/specification only — no running code yet

Sheba is the design specification for a **local-first personal data sovereignty platform** — described as "Essential Life Services" integrated into the DAO ecosystem. The vision is:

- **Your data is yours** — financial records, photos, documents, commerce, messages, identity
- **Local-first storage**: SQLite (metadata) + Automerge CRDTs (sync) + encrypted file store + key store
- **P2P sync** across devices (phone, desktop, NAS agent)
- **Content-addressed** media (deduplication via hash)
- **AI-enriched** metadata on every item
- **DAO governance integration** — user-owned, decentralized

The `sheba/docs/` folder contains:
1. `DATABASE_SCHEMA.md` — Full SQLite schema (identity, devices, media, documents, financial, contacts, messaging tables)
2. `ESSENTIAL_LIFE_SERVICES_ARCHITECTURE.md` — System architecture diagram, storage layer, sync protocol, operator system, DAO governance, API design, security/encryption, implementation roadmap
3. `KNOWLEDGE_OVERVIEW.html` — Visual knowledge base browser

**Relation to PIA**: Sheba is a separate, longer-term vision project. It does not share code with PIA yet, but could eventually use PIA agents to manage/migrate user data.

---

## GumballCMS — Current State

**Location**: `C:\Users\mic\Downloads\sodalabs\GumballCMS\`
**Status**: Marketing/concept pages only — 2 HTML files

GumballCMS is an **AI-powered CMS product concept** under the SodaLabs brand:
- Tagline: "Your Website Runs Itself"
- Auto-generates graphics, auto-publishes content, auto-optimizes SEO
- Claims to save R1.7M/year vs traditional teams
- Deployed at `sodalabs-ai.web.app/gumball.html`

There is NO backend, NO running code, and NO code implementation in this folder. It is a product marketing page only. The actual CMS implementation, if it exists, would need to be found elsewhere (possibly in Farcake2025's editorial workflow, or not yet built).

---

## SodaRoid — What It Is

**Location**: `C:\Users\mic\Downloads\SodaRoid\`
**Status**: Active development (no git remote found locally)
**Stack**: React Native 0.81.5 + Expo SDK 54 + Firebase + Zustand (24 stores) + EAS Build

SodaRoid is a **two-screen companion app** for SodaWorld live events:
- **Phone app**: Browse events, live chat, trigger visual effects, manage profile
- **TV app**: Big-screen viewing with HLS video (Mux), D-pad navigation, remote phone control
- **Cross-device sync**: Phone ↔ TV via Firebase Firestore real-time listeners
- Shares Firebase project with sodaworld (`sodaworld-de88e`)
- Full EAS build profiles for both Android phone and Android TV

---

## Farcake2025 — Full Architecture

**Location**: `C:\Users\mic\Downloads\Farcake2025\`
**GitHub**: https://github.com/Sodaworld2/Farcake2025
**Stack**: Turborepo monorepo with 4 apps + 3 packages

```
Farcake2025/
├── apps/
│   ├── api/          FastAPI (Python) — 28+ routers, PostgreSQL, Redis, Celery
│   ├── web/          Next.js 14 + TypeScript + TailwindCSS + Framer Motion
│   ├── mobile/       React Native 0.73.2 (older RN, no Expo)
│   └── database/     Alembic migrations
├── packages/
│   ├── types/        Shared TypeScript types
│   └── ...
```

**Purpose**: AI-driven Editorial Intelligence Platform — venue discovery, agency intelligence, multi-project CMS. Philosophy: curated quality over scraped quantity.

Key features: Google Places API, Serper API, Apify (social), Claude AI synthesis, knowledge base generation, editorial workflow.

---

## Sodaworld-ticketing-mvp vs Sodaworld — Clarification

Both `C:\Users\mic\Downloads\sodaworld-ticketing-mvp` and `C:\Users\mic\Downloads\sodaworld` share the same GitHub remote (`https://github.com/Sodaworld2/sodaworld.git`). They appear to be:
- **sodaworld**: Main development branch — React + Vite + Firebase + Mux + control-server + 6-agent architecture
- **sodaworld-ticketing-mvp**: A more complete/newer version — adds Stripe ticketing, Vitest + Playwright testing, Firebase Functions, gamification. Named `sodaworld-virtual-channel` in package.json.

The ticketing-mvp is likely the current active branch, more feature-complete than the sodaworld folder.

---

## Recommended Actions

| App | Recommendation | Priority |
|-----|---------------|----------|
| **pia-system** | Keep as separate repo — this IS the orchestrator | Core — maintain |
| **fisher2050** | Sub-project in pia-system — could become a PIA agent module | Already integrated |
| **sodaworld + sodaworld-ticketing-mvp** | Reconcile the two clones of the same GitHub repo — determine which is the canonical working copy | High |
| **SodaRoid** | Add git remote — currently tracked nowhere locally | High — risk of loss |
| **Farcake2025** | Keep as standalone — complex Python+Node monorepo. Could expose API to PIA for research/intelligence tasks | Medium |
| **SmartAgent** | Build it on top of Farcake2025 foundations + PIA agent infrastructure | High priority feature |
| **sheba** | Long-term vision project — park as architecture doc, revisit when PIA has stable fleet | Low immediate priority |
| **BirdfountainNov** | Standalone prototype — consider integrating Bird Fountain into PIA as an image-generation agent | Medium |
| **Videohoho** | Keep standalone — distinct desktop utility | Keep separate |
| **Sodacast** | Marketing page only — no action needed on code | Low |
| **SodaStubsv2** | Empty repo — either populate or archive | Low |
| **GumballCMS** | Concept only — needs backend implementation; could be built as a PIA agent | Medium |
| **sodalabs** | Marketing/portfolio site — keep maintained by Jordan (NotJordanZA) | Maintain |
| **InvestorDome** | Standalone investor CRM — active and live | Keep separate |
| **Video-kiosk-2-** | Active product — keep standalone | Keep separate |
| **GitHub repos not cloned** (archivelab, caryn-katz, DAODEN, Manfred, personal_assistant-, RSVP, sodachat, Farcake2, Experimental) | Unknown status — need to be cloned and surveyed | Future scout task |
