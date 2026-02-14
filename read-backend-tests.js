const fs = require('fs');
const http = require('http');

const files = [
  'backend/src/routes/agreements.test.ts',
  'backend/src/routes/bubbles.test.ts',
  'backend/src/routes/firstborn-agreements.test.ts',
  'backend/src/routes/gemini.test.ts'
];

let output = '';
files.forEach(f => {
  if (fs.existsSync(f)) {
    output += '=== ' + f + ' ===\n';
    output += fs.readFileSync(f, 'utf8');
    output += '\n--- END ---\n\n';
  } else {
    output += '=== ' + f + ' === NOT FOUND\n';
  }
});

// Also check if supertest is installed
try {
  require.resolve('supertest');
  output += '\nsupertest: INSTALLED\n';
} catch(e) {
  output += '\nsupertest: NOT INSTALLED\n';
}

// Check backend/src/index.ts exports
const idx = 'backend/src/index.ts';
if (fs.existsSync(idx)) {
  const c = fs.readFileSync(idx, 'utf8');
  output += '\n=== backend/src/index.ts (first 30 lines) ===\n';
  output += c.split('\n').slice(0, 30).join('\n');
  output += '\n--- END ---\n';
}

http.createServer((q,r) => { r.writeHead(200); r.end(output); }).listen(9879, () => console.log('SERVING 9879'));
