/**
 * Claude Takes Control
 * I'll open the PIA system and demonstrate orchestration
 */

const { chromium } = require('playwright');

const API_TOKEN = 'pia-local-dev-token-2024';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('   CLAUDE TAKING CONTROL OF PIA SYSTEM');
  console.log('═══════════════════════════════════════════');
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();

  // Step 1: Open the dashboard
  console.log('1. Opening PIA Dashboard...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  console.log('   Dashboard loaded!');
  await page.waitForTimeout(1500);

  // Step 2: Navigate to Command Center
  console.log('');
  console.log('2. Opening Command Center...');
  await page.click('a[data-view="command"]');
  await page.waitForTimeout(1000);
  console.log('   Command Center active!');

  // Step 3: Send a status command
  console.log('');
  console.log('3. Checking system status...');
  const chatInput = page.locator('#chat-input');
  await chatInput.fill('status');
  await page.click('#btn-send-message');
  await page.waitForTimeout(2000);
  console.log('   Status retrieved!');

  // Step 4: Spawn a new Claude instance
  console.log('');
  console.log('4. Spawning a new Claude instance for Research...');
  await chatInput.fill('spawn Research Assistant');
  await page.click('#btn-send-message');
  await page.waitForTimeout(3000);
  console.log('   Research Assistant spawned!');

  // Step 5: Spawn another instance
  console.log('');
  console.log('5. Spawning another Claude for DevOps...');
  await chatInput.fill('spawn DevOps Engineer');
  await page.click('#btn-send-message');
  await page.waitForTimeout(3000);
  console.log('   DevOps Engineer spawned!');

  // Step 6: Check status again
  console.log('');
  console.log('6. Checking fleet status...');
  await chatInput.fill('list instances');
  await page.click('#btn-send-message');
  await page.waitForTimeout(2000);

  // Step 7: Go to Fleet Matrix to see agents
  console.log('');
  console.log('7. Opening Fleet Matrix to view agents...');
  await page.click('a[data-view="fleet"]');
  await page.waitForTimeout(2000);

  // Step 8: Take a screenshot
  console.log('');
  console.log('8. Taking screenshot of the fleet...');
  await page.screenshot({ path: 'screenshots/claude-in-control.png', fullPage: true });
  console.log('   Screenshot saved: screenshots/claude-in-control.png');

  // Step 9: Open a CLI Tunnel
  console.log('');
  console.log('9. Opening CLI Tunnel...');
  await page.click('a[data-view="tunnel"]');
  await page.waitForTimeout(1000);

  // Create a new session
  console.log('   Creating new terminal session...');

  // Handle the dialog for new session
  page.once('dialog', async dialog => {
    console.log(`   Dialog: ${dialog.message()} -> powershell`);
    await dialog.accept('powershell');
  });

  await page.click('#btn-new-session');
  await page.waitForTimeout(3000);

  // Type some commands
  console.log('');
  console.log('10. Demonstrating terminal control...');
  const terminal = page.locator('#terminal');
  await terminal.click();
  await page.waitForTimeout(500);

  // Type commands
  const commands = [
    'Write-Host "════════════════════════════════════════"',
    'Write-Host "  CLAUDE IS IN CONTROL OF THIS TERMINAL"',
    'Write-Host "════════════════════════════════════════"',
    'Write-Host ""',
    'Write-Host "Machine: $env:COMPUTERNAME"',
    'Write-Host "User: $env:USERNAME"',
    'Get-Date',
  ];

  for (const cmd of commands) {
    await page.keyboard.type(cmd, { delay: 30 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
  }

  // Final screenshot
  console.log('');
  console.log('11. Final screenshot...');
  await page.screenshot({ path: 'screenshots/claude-terminal-control.png', fullPage: true });
  console.log('   Screenshot saved: screenshots/claude-terminal-control.png');

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('   CLAUDE IS NOW IN CONTROL!');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('   You can now interact with the system.');
  console.log('   - Use Command Center to chat with me');
  console.log('   - View Fleet Matrix for agent status');
  console.log('   - Use CLI Tunnel to control terminals');
  console.log('');
  console.log('   Browser will stay open for you to explore.');
  console.log('═══════════════════════════════════════════');

  // Keep browser open
  await page.waitForTimeout(30 * 60 * 1000);
  await browser.close();
}

main().catch(console.error);
