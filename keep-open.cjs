/**
 * Open PIA Dashboard and keep browser open
 */

const { chromium } = require('playwright');

async function openAndKeep() {
  console.log('Opening PIA Dashboard - Browser will stay open...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();

  // Dialog handler
  page.on('dialog', async dialog => {
    await dialog.accept('cmd');
  });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  // Wait for connection
  await page.waitForFunction(() => window.app && window.app.connected, { timeout: 10000 });
  console.log('Connected! Dashboard is open.\n');

  // Go to CLI Tunnel and create a session
  await page.click('[data-view="tunnel"]');
  await page.waitForTimeout(500);

  await page.click('#btn-new-session');
  await page.waitForTimeout(2000);

  // Type a welcome message
  await page.click('#terminal');
  await page.keyboard.type('echo PIA System is working!', { delay: 30 });
  await page.keyboard.press('Enter');

  console.log('Browser is open at http://localhost:3000');
  console.log('You can interact with it now!\n');
  console.log('Press Ctrl+C in this terminal to close when done.\n');

  // Keep open for 30 minutes
  await page.waitForTimeout(1800000);

  await browser.close();
}

openAndKeep().catch(console.error);
