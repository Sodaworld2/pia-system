/**
 * PIA Debug Test - Captures console errors
 */

const { chromium } = require('playwright');

async function debugPIA() {
  console.log('🔍 Debug Test Starting...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300,
  });

  const page = await browser.newPage();

  // Capture ALL console messages
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') {
      console.log(`❌ CONSOLE ERROR: ${msg.text()}`);
    } else if (type === 'warning') {
      console.log(`⚠️ WARNING: ${msg.text()}`);
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    console.log(`💥 PAGE ERROR: ${error.message}`);
  });

  // Capture failed requests
  page.on('requestfailed', request => {
    console.log(`🚫 REQUEST FAILED: ${request.url()} - ${request.failure().errorText}`);
  });

  // Capture response errors
  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`🔴 HTTP ${response.status()}: ${response.url()}`);
    }
  });

  try {
    console.log('Opening http://localhost:3000...\n');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(3000);

    console.log('\n--- Checking page state ---');

    // Check if app initialized
    const appExists = await page.evaluate(() => {
      return typeof window.app !== 'undefined';
    });
    console.log(`App initialized: ${appExists}`);

    // Check machines
    const machineCount = await page.evaluate(() => {
      return window.app ? window.app.machines.size : 0;
    });
    console.log(`Machines loaded: ${machineCount}`);

    // Check WebSocket
    const wsState = await page.evaluate(() => {
      if (window.app && window.app.ws) {
        return window.app.ws.readyState;
      }
      return -1;
    });
    const wsStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    console.log(`WebSocket state: ${wsStates[wsState] || 'NOT CREATED'}`);

    // Check connection status
    const connected = await page.evaluate(() => {
      return window.app ? window.app.connected : false;
    });
    console.log(`App connected: ${connected}`);

    console.log('\n--- Clicking CLI Tunnel ---');
    await page.click('[data-view="tunnel"]');
    await page.waitForTimeout(1000);

    // Check which view is active
    const activeView = await page.evaluate(() => {
      const active = document.querySelector('.view.active');
      return active ? active.id : 'none';
    });
    console.log(`Active view after click: ${activeView}`);

    // Check if button is visible
    const buttonVisible = await page.isVisible('#btn-new-session');
    console.log(`New Session button visible: ${buttonVisible}`);

    console.log('\n--- Trying to click New Session ---');

    if (buttonVisible) {
      // Set up dialog handler
      page.on('dialog', async dialog => {
        console.log(`Dialog: ${dialog.type()} - "${dialog.message()}"`);
        if (dialog.type() === 'prompt') {
          await dialog.accept('cmd');
        } else {
          await dialog.accept();
        }
      });

      await page.click('#btn-new-session');
      await page.waitForTimeout(2000);
      console.log('Button clicked!');
    } else {
      console.log('Button not visible, checking why...');

      // Get all view classes
      const viewStates = await page.evaluate(() => {
        const views = document.querySelectorAll('.view');
        return Array.from(views).map(v => ({
          id: v.id,
          hasActive: v.classList.contains('active'),
          display: getComputedStyle(v).display
        }));
      });
      console.log('View states:', JSON.stringify(viewStates, null, 2));
    }

    // Screenshot
    await page.screenshot({ path: 'screenshots/debug-final.png' });
    console.log('\nScreenshot saved to screenshots/debug-final.png');

    console.log('\nKeeping browser open for 60 seconds...');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugPIA().catch(console.error);
