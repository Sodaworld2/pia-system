const fs = require('fs');
const http = require('http');

const files = [
  'templates/AdviserAgreements.test.tsx',
  'templates/AdviserAgreements.tsx',
  'templates/DAOCreationWizard.test.tsx',
  'templates/DAOCreationWizard.tsx',
  'templates/GovernanceVoting.test.tsx',
  'templates/GovernanceVoting.tsx',
  'templates/IdeaBubbles.test.tsx',
  'templates/IdeaBubbles.tsx',
  'templates/TokenDistribution.test.tsx',
  'templates/TokenDistribution.tsx',
  'vitest.setup.ts',
  'src/agreements/service.ts',
  'src/governance/service.ts',
  'src/bubbles/service.ts',
  'src/token-distribution/service.ts'
];

let output = '';
files.forEach(f => {
  if (fs.existsSync(f)) {
    output += '=== ' + f + ' ===\n';
    output += fs.readFileSync(f, 'utf8');
    output += '\n--- END ---\n\n';
  } else {
    output += '=== ' + f + ' === NOT FOUND\n\n';
  }
});

const server = http.createServer((q,r) => { r.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'}); r.end(output); });
server.listen(9882, () => console.log('SERVING 9882 (' + output.length + ' chars)'));
