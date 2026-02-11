/**
 * Show Fleet Matrix with agents
 */
const { chromium } = require('playwright');
const path = require('path');

async function showFleet() {
  console.log('Opening PIA Dashboard - Fleet Matrix with Agents...\n');

  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  // Wait for connection
  await page.waitForFunction(() => window.app && window.app.connected, { timeout: 10000 });
  console.log('Connected!\n');

  // Take screenshot
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'fleet-with-agents.png') });
  console.log('Screenshot saved: screenshots/fleet-with-agents.png\n');

  console.log('4 Agents are now visible in Fleet Matrix:');
  console.log('  1. Claude-Main (working) - Building PIA System');
  console.log('  2. Claude-Research (idle) - Ready for research');
  console.log('  3. Gemini-Docs (working) - Generating API docs');
  console.log('  4. Claude-Finance (waiting) - Waiting for invoice approval\n');

  console.log('Browser will stay open for 10 minutes.');
  console.log('Refresh the page if agents do not appear.\n');

  // Keep open
  await page.waitForTimeout(600000);
  await browser.close();
}

showFleet().catch(console.error);
