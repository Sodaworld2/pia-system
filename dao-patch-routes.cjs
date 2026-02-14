/**
 * Patch route files to add GET / handlers + update database.ts
 * Run from: C:\Users\User\Documents\GitHub\DAOV1
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\Users\\User\\Documents\\GitHub\\DAOV1';

function patchFile(relPath, checkStr, insertBefore, newCode) {
  const fullPath = path.join(ROOT, relPath);
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes(checkStr)) {
      console.log('SKIP: ' + relPath + ' already patched');
      return;
    }
    const idx = content.indexOf(insertBefore);
    if (idx < 0) {
      console.log('WARN: marker not found in ' + relPath + ' - trying alternate');
      return false;
    }
    content = content.slice(0, idx) + newCode + content.slice(idx);
    fs.writeFileSync(fullPath, content);
    console.log('OK: Patched ' + relPath);
    return true;
  } catch (e) {
    console.log('ERROR: ' + relPath + ' - ' + e.message);
    return false;
  }
}

// Treasury: add GET /
patchFile('backend/src/routes/treasury.ts',
  "router.get('/', async",
  "// GET /api/treasury/vitals",
  `// GET /api/treasury
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
patchFile('backend/src/routes/signatures.ts',
  "router.get('/', async",
  "/**\n * POST /api/signatures/sign",
  `/**
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

`);

// Contracts: add GET /
patchFile('backend/src/routes/contracts.ts',
  "router.get('/', async",
  "// GET /api/contracts/:contractId",
  `// GET /api/contracts
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

`);

// Tokens: add GET /
patchFile('backend/src/routes/tokens.ts',
  "router.get('/', async",
  "// Get user balance",
  `// Get token system overview
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

`);

// Marketplace: add GET /
patchFile('backend/src/routes/marketplace.ts',
  "router.get('/', async",
  "// Get all marketplace items",
  `// Get marketplace overview
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

// Patch database.ts to include new table definitions
const dbPath = path.join(ROOT, 'backend/src/database.ts');
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
    console.log('OK: Patched database.ts');
  } else {
    console.log('WARN: marker not found in database.ts');
  }
} else {
  console.log('SKIP: database.ts already has council_members');
}

console.log('\nALL DONE - restart server now');
