/**
 * Fix script for all 5 failing test files on Machine #3 (DAOV1 project)
 * Run from: C:\Users\User\Documents\GitHub\DAOV1
 * Usage: node fix-all-tests.cjs
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname; // Run from DAOV1 root
const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'templates');
const SETUP_FILE = path.join(PROJECT_ROOT, 'vitest.setup.ts');

let totalFixes = 0;

function fix(filePath, oldStr, newStr, label) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`  [SKIP] File not found: ${fullPath}`);
    return false;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  if (!content.includes(oldStr)) {
    console.log(`  [SKIP] Pattern not found for: ${label}`);
    return false;
  }
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`  [FIXED] ${label}`);
  totalFixes++;
  return true;
}

// ============================================================
// 1. FIX: AdviserAgreements.test.tsx
// ============================================================
console.log('\n=== Fixing AdviserAgreements.test.tsx ===');
const adviserTestPath = path.join(TEMPLATES_DIR, 'AdviserAgreements.test.tsx');

// Problem: The component's handleSignAgreement checks for window.ethereum
// and calls signAgreement(id, signerAddress, signature) which returns {success, agreement, signatures}.
// The test mock is wrong (old signature) and window.ethereum is not mocked.
// Also, getAgreementSignatures is called in detail view but not mocked.
//
// Fix: Rewrite the entire test file to match the actual component behavior.
if (fs.existsSync(adviserTestPath)) {
  const newAdviserTest = `import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AdviserAgreements } from './AdviserAgreements';
import * as AgreementService from '../src/agreements/service';
import { AdviserAgreement } from '../types';

// Mock the service module
vi.mock('../src/agreements/service');

// Mock notifications to prevent errors
vi.mock('../src/utils/notifications', () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

const mockAgreements: AdviserAgreement[] = [
    {
        id: 'AGMT_001',
        type: 'adviser',
        title: 'Advisor Agreement: Sarah',
        party: { name: 'Sarah', avatarUrl: 'https://i.pravatar.cc/150?u=sarah', walletAddress: '0xSarahWallet' },
        termOfEngagement: 2,
        startDate: '2023-01-01',
        status: 'Active',
        details: { starterAllocation: 1000, coreTermAllocation: 5000, performanceMilestones: [], guidingPrinciples: '', vestedTokens: 1500, vestingSchedule: [] },
    },
    {
        id: 'AGMT_002',
        type: 'adviser',
        title: 'Advisor Agreement: Mike',
        party: { name: 'Mike', avatarUrl: 'https://i.pravatar.cc/150?u=mike', walletAddress: '0xMikeWallet' },
        termOfEngagement: 1,
        startDate: '2022-06-01',
        status: 'Completed',
        details: { starterAllocation: 500, coreTermAllocation: 2500, performanceMilestones: [], guidingPrinciples: '', vestedTokens: 3000, vestingSchedule: [] },
    },
];

describe('AdviserAgreements', () => {
    beforeEach(() => {
        vi.mocked(AgreementService.getAgreements).mockResolvedValue([...mockAgreements]);
        // Mock getAgreementSignatures since AgreementDetailView calls it on mount
        vi.mocked(AgreementService.getAgreementSignatures).mockResolvedValue({
            agreementId: 'AGMT_001',
            title: 'Advisor Agreement: Sarah',
            status: 'Active',
            requiredSigners: ['0xSarahWallet'],
            signatures: [{ address: '0xSarahWallet', signed: false, signedAt: null, verified: false }],
            allSignatures: [],
        });
        // Mock signAgreement with the new 3-arg signature returning {success, agreement, signatures}
        vi.mocked(AgreementService.signAgreement).mockImplementation(async (id, signerAddress, signature) => {
            const agreement = mockAgreements.find(a => a.id === id);
            return {
                success: true,
                agreement: { ...agreement!, status: 'Completed' as any },
                signatures: [],
            };
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        // Clean up window.ethereum mock
        delete (window as any).ethereum;
    });

    it('should render loading state and then display agreements', async () => {
        render(<AdviserAgreements onNavigateToNegotiation={() => {}} />);
        expect(screen.getByText('Loading agreements...')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument();
            expect(screen.getByText('Advisor Agreement: Mike')).toBeInTheDocument();
        });
    });

    it('should filter agreements by status', async () => {
        render(<AdviserAgreements onNavigateToNegotiation={() => {}} />);
        await waitFor(() => expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument());

        // Both agreements should be visible initially
        expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument();
        expect(screen.getByText('Advisor Agreement: Mike')).toBeInTheDocument();

        // Click on the 'Active' filter
        fireEvent.click(screen.getByRole('button', { name: /active/i }));

        // Only the active agreement should be visible
        expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument();
        expect(screen.queryByText('Advisor Agreement: Mike')).not.toBeInTheDocument();

        // Click on the 'Completed' filter
        fireEvent.click(screen.getByRole('button', { name: /completed/i }));

        // Only the completed agreement should be visible
        expect(screen.queryByText('Advisor Agreement: Sarah')).not.toBeInTheDocument();
        expect(screen.getByText('Advisor Agreement: Mike')).toBeInTheDocument();
    });

    it('should allow a user to view and sign an agreement', async () => {
        // Mock window.ethereum so the wallet signing flow works
        (window as any).ethereum = {
            request: vi.fn()
                .mockResolvedValueOnce(['0xTestWalletAddress']) // eth_requestAccounts
                .mockResolvedValueOnce('0xMockSignature'),       // personal_sign
        };

        render(<AdviserAgreements onNavigateToNegotiation={() => {}} />);
        await waitFor(() => expect(screen.getByText('Advisor Agreement: Sarah')).toBeInTheDocument());

        // Find and click the "View Details" button for the active agreement
        const viewButtons = screen.getAllByText('View Details');
        fireEvent.click(viewButtons[0]);

        // Now in detail view, find and click the "Sign Agreement" button
        await waitFor(() => expect(screen.getByText('Sign Agreement')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Sign Agreement'));

        // Verify that the signAgreement service function was called with 3 args
        await waitFor(() => {
            expect(AgreementService.signAgreement).toHaveBeenCalledWith(
                'AGMT_001',
                '0xTestWalletAddress',
                '0xMockSignature'
            );
        });
    });
});
`;
  fs.writeFileSync(adviserTestPath, newAdviserTest, 'utf8');
  console.log('  [FIXED] Rewrote entire test: mock window.ethereum, mock getAgreementSignatures, fix signAgreement mock signature');
  totalFixes++;
}


// ============================================================
// 2. FIX: DAOCreationWizard.test.tsx
// ============================================================
console.log('\n=== Fixing DAOCreationWizard.test.tsx ===');
const daoTestPath = path.join(TEMPLATES_DIR, 'DAOCreationWizard.test.tsx');

// Problems:
// - Step 1: "Next" button disabled requires name + surname + cellphone, but test only fills name + surname
// - Step 2: No "Wallet Address" field exists; fields are "DAO Name", "DAO Description", "Total Token Supply".
//   The test fills "Wallet Address" which doesn't exist. Next requires name + description + totalSupply>0.
// - Step 3: Growth Distribution sliders, no "Fire starter" button. Next requires total=100%.
//   The default distribution is already 40+30+30=100, so Next should be enabled by default.
// - Step 4: Council Allocation sliders, default is 25+25+25+25=100, Next enabled.
// - Step 5: Country field (select or input depending on API fetch). Button is "Generate Legal Framework with AI"
//   not "Generate Legal Framework". After generation, Next button says "Next with Contract ✓" or "Skip (Add Legal Framework Later)".
// - The fetch mock for /api/gemini/legal-frameworks needs to be handled (component fetches countries on mount).
// - "disables Next button on step 1": The test checks for disabled but step 1 Next requires all 3 fields empty,
//   which they are by default, so disabled should be true. But the Button component needs to pass disabled to the DOM.
// - "disables Next button on step 4 if allocation is not 100%": The test looks for getByLabelText(/founders/i)
//   which matches the step 4 slider label "founders" (the key is rendered with capitalize class, but the htmlFor
//   is the key name "founders"). This should work if we reach step 4.

if (fs.existsSync(daoTestPath)) {
  const newDaoTest = `import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DAOCreationWizard } from './DAOCreationWizard';
import { vi } from 'vitest';

// Mock the fetch globally for this test file to handle the countries API call
// and the generate endpoint
const originalFetch = global.fetch;

describe('DAOCreationWizard', () => {
  const mockMentorHook = {
    currentStep: 1,
    setCurrentStep: vi.fn(),
    learningStyle: 'visual',
    setLearningStyle: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    messages: [],
    setMessages: vi.fn(),
    coach: '',
    setCoach: vi.fn(),
  };

  const renderWizard = () => render(
    <DAOCreationWizard
      onDaoCreated={vi.fn()}
      isLoading={false}
      error={null}
      setError={vi.fn()}
      mentorHook={mockMentorHook}
    />
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch to handle both legal-frameworks and generate endpoints
    vi.spyOn(global, 'fetch').mockImplementation((url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      // Handle the countries/legal-frameworks endpoint
      if (urlStr.includes('/api/gemini/legal-frameworks')) {
        return Promise.resolve(new Response(JSON.stringify({ frameworks: [] }), { status: 200 }));
      }

      // Handle AI generate endpoint
      if (urlStr.includes('/api/gemini/generate')) {
        const body = options && options.body ? JSON.parse(options.body as string) : {};
        // Check both prompt and country for the word "fail" to trigger error
        const hasFail = (body.prompt && body.prompt.includes('fail')) || (body.country && body.country.includes('fail'));
        if (hasFail) {
          return Promise.resolve(new Response(JSON.stringify({ error: 'Failed to generate contract. Please try again.' }), { status: 500 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ text: 'Generated Contract' }), { status: 200 }));
      }

      // Default: return empty response
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the first step correctly', () => {
    renderWizard();
    expect(screen.getByText('Register DAO: Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Surname')).toBeInTheDocument();
    expect(screen.getByLabelText('Cell Phone')).toBeInTheDocument();
  });

  it('disables the Next button on step 1 if required fields are empty', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });

  it('allows navigation through all steps', async () => {
    const user = userEvent.setup();
    renderWizard();

    // Step 1: Personal Details (name, surname, cellphone all required)
    await user.type(screen.getByLabelText('Name'), 'John');
    await user.type(screen.getByLabelText('Surname'), 'Doe');
    await user.type(screen.getByLabelText('Cell Phone'), '0821234567');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Register DAO: Step 2 of 6')).toBeInTheDocument();

    // Step 2: DAO Details (DAO Name, DAO Description, Total Token Supply required)
    await user.type(screen.getByLabelText('DAO Name'), 'MyDAO');
    const descriptionField = screen.getByLabelText('DAO Description');
    await user.type(descriptionField, 'A decentralized organization');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Register DAO: Step 3 of 6')).toBeInTheDocument();

    // Step 3: Growth Distribution (defaults to 40+30+30=100, so Next is enabled)
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Register DAO: Step 4 of 6')).toBeInTheDocument();

    // Step 4: Council Allocation (defaults to 25+25+25+25=100, so Next is enabled)
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText('Register DAO: Step 5 of 6')).toBeInTheDocument();

    // Step 5: Legal Framework - since availableCountries is [], a text input is rendered
    await user.type(screen.getByLabelText('Country for Legal Framework'), 'Utopia');
    await user.click(screen.getByRole('button', { name: /Generate Legal Framework/i }));

    await waitFor(() => {
      expect(screen.getByText('Generated Contract')).toBeInTheDocument();
    });

    // Click the "Next with Contract" button to advance
    await user.click(screen.getByRole('button', { name: /Next with Contract/i }));
    expect(screen.getByText('Register DAO: Step 6 of 6')).toBeInTheDocument();
  });

  it('disables the Next button on step 4 if allocation is not 100%', async () => {
    const user = userEvent.setup();
    renderWizard();

    // Navigate to step 4
    await user.type(screen.getByLabelText('Name'), 'John');
    await user.type(screen.getByLabelText('Surname'), 'Doe');
    await user.type(screen.getByLabelText('Cell Phone'), '0821234567');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.type(screen.getByLabelText('DAO Name'), 'MyDAO');
    await user.type(screen.getByLabelText('DAO Description'), 'A test DAO');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    // Step 3 growth distribution defaults sum to 100, just click Next
    await user.click(screen.getByRole('button', { name: /Next/i }));

    // Step 4: Change founders slider so total != 100
    const foundersSlider = screen.getByLabelText(/founders/i);
    fireEvent.change(foundersSlider, { target: { value: '50' } });
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });

  it('shows an error message if AI contract generation fails', async () => {
    const user = userEvent.setup();
    renderWizard();

    // Navigate to step 5
    await user.type(screen.getByLabelText('Name'), 'John');
    await user.type(screen.getByLabelText('Surname'), 'Doe');
    await user.type(screen.getByLabelText('Cell Phone'), '0821234567');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.type(screen.getByLabelText('DAO Name'), 'MyDAO');
    await user.type(screen.getByLabelText('DAO Description'), 'A test DAO');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    // Step 3
    await user.click(screen.getByRole('button', { name: /Next/i }));
    // Step 4
    await user.click(screen.getByRole('button', { name: /Next/i }));

    // Step 5 - type a country that includes "fail" to trigger the mock error
    await user.type(screen.getByLabelText('Country for Legal Framework'), 'fail');
    await user.click(screen.getByRole('button', { name: /Generate Legal Framework/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to generate contract. Please try again.')).toBeInTheDocument();
    });
  });
});
`;
  fs.writeFileSync(daoTestPath, newDaoTest, 'utf8');
  console.log('  [FIXED] Rewrote entire test: fill cellphone, fix step 2 fields (DAO Description instead of Wallet Address), remove Fire starter, fix step navigation, mock fetch for countries API');
  totalFixes++;
}


// ============================================================
// 3. FIX: GovernanceVoting.test.tsx
// ============================================================
console.log('\n=== Fixing GovernanceVoting.test.tsx ===');
const govTestPath = path.join(TEMPLATES_DIR, 'GovernanceVoting.test.tsx');

// Problems:
// - Test mocks governanceService.getProposals but component uses governanceService.getAllProposals
// - Test mocks governanceService.submitVote but component uses governanceService.vote
// - Component does NOT show "Loading proposals..." text; it shows <ProposalSkeleton /> elements
// - The component imports governanceService (the object) and calls governanceService.getAllProposals()
//   and governanceService.vote(). The test vi.mock('../src/governance/service') will mock the whole module.
//   We need to mock governanceService.getAllProposals and governanceService.vote on the service object.
// - Vote call is governanceService.vote(proposalId, { voter, vote, weight, timestamp })
//   not submitVote(id, 'for', power)
// - The paginatedProposals issue with p.status undefined happens because mock isn't set up on the right function

if (fs.existsSync(govTestPath)) {
  const newGovTest = `import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { GovernanceVoting } from './GovernanceVoting';
import { governanceService } from '../src/governance/service';
import { Proposal } from '../types';

// Mock the service module
vi.mock('../src/governance/service');

// Mock notifications
vi.mock('../src/utils/notifications', () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

const mockProposals: Proposal[] = [
    {
        id: 'p1',
        title: 'Q3 Budget Allocation for Marketing',
        description: 'A marketing proposal.',
        proposer: { name: 'Marketing Guild', avatarUrl: '' },
        status: 'Active',
        votesFor: 1250000,
        votesAgainst: 450000,
        votesAbstain: 100000,
        endDate: '3 days remaining',
    },
    {
        id: 'p2',
        title: 'Integrate New Oracle Service',
        description: 'An oracle proposal.',
        proposer: { name: 'Dev Guild', avatarUrl: '' },
        status: 'Passed',
        votesFor: 2800000,
        votesAgainst: 150000,
        votesAbstain: 50000,
        endDate: 'Ended 2 days ago',
    },
];

describe('GovernanceVoting', () => {
    beforeEach(() => {
        // Mock the actual methods the component calls
        vi.mocked(governanceService.getAllProposals).mockResolvedValue([...mockProposals]);
        vi.mocked(governanceService.vote).mockImplementation(async (proposalId, voteData) => {
            const proposal = mockProposals.find(p => p.id === proposalId);
            return { ...proposal!, votesFor: proposal!.votesFor + voteData.weight };
        });
        vi.mocked(governanceService.createProposal).mockResolvedValue({
            id: 'p3',
            title: 'New Proposal',
            description: 'Test',
            proposer: { name: 'Test', avatarUrl: '' },
            status: 'Active',
            votesFor: 0,
            votesAgainst: 0,
            votesAbstain: 0,
            endDate: '14 days remaining',
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should render loading state and then the list of proposals', async () => {
        render(<GovernanceVoting />);
        // Component shows ProposalSkeleton during loading, not text.
        // Just wait for the proposals to appear after loading.
        await waitFor(() => {
            expect(screen.getByText('Q3 Budget Allocation for Marketing')).toBeInTheDocument();
            expect(screen.getByText('Integrate New Oracle Service')).toBeInTheDocument();
        });
    });

    it('should filter proposals when a status tab is clicked', async () => {
        render(<GovernanceVoting />);
        await waitFor(() => expect(screen.getByText('Q3 Budget Allocation for Marketing')).toBeInTheDocument());

        // Click 'Passed' filter
        fireEvent.click(screen.getByRole('button', { name: /passed/i }));

        await waitFor(() => {
            expect(screen.queryByText('Q3 Budget Allocation for Marketing')).not.toBeInTheDocument();
            expect(screen.getByText('Integrate New Oracle Service')).toBeInTheDocument();
        });
    });

    it('should call the vote service when a vote button is clicked', async () => {
        render(<GovernanceVoting />);
        await waitFor(() => expect(screen.getByText('Q3 Budget Allocation for Marketing')).toBeInTheDocument());

        const voteForButton = screen.getByRole('button', { name: /Vote For/i });
        fireEvent.click(voteForButton);

        await waitFor(() => {
            // Component calls governanceService.vote(proposalId, { voter, vote, weight, timestamp })
            expect(governanceService.vote).toHaveBeenCalledWith(
                'p1',
                expect.objectContaining({
                    voter: expect.any(String),
                    vote: 'yes',
                    weight: expect.any(Number),
                })
            );
        });
    });
});
`;
  fs.writeFileSync(govTestPath, newGovTest, 'utf8');
  console.log('  [FIXED] Rewrote entire test: mock governanceService.getAllProposals/vote instead of getProposals/submitVote, remove loading text assertion, fix vote call expectation');
  totalFixes++;
}


// ============================================================
// 4. FIX: IdeaBubbles.test.tsx
// ============================================================
console.log('\n=== Fixing IdeaBubbles.test.tsx ===');
const bubblesTestPath = path.join(TEMPLATES_DIR, 'IdeaBubbles.test.tsx');

// Problems:
// - Test expects "Loading bubbles..." but component renders "Loading your bubbles..."
// - Test mocks bubblesService.getBubbles but component uses bubblesService.getAllBubbles
// - Test mocks bubblesService.createBubble which is correct (both the object method and legacy export exist)
// - The BubbleListView calls bubblesService.getAllBubbles()

if (fs.existsSync(bubblesTestPath)) {
  const newBubblesTest = `import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { IdeaBubbles } from './IdeaBubbles';
import { bubblesService } from '../src/bubbles/service';

// Mock the service module
vi.mock('../src/bubbles/service');

// Mock notifications
vi.mock('../src/utils/notifications', () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

const mockBubbles = [
    { id: 'BUBBLE_001', name: 'Rise Atlantis Season 2', fundingProgress: 75, status: 'Active & Fundraising', sodaRaised: 75000, backers: 42, healthScore: 85, team: [], roadmap: [], updates: [], treasury: { balance: 50000, transactions: [] } },
    { id: 'BUBBLE_002', name: 'Mycelium Music Collective', fundingProgress: 100, status: 'Funded', sodaRaised: 100000, backers: 120, healthScore: 95, team: [], roadmap: [], updates: [], treasury: { balance: 100000, transactions: [] } },
];

describe('IdeaBubbles', () => {
    beforeEach(() => {
        // Mock the actual method the component calls
        vi.mocked(bubblesService.getAllBubbles).mockResolvedValue([...mockBubbles] as any);
        vi.mocked(bubblesService.createBubble).mockResolvedValue({ id: 'BUBBLE_003', name: 'New Bubble', fundingProgress: 0, status: 'Draft', sodaRaised: 0, backers: 0, healthScore: 0, team: [], roadmap: [], updates: [], treasury: { balance: 0, transactions: [] } } as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should render loading state and then the list of bubbles', async () => {
        render(<IdeaBubbles />);
        // Component shows "Loading your bubbles..." not "Loading bubbles..."
        expect(screen.getByText('Loading your bubbles...')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Rise Atlantis Season 2')).toBeInTheDocument();
            expect(screen.getByText('Mycelium Music Collective')).toBeInTheDocument();
        });
    });

    it('should open the create bubble wizard when "Launch New Bubble" is clicked', async () => {
        render(<IdeaBubbles />);
        const launchButton = await screen.findByRole('button', { name: /launch new bubble/i });
        expect(launchButton).toBeInTheDocument();

        fireEvent.click(launchButton);

        await waitFor(() => {
            expect(screen.getByText("Let's build something new.")).toBeInTheDocument();
        });
    });

    it('should allow creating a new bubble through the wizard', async () => {
        render(<IdeaBubbles />);
        const launchButton = await screen.findByRole('button', { name: /launch new bubble/i });
        fireEvent.click(launchButton);

        // Step 1: Name and Vision
        await waitFor(() => expect(screen.getByLabelText('Bubble Name')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Bubble Name'), { target: { value: 'My New Idea' } });
        fireEvent.change(screen.getByLabelText('One-Line Vision'), { target: { value: 'A great new idea.' } });
        fireEvent.click(screen.getByText('Next: Choose Type'));

        // Step 2: Type
        await waitFor(() => expect(screen.getByText('What kind of Bubble is it?')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Event' }));
        fireEvent.click(screen.getByText('Next: Set Up Supply'));

        // Step 3: Supply & Finalize
        await waitFor(() => expect(screen.getByText('Set Total Share Supply')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Next: Allocate Shares'));

        // Verify that the createBubble service function was called
        await waitFor(() => {
            expect(bubblesService.createBubble).toHaveBeenCalledWith({
                name: 'My New Idea',
                type: 'Event',
            });
        });
    });
});
`;
  fs.writeFileSync(bubblesTestPath, newBubblesTest, 'utf8');
  console.log('  [FIXED] Rewrote entire test: mock bubblesService.getAllBubbles instead of getBubbles, fix loading text to "Loading your bubbles...", add full Bubble shape to mocks');
  totalFixes++;
}


// ============================================================
// 5. FIX: TokenDistribution.test.tsx
// ============================================================
console.log('\n=== Fixing TokenDistribution.test.tsx ===');
const tokenTestPath = path.join(TEMPLATES_DIR, 'TokenDistribution.test.tsx');

// Problems:
// - Test expects "Loading..." but component shows <TableSkeleton> (no loading text)
// - Test mocks tokenDistributionService.getTokenDistributionGroups but component imports
//   getTokenDistributionGroups directly (named export)
// - Test mocks tokenDistributionService.claimTokens but component imports claimTokens directly
// - claimTokens signature is now (groupId, userId, amount) and returns ClaimTokensResponse
//   (not the old format returning group with updated claimed)
// - Component also calls getVestingInfo(group.id, currentUserId) when selecting a group
// - The claim button text includes the available amount from vestingInfo
// - window.confirm needs to be mocked for handleClaim

if (fs.existsSync(tokenTestPath)) {
  const newTokenTest = `import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TokenDistribution } from './TokenDistribution';
import * as tokenDistributionService from '../src/token-distribution/service';
import { TokenDistributionGroup } from '../types';

// Mock the service module
vi.mock('../src/token-distribution/service');

// Mock notifications
vi.mock('../src/utils/notifications', () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

const mockGroups: TokenDistributionGroup[] = [
    { id: '1', groupName: 'Founders & Core Team', percentage: 20, totalTokens: 20000000, vestingPeriod: '4 years, 1 year cliff', claimed: 500000 },
    { id: '2', groupName: 'Advisors & Early Backers', percentage: 15, totalTokens: 15000000, vestingPeriod: '2 years, 6 month cliff', claimed: 2500000 },
];

const mockVestingInfo = {
    totalAllocated: 1000000,
    vestedAmount: 600000,
    claimedAmount: 500000,
    availableToClaim: 100000,
    nextUnlock: '2025-06-01T00:00:00Z',
    nextUnlockAmount: 50000,
};

describe('TokenDistribution', () => {
    beforeEach(() => {
        // Mock the named exports that the component imports directly
        vi.mocked(tokenDistributionService.getTokenDistributionGroups).mockResolvedValue([...mockGroups]);
        vi.mocked(tokenDistributionService.getVestingInfo).mockResolvedValue({ ...mockVestingInfo });
        vi.mocked(tokenDistributionService.claimTokens).mockResolvedValue({
            claimed: 100000,
            newBalance: 600000,
            transactionHash: '0xabc123',
        } as any);

        // Mock window.confirm for claiming
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('should render loading state and then the list of groups', async () => {
        render(<TokenDistribution />);
        // Component uses <TableSkeleton> for loading, not text.
        // Just verify the groups appear after loading.
        await waitFor(() => {
            expect(screen.getByText('Founders & Core Team (20%)')).toBeInTheDocument();
            expect(screen.getByText('Advisors & Early Backers (15%)')).toBeInTheDocument();
        });
    });

    it('should show details and allow claiming when a group is clicked', async () => {
        render(<TokenDistribution />);
        await waitFor(() => expect(screen.getByText('Founders & Core Team (20%)')).toBeInTheDocument());

        // Click on the first group
        fireEvent.click(screen.getByText('Founders & Core Team (20%)'));

        // Check that the detail view is shown
        await waitFor(() => {
            expect(screen.getByText('Details: Founders & Core Team')).toBeInTheDocument();
        });

        // Wait for vesting info to load and the claim button to appear
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Claim.*Vested Tokens/i })).toBeInTheDocument();
        });

        // Click the claim button
        const claimButton = screen.getByRole('button', { name: /Claim.*Vested Tokens/i });
        fireEvent.click(claimButton);

        // Verify that the claimTokens service function was called with (groupId, userId, amount)
        await waitFor(() => {
            expect(tokenDistributionService.claimTokens).toHaveBeenCalledWith('1', 'user_founder1', 100000);
        });
    });
});
`;
  fs.writeFileSync(tokenTestPath, newTokenTest, 'utf8');
  console.log('  [FIXED] Rewrote entire test: mock named exports (getTokenDistributionGroups, getVestingInfo, claimTokens), remove "Loading..." text assertion, fix claimTokens call signature, mock window.confirm');
  totalFixes++;
}


// ============================================================
// 6. FIX: vitest.setup.ts - ensure fetch mock handles legal-frameworks
// ============================================================
console.log('\n=== Checking vitest.setup.ts ===');
if (fs.existsSync(SETUP_FILE)) {
  const setupContent = fs.readFileSync(SETUP_FILE, 'utf8');
  // Make sure the setup file's fetch mock also handles the legal-frameworks endpoint
  // to prevent unhandled fetch calls during DAOCreationWizard tests
  if (!setupContent.includes('legal-frameworks')) {
    fix(SETUP_FILE,
      `vi.spyOn(global, 'fetch').mockImplementation((url, options) => {
    if (url === '/api/gemini/generate') {`,
      `vi.spyOn(global, 'fetch').mockImplementation((url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    // Handle legal-frameworks endpoint (used by DAOCreationWizard on mount)
    if (urlStr.includes('/api/gemini/legal-frameworks')) {
        return Promise.resolve(new Response(JSON.stringify({ frameworks: [] }), { status: 200 }));
    }
    if (urlStr.includes('/api/gemini/generate') || url === '/api/gemini/generate') {`,
      'Add legal-frameworks endpoint handler to vitest.setup.ts fetch mock'
    );

    // Also fix the closing of the generate handler to match the new nesting
    // The original has the generate handler ending and then a catch-all.
    // We need to make sure the structure is correct.
  }
}

console.log(`\n========================================`);
console.log(`Total fixes applied: ${totalFixes}`);
console.log(`========================================\n`);

console.log('Summary of changes:');
console.log('');
console.log('1. AdviserAgreements.test.tsx:');
console.log('   - Mock window.ethereum for wallet signing flow');
console.log('   - Mock getAgreementSignatures (called by detail view on mount)');
console.log('   - Fix signAgreement mock: now takes (id, signerAddress, signature) and returns {success, agreement, signatures}');
console.log('   - Mock notifications to prevent import errors');
console.log('');
console.log('2. DAOCreationWizard.test.tsx:');
console.log('   - Fill cellphone field in step 1 (required for Next button)');
console.log('   - Fix step 2: fill "DAO Description" instead of non-existent "Wallet Address"');
console.log('   - Remove "Fire starter" button click (does not exist); step 3 defaults sum to 100%');
console.log('   - Mock fetch for /api/gemini/legal-frameworks to return empty array');
console.log('   - Fix "Generate Legal Framework" button name regex to match "Generate Legal Framework with AI"');
console.log('   - Fix step 5->6 navigation: click "Next with Contract" instead of "Next"');
console.log('');
console.log('3. GovernanceVoting.test.tsx:');
console.log('   - Mock governanceService.getAllProposals instead of getProposals');
console.log('   - Mock governanceService.vote instead of submitVote');
console.log('   - Remove "Loading proposals..." assertion (component shows skeleton, not text)');
console.log('   - Fix vote expectation: expect vote({voter, vote:"yes", weight}) object format');
console.log('');
console.log('4. IdeaBubbles.test.tsx:');
console.log('   - Mock bubblesService.getAllBubbles instead of getBubbles');
console.log('   - Fix loading text: "Loading your bubbles..." instead of "Loading bubbles..."');
console.log('   - Add full Bubble object shape to mock data (backers, healthScore, team, etc.)');
console.log('');
console.log('5. TokenDistribution.test.tsx:');
console.log('   - Mock named exports (getTokenDistributionGroups, getVestingInfo, claimTokens)');
console.log('   - Remove "Loading..." text assertion (component shows TableSkeleton)');
console.log('   - Mock getVestingInfo (called when group is selected)');
console.log('   - Fix claimTokens mock: signature is (groupId, userId, amount), returns ClaimTokensResponse');
console.log('   - Mock window.confirm for claim confirmation dialog');
console.log('   - Fix claim button selector to match dynamic text "Claim {amount} Vested Tokens"');
