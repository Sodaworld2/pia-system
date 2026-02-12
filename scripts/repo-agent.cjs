#!/usr/bin/env node
/**
 * PIA Repo Agent
 *
 * Drop this into any repo with a .pia/ directory.
 * It registers with the PIA hub, watches for incoming tasks,
 * executes them, and logs everything.
 *
 * Usage:
 *   node repo-agent.cjs                     (auto-detects .pia/ in cwd)
 *   node repo-agent.cjs --path /path/to/repo
 *
 * The agent:
 *   1. Reads .pia/identity.json
 *   2. Registers with PIA hub
 *   3. Watches .pia/queue/pending.json for tasks
 *   4. Polls hub for assigned tasks
 *   5. Logs completed jobs to .pia/jobs/history.jsonl
 *   6. Reports state back to hub
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

const REPO_PATH = getArg('path') || process.cwd();
const PIA_DIR = path.join(REPO_PATH, '.pia');

// Validate
if (!fs.existsSync(path.join(PIA_DIR, 'identity.json'))) {
  console.error(`Error: No .pia/identity.json found at ${REPO_PATH}`);
  console.error('Run init-repo.cjs first to make this repo alive.');
  process.exit(1);
}

const identity = JSON.parse(fs.readFileSync(path.join(PIA_DIR, 'identity.json'), 'utf-8'));
const HUB_URL = getArg('hub') || identity.hubUrl || 'http://100.73.133.3:3000';
const TOKEN = getArg('token') || identity.hubToken || 'pia-local-dev-token-2024';
const POLL_INTERVAL = 5000; // 5 seconds

console.log('============================================');
console.log(`  PIA Repo Agent: ${identity.displayName}`);
console.log('============================================');
console.log(`  Repo:     ${identity.name}`);
console.log(`  Path:     ${REPO_PATH}`);
console.log(`  Machine:  ${os.hostname()}`);
console.log(`  Hub:      ${HUB_URL}`);
console.log(`  Caps:     ${identity.capabilities.join(', ')}`);
console.log('============================================\n');

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

function readState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PIA_DIR, 'state.json'), 'utf-8'));
  } catch {
    return { status: 'idle', currentTask: null, lastActivity: new Date().toISOString(), totalJobsCompleted: 0, totalJobsFailed: 0 };
  }
}

function writeState(state) {
  fs.writeFileSync(path.join(PIA_DIR, 'state.json'), JSON.stringify(state, null, 2));
}

function setState(updates) {
  const state = readState();
  Object.assign(state, updates, { lastActivity: new Date().toISOString() });
  writeState(state);
  return state;
}

// ---------------------------------------------------------------------------
// Job logging
// ---------------------------------------------------------------------------

function logJob(job) {
  const logPath = path.join(PIA_DIR, 'jobs', 'history.jsonl');
  fs.appendFileSync(logPath, JSON.stringify(job) + '\n');
}

function getJobHistory(limit = 20) {
  const logPath = path.join(PIA_DIR, 'jobs', 'history.jsonl');
  try {
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(l => JSON.parse(l)).reverse();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

function readQueue() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PIA_DIR, 'queue', 'pending.json'), 'utf-8'));
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  fs.writeFileSync(path.join(PIA_DIR, 'queue', 'pending.json'), JSON.stringify(queue, null, 2));
}

function enqueueTask(task) {
  const queue = readQueue();
  queue.push({ ...task, enqueuedAt: Date.now() });
  writeQueue(queue);
  console.log(`  [+] Task enqueued: ${task.action} - ${task.description || ''}`);
}

function dequeueTask() {
  const queue = readQueue();
  if (queue.length === 0) return null;
  const task = queue.shift();
  writeQueue(queue);
  return task;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function apiCall(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, HUB_URL);
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': TOKEN,
      },
    };

    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Hub registration
// ---------------------------------------------------------------------------

async function registerWithHub() {
  try {
    const state = readState();
    const res = await apiCall('POST', '/api/repos/register', {
      identity: {
        name: identity.name,
        displayName: identity.displayName,
        description: identity.description,
        capabilities: identity.capabilities,
        techStack: identity.techStack || [],
        machineId: identity.machineId || `machine-${os.hostname().toLowerCase()}`,
        machineName: identity.machineName || os.hostname(),
        port: identity.port || 0,
        acceptsTasksFrom: identity.acceptsTasksFrom || ['*'],
      },
      state,
    });

    if (res.status === 201) {
      console.log('  [+] Registered with PIA hub');
      return true;
    } else {
      console.log(`  [!] Registration response: ${res.status} ${JSON.stringify(res.data)}`);
      return false;
    }
  } catch (err) {
    console.log(`  [!] Cannot reach PIA hub: ${err.message}`);
    console.log('  [!] Running in offline mode (local queue only)');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Task execution
// ---------------------------------------------------------------------------

async function executeTask(task) {
  const jobId = task.jobId || task.id || `local-${Date.now()}`;
  console.log(`\n  [>] Executing: ${task.action} - ${task.description || ''}`);
  console.log(`      Job ID: ${jobId}`);

  setState({ status: 'working', currentTask: `${task.action}: ${task.description || ''}` });

  // Report to hub that job started
  try {
    await apiCall('PUT', `/api/repos/${identity.name}/jobs/${jobId}`, {
      status: 'running',
      startedAt: Date.now(),
    });
  } catch { /* offline */ }

  // Report state to hub
  try {
    await apiCall('PUT', `/api/repos/${identity.name}/state`, {
      status: 'working',
      currentTask: `${task.action}: ${task.description || ''}`,
    });
  } catch { /* offline */ }

  const startTime = Date.now();
  let result = null;
  let error = null;

  try {
    // Execute based on action type
    result = await performAction(task.action, task.description, task.params);
    console.log(`  [+] Completed: ${result.substring(0, 200)}`);
  } catch (err) {
    error = err.message;
    console.log(`  [!] Failed: ${error}`);
  }

  const completedAt = Date.now();
  const duration = completedAt - startTime;
  const status = error ? 'failed' : 'completed';

  // Log to local history
  const jobLog = {
    id: jobId,
    action: task.action,
    description: task.description,
    params: task.params,
    requestedBy: task.requestedBy || 'unknown',
    startedAt: startTime,
    completedAt,
    duration,
    status,
    result: result?.substring(0, 2000),
    error,
  };
  logJob(jobLog);

  // Update local state
  const state = readState();
  if (status === 'completed') state.totalJobsCompleted++;
  else state.totalJobsFailed++;
  setState({ ...state, status: 'idle', currentTask: null });

  // Report to hub
  try {
    await apiCall('PUT', `/api/repos/${identity.name}/jobs/${jobId}`, {
      status,
      result: result?.substring(0, 2000),
      error,
      completedAt,
    });
    await apiCall('PUT', `/api/repos/${identity.name}/state`, {
      status: 'idle',
      currentTask: null,
      totalJobsCompleted: state.totalJobsCompleted,
      totalJobsFailed: state.totalJobsFailed,
    });
  } catch { /* offline */ }

  console.log(`  [${status === 'completed' ? '+' : '!'}] Job ${jobId}: ${status} (${duration}ms)\n`);
}

async function performAction(action, description, params) {
  // Load knowledge base for context
  const knowledgePath = path.join(PIA_DIR, 'knowledge');
  let knowledge = '';
  if (fs.existsSync(knowledgePath)) {
    const files = fs.readdirSync(knowledgePath).filter(f => f.endsWith('.md'));
    for (const f of files) {
      knowledge += fs.readFileSync(path.join(knowledgePath, f), 'utf-8') + '\n\n';
    }
  }

  // For now, log the task. In production, this would invoke Claude or execute scripts.
  const result = `Task "${action}" acknowledged by ${identity.displayName}. Description: ${description || 'none'}. Knowledge base loaded (${knowledge.length} chars). Params: ${JSON.stringify(params || {})}`;

  // If there's a matching script in the repo, we could execute it:
  // e.g., npm run build, npm test, etc.
  // For safety, we just log for now and return acknowledgment.

  return result;
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

async function pollForTasks() {
  // Check local queue first
  const localTask = dequeueTask();
  if (localTask) {
    await executeTask(localTask);
    return;
  }

  // Check hub for assigned tasks
  try {
    const res = await apiCall('GET', `/api/repos/${identity.name}/jobs?status=queued&limit=1`);
    if (res.data?.jobs?.length > 0) {
      const job = res.data.jobs[0];
      await executeTask({
        jobId: job.id,
        action: job.action,
        description: job.description,
        params: job.params,
        requestedBy: job.requestedBy,
      });
    }
  } catch {
    // Hub unreachable, keep watching local queue
  }
}

// ---------------------------------------------------------------------------
// Local API (optional mini server for direct repo-to-repo)
// ---------------------------------------------------------------------------

function startLocalAPI() {
  if (!identity.port || identity.port === 0) return;

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/status') {
      res.end(JSON.stringify({ ...readState(), identity: { name: identity.name, displayName: identity.displayName } }));
      return;
    }

    if (req.method === 'GET' && req.url === '/jobs') {
      res.end(JSON.stringify(getJobHistory()));
      return;
    }

    if (req.method === 'POST' && req.url === '/task') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const task = JSON.parse(body);
          enqueueTask(task);
          res.statusCode = 201;
          res.end(JSON.stringify({ status: 'queued', task }));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(identity.port, () => {
    console.log(`  [+] Local API running on port ${identity.port}`);
  });
}

// ---------------------------------------------------------------------------
// File watcher for queue
// ---------------------------------------------------------------------------

function watchQueue() {
  const queuePath = path.join(PIA_DIR, 'queue', 'pending.json');
  let debounce = null;

  fs.watch(queuePath, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const queue = readQueue();
      if (queue.length > 0) {
        console.log(`  [!] ${queue.length} task(s) detected in local queue`);
        await pollForTasks();
      }
    }, 1000);
  });

  console.log('  [+] Watching .pia/queue/pending.json for tasks');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Register with hub
  const connected = await registerWithHub();

  // Start local API if port configured
  startLocalAPI();

  // Watch local queue
  watchQueue();

  // Start polling loop
  console.log(`  [+] Polling for tasks every ${POLL_INTERVAL / 1000}s`);
  console.log('  [+] Agent is alive and waiting for work!\n');

  setInterval(async () => {
    try {
      await pollForTasks();
    } catch (err) {
      // silent
    }

    // Send heartbeat state to hub
    try {
      const state = readState();
      await apiCall('PUT', `/api/repos/${identity.name}/state`, state);
    } catch { /* offline */ }
  }, POLL_INTERVAL);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n  Shutting down repo agent...');
    setState({ status: 'offline', currentTask: null });
    try {
      apiCall('PUT', `/api/repos/${identity.name}/state`, { status: 'offline' });
    } catch { /* ignore */ }
    process.exit(0);
  });
}

main();
