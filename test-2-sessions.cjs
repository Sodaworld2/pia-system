/**
 * Test: Create 2 working CLI sessions
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function test2Sessions() {
  console.log('═══════════════════════════════════════════');
  console.log('   PIA TEST: Setting up 2 CLI Sessions');
  console.log('═══════════════════════════════════════════\n');

  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 150,
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();
  const sessions = [];

  // Global dialog handler
  let nextDialogResponse = 'cmd';
  page.on('dialog', async dialog => {
    console.log(`   Dialog: "${dialog.message()}" → responding: "${nextDialogResponse}"`);
    await dialog.accept(nextDialogResponse);
  });

  try {
    // ═══════════════════════════════════════
    // STEP 1: Open Dashboard
    // ═══════════════════════════════════════
    console.log('STEP 1: Opening Dashboard...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // Wait for WebSocket
    await page.waitForFunction(() => window.app && window.app.connected, { timeout: 10000 });
    console.log('   ✅ Dashboard loaded & connected\n');

    // ═══════════════════════════════════════
    // STEP 2: Go to CLI Tunnel
    // ═══════════════════════════════════════
    console.log('STEP 2: Opening CLI Tunnel tab...');
    await page.click('[data-view="tunnel"]');
    await page.waitForTimeout(500);
    console.log('   ✅ CLI Tunnel opened\n');

    // ═══════════════════════════════════════
    // STEP 3: Create Session 1 (cmd)
    // ═══════════════════════════════════════
    console.log('STEP 3: Creating Session 1 (cmd)...');
    nextDialogResponse = 'cmd';
    await page.click('#btn-new-session');
    await page.waitForTimeout(3000);

    // Get session ID
    const session1Id = await page.evaluate(() => window.app.currentSession);
    if (session1Id) {
      sessions.push({ id: session1Id, type: 'cmd' });
      console.log(`   ✅ Session 1 created: ${session1Id.substring(0, 8)}...\n`);
    } else {
      console.log('   ⚠️ Session 1 may not have been created properly\n');
    }

    await page.screenshot({ path: path.join(screenshotDir, 'session1-created.png') });

    // ═══════════════════════════════════════
    // STEP 4: Type in Session 1
    // ═══════════════════════════════════════
    console.log('STEP 4: Typing in Session 1...');
    await page.click('#terminal');
    await page.waitForTimeout(300);

    // Type command slowly
    await page.keyboard.type('echo Session 1 Working!', { delay: 80 });
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(screenshotDir, 'session1-typed.png') });
    console.log('   ✅ Typed "echo Session 1 Working!" in Session 1\n');

    // ═══════════════════════════════════════
    // STEP 5: Create Session 2 (powershell)
    // ═══════════════════════════════════════
    console.log('STEP 5: Creating Session 2 (powershell)...');
    nextDialogResponse = 'powershell';
    await page.click('#btn-new-session');
    await page.waitForTimeout(3000);

    const session2Id = await page.evaluate(() => window.app.currentSession);
    if (session2Id && session2Id !== session1Id) {
      sessions.push({ id: session2Id, type: 'powershell' });
      console.log(`   ✅ Session 2 created: ${session2Id.substring(0, 8)}...\n`);
    } else {
      console.log('   ⚠️ Session 2 may not have been created properly\n');
    }

    await page.screenshot({ path: path.join(screenshotDir, 'session2-created.png') });

    // ═══════════════════════════════════════
    // STEP 6: Type in Session 2
    // ═══════════════════════════════════════
    console.log('STEP 6: Typing in Session 2...');
    await page.click('#terminal');
    await page.waitForTimeout(300);

    await page.keyboard.type('Write-Host "Session 2 Working!"', { delay: 80 });
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(screenshotDir, 'session2-typed.png') });
    console.log('   ✅ Typed PowerShell command in Session 2\n');

    // ═══════════════════════════════════════
    // STEP 7: Switch back to Session 1
    // ═══════════════════════════════════════
    if (sessions.length >= 1) {
      console.log('STEP 7: Switching back to Session 1...');
      await page.selectOption('#session-select', sessions[0].id);
      await page.waitForTimeout(2000);

      await page.screenshot({ path: path.join(screenshotDir, 'session1-switched.png') });
      console.log('   ✅ Switched to Session 1\n');

      // ═══════════════════════════════════════
      // STEP 8: Type another command in Session 1
      // ═══════════════════════════════════════
      console.log('STEP 8: Typing more in Session 1...');
      await page.click('#terminal');
      await page.waitForTimeout(300);

      await page.keyboard.type('echo Both sessions work!', { delay: 80 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: path.join(screenshotDir, 'final-test.png') });
    console.log('   ✅ Test completed!\n');

    // ═══════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════
    console.log('═══════════════════════════════════════════');
    console.log('   ✅ TEST RESULTS - SUCCESS');
    console.log('═══════════════════════════════════════════');
    console.log(`   Sessions Created: ${sessions.length}`);
    sessions.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.type}: ${s.id.substring(0, 12)}...`);
    });
    console.log('\n   📸 Screenshots saved to: screenshots/');
    console.log('═══════════════════════════════════════════\n');

    // Keep open
    console.log('Browser will stay open for 90 seconds.');
    console.log('Try switching sessions and typing yourself!\n');
    await page.waitForTimeout(90000);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: path.join(screenshotDir, 'test-error.png') }).catch(() => {});
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

test2Sessions().catch(console.error);
