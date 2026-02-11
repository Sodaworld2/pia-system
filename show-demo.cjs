/**
 * Demo: Open PIA Dashboard and show it working
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function showDemo() {
  console.log('═══════════════════════════════════════════');
  console.log('   PIA DEMO - Opening Dashboard');
  console.log('═══════════════════════════════════════════\n');

  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();

  // Dialog handler
  page.on('dialog', async dialog => {
    console.log(`   Dialog: "${dialog.message()}" -> responding "cmd"`);
    await dialog.accept('cmd');
  });

  try {
    // Open Dashboard
    console.log('1. Opening PIA Dashboard at http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // Wait for connection
    await page.waitForFunction(() => window.app && window.app.connected, { timeout: 10000 });
    console.log('   Connected to WebSocket!\n');

    // Screenshot: Fleet Matrix
    await page.screenshot({ path: path.join(screenshotDir, 'demo-1-fleet.png') });
    console.log('2. Screenshot: Fleet Matrix view');
    console.log('   -> demo-1-fleet.png\n');

    // Go to CLI Tunnel
    console.log('3. Opening CLI Tunnel...');
    await page.click('[data-view="tunnel"]');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(screenshotDir, 'demo-2-tunnel.png') });
    console.log('   -> demo-2-tunnel.png\n');

    // Create a session
    console.log('4. Creating a CLI session...');
    await page.click('#btn-new-session');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(screenshotDir, 'demo-3-session.png') });
    console.log('   -> demo-3-session.png\n');

    // Type a command
    console.log('5. Typing a command...');
    await page.click('#terminal');
    await page.waitForTimeout(300);
    await page.keyboard.type('echo Hello from PIA Dashboard!', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(screenshotDir, 'demo-4-command.png') });
    console.log('   -> demo-4-command.png\n');

    // Type dir command
    console.log('6. Running dir command...');
    await page.keyboard.type('dir', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(screenshotDir, 'demo-5-dir.png') });
    console.log('   -> demo-5-dir.png\n');

    // Show AI Models view
    console.log('7. Opening AI Models view...');
    await page.click('[data-view="ai"]');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(screenshotDir, 'demo-6-ai.png') });
    console.log('   -> demo-6-ai.png\n');

    // Back to Fleet
    console.log('8. Back to Fleet Matrix...');
    await page.click('[data-view="fleet"]');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(screenshotDir, 'demo-7-final.png') });
    console.log('   -> demo-7-final.png\n');

    console.log('═══════════════════════════════════════════');
    console.log('   DEMO COMPLETE!');
    console.log('═══════════════════════════════════════════');
    console.log('   Screenshots saved to: screenshots/');
    console.log('   - demo-1-fleet.png');
    console.log('   - demo-2-tunnel.png');
    console.log('   - demo-3-session.png');
    console.log('   - demo-4-command.png');
    console.log('   - demo-5-dir.png');
    console.log('   - demo-6-ai.png');
    console.log('   - demo-7-final.png');
    console.log('═══════════════════════════════════════════\n');

    console.log('Browser will stay open for 2 minutes.');
    console.log('You can interact with it yourself!\n');
    await page.waitForTimeout(120000);

  } catch (error) {
    console.error('\nError:', error.message);
    await page.screenshot({ path: path.join(screenshotDir, 'demo-error.png') }).catch(() => {});
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

showDemo().catch(console.error);
