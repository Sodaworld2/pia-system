// Quick test of the autonomous worker API
const http = require('http');

const payload = JSON.stringify({
  task: 'List the files in the src/orchestrator directory and tell me what each file does. Then create a test file at C:/Users/mic/Downloads/pia-system/data/worker-test.txt with the text "Autonomous worker is alive! Test passed at " followed by the current date.',
  model: 'claude-haiku-4-5-20251001',
  maxBudgetUsd: 0.10,
  projectDir: 'C:/Users/mic/Downloads/pia-system',
});

console.log('Sending task to autonomous worker...');
console.log(`Payload size: ${payload.length} bytes\n`);

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/orchestrator/run',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Token': 'pia-local-dev-token-2024',
  },
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.taskId) {
      console.log(`\nTask started! ID: ${result.taskId}`);
      console.log('Polling for result...\n');

      // Poll every 3 seconds
      const interval = setInterval(() => {
        const pollReq = http.request({
          hostname: 'localhost',
          port: 3000,
          path: `/api/orchestrator/task/${result.taskId}`,
          method: 'GET',
          headers: { 'X-Api-Token': 'pia-local-dev-token-2024' },
        }, (pollRes) => {
          let pollData = '';
          pollRes.on('data', chunk => pollData += chunk);
          pollRes.on('end', () => {
            const status = JSON.parse(pollData);
            if (status.status === 'running') {
              process.stdout.write('.');
            } else {
              clearInterval(interval);
              console.log('\n\n=== TASK COMPLETE ===');
              console.log(`Success: ${status.result.success}`);
              console.log(`Summary: ${status.result.summary}`);
              console.log(`Tool calls: ${status.result.toolCalls}`);
              console.log(`Cost: $${status.result.costUsd.toFixed(4)}`);
              console.log(`Duration: ${(status.result.durationMs / 1000).toFixed(1)}s`);
              console.log(`Tokens: ${status.result.totalTokens}`);
              console.log('\n--- Log ---');
              for (const entry of status.result.log) {
                if (entry.type === 'tool_call') {
                  console.log(`  [TOOL] ${entry.tool}(${JSON.stringify(entry.input).substring(0, 100)})`);
                } else if (entry.type === 'tool_result') {
                  console.log(`  [RESULT] ${(entry.output || '').substring(0, 150)}`);
                } else if (entry.type === 'done') {
                  console.log(`  [DONE] ${(entry.output || '').substring(0, 300)}`);
                } else if (entry.type === 'error') {
                  console.log(`  [ERROR] ${entry.output}`);
                }
              }
              process.exit(0);
            }
          });
        });
        pollReq.end();
      }, 3000);
    }
  });
});

req.on('error', (err) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});

req.write(payload);
req.end();
