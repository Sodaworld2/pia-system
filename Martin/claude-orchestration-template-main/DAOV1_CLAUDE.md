# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SodaWorld DAO Portal — a full-stack platform for creating and managing Decentralized Autonomous Organizations. Three main codebases live in one repo: a React frontend (root), a Node.js/Express backend (`backend/`), and a Solana smart contract (`solana-dao-program/`). Firebase is used for auth, hosting, Cloud Functions, and Firestore. The backend uses SQLite (via Knex) for relational data.

## Common Commands

### Frontend (run from repo root)
- `npm install` — install dependencies
- `npm run dev` — start Vite dev server (port 5173), proxies `/api` to backend on port 5003
- `npm run build` — production build to `dist/`
- `npm test` — run Vitest in watch mode (jsdom environment)
- `npm test -- --run` — single Vitest run (CI mode)
- `npm run storybook` — component explorer on port 6006

### Backend (run from `backend/`)
- `npm install` — install dependencies
- `npm run dev` — start with nodemon (auto-reload), port 5003
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run compiled output (`dist/index.js`)
- `npm test` — run backend Vitest tests

### E2E Tests (run from repo root, requires frontend running)
- `npm run test:e2e` — all Playwright tests (chromium, firefox, webkit, mobile)
- `npm run test:e2e:auth` — auth flow tests only
- `npm run test:e2e:governance` — governance tests only
- `npm run test:e2e:agreements` — agreement tests only
- `npm run test:e2e:debug` — Playwright debug mode
- `npm run test:e2e:ui` — interactive Playwright UI
- Run a single test file: `npx playwright test tests/e2e/dashboard.spec.ts`
- Run a single test by name: `npx playwright test -g "test name"`

### Solana Program (run from `solana-dao-program/`)
- `anchor build` — compile the Rust program
- `anchor test` — build and run tests on localnet
- `anchor deploy` — deploy to configured cluster (devnet by default)

### Firebase
- `firebase deploy --only hosting` — deploy frontend
- `firebase deploy --only functions` — deploy Cloud Functions
- `firebase deploy --only firestore:rules` — deploy security rules

## Architecture

### Frontend → Backend Data Flow
The Vite dev server proxies `/api/*` requests to `http://localhost:5003`. In production, `VITE_API_URL` points to the deployed backend (Railway). The frontend never holds the Gemini API key — all AI calls go through the backend's `/api/mentor` endpoint.

### Backend Startup Sequence
`backend/src/index.ts` validates environment variables, then sets up middleware in order: Helmet → request timeout → request size validation → CORS → JSON parsing → input sanitization → performance monitoring → request logging → rate limiting → route mounting → global error handler. After Express is ready, it initializes the SQLite database (running pending migrations automatically), then starts backup and maintenance services.

### Database
SQLite database file: `backend/mentor_chats.db`. Schema managed through migration files in `backend/src/database_migrations/` (numbered 007–013+). Migrations run automatically on backend startup via `initializeDatabase()`. Query builder is Knex.

### Authentication
Firebase Authentication with magic links (passwordless email). Frontend uses `useAuth()` hook for auth state. Firestore security rules enforce role-based access (admin, founder, contributor, advisor).

### Solana Integration
The Anchor-based program (`solana-dao-program/programs/soda-dao/src/lib.rs`) handles on-chain DAO state: phase evolution (Firestarter → Organization → Scale), SPL token vesting, and governance records. Program ID on devnet: `HSDzkBnQjhqxoHk4n7JCUmwAe9M6dK4rQvzaLKxT8zPL`. The frontend connects via Solana Wallet Adapter and the `useSodaDao()` hook. IDL files live in `src/idl/`.

### Key Frontend Patterns
- Path alias: `@/` maps to repo root (configured in `tsconfig.json` and `vite.config.ts`)
- Code splitting: Vite manual chunks split vendors (firebase, genai, react) and feature templates (bubbles, agreements, governance, tokens, marketplace, wizard, admin)
- Pages are lazy-loaded via React Router; main routes: `/login`, `/council`, `/admin`, `/sign/:token`
- `WalletContextProvider` wraps the app for Solana wallet state

### Backend API Routes
All mounted under `/api/`: `health`, `mentor` (Gemini AI), `dao`, `treasury`, `agreements` (with sub-routes for founder/advisor/contributor/firstborn), `council`, `milestones`, `signatures`, `contracts`, `bubbles`, `proposals`, `token-distribution`, `tokens`, `marketplace`, `admin`. Admin routes have stricter rate limiting. Health endpoint is rate-limit exempt.

### Cloud Functions
Firebase Functions in `functions/` — handles email (via Resend) and server-side DAO operations. Requires Node 20+.

## Environment Setup

Copy `.env.example` to `.env` at the repo root. Required variables:
- `GEMINI_API_KEY` — Google Gemini API key (backend-only, not `VITE_` prefixed)
- `VITE_FIREBASE_*` — Firebase project config (API key, auth domain, project ID, etc.)
- `VITE_API_URL` — backend URL (defaults to `http://localhost:5003`)
- `VITE_SOLANA_NETWORK` — `devnet`, `testnet`, or `mainnet-beta`
- `VITE_SOLANA_PROGRAM_ID` — deployed program address

The backend also needs its own `.env` in `backend/` with `GEMINI_API_KEY`, `PORT`, `NODE_ENV`, and Firebase config.

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- `tests.yml` — runs unit tests (frontend + backend), API integration tests, E2E tests (matrix across browsers), and visual regression tests
- `playwright.yml` — sharded Playwright E2E with merged reports and PR comments

## Deployment Targets

- **Frontend**: Firebase Hosting (primary), Vercel (configured), Railway
- **Backend**: Railway (primary), Heroku (Procfile present)
- **Solana Program**: Anchor CLI to devnet/testnet/mainnet-beta

## START OF EVERY SESSION (MANDATORY)

At the start of EVERY new conversation, before doing any work, you MUST:

1. **Read the Machine 1 Briefing (if it exists):**
   - **`docs/MACHINE_1_BRIEFING.md`** — Complete project handoff: what the project IS, 8-repo ecosystem, what's built vs planned, gap analysis (35% spec'd), recommended BMAD process, key decisions, what the user wants. START HERE.

2. **Read these two documents:**
   - **`docs/VISION_FEEDBACK_DOC.html`** — The master brain. Contains the full ecosystem map, all architectural decisions, snap/debate lists, agent mesh design, technical glossary, and the master TODO list (86+ items). Read the ecosystem section and TODO list at minimum.
   - **`docs/FULL_UI_INTERFACES.html`** — All 35 screens showing every interface in the system (16 existing + 14 planned + 5 AI module views).

3. **Read the session journal:**
   - **`docs/SESSION_JOURNAL.md`** — Skim sections 6.11-6.20 (latest session) to know what was done last and what's pending.

This is how you "remember." These documents ARE your memory. Always start by loading them.

## CONTINUOUS MEMORY COLLECTION (ALWAYS ON)

You are a knowledge collector. Throughout every conversation, you must capture and persist new information. This is not optional — treat every discussion, decision, idea, research finding, or architectural change as something that MUST be written down before the session ends.

**What counts as new memory (capture ALL of these):**
- Any decision made (technical, design, business, or priority)
- Any new idea discussed, even casually
- Any research performed or findings discovered
- Any architectural change or pattern identified
- Any bug found, fixed, or workaround applied
- Any file created, modified, or deleted
- Any new question raised that needs future resolution
- Any change in priorities or scope
- User preferences, opinions, or corrections

**When to write memory:**
- At the END of every session (mandatory — add a new session section to SESSION_JOURNAL.md)
- When a significant decision is made mid-session (update VISION_FEEDBACK_DOC.html TODO list or add a new section)
- When creating or modifying files (log it)
- Before context gets long — write down what you know so far so a fresh session can pick up

**Where to write it:**
- **`docs/VISION_FEEDBACK_DOC.html`** — Decisions, architecture changes, new TODO items, ecosystem updates, research findings. ALWAYS update the TODO list.
- **`docs/SESSION_JOURNAL.md`** — Chronological record. New session section with: what was discussed, what was built, what files changed, what's next.
- **`docs/KNOWLEDGE_SYSTEM_DIAGRAM.html`** — If knowledge architecture changes.
- **`docs/SYSTEM_WIREFRAMES.html`** — If UI/UX decisions change the wireframes.

**Rule: If you discussed it, write it down. If you built it, log it. If you decided it, record it. No exceptions.**

## Core Architecture Principle: Company of AIs

Every module in the system is a **full autonomous intelligence** — not just a persona with a different prompt. Each has:
- **Private Knowledge Base** — domain-specific expertise (Legal knows contract law, Finance knows accounting, Research knows methodologies)
- **Own Tools & Programs** — specialized instruments (Legal has PDFKit + clause library, Research has Farcake + Firecrawl, Finance has Recharts + vesting calculator)
- **Own Methodologies** — how it approaches problems in its domain
- **Ability to Learn** — improves from every interaction, journals everything
- **Special Abilities** — some email, some scrape the web, some generate documents, some encrypt data
- **Common Language** — all communicate through the Event Bus (BullMQ + Redis) using the `AgentMessage` protocol: `{ from, to, type (task/insight/question/result/alert), payload, context, priority, replyTo }`. This is how they coordinate without coupling.

The user is the **CEO**. The 9 AI modules are **department heads**. PIA is the **COO** that orchestrates. The knowledge base is the **shared company wiki**. The event bus is the **company's communication infrastructure**.

Every module implements the same **Universal Agent Interface**: `processMessage()`, `learn()`, `journal()` + domain-specific tools, programs, triggers, and methodologies. Interconnected Private Knowledge & Methodologies with a Common Protocol.

See `docs/USER_JOURNEYS.html` Section 4 for the full visual diagram.

## Documentation Visual Style

When creating planning/architecture documents, use the dark-themed interactive HTML style established in this project:
- Background: `#0a0a1a`, cards: `#141432`, borders: `#2a2a5a`
- Colors: cyan `#00e5ff`, purple `#b388ff`, green `#69f0ae`, orange `#ffab40`, pink `#ff80ab`, red `#ff5252`, blue `#448aff`, yellow `#ffd740`
- SVG diagrams for architecture/flow visualization (see `docs/SYSTEM_BIRDS_EYE.html` and `docs/USER_JOURNEYS.html` for examples)
- Expandable/interactive sections, fixed top nav, tabbed content
- Keep visuals simple enough for a 6-year-old to follow the general flow

## BMAD Project Management Approach

This project uses **BMAD (BMad Method)** to systematically break down and build every component. The system is too large for one instruction — instead, we use BMAD workflows to deeply work through each module, one at a time, producing implementation-ready specifications.

**How to work through the system:**

1. **Start with `/bmad:bmm:workflows:workflow-init`** — Initialize the BMAD project, set the level and type
2. **For each major module, run this sequence:**
   - `/bmad:bmm:workflows:prd` — Write a Product Requirements Document for the module (what it does, user stories, acceptance criteria)
   - `/bmad:bmm:workflows:architecture` — Make architectural decisions (tech stack, data models, API contracts, integration points)
   - `/bmad:bmm:workflows:create-epics-and-stories` — Break the PRD into bite-sized implementable stories
   - `/bmad:bmm:workflows:sprint-planning` — Organize stories into sprints
   - `/bmad:bmm:workflows:dev-story` — Execute each story (implement, test, validate)
3. **For design questions:** `/bmad:bmm:workflows:create-ux-design` — Deep UX exploration for each screen
4. **For unknowns:** `/bmad:bmm:workflows:domain-research` — Research specific domains (encryption patterns, trust graphs, CRDT sync)
5. **For brainstorming:** `/bmad:bmm:workflows:brainstorm-project` — Open-ended exploration of ideas

**The 9 modules to work through (in build order):**
- Phase 0: Foundation (monorepo, auth, database) — the skeleton
- Phase 1: Knowledge Brain (personal AI, memory, onboarding, knowledge extraction)
- Phase 2: Agent Mesh (orchestration, event bus, background work, notifications)
- Phase 3: Research Module (web scraping, market analysis, Farcake integration)
- Phase 4: Collaboration (agreements AI manager, trust graph, blockchain signatures)
- Phase 5: Vault (encryption, sync, storage operators, Sheba integration)
- Phase 6: Finance + Builder + Governance + Communication + Organization

Each module gets the full BMAD treatment: PRD → Architecture → Epics → Stories → Sprint → Build. Nothing gets built without being properly specified first.

## All Living Documents

- **`docs/VISION_FEEDBACK_DOC.html`** — The master planning document. Contains: vision reframe, technical translations, snap/debate lists, ecosystem map (DAOV1 + Manfred + Farcake + PIA + Sheba), agent mesh architecture, task orchestration design, technical glossary, and the master TODO list (81+ items).
- **`docs/SESSION_JOURNAL.md`** — Complete record of every session's discussions, decisions, files created/modified, research completed, and architectural changes.
- **`docs/FULL_UI_INTERFACES.html`** — Complete visual reference of ALL 35 screens: 16 existing v1, 14 planned v2, 5 module intelligence views. The definitive "what are we building" document.
- **`docs/KNOWLEDGE_SYSTEM_DIAGRAM.html`** — Birds-eye view of the knowledge orchestration system (7 sections).
- **`docs/SYSTEM_WIREFRAMES.html`** — Interactive UI wireframes showing all 8 screens of the product (v2 planned views).
- **`docs/SODAWORLD_V2_MASTERPLAN.html`** — Master plan with site map, personas, journeys, feature matrix, build phases.
- **`docs/SODAWORLD_V2_SYSTEM_DESIGN.html`** — System design with 17 sections covering AI brain, personas, memory, governance, meetings, security.
- **`docs/FROM_SCRATCH_ARCHITECTURE.html`** — Deep architectural rethink: 7-layer architecture, monorepo design, agent runtime, event bus, 6-phase build order, 5 pushbacks on current approach.
- **`docs/USER_JOURNEYS.html`** — Every click path, data interaction, AI module, persona journey, system state, decision point, error path, and gap analysis. The "Company of AIs" architecture diagram lives here.
- **`docs/SYSTEM_BIRDS_EYE.html`** — Simple visual diagrams ("pictures for a 6-year-old") showing the whole system.

## Ecosystem Repositories

SodaWorld is part of a 7-repo ecosystem. When discussing architecture, consider how all systems interconnect:

### Core Platform Repos (The Product)

| Repo | Location | Role |
|------|----------|------|
| **DAOV1** (this repo) | `C:\Users\User\Documents\GitHub\DAOV1` | The Platform — AI brain, governance, agreements, tokens |
| **Manfred** | `C:\Users\User\Documents\GitHub\Manfred` | The Organizer — timeline patterns, semantic search, media processing |
| **Farcake2025** | `C:\Users\User\Documents\GitHub\Farcake2025` | The Researcher — research pipeline, web scraping, knowledge base generation |
| **PIA** | `C:\Users\User\Documents\GitHub\pia-system` | The Orchestrator — task queuing, agent coordination, dependency graphs |
| **Sheba** | `C:\Users\User\Documents\GitHub\sheba` | The Vault — encrypted personal storage, identity, messaging, trust graph, financial records |

### Sibling Repos (Existing Infrastructure to Reuse)

| Repo | Location | Role | What's Reusable |
|------|----------|------|----------------|
| **SodaWorld** | `C:\Users\User\Documents\GitHub\sodaworld` | Live streaming platform (production) | Email system (Resend+SendGrid dual-provider), Notification system (58+ types, multi-channel, FCM push, user preferences, quiet hours), AI/Bot system (Gemini+Claude, knowledge base file processing), Gamification (points/levels/leaderboards), 140+ React hooks, Cloud Functions patterns |
| **SodaLabs** | `C:\Users\User\Documents\GitHub\sodalabs` | Event management dashboard | Email templates (7 types via Resend), Google Calendar integration, Video streaming (Mux+HLS.js), Reminder service (auto 24hr batched), Performance manager (device detection, adaptive rendering) |
| **RiseAtlantis** | `C:\Users\User\Documents\GitHub\riseAtlantisClientPortal` | Client presentation portal | Analytics system (session/event tracking, aggregation, CSV/PDF export, real-time presence), Multi-tenant admin portal (Org→Project→Presentation hierarchy), Invite system (bulk email, expiration, tracking), Access control (3-tier: password+invite+direct, RBAC), Branding system (hierarchical CSS injection), Backend patterns (Express middleware stack, rate limiting, error codes) |

### Key Reusable Files (Copy-Ready from Sibling Repos)

| What | Source File | Use In DAOV1 |
|------|-----------|-------------|
| **Email sending** | `sodaworld/functions/src/email.ts` + `email/` folder | Agreement notifications, digests, morning briefing |
| **Email templates** | `sodalabs/ts/src/services/emailService.ts` | Invite, confirmation, reminder templates |
| **Notification system** | `sodaworld/src/lib/firebase/notifications.ts` | In-app notification infrastructure |
| **Notification types** | `sodaworld/src/types/notifications.ts` | 58+ type definitions to adapt for governance |
| **Notification UI** | `sodaworld/src/components/notifications/` | Bell, panel, list, item components |
| **Push notifications** | `sodaworld/functions/src/push/pushService.ts` | FCM for mobile alerts |
| **Auto-triggers** | `sodaworld/functions/src/auto-notifications.ts` | Event-driven notification dispatch |
| **Calendar** | `sodalabs/ts/src/services/calendarService.ts` | Meeting scheduling for governance |
| **Video/meetings** | `sodalabs/ts/src/services/cameraFeedService.ts` | Meeting recordings, video calls |
| **Reminders** | `sodalabs/ts/src/services/reminderService.ts` | Proposal vote deadlines, agreement expiry |
| **Bot/AI config** | `sodaworld/functions/src/bots/` | AI provider abstraction, KB file processing |
| **Performance** | `sodalabs/ts/src/services/performanceManager.ts` | Device-aware rendering optimization |
| **Cloud fn config** | `sodaworld/functions/src/config.ts` | Standardized function resource allocation |
| **Analytics tracker** | `riseAtlantis/src/services/analyticsTracker.ts` | Session tracking, event batching, idle detection |
| **Analytics dashboard** | `riseAtlantis/src/components/analytics/` | KPI cards, time series, geo maps, engagement tables |
| **Admin portal** | `riseAtlantis/src/components/management/` | Multi-tenant CRUD, list/detail views, permission gates |
| **Invite system** | `riseAtlantis/src/services/inviteService.ts` | Bulk invite, expiration, tracking, email integration |
| **Access control** | `riseAtlantis/server/src/middleware/` | RBAC, rate limiting, token validation, error handling |
| **Branding system** | `riseAtlantis/src/contexts/BrandingContext.tsx` | Hierarchical CSS injection, live preview, config builder |
| **Backend middleware** | `riseAtlantis/server/src/middleware/` | Helmet, CORS, rate limiting, structured error codes |
