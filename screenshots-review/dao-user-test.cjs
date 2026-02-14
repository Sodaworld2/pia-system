const { chromium } = require('playwright');
const fs = require('fs');
const ssDir = 'C:/Users/User/Documents/GitHub/pia-system/public/screenshots';
if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
let ssCount = 0;

async function ss(page, name) {
  ssCount++;
  const fname = String(ssCount).padStart(2, '0') + '-' + name;
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

  // === STEP 1: Login page ===
  console.log('=== STEP 1: DAO Login ===');
  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await ss(page, 'login-page');

  // Find and fill email
  const emailInput = page.locator('input[type="email"], input[placeholder*="email"]');
  if (await emailInput.count() > 0) {
    await emailInput.fill('founder@sodaworld.dao');
    console.log('Filled email: founder@sodaworld.dao');
    await ss(page, 'login-email-filled');

    // Click continue
    const continueBtn = page.locator('button:has-text("CONTINUE"), button:has-text("Continue"), button:has-text("Sign")');
    if (await continueBtn.count() > 0) {
      await continueBtn.first().click();
      console.log('Clicked Continue');
      await page.waitForTimeout(3000);
      await ss(page, 'after-login-click');
      console.log('URL after login: ' + page.url());
    }
  } else {
    // Try Google sign in (mock)
    const googleBtn = page.locator('button:has-text("Google")');
    if (await googleBtn.count() > 0) {
      await googleBtn.click();
      console.log('Clicked Google sign in');
      await page.waitForTimeout(3000);
      await ss(page, 'after-google-click');
      console.log('URL after Google: ' + page.url());
    }
  }

  // === STEP 2: Explore wherever we land ===
  console.log('=== STEP 2: Post-login exploration ===');
  const currentUrl = page.url();
  console.log('Current URL: ' + currentUrl);
  await ss(page, 'post-login');

  // Get page text
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Page text: ' + bodyText.replace(/\n/g, ' | '));

  // === STEP 3: Visit all main routes ===
  console.log('=== STEP 3: Navigate all routes ===');
  const routes = [
    ['/council', 'council'],
    ['/dashboard/overview', 'dashboard'],
    ['/dashboard/bubbles', 'bubbles'],
    ['/dashboard/agreements', 'agreements'],
    ['/dashboard/governance', 'governance'],
    ['/dashboard/tokens', 'tokens'],
    ['/dashboard/marketplace', 'marketplace'],
    ['/admin', 'admin'],
    ['/create-dao', 'create-dao'],
    ['/test/wizards', 'wizards'],
  ];

  for (const [route, name] of routes) {
    console.log('Navigating to: ' + route);
    await page.goto('http://localhost:5174' + route, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await ss(page, 'route-' + name);
    const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log(name + ': ' + text.replace(/\n/g, ' | ').slice(0, 200));
  }

  // === STEP 4: Test AI chat if available ===
  console.log('=== STEP 4: Look for AI chat ===');
  await page.goto('http://localhost:5174/council', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Look for chat input, message input, or AI-related elements
  const chatInput = page.locator('input[placeholder*="message"], input[placeholder*="chat"], textarea[placeholder*="message"], textarea[placeholder*="chat"]');
  if (await chatInput.count() > 0) {
    console.log('Found chat input!');
    await chatInput.first().fill('What is the current status of our DAO?');
    await ss(page, 'ai-chat-typed');

    // Send message
    const sendBtn = page.locator('button:has-text("Send"), button[type="submit"]');
    if (await sendBtn.count() > 0) {
      await sendBtn.first().click();
      console.log('Sent AI message');
      await page.waitForTimeout(5000);
      await ss(page, 'ai-chat-response');
    }
  } else {
    console.log('No chat input found on council page');
  }

  // Print errors
  console.log('\n=== ERRORS (' + errors.length + ') ===');
  errors.slice(0, 10).forEach(e => console.log('  ' + e));

  console.log('\n=== COMPLETE ===');
  console.log('Total screenshots: ' + ssCount);
  // Keep browser open
})().catch(e => console.error('FATAL: ' + e.message));
