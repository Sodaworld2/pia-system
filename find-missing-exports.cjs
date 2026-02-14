const fs = require('fs');
const path = require('path');
const base = 'C:/Users/User/Documents/GitHub/DAOV1';

function findFiles(dir, ext, results) {
  results = results || [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item === 'node_modules' || item === '.git' || item === 'dist' || item === 'build') continue;
      const full = path.join(dir, item);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) findFiles(full, ext, results);
        else if (ext.some(e => item.endsWith(e))) results.push(full);
      } catch (e) {}
    }
  } catch (e) {}
  return results;
}

// Find all imports from dao/service
const files = findFiles(path.join(base, 'src'), ['.ts', '.tsx']);
const imports = new Set();
const importLocations = {};

for (const f of files) {
  try {
    const c = fs.readFileSync(f, 'utf8');
    const relPath = path.relative(base, f).replace(/\\/g, '/');
    const lines = c.split('\n');
    for (const l of lines) {
      if (l.includes('dao/service') && l.includes('import')) {
        const match = l.match(/import\s*\{([^}]+)\}/);
        if (match) {
          match[1].split(',').forEach(n => {
            const name = n.trim().split(' as ')[0].trim();
            if (name) {
              imports.add(name);
              if (!importLocations[name]) importLocations[name] = [];
              importLocations[name].push(relPath);
            }
          });
        }
      }
    }
  } catch (e) {}
}

// Read service file exports
const svcPath = path.join(base, 'src/dao/service.ts');
const svcContent = fs.readFileSync(svcPath, 'utf8');
const exportMatches = svcContent.match(/export const (\w+)/g) || [];
const exportedNames = exportMatches.map(e => e.replace('export const ', ''));

console.log('IMPORTS from dao/service across codebase:');
const sorted = [...imports].sort();
sorted.forEach(n => console.log('  ' + n));
console.log('Total imports: ' + sorted.length);

console.log('\nEXPORTS in dao/service.ts:');
exportedNames.forEach(n => console.log('  ' + n));
console.log('Total exports: ' + exportedNames.length);

console.log('\nMISSING (imported but not exported):');
const missing = [];
sorted.forEach(n => {
  const isExported = svcContent.includes('export const ' + n) ||
                     svcContent.includes('export function ' + n) ||
                     svcContent.includes('export type ' + n) ||
                     svcContent.includes('export interface ' + n);
  if (!isExported) {
    missing.push(n);
    console.log('  MISSING: ' + n + ' (used by: ' + (importLocations[n] || []).join(', ') + ')');
  }
});
console.log('Total missing: ' + missing.length);

// Also check DashboardLayout for outlet context
console.log('\nDASHBOARD LAYOUT CHECK:');
const layoutPath = path.join(base, 'src/layouts/DashboardLayout.tsx');
try {
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');
  const hasOutletContext = layoutContent.includes('context=');
  const hasOutlet = layoutContent.includes('<Outlet');
  console.log('  Has <Outlet>: ' + hasOutlet);
  console.log('  Passes context: ' + hasOutletContext);
  if (!hasOutletContext) {
    console.log('  NOTE: DashboardLayout renders <Outlet /> without context');
    console.log('  DashboardOverview expects { daoData } from useOutletContext');
  }
} catch (e) {
  console.log('  ERROR: ' + e.message);
}

console.log('\nANALYSIS_DONE');
