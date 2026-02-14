const fs = require('fs');
const p = 'vite.config.ts';
let c = fs.readFileSync(p, 'utf8');

// Fix the exclude pattern to exclude Playwright tests and soda-treasury-service
const oldExclude = "exclude: ['**/node_modules/**', 'e2e/**'],";
const newExclude = "exclude: ['**/node_modules/**', 'e2e/**', 'tests/**', 'soda-treasury-service/**'],";

if (c.includes(newExclude)) {
  console.log('SKIP: already patched');
} else if (c.includes(oldExclude)) {
  c = c.replace(oldExclude, newExclude);
  fs.writeFileSync(p, c);
  console.log('FIXED: Updated vitest exclude to skip Playwright tests and soda-treasury-service');
} else {
  console.log('Pattern not found. Looking for exclude...');
  const idx = c.indexOf('exclude:');
  if (idx > 0) {
    console.log('Found exclude at index', idx);
    console.log('Context:', c.substring(idx, idx + 80));
  }
}
