#!/usr/bin/env node
/**
 * PIA Repo Initializer
 *
 * Makes any repository "alive" by creating a .pia/ directory.
 * Run this inside any repo to give it an identity, knowledge base,
 * job history, and task queue.
 *
 * Usage:
 *   node init-repo.cjs                          (interactive)
 *   node init-repo.cjs --name wingspan --capabilities "presentations,passwords,docs"
 *   node init-repo.cjs --name dao --capabilities "smart-contracts,deploy,test"
 *   node init-repo.cjs --path C:\Users\mic\repos\wingspan
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

const REPO_PATH = getArg('path') || process.cwd();
const HUB_URL = getArg('hub') || 'http://100.73.133.3:3000';
const TOKEN = getArg('token') || 'pia-local-dev-token-2024';

// ---------------------------------------------------------------------------
// Interactive prompts
// ---------------------------------------------------------------------------

async function prompt(question, defaultVal) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    const suffix = defaultVal ? ` (${defaultVal})` : '';
    rl.question(`  ${question}${suffix}: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

async function main() {
  console.log('============================================');
  console.log('  PIA Repo Initializer');
  console.log('  Making this repo ALIVE');
  console.log('============================================');
  console.log(`  Repo path: ${REPO_PATH}\n`);

  // Check if already initialized
  const piaDir = path.join(REPO_PATH, '.pia');
  if (fs.existsSync(path.join(piaDir, 'identity.json'))) {
    console.log('  [!] This repo already has a .pia/identity.json');
    const overwrite = await prompt('  Overwrite? (y/n)', 'n');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('  Aborted.');
      process.exit(0);
    }
  }

  // Gather info
  const repoName = getArg('name') || path.basename(REPO_PATH);
  const name = getArg('name') || await prompt('Repo name', repoName);
  const displayName = await prompt('Display name', name.charAt(0).toUpperCase() + name.slice(1));
  const description = await prompt('What does this repo do?', `${displayName} project`);
  const capStr = getArg('capabilities') || await prompt('Capabilities (comma-separated)', 'code,build,test,deploy');
  const capabilities = capStr.split(',').map(c => c.trim()).filter(Boolean);
  const port = await prompt('Local agent port', '0');

  // Detect tech stack
  const techStack = detectTechStack(REPO_PATH);
  console.log(`\n  Detected tech stack: ${techStack.join(', ') || 'unknown'}`);

  // Create .pia/ structure
  console.log('\n  Creating .pia/ directory structure...\n');

  const dirs = [
    '.pia',
    '.pia/knowledge',
    '.pia/knowledge/custom',
    '.pia/jobs',
    '.pia/queue',
    '.pia/hooks',
    '.pia/log',
  ];

  for (const dir of dirs) {
    const fullPath = path.join(REPO_PATH, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`    + ${dir}/`);
    }
  }

  // Write identity.json
  const identity = {
    name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    displayName,
    description,
    capabilities,
    techStack,
    hubUrl: HUB_URL,
    hubToken: TOKEN,
    machineId: `machine-${os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    machineName: os.hostname(),
    port: parseInt(port) || 0,
    acceptsTasksFrom: ['*'],
    autoStart: true,
    createdAt: new Date().toISOString(),
    version: '1.0.0',
  };

  fs.writeFileSync(
    path.join(piaDir, 'identity.json'),
    JSON.stringify(identity, null, 2),
  );
  console.log('    + .pia/identity.json');

  // Write state.json
  const state = {
    status: 'idle',
    currentTask: null,
    lastActivity: new Date().toISOString(),
    totalJobsCompleted: 0,
    totalJobsFailed: 0,
    uptime: 0,
  };

  fs.writeFileSync(
    path.join(piaDir, 'state.json'),
    JSON.stringify(state, null, 2),
  );
  console.log('    + .pia/state.json');

  // Write empty queue
  fs.writeFileSync(
    path.join(piaDir, 'queue', 'pending.json'),
    JSON.stringify([], null, 2),
  );
  console.log('    + .pia/queue/pending.json');

  // Write jobs log (empty JSONL)
  fs.writeFileSync(
    path.join(piaDir, 'jobs', 'history.jsonl'),
    '',
  );
  console.log('    + .pia/jobs/history.jsonl');

  // Auto-generate knowledge base
  console.log('\n  Generating knowledge base...\n');
  generateKnowledgeBase(REPO_PATH, piaDir, identity);

  // Write hook templates
  writeHookTemplates(piaDir);

  // Add .pia/jobs/ and .pia/log/ to .gitignore if exists
  const gitignorePath = path.join(REPO_PATH, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    const additions = [];
    if (!gitignore.includes('.pia/jobs/')) additions.push('.pia/jobs/');
    if (!gitignore.includes('.pia/log/')) additions.push('.pia/log/');
    if (!gitignore.includes('.pia/queue/')) additions.push('.pia/queue/');
    if (!gitignore.includes('.pia/state.json')) additions.push('.pia/state.json');
    if (additions.length > 0) {
      fs.appendFileSync(gitignorePath, '\n# PIA Agent (runtime state)\n' + additions.join('\n') + '\n');
      console.log('    + Updated .gitignore with PIA runtime paths');
    }
  }

  console.log('\n============================================');
  console.log(`  ${displayName} is now ALIVE!`);
  console.log('============================================');
  console.log(`\n  Identity:  .pia/identity.json`);
  console.log(`  Knowledge: .pia/knowledge/`);
  console.log(`  Jobs log:  .pia/jobs/history.jsonl`);
  console.log(`  Queue:     .pia/queue/pending.json`);
  console.log(`  State:     .pia/state.json`);
  console.log(`\n  To connect to PIA hub:`);
  console.log(`    node ${path.relative(REPO_PATH, __filename).replace(/\\/g, '/')} (already done)`);
  console.log(`    OR run the repo-agent: node repo-agent.cjs`);
  console.log(`\n  To send this repo a task via API:`);
  console.log(`    curl -X POST ${HUB_URL}/api/repos/${identity.name}/task \\`);
  console.log(`      -H "X-Api-Token: ${TOKEN}" \\`);
  console.log(`      -H "Content-Type: application/json" \\`);
  console.log(`      -d '{"action":"build","description":"Build the project"}'`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Tech stack detection
// ---------------------------------------------------------------------------

function detectTechStack(repoPath) {
  const stack = [];
  const exists = (f) => fs.existsSync(path.join(repoPath, f));

  if (exists('package.json')) {
    stack.push('Node.js');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps['next']) stack.push('Next.js');
      if (allDeps['react']) stack.push('React');
      if (allDeps['vue']) stack.push('Vue');
      if (allDeps['express']) stack.push('Express');
      if (allDeps['prisma'] || allDeps['@prisma/client']) stack.push('Prisma');
      if (allDeps['typescript']) stack.push('TypeScript');
      if (allDeps['tailwindcss']) stack.push('Tailwind');
      if (allDeps['discord.js']) stack.push('Discord.js');
      if (allDeps['ethers'] || allDeps['web3']) stack.push('Web3');
      if (allDeps['hardhat'] || allDeps['foundry']) stack.push('Smart Contracts');
    } catch { /* ignore parse errors */ }
  }
  if (exists('requirements.txt') || exists('pyproject.toml')) stack.push('Python');
  if (exists('Cargo.toml')) stack.push('Rust');
  if (exists('go.mod')) stack.push('Go');
  if (exists('docker-compose.yml') || exists('Dockerfile')) stack.push('Docker');
  if (exists('.sol') || exists('contracts/')) stack.push('Solidity');
  if (exists('vercel.json') || exists('.vercel')) stack.push('Vercel');

  return stack;
}

// ---------------------------------------------------------------------------
// Knowledge base generation
// ---------------------------------------------------------------------------

function generateKnowledgeBase(repoPath, piaDir, identity) {
  // README summary
  const readmePath = path.join(repoPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf-8');
    const summary = readme.substring(0, 3000);
    fs.writeFileSync(
      path.join(piaDir, 'knowledge', 'readme-summary.md'),
      `# ${identity.displayName} - README Summary\n\n${summary}\n`,
    );
    console.log('    + .pia/knowledge/readme-summary.md (from README)');
  }

  // Package info
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      let content = `# ${identity.displayName} - Dependencies\n\n`;
      content += `## Scripts\n`;
      for (const [k, v] of Object.entries(pkg.scripts || {})) {
        content += `- \`npm run ${k}\`: ${v}\n`;
      }
      content += `\n## Dependencies\n`;
      for (const dep of Object.keys(pkg.dependencies || {})) {
        content += `- ${dep}\n`;
      }
      content += `\n## Dev Dependencies\n`;
      for (const dep of Object.keys(pkg.devDependencies || {})) {
        content += `- ${dep}\n`;
      }
      fs.writeFileSync(
        path.join(piaDir, 'knowledge', 'dependencies.md'),
        content,
      );
      console.log('    + .pia/knowledge/dependencies.md');
    } catch { /* ignore */ }
  }

  // Directory structure (top 2 levels)
  let structure = `# ${identity.displayName} - Directory Structure\n\n\`\`\`\n`;
  structure += scanDir(repoPath, '', 0, 2);
  structure += '```\n';
  fs.writeFileSync(
    path.join(piaDir, 'knowledge', 'structure.md'),
    structure,
  );
  console.log('    + .pia/knowledge/structure.md');

  // Identity doc (for Claude context)
  let identityDoc = `# ${identity.displayName} Agent Identity\n\n`;
  identityDoc += `You are the **${identity.displayName}** agent.\n\n`;
  identityDoc += `## About\n${identity.description}\n\n`;
  identityDoc += `## Capabilities\n`;
  for (const cap of identity.capabilities) {
    identityDoc += `- ${cap}\n`;
  }
  identityDoc += `\n## Tech Stack\n`;
  for (const tech of identity.techStack) {
    identityDoc += `- ${tech}\n`;
  }
  identityDoc += `\n## Rules\n`;
  identityDoc += `- Always log completed work to .pia/jobs/history.jsonl\n`;
  identityDoc += `- Update .pia/state.json when starting/finishing tasks\n`;
  identityDoc += `- Report status to PIA hub at ${identity.hubUrl}\n`;
  identityDoc += `- Accept tasks from: ${identity.acceptsTasksFrom.join(', ')}\n`;
  fs.writeFileSync(
    path.join(piaDir, 'knowledge', 'agent-identity.md'),
    identityDoc,
  );
  console.log('    + .pia/knowledge/agent-identity.md');
}

function scanDir(dirPath, prefix, depth, maxDepth) {
  if (depth >= maxDepth) return '';
  let result = '';
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const filtered = entries.filter(e =>
      !e.name.startsWith('.') &&
      e.name !== 'node_modules' &&
      e.name !== 'dist' &&
      e.name !== '.git' &&
      e.name !== '__pycache__' &&
      e.name !== 'target'
    );
    for (const entry of filtered.slice(0, 30)) { // cap at 30 entries per dir
      result += `${prefix}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}\n`;
      if (entry.isDirectory()) {
        result += scanDir(path.join(dirPath, entry.name), prefix + '  ', depth + 1, maxDepth);
      }
    }
  } catch { /* permission error etc */ }
  return result;
}

// ---------------------------------------------------------------------------
// Hook templates
// ---------------------------------------------------------------------------

function writeHookTemplates(piaDir) {
  // on-task hook
  fs.writeFileSync(
    path.join(piaDir, 'hooks', 'on-task.md'),
    `# On Task Hook
When a task arrives for this repo:
1. Read the task from .pia/queue/pending.json
2. Load knowledge from .pia/knowledge/
3. Execute the task using the repo's capabilities
4. Log the result to .pia/jobs/history.jsonl
5. Update .pia/state.json
6. Report completion to PIA hub
`,
  );
  console.log('    + .pia/hooks/on-task.md');

  // on-health hook
  fs.writeFileSync(
    path.join(piaDir, 'hooks', 'on-health.md'),
    `# On Health Check Hook
When a health check is requested:
1. Check if the repo builds successfully
2. Check if tests pass
3. Report status to PIA hub
`,
  );
  console.log('    + .pia/hooks/on-health.md');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
