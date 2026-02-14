/**
 * DAO Fix Phase 1+2: Create missing tables, add missing GET / handlers, seed data
 * Run from: C:\Users\User\Documents\GitHub\DAOV1
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'mentor_chats.db');
console.log('Opening database:', DB_PATH);
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// ============================================
// PHASE 1: Create missing tables
// ============================================

console.log('\n=== PHASE 1: Creating missing tables ===\n');

// 1. council_members table
const hasCouncilMembers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='council_members'").get();
if (!hasCouncilMembers) {
  db.exec(`
    CREATE TABLE council_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dao_id INTEGER,
      agreement_id TEXT,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      wallet_address TEXT NOT NULL,
      photo_url TEXT,
      role_type TEXT NOT NULL CHECK(role_type IN ('founder','advisor','contributor','firstborn')),
      role_category TEXT,
      custom_role_description TEXT,
      token_allocation_total REAL DEFAULT 0,
      firestarter_period_months INTEGER,
      term_months INTEGER,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_signature','pending','signed','active','completed','cancelled')),
      sodaworld_user_id TEXT,
      created_by TEXT DEFAULT 'system',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      activated_at TEXT,
      completed_at TEXT
    )
  `);
  console.log('Created table: council_members');
} else {
  console.log('Table council_members already exists');
  // Check if sodaworld_user_id column exists
  const cols = db.prepare("PRAGMA table_info(council_members)").all();
  const hasSodaworld = cols.some(c => c.name === 'sodaworld_user_id');
  if (!hasSodaworld) {
    db.exec("ALTER TABLE council_members ADD COLUMN sodaworld_user_id TEXT");
    console.log('  Added column: sodaworld_user_id');
  }
}

// 2. milestones table
const hasMilestones = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='milestones'").get();
if (!hasMilestones) {
  db.exec(`
    CREATE TABLE milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agreement_id TEXT,
      council_member_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      milestone_order INTEGER DEFAULT 1,
      target_date TEXT,
      token_amount REAL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed')),
      completed_date TEXT,
      verified_by TEXT,
      completion_notes TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('Created table: milestones');
} else {
  console.log('Table milestones already exists');
}

// 3. generated_contracts table
const hasGeneratedContracts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generated_contracts'").get();
if (!hasGeneratedContracts) {
  db.exec(`
    CREATE TABLE generated_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agreement_id TEXT NOT NULL,
      council_member_id INTEGER,
      contract_text TEXT,
      contract_version INTEGER DEFAULT 1,
      generation_params TEXT,
      legal_framework TEXT,
      agreement_type TEXT,
      status TEXT DEFAULT 'generated',
      error_message TEXT,
      generated_at TEXT DEFAULT (datetime('now')),
      generated_by TEXT,
      approved_by TEXT,
      approved_at TEXT
    )
  `);
  console.log('Created table: generated_contracts');
} else {
  console.log('Table generated_contracts already exists');
}

// 4. agreement_workflow_log table
const hasWorkflowLog = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agreement_workflow_log'").get();
if (!hasWorkflowLog) {
  db.exec(`
    CREATE TABLE agreement_workflow_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agreement_id TEXT NOT NULL,
      council_member_id INTEGER,
      from_status TEXT,
      to_status TEXT NOT NULL,
      transition_reason TEXT,
      changed_by TEXT,
      changed_by_role TEXT,
      additional_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('Created table: agreement_workflow_log');
} else {
  console.log('Table agreement_workflow_log already exists');
}

// 5. token_release_schedule table
const hasTokenRelease = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='token_release_schedule'").get();
if (!hasTokenRelease) {
  db.exec(`
    CREATE TABLE token_release_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      council_member_id INTEGER NOT NULL,
      agreement_id TEXT,
      milestone_id INTEGER,
      release_type TEXT DEFAULT 'milestone_based',
      token_amount REAL NOT NULL,
      release_date TEXT,
      status TEXT DEFAULT 'locked',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('Created table: token_release_schedule');
} else {
  console.log('Table token_release_schedule already exists');
}

// 6. signature_links table (needed by signatures.ts)
const hasSignatureLinks = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='signature_links'").get();
if (!hasSignatureLinks) {
  db.exec(`
    CREATE TABLE signature_links (
      id TEXT PRIMARY KEY,
      agreement_id TEXT NOT NULL,
      council_member_id INTEGER,
      link_type TEXT DEFAULT 'member_signature',
      expires_at TEXT,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('Created table: signature_links');
} else {
  console.log('Table signature_links already exists');
}

// ============================================
// PHASE 3: Seed data
// ============================================

console.log('\n=== PHASE 3: Seeding data ===\n');

// Seed council_members
const memberCount = db.prepare("SELECT COUNT(*) as c FROM council_members").get().c;
if (memberCount === 0) {
  const insert = db.prepare(`
    INSERT INTO council_members (dao_id, name, surname, email, wallet_address, role_type, role_category,
    custom_role_description, token_allocation_total, firestarter_period_months, term_months, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const members = [
    [1, 'Marcus', 'Chen', 'marcus@sodaworld.io', '7xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwi', 'founder', 'Technical', 'Lead Architect & CTO', 4000000, 12, null, 'active'],
    [1, 'Sarah', 'Williams', 'sarah@sodaworld.io', '9xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwj', 'founder', 'Business', 'CEO & Strategy Lead', 4000000, 12, null, 'active'],
    [1, 'James', 'Wright', 'james@sodaworld.io', '5xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwk', 'founder', 'Creative', 'Creative Director', 3000000, 12, null, 'active'],
    [1, 'Lisa', 'Park', 'lisa@sodaworld.io', '3xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwl', 'advisor', 'Legal', 'Legal Counsel & Compliance', 2000000, null, 24, 'active'],
    [1, 'David', 'Kumar', 'david@sodaworld.io', '2xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwm', 'advisor', 'Technical', 'Blockchain Advisor', 1500000, null, 18, 'active'],
    [1, 'Emma', 'Rodriguez', 'emma@sodaworld.io', '8xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwn', 'contributor', 'Development', 'Senior Smart Contract Developer', 1000000, null, 12, 'active'],
    [1, 'Alex', 'Thompson', 'alex@sodaworld.io', '4xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwo', 'contributor', 'Community', 'Community Manager', 500000, null, 12, 'active'],
    [1, 'Mia', 'Johnson', 'mia@sodaworld.io', '6xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwp', 'firstborn', 'Early Adopter', 'Genesis Community Member', 250000, null, 6, 'active'],
    [1, 'Noah', 'Davis', 'noah@sodaworld.io', '1xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwq', 'firstborn', 'Early Adopter', 'Genesis Community Member', 250000, null, 6, 'active'],
  ];

  const insertMany = db.transaction((members) => {
    for (const m of members) {
      insert.run(...m);
    }
  });
  insertMany(members);
  console.log('Seeded council_members: 9 members (3 founders, 2 advisors, 2 contributors, 2 firstborn)');
} else {
  console.log(`council_members already has ${memberCount} rows`);
}

// Link some council members to agreements
const agreementCount = db.prepare("SELECT COUNT(*) as c FROM agreements").get().c;
if (agreementCount === 0) {
  const agreementInsert = db.prepare(`
    INSERT INTO agreements (id, title, type, party, termOfEngagement, startDate, status, details, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const agreements = [
    ['agr-f1', 'Founder Agreement - Marcus Chen', 'Founder Agreement',
     JSON.stringify({name: 'Marcus', surname: 'Chen', email: 'marcus@sodaworld.io', walletAddress: '7xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwi'}),
     48, '2024-01-01', 'Active',
     JSON.stringify({role_category: 'Technical', token_allocation: 4000000, firestarter_period_months: 12})],
    ['agr-f2', 'Founder Agreement - Sarah Williams', 'Founder Agreement',
     JSON.stringify({name: 'Sarah', surname: 'Williams', email: 'sarah@sodaworld.io', walletAddress: '9xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwj'}),
     48, '2024-01-01', 'Active',
     JSON.stringify({role_category: 'Business', token_allocation: 4000000, firestarter_period_months: 12})],
    ['agr-f3', 'Founder Agreement - James Wright', 'Founder Agreement',
     JSON.stringify({name: 'James', surname: 'Wright', email: 'james@sodaworld.io', walletAddress: '5xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwk'}),
     48, '2024-01-01', 'Active',
     JSON.stringify({role_category: 'Creative', token_allocation: 3000000, firestarter_period_months: 12})],
    ['agr-a1', 'Advisor Agreement - Lisa Park', 'Advisor Agreement',
     JSON.stringify({name: 'Lisa', surname: 'Park', email: 'lisa@sodaworld.io', walletAddress: '3xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwl'}),
     24, '2024-06-01', 'Active',
     JSON.stringify({role_category: 'Legal', token_allocation: 2000000})],
    ['agr-a2', 'Advisor Agreement - David Kumar', 'Advisor Agreement',
     JSON.stringify({name: 'David', surname: 'Kumar', email: 'david@sodaworld.io', walletAddress: '2xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwm'}),
     18, '2024-06-01', 'Active',
     JSON.stringify({role_category: 'Technical', token_allocation: 1500000})],
    ['agr-c1', 'Contributor Agreement - Emma Rodriguez', 'Contributor Agreement',
     JSON.stringify({name: 'Emma', surname: 'Rodriguez', email: 'emma@sodaworld.io', walletAddress: '8xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwn'}),
     12, '2024-09-01', 'Active',
     JSON.stringify({role_category: 'Development', token_allocation: 1000000})],
    ['agr-c2', 'Contributor Agreement - Alex Thompson', 'Contributor Agreement',
     JSON.stringify({name: 'Alex', surname: 'Thompson', email: 'alex@sodaworld.io', walletAddress: '4xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwo'}),
     12, '2024-09-01', 'Active',
     JSON.stringify({role_category: 'Community', token_allocation: 500000})],
  ];

  const insertAgreements = db.transaction((agreements) => {
    for (const a of agreements) {
      agreementInsert.run(...a);
    }
  });
  insertAgreements(agreements);

  // Link agreements to council members
  db.prepare("UPDATE council_members SET agreement_id = 'agr-f1' WHERE email = 'marcus@sodaworld.io'").run();
  db.prepare("UPDATE council_members SET agreement_id = 'agr-f2' WHERE email = 'sarah@sodaworld.io'").run();
  db.prepare("UPDATE council_members SET agreement_id = 'agr-f3' WHERE email = 'james@sodaworld.io'").run();
  db.prepare("UPDATE council_members SET agreement_id = 'agr-a1' WHERE email = 'lisa@sodaworld.io'").run();
  db.prepare("UPDATE council_members SET agreement_id = 'agr-a2' WHERE email = 'david@sodaworld.io'").run();
  db.prepare("UPDATE council_members SET agreement_id = 'agr-c1' WHERE email = 'emma@sodaworld.io'").run();
  db.prepare("UPDATE council_members SET agreement_id = 'agr-c2' WHERE email = 'alex@sodaworld.io'").run();

  console.log('Seeded agreements: 7 agreements linked to council members');
} else {
  console.log(`agreements already has ${agreementCount} rows`);
}

// Seed milestones
const milestoneCount = db.prepare("SELECT COUNT(*) as c FROM milestones").get().c;
if (milestoneCount === 0) {
  const msInsert = db.prepare(`
    INSERT INTO milestones (agreement_id, council_member_id, title, description, milestone_order, target_date, token_amount, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  // Get member IDs
  const marcus = db.prepare("SELECT id FROM council_members WHERE email='marcus@sodaworld.io'").get();
  const sarah = db.prepare("SELECT id FROM council_members WHERE email='sarah@sodaworld.io'").get();
  const emma = db.prepare("SELECT id FROM council_members WHERE email='emma@sodaworld.io'").get();

  if (marcus && sarah && emma) {
    const milestones = [
      // Marcus (CTO) milestones
      ['agr-f1', marcus.id, 'Backend Architecture Complete', 'Design and implement core backend services', 1, '2024-06-01', 500000, 'completed'],
      ['agr-f1', marcus.id, 'Smart Contract Deployment', 'Deploy token contracts to devnet', 2, '2024-09-01', 500000, 'completed'],
      ['agr-f1', marcus.id, 'API v2 Launch', 'Full API with governance, treasury, marketplace', 3, '2025-01-01', 750000, 'in_progress'],
      ['agr-f1', marcus.id, 'Mainnet Launch', 'Production deployment with security audit', 4, '2025-06-01', 1000000, 'pending'],

      // Sarah (CEO) milestones
      ['agr-f2', sarah.id, 'Business Plan Finalized', 'Complete tokenomics and go-to-market strategy', 1, '2024-03-01', 500000, 'completed'],
      ['agr-f2', sarah.id, 'Seed Round Complete', 'Close seed funding round', 2, '2024-08-01', 750000, 'completed'],
      ['agr-f2', sarah.id, 'Partnership Program Launch', 'Onboard 10 launch partners', 3, '2025-02-01', 1000000, 'in_progress'],

      // Emma (Smart Contract Dev) milestones
      ['agr-c1', emma.id, 'Token Contract Audit', 'Complete security audit of token contracts', 1, '2024-11-01', 250000, 'completed'],
      ['agr-c1', emma.id, 'Governance Module', 'Implement on-chain governance voting', 2, '2025-02-01', 350000, 'in_progress'],
      ['agr-c1', emma.id, 'Treasury Integration', 'Multi-sig treasury with timelock', 3, '2025-05-01', 400000, 'pending'],
    ];

    const insertMilestones = db.transaction((milestones) => {
      for (const m of milestones) {
        msInsert.run(...m);
      }
    });
    insertMilestones(milestones);
    console.log('Seeded milestones: 10 milestones across 3 members');
  }
} else {
  console.log(`milestones already has ${milestoneCount} rows`);
}

// Seed bubbles (ideas)
const bubbleCount = db.prepare("SELECT COUNT(*) as c FROM bubbles").get().c;
if (bubbleCount === 0) {
  const bInsert = db.prepare(`
    INSERT INTO bubbles (id, name, type, status, fundingProgress, sodaRaised, backers, healthScore, team, treasury, roadmap, updates, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const bubbles = [
    ['bubble-1', 'Jazz Mafia Shrine', 'Music', 'Active', 75, 18750, 42, 85,
     JSON.stringify([{name: 'DJ Frost', role: 'Lead'}, {name: 'Maya Lin', role: 'Designer'}]),
     JSON.stringify({balance: 18750, transactions: [{type: 'funding', amount: 5000, date: '2024-12-01'}]}),
     JSON.stringify([{title: 'VR Stage Design', status: 'completed'}, {title: 'First Concert', status: 'in_progress'}]),
     JSON.stringify([{title: 'VR Stage Preview Released', date: '2025-01-15', content: 'Check out the new stage design!'}])],
    ['bubble-2', 'Virtual TV Show', 'Media', 'Active', 60, 15000, 28, 72,
     JSON.stringify([{name: 'Sam Lee', role: 'Director'}, {name: 'Ana Cruz', role: 'Writer'}]),
     JSON.stringify({balance: 15000, transactions: []}),
     JSON.stringify([{title: 'Script Writing', status: 'completed'}, {title: 'Episode 1 Production', status: 'in_progress'}]),
     JSON.stringify([{title: 'Episode 1 Script Complete', date: '2025-01-10'}])],
    ['bubble-3', 'DeFi Education Hub', 'Education', 'Active', 40, 10000, 65, 90,
     JSON.stringify([{name: 'Prof. Chen', role: 'Lead Educator'}]),
     JSON.stringify({balance: 10000, transactions: []}),
     JSON.stringify([{title: 'Curriculum Design', status: 'completed'}, {title: 'Video Series', status: 'in_progress'}]),
     JSON.stringify([])],
    ['bubble-4', 'SODA Merch Store', 'Commerce', 'Draft', 15, 3750, 12, 60,
     JSON.stringify([{name: 'Alex T', role: 'Designer'}]),
     JSON.stringify({balance: 3750, transactions: []}),
     JSON.stringify([{title: 'Design Collection', status: 'in_progress'}]),
     JSON.stringify([])],
    ['bubble-5', 'Community Governance Tools', 'Tech', 'Active', 85, 42500, 95, 95,
     JSON.stringify([{name: 'Marcus C', role: 'Lead Dev'}, {name: 'Emma R', role: 'Backend'}]),
     JSON.stringify({balance: 42500, transactions: []}),
     JSON.stringify([{title: 'Voting System', status: 'completed'}, {title: 'Delegation', status: 'in_progress'}, {title: 'Analytics Dashboard', status: 'pending'}]),
     JSON.stringify([{title: 'Voting System Live!', date: '2025-01-20'}])],
    ['bubble-6', 'NFT Gallery', 'Art', 'Active', 50, 12500, 33, 78,
     JSON.stringify([{name: 'Kenji', role: 'Curator'}]),
     JSON.stringify({balance: 12500, transactions: []}),
     JSON.stringify([{title: 'Gallery Design', status: 'completed'}, {title: 'Artist Onboarding', status: 'in_progress'}]),
     JSON.stringify([])],
  ];

  const insertBubbles = db.transaction((bubbles) => {
    for (const b of bubbles) {
      bInsert.run(...b);
    }
  });
  insertBubbles(bubbles);
  console.log('Seeded bubbles: 6 idea bubbles');
} else {
  console.log(`bubbles already has ${bubbleCount} rows`);
}

// Seed treasury transactions if empty
const txCount = db.prepare("SELECT COUNT(*) as c FROM treasury_transactions").get().c;
if (txCount === 0) {
  const txInsert = db.prepare(`
    INSERT INTO treasury_transactions (id, recipient, recipientName, amount, memo, status, dateInitiated, dateExecuted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const txs = [
    ['tx-001', '0xAliceAddress', 'Alice', 50000, 'Marketing budget Q1', 'Executed', '2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z'],
    ['tx-002', '0xBobAddress', 'Bob', 25000, 'Development tools', 'Executed', '2025-01-15T00:00:00Z', '2025-01-16T00:00:00Z'],
    ['tx-003', '0xCharlieAddress', 'Charlie', 10000, 'Community event funding', 'Pending', '2025-02-01T00:00:00Z', null],
    ['tx-004', 'treasury_deposit', 'Treasury', 100000, 'Token sale proceeds', 'Executed', '2025-01-05T00:00:00Z', '2025-01-05T00:00:00Z'],
    ['tx-005', '0xAliceAddress', 'Alice', 75000, 'Infrastructure costs Q1', 'Pending', '2025-02-10T00:00:00Z', null],
  ];

  const insertTxs = db.transaction((txs) => {
    for (const t of txs) {
      txInsert.run(...t);
    }
  });
  insertTxs(txs);

  // Add approvals for the executed transactions
  db.prepare("INSERT INTO treasury_approvals (transaction_id, signer_address) VALUES ('tx-001', '0xAliceAddress')").run();
  db.prepare("INSERT INTO treasury_approvals (transaction_id, signer_address) VALUES ('tx-001', '0xBobAddress')").run();
  db.prepare("INSERT INTO treasury_approvals (transaction_id, signer_address) VALUES ('tx-002', '0xAliceAddress')").run();
  db.prepare("INSERT INTO treasury_approvals (transaction_id, signer_address) VALUES ('tx-002', '0xCharlieAddress')").run();
  db.prepare("INSERT INTO treasury_approvals (transaction_id, signer_address) VALUES ('tx-004', '0xAliceAddress')").run();
  db.prepare("INSERT INTO treasury_approvals (transaction_id, signer_address) VALUES ('tx-004', '0xBobAddress')").run();
  db.prepare("INSERT INTO treasury_approvals (transaction_id, signer_address) VALUES ('tx-004', '0xCharlieAddress')").run();

  console.log('Seeded treasury_transactions: 5 transactions with approvals');
} else {
  console.log(`treasury_transactions already has ${txCount} rows`);
}

// Seed generated_contracts
const gcCount = db.prepare("SELECT COUNT(*) as c FROM generated_contracts").get().c;
if (gcCount === 0) {
  const marcus = db.prepare("SELECT id FROM council_members WHERE email='marcus@sodaworld.io'").get();
  const sarah = db.prepare("SELECT id FROM council_members WHERE email='sarah@sodaworld.io'").get();
  if (marcus && sarah) {
    db.prepare(`INSERT INTO generated_contracts (agreement_id, council_member_id, contract_text, contract_version, legal_framework, agreement_type, status, generated_by)
      VALUES ('agr-f1', ?, 'FOUNDER AGREEMENT\n\nThis agreement is entered into between SodaWorld DAO and Marcus Chen...', 1, 'United States', 'founder', 'approved', 'gemini-pro')`).run(marcus.id);
    db.prepare(`INSERT INTO generated_contracts (agreement_id, council_member_id, contract_text, contract_version, legal_framework, agreement_type, status, generated_by)
      VALUES ('agr-f2', ?, 'FOUNDER AGREEMENT\n\nThis agreement is entered into between SodaWorld DAO and Sarah Williams...', 1, 'United States', 'founder', 'approved', 'gemini-pro')`).run(sarah.id);
    console.log('Seeded generated_contracts: 2 contracts');
  }
} else {
  console.log(`generated_contracts already has ${gcCount} rows`);
}

// ============================================
// PHASE 2: Fix route files (add GET / handlers)
// ============================================

console.log('\n=== PHASE 2: Patching route files ===\n');

// 2.1 Treasury - add GET / that returns overview
const treasuryPath = path.join(__dirname, 'backend/src/routes/treasury.ts');
let treasuryContent = fs.readFileSync(treasuryPath, 'utf8');
if (!treasuryContent.includes("router.get('/',")) {
  // Add GET / handler before the first router.get
  const insertPoint = treasuryContent.indexOf("// GET /api/treasury/vitals");
  if (insertPoint > 0) {
    const newHandler = `// GET /api/treasury
// Get treasury overview (balance, recent transactions, policy)
router.get('/', async (req, res) => {
    try {
        const policy = await db('treasury_policies').first();
        const signers = await db('treasury_signers').select();
        const balance = await calculateTreasuryBalance();
        const recentTxs = await db('treasury_transactions')
            .orderBy('dateInitiated', 'desc')
            .limit(10);
        const pendingCount = await db('treasury_transactions')
            .where('status', 'Pending')
            .count('* as count')
            .first();

        res.json({
            success: true,
            data: {
                balance,
                signers: signers.length,
                requiredSignatures: policy?.required_signatures || 2,
                recentTransactions: recentTxs,
                pendingTransactions: pendingCount?.count || 0
            }
        });
    } catch (error) {
        console.error('Error fetching treasury overview:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch treasury overview' });
    }
});

`;
    treasuryContent = treasuryContent.slice(0, insertPoint) + newHandler + treasuryContent.slice(insertPoint);
    fs.writeFileSync(treasuryPath, treasuryContent);
    console.log('Patched treasury.ts: added GET / handler');
  }
} else {
  console.log('treasury.ts already has GET / handler');
}

// 2.2 Signatures - add GET / that lists recent signatures
const signaturesPath = path.join(__dirname, 'backend/src/routes/signatures.ts');
let signaturesContent = fs.readFileSync(signaturesPath, 'utf8');
if (!signaturesContent.includes("router.get('/',")) {
  const insertPoint = signaturesContent.indexOf("/**\n * POST /api/signatures/sign");
  if (insertPoint > 0) {
    const newHandler = `/**
 * GET /api/signatures
 * List all signatures
 */
router.get('/', async (req, res) => {
  try {
    const { agreement_id } = req.query;
    let query = db('agreement_signatures').select('*');
    if (agreement_id) {
      query = query.where('agreement_id', agreement_id);
    }
    const signatures = await query.orderBy('signed_at', 'desc').limit(50);
    res.json({ success: true, data: signatures, count: signatures.length });
  } catch (error) {
    console.error('Error fetching signatures:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch signatures' });
  }
});

`;
    signaturesContent = signaturesContent.slice(0, insertPoint) + newHandler + signaturesContent.slice(insertPoint);
    fs.writeFileSync(signaturesPath, signaturesContent);
    console.log('Patched signatures.ts: added GET / handler');
  }
} else {
  console.log('signatures.ts already has GET / handler');
}

// 2.3 Contracts - add GET / that lists contracts
const contractsPath = path.join(__dirname, 'backend/src/routes/contracts.ts');
let contractsContent = fs.readFileSync(contractsPath, 'utf8');
if (!contractsContent.includes("router.get('/',")) {
  const insertPoint = contractsContent.indexOf("// GET /api/contracts/:contractId");
  if (insertPoint > 0) {
    const newHandler = `// GET /api/contracts
// List all generated contracts
router.get('/', async (req, res) => {
    try {
        const { agreement_id, status } = req.query;
        let query = db('generated_contracts').select('*');
        if (agreement_id) query = query.where('agreement_id', agreement_id);
        if (status) query = query.where('status', status);
        const contracts = await query.orderBy('generated_at', 'desc').limit(50);
        res.json({ success: true, data: contracts, count: contracts.length });
    } catch (error) {
        logger.error('Error fetching contracts:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch contracts' });
    }
});

`;
    contractsContent = contractsContent.slice(0, insertPoint) + newHandler + contractsContent.slice(insertPoint);
    fs.writeFileSync(contractsPath, contractsContent);
    console.log('Patched contracts.ts: added GET / handler');
  }
} else {
  console.log('contracts.ts already has GET / handler');
}

// 2.4 Tokens - add GET / that returns token overview
const tokensPath = path.join(__dirname, 'backend/src/routes/tokens.ts');
let tokensContent = fs.readFileSync(tokensPath, 'utf8');
if (!tokensContent.includes("router.get('/',")) {
  const insertPoint = tokensContent.indexOf("// Get user balance");
  if (insertPoint > 0) {
    const newHandler = `// Get token system overview
router.get('/', async (req, res) => {
  try {
    const totalUsers = await db('user_balances').count('* as count').first();
    const totalSupply = await db('user_balances').sum('soda_balance as total').first();
    const recentTxs = await db('token_transactions').orderBy('created_at', 'desc').limit(10);
    res.json({
      success: true,
      data: {
        totalUsers: totalUsers?.count || 0,
        totalCirculating: totalSupply?.total || 0,
        recentTransactions: recentTxs
      }
    });
  } catch (error) {
    console.error('Error fetching token overview:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch token overview' });
  }
});

`;
    tokensContent = tokensContent.slice(0, insertPoint) + newHandler + tokensContent.slice(insertPoint);
    fs.writeFileSync(tokensPath, tokensContent);
    console.log('Patched tokens.ts: added GET / handler');
  }
} else {
  console.log('tokens.ts already has GET / handler');
}

// 2.5 Marketplace - add GET / that returns marketplace overview
const marketplacePath = path.join(__dirname, 'backend/src/routes/marketplace.ts');
let marketplaceContent = fs.readFileSync(marketplacePath, 'utf8');
if (!marketplaceContent.includes("router.get('/',")) {
  const insertPoint = marketplaceContent.indexOf("// Get all marketplace items");
  if (insertPoint > 0) {
    const newHandler = `// Get marketplace overview
router.get('/', async (req, res) => {
  try {
    const items = await db('marketplace_items').where('status', 'active').orderBy('created_at', 'desc');
    const totalItems = items.length;
    const totalSold = items.reduce((sum, i) => sum + (i.sold_count || 0), 0);
    const formattedItems = items.map(item => ({
      id: item.id, name: item.name, type: item.type, price: item.price,
      imageUrl: item.image_url, description: item.description, category: item.category,
      creator: { name: item.creator_name, avatarUrl: item.creator_avatar_url },
      edition: item.edition_total ? { current: item.edition_current || item.sold_count, total: item.edition_total } : undefined,
      status: item.status, quantity: item.quantity, soldCount: item.sold_count
    }));
    res.json({ success: true, data: formattedItems, stats: { totalItems, totalSold } });
  } catch (error) {
    console.error('Error fetching marketplace:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch marketplace' });
  }
});

`;
    marketplaceContent = marketplaceContent.slice(0, insertPoint) + newHandler + marketplaceContent.slice(insertPoint);
    fs.writeFileSync(marketplacePath, marketplaceContent);
    console.log('Patched marketplace.ts: added GET / handler');
  }
} else {
  console.log('marketplace.ts already has GET / handler');
}

// ============================================
// Also need to update database.ts to include new tables
// so they get created on fresh installs
// ============================================

console.log('\n=== Patching database.ts for new table creation ===\n');

const databasePath = path.join(__dirname, 'backend/src/database.ts');
let databaseContent = fs.readFileSync(databasePath, 'utf8');

// Add council_members, milestones, generated_contracts, agreement_workflow_log, token_release_schedule
// Insert before the closing of initializeDatabase function
const closingMarker = "  // Admin Logs Table";
if (!databaseContent.includes("council_members") && databaseContent.includes(closingMarker)) {
  const newTables = `  // Council Members Table
  const hasCouncilMembersTable = await db.schema.hasTable('council_members');
  if (!hasCouncilMembersTable) {
    await db.schema.createTable('council_members', (table) => {
      table.increments('id').primary();
      table.integer('dao_id');
      table.string('agreement_id');
      table.string('name').notNullable();
      table.string('surname').notNullable();
      table.string('email').notNullable();
      table.string('phone');
      table.string('wallet_address').notNullable();
      table.string('photo_url');
      table.string('role_type').notNullable();
      table.string('role_category');
      table.text('custom_role_description');
      table.float('token_allocation_total').defaultTo(0);
      table.integer('firestarter_period_months');
      table.integer('term_months');
      table.string('status').defaultTo('draft');
      table.string('sodaworld_user_id');
      table.string('created_by').defaultTo('system');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.timestamp('activated_at');
      table.timestamp('completed_at');
    });
    console.log('Table "council_members" created.');
  }

  // Milestones Table
  const hasMilestonesTable = await db.schema.hasTable('milestones');
  if (!hasMilestonesTable) {
    await db.schema.createTable('milestones', (table) => {
      table.increments('id').primary();
      table.string('agreement_id');
      table.integer('council_member_id');
      table.string('title').notNullable();
      table.text('description');
      table.integer('milestone_order').defaultTo(1);
      table.string('target_date');
      table.float('token_amount');
      table.string('status').defaultTo('pending');
      table.string('completed_date');
      table.string('verified_by');
      table.text('completion_notes');
      table.timestamp('completed_at');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Table "milestones" created.');
  }

  // Generated Contracts Table
  const hasGeneratedContractsTable = await db.schema.hasTable('generated_contracts');
  if (!hasGeneratedContractsTable) {
    await db.schema.createTable('generated_contracts', (table) => {
      table.increments('id').primary();
      table.string('agreement_id').notNullable();
      table.integer('council_member_id');
      table.text('contract_text');
      table.integer('contract_version').defaultTo(1);
      table.text('generation_params');
      table.string('legal_framework');
      table.string('agreement_type');
      table.string('status').defaultTo('generated');
      table.text('error_message');
      table.timestamp('generated_at').defaultTo(db.fn.now());
      table.string('generated_by');
      table.string('approved_by');
      table.timestamp('approved_at');
    });
    console.log('Table "generated_contracts" created.');
  }

  // Agreement Workflow Log Table
  const hasAgreementWorkflowLogTable = await db.schema.hasTable('agreement_workflow_log');
  if (!hasAgreementWorkflowLogTable) {
    await db.schema.createTable('agreement_workflow_log', (table) => {
      table.increments('id').primary();
      table.string('agreement_id').notNullable();
      table.integer('council_member_id');
      table.string('from_status');
      table.string('to_status').notNullable();
      table.text('transition_reason');
      table.string('changed_by');
      table.string('changed_by_role');
      table.text('additional_data');
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Table "agreement_workflow_log" created.');
  }

  // Token Release Schedule Table
  const hasTokenReleaseScheduleTable = await db.schema.hasTable('token_release_schedule');
  if (!hasTokenReleaseScheduleTable) {
    await db.schema.createTable('token_release_schedule', (table) => {
      table.increments('id').primary();
      table.integer('council_member_id').notNullable();
      table.string('agreement_id');
      table.integer('milestone_id');
      table.string('release_type').defaultTo('milestone_based');
      table.float('token_amount').notNullable();
      table.string('release_date');
      table.string('status').defaultTo('locked');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Table "token_release_schedule" created.');
  }

  // Signature Links Table
  const hasSignatureLinksTable = await db.schema.hasTable('signature_links');
  if (!hasSignatureLinksTable) {
    await db.schema.createTable('signature_links', (table) => {
      table.string('id').primary();
      table.string('agreement_id').notNullable();
      table.integer('council_member_id');
      table.string('link_type').defaultTo('member_signature');
      table.timestamp('expires_at');
      table.timestamp('used_at');
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Table "signature_links" created.');
  }

`;
  databaseContent = databaseContent.replace(closingMarker, newTables + '  ' + closingMarker);
  fs.writeFileSync(databasePath, databaseContent);
  console.log('Patched database.ts: added 6 new table definitions');
} else {
  console.log('database.ts already has council_members table or marker not found');
}

// ============================================
// Final summary
// ============================================
console.log('\n=== SUMMARY ===\n');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('All tables:', tables.map(t => t.name).join(', '));

for (const t of tables) {
  if (t.name === 'sqlite_sequence') continue;
  try {
    const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
    console.log(`  ${t.name}: ${count.c} rows`);
  } catch (e) {
    console.log(`  ${t.name}: ERROR reading`);
  }
}

db.close();
console.log('\nDone! Restart the DAO server for changes to take effect.');
