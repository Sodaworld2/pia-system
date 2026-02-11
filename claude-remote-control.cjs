/**
 * Claude Remote Control Demo
 * Shows how Claude can control the terminal through the browser
 */

const { chromium } = require('playwright');
const path = require('path');

async function remoteControl() {
  console.log('═══════════════════════════════════════════');
  console.log('   Claude Remote Terminal Control');
  console.log('═══════════════════════════════════════════\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  // Handle dialogs
  page.on('dialog', async dialog => {
    console.log(`   Dialog: ${dialog.message()} -> cmd`);
    await dialog.accept('cmd');
  });

  try {
    // Open dashboard
    console.log('1. Opening PIA Dashboard...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => window.app && window.app.connected, { timeout: 10000 });
    console.log('   Connected!\n');

    // Go to CLI Tunnel
    console.log('2. Opening CLI Tunnel...');
    await page.click('[data-view="tunnel"]');
    await page.waitForTimeout(1000);

    // Create new session
    console.log('3. Creating new CMD session...');
    await page.click('#btn-new-session');
    await page.waitForTimeout(4000);

    // Wait for session to be selected
    const sessionId = await page.evaluate(() => window.app.currentSession);
    console.log(`   Session: ${sessionId ? sessionId.substring(0, 12) + '...' : 'none'}\n`);

    // Focus terminal
    console.log('4. Focusing terminal...');
    await page.click('#terminal');
    await page.waitForTimeout(500);

    // Type commands
    console.log('5. Claude is typing commands:\n');

    const commands = [
      'echo ════════════════════════════════════',
      'echo   Hello! Claude is controlling this terminal!',
      'echo ════════════════════════════════════',
      'echo.',
      'echo Current directory:',
      'cd',
      'echo.',
      'echo Current date/time:',
      'date /t && time /t',
      'echo.',
      'echo Files in this folder:',
      'dir /b',
    ];

    for (const cmd of commands) {
      console.log(`   > ${cmd}`);
      await page.keyboard.type(cmd, { delay: 30 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
    }

    // Screenshot
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'claude-remote-control.png') });
    console.log('\n6. Screenshot saved: screenshots/claude-remote-control.png\n');

    console.log('═══════════════════════════════════════════');
    console.log('   DEMO COMPLETE!');
    console.log('═══════════════════════════════════════════');
    console.log('   Claude successfully controlled the terminal.');
    console.log('   You can now type commands yourself!');
    console.log('   Browser will stay open for 30 minutes.');
    console.log('═══════════════════════════════════════════\n');

    await page.waitForTimeout(1800000);

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'error.png') });
  } finally {
    await browser.close();
  }
}

remoteControl().catch(console.error);
