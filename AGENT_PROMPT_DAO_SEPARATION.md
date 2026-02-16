# Agent Prompt: Separate DAO Foundation Files from PIA System

Copy and paste this entire prompt to give to another Claude agent:

---

## Task: Separate the DAO foundation code from the PIA system into its own package

The PIA system repository (`C:\Users\mic\Downloads\pia-system`) currently has a `dao-foundation-files/` directory that is a **separate project** (SodaWorld DAO) living inside PIA's repo. It needs to be cleanly separated so PIA and the DAO can evolve independently.

### Current state

The `dao-foundation-files/` folder contains:
- `backend/src/modules/` — 9 AI modules (coach, legal, governance, community, analytics, onboarding, product, security, treasury) with `.ts` source AND compiled `.js`/`.d.ts` files
- `backend/src/events/bus.ts` — Event bus
- `backend/src/types/foundation.ts` — Shared types
- `backend/src/ai/` — AI integration code
- `backend/src/database_migrations/` — Database migrations
- `backend/src/middleware/` — Express middleware
- `research/` — 8 research documents (governance, treasury, tokens, etc.)
- `types/foundation.ts` — Type definitions
- Many loose Python/JS scripts (fix-*.py, audit-*.py, etc.) — these are utility/migration scripts
- Screenshots, base64 text files, JSON payloads — working files

### Where PIA depends on DAO (the entanglements)

**File 1: `src/api/routes/dao-modules.ts`** (4 imports from dao-foundation-files)
```typescript
import { ModuleRegistry, CoachModule, LegalModule, GovernanceModule } from '../../../dao-foundation-files/backend/src/modules/index.js';
import { BaseModule } from '../../../dao-foundation-files/backend/src/modules/base-module.js';
import type { AIModuleId, AgentMessage } from '../../../dao-foundation-files/types/foundation.js';
import bus from '../../../dao-foundation-files/backend/src/events/bus.js';
```

**File 2: `src/db/database.ts`** (migration named `025_dao_foundation`)
- Contains DAO-specific tables: `daos`, `dao_members`, `agreements`, `proposals`, `ai_conversations`, `knowledge_items`, `bounties`, `token_transactions`
- These tables are created by a migration inside PIA's database file

**File 3: `public/knowledge.html`** and **`public/terminology.html`** (minor references)
- A few HTML links referencing `dao-foundation-files/VIDEOHOHO_AGENT_BRIEFING.md` paths
- These are just display text, not functional imports

### Also in the root directory (DAO-related loose files to move)
These files at the PIA repo root are DAO-related and should move to the DAO repo:
- `DAO_AGENT_BRIEFING.md`
- `PROJECT_PLAN_AGENT_SHOPS.md`
- `dao-src-dump.json`
- `seed-sodaworld-dao.cjs`
- `dao-fix-*.cjs` (multiple fix scripts)
- `dao-full-test.cjs`, `dao-test-fixed.cjs`, `dao-read-files.cjs`
- `dao-patch-routes.cjs`, `dao-verify-frontend.cjs`
- `patch-council.cjs`, `patch-sig.cjs`
- `_extracted_*.ts` files (contracts, council, database, etc.)
- `_extract_*.ps1` files

---

## What you need to do

### Phase 1: Create the DAO package structure

Create a new directory at the repo root called `packages/dao-foundation/` with a proper package structure:

```
packages/
  dao-foundation/
    package.json          ← NEW: npm package definition
    tsconfig.json         ← NEW: TypeScript config for the DAO package
    src/
      modules/            ← MOVE from dao-foundation-files/backend/src/modules/*.ts (source .ts files ONLY, not compiled .js/.d.ts)
      events/
        bus.ts            ← MOVE from dao-foundation-files/backend/src/events/bus.ts
      types/
        foundation.ts     ← MOVE from dao-foundation-files/types/foundation.ts
      ai/                 ← MOVE from dao-foundation-files/backend/src/ai/
      middleware/          ← MOVE from dao-foundation-files/backend/src/middleware/
    research/             ← MOVE from dao-foundation-files/research/
    scripts/              ← MOVE all the loose .py and .cjs utility scripts here
```

Create `packages/dao-foundation/package.json`:
```json
{
  "name": "@sodaworld/dao-foundation",
  "version": "1.0.0",
  "description": "SodaWorld DAO Foundation - AI modules, governance, treasury",
  "type": "module",
  "main": "dist/modules/index.js",
  "types": "dist/modules/index.d.ts",
  "exports": {
    "./modules": "./dist/modules/index.js",
    "./modules/*": "./dist/modules/*.js",
    "./events/bus": "./dist/events/bus.js",
    "./types": "./dist/types/foundation.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

Create `packages/dao-foundation/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

### Phase 2: Move files

Move ONLY the TypeScript source files (`.ts`), NOT the compiled outputs (`.js`, `.d.ts`, `.d.ts.map`, `.js.map`):

```bash
# Create structure
mkdir -p packages/dao-foundation/src/modules
mkdir -p packages/dao-foundation/src/events
mkdir -p packages/dao-foundation/src/types
mkdir -p packages/dao-foundation/src/ai
mkdir -p packages/dao-foundation/src/middleware
mkdir -p packages/dao-foundation/research
mkdir -p packages/dao-foundation/scripts

# Move module source files (ONLY .ts, not compiled files)
cp dao-foundation-files/backend/src/modules/*.ts packages/dao-foundation/src/modules/

# Move events
cp dao-foundation-files/backend/src/events/bus.ts packages/dao-foundation/src/events/

# Move types
cp dao-foundation-files/types/foundation.ts packages/dao-foundation/src/types/
# Also copy the backend types if different
cp dao-foundation-files/backend/src/types/foundation.ts packages/dao-foundation/src/types/foundation-backend.ts

# Move AI code
cp -r dao-foundation-files/backend/src/ai/* packages/dao-foundation/src/ai/

# Move middleware
cp -r dao-foundation-files/backend/src/middleware/* packages/dao-foundation/src/middleware/

# Move research docs
cp dao-foundation-files/research/*.md packages/dao-foundation/research/
cp dao-foundation-files/research/*.html packages/dao-foundation/research/

# Move utility scripts
cp dao-foundation-files/*.py packages/dao-foundation/scripts/
cp dao-foundation-files/*.cjs packages/dao-foundation/scripts/

# Move root-level DAO files
mv DAO_AGENT_BRIEFING.md packages/dao-foundation/
mv PROJECT_PLAN_AGENT_SHOPS.md packages/dao-foundation/
mv dao-src-dump.json packages/dao-foundation/
mv seed-sodaworld-dao.cjs packages/dao-foundation/scripts/
mv dao-fix-*.cjs packages/dao-foundation/scripts/
mv dao-full-test.cjs packages/dao-foundation/scripts/
mv dao-test-fixed.cjs packages/dao-foundation/scripts/
mv dao-read-files.cjs packages/dao-foundation/scripts/
mv dao-patch-routes.cjs packages/dao-foundation/scripts/
mv dao-verify-frontend.cjs packages/dao-foundation/scripts/
mv patch-council.cjs packages/dao-foundation/scripts/
mv patch-sig.cjs packages/dao-foundation/scripts/
mv _extracted_*.ts packages/dao-foundation/scripts/
mv _extract_*.ps1 packages/dao-foundation/scripts/
```

### Phase 3: Update PIA imports

**File: `src/api/routes/dao-modules.ts`**

Change the imports from:
```typescript
import { ModuleRegistry, CoachModule, LegalModule, GovernanceModule } from '../../../dao-foundation-files/backend/src/modules/index.js';
import { BaseModule } from '../../../dao-foundation-files/backend/src/modules/base-module.js';
import type { AIModuleId, AgentMessage } from '../../../dao-foundation-files/types/foundation.js';
import bus from '../../../dao-foundation-files/backend/src/events/bus.js';
```

To:
```typescript
import { ModuleRegistry, CoachModule, LegalModule, GovernanceModule } from '../../../packages/dao-foundation/src/modules/index.js';
import { BaseModule } from '../../../packages/dao-foundation/src/modules/base-module.js';
import type { AIModuleId, AgentMessage } from '../../../packages/dao-foundation/src/types/foundation.js';
import bus from '../../../packages/dao-foundation/src/events/bus.js';
```

NOTE: In the future when the DAO becomes its own npm package, these would change to:
```typescript
import { ModuleRegistry, CoachModule, LegalModule, GovernanceModule } from '@sodaworld/dao-foundation/modules';
```
But for now, keep the relative paths working.

### Phase 4: Update HTML references

**File: `public/knowledge.html`**
Update any path references from `dao-foundation-files/` to `packages/dao-foundation/`

**File: `public/terminology.html`**
Same — update path references.

### Phase 5: Verify the DAO package builds

```bash
cd packages/dao-foundation
npm install
npm run build
```

Fix any TypeScript errors. The DAO modules may import from each other or from external packages — check what dependencies they need and add them to `packages/dao-foundation/package.json`.

Common issues to expect:
- DAO modules may import from `@anthropic-ai/sdk` or other packages — add these as dependencies
- The `bus.ts` event emitter may use Node.js types — may need `@types/node`
- Some modules may reference database queries — these are the PIA-DAO bridge and may need a shared interface

### Phase 6: Verify PIA still builds

```bash
cd /path/to/pia-system
npm run build
```

Make sure PIA's TypeScript compilation still works with the updated import paths.

### Phase 7: Test

```bash
# Run PIA tests
npm test

# Start the server and check DAO routes work
npm run dev
# Then test: curl http://localhost:3000/api/dao/modules
```

### Phase 8: Clean up the old directory

Once everything works, the old `dao-foundation-files/` directory can be removed. But do NOT delete it until you've confirmed:
- [ ] All source files are moved to `packages/dao-foundation/`
- [ ] PIA builds successfully
- [ ] PIA tests pass
- [ ] DAO module API routes still work
- [ ] The DAO package builds on its own

Then:
```bash
rm -rf dao-foundation-files/
```

### Phase 9: Update .gitignore

Add to `.gitignore`:
```
# DAO package build output
packages/dao-foundation/dist/
```

---

## Important notes

- **DO NOT delete `dao-foundation-files/` until everything is verified working.** Copy first, verify, then delete.
- **Only move `.ts` source files**, not compiled `.js`/`.d.ts`/`.map` files. The DAO package will compile its own.
- **The database migration (`025_dao_foundation`) stays in PIA** for now — it creates DAO tables in PIA's database. This is the bridge between the two systems.
- **Some Python scripts in `dao-foundation-files/` contain hardcoded API keys** (Anthropic keys in `fix-all-m3.py`, `fix-all-m3-v2.py`, `fix-env-m3.py`). When moving these to `packages/dao-foundation/scripts/`, **remove the hardcoded keys** and replace with environment variable references.
- **The `dao-foundation-files/.claude/` directory** should NOT be moved — it's local Claude settings.
- **The `dao-foundation-files/.playwright-mcp/` directory** contains a Firebase service account JSON — this is a SECRET. Do NOT commit it. Add it to `.gitignore`.
- **Screenshots and base64 files** (`coach_b64.txt`, `dao-council-live.png`, etc.) — move to `packages/dao-foundation/assets/` or skip them if they're just working files.

## Final structure after separation

```
pia-system/
├── src/                    ← PIA core
├── public/                 ← PIA dashboards
├── packages/
│   └── dao-foundation/     ← DAO package (clean, independent)
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── modules/    ← 9 AI modules
│       │   ├── events/     ← Event bus
│       │   ├── types/      ← Type definitions
│       │   ├── ai/         ← AI integration
│       │   └── middleware/  ← Express middleware
│       ├── research/       ← Research docs
│       └── scripts/        ← Utility/migration scripts
├── .gitignore              ← Updated
└── (dao-foundation-files/ DELETED)
```

This keeps the DAO code in the same git repo for now (monorepo pattern) but as a clean, independent package that can be extracted to its own repo later when needed.

---
