const fs = require('fs');
const path = require('path');
const base = 'C:/Users/User/Documents/GitHub/DAOV1';
const piaPublic = 'C:/Users/User/Documents/GitHub/pia-system/public';

console.log('=== Fix Routes Imports ===');

const routesPath = path.join(base, 'src/routes/index.tsx');
let content = fs.readFileSync(routesPath, 'utf8');
const backup = content;

// Fix lazy imports to match actual file names
const fixes = [
  ["import('../pages/BubblesPage')", "import('../pages/Bubbles')"],
  ["import('../pages/AgreementsPage')", "import('../pages/Agreements')"],
  ["import('../pages/GovernancePage')", "import('../pages/Governance')"],
  ["import('../pages/TokensPage')", "import('../pages/Tokens')"],
  ["import('../pages/MarketplacePage')", "import('../pages/Marketplace')"],
];

let fixCount = 0;
for (const [oldStr, newStr] of fixes) {
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    console.log('  Fixed: ' + oldStr + ' -> ' + newStr);
    fixCount++;
  } else {
    console.log('  OK (already correct or not found): ' + oldStr);
  }
}

if (content !== backup) {
  fs.writeFileSync(routesPath + '.bak2', backup, 'utf8');
  fs.writeFileSync(routesPath, content, 'utf8');
  console.log('\nDONE: Fixed ' + fixCount + ' imports in src/routes/index.tsx');
} else {
  console.log('\nNo changes needed');
}

// Verify the fix
console.log('\n=== Verify Fixed Imports ===');
const fixed = fs.readFileSync(routesPath, 'utf8');
const lazyLines = fixed.split('\n').filter(l => l.includes('lazy'));
lazyLines.forEach(l => console.log('  ' + l.trim()));

console.log('\nFIX_ROUTES_DONE');
