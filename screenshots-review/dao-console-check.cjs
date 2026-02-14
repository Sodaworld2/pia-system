const { chromium } = require('playwright');
const fs = require('fs');
const ssDir = 'C:/Users/User/Documents/GitHub/pia-system/public/screenshots';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  const warnings = [];
  const logs = [];
  page.on('console', msg => {
    const entry = `[${msg.type()}] ${msg.text()}`;
    if (msg.type() === 'error') errors.push(entry);
    else if (msg.type() === 'warning') warnings.push(entry);
    else logs.push(entry);
  });
  page.on('pageerror', err => errors.push('[pageerror] ' + err.message));

  // Go to root
  console.log('=== Navigating to / ===');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log('Nav error: ' + e.message));
  await page.waitForTimeout(3000);

  console.log('URL: ' + page.url());

  // Get full HTML
  const html = await page.content();
  fs.writeFileSync(ssDir + '/page-source.html', html);
  console.log('HTML saved (' + html.length + ' chars)');

  // Check #root
  const rootInfo = await page.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) return { exists: false };
    const cs = getComputedStyle(root);
    return {
      exists: true,
      innerHTML: root.innerHTML.substring(0, 1000),
      childCount: root.children.length,
      className: root.className,
      bg: cs.backgroundColor,
      color: cs.color,
      display: cs.display,
      height: cs.height
    };
  });
  console.log('ROOT: ' + JSON.stringify(rootInfo, null, 2));

  // Check for error boundaries
  const errorBoundary = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const text = el.textContent || '';
      if (text.includes('Error') || text.includes('error') || text.includes('Loading')) {
        if (text.length < 200) return { tag: el.tagName, text: text, class: el.className };
      }
    }
    return null;
  });
  console.log('Error boundary: ' + JSON.stringify(errorBoundary));

  // Check network requests
  const requests = [];
  page.on('response', res => {
    requests.push({ url: res.url(), status: res.status() });
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  console.log('\n=== ERRORS (' + errors.length + ') ===');
  errors.forEach(e => console.log(e.substring(0, 300)));

  console.log('\n=== WARNINGS (' + warnings.length + ') ===');
  warnings.slice(0, 10).forEach(w => console.log(w.substring(0, 300)));

  console.log('\n=== FAILED REQUESTS ===');
  requests.filter(r => r.status >= 400).forEach(r => console.log(r.status + ' ' + r.url));

  console.log('\n=== ALL REQUESTS ===');
  requests.slice(0, 20).forEach(r => console.log(r.status + ' ' + r.url.substring(0, 100)));

  // Take screenshot
  await page.screenshot({ path: ssDir + '/debug-console.png', fullPage: true });
  console.log('\nScreenshot saved');

  await browser.close();
  console.log('=== DONE ===');
})().catch(e => console.error('FATAL: ' + e.message));
