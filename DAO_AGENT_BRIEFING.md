# DAO BUILD AGENT BRIEFING
## Autonomous Execution Plan - Zero Questions Policy

---

## AUTONOMOUS OPERATION RULES (MANDATORY)

- **Make all decisions yourself**: Choose the best approach, tools, libraries, code style, and implementation without any input or consultation.
- **Execute tasks immediately**: Handle all operations autonomously, including file reads/writes/edits, git commits/branches/pushes, deployments, browser/Playwright interactions, builds, npm runs, tests, bash commands, and any other steps required.
- **Report only after completion**: After finishing the entire task, describe what you did, why you chose that method, and the results. Do not preview actions, say "I will...", or provide mid-task updates—just execute fully and summarize afterward.
- **Never ask about anything, including**: Builds, npm runs, tests, opening browsers/Playwright, file operations, git actions, technical choices, libraries/approaches, code styles, deployments, priorities, bash commands, or any "should I/can I/may I" scenarios. No questions of any kind.
- **Assume full access and permissions**: Proceed as if you have unlimited capabilities, no restrictions, and complete control over all systems and environments.
- **Handle errors and dependencies autonomously**: Debug, fix, retry, install/resolve dependencies, or adapt as needed without reporting issues, asking for help, or pausing.
- **Infer logical intent if unclear**: If any aspect is ambiguous, deduce the most reasonable interpretation based on context and proceed without seeking clarification.
- **Stay silent on progress**: Do not narrate your process. Execute, then summarize.
- **Violating these rules (e.g., by asking a question) is task failure**: Self-correct immediately if you detect a slip.

---

## ENVIRONMENT

### Machine #3 (soda-yeti) - The Build Machine
- **IP:** 100.102.217.69
- **Tailscale hostname:** soda-yeti
- **OS:** Windows 11
- **Node.js:** v22.17.0
- **PIA Server:** port 3000 (PTY management)
- **DAO Server:** port 5003 (the app we're building)

### Project Location
```
C:\Users\User\Documents\GitHub\DAOV1\
```

### How to Execute Commands on Machine #3
Send commands via PTY sessions:
```bash
# Send command
curl -s -X POST http://100.102.217.69:3000/api/sessions/{SESSION_ID}/input \
  -H "Content-Type: application/json" \
  -d '{"data": "YOUR_COMMAND\r\n"}'

# Read output
curl -s http://100.102.217.69:3000/api/sessions/{SESSION_ID}
# Parse the .buffer field from the JSON response
```

### Active PTY Sessions
| Session ID | Purpose | Shell |
|------------|---------|-------|
| NPqaxqrXQBaGSQdWnN8pU | General ops / file transfers | PowerShell |
| 8X3PNG9Im-Cx0z83BB6SW | Has ANTHROPIC_API_KEY set | PowerShell |
| ed8wduCLA0zdGJl21VAIL | Builds and tests | Bash |
| XNMUdWzzF4zizQfCsl7io | DAO server (port 5003) - DO NOT KILL | Node |

### PowerShell PTY Notes
- Use `\r\n` for Enter (not just `\n`)
- Use `;` not `&&` for chaining commands
- Use `$env:VAR = 'value'` for env vars (not `export`)
- The `||` operator doesn't work in PowerShell - use `try/catch` or `;`
- `$` in data must be escaped as `\u0024` in JSON

### File Transfer Pattern (Machine #1 -> Machine #3)
1. Base64 encode file content locally
2. PowerShell: `$b64 = "BASE64STRING"; Set-Content -Path file.b64 -Value $b64 -NoNewline`
3. Node.js decode: `node -e "require('fs').writeFileSync('file.ext', Buffer.from(require('fs').readFileSync('file.b64','utf8'),'base64').toString('utf8'))"`

---

## CURRENT DAO STATE (As of Feb 13, 2026)

### Tech Stack
- **Backend:** Express.js + TypeScript + Knex.js (SQLite)
- **Frontend:** React 19 + Vite + React Router + Solana Wallet Adapter + Storybook
- **AI Brain:** Custom multi-tier AI router (local/flash/pro/premium models)
- **Database:** SQLite (`mentor_chats.db`)
- **Testing:** Vitest + Supertest

### Database File
```
C:\Users\User\Documents\GitHub\DAOV1\mentor_chats.db
```

### Database Tables (22 tables defined in `backend/src/database.ts`)
```
messages, daos, user_profiles, user_daos,
treasury_signers, treasury_policies, treasury_transactions, treasury_approvals,
proposals, token_distribution_groups, user_balances, token_transactions,
bubbles, agreements, negotiation_threads, agreement_signatures,
vesting_schedules, proposal_votes, marketplace_items, marketplace_purchases,
legal_frameworks, admin_logs
```

### Backend Route Files (in `backend/src/routes/`)
```
proposals.ts (7KB)           - Governance proposals + voting
token_distribution.ts (17KB) - Token distribution + vesting + claims
treasury.ts (11KB)           - Multi-sig treasury management
agreements.ts (18KB)         - Agreement management
founder-agreements.ts (35KB) - Founder-specific agreements
advisor-agreements.ts (35KB) - Advisor agreements
contributor-agreements.ts (35KB) - Contributor agreements
firstborn-agreements.ts (34KB) - Firstborn agreements
council.ts (17KB)            - DAO council member management
milestones.ts (21KB)         - Project milestone tracking
signatures.ts (12KB)         - Digital signature management
contracts.ts (9KB)           - Smart contract management
bubbles.ts (16KB)            - Idea bubbles / incubator
tokens.ts (6KB)              - Token operations
marketplace.ts (21KB)        - NFT/item marketplace
dao.ts (7KB)                 - DAO configuration
gemini.ts (8KB)              - AI mentor chat
health.ts (8KB)              - Health check
brain.ts (5KB)               - AI brain router
modules.ts (5KB)             - Module registry
admin.ts (via index.ts)      - Admin operations
```

### Routes Mounted in `backend/src/index.ts` (lines 150-173)
```typescript
app.use('/api/health', healthRouter);
app.use('/api/brain', brainRouter);
app.use('/api/modules', modulesRouter);
app.use('/api/mentor', geminiRouter);
app.use('/api/gemini', geminiRouter);
app.use('/api/dao', daoRouter);
app.use('/api/treasury', treasuryRouter);
app.use('/api/agreements/founder', founderAgreementsRouter);
app.use('/api/agreements/advisor', advisorAgreementsRouter);
app.use('/api/agreements/contributor', contributorAgreementsRouter);
app.use('/api/agreements/firstborn', firstbornAgreementsRouter);
app.use('/api/agreements', agreementsRouter);
app.use('/api/council', councilRouter);
app.use('/api/milestones', milestonesRouter);
app.use('/api/signatures', signaturesRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/bubbles', bubblesRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/token-distribution', tokenDistributionRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/admin', adminRouter);
```

### Middleware Stack
```
backend/src/middleware/
├── adminAuth.ts (13KB)        - Admin authentication
├── auth.ts (4KB)              - General auth
├── error-handler.ts (4KB)     - Error handling
├── performanceMonitor.ts (3KB) - Performance tracking
├── requestLogger.ts (5KB)     - Request logging
├── security.ts (10KB)         - Security headers/rate limiting
└── validation.ts (9KB)        - Input validation
```

### AI Brain System
```
backend/src/ai/
├── classifier.ts (8KB)  - Request classification
├── cost-guard.ts (6KB)  - Cost tracking
├── index.ts (1KB)       - Exports
├── memory.ts (6KB)      - Conversation memory
├── models.ts (4KB)      - Model definitions
├── personas.ts (10KB)   - AI personas
├── rag.ts (7KB)         - Retrieval augmented generation
└── router.ts (11KB)     - Multi-tier model routing
```

### AI Modules (registered but empty)
```
coach, legal, treasury, governance, community, product, security, analytics, onboarding
```
These are listed via `/api/modules` but `/api/modules/status` shows `modules: {}`.

### Frontend Templates (exist but not assembled into app)
```
templates/
├── ActivityLog.tsx
├── AdminConsole.tsx
├── AdminDashboard.tsx
├── AdviserAgreements.tsx + test
├── AdvisorDashboard.tsx
├── CommandCenter.tsx
├── CommunityContribution.tsx
├── DAOCommandCenter.tsx + test
├── DAOCreationWizard.tsx + test
├── GovernanceVoting.tsx + test
├── IdeaBubbles.tsx + test
├── IdeaIncubator.tsx
├── IntegratedMarketplace.tsx
├── LiveView.tsx
├── MultiSigTreasury.tsx + test
├── MyHub.tsx
├── PublicFacingApp.tsx
├── RewardCenter.tsx
├── TokenDistribution.tsx + test
└── WalletProfile.tsx
```

Plus Storybook stories in `stories/`.

### Frontend Source Structure
```
src/
├── components/    - Reusable components
├── contexts/      - React contexts
├── idl/           - Solana IDL definitions
├── layouts/       - Page layouts
├── lib/           - Library utilities
├── marketplace/   - Marketplace module
├── pages/         - Route pages
├── routes/        - React Router config
├── styles/        - CSS/styling
├── token-distribution/ - Token distribution module
├── utils/         - Utility functions
└── vite-env.d.ts  - Vite types
```

---

## ENDPOINT STATUS (Feb 13, 2026)

### WORKING (7 endpoints)
| Endpoint | Returns |
|----------|---------|
| `GET /api/health` | Server health, DB status, memory, uptime |
| `GET /api/dao` | DAO config (name, tokenomics, legal) |
| `GET /api/proposals` | 2 proposals with vote counts |
| `GET /api/token-distribution` | 4 token distribution groups |
| `GET /api/brain/status` | AI model availability |
| `GET /api/modules` | 9 module names |
| `GET /api/modules/status` | "operational" (empty details) |

### CRASHING - 500 errors (6 endpoints)
All return `{"success": false, "error": "Failed to fetch ...", "code": "INTERNAL_SERVER_ERROR"}`

| Endpoint | Likely Cause |
|----------|-------------|
| `GET /api/agreements/founder` | Missing DB table columns or schema mismatch |
| `GET /api/agreements/advisor` | Same |
| `GET /api/agreements/contributor` | Same |
| `GET /api/agreements/firstborn` | Same |
| `GET /api/council` | Missing `council_members` table |
| `GET /api/milestones` | Missing `milestones` table |

### EMPTY but working (2 endpoints)
| Endpoint | Returns |
|----------|---------|
| `GET /api/bubbles` | `[]` (no data seeded) |
| `GET /api/agreements` | `[]` (no data seeded) |

### NOT MOUNTED - 404 errors (5 endpoints)
Routes are imported and `app.use()` is called, but the GET `/` handler likely doesn't exist in these route files:

| Endpoint | Route File Exists? |
|----------|-------------------|
| `GET /api/signatures` | Yes (12KB file) |
| `GET /api/contracts` | Yes (9KB file) |
| `GET /api/tokens` | Yes (6KB file) |
| `GET /api/marketplace` | Yes (21KB file) |
| `GET /api/treasury` | Yes (11KB file) |

The route files exist and are mounted but their GET `/` handler may not be defined or exports default router incorrectly.

---

## BUILD PLAN (Priority Order)

### PHASE 1: Fix the 6 Crashing Endpoints (Backend DB)
**Goal:** All 500 errors become 200s with data

#### Task 1.1: Fix Council endpoint
- Read `backend/src/routes/council.ts` to understand what tables/columns it queries
- Check if the required table exists in `database.ts` - if not, add createTable
- If table exists but columns mismatch, add the missing columns
- Restart server and verify `GET /api/council` returns 200

#### Task 1.2: Fix Milestones endpoint
- Same pattern as council
- Read `backend/src/routes/milestones.ts`
- Add missing table/columns to `database.ts`
- Verify `GET /api/milestones` returns 200

#### Task 1.3: Fix 4 Agreement endpoints (founder, advisor, contributor, firstborn)
- These 4 route files are 34-35KB each - they're big
- Read the error more carefully - check what query fails
- Likely missing columns in the `agreements` table or missing a join table
- Fix schema in `database.ts`
- Verify all 4 return 200

### PHASE 2: Fix the 5 404 Endpoints
**Goal:** All routes respond with data

#### Task 2.1: Fix signatures, contracts, tokens, marketplace, treasury GET routes
- Read each route file to check if `router.get('/', ...)` exists
- If missing, add the GET handler
- If the export is wrong, fix it
- More likely: the route files may be using a different pattern (e.g., `router.get('/list')` instead of `router.get('/')`)
- Verify each returns 200

### PHASE 3: Seed Database
**Goal:** All endpoints return meaningful data, not empty arrays

#### Task 3.1: Seed bubbles (ideas) data
- Insert 5-10 sample idea bubbles into the `bubbles` table
- Different categories, statuses, authors

#### Task 3.2: Seed agreements data
- Insert sample agreements (founder, advisor, contributor)
- With negotiation threads and signatures

#### Task 3.3: Seed council data
- Insert 5-7 council members with roles, join dates, voting power

#### Task 3.4: Seed milestones data
- Insert project milestones with progress, dates, owners

#### Task 3.5: Seed marketplace data
- Insert marketplace items with prices, creators, categories

#### Task 3.6: Seed treasury data
- Insert treasury signers, policies, transactions

### PHASE 4: Activate AI Modules
**Goal:** `/api/modules/status` shows real module details

#### Task 4.1: Connect AI modules to the module registry
- Each module (treasury, governance, community, product, security, analytics, onboarding, coach, legal) needs to register with `ModuleRegistry`
- Read `backend/src/modules.ts` (or wherever ModuleRegistry is defined)
- Each module should provide: name, status, description, capabilities, health check
- Wire them up so `/api/modules/status` shows real data

#### Task 4.2: Connect AI brain to module-specific prompts
- Each module should have a specialized system prompt
- When a user asks about treasury -> route to treasury module
- When asking about governance -> route to governance module
- The classifier (`ai/classifier.ts`) should route to the right module

### PHASE 5: Build & Deploy Frontend
**Goal:** React app running and accessible

#### Task 5.1: Verify Vite config and build
- Check `vite.config.ts` exists and is properly configured
- Run `npm run build` (or equivalent) for the frontend
- Fix any build errors

#### Task 5.2: Assemble pages from templates
- The templates exist (`templates/*.tsx`) but need to be wired into React Router
- Check `src/routes/` for router config
- Check `src/pages/` for page components
- Wire templates into pages if not already done
- Key pages needed:
  - Dashboard (MyHub)
  - DAO Creation Wizard
  - Governance (proposals, voting)
  - Treasury (multi-sig, transactions)
  - Token Distribution (vesting, claiming)
  - Marketplace
  - Agreements
  - Council
  - Ideas/Bubbles
  - Admin

#### Task 5.3: Connect frontend to backend API
- Verify API base URL configuration
- Ensure CORS allows frontend origin
- Test data flows: frontend -> API -> database -> response -> render

#### Task 5.4: Run Storybook to verify components
- `npx storybook dev` to verify component library
- Fix any broken stories

### PHASE 6: Testing
**Goal:** All tests pass

#### Task 6.1: Fix existing test failures
- Backend route tests: proposals.test.ts and token_distribution.test.ts are now passing
- Frontend template tests: 8 .tsx test files need React/jsdom environment
- Fix vitest config for frontend tests (need `environment: 'jsdom'`)

#### Task 6.2: Run full test suite
- `npx vitest run` from backend
- Fix failures one by one
- Target: 100% of defined tests passing

---

## KEY FILES TO READ FIRST

Before starting any work, read these files to understand the codebase:

1. `backend/src/index.ts` - Server setup, route mounting, middleware chain
2. `backend/src/database.ts` - All table schemas, initialization
3. `backend/src/modules.ts` - Module registry system
4. `backend/src/ai/router.ts` - AI model routing
5. `backend/src/ai/classifier.ts` - Request classification
6. `package.json` - Dependencies, scripts
7. `backend/package.json` - Backend-specific deps (if separate)
8. `vite.config.ts` - Frontend build config
9. `vitest.config.ts` - Test configuration

---

## WHAT SUCCESS LOOKS LIKE

When done, the DAO should have:

1. **20/20 endpoints returning 200** with meaningful data
2. **Database seeded** with realistic sample data for all tables
3. **AI modules active** and reporting status via `/api/modules/status`
4. **Frontend running** on Vite dev server, accessible via browser
5. **All tests passing** (both backend and frontend)
6. **Server stable** at port 5003, no crashes, no 500s

### Verification Commands
```bash
# Test all endpoints (run from any machine)
for endpoint in health dao proposals token-distribution bubbles agreements \
  agreements/founder agreements/advisor agreements/contributor agreements/firstborn \
  council milestones signatures contracts tokens marketplace treasury \
  brain/status modules modules/status; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://100.102.217.69:5003/api/$endpoint)
  echo "$endpoint: $STATUS"
done

# Run tests
cd C:/Users/User/Documents/GitHub/DAOV1/backend
npx vitest run

# Check frontend build
cd C:/Users/User/Documents/GitHub/DAOV1
npx vite build
```

---

## CRITICAL RULES

1. **DO NOT stop the running DAO server** on session XNMUdWzzF4zizQfCsl7io
2. **After changing database.ts**, you must restart the server for table creation to run
3. **All route files use** `import db from '../database'` for the knex instance
4. **PowerShell sessions** use `\r\n` for newline, `;` for chaining
5. **The database is SQLite** at `./mentor_chats.db` - knex handles it
6. **When adding tables**, use the pattern: `const hasTable = await db.schema.hasTable('name'); if (!hasTable) { await db.schema.createTable('name', (table) => { ... }); }`
7. **When seeding data**, use `const count = await db('table').count('* as c'); if (count[0].c === 0) { await db('table').insert([...]); }`
8. **Server restart command**: Kill the old process and re-run `npx tsx src/index.ts` in the DAO server PTY session

---

*Briefing prepared by Claude Opus 4.6 | Machine #1 | February 13, 2026*
*Total route files: 21 | Total DB tables: 22 | Working endpoints: 7/20 | Target: 20/20*
