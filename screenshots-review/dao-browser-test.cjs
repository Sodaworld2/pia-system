const { chromium } = require('playwright');
const fs = require('fs');

const ssDir = 'C:/Users/User/Documents/GitHub/pia-system/public/screenshots';
if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

async function screenshot(page, name) {
  await page.screenshot({ path: `${ssDir}/${name}.png`, fullPage: false });
  console.log('SS:' + name);
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  // Step 1: Navigate to DAO frontend
  console.log('STEP 1: Opening DAO frontend...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await screenshot(page, '01-dao-homepage');

  // Step 2: Check what page we're on
  const url = page.url();
  console.log('Current URL: ' + url);
  const title = await page.title();
  console.log('Page title: ' + title);

  // Step 3: If on login page, explore it
  if (url.includes('login')) {
    console.log('STEP 2: On login page, exploring...');
    await screenshot(page, '02-login-page');

    const inputs = await page.locator('input').all();
    console.log('Found ' + inputs.length + ' input fields');

    const buttons = await page.locator('button').all();
    for (const btn of buttons) {
      const text = await btn.textContent().catch(() => '');
      console.log('Button: ' + text.trim());
    }

    const links = await page.locator('a').all();
    for (const link of links) {
      const text = await link.textContent().catch(() => '');
      const href = await link.getAttribute('href').catch(() => '');
      console.log('Link: ' + text.trim() + ' -> ' + href);
    }
  }

  // Step 4: Try navigating to various routes
  const routes = ['/dashboard', '/dao', '/proposals', '/treasury', '/council', '/marketplace', '/agreements', '/bubbles', '/create-dao', '/admin'];

  for (const route of routes) {
    console.log('Trying route: ' + route);
    await page.goto('http://localhost:5173' + route, { waitUntil: 'networkidle', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const routeName = route.replace(/\//g, '-').replace(/^-/, '') || 'root';
    await screenshot(page, '03-route-' + routeName);
    const content = await page.textContent('body').catch(() => '');
    console.log('Route ' + route + ' content: ' + content.slice(0, 150).replace(/\n/g, ' '));
  }

  // Step 5: Take a desktop screenshot for context
  console.log('DONE - Browser staying open');
})().catch(e => console.error('ERROR:', e.message));
