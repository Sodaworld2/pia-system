/**
 * DAO Frontend Full Visual Test
 * Runs on Machine #3 with Playwright
 * Takes screenshots, checks data loading, saves report
 * Results saved to PIA public dir for HTTP retrieval
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5174';
const SS_DIR = 'C:/Users/User/Documents/GitHub/pia-system/public/screenshots';
const REPORT_PATH = 'C:/Users/User/Documents/GitHub/pia-system/public/dao-test-report.txt';

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

const report = [];
function log(msg) {
  console.log(msg);
  report.push(msg);
}

let ssCount = 0;
async function screenshot(page, name) {
  ssCount++;
  const num = String(ssCount).padStart(2, '0');
  const filename = `test-${num}-${name}.png`;
  await page.screenshot({ path: path.join(SS_DIR, filename), fullPage: false });
  log(`  Screenshot: ${filename}`);
  return filename;
}

async function checkPageContent(page, description) {
  // Wait for any loading to finish
  await page.waitForTimeout(2000);

  // Check for error messages
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasError = bodyText.includes('Error') || bodyText.includes('error') || bodyText.includes('Failed');
  const hasLoading = bodyText.includes('Loading') || bodyText.includes('loading');
  const isEmpty = bodyText.trim().length < 50;

  // Check for React content
  const reactRoot = await page.evaluate(() => {
    const root = document.getElementById('root');
    return root ? root.children.length : 0;
  });

  const status = isEmpty ? 'EMPTY' : hasError ? 'HAS_ERRORS' : hasLoading ? 'LOADING' : 'OK';
  log(`  Content: ${status} (${bodyText.length} chars, ${reactRoot} root children) - ${description}`);

  // Get any console errors
  return { status, bodyLength: bodyText.length, reactRoot, hasError, isEmpty };
}

async function main() {
  log('=== DAO Frontend Full Test ===');
  log('Started: ' + new Date().toISOString());
  log('URL: ' + BASE_URL);
  log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().substring(0, 200));
    }
  });

  try {
    // ============================================
    // TEST 1: Login Page
    // ============================================
    log('--- TEST 1: Login Page ---');
    await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle', timeout: 15000 });
    await screenshot(page, 'login-page');
    await checkPageContent(page, 'Login page');

    // Try to login with mock auth
    log('  Attempting mock login...');
    try {
      // Look for email input
      const emailInput = await page.$('input[type="email"], input[placeholder*="email" i], input[name="email"]');
      if (emailInput) {
        await emailInput.fill('founder@sodaworld.dao');
        log('  Filled email: founder@sodaworld.dao');
        await screenshot(page, 'login-email-filled');

        // Find and click continue/login button
        const loginBtn = await page.$('button[type="submit"], button:has-text("Continue"), button:has-text("Sign In"), button:has-text("Login")');
        if (loginBtn) {
          await loginBtn.click();
          log('  Clicked login button');
          await page.waitForTimeout(3000);
          await screenshot(page, 'after-login');

          const url = page.url();
          log('  Redirected to: ' + url);
          await checkPageContent(page, 'After login');
        } else {
          log('  WARNING: No login button found');
          // Try Google sign-in
          const googleBtn = await page.$('button:has-text("Google"), button:has-text("google")');
          if (googleBtn) {
            await googleBtn.click();
            log('  Clicked Google sign-in (mock)');
            await page.waitForTimeout(3000);
            await screenshot(page, 'after-google-login');
            log('  Redirected to: ' + page.url());
          }
        }
      } else {
        log('  WARNING: No email input found');
        // Maybe there's a direct sign-in button
        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const text = await btn.textContent();
          log('  Found button: ' + (text || '').trim().substring(0, 50));
        }
      }
    } catch (loginErr) {
      log('  Login error: ' + loginErr.message);
    }

    // ============================================
    // TEST 2: Dashboard Routes
    // ============================================
    const dashboardRoutes = [
      ['/dashboard', 'dashboard-root'],
      ['/dashboard/overview', 'dashboard-overview'],
      ['/dashboard/bubbles', 'dashboard-bubbles'],
      ['/dashboard/agreements', 'dashboard-agreements'],
      ['/dashboard/governance', 'dashboard-governance'],
      ['/dashboard/tokens', 'dashboard-tokens'],
      ['/dashboard/marketplace', 'dashboard-marketplace'],
    ];

    log('\n--- TEST 2: Dashboard Routes ---');
    for (const [route, name] of dashboardRoutes) {
      log(`\n  Route: ${route}`);
      try {
        await page.goto(BASE_URL + route, { waitUntil: 'networkidle', timeout: 15000 });
        await screenshot(page, name);
        await checkPageContent(page, route);
      } catch (e) {
        log(`  ERROR navigating to ${route}: ${e.message}`);
      }
    }

    // ============================================
    // TEST 3: Other Pages
    // ============================================
    log('\n--- TEST 3: Other Pages ---');
    const otherRoutes = [
      ['/council', 'council'],
      ['/admin', 'admin'],
      ['/create-dao', 'create-dao'],
      ['/test/wizards', 'wizard-test'],
    ];

    for (const [route, name] of otherRoutes) {
      log(`\n  Route: ${route}`);
      try {
        await page.goto(BASE_URL + route, { waitUntil: 'networkidle', timeout: 15000 });
        await screenshot(page, name);
        await checkPageContent(page, route);
      } catch (e) {
        log(`  ERROR: ${e.message}`);
      }
    }

    // ============================================
    // TEST 4: Data Loading Check
    // ============================================
    log('\n--- TEST 4: Data Loading ---');

    // Go to council and check if data loads
    await page.goto(BASE_URL + '/council', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    const councilText = await page.evaluate(() => document.body.innerText);
    const hasCouncilData = councilText.includes('member') || councilText.includes('Member') ||
                           councilText.includes('founder') || councilText.includes('Founder') ||
                           councilText.includes('council') || councilText.includes('Council');
    const hasCorsError = councilText.includes('CORS') || councilText.includes('cors') || councilText.includes('blocked');
    const hasFailedLoad = councilText.includes('Failed to load');

    log('  Council page data check:');
    log('    Has council-related text: ' + hasCouncilData);
    log('    Has CORS error: ' + hasCorsError);
    log('    Has "Failed to load": ' + hasFailedLoad);

    await screenshot(page, 'council-data-check');

    // Check dashboard overview for data
    await page.goto(BASE_URL + '/dashboard/overview', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    const overviewText = await page.evaluate(() => document.body.innerText);
    const hasBubbles = overviewText.includes('bubble') || overviewText.includes('Bubble') || overviewText.includes('idea');
    const hasProposals = overviewText.includes('proposal') || overviewText.includes('Proposal') || overviewText.includes('Budget');
    const hasTokens = overviewText.includes('token') || overviewText.includes('Token') || overviewText.includes('distribution');

    log('\n  Dashboard overview data:');
    log('    Has bubbles data: ' + hasBubbles);
    log('    Has proposals data: ' + hasProposals);
    log('    Has token data: ' + hasTokens);

    await screenshot(page, 'overview-data-check');

    // ============================================
    // CONSOLE ERRORS
    // ============================================
    log('\n--- Console Errors ---');
    if (consoleErrors.length === 0) {
      log('  No console errors!');
    } else {
      log(`  ${consoleErrors.length} console errors:`);
      // Deduplicate
      const unique = [...new Set(consoleErrors)];
      unique.slice(0, 15).forEach(e => log('  - ' + e));
      if (unique.length > 15) log(`  ... and ${unique.length - 15} more`);
    }

  } catch (err) {
    log('\nFATAL ERROR: ' + err.message);
  } finally {
    await browser.close();
  }

  // ============================================
  // SUMMARY
  // ============================================
  log('\n=== TEST SUMMARY ===');
  log('Screenshots taken: ' + ssCount);
  log('Console errors: ' + consoleErrors.length);
  log('Completed: ' + new Date().toISOString());
  log('TEST_COMPLETE');

  // Save report
  fs.writeFileSync(REPORT_PATH, report.join('\n'), 'utf8');
  console.log('\nReport saved to: ' + REPORT_PATH);
}

main().catch(err => {
  console.error('FATAL:', err);
  fs.writeFileSync(REPORT_PATH, report.join('\n') + '\nFATAL: ' + err.message, 'utf8');
  process.exit(1);
});
