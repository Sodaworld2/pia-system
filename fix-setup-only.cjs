const fs = require('fs');
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;

function getLineEnding(content) {
  return content.includes(CRLF) ? CRLF : LF;
}

console.log('=== Fixing vitest.setup.ts (environment-safe) ===');
const setupPath = 'vitest.setup.ts';
let setup = fs.readFileSync(setupPath, 'utf8');
const LE = getLineEnding(setup);

const newSetup = [
  "import '@testing-library/jest-dom';",
  "import { vi } from 'vitest';",
  "",
  "// Only apply browser-specific mocks in jsdom environment",
  "if (typeof window !== 'undefined') {",
  "    // Mock window.ethereum for wallet-dependent components",
  "    Object.defineProperty(window, 'ethereum', {",
  "        value: {",
  "            isMetaMask: true,",
  "            request: vi.fn().mockResolvedValue(['0xMockWalletAddress']),",
  "            on: vi.fn(),",
  "            removeListener: vi.fn(),",
  "            selectedAddress: '0xMockWalletAddress',",
  "        },",
  "        writable: true,",
  "        configurable: true,",
  "    });",
  "",
  "    // Mock window.confirm to always return true",
  "    vi.spyOn(window, 'confirm').mockReturnValue(true);",
  "",
  "    // Mock the global fetch function to handle all API endpoints",
  "    vi.spyOn(global, 'fetch').mockImplementation((url: any, options: any) => {",
  "        const urlStr = String(url);",
  "",
  "        // Handle /api/gemini/generate endpoint (both relative and absolute URLs)",
  "        if (urlStr.endsWith('/api/gemini/generate') || urlStr === '/api/gemini/generate') {",
  "            try {",
  "                const body = JSON.parse((options && options.body) ? options.body : '{}');",
  "                const hasFail = (body.prompt && body.prompt.includes('fail')) || (body.country && body.country.includes('fail'));",
  "                if (hasFail) {",
  "                    return Promise.resolve(new Response(JSON.stringify({ error: 'Failed to generate contract. Please try again.' }), { status: 500 }));",
  "                }",
  "                return Promise.resolve(new Response(JSON.stringify({ text: 'Generated Contract' }), { status: 200 }));",
  "            } catch (e) {",
  "                return Promise.resolve(new Response(JSON.stringify({ text: 'Generated Contract' }), { status: 200 }));",
  "            }",
  "        }",
  "",
  "        // Handle /api/gemini/legal-frameworks endpoint",
  "        if (urlStr.endsWith('/api/gemini/legal-frameworks') || urlStr.includes('/api/gemini/legal-frameworks')) {",
  "            return Promise.resolve(new Response(JSON.stringify({ frameworks: [] }), { status: 200 }));",
  "        }",
  "",
  "        // Default: return empty 200 response for any unmatched URL",
  "        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));",
  "    });",
  "}",
  "",
].join(LE);

fs.writeFileSync(setupPath, newSetup);
console.log('WROTE: vitest.setup.ts');
console.log('Done! Browser mocks are now guarded by typeof window check.');
