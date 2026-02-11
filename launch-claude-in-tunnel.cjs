/**
 * Launch Claude in the PIA CLI Tunnel
 * So we can build together
 */

const { chromium } = require('playwright');

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('   LAUNCHING CLAUDE IN CLI TUNNEL');
  console.log('═══════════════════════════════════════════');

  // Connect to existing browser or launch new one
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();

  // Open the dashboard
  console.log('1. Opening PIA Dashboard...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Go to CLI Tunnel
  console.log('2. Opening CLI Tunnel...');
  await page.click('a[data-view="tunnel"]');
  await page.waitForTimeout(1000);

  // Create a new session with Claude
  console.log('3. Creating new session with Claude...');

  page.once('dialog', async dialog => {
    console.log('   Launching: claude');
    await dialog.accept('claude');
  });

  await page.click('#btn-new-session');
  await page.waitForTimeout(5000);

  // Focus the terminal
  console.log('4. Focusing terminal...');
  const terminal = page.locator('#terminal');
  await terminal.click();
  await page.waitForTimeout(1000);

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('   CLAUDE IS RUNNING IN THE TUNNEL!');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('   You can now:');
  console.log('   - Type directly in the terminal');
  console.log('   - Work with Claude to build PIA');
  console.log('   - Switch views using the nav bar');
  console.log('');
  console.log('   Browser will stay open for collaboration.');
  console.log('═══════════════════════════════════════════');

  // Keep browser open for 60 minutes
  await page.waitForTimeout(60 * 60 * 1000);
  await browser.close();
}

main().catch(console.error);
