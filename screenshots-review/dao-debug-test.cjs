const { chromium } = require('playwright');
const fs = require('fs');

const ssDir = 'C:/Users/User/Documents/GitHub/pia-system/public/screenshots';
if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

async function ss(page, name) {
  await page.screenshot({ path: `${ssDir}/${name}.png`, fullPage: true });
  console.log('SS:' + name);
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Collect ALL console messages
  const consoleMsgs = [];
  page.on('console', msg => {
    consoleMsgs.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') console.log('CONSOLE-ERROR: ' + msg.text().slice(0, 200));
  });
  page.on('pageerror', err => console.log('PAGE-ERROR: ' + err.message.slice(0, 200)));

  // Step 1: Go to /login directly (the earlier desktop screenshot showed /login)
  console.log('=== STEP 1: Go to /login ===');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  await ss(page, 'debug-01-login');

  // Get the HTML source
  const html = await page.content();
  console.log('HTML length: ' + html.length);
  console.log('HTML snippet: ' + html.slice(0, 500).replace(/\n/g, ' '));

  // Check for root element content
  const rootContent = await page.evaluate(() => {
    const root = document.getElementById('root');
    return root ? { innerHTML: root.innerHTML.slice(0, 500), childCount: root.children.length } : 'no root';
  });
  console.log('Root element: ' + JSON.stringify(rootContent));

  // Check for any visible text
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body text: "' + bodyText.slice(0, 300) + '"');

  // Check computed styles on root
  const styles = await page.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) return 'no root';
    const cs = window.getComputedStyle(root);
    return { bg: cs.backgroundColor, color: cs.color, display: cs.display, height: cs.height, width: cs.width };
  });
  console.log('Root styles: ' + JSON.stringify(styles));

  // Step 2: Try /login with different wait
  console.log('=== STEP 2: Check for React errors ===');
  const reactErrors = await page.evaluate(() => {
    const errOverlay = document.querySelector('vite-error-overlay');
    if (errOverlay) return 'VITE ERROR OVERLAY FOUND';
    const reactErr = document.querySelector('#root > div[style*="error"]');
    if (reactErr) return 'React error boundary: ' + reactErr.textContent;
    return 'No obvious error overlays';
  });
  console.log('React errors: ' + reactErrors);

  // Step 3: Check all console errors collected
  console.log('=== CONSOLE MESSAGES ===');
  for (const msg of consoleMsgs) {
    if (msg.type === 'error' || msg.type === 'warning') {
      console.log(`[${msg.type}] ${msg.text.slice(0, 300)}`);
    }
  }

  // Step 4: Try going to the root and see where it redirects
  console.log('=== STEP 4: Go to root / ===');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('After root redirect, URL is: ' + page.url());
  await ss(page, 'debug-02-root-redirect');

  // Step 5: Check React Router config by looking at JS
  console.log('=== STEP 5: Check routes ===');
  const routes = await page.evaluate(() => {
    // Check if React Router is active
    if (window.__REACT_ROUTER_CONTEXT__) return 'React Router found';
    // Check for any link elements
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    return allLinks.map(a => a.href).join(', ') || 'no links found';
  });
  console.log('Routes/Links: ' + routes);

  // Step 6: Try accessing /council directly (was showing in the desktop screenshot)
  console.log('=== STEP 6: Go to /council ===');
  await page.goto('http://localhost:5173/council', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(3000);
  await ss(page, 'debug-03-council');
  const councilText = await page.evaluate(() => document.body.innerText);
  console.log('Council page text: "' + councilText.slice(0, 300) + '"');

  // Get ALL network requests that failed
  console.log('=== STEP 7: Check for failed API calls ===');
  const failedRequests = [];
  page.on('response', response => {
    if (response.status() >= 400) {
      failedRequests.push({ url: response.url(), status: response.status() });
    }
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('Failed requests: ' + JSON.stringify(failedRequests));

  // Print all console messages at end
  console.log('=== ALL CONSOLE (' + consoleMsgs.length + ' messages) ===');
  consoleMsgs.slice(0, 30).forEach(m => console.log(`  [${m.type}] ${m.text.slice(0, 200)}`));

  console.log('=== DONE ===');
})().catch(e => console.error('FATAL:', e.message));
