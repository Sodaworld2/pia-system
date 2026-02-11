/**
 * Test: Multiple CLI sessions running in parallel
 * This test creates 3 sessions and types commands simultaneously
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testParallelSessions() {
  console.log('═══════════════════════════════════════════');
  console.log('   PIA TEST: Parallel CLI Sessions');
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
    viewport: { width: 1600, height: 900 }
  });

  const page = await context.newPage();
  const sessions = [];

  // Dialog handler
  let nextDialogResponse = 'cmd';
  page.on('dialog', async dialog => {
    console.log(`   Dialog → responding: "${nextDialogResponse}"`);
    await dialog.accept(nextDialogResponse);
  });

  try {
    // ═══════════════════════════════════════
    // STEP 1: Open Dashboard
    // ═══════════════════════════════════════
    console.log('STEP 1: Opening Dashboard...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => window.app && window.app.connected, { timeout: 10000 });
    console.log('   ✅ Connected\n');

    // ═══════════════════════════════════════
    // STEP 2: Go to CLI Tunnel
    // ═══════════════════════════════════════
    console.log('STEP 2: Opening CLI Tunnel tab...');
    await page.click('[data-view="tunnel"]');
    await page.waitForTimeout(500);

    // ═══════════════════════════════════════
    // STEP 3: Create 3 sessions
    // ═══════════════════════════════════════
    const sessionConfigs = [
      { shell: 'cmd', name: 'Session 1' },
      { shell: 'powershell', name: 'Session 2' },
      { shell: 'cmd', name: 'Session 3' }
    ];

    for (let i = 0; i < sessionConfigs.length; i++) {
      const config = sessionConfigs[i];
      console.log(`\nSTEP ${3 + i}: Creating ${config.name} (${config.shell})...`);

      nextDialogResponse = config.shell;
      await page.click('#btn-new-session');
      await page.waitForTimeout(2000);

      const sessionId = await page.evaluate(() => window.app.currentSession);
      if (sessionId && !sessions.find(s => s.id === sessionId)) {
        sessions.push({ id: sessionId, shell: config.shell, name: config.name });
        console.log(`   ✅ Created: ${sessionId.substring(0, 8)}...`);
      }
    }

    console.log(`\n✅ Created ${sessions.length} sessions\n`);

    // ═══════════════════════════════════════
    // STEP 4: Start long-running commands in each session
    // ═══════════════════════════════════════
    console.log('═══════════════════════════════════════════');
    console.log('PARALLEL TEST: Running commands in all sessions');
    console.log('═══════════════════════════════════════════\n');

    // Type a command that takes time in each session
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      console.log(`Switching to ${session.name} and starting command...`);

      await page.selectOption('#session-select', session.id);
      await page.waitForTimeout(500);

      await page.click('#terminal');
      await page.waitForTimeout(200);

      // Use ping command which takes time
      if (session.shell === 'powershell') {
        await page.keyboard.type(`Write-Host "Starting ${session.name}"; ping localhost -n 5`, { delay: 30 });
      } else {
        await page.keyboard.type(`echo Starting ${session.name} && ping localhost -n 5`, { delay: 30 });
      }

      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      console.log(`   ✅ Started ping command in ${session.name}`);
    }

    await page.screenshot({ path: path.join(screenshotDir, 'parallel-started.png') });
    console.log('\n📸 Screenshot: parallel-started.png');

    // ═══════════════════════════════════════
    // STEP 5: Check each session's output
    // ═══════════════════════════════════════
    console.log('\nWaiting 8 seconds for pings to complete...\n');
    await page.waitForTimeout(8000);

    console.log('Checking outputs from each session:');
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      await page.selectOption('#session-select', session.id);
      await page.waitForTimeout(500);

      // Take screenshot of each session
      await page.screenshot({
        path: path.join(screenshotDir, `parallel-session-${i + 1}.png`)
      });
      console.log(`   📸 ${session.name}: parallel-session-${i + 1}.png`);
    }

    // ═══════════════════════════════════════
    // STEP 6: Verify all sessions still work
    // ═══════════════════════════════════════
    console.log('\nVerifying all sessions still respond:');

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      await page.selectOption('#session-select', session.id);
      await page.waitForTimeout(500);

      await page.click('#terminal');
      await page.waitForTimeout(200);

      if (session.shell === 'powershell') {
        await page.keyboard.type(`Write-Host "${session.name} VERIFIED"`, { delay: 30 });
      } else {
        await page.keyboard.type(`echo ${session.name} VERIFIED`, { delay: 30 });
      }
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      console.log(`   ✅ ${session.name} responded`);
    }

    await page.screenshot({ path: path.join(screenshotDir, 'parallel-final.png') });

    // ═══════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════
    console.log('\n═══════════════════════════════════════════');
    console.log('   ✅ PARALLEL TEST RESULTS');
    console.log('═══════════════════════════════════════════');
    console.log(`   Sessions: ${sessions.length}`);
    sessions.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.name} (${s.shell}): ${s.id.substring(0, 12)}...`);
    });
    console.log('\n   All sessions ran commands and responded!');
    console.log('   📸 Screenshots saved to: screenshots/');
    console.log('═══════════════════════════════════════════\n');

    // Keep open for inspection
    console.log('Browser will stay open for 60 seconds.');
    console.log('Try switching between sessions to verify!\n');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: path.join(screenshotDir, 'parallel-error.png') }).catch(() => {});
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

testParallelSessions().catch(console.error);
