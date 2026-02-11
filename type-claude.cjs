/**
 * Quick script to type 'claude' in an open PIA terminal
 */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Go to tunnel
  await page.click('a[data-view="tunnel"]');
  await page.waitForTimeout(1000);

  // Check if there's an existing session, if not create one
  const sessionSelect = page.locator('#session-select');
  const options = await sessionSelect.locator('option').count();

  if (options <= 1) {
    // Need to create a session first
    page.once('dialog', async dialog => {
      await dialog.accept('cmd');
    });
    await page.click('#btn-new-session');
    await page.waitForTimeout(2000);
  } else {
    // Select the first real session
    await sessionSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
  }

  // Focus terminal and type claude
  const terminal = page.locator('#terminal');
  await terminal.click();
  await page.waitForTimeout(500);

  console.log('Typing: claude');
  await page.keyboard.type('claude', { delay: 50 });
  await page.keyboard.press('Enter');

  console.log('Claude launching! Browser staying open...');

  // Keep open for an hour
  await page.waitForTimeout(60 * 60 * 1000);
}

main().catch(console.error);
