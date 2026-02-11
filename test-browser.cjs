/**
 * PIA Browser Test Script
 * Uses Playwright to automate testing the dashboard
 */

const { chromium } = require('playwright');
const path = require('path');

async function testPIA() {
  console.log('🚀 Starting PIA Browser Test...\n');

  // Launch browser (visible so user can see)
  const browser = await chromium.launch({
    headless: false,  // Show the browser
    slowMo: 500,      // Slow down so user can see actions
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();

  // Create screenshots folder
  const screenshotDir = path.join(__dirname, 'screenshots');
  const fs = require('fs');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }

  try {
    // Step 1: Open Dashboard
    console.log('📍 Step 1: Opening PIA Dashboard...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotDir, '01-dashboard.png') });
    console.log('   ✅ Dashboard loaded\n');

    // Step 2: Check connection status
    console.log('📍 Step 2: Checking connection status...');
    const statusText = await page.locator('.connection-status .status-text').textContent();
    console.log(`   Connection: ${statusText}`);
    await page.screenshot({ path: path.join(screenshotDir, '02-connection.png') });

    // Step 3: Click CLI Tunnel
    console.log('\n📍 Step 3: Clicking CLI Tunnel tab...');
    await page.click('[data-view="tunnel"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotDir, '03-cli-tunnel.png') });
    console.log('   ✅ CLI Tunnel tab opened\n');

    // Step 4: Check for existing sessions in dropdown
    console.log('📍 Step 4: Checking for existing sessions...');
    const sessionOptions = await page.locator('#session-select option').count();
    console.log(`   Found ${sessionOptions - 1} existing sessions`);

    // Step 5: Try to click New Session button
    console.log('\n📍 Step 5: Clicking New Session button...');

    // Listen for dialog (prompt)
    page.on('dialog', async dialog => {
      console.log(`   Dialog appeared: "${dialog.message()}"`);
      if (dialog.type() === 'prompt') {
        console.log('   Entering command: cmd');
        await dialog.accept('cmd');
      } else if (dialog.type() === 'alert') {
        console.log(`   ⚠️ Alert: ${dialog.message()}`);
        await dialog.accept();
      }
    });

    await page.click('#btn-new-session');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotDir, '04-after-new-session.png') });

    // Step 6: Check if terminal appeared
    console.log('\n📍 Step 6: Checking terminal...');
    const terminalContent = await page.locator('#terminal').innerHTML();
    if (terminalContent && terminalContent.length > 100) {
      console.log('   ✅ Terminal has content!');
    } else {
      console.log('   ⚠️ Terminal appears empty');
    }
    await page.screenshot({ path: path.join(screenshotDir, '05-terminal.png') });

    // Step 7: Check Fleet Matrix
    console.log('\n📍 Step 7: Checking Fleet Matrix...');
    await page.click('[data-view="fleet"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotDir, '06-fleet-matrix.png') });

    const agentTiles = await page.locator('.agent-tile').count();
    console.log(`   Found ${agentTiles} agent tiles`);

    // Step 8: Check AI Models tab
    console.log('\n📍 Step 8: Checking AI Models tab...');
    await page.click('[data-view="ai"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotDir, '07-ai-models.png') });
    console.log('   ✅ AI Models tab opened\n');

    // Final summary
    console.log('═══════════════════════════════════════');
    console.log('📸 Screenshots saved to: screenshots/');
    console.log('═══════════════════════════════════════\n');

    // Keep browser open for user to see
    console.log('Browser will stay open for 30 seconds...');
    console.log('You can interact with it manually.\n');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: path.join(screenshotDir, 'error.png') });
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

// Run the test
testPIA().catch(console.error);
