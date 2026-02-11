/**
 * Open multiple browser windows - each with its own CLI session
 * Like remote control panels for different terminals
 */

const { chromium } = require('playwright');

async function openMultipleWindows() {
  console.log('═══════════════════════════════════════════');
  console.log('   PIA Remote Control - Multiple Windows');
  console.log('═══════════════════════════════════════════\n');

  const browser = await chromium.launch({
    headless: false,
  });

  const windows = [];
  const shells = ['cmd', 'powershell', 'cmd'];

  for (let i = 0; i < 3; i++) {
    console.log(`Opening Window ${i + 1} (${shells[i]})...`);

    const context = await browser.newContext({
      viewport: { width: 800, height: 600 }
    });

    const page = await context.newPage();

    // Dialog handler for this window
    const shellType = shells[i];
    page.on('dialog', async dialog => {
      await dialog.accept(shellType);
    });

    // Open dashboard
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(1500);

    // Wait for connection
    try {
      await page.waitForFunction(() => window.app && window.app.connected, { timeout: 10000 });
    } catch (e) {
      console.log(`   Window ${i + 1} connection timeout, continuing...`);
    }

    // Go to CLI Tunnel
    await page.click('[data-view="tunnel"]');
    await page.waitForTimeout(500);

    // Create new session
    await page.click('#btn-new-session');
    await page.waitForTimeout(2000);

    // Type identifier command
    await page.click('#terminal');
    await page.waitForTimeout(300);

    if (shellType === 'powershell') {
      await page.keyboard.type(`Write-Host "=== WINDOW ${i + 1}: PowerShell ===" -ForegroundColor Green`, { delay: 20 });
    } else {
      await page.keyboard.type(`echo === WINDOW ${i + 1}: CMD ===`, { delay: 20 });
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    windows.push({ page, context, shell: shellType });
    console.log(`   Window ${i + 1} ready!\n`);
  }

  console.log('═══════════════════════════════════════════');
  console.log('   3 WINDOWS OPEN!');
  console.log('═══════════════════════════════════════════');
  console.log('   Window 1: CMD');
  console.log('   Window 2: PowerShell');
  console.log('   Window 3: CMD');
  console.log('');
  console.log('   Arrange them on your screen!');
  console.log('   Each window is an independent remote terminal.');
  console.log('');
  console.log('   Windows will stay open for 30 minutes.');
  console.log('   Press Ctrl+C to close all.');
  console.log('═══════════════════════════════════════════\n');

  // Keep open for 30 minutes
  await new Promise(resolve => setTimeout(resolve, 1800000));

  await browser.close();
  console.log('All windows closed.');
}

openMultipleWindows().catch(console.error);
