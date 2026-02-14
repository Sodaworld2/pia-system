/**
 * Test the fixed DAO frontend on Machine #3
 * Deploy via base64 and run on Machine #3
 */
const { chromium } = require('playwright');
const fs = require('fs');
const ssDir = 'C:/Users/User/Documents/GitHub/pia-system/public/screenshots';
if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
let ssCount = 0;

async function ss(page, name) {
  ssCount++;
  const fname = 'fix-' + String(ssCount).padStart(2, '0') + '-' + name;
  await page.screenshot({ path: `${ssDir}/${fname}.png`, fullPage: false });
  console.log('SS:' + fname);
  return fname;
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)); });
  page.on('pageerror', err => errors.push(err.message.slice(0, 200)));

  // === Login ===
  console.log('=== LOGIN ===');
  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await ss(page, 'login');

  const emailInput = page.locator('input[type="email"], input[placeholder*="email"]');
  if (await emailInput.count() > 0) {
    await emailInput.fill('founder@sodaworld.dao');
    const continueBtn = page.locator('button:has-text("CONTINUE"), button:has-text("Continue"), button:has-text("Sign")');
    if (await continueBtn.count() > 0) {
      await continueBtn.first().click();
      await page.waitForTimeout(3000);
    }
  }
  await ss(page, 'after-login');
  console.log('URL: ' + page.url());

  // === Council page (THE MAIN FIX) ===
  console.log('\n=== COUNCIL PAGE ===');
  await page.goto('http://localhost:5174/council', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await ss(page, 'council');
  const councilText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Council text: ' + councilText.replace(/\n/g, ' | ').slice(0, 300));

  // Check if council data loaded (no more CORS error)
  const hasCorsError = councilText.includes('Failed to load');
  console.log('CORS error present: ' + hasCorsError);

  // === Dashboard ===
  console.log('\n=== DASHBOARD ===');
  await page.goto('http://localhost:5174/dashboard/overview', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await ss(page, 'dashboard');
  const dashText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Dashboard text: ' + dashText.replace(/\n/g, ' | ').slice(0, 300));

  // === Create DAO ===
  console.log('\n=== CREATE DAO ===');
  await page.goto('http://localhost:5174/create-dao', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await ss(page, 'create-dao');
  const createText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Create DAO text: ' + createText.replace(/\n/g, ' | ').slice(0, 300));

  // === Admin ===
  console.log('\n=== ADMIN ===');
  await page.goto('http://localhost:5174/admin', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await ss(page, 'admin');

  // === Test Wizards ===
  console.log('\n=== WIZARDS ===');
  await page.goto('http://localhost:5174/test/wizards', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await ss(page, 'wizards');

  // === Summary ===
  console.log('\n\n=== ERRORS (' + errors.length + ') ===');
  // Group errors
  const uniqueErrors = [...new Set(errors)];
  uniqueErrors.slice(0, 15).forEach(e => console.log('  ' + e.slice(0, 150)));

  console.log('\n=== COMPLETE ===');
  console.log('Screenshots: ' + ssCount);
  console.log('Errors: ' + errors.length + ' total, ' + uniqueErrors.length + ' unique');

  // Keep browser open for visual inspection
})().catch(e => console.error('FATAL: ' + e.message));
