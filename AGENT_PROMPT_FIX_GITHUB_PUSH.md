# Agent Prompt: Fix GitHub Push Block

Copy and paste this entire prompt to give to another Claude agent:

---

## Task: Fix GitHub push block — leaked API keys in git history

The PIA repository at `https://github.com/Sodaworld2/pia-system.git` has a blocked push. GitHub's secret scanning found Anthropic API keys in older commits.

### The problem
These files in **older commits** contain Anthropic API keys:
1. `.env.keys` (commit `cb671cc`)
2. `dao-foundation-files/fix-all-m3-v2.py` (line 77)
3. `dao-foundation-files/fix-all-m3.py` (line 93)
4. `dao-foundation-files/fix-env-m3.py` (line 50)

### What you need to do

**Step 1: Verify current .gitignore protections**
Check that `.gitignore` already excludes:
- `.env` and `.env.local`
- `.env.keys`
- `firebase-service-account.json`

**Step 2: Use BFG Repo Cleaner to remove secrets from git history**

Option A — Using BFG (preferred):
```bash
# Install BFG
# On Mac: brew install bfg
# On Windows: download from https://rtyley.github.io/bfg-repo-cleaner/

# Create a file listing the secrets to remove
# Get the actual key values from the commits and put them in a file called passwords.txt
# One secret per line

# Run BFG to replace secrets in history
bfg --replace-text passwords.txt

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (DESTRUCTIVE — rewrites history)
git push origin master --force
```

Option B — Using git filter-repo:
```bash
pip install git-filter-repo

# Replace the API key string in all history
git filter-repo --replace-text <(echo 'ACTUAL_API_KEY_HERE==>REDACTED')

git push origin master --force
```

Option C — Quick fix (if keys are already rotated/revoked):
The user can visit these GitHub URLs to manually allow the push:
- https://github.com/Sodaworld2/pia-system/security/secret-scanning/unblock-secret/39kWZizpwMr3YwnysBW1H4DiNur
- https://github.com/Sodaworld2/pia-system/security/secret-scanning/unblock-secret/39kWZle14kbCxWuU1gcLnScyOIu

This marks the secrets as "revoked" and allows the push, but the keys remain in history.

**Step 3: Verify the push works**
```bash
git push origin master
```

**Step 4: Rotate API keys**
IMPORTANT — regardless of which option you chose:
1. Go to https://console.anthropic.com/settings/keys
2. Revoke/delete the leaked API key
3. Generate a new API key
4. Update the `.env` file on Machine 1 with the new key

**Step 5: Verify**
```bash
# Check that push succeeded
git log --oneline -5

# Verify the remote is up to date
git status
```

### Important notes
- The `.env` file is gitignored and should NEVER be committed
- After fixing, make sure the new API key is only in `.env` (which is gitignored)
- If using BFG or filter-repo, all collaborators will need to re-clone the repo
- Ask the user before force pushing — it rewrites history

---
