/**
 * DAO Fix Phase 1+2+3: Create missing tables, add missing GET / handlers, seed data
 * Uses knex (already installed) instead of better-sqlite3
 * Run from: C:\Users\User\Documents\GitHub\DAOV1
 */
const knex = require('knex');
const fs = require('fs');
const path = require('path');

const db = knex({
  client: 'sqlite3',
  connection: { filename: path.join(__dirname, 'mentor_chats.db') },
  useNullAsDefault: true,
});

async function main() {
  console.log('=== DAO FIX SCRIPT v2 ===\n');

  // ============================================
  // PHASE 1: Create missing tables
  // ============================================
  console.log('--- PHASE 1: Creating missing tables ---\n');

  // 1. council_members
  if (!(await db.schema.hasTable('council_members'))) {
    await db.schema.createTable('council_members', (t) => {
      t.increments('id').primary();
      t.integer('dao_id');
      t.string('agreement_id');
      t.string('name').notNullable();
      t.string('surname').notNullable();
      t.string('email').notNullable();
      t.string('phone');
      t.string('wallet_address').notNullable();
      t.string('photo_url');
      t.string('role_type').notNullable();
      t.string('role_category');
      t.text('custom_role_description');
      t.float('token_allocation_total').defaultTo(0);
      t.integer('firestarter_period_months');
      t.integer('term_months');
      t.string('status').defaultTo('draft');
      t.string('sodaworld_user_id');
      t.string('created_by').defaultTo('system');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
      t.timestamp('activated_at');
      t.timestamp('completed_at');
    });
    console.log('OK: Created council_members');
  } else { console.log('SKIP: council_members exists'); }

  // 2. milestones
  if (!(await db.schema.hasTable('milestones'))) {
    await db.schema.createTable('milestones', (t) => {
      t.increments('id').primary();
      t.string('agreement_id');
      t.integer('council_member_id');
      t.string('title').notNullable();
      t.text('description');
      t.integer('milestone_order').defaultTo(1);
      t.string('target_date');
      t.float('token_amount');
      t.string('status').defaultTo('pending');
      t.string('completed_date');
      t.string('verified_by');
      t.text('completion_notes');
      t.timestamp('completed_at');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('OK: Created milestones');
  } else { console.log('SKIP: milestones exists'); }

  // 3. generated_contracts
  if (!(await db.schema.hasTable('generated_contracts'))) {
    await db.schema.createTable('generated_contracts', (t) => {
      t.increments('id').primary();
      t.string('agreement_id').notNullable();
      t.integer('council_member_id');
      t.text('contract_text');
      t.integer('contract_version').defaultTo(1);
      t.text('generation_params');
      t.string('legal_framework');
      t.string('agreement_type');
      t.string('status').defaultTo('generated');
      t.text('error_message');
      t.timestamp('generated_at').defaultTo(db.fn.now());
      t.string('generated_by');
      t.string('approved_by');
      t.timestamp('approved_at');
    });
    console.log('OK: Created generated_contracts');
  } else { console.log('SKIP: generated_contracts exists'); }

  // 4. agreement_workflow_log
  if (!(await db.schema.hasTable('agreement_workflow_log'))) {
    await db.schema.createTable('agreement_workflow_log', (t) => {
      t.increments('id').primary();
      t.string('agreement_id').notNullable();
      t.integer('council_member_id');
      t.string('from_status');
      t.string('to_status').notNullable();
      t.text('transition_reason');
      t.string('changed_by');
      t.string('changed_by_role');
      t.text('additional_data');
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('OK: Created agreement_workflow_log');
  } else { console.log('SKIP: agreement_workflow_log exists'); }

  // 5. token_release_schedule
  if (!(await db.schema.hasTable('token_release_schedule'))) {
    await db.schema.createTable('token_release_schedule', (t) => {
      t.increments('id').primary();
      t.integer('council_member_id').notNullable();
      t.string('agreement_id');
      t.integer('milestone_id');
      t.string('release_type').defaultTo('milestone_based');
      t.float('token_amount').notNullable();
      t.string('release_date');
      t.string('status').defaultTo('locked');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('OK: Created token_release_schedule');
  } else { console.log('SKIP: token_release_schedule exists'); }

  // 6. signature_links
  if (!(await db.schema.hasTable('signature_links'))) {
    await db.schema.createTable('signature_links', (t) => {
      t.string('id').primary();
      t.string('agreement_id').notNullable();
      t.integer('council_member_id');
      t.string('link_type').defaultTo('member_signature');
      t.timestamp('expires_at');
      t.timestamp('used_at');
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('OK: Created signature_links');
  } else { console.log('SKIP: signature_links exists'); }

  // ============================================
  // PHASE 3: Seed data
  // ============================================
  console.log('\n--- PHASE 3: Seeding data ---\n');

  // Seed council_members
  const memberCount = (await db('council_members').count('* as c'))[0].c;
  if (memberCount === 0) {
    await db('council_members').insert([
      { dao_id: 1, name: 'Marcus', surname: 'Chen', email: 'marcus@sodaworld.io', wallet_address: '7xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwi', role_type: 'founder', role_category: 'Technical', custom_role_description: 'Lead Architect & CTO', token_allocation_total: 4000000, firestarter_period_months: 12, status: 'active' },
      { dao_id: 1, name: 'Sarah', surname: 'Williams', email: 'sarah@sodaworld.io', wallet_address: '9xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwj', role_type: 'founder', role_category: 'Business', custom_role_description: 'CEO & Strategy Lead', token_allocation_total: 4000000, firestarter_period_months: 12, status: 'active' },
      { dao_id: 1, name: 'James', surname: 'Wright', email: 'james@sodaworld.io', wallet_address: '5xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwk', role_type: 'founder', role_category: 'Creative', custom_role_description: 'Creative Director', token_allocation_total: 3000000, firestarter_period_months: 12, status: 'active' },
      { dao_id: 1, name: 'Lisa', surname: 'Park', email: 'lisa@sodaworld.io', wallet_address: '3xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwl', role_type: 'advisor', role_category: 'Legal', custom_role_description: 'Legal Counsel & Compliance', token_allocation_total: 2000000, term_months: 24, status: 'active' },
      { dao_id: 1, name: 'David', surname: 'Kumar', email: 'david@sodaworld.io', wallet_address: '2xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwm', role_type: 'advisor', role_category: 'Technical', custom_role_description: 'Blockchain Advisor', token_allocation_total: 1500000, term_months: 18, status: 'active' },
      { dao_id: 1, name: 'Emma', surname: 'Rodriguez', email: 'emma@sodaworld.io', wallet_address: '8xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwn', role_type: 'contributor', role_category: 'Development', custom_role_description: 'Senior Smart Contract Developer', token_allocation_total: 1000000, term_months: 12, status: 'active' },
      { dao_id: 1, name: 'Alex', surname: 'Thompson', email: 'alex@sodaworld.io', wallet_address: '4xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwo', role_type: 'contributor', role_category: 'Community', custom_role_description: 'Community Manager', token_allocation_total: 500000, term_months: 12, status: 'active' },
      { dao_id: 1, name: 'Mia', surname: 'Johnson', email: 'mia@sodaworld.io', wallet_address: '6xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwp', role_type: 'firstborn', role_category: 'Early Adopter', custom_role_description: 'Genesis Community Member', token_allocation_total: 250000, term_months: 6, status: 'active' },
      { dao_id: 1, name: 'Noah', surname: 'Davis', email: 'noah@sodaworld.io', wallet_address: '1xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwq', role_type: 'firstborn', role_category: 'Early Adopter', custom_role_description: 'Genesis Community Member', token_allocation_total: 250000, term_months: 6, status: 'active' },
    ]);
    console.log('OK: Seeded 9 council members');

    // Seed agreements and link them
    await db('agreements').insert([
      { id: 'agr-f1', title: 'Founder Agreement - Marcus Chen', type: 'Founder Agreement', party: JSON.stringify({name:'Marcus',surname:'Chen',email:'marcus@sodaworld.io'}), termOfEngagement: 48, startDate: '2024-01-01', status: 'Active', details: JSON.stringify({role_category:'Technical',token_allocation:4000000}) },
      { id: 'agr-f2', title: 'Founder Agreement - Sarah Williams', type: 'Founder Agreement', party: JSON.stringify({name:'Sarah',surname:'Williams',email:'sarah@sodaworld.io'}), termOfEngagement: 48, startDate: '2024-01-01', status: 'Active', details: JSON.stringify({role_category:'Business',token_allocation:4000000}) },
      { id: 'agr-f3', title: 'Founder Agreement - James Wright', type: 'Founder Agreement', party: JSON.stringify({name:'James',surname:'Wright',email:'james@sodaworld.io'}), termOfEngagement: 48, startDate: '2024-01-01', status: 'Active', details: JSON.stringify({role_category:'Creative',token_allocation:3000000}) },
      { id: 'agr-a1', title: 'Advisor Agreement - Lisa Park', type: 'Advisor Agreement', party: JSON.stringify({name:'Lisa',surname:'Park',email:'lisa@sodaworld.io'}), termOfEngagement: 24, startDate: '2024-06-01', status: 'Active', details: JSON.stringify({role_category:'Legal',token_allocation:2000000}) },
      { id: 'agr-a2', title: 'Advisor Agreement - David Kumar', type: 'Advisor Agreement', party: JSON.stringify({name:'David',surname:'Kumar',email:'david@sodaworld.io'}), termOfEngagement: 18, startDate: '2024-06-01', status: 'Active', details: JSON.stringify({role_category:'Technical',token_allocation:1500000}) },
      { id: 'agr-c1', title: 'Contributor Agreement - Emma Rodriguez', type: 'Contributor Agreement', party: JSON.stringify({name:'Emma',surname:'Rodriguez',email:'emma@sodaworld.io'}), termOfEngagement: 12, startDate: '2024-09-01', status: 'Active', details: JSON.stringify({role_category:'Development',token_allocation:1000000}) },
      { id: 'agr-c2', title: 'Contributor Agreement - Alex Thompson', type: 'Contributor Agreement', party: JSON.stringify({name:'Alex',surname:'Thompson',email:'alex@sodaworld.io'}), termOfEngagement: 12, startDate: '2024-09-01', status: 'Active', details: JSON.stringify({role_category:'Community',token_allocation:500000}) },
    ]);
    console.log('OK: Seeded 7 agreements');

    // Link agreements
    await db('council_members').where('email', 'marcus@sodaworld.io').update({agreement_id: 'agr-f1'});
    await db('council_members').where('email', 'sarah@sodaworld.io').update({agreement_id: 'agr-f2'});
    await db('council_members').where('email', 'james@sodaworld.io').update({agreement_id: 'agr-f3'});
    await db('council_members').where('email', 'lisa@sodaworld.io').update({agreement_id: 'agr-a1'});
    await db('council_members').where('email', 'david@sodaworld.io').update({agreement_id: 'agr-a2'});
    await db('council_members').where('email', 'emma@sodaworld.io').update({agreement_id: 'agr-c1'});
    await db('council_members').where('email', 'alex@sodaworld.io').update({agreement_id: 'agr-c2'});
    console.log('OK: Linked agreements to members');
  } else { console.log('SKIP: council_members has ' + memberCount + ' rows'); }

  // Seed milestones
  const msCount = (await db('milestones').count('* as c'))[0].c;
  if (msCount === 0) {
    const marcus = await db('council_members').where('email', 'marcus@sodaworld.io').first();
    const sarah = await db('council_members').where('email', 'sarah@sodaworld.io').first();
    const emma = await db('council_members').where('email', 'emma@sodaworld.io').first();
    if (marcus && sarah && emma) {
      await db('milestones').insert([
        { agreement_id: 'agr-f1', council_member_id: marcus.id, title: 'Backend Architecture Complete', description: 'Core backend services', milestone_order: 1, target_date: '2024-06-01', token_amount: 500000, status: 'completed' },
        { agreement_id: 'agr-f1', council_member_id: marcus.id, title: 'Smart Contract Deployment', description: 'Token contracts on devnet', milestone_order: 2, target_date: '2024-09-01', token_amount: 500000, status: 'completed' },
        { agreement_id: 'agr-f1', council_member_id: marcus.id, title: 'API v2 Launch', description: 'Full API with governance, treasury, marketplace', milestone_order: 3, target_date: '2025-01-01', token_amount: 750000, status: 'in_progress' },
        { agreement_id: 'agr-f1', council_member_id: marcus.id, title: 'Mainnet Launch', description: 'Production deployment with security audit', milestone_order: 4, target_date: '2025-06-01', token_amount: 1000000, status: 'pending' },
        { agreement_id: 'agr-f2', council_member_id: sarah.id, title: 'Business Plan Finalized', description: 'Tokenomics and go-to-market', milestone_order: 1, target_date: '2024-03-01', token_amount: 500000, status: 'completed' },
        { agreement_id: 'agr-f2', council_member_id: sarah.id, title: 'Seed Round Complete', description: 'Close seed funding', milestone_order: 2, target_date: '2024-08-01', token_amount: 750000, status: 'completed' },
        { agreement_id: 'agr-f2', council_member_id: sarah.id, title: 'Partnership Program Launch', description: 'Onboard 10 partners', milestone_order: 3, target_date: '2025-02-01', token_amount: 1000000, status: 'in_progress' },
        { agreement_id: 'agr-c1', council_member_id: emma.id, title: 'Token Contract Audit', description: 'Security audit', milestone_order: 1, target_date: '2024-11-01', token_amount: 250000, status: 'completed' },
        { agreement_id: 'agr-c1', council_member_id: emma.id, title: 'Governance Module', description: 'On-chain governance', milestone_order: 2, target_date: '2025-02-01', token_amount: 350000, status: 'in_progress' },
        { agreement_id: 'agr-c1', council_member_id: emma.id, title: 'Treasury Integration', description: 'Multi-sig treasury', milestone_order: 3, target_date: '2025-05-01', token_amount: 400000, status: 'pending' },
      ]);
      console.log('OK: Seeded 10 milestones');
    }
  } else { console.log('SKIP: milestones has ' + msCount + ' rows'); }

  // Seed bubbles
  const bCount = (await db('bubbles').count('* as c'))[0].c;
  if (bCount === 0) {
    await db('bubbles').insert([
      { id: 'bubble-1', name: 'Jazz Mafia Shrine', type: 'Music', status: 'Active', fundingProgress: 75, sodaRaised: 18750, backers: 42, healthScore: 85, team: JSON.stringify([{name:'DJ Frost',role:'Lead'}]), treasury: JSON.stringify({balance:18750}), roadmap: JSON.stringify([{title:'VR Stage',status:'completed'}]), updates: JSON.stringify([{title:'VR Preview',date:'2025-01-15'}]) },
      { id: 'bubble-2', name: 'Virtual TV Show', type: 'Media', status: 'Active', fundingProgress: 60, sodaRaised: 15000, backers: 28, healthScore: 72, team: JSON.stringify([{name:'Sam Lee',role:'Director'}]), treasury: JSON.stringify({balance:15000}), roadmap: JSON.stringify([]), updates: JSON.stringify([]) },
      { id: 'bubble-3', name: 'DeFi Education Hub', type: 'Education', status: 'Active', fundingProgress: 40, sodaRaised: 10000, backers: 65, healthScore: 90, team: JSON.stringify([{name:'Prof. Chen',role:'Educator'}]), treasury: JSON.stringify({balance:10000}), roadmap: JSON.stringify([]), updates: JSON.stringify([]) },
      { id: 'bubble-4', name: 'SODA Merch Store', type: 'Commerce', status: 'Draft', fundingProgress: 15, sodaRaised: 3750, backers: 12, healthScore: 60, team: JSON.stringify([{name:'Alex T',role:'Designer'}]), treasury: JSON.stringify({balance:3750}), roadmap: JSON.stringify([]), updates: JSON.stringify([]) },
      { id: 'bubble-5', name: 'Community Governance Tools', type: 'Tech', status: 'Active', fundingProgress: 85, sodaRaised: 42500, backers: 95, healthScore: 95, team: JSON.stringify([{name:'Marcus C',role:'Lead Dev'}]), treasury: JSON.stringify({balance:42500}), roadmap: JSON.stringify([]), updates: JSON.stringify([]) },
      { id: 'bubble-6', name: 'NFT Gallery', type: 'Art', status: 'Active', fundingProgress: 50, sodaRaised: 12500, backers: 33, healthScore: 78, team: JSON.stringify([{name:'Kenji',role:'Curator'}]), treasury: JSON.stringify({balance:12500}), roadmap: JSON.stringify([]), updates: JSON.stringify([]) },
    ]);
    console.log('OK: Seeded 6 bubbles');
  } else { console.log('SKIP: bubbles has ' + bCount + ' rows'); }

  // Seed generated_contracts
  const gcCount = (await db('generated_contracts').count('* as c'))[0].c;
  if (gcCount === 0) {
    const marcus = await db('council_members').where('email', 'marcus@sodaworld.io').first();
    const sarah = await db('council_members').where('email', 'sarah@sodaworld.io').first();
    if (marcus && sarah) {
      await db('generated_contracts').insert([
        { agreement_id: 'agr-f1', council_member_id: marcus.id, contract_text: 'FOUNDER AGREEMENT\n\nThis agreement is between SodaWorld DAO and Marcus Chen, CTO...', contract_version: 1, legal_framework: 'United States', agreement_type: 'founder', status: 'approved', generated_by: 'gemini-pro' },
        { agreement_id: 'agr-f2', council_member_id: sarah.id, contract_text: 'FOUNDER AGREEMENT\n\nThis agreement is between SodaWorld DAO and Sarah Williams, CEO...', contract_version: 1, legal_framework: 'United States', agreement_type: 'founder', status: 'approved', generated_by: 'gemini-pro' },
      ]);
      console.log('OK: Seeded 2 generated contracts');
    }
  } else { console.log('SKIP: generated_contracts has ' + gcCount + ' rows'); }

  // Seed treasury transactions if empty
  const txCount = (await db('treasury_transactions').count('* as c'))[0].c;
  if (txCount === 0) {
    await db('treasury_transactions').insert([
      { id: 'tx-001', recipient: '0xAliceAddress', recipientName: 'Alice', amount: 50000, memo: 'Marketing budget Q1', status: 'Executed', dateInitiated: '2025-01-01T00:00:00Z', dateExecuted: '2025-01-02T00:00:00Z' },
      { id: 'tx-002', recipient: '0xBobAddress', recipientName: 'Bob', amount: 25000, memo: 'Development tools', status: 'Executed', dateInitiated: '2025-01-15T00:00:00Z', dateExecuted: '2025-01-16T00:00:00Z' },
      { id: 'tx-003', recipient: '0xCharlieAddress', recipientName: 'Charlie', amount: 10000, memo: 'Community event funding', status: 'Pending', dateInitiated: '2025-02-01T00:00:00Z' },
      { id: 'tx-004', recipient: 'treasury_deposit', recipientName: 'Treasury', amount: 100000, memo: 'Token sale proceeds', status: 'Executed', dateInitiated: '2025-01-05T00:00:00Z', dateExecuted: '2025-01-05T00:00:00Z' },
      { id: 'tx-005', recipient: '0xAliceAddress', recipientName: 'Alice', amount: 75000, memo: 'Infrastructure costs Q1', status: 'Pending', dateInitiated: '2025-02-10T00:00:00Z' },
    ]);
    await db('treasury_approvals').insert([
      { transaction_id: 'tx-001', signer_address: '0xAliceAddress' },
      { transaction_id: 'tx-001', signer_address: '0xBobAddress' },
      { transaction_id: 'tx-002', signer_address: '0xAliceAddress' },
      { transaction_id: 'tx-002', signer_address: '0xCharlieAddress' },
      { transaction_id: 'tx-004', signer_address: '0xAliceAddress' },
      { transaction_id: 'tx-004', signer_address: '0xBobAddress' },
    ]);
    console.log('OK: Seeded 5 treasury transactions with approvals');
  } else { console.log('SKIP: treasury_transactions has ' + txCount + ' rows'); }

  // ============================================
  // PHASE 2: Patch route files
  // ============================================
  console.log('\n--- PHASE 2: Patching route files ---\n');

  // Treasury: add GET /
  patchFile('backend/src/routes/treasury.ts', "router.get('/',", '// GET /api/treasury/vitals', `// GET /api/treasury
// Treasury overview
router.get('/', async (req, res) => {
    try {
        const policy = await db('treasury_policies').first();
        const signers = await db('treasury_signers').select();
        const balance = await calculateTreasuryBalance();
        const recentTxs = await db('treasury_transactions').orderBy('dateInitiated', 'desc').limit(10);
        const pendingCount = await db('treasury_transactions').where('status', 'Pending').count('* as count').first();
        res.json({ success: true, data: { balance, signers: signers.length, requiredSignatures: policy?.required_signatures || 2, recentTransactions: recentTxs, pendingTransactions: pendingCount?.count || 0 } });
    } catch (error) {
        console.error('Error fetching treasury overview:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch treasury overview' });
    }
});

`);

  // Signatures: add GET /
  patchFile('backend/src/routes/signatures.ts', "router.get('/',", '/**\n * POST /api/signatures/sign', `/**
 * GET /api/signatures
 * List all signatures
 */
router.get('/', async (req, res) => {
  try {
    const { agreement_id } = req.query;
    let query = db('agreement_signatures').select('*');
    if (agreement_id) query = query.where('agreement_id', agreement_id);
    const signatures = await query.orderBy('signed_at', 'desc').limit(50);
    res.json({ success: true, data: signatures, count: signatures.length });
  } catch (error) {
    console.error('Error fetching signatures:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch signatures' });
  }
});

`);

  // Contracts: add GET /
  patchFile('backend/src/routes/contracts.ts', "router.get('/',", '// GET /api/contracts/:contractId', `// GET /api/contracts
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
        console.error('Error fetching contracts:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch contracts' });
    }
});

`);

  // Tokens: add GET /
  patchFile('backend/src/routes/tokens.ts', "router.get('/',", '// Get user balance', `// Get token system overview
router.get('/', async (req, res) => {
  try {
    const totalUsers = await db('user_balances').count('* as count').first();
    const totalSupply = await db('user_balances').sum('soda_balance as total').first();
    const recentTxs = await db('token_transactions').orderBy('created_at', 'desc').limit(10);
    res.json({ success: true, data: { totalUsers: totalUsers?.count || 0, totalCirculating: totalSupply?.total || 0, recentTransactions: recentTxs } });
  } catch (error) {
    console.error('Error fetching token overview:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch token overview' });
  }
});

`);

  // Marketplace: add GET /
  patchFile('backend/src/routes/marketplace.ts', "router.get('/',", '// Get all marketplace items', `// Get marketplace overview
router.get('/', async (req, res) => {
  try {
    const items = await db('marketplace_items').where('status', 'active').orderBy('created_at', 'desc');
    const formattedItems = items.map(item => ({
      id: item.id, name: item.name, type: item.type, price: item.price,
      imageUrl: item.image_url, description: item.description, category: item.category,
      creator: { name: item.creator_name, avatarUrl: item.creator_avatar_url },
      edition: item.edition_total ? { current: item.edition_current || item.sold_count, total: item.edition_total } : undefined,
      status: item.status, quantity: item.quantity, soldCount: item.sold_count
    }));
    res.json({ success: true, data: formattedItems, stats: { totalItems: items.length, totalSold: items.reduce((s,i) => s + (i.sold_count||0), 0) } });
  } catch (error) {
    console.error('Error fetching marketplace:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch marketplace' });
  }
});

`);

  // ============================================
  // Also patch database.ts
  // ============================================
  console.log('\n--- Patching database.ts ---\n');
  const dbPath = path.join(__dirname, 'backend/src/database.ts');
  let dbContent = fs.readFileSync(dbPath, 'utf8');
  if (!dbContent.includes('council_members')) {
    const marker = '  // Admin Logs Table';
    if (dbContent.includes(marker)) {
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
  const hasWorkflowLogTable = await db.schema.hasTable('agreement_workflow_log');
  if (!hasWorkflowLogTable) {
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
  const hasTokenReleaseTable = await db.schema.hasTable('token_release_schedule');
  if (!hasTokenReleaseTable) {
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
      dbContent = dbContent.replace(marker, newTables + '  ' + marker);
      fs.writeFileSync(dbPath, dbContent);
      console.log('OK: Patched database.ts with 6 new table definitions');
    } else {
      console.log('WARN: Could not find marker in database.ts');
    }
  } else {
    console.log('SKIP: database.ts already has council_members');
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n=== FINAL TABLE COUNTS ===\n');
  const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name");
  for (const t of tables) {
    try {
      const count = await db(t.name).count('* as c');
      console.log(`  ${t.name}: ${count[0].c} rows`);
    } catch (e) {
      console.log(`  ${t.name}: ERROR`);
    }
  }

  await db.destroy();
  console.log('\nDONE! Restart DAO server for route changes to take effect.');
}

function patchFile(relPath, checkStr, insertBefore, newCode) {
  const fullPath = path.join(__dirname, relPath);
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes(checkStr)) {
      console.log('SKIP: ' + relPath + ' already has GET / handler');
      return;
    }
    const idx = content.indexOf(insertBefore);
    if (idx < 0) {
      console.log('WARN: Could not find insertion point in ' + relPath);
      return;
    }
    content = content.slice(0, idx) + newCode + content.slice(idx);
    fs.writeFileSync(fullPath, content);
    console.log('OK: Patched ' + relPath);
  } catch (e) {
    console.log('ERROR patching ' + relPath + ': ' + e.message);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
