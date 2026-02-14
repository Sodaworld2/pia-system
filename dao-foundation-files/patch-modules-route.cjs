const fs = require('fs');
let f = fs.readFileSync('src/index.ts', 'utf8');

if (f.includes('modulesRouter')) {
  console.log('Already patched with modulesRouter');
  process.exit(0);
}

// Add import
f = f.replace(
  "import brainRouter from './routes/brain';",
  "import brainRouter from './routes/brain';\nimport modulesRouter from './routes/modules';"
);

// Add route mounting after brain router
f = f.replace(
  "app.use('/api/brain', brainRouter);",
  "app.use('/api/brain', brainRouter);\napp.use('/api/modules', modulesRouter);"
);

fs.writeFileSync('src/index.ts', f);
console.log('PATCHED: Added /api/modules route to index.ts');
