const fs = require('fs');
const path = require('path');

// Read vitest/vite config
const files = [
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.config.js',
  'package.json'
];

files.forEach(f => {
  const full = path.join('.', f);
  if (fs.existsSync(full)) {
    const c = fs.readFileSync(full, 'utf8');
    console.log('=== ' + f + ' ===');
    // For package.json, just show relevant parts
    if (f === 'package.json') {
      const pkg = JSON.parse(c);
      console.log('scripts:', JSON.stringify(pkg.scripts, null, 2));
      if (pkg.vitest) console.log('vitest config:', JSON.stringify(pkg.vitest, null, 2));
    } else {
      console.log(c);
    }
    console.log('');
  } else {
    console.log('=== ' + f + ' === NOT FOUND');
  }
});

// Also check if there's a vitest workspace
['vitest.workspace.ts', 'vitest.workspace.js'].forEach(f => {
  if (fs.existsSync(f)) {
    console.log('=== ' + f + ' ===');
    console.log(fs.readFileSync(f, 'utf8'));
  }
});

// Check soda-treasury-service
const stPath = 'soda-treasury-service/package.json';
if (fs.existsSync(stPath)) {
  const pkg = JSON.parse(fs.readFileSync(stPath, 'utf8'));
  console.log('=== soda-treasury-service/package.json ===');
  console.log('deps:', JSON.stringify(pkg.dependencies || {}, null, 2));
  console.log('devDeps:', JSON.stringify(pkg.devDependencies || {}, null, 2));
}

// Check which test files are failing templates
const templateTests = [
  'templates/AdviserAgreements.test.tsx',
  'templates/DAOCreationWizard.test.tsx',
  'templates/GovernanceVoting.test.tsx',
  'templates/IdeaBubbles.test.tsx',
  'templates/TokenDistribution.test.tsx'
];

templateTests.forEach(f => {
  if (fs.existsSync(f)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    console.log('=== ' + f + ' (first 5 lines) ===');
    console.log(lines.slice(0, 5).join('\n'));
    console.log('... (' + lines.length + ' total lines)');
  }
});
