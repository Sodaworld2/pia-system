/**
 * PIA Browser Watcher
 * Observes the system and reports what it sees
 */

const { chromium } = require('playwright');
const fs = require('fs');

const REPORT_FILE = 'watcher-report.txt';

async function log(msg) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(REPORT_FILE, line + '\n');
}

async function main() {
  // Clear previous report
  fs.writeFileSync(REPORT_FILE, '═══════════════════════════════════════════\n');
  fs.appendFileSync(REPORT_FILE, '   PIA SYSTEM OBSERVATION REPORT\n');
  fs.appendFileSync(REPORT_FILE, '   ' + new Date().toLocaleString() + '\n');
  fs.appendFileSync(REPORT_FILE, '═══════════════════════════════════════════\n\n');

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('   PIA BROWSER WATCHER - OBSERVING...');
  console.log('═══════════════════════════════════════════');
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // === OBSERVE HEADER STATS ===
  await log('HEADER STATS:');
  try {
    const machines = await page.locator('#stat-machines').textContent();
    const agents = await page.locator('#stat-agents').textContent();
    const working = await page.locator('#stat-working').textContent();
    const alerts = await page.locator('#stat-alerts').textContent();
    const aiCost = await page.locator('#stat-ai-cost').textContent();

    await log(`  - Machines: ${machines}`);
    await log(`  - Agents: ${agents}`);
    await log(`  - Working: ${working}`);
    await log(`  - Alerts: ${alerts}`);
    await log(`  - AI Cost Today: ${aiCost}`);
  } catch (e) {
    await log(`  Error reading stats: ${e.message}`);
  }

  // === OBSERVE CONNECTION STATUS ===
  await log('');
  await log('CONNECTION STATUS:');
  try {
    const status = await page.locator('#connection-status .status-text').textContent();
    await log(`  - WebSocket: ${status}`);
  } catch (e) {
    await log(`  Error: ${e.message}`);
  }

  // === OBSERVE FLEET MATRIX ===
  await log('');
  await log('FLEET MATRIX:');
  await page.click('a[data-view="fleet"]');
  await page.waitForTimeout(1000);

  try {
    const agentTiles = await page.locator('.agent-tile').count();
    await log(`  - Agent tiles visible: ${agentTiles}`);

    if (agentTiles > 0) {
      const tiles = page.locator('.agent-tile');
      for (let i = 0; i < Math.min(agentTiles, 5); i++) {
        const tile = tiles.nth(i);
        const name = await tile.locator('.agent-name').textContent().catch(() => 'Unknown');
        const status = await tile.getAttribute('data-status').catch(() => 'unknown');
        await log(`    [${i+1}] ${name} - ${status}`);
      }
    } else {
      await log('  - No agents in fleet (empty state shown)');
    }
  } catch (e) {
    await log(`  Error reading fleet: ${e.message}`);
  }

  // Take screenshot
  await page.screenshot({ path: 'screenshots/watcher-fleet.png' });
  await log('  - Screenshot: screenshots/watcher-fleet.png');

  // === OBSERVE COMMAND CENTER ===
  await log('');
  await log('COMMAND CENTER:');
  await page.click('a[data-view="command"]');
  await page.waitForTimeout(1000);

  try {
    const messages = await page.locator('.chat-message').count();
    await log(`  - Chat messages: ${messages}`);

    const orchStatus = await page.locator('#orchestrator-status .status-text').textContent().catch(() => 'Unknown');
    await log(`  - Orchestrator: ${orchStatus}`);
  } catch (e) {
    await log(`  Error: ${e.message}`);
  }

  await page.screenshot({ path: 'screenshots/watcher-command.png' });
  await log('  - Screenshot: screenshots/watcher-command.png');

  // === OBSERVE CLI TUNNEL ===
  await log('');
  await log('CLI TUNNEL:');
  await page.click('a[data-view="tunnel"]');
  await page.waitForTimeout(1000);

  try {
    const sessionOptions = await page.locator('#session-select option').count();
    await log(`  - Sessions available: ${sessionOptions - 1}`); // minus the "Select Session" option

    // Check if terminal has content
    const terminalContent = await page.locator('#terminal').textContent().catch(() => '');
    const hasContent = terminalContent.trim().length > 0;
    await log(`  - Terminal has content: ${hasContent}`);
  } catch (e) {
    await log(`  Error: ${e.message}`);
  }

  await page.screenshot({ path: 'screenshots/watcher-tunnel.png' });
  await log('  - Screenshot: screenshots/watcher-tunnel.png');

  // === OBSERVE MCP STATUS ===
  await log('');
  await log('MCP SERVERS:');
  await page.click('a[data-view="mcps"]');
  await page.waitForTimeout(1000);

  try {
    const installedMcps = await page.locator('#mcp-installed .mcp-card').count();
    await log(`  - Installed MCPs: ${installedMcps}`);
  } catch (e) {
    await log(`  Error: ${e.message}`);
  }

  await page.screenshot({ path: 'screenshots/watcher-mcps.png' });

  // === OBSERVE AI MODELS ===
  await log('');
  await log('AI MODELS:');
  await page.click('a[data-view="ai"]');
  await page.waitForTimeout(1000);

  try {
    const costToday = await page.locator('#cost-today').textContent().catch(() => '$0.00');
    const costWeek = await page.locator('#cost-week').textContent().catch(() => '$0.00');
    const costMonth = await page.locator('#cost-month').textContent().catch(() => '$0.00');

    await log(`  - Cost Today: ${costToday}`);
    await log(`  - Cost This Week: ${costWeek}`);
    await log(`  - Cost This Month: ${costMonth}`);

    // Check provider statuses
    const providers = ['ollama', 'gemini', 'openai', 'grok'];
    for (const p of providers) {
      const statusText = await page.locator(`[data-provider="${p}"] .status-text`).textContent().catch(() => 'Unknown');
      await log(`  - ${p}: ${statusText}`);
    }
  } catch (e) {
    await log(`  Error: ${e.message}`);
  }

  await page.screenshot({ path: 'screenshots/watcher-ai.png' });

  // === OBSERVE ALERTS ===
  await log('');
  await log('ALERTS:');
  await page.click('a[data-view="alerts"]');
  await page.waitForTimeout(1000);

  try {
    const alertItems = await page.locator('.alerts-list .alert-item').count();
    const emptyState = await page.locator('#alerts-empty').isVisible();

    if (emptyState) {
      await log('  - No alerts (all systems operational)');
    } else {
      await log(`  - Active alerts: ${alertItems}`);
    }
  } catch (e) {
    await log(`  Error: ${e.message}`);
  }

  // === FINAL SUMMARY ===
  await log('');
  await log('═══════════════════════════════════════════');
  await log('   OBSERVATION COMPLETE');
  await log('═══════════════════════════════════════════');
  await log('');
  await log('Full report saved to: watcher-report.txt');
  await log('Screenshots saved to: screenshots/watcher-*.png');

  console.log('');
  console.log('Browser staying open for you to explore...');
  console.log('Press Ctrl+C to close when done.');

  // Keep browser open for 30 minutes
  await page.waitForTimeout(30 * 60 * 1000);
  await browser.close();
}

main().catch(console.error);
