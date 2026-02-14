/**
 * Quick frontend verification - tests key routes via HTTP
 * Doesn't use Playwright (saves tokens), just checks HTTP responses
 */
const BASE = 'http://100.102.217.69:5174';

async function checkRoute(path, description) {
  try {
    const resp = await fetch(`${BASE}${path}`);
    const html = await resp.text();
    const size = html.length;
    const hasReact = html.includes('root') || html.includes('__vite');
    const hasError = html.includes('Error') || html.includes('error');
    const status = resp.status;
    console.log(`  ${status} ${path} (${size}b) ${description} ${hasError ? '[HAS ERROR TEXT]' : '[OK]'}`);
    return { path, status, size, hasError };
  } catch (e) {
    console.log(`  ERR ${path} - ${e.message}`);
    return { path, status: 0, size: 0, hasError: true };
  }
}

async function main() {
  console.log('=== DAO Frontend Route Verification ===\n');

  const results = [];

  // Key routes
  results.push(await checkRoute('/', 'Root redirect'));
  results.push(await checkRoute('/login', 'Login page'));
  results.push(await checkRoute('/council', 'Council page'));
  results.push(await checkRoute('/dashboard', 'Dashboard root'));
  results.push(await checkRoute('/dashboard/overview', 'Dashboard overview'));
  results.push(await checkRoute('/dashboard/bubbles', 'Bubbles page'));
  results.push(await checkRoute('/dashboard/agreements', 'Agreements page'));
  results.push(await checkRoute('/dashboard/governance', 'Governance page'));
  results.push(await checkRoute('/dashboard/tokens', 'Tokens page'));
  results.push(await checkRoute('/dashboard/marketplace', 'Marketplace page'));
  results.push(await checkRoute('/admin', 'Admin page'));
  results.push(await checkRoute('/create-dao', 'Create DAO'));
  results.push(await checkRoute('/test/wizards', 'Wizard test'));

  // API proxy check
  console.log('\n=== API Proxy Check ===');
  try {
    const healthResp = await fetch(`${BASE}/api/health`);
    const health = await healthResp.json();
    console.log('  API Health:', health.status);

    const daoResp = await fetch(`${BASE}/api/dao`);
    const dao = await daoResp.json();
    console.log('  DAO Name:', dao.name || dao.data?.name || 'unknown');

    const councilResp = await fetch(`${BASE}/api/council`);
    const council = await councilResp.json();
    console.log('  Council members:', council.stats?.total || Object.keys(council.data || {}).length || 'N/A');
  } catch (e) {
    console.log('  API Error:', e.message);
  }

  // Summary
  console.log('\n=== Summary ===');
  const ok = results.filter(r => r.status === 200);
  const fail = results.filter(r => r.status !== 200);
  console.log(`  Routes OK: ${ok.length}/${results.length}`);
  if (fail.length > 0) {
    console.log('  Failed routes:');
    fail.forEach(r => console.log('    ' + r.path));
  }
  console.log('\nVERIFY_DONE');
}

main();
