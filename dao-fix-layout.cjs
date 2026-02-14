const fs = require('fs');
const base = 'C:/Users/User/Documents/GitHub/DAOV1';
const layoutPath = base + '/src/layouts/DashboardLayout.tsx';

console.log('=== Fix DashboardLayout.tsx ===');

let content = fs.readFileSync(layoutPath, 'utf8');

// Fix 1: Add useState and useEffect to imports
content = content.replace(
  "import React, { Suspense, lazy } from 'react';",
  "import React, { Suspense, lazy, useState, useEffect } from 'react';"
);
console.log('  Fixed imports');

// Fix 2: Fix corrupted line - React.useState, useEffect(false) -> React.useState(false)
content = content.replace(
  'React.useState, useEffect(false)',
  'React.useState(false)'
);
console.log('  Fixed corrupted useState line');

// Write back
fs.writeFileSync(layoutPath, content, 'utf8');
console.log('  Saved');

// Verify
const final = fs.readFileSync(layoutPath, 'utf8');
const lines = final.split('\n');
lines.forEach((l, i) => {
  if (l.includes('import') && l.includes('react') || l.includes('useState') || l.includes('Outlet')) {
    console.log('  L' + (i+1) + ': ' + l.trim());
  }
});

console.log('FIX_LAYOUT_DONE');
