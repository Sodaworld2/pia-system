/**
 * Test typing in terminal
 */

const { chromium } = require('playwright');

async function testTyping() {
  console.log('🔍 Testing Terminal Typing...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });

  const page = await browser.newPage();

  // Capture errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`❌ ERROR: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    console.log(`💥 PAGE ERROR: ${error.message}`);
  });

  try {
    console.log('1. Opening dashboard...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // Wait for connection
    console.log('2. Waiting for WebSocket connection...');
    await page.waitForFunction(() => {
      return window.app && window.app.connected === true;
    }, { timeout: 10000 });
    console.log('   ✅ Connected!\n');

    // Go to CLI Tunnel
    console.log('3. Opening CLI Tunnel...');
    await page.click('[data-view="tunnel"]');
    await page.waitForTimeout(500);

    // Check for existing sessions
    const sessionCount = await page.evaluate(() => {
      const select = document.getElementById('session-select');
      return select ? select.options.length - 1 : 0;
    });
    console.log(`   Found ${sessionCount} existing sessions`);

    // Create new session
    console.log('\n4. Creating new session...');
    page.on('dialog', async dialog => {
      console.log(`   Dialog: ${dialog.message()}`);
      await dialog.accept('cmd');
    });

    await page.click('#btn-new-session');
    await page.waitForTimeout(3000);

    // Check if session was created
    const currentSession = await page.evaluate(() => {
      return window.app ? window.app.currentSession : null;
    });
    console.log(`   Current session: ${currentSession}`);

    // Check terminal
    const terminalExists = await page.evaluate(() => {
      return window.app && window.app.terminal ? true : false;
    });
    console.log(`   Terminal object exists: ${terminalExists}`);

    // Try to focus and type
    console.log('\n5. Trying to type in terminal...');

    // Click on terminal to focus
    await page.click('#terminal');
    await page.waitForTimeout(500);

    // Type using keyboard
    console.log('   Typing "dir" command...');
    await page.keyboard.type('dir', { delay: 100 });
    await page.waitForTimeout(500);

    console.log('   Pressing Enter...');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/typing-test.png' });
    console.log('\n📸 Screenshot saved: screenshots/typing-test.png');

    // Check WebSocket state
    const wsInfo = await page.evaluate(() => {
      if (!window.app) return { error: 'no app' };
      return {
        wsState: window.app.ws ? window.app.ws.readyState : -1,
        connected: window.app.connected,
        currentSession: window.app.currentSession,
        terminalExists: !!window.app.terminal
      };
    });
    console.log('\nWebSocket Info:', JSON.stringify(wsInfo, null, 2));

    console.log('\n✅ Keeping browser open for 60 seconds - try typing yourself!');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'screenshots/typing-error.png' });
  } finally {
    await browser.close();
  }
}

testTyping().catch(console.error);
