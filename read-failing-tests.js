const fs = require('fs');

const files = [
  'backend/src/routes/agreements.test.ts',
  'backend/src/routes/bubbles.test.ts',
  'backend/src/routes/firstborn-agreements.test.ts',
  'backend/src/routes/gemini.test.ts',
  'templates/AdviserAgreements.test.tsx',
  'templates/DAOCreationWizard.test.tsx',
  'templates/GovernanceVoting.test.tsx',
  'templates/IdeaBubbles.test.tsx',
  'templates/TokenDistribution.test.tsx',
  'templates/GovernanceVoting.tsx',
  'vitest.setup.ts'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    const c = fs.readFileSync(f, 'utf8');
    const lines = c.split('\n');
    console.log('=== ' + f + ' (' + lines.length + ' lines) ===');
    console.log(c);
    console.log('--- END ---');
    console.log('');
  } else {
    console.log('=== ' + f + ' === NOT FOUND');
  }
});
