const fs = require('fs');
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;

function readFile(path) {
  return fs.readFileSync(path, 'utf8');
}

function writeFile(path, content) {
  fs.writeFileSync(path, content);
  console.log('WROTE: ' + path);
}

function getLineEnding(content) {
  return content.includes(CRLF) ? CRLF : LF;
}

// ============================================================
// FIX 1: vitest.setup.ts - Also check body.country for 'fail'
// ============================================================
console.log('\n=== FIX 1: vitest.setup.ts ===');
const setupPath = 'vitest.setup.ts';
let setup = readFile(setupPath);
const setupLE = getLineEnding(setup);

const newSetup = [
  "import '@testing-library/jest-dom';",
  "import { vi } from 'vitest';",
  "",
  "// Mock window.ethereum for wallet-dependent components",
  "Object.defineProperty(window, 'ethereum', {",
  "    value: {",
  "        isMetaMask: true,",
  "        request: vi.fn().mockResolvedValue(['0xMockWalletAddress']),",
  "        on: vi.fn(),",
  "        removeListener: vi.fn(),",
  "        selectedAddress: '0xMockWalletAddress',",
  "    },",
  "    writable: true,",
  "    configurable: true,",
  "});",
  "",
  "// Mock window.confirm to always return true",
  "vi.spyOn(window, 'confirm').mockReturnValue(true);",
  "",
  "// Mock the global fetch function to handle all API endpoints",
  "vi.spyOn(global, 'fetch').mockImplementation((url, options) => {",
  "    const urlStr = String(url);",
  "",
  "    // Handle /api/gemini/generate endpoint (both relative and absolute URLs)",
  "    if (urlStr.endsWith('/api/gemini/generate') || urlStr === '/api/gemini/generate') {",
  "        try {",
  "            const body = JSON.parse((options && options.body) ? options.body : '{}');",
  "            // Check both prompt and country for 'fail' keyword",
  "            const hasFail = (body.prompt && body.prompt.includes('fail')) || (body.country && body.country.includes('fail'));",
  "            if (hasFail) {",
  "                return Promise.resolve(new Response(JSON.stringify({ error: 'Failed to generate contract. Please try again.' }), { status: 500 }));",
  "            }",
  "            return Promise.resolve(new Response(JSON.stringify({ text: 'Generated Contract' }), { status: 200 }));",
  "        } catch (e) {",
  "            return Promise.resolve(new Response(JSON.stringify({ text: 'Generated Contract' }), { status: 200 }));",
  "        }",
  "    }",
  "",
  "    // Handle /api/gemini/legal-frameworks endpoint",
  "    if (urlStr.endsWith('/api/gemini/legal-frameworks') || urlStr.includes('/api/gemini/legal-frameworks')) {",
  "        return Promise.resolve(new Response(JSON.stringify({ frameworks: [] }), { status: 200 }));",
  "    }",
  "",
  "    // Handle /api/agreements endpoints",
  "    if (urlStr.includes('/api/agreements')) {",
  "        // Return mock data for agreements",
  "        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));",
  "    }",
  "",
  "    // Default: return empty 200 response for any unmatched URL",
  "    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));",
  "});",
  "",
].join(setupLE);

writeFile(setupPath, newSetup);

// ============================================================
// FIX 2: AdviserAgreements.test.tsx - Add window.ethereum mock
// ============================================================
console.log('\n=== FIX 2: AdviserAgreements.test.tsx ===');
const advTestPath = 'templates/AdviserAgreements.test.tsx';
let advTest = readFile(advTestPath);
const advLE = getLineEnding(advTest);

const newAdvTest = [
  "import React from 'react';",
  "import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';",
  "import { vi } from 'vitest';",
  "import { AdviserAgreements } from './AdviserAgreements';",
  "import * as AgreementService from '../src/agreements/service';",
  "import { AdviserAgreement } from '../types';",
  "",
  "// Mock the service module",
  "vi.mock('../src/agreements/service');",
  "",
  "// Mock notifications to prevent side effects",
  "vi.mock('../src/utils/notifications', () => ({",
  "    notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },",
  "}));",
  "",
  "// Mock useAutoSave hook",
  "vi.mock('../src/hooks/useAutoSave', () => ({",
  "    useAutoSave: () => ({ clearSaved: vi.fn() }),",
  "}));",
  "",
  "const mockAgreements: AdviserAgreement[] = [",
  "    {",
  "        id: 'AGMT_001',",
  "        type: 'adviser',",
  "        title: 'Advisor Agreement: Sarah',",
  "        party: { name: 'Sarah', avatarUrl: 'https://i.pravatar.cc/150?u=sarah', walletAddress: '0xSarahWallet' },",
  "        termOfEngagement: 2,",
  "        startDate: '2023-01-01',",
  "        status: 'Active',",
  "        details: { starterAllocation: 1000, coreTermAllocation: 5000, performanceMilestones: [], guidingPrinciples: '', vestedTokens: 1500, vestingSchedule: [] },",
  "    },",
  "    {",
  "        id: 'AGMT_002',",
  "        type: 'adviser',",
  "        title: 'Advisor Agreement: Mike',",
  "        party: { name: 'Mike', avatarUrl: 'https://i.pravatar.cc/150?u=mike', walletAddress: '0xMikeWallet' },",
  "        termOfEngagement: 1,",
  "        startDate: '2022-06-01',",
  "        status: 'Completed',",
  "        details: { starterAllocation: 500, coreTermAllocation: 2500, performanceMilestones: [], guidingPrinciples: '', vestedTokens: 3000, vestingSchedule: [] },",
  "    },",
  "];",
  "",
  "describe('AdviserAgreements', () => {",
  "    beforeEach(() => {",
  "        vi.mocked(AgreementService.getAgreements).mockResolvedValue([...mockAgreements]);",
  "        vi.mocked(AgreementService.signAgreement).mockImplementation(async (id) => {",
  "            const agreement = mockAgreements.find(a => a.id === id);",
  "            return { ...agreement!, status: 'Completed' };",
  "        });",
  "        vi.mocked(AgreementService.getAgreementSignatures).mockResolvedValue({",
  "            signatures: [],",
  "            allSignatures: [],",
  "        });",
  "    });",
  "",
  "    afterEach(() => {",
  "        vi.clearAllMocks();",
  "    });",
  "",
  "    it('should render loading state and then display agreements', async () => {",
  "        render(<AdviserAgreements onNavigateToNegotiation={() => {}} />);",
  "",
  "        await waitFor(() => {",
  "            expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument();",
  "            expect(screen.getByText('Advisor Agreement: Mike')).toBeInTheDocument();",
  "        });",
  "    });",
  "",
  "    it('should filter agreements by status', async () => {",
  "        render(<AdviserAgreements onNavigateToNegotiation={() => {}} />);",
  "        await waitFor(() => expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument());",
  "",
  "        // Both agreements should be visible initially",
  "        expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument();",
  "        expect(screen.getByText('Advisor Agreement: Mike')).toBeInTheDocument();",
  "",
  "        // Click on the 'Active' filter",
  "        fireEvent.click(screen.getByRole('button', { name: /active/i }));",
  "",
  "        // Only the active agreement should be visible",
  "        expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument();",
  "        expect(screen.queryByText('Advisor Agreement: Mike')).not.toBeInTheDocument();",
  "",
  "        // Click on the 'Completed' filter",
  "        fireEvent.click(screen.getByRole('button', { name: /completed/i }));",
  "",
  "        // Only the completed agreement should be visible",
  "        expect(screen.queryByText('Advisor Agreement: Sarah')).not.toBeInTheDocument();",
  "        expect(screen.getByText('Advisor Agreement: Mike')).toBeInTheDocument();",
  "    });",
  "",
  "    it('should allow a user to view and sign an agreement', async () => {",
  "        render(<AdviserAgreements onNavigateToNegotiation={() => {}} />);",
  "        await waitFor(() => expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument());",
  "",
  "        // Find and click the \"View Details\" button for the active agreement",
  "        const viewButtons = screen.getAllByText('View Details');",
  "        await act(async () => {",
  "            fireEvent.click(viewButtons[0]);",
  "        });",
  "",
  "        // Now in detail view, find and click the \"Sign Agreement\" button",
  "        await waitFor(() => expect(screen.getByText('Sign Agreement')).toBeInTheDocument());",
  "        await act(async () => {",
  "            fireEvent.click(screen.getByText('Sign Agreement'));",
  "        });",
  "",
  "        // Verify that the signAgreement service function was called",
  "        await waitFor(() => {",
  "            expect(AgreementService.signAgreement).toHaveBeenCalledWith('AGMT_001');",
  "        });",
  "    });",
  "});",
  "",
].join(advLE);

writeFile(advTestPath, newAdvTest);

console.log('\n=== ALL REMAINING FIXES APPLIED ===');
console.log('1. vitest.setup.ts - Added window.ethereum mock + check body.country for fail');
console.log('2. templates/AdviserAgreements.test.tsx - Added act() wrappers + wallet mock');
