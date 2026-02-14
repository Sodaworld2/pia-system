const fs = require('fs');
const path = require('path');
const base = 'C:/Users/User/Documents/GitHub/DAOV1';
const outDir = 'C:/Users/User/Documents/GitHub/pia-system/public';

const files = [
  'App.tsx',
  'AppNew.tsx',
  'src/routes/index.tsx',
  'src/dao/service.ts',
  'src/config/firebase.ts',
  'src/config/index.ts',
  'vite.config.ts',
  '.env',
  '.env.local',
  '.env.development',
  'src/hooks/useConnectionStatus.ts',
  'src/council/service.ts',
  'src/governance/service.ts',
  'src/marketplace/service.ts',
  'src/token-distribution/service.ts',
  'src/hooks/dao/useDAOMembers.ts',
  'src/pages/Council.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/DashboardOverview.tsx',
  'src/layouts/DashboardLayout.tsx',
  'index.tsx',
];

const out = {};
let found = 0;
for (const f of files) {
  try {
    const c = fs.readFileSync(path.join(base, f), 'utf8');
    out[f] = c.substring(0, 8000);
    found++;
  } catch (e) {
    out[f] = 'NOT_FOUND: ' + e.message;
  }
}

fs.writeFileSync(
  path.join(outDir, 'dao-dump.json'),
  JSON.stringify(out, null, 2),
  'utf8'
);
console.log('DUMP_OK: ' + found + ' files found');
