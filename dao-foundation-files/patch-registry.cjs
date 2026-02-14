const fs = require('fs');
let f = fs.readFileSync('src/index.ts', 'utf8');
if (f.includes('ModuleRegistry')) { console.log('Already patched'); process.exit(0); }

// Add import
f = f.replace(
  "import { initializeRAG } from './ai';",
  "import { ModuleRegistry } from './modules';\nimport { initializeRAG } from './ai';"
);

// Add initialization after DB admin services, before RAG
const registryInit = [
  '// Initialize AI Module Registry',
  '        try {',
  "          const registry = new ModuleRegistry(require('./database').default);",
  '          (global as any).__moduleRegistry = registry;',
  "          logger.info('Module Registry initialized', { modules: registry.availableModules });",
  '        } catch (regErr) {',
  "          logger.warn('Module Registry init failed (non-blocking)', { error: String(regErr) });",
  '        }',
  '',
  '        // Initialize RAG pipeline',
].join('\n');

f = f.replace('// Initialize RAG pipeline', registryInit);

fs.writeFileSync('src/index.ts', f);
console.log('PATCHED index.ts with ModuleRegistry');
