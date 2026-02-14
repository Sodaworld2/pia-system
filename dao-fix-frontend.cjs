/**
 * DAO Frontend Fix Script v2
 * Deploys to Machine #3 via PIA PTY to fix:
 * 1. Router: Switch index.tsx to use AppRouter (enables dashboard child routes)
 * 2. Firebase: Remove httpsCallable exports (prevents CORS)
 * 3. Search: Find any remaining httpsCallable usage in codebase
 *
 * Run: node dao-fix-frontend.cjs
 */

const API_BASE = 'http://100.102.217.69:3000';
const MACHINE_ID = 'yFJxIOpcFcQEVl4CL9x0c';
const DAOV1_PATH = 'C:/Users/User/Documents/GitHub/DAOV1';
const PIA_PUBLIC = 'C:/Users/User/Documents/GitHub/pia-system/public';

async function apiCall(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE}${path}`, opts);
  return resp.json();
}

async function sendCmd(sessionId, cmd) {
  await apiCall(`/api/sessions/${sessionId}/input`, 'POST', {
    data: cmd + '\r\n',
  });
}

async function getOutput(sessionId) {
  const resp = await apiCall(`/api/sessions/${sessionId}`);
  return resp.buffer || '';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function writeFileViaB64(sessionId, filePath, content) {
  const b64 = Buffer.from(content).toString('base64');
  const chunkSize = 4000;
  if (b64.length <= chunkSize) {
    await sendCmd(sessionId, `node -e "require('fs').writeFileSync('${filePath}',Buffer.from('${b64}','base64').toString())"`);
    await sleep(2000);
  } else {
    const chunks = [];
    for (let i = 0; i < b64.length; i += chunkSize) {
      chunks.push(b64.slice(i, i + chunkSize));
    }
    await sendCmd(sessionId, `node -e "require('fs').writeFileSync('${filePath}.b64','${chunks[0]}')"`);
    await sleep(1500);
    for (let i = 1; i < chunks.length; i++) {
      await sendCmd(sessionId, `node -e "require('fs').appendFileSync('${filePath}.b64','${chunks[i]}')"`);
      await sleep(1000);
    }
    await sendCmd(sessionId, `node -e "const b=require('fs').readFileSync('${filePath}.b64','utf8');require('fs').writeFileSync('${filePath}',Buffer.from(b,'base64').toString());require('fs').unlinkSync('${filePath}.b64');console.log('Written: ${filePath} ('+Buffer.from(b,'base64').length+' bytes)')"`);
    await sleep(2000);
  }
}

// The comprehensive fix script that runs ON Machine #3
const FIX_SCRIPT = `
const fs = require('fs');
const path = require('path');

const base = 'C:/Users/User/Documents/GitHub/DAOV1';
const piaPublic = 'C:/Users/User/Documents/GitHub/pia-system/public';
const log = [];

function logMsg(msg) {
  console.log(msg);
  log.push(msg);
}

// ============================================================
// FIX 1: Switch index.tsx to use AppRouter from src/routes
// ============================================================
logMsg('\\n=== FIX 1: Router Switch ===');

const indexPath = path.join(base, 'index.tsx');
let indexContent = fs.readFileSync(indexPath, 'utf8');
const indexBackup = indexContent;

// Replace App import with AppRouter import
if (indexContent.includes("import App from './App'")) {
  indexContent = indexContent.replace(
    "import App from './App'",
    "import { AppRouter } from './src/routes'"
  );
  logMsg('  Replaced App import with AppRouter import');
} else if (indexContent.includes('import App from "./App"')) {
  indexContent = indexContent.replace(
    'import App from "./App"',
    "import { AppRouter } from './src/routes'"
  );
  logMsg('  Replaced App import (double quotes) with AppRouter import');
} else {
  logMsg('  WARNING: Could not find App import line. Current imports:');
  indexContent.split('\\n').filter(l => l.includes('import')).forEach(l => logMsg('    ' + l.trim()));
}

// Replace <App /> with <AppRouter />
if (indexContent.includes('<App />')) {
  indexContent = indexContent.replace('<App />', '<AppRouter />');
  logMsg('  Replaced <App /> with <AppRouter />');
} else if (indexContent.includes('<App/>')) {
  indexContent = indexContent.replace('<App/>', '<AppRouter />');
  logMsg('  Replaced <App/> with <AppRouter />');
} else {
  logMsg('  WARNING: Could not find <App /> in JSX');
}

if (indexContent !== indexBackup) {
  fs.writeFileSync(indexPath + '.bak', indexBackup, 'utf8');
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  logMsg('  DONE: index.tsx updated (backup saved as index.tsx.bak)');
} else {
  logMsg('  SKIPPED: No changes needed or already fixed');
}

// ============================================================
// FIX 2: Search for httpsCallable usage across entire project
// ============================================================
logMsg('\\n=== FIX 2: Find httpsCallable usage ===');

function findFiles(dir, ext, results) {
  results = results || [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item === 'node_modules' || item === '.git' || item === 'dist' || item === 'build') continue;
      const full = path.join(dir, item);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          findFiles(full, ext, results);
        } else if (ext.some(e => item.endsWith(e))) {
          results.push(full);
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }
  return results;
}

const allFiles = findFiles(base, ['.ts', '.tsx', '.js', '.jsx']);
logMsg('  Scanned ' + allFiles.length + ' source files');

const httpsCallableUsages = [];
const firebaseFunctionsImports = [];

for (const f of allFiles) {
  try {
    const content = fs.readFileSync(f, 'utf8');
    const relPath = path.relative(base, f).replace(/\\\\/g, '/');

    if (content.includes('httpsCallable') && relPath !== 'src/config/firebase.ts') {
      const lines = content.split('\\n');
      const matches = [];
      lines.forEach((line, i) => {
        if (line.includes('httpsCallable')) {
          matches.push({ line: i + 1, text: line.trim() });
        }
      });
      httpsCallableUsages.push({ file: relPath, matches });
      logMsg('  FOUND httpsCallable: ' + relPath);
      matches.forEach(m => logMsg('    L' + m.line + ': ' + m.text.substring(0, 120)));
    }

    // Check for firebase functions imports (excluding the config file itself)
    if (relPath !== 'src/config/firebase.ts' && content.includes('firebase') && content.includes('functions')) {
      const lines = content.split('\\n');
      lines.forEach((line, i) => {
        if (line.includes('import') && line.includes('firebase') && line.includes('functions')) {
          firebaseFunctionsImports.push({ file: relPath, line: i + 1, text: line.trim() });
          logMsg('  FOUND functions import: ' + relPath + ' L' + (i+1));
        }
      });
    }
  } catch (e) { /* skip */ }
}

if (httpsCallableUsages.length === 0) {
  logMsg('  No httpsCallable usage found outside firebase.ts - GOOD');
}

// ============================================================
// FIX 3: Clean firebase.ts exports if safe
// ============================================================
logMsg('\\n=== FIX 3: Firebase config cleanup ===');

const firebasePath = path.join(base, 'src/config/firebase.ts');
try {
  let fbContent = fs.readFileSync(firebasePath, 'utf8');
  const fbBackup = fbContent;

  if (httpsCallableUsages.length === 0) {
    // Safe to remove functions/httpsCallable exports
    const exportPatterns = [
      'export { auth, db, functions, httpsCallable };',
      'export { auth, db, functions, httpsCallable }',
      'export {auth, db, functions, httpsCallable};',
      'export { auth, db, functions, httpsCallable};',
    ];
    let replaced = false;
    for (const pat of exportPatterns) {
      if (fbContent.includes(pat)) {
        fbContent = fbContent.replace(pat, 'export { auth, db };');
        replaced = true;
        logMsg('  Removed functions/httpsCallable from exports');
        break;
      }
    }
    if (!replaced) {
      logMsg('  Export pattern not matched. Current exports:');
      fbContent.split('\\n').filter(l => l.includes('export')).forEach(l => logMsg('    ' + l.trim()));
    }

    if (fbContent !== fbBackup) {
      fs.writeFileSync(firebasePath + '.bak', fbBackup, 'utf8');
      fs.writeFileSync(firebasePath, fbContent, 'utf8');
      logMsg('  DONE: firebase.ts updated');
    }
  } else {
    logMsg('  SKIPPED: Other files still use httpsCallable - needs manual fix');
    httpsCallableUsages.forEach(u => logMsg('    - ' + u.file));
  }
} catch (e) {
  logMsg('  ERROR: ' + e.message);
}

// ============================================================
// FIX 4: Verify routes/index.tsx exports AppRouter
// ============================================================
logMsg('\\n=== FIX 4: Verify routes export ===');

const routesPath = path.join(base, 'src/routes/index.tsx');
try {
  const routesContent = fs.readFileSync(routesPath, 'utf8');
  if (routesContent.includes('export') && routesContent.includes('AppRouter')) {
    logMsg('  AppRouter exported from src/routes/index.tsx - OK');
  } else {
    logMsg('  WARNING: AppRouter not found in exports');
    const exportLines = routesContent.split('\\n').filter(l => l.includes('export'));
    exportLines.forEach(l => logMsg('    Export: ' + l.trim().substring(0, 100)));
  }

  if (routesContent.includes('/dashboard')) logMsg('  Dashboard routes found - OK');
  if (routesContent.includes('DashboardLayout')) logMsg('  DashboardLayout referenced - OK');

  // Count routes
  const routeCount = (routesContent.match(/path:/g) || []).length;
  logMsg('  Total routes defined: ' + routeCount);
} catch (e) {
  logMsg('  ERROR: ' + e.message);
}

// ============================================================
// FIX 5: Check .env.local
// ============================================================
logMsg('\\n=== FIX 5: Environment check ===');

const envLocalPath = path.join(base, '.env.local');
try {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  envContent.split('\\n').forEach(l => {
    if (l.trim() && !l.startsWith('#')) logMsg('  ' + l.trim());
  });
} catch (e) {
  logMsg('  .env.local not found');
}

// ============================================================
// VERIFY: Check the final state of index.tsx
// ============================================================
logMsg('\\n=== VERIFY: Final index.tsx state ===');
try {
  const finalIndex = fs.readFileSync(indexPath, 'utf8');
  finalIndex.split('\\n').forEach((l, i) => {
    if (l.trim()) logMsg('  ' + (i+1) + ': ' + l);
  });
} catch (e) {
  logMsg('  ERROR reading final index.tsx: ' + e.message);
}

// ============================================================
// SAVE RESULTS
// ============================================================
logMsg('\\n=== COMPLETED at ' + new Date().toISOString() + ' ===');

fs.writeFileSync(
  path.join(piaPublic, 'dao-fix-results.txt'),
  log.join('\\n'),
  'utf8'
);
logMsg('Results saved to dao-fix-results.txt');
`;

async function main() {
  console.log('=== DAO Frontend Fix Script v2 ===\n');
  console.log('Deploying fix script to Machine #3...\n');

  // Use existing session
  const SESSION = 'Aeo4Sr7VkxE00qjzdlyX9';

  // Deploy the fix script via base64
  console.log('1. Writing fix script to Machine #3...');
  await writeFileViaB64(SESSION, DAOV1_PATH + '/run-fix.cjs', FIX_SCRIPT);
  console.log('   Script deployed');

  // Run it
  console.log('2. Running fix script...');
  await sendCmd(SESSION, 'node run-fix.cjs');
  await sleep(8000);

  // Check output
  console.log('3. Checking results...');
  const output = await getOutput(SESSION);
  const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '');
  const lines = clean.split('\n').filter(l => l.trim());
  console.log('\n--- PTY Output (last 40 lines) ---');
  lines.slice(-40).forEach(l => console.log(l));

  // Also fetch the results file
  console.log('\n4. Fetching results file...');
  try {
    const resp = await fetch('http://100.102.217.69:3000/dao-fix-results.txt');
    if (resp.ok) {
      const text = await resp.text();
      if (!text.includes('<!DOCTYPE')) {
        console.log('\n--- Fix Results ---');
        console.log(text);
      } else {
        console.log('Results file not yet available via HTTP');
      }
    }
  } catch (e) {
    console.log('Could not fetch results: ' + e.message);
  }

  console.log('\n=== Done! Vite should hot-reload automatically. ===');
}

main().catch(e => console.error('FATAL:', e));
