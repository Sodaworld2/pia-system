/**
 * Simply open the PIA Dashboard
 */
const { chromium } = require('playwright');

async function openDashboard() {
  console.log('Opening PIA Dashboard...\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  console.log('Dashboard is open at http://localhost:3000');
  console.log('Browser will stay open for 10 minutes.\n');
  console.log('What you can see:');
  console.log('  - Fleet Matrix: 4 agents registered');
  console.log('  - CLI Tunnel: Create terminal sessions');
  console.log('  - AI Models: Ollama connected (qwen2.5-coder:7b)');
  console.log('\nExplore the tabs!');

  await page.waitForTimeout(600000);
  await browser.close();
}

openDashboard().catch(console.error);
