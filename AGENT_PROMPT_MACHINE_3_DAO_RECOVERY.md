# Agent Prompt: Machine 3 — DAO Recovery & Setup

Copy and paste this entire prompt to give to Claude on Machine 3 when it comes back online.

---

## Context

You are Claude, running on **Machine 3**. This machine is the original home of the **SodaWorld DAO** project. The machine was offline for a period, and during that time a copy of the DAO files was kept inside the PIA system repository on Machine 1 (in a folder called `dao-foundation-files/`).

Now that Machine 3 is back online, your job is to:
1. Reconcile the DAO files — figure out what's on this machine vs what was saved on Machine 1
2. Set up the DAO as its own proper git repository
3. Push it to GitHub so it's never stuck on one machine again
4. Let Machine 1 know the DAO has a proper home now

## The PIA system repo

The PIA system is at: `https://github.com/Sodaworld2/pia-system.git`

Inside it, there's a folder called `dao-foundation-files/` that contains a **snapshot** of the DAO project that was copied from this machine (Machine 3) before it went offline. This snapshot may be **older or newer** than what's currently on this machine.

The DAO files in PIA include:
- `backend/src/modules/` — 9 AI modules (coach, legal, governance, community, analytics, onboarding, product, security, treasury)
- `backend/src/events/bus.ts` — Event bus
- `backend/src/types/` and `types/` — TypeScript type definitions
- `backend/src/ai/` — AI integration code
- `backend/src/database_migrations/` — Database migrations
- `backend/src/middleware/` — Express middleware
- `research/` — 8 research documents (governance, treasury, tokens, agreements, etc.)
- Various utility scripts (`.py`, `.cjs` files)
- Screenshots, base64 encoded files, JSON payloads

Also at PIA's root, these DAO-related files exist:
- `DAO_AGENT_BRIEFING.md`
- `PROJECT_PLAN_AGENT_SHOPS.md`
- `dao-src-dump.json`
- `seed-sodaworld-dao.cjs`
- Multiple `dao-fix-*.cjs` scripts
- Multiple `_extracted_*.ts` files
- Multiple `_extract_*.ps1` scripts

---

## Step-by-step instructions

### Step 1: Assess what's on Machine 3

First, find out what DAO files already exist on this machine:

```bash
# Look for the DAO project on this machine
# Common locations to check:
ls ~/Downloads/
ls ~/Projects/
ls ~/Documents/
ls ~/Desktop/

# Search for DAO-related directories
find ~ -maxdepth 4 -type d -name "*dao*" -o -name "*sodaworld*" -o -name "*foundation*" 2>/dev/null
```

Document what you find:
- Where is the DAO project on this machine?
- When was it last modified? (`ls -la` or `stat` on key files)
- Does it have a `.git` directory (is it already a git repo)?
- What's the file count and structure?

### Step 2: Get the PIA copy for comparison

Clone or download just the DAO files from PIA's repo:

```bash
# Clone PIA repo (just to get the DAO files)
git clone https://github.com/Sodaworld2/pia-system.git /tmp/pia-dao-snapshot
```

Now you have two copies:
- **Machine 3's local copy** — wherever you found it in Step 1
- **PIA's snapshot** — in `/tmp/pia-dao-snapshot/dao-foundation-files/`

### Step 3: Compare the two copies

```bash
# Compare the two directories
diff -rq /path/to/machine3/dao/ /tmp/pia-dao-snapshot/dao-foundation-files/backend/

# For a more detailed comparison of the source files specifically:
diff -rq /path/to/machine3/dao/src/modules/ /tmp/pia-dao-snapshot/dao-foundation-files/backend/src/modules/ --include="*.ts"
```

Report to the user:
- Which copy is newer?
- Are there files on Machine 3 that aren't in PIA's snapshot?
- Are there files in PIA's snapshot that aren't on Machine 3?
- Any files that differ between the two?

**Ask the user which copy should be the source of truth**, or if they want to merge both.

### Step 4: Create the official DAO repository

Once you know which files to keep, set up the proper repo:

```bash
# Create the DAO project directory
mkdir -p ~/Projects/sodaworld-dao
cd ~/Projects/sodaworld-dao

# Initialize git
git init
git branch -M main

# Create the project structure
mkdir -p src/modules
mkdir -p src/events
mkdir -p src/types
mkdir -p src/ai
mkdir -p src/middleware
mkdir -p src/database_migrations
mkdir -p research
mkdir -p scripts
mkdir -p assets
```

### Step 5: Organize the files into the new structure

Copy from whichever source is the truth (Machine 3 local OR PIA snapshot):

```
sodaworld-dao/
├── package.json
├── tsconfig.json
├── README.md
├── .gitignore
├── .env.example          ← template, NO real keys
├── src/
│   ├── modules/
│   │   ├── index.ts
│   │   ├── base-module.ts
│   │   ├── coach.ts
│   │   ├── legal.ts
│   │   ├── governance.ts
│   │   ├── community.ts
│   │   ├── analytics.ts
│   │   ├── onboarding.ts
│   │   ├── product.ts
│   │   ├── security.ts
│   │   └── treasury.ts
│   ├── events/
│   │   └── bus.ts
│   ├── types/
│   │   └── foundation.ts
│   ├── ai/
│   │   └── (AI integration files)
│   ├── middleware/
│   │   └── (Express middleware files)
│   └── database_migrations/
│       └── (migration files)
├── research/
│   ├── RESEARCH_AGREEMENTS_SIGNATURES.md
│   ├── RESEARCH_AI_MENTOR_KNOWLEDGE.md
│   ├── RESEARCH_GOVERNANCE.md
│   ├── RESEARCH_MARKETPLACE_BOUNTIES.md
│   ├── RESEARCH_ONBOARDING_BUBBLES.md
│   ├── RESEARCH_TOKEN_DISTRIBUTION.md
│   ├── RESEARCH_TREASURY.md
│   └── RESEARCH_TREASURY_TOOLS.md
├── scripts/
│   └── (utility and migration scripts)
└── docs/
    ├── DAO_AGENT_BRIEFING.md
    ├── PROJECT_PLAN_AGENT_SHOPS.md
    ├── COMPETITIVE_LANDSCAPE.md
    └── (other planning docs)
```

**ONLY copy `.ts` source files** for the modules — NOT compiled `.js`, `.d.ts`, `.js.map`, `.d.ts.map` files. Those will be regenerated by the build.

### Step 6: Create package.json

```json
{
  "name": "@sodaworld/dao-foundation",
  "version": "1.0.0",
  "description": "SodaWorld DAO Foundation - AI modules, governance, treasury, community",
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
    "dev": "tsc --watch",
    "test": "vitest"
  },
  "author": "SodaWorld",
  "license": "MIT"
}
```

### Step 7: Create .gitignore

```
node_modules/
dist/
.env
.env.local
.env.keys
*.db
*.db-journal
*.log
.DS_Store
Thumbs.db
firebase-service-account*.json
.playwright-mcp/
```

### Step 8: Create tsconfig.json

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

### Step 9: CRITICAL — Remove hardcoded API keys

**Before committing anything**, scan ALL files for hardcoded secrets:

```bash
# Search for Anthropic keys
grep -r "sk-ant-" . --include="*.ts" --include="*.py" --include="*.cjs" --include="*.js"

# Search for other potential secrets
grep -r "api.key\|apikey\|API_KEY\|secret\|password" . --include="*.ts" --include="*.py" --include="*.cjs"
```

**Known files with hardcoded Anthropic API keys** (from the PIA snapshot):
- `fix-all-m3-v2.py` (line 77)
- `fix-all-m3.py` (line 93)
- `fix-env-m3.py` (line 50)

**Replace any hardcoded keys** with environment variable references:
```python
# BEFORE (bad):
api_key = "sk-ant-api03-..."

# AFTER (good):
import os
api_key = os.environ.get("ANTHROPIC_API_KEY", "")
```

Also check for Firebase credentials — the PIA snapshot had a `firebase-service-account.json` in `.playwright-mcp/`. This must NEVER be committed.

### Step 10: Build and test

```bash
cd ~/Projects/sodaworld-dao
npm install
npm run build
```

Fix any TypeScript errors. The modules may need dependencies installed:
```bash
npm install @anthropic-ai/sdk  # if modules use Claude
npm install express             # if middleware uses Express types
npm install --save-dev @types/node typescript vitest
```

### Step 11: Create the GitHub repo and push

```bash
# Ask the user to create the repo on GitHub first, OR use gh CLI:
gh repo create Sodaworld2/sodaworld-dao --public --source=. --push

# Or manually:
git add -A
git commit -m "Initial commit: SodaWorld DAO Foundation - 9 AI modules, research, governance"
git remote add origin https://github.com/Sodaworld2/sodaworld-dao.git
git push -u origin main
```

### Step 12: Set up PIA on Machine 3

Machine 3 should also run PIA as a local agent (like Machine 2). Follow the instructions in `MACHINE_2_SETUP_BRIEFING.md` from the PIA repo, but with these differences:

- `PIA_MACHINE_NAME=Machine 3`
- The `.env` should point `PIA_HUB_URL` to Machine 1's IP/Tailscale address
- Machine 3 can also run the DAO backend alongside PIA if needed

### Step 13: Notify Machine 1

Once the DAO has its own repo on GitHub, Machine 1 needs to:
1. Remove the `dao-foundation-files/` directory from the PIA repo
2. Update `src/api/routes/dao-modules.ts` to import from the new DAO package (either via npm install from GitHub, or as a git submodule)
3. Clean up the root-level DAO scripts

Tell the user: "The DAO is now at `https://github.com/Sodaworld2/sodaworld-dao`. Machine 1 can remove `dao-foundation-files/` from PIA and reference the DAO as a separate package."

---

## Verification checklist

Before you're done, confirm:
- [ ] Found and compared Machine 3's local DAO files with PIA's snapshot
- [ ] User confirmed which copy is the source of truth
- [ ] All DAO source files moved to `sodaworld-dao` repo structure
- [ ] NO hardcoded API keys or secrets in any files
- [ ] NO compiled `.js`/`.d.ts` files committed (only `.ts` source)
- [ ] NO `firebase-service-account.json` or similar credentials
- [ ] `npm run build` succeeds
- [ ] Pushed to GitHub
- [ ] PIA is also installed on Machine 3 as a local agent
- [ ] Machine 1 notified that DAO has its own repo

---

## Summary for the user

When this is done:
- The DAO lives in its own GitHub repo — safe, independent, never stuck on one machine again
- Machine 3 runs both the DAO project AND PIA (as a local agent)
- Machine 1 can cleanly remove the old `dao-foundation-files/` from PIA
- All three machines are connected via PIA's relay system
