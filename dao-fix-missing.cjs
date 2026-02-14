const fs = require('fs');
const path = require('path');
const base = 'C:/Users/User/Documents/GitHub/DAOV1';

// ============================================================
// FIX 1: Add missing exports to src/dao/service.ts
// ============================================================
console.log('=== FIX 1: Add missing exports to dao/service.ts ===');

const svcPath = path.join(base, 'src/dao/service.ts');
let svcContent = fs.readFileSync(svcPath, 'utf8');

const missingFunctions = `

// ============================================
// AGREEMENT FUNCTIONS
// ============================================

export const sendAgreementInvite = async (data: {
    memberId: string;
    agreementType: string;
    email: string;
}): Promise<{ inviteId: string; signingUrl: string }> => {
    const result = await apiPost<{
        success: boolean;
        inviteId: string;
        signingUrl: string;
    }>('/api/agreements/invite', data);
    return { inviteId: result.inviteId || 'new', signingUrl: result.signingUrl || '' };
};

export const resendAgreementInvite = async (inviteId: string): Promise<{ success: boolean }> => {
    const result = await apiPost<{ success: boolean }>(\`/api/agreements/invite/\${inviteId}/resend\`, {});
    return { success: result.success };
};

export const validateSigningToken = async (token: string): Promise<{
    valid: boolean;
    agreement?: any;
    member?: any;
}> => {
    try {
        const result = await apiGet<{
            success: boolean;
            valid: boolean;
            agreement: any;
            member: any;
        }>(\`/api/agreements/validate/\${token}\`);
        return { valid: result.valid, agreement: result.agreement, member: result.member };
    } catch {
        return { valid: false };
    }
};

export const completeAgreementSigning = async (data: {
    token: string;
    signature: string;
    walletAddress: string;
}): Promise<{ success: boolean; agreementId: string }> => {
    const result = await apiPost<{
        success: boolean;
        agreementId: string;
    }>('/api/agreements/sign', data);
    return { success: result.success, agreementId: result.agreementId || '' };
};

export const createMilestone = async (data: {
    memberId: string;
    title: string;
    description: string;
    dueDate: string;
    tokenReward?: number;
}): Promise<{ milestoneId: string }> => {
    const result = await apiPost<{ success: boolean; milestoneId: string }>('/api/milestones', data);
    return { milestoneId: result.milestoneId || 'new' };
};
`;

if (!svcContent.includes('sendAgreementInvite')) {
  svcContent += missingFunctions;
  fs.writeFileSync(svcPath, svcContent, 'utf8');
  console.log('  Added 5 missing functions:');
  console.log('    - sendAgreementInvite');
  console.log('    - resendAgreementInvite');
  console.log('    - validateSigningToken');
  console.log('    - completeAgreementSigning');
  console.log('    - createMilestone');
} else {
  console.log('  Functions already present - skipping');
}

// ============================================================
// FIX 2: Fix DashboardLayout to pass daoData via Outlet context
// ============================================================
console.log('\n=== FIX 2: Fix DashboardLayout outlet context ===');

const layoutPath = path.join(base, 'src/layouts/DashboardLayout.tsx');
let layoutContent = fs.readFileSync(layoutPath, 'utf8');
const layoutBackup = layoutContent;

// Check if it already passes context
if (layoutContent.includes('context=')) {
  console.log('  Already passes context - skipping');
} else {
  // Strategy: Replace <Outlet /> with <Outlet context={{ daoData }} />
  // Also need to add daoData state and fetch logic

  // First check if layout already fetches daoData
  if (!layoutContent.includes('daoData')) {
    // Need to add state + fetch + context
    // Find the imports section and add useState/useEffect if not present
    if (!layoutContent.includes('useState')) {
      layoutContent = layoutContent.replace(
        "import React",
        "import React, { useState, useEffect }"
      );
      if (!layoutContent.includes('useState')) {
        // Try different import pattern
        layoutContent = layoutContent.replace(
          "from 'react'",
          ", useState, useEffect } from 'react'"
        );
      }
    } else if (!layoutContent.includes('useEffect')) {
      layoutContent = layoutContent.replace(
        'useState',
        'useState, useEffect'
      );
    }

    // Add API_URL and daoData state near the top of the component function
    // Find the component function body
    const componentMatch = layoutContent.match(/(export\s+(?:default\s+)?(?:function|const)\s+\w+[^{]*\{)/);
    if (componentMatch) {
      const insertPoint = componentMatch.index + componentMatch[0].length;
      const daoDataCode = `
  const [daoData, setDaoData] = useState<any>(null);
  const [councilMember, setCouncilMember] = useState<any>(null);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || '';
    fetch(\`\${API_URL}/api/dao\`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setDaoData(data))
      .catch(() => setDaoData(null));
    fetch(\`\${API_URL}/api/council\`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.stats) setCouncilMember(data);
      })
      .catch(() => {});
  }, []);
`;
      layoutContent = layoutContent.slice(0, insertPoint) + daoDataCode + layoutContent.slice(insertPoint);
      console.log('  Added daoData state and fetch logic');
    } else {
      console.log('  WARNING: Could not find component function body');
    }
  }

  // Replace <Outlet /> with <Outlet context={{ daoData, councilMember }} />
  if (layoutContent.includes('<Outlet />')) {
    layoutContent = layoutContent.replace(
      '<Outlet />',
      '<Outlet context={{ daoData, councilMember }} />'
    );
    console.log('  Updated <Outlet /> to pass daoData context');
  } else if (layoutContent.includes('<Outlet/>')) {
    layoutContent = layoutContent.replace(
      '<Outlet/>',
      '<Outlet context={{ daoData, councilMember }} />'
    );
    console.log('  Updated <Outlet/> to pass daoData context');
  } else {
    console.log('  WARNING: Could not find <Outlet /> tag');
    // Show what's around Outlet
    const lines = layoutContent.split('\n');
    lines.forEach((l, i) => {
      if (l.includes('Outlet')) {
        console.log('  Line ' + (i+1) + ': ' + l.trim());
      }
    });
  }

  if (layoutContent !== layoutBackup) {
    fs.writeFileSync(layoutPath + '.bak', layoutBackup, 'utf8');
    fs.writeFileSync(layoutPath, layoutContent, 'utf8');
    console.log('  DONE: DashboardLayout.tsx updated');
  }
}

// ============================================================
// VERIFY
// ============================================================
console.log('\n=== Verification ===');

// Check service exports
const finalSvc = fs.readFileSync(svcPath, 'utf8');
const neededExports = ['sendAgreementInvite', 'resendAgreementInvite', 'validateSigningToken', 'completeAgreementSigning', 'createMilestone'];
neededExports.forEach(name => {
  const found = finalSvc.includes('export const ' + name);
  console.log('  ' + name + ': ' + (found ? 'OK' : 'MISSING'));
});

// Check layout
const finalLayout = fs.readFileSync(layoutPath, 'utf8');
console.log('  Outlet with context: ' + finalLayout.includes('context='));

console.log('\nFIX_MISSING_DONE');
