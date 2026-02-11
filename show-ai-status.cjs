/**
 * Show AI Models status with Ollama connected
 */
const { chromium } = require('playwright');
const path = require('path');

async function showAI() {
  console.log('Opening AI Models view...\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  await page.waitForFunction(() => window.app && window.app.connected, { timeout: 10000 });

  // Click AI Models tab
  await page.click('[data-view="ai"]');
  await page.waitForTimeout(1000);

  // Click Refresh Status
  const refreshBtn = await page.$('button:has-text("Refresh")');
  if (refreshBtn) {
    await refreshBtn.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'ai-status-ollama.png') });
  console.log('Screenshot: screenshots/ai-status-ollama.png\n');

  console.log('Browser will stay open for 5 minutes.');
  await page.waitForTimeout(300000);
  await browser.close();
}

showAI().catch(console.error);
