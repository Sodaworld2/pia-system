const fs = require('fs');

// Fix 1: Add env vars to vitest config in vite.config.ts
const vitePath = 'vite.config.ts';
let vite = fs.readFileSync(vitePath, 'utf8');

const oldTest = "test: {\n        globals: true,";
const newTest = "test: {\n        globals: true,\n        env: {\n          ADMIN_PASSWORD: 'test-admin-password',\n          GEMINI_API_KEY: 'test-key',\n          NODE_ENV: 'test',\n        },";

if (vite.includes('env: {') && vite.includes('ADMIN_PASSWORD')) {
  console.log('SKIP vite.config.ts: env already set');
} else if (vite.includes(oldTest)) {
  vite = vite.replace(oldTest, newTest);
  fs.writeFileSync(vitePath, vite);
  console.log('FIXED vite.config.ts: Added test env vars (ADMIN_PASSWORD, GEMINI_API_KEY)');
} else {
  // Try with different whitespace
  const altOld = "test: {\r\n        globals: true,";
  if (vite.includes(altOld)) {
    vite = vite.replace(altOld, newTest.replace(/\n/g, '\r\n'));
    fs.writeFileSync(vitePath, vite);
    console.log('FIXED vite.config.ts (CRLF): Added test env vars');
  } else {
    console.log('WARN: Could not find test config pattern in vite.config.ts');
    console.log('Looking for "test: {"...');
    const idx = vite.indexOf('test: {');
    if (idx > 0) {
      console.log('Found at:', idx, 'Context:', vite.substring(idx, idx+60));
    }
  }
}

// Fix 2: Check if backend/src/index.ts exports app properly for supertest
const indexPath = 'backend/src/index.ts';
if (fs.existsSync(indexPath)) {
  let idx = fs.readFileSync(indexPath, 'utf8');
  // Check if it has export default app
  if (idx.includes('export default app')) {
    console.log('OK: backend/src/index.ts exports app');
  } else if (idx.includes('module.exports')) {
    console.log('OK: backend/src/index.ts uses module.exports');
  } else {
    console.log('WARN: backend/src/index.ts may not export app properly');
    // Search for app declaration and listen
    const lines = idx.split('\n');
    const appLine = lines.findIndex(l => l.includes('const app'));
    const listenLine = lines.findIndex(l => l.includes('.listen('));
    const exportLine = lines.findIndex(l => l.includes('export'));
    console.log('  app declared at line:', appLine + 1);
    console.log('  listen at line:', listenLine + 1);
    console.log('  export at line:', exportLine + 1);
  }
}
