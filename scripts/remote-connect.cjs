#!/usr/bin/env node
/**
 * PIA Remote Connector
 *
 * Run this on any remote machine to connect it to the PIA hub.
 * Supports: Tailscale (direct), Ngrok (tunnel), or API polling.
 *
 * Usage:
 *   node remote-connect.cjs --hub http://100.73.133.3:3000     (Tailscale)
 *   node remote-connect.cjs --hub https://abc123.ngrok.io       (Ngrok)
 *   node remote-connect.cjs --hub http://localhost:3000          (Same machine)
 *
 * Options:
 *   --hub <url>       PIA hub URL (required)
 *   --name <name>     This machine's name (default: hostname)
 *   --project <name>  Project name on this machine (e.g. "DAO", "Farcake")
 *   --token <token>   API token (default: pia-local-dev-token-2024)
 *   --ws              Use WebSocket (default, fastest)
 *   --poll            Use HTTP polling instead of WebSocket
 */

const http = require('http');
const https = require('https');
const os = require('os');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

const HUB_URL = getArg('hub') || process.env.PIA_HUB_URL || 'http://100.73.133.3:3000';
const MACHINE_NAME = getArg('name') || os.hostname();
const PROJECT = getArg('project') || 'unknown';
const TOKEN = getArg('token') || process.env.PIA_SECRET_TOKEN || 'pia-local-dev-token-2024';
const USE_POLL = args.includes('--poll');
const MACHINE_ID = `remote-${MACHINE_NAME.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

console.log('============================================');
console.log('  PIA Remote Connector');
console.log('============================================');
console.log(`  Machine:  ${MACHINE_NAME}`);
console.log(`  ID:       ${MACHINE_ID}`);
console.log(`  Project:  ${PROJECT}`);
console.log(`  Hub:      ${HUB_URL}`);
console.log(`  Mode:     ${USE_POLL ? 'HTTP Polling' : 'WebSocket'}`);
console.log('============================================\n');

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, HUB_URL);
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
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// WebSocket mode
// ---------------------------------------------------------------------------

async function connectWebSocket() {
  // Try to use ws if available, otherwise fall back to polling
  let WebSocket;
  try {
    WebSocket = require('ws');
  } catch {
    console.log('  [!] "ws" package not installed. Install it with: npm install ws');
    console.log('  [!] Falling back to HTTP polling mode.\n');
    return connectPolling();
  }

  const wsUrl = HUB_URL.replace(/^http/, 'ws').replace(/:3000/, ':3001');
  console.log(`  Connecting to WebSocket: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('  [+] WebSocket connected!\n');

    // Authenticate
    ws.send(JSON.stringify({ type: 'auth', payload: { token: TOKEN } }));

    // Register as remote machine
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'relay:register',
        payload: {
          id: MACHINE_ID,
          name: MACHINE_NAME,
          hostname: os.hostname(),
          project: PROJECT,
        },
      }));
    }, 500);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'auth') {
        if (msg.success) {
          console.log('  [+] Authenticated with hub');
        } else {
          console.log('  [!] Authentication failed!');
          process.exit(1);
        }
        return;
      }

      if (msg.type === 'relay:registered') {
        console.log(`  [+] Registered with hub as "${MACHINE_NAME}"`);
        console.log(`  [+] Hub: ${msg.payload?.hub?.name || 'unknown'}\n`);
        console.log('  Ready! Type messages below to send to the hub.');
        console.log('  Commands: /machines, /status, /quit\n');
        startInteractive(ws);
        return;
      }

      if (msg.type === 'relay:message') {
        const relay = msg.payload;
        const from = relay?.from?.machineName || 'unknown';
        const content = relay?.content || '';
        const type = relay?.type || 'chat';
        console.log(`\n  [${from}] (${type}): ${content}\n> `);
        return;
      }

      // Other messages (agent updates, alerts, etc.)
      if (msg.type !== 'pong') {
        console.log(`  [hub] ${msg.type}: ${JSON.stringify(msg.payload || '').substring(0, 100)}`);
      }
    } catch {
      // ignore parse errors
    }
  });

  ws.on('close', () => {
    console.log('\n  [!] Disconnected from hub. Reconnecting in 5s...');
    setTimeout(connectWebSocket, 5000);
  });

  ws.on('error', (err) => {
    console.log(`  [!] WebSocket error: ${err.message}`);
  });
}

function startInteractive(ws) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input === '/quit' || input === '/exit') {
      console.log('Goodbye!');
      ws.close();
      process.exit(0);
    }

    if (input === '/machines') {
      apiCall('GET', '/api/relay/machines')
        .then(res => {
          console.log('\n  Connected machines:');
          const machines = res.data?.machines || [];
          if (machines.length === 0) {
            console.log('    (none)');
          }
          for (const m of machines) {
            const ago = Math.floor((Date.now() - m.lastSeen) / 1000);
            console.log(`    - ${m.name} [${m.project || '?'}] (${m.channels?.join(', ')}) last seen ${ago}s ago`);
          }
          console.log();
          rl.prompt();
        })
        .catch(err => { console.log(`  Error: ${err.message}`); rl.prompt(); });
      return;
    }

    if (input === '/status') {
      apiCall('GET', '/api/relay/stats')
        .then(res => {
          console.log('\n  Relay stats:', JSON.stringify(res.data, null, 2), '\n');
          rl.prompt();
        })
        .catch(err => { console.log(`  Error: ${err.message}`); rl.prompt(); });
      return;
    }

    // Send as chat message
    ws.send(JSON.stringify({
      type: 'relay:broadcast',
      payload: {
        content: input,
        type: 'chat',
        metadata: { project: PROJECT },
      },
    }));

    rl.prompt();
  });

  rl.on('close', () => {
    ws.close();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// HTTP Polling mode (fallback)
// ---------------------------------------------------------------------------

async function connectPolling() {
  console.log('  Using HTTP polling mode...\n');

  // Register
  try {
    const res = await apiCall('POST', '/api/relay/register', {
      id: MACHINE_ID,
      name: MACHINE_NAME,
      hostname: os.hostname(),
      project: PROJECT,
      channels: ['api'],
    });

    if (res.status === 201) {
      console.log(`  [+] Registered with hub: ${res.data?.hub?.name || 'unknown'}\n`);
    } else {
      console.log(`  [!] Registration failed: ${JSON.stringify(res.data)}`);
      process.exit(1);
    }
  } catch (err) {
    console.log(`  [!] Cannot reach hub at ${HUB_URL}: ${err.message}`);
    process.exit(1);
  }

  // Start polling
  let lastPoll = Date.now();

  setInterval(async () => {
    try {
      const res = await apiCall('GET', `/api/relay/poll/${MACHINE_ID}?since=${lastPoll}`);
      lastPoll = Date.now();

      if (res.data?.messages?.length > 0) {
        for (const msg of res.data.messages) {
          const from = msg.from?.machineName || 'unknown';
          console.log(`  [${from}] (${msg.type}): ${msg.content}`);
        }
      }
    } catch {
      // silent polling failure
    }
  }, 3000);

  // Interactive input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  console.log('  Ready! Type messages below to send to the hub.');
  console.log('  Commands: /machines, /status, /quit\n');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input === '/quit' || input === '/exit') {
      console.log('Goodbye!');
      process.exit(0);
    }

    if (input === '/machines') {
      try {
        const res = await apiCall('GET', '/api/relay/machines');
        console.log('\n  Connected machines:');
        for (const m of res.data?.machines || []) {
          console.log(`    - ${m.name} [${m.project || '?'}]`);
        }
        console.log();
      } catch (err) { console.log(`  Error: ${err.message}`); }
      rl.prompt();
      return;
    }

    if (input === '/status') {
      try {
        const res = await apiCall('GET', '/api/relay/stats');
        console.log('\n  Stats:', JSON.stringify(res.data, null, 2), '\n');
      } catch (err) { console.log(`  Error: ${err.message}`); }
      rl.prompt();
      return;
    }

    // Send message
    try {
      await apiCall('POST', '/api/relay/broadcast', {
        content: input,
        type: 'chat',
        metadata: { project: PROJECT },
      });
    } catch (err) {
      console.log(`  [!] Send failed: ${err.message}`);
    }
    rl.prompt();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (USE_POLL) {
  connectPolling();
} else {
  connectWebSocket();
}
