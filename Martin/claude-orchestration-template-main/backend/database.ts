import knex from 'knex';

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: './mentor_chats.db',
  },
  useNullAsDefault: true,
});

export async function initializeDatabase() {
  const hasMessagesTable = await db.schema.hasTable('messages');
  if (!hasMessagesTable) {
    await db.schema.createTable('messages', (table) => {
      table.increments('id').primary();
      table.string('sessionId').notNullable();
      table.string('sender').notNullable();
      table.text('text').notNullable();
      table.timestamp('timestamp').defaultTo(db.fn.now());
    });
    console.log('Database initialized and "messages" table created.');
  }

  const hasDaosTable = await db.schema.hasTable('daos');
  if (!hasDaosTable) {
    await db.schema.createTable('daos', (table) => {
      table.increments('id').primary();
      // daoDetails
      table.string('daoName').notNullable();
      table.text('description').notNullable();
      table.text('logo'); // Storing logo as base64 string
      // totalSupply
      table.bigInteger('totalSupply').notNullable().defaultTo(10000000000);
      // growthDistribution
      table.integer('founders_growth').notNullable().defaultTo(0);
      table.integer('operational').notNullable().defaultTo(0);
      table.integer('scale_community').notNullable().defaultTo(0);
      // tokenomics (Council Distribution)
      table.integer('founders').notNullable();
      table.integer('advisors').notNullable();
      table.integer('foundation').notNullable();
      table.integer('firstBorns').notNullable();
      // legal
      table.string('country').notNullable();
      table.text('generatedContract'); // Optional now

      table.timestamp('createdAt').defaultTo(db.fn.now());
    });
    console.log('Database initialized and "daos" table created.');
  } else {
    // Add new columns if they don't exist (for existing databases)
    const hasDescription = await db.schema.hasColumn('daos', 'description');
    if (!hasDescription) {
      await db.schema.alterTable('daos', (table) => {
        table.text('description');
        table.bigInteger('totalSupply').defaultTo(10000000000);
        table.integer('founders_growth').defaultTo(0);
        table.integer('operational').defaultTo(0);
        table.integer('scale_community').defaultTo(0);
      });
      console.log('Added new columns to existing "daos" table.');
    }
  }

  const hasUserProfilesTable = await db.schema.hasTable('user_profiles');
  if (!hasUserProfilesTable) {
    await db.schema.createTable('user_profiles', (table) => {
      table.increments('id').primary();
      table.string('sessionId').notNullable().unique();
      table.string('learning_style');
      table.timestamp('createdAt').defaultTo(db.fn.now());
    });
    console.log('Database initialized and "user_profiles" table created.');
  }

  const hasUserDaosTable = await db.schema.hasTable('user_daos');
  if (!hasUserDaosTable) {
    await db.schema.createTable('user_daos', (table) => {
      table.integer('user_id').unsigned().notNullable().references('id').inTable('user_profiles');
      table.integer('dao_id').unsigned().notNullable().references('id').inTable('daos');
      table.primary(['user_id', 'dao_id']);
    });
    console.log('Database initialized and "user_daos" table created.');
  }

  // Treasury Service Tables
  // NOTE: The spec calls for Postgres, but the current system uses SQLite.
  // Sticking with SQLite for now to maintain consistency.
  // A migration to Postgres should be a separate, dedicated task.

  const hasTreasurySignersTable = await db.schema.hasTable('treasury_signers');
  if (!hasTreasurySignersTable) {
    await db.schema.createTable('treasury_signers', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('address').notNullable().unique();
      table.string('avatarUrl');
      table.boolean('isCurrentUser').defaultTo(false);
    });
    console.log('Table "treasury_signers" created.');

    // Seed signers if the table is empty
    const signers = await db('treasury_signers').select();
    if (signers.length === 0) {
        await db('treasury_signers').insert([
            { name: 'Alice', address: '0xAliceAddress', avatarUrl: 'https://i.pravatar.cc/150?u=alice', isCurrentUser: true },
            { name: 'Bob', address: '0xBobAddress', avatarUrl: 'https://i.pravatar.cc/150?u=bob', isCurrentUser: false },
            { name: 'Charlie', address: '0xCharlieAddress', avatarUrl: 'https://i.pravatar.cc/150?u=charlie', isCurrentUser: false },
        ]);
        console.log('Treasury signers seeded.');
    }
  }

  const hasTreasuryPoliciesTable = await db.schema.hasTable('treasury_policies');
  if (!hasTreasuryPoliciesTable) {
    await db.schema.createTable('treasury_policies', (table) => {
      table.increments('id').primary();
      table.integer('required_signatures').notNullable();
    });
    console.log('Table "treasury_policies" created.');

    // Seed the policy table
    await db('treasury_policies').insert({ required_signatures: 2 });
    console.log('Treasury policy seeded.');
  }

  const hasTreasuryTransactionsTable = await db.schema.hasTable('treasury_transactions');
  if (!hasTreasuryTransactionsTable) {
    await db.schema.createTable('treasury_transactions', (table) => {
      table.string('id').primary();
      table.string('recipient').notNullable();
      table.string('recipientName');
      table.decimal('amount', 14, 2).notNullable();
      table.string('memo');
      table.string('status').notNullable().defaultTo('Pending');
      table.timestamp('dateInitiated').notNullable();
      table.timestamp('dateExecuted');
      table.timestamps(true, true);
    });
    console.log('Table "treasury_transactions" created.');
  }

  const hasTreasuryApprovalsTable = await db.schema.hasTable('treasury_approvals');
  if (!hasTreasuryApprovalsTable) {
    await db.schema.createTable('treasury_approvals', (table) => {
      table.string('transaction_id').references('id').inTable('treasury_transactions').onDelete('CASCADE');
      table.string('signer_address').references('address').inTable('treasury_signers').onDelete('CASCADE');
      table.primary(['transaction_id', 'signer_address']);
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Table "treasury_approvals" created.');
  }

  const hasProposalsTable = await db.schema.hasTable('proposals');
  if (!hasProposalsTable) {
    await db.schema.createTable('proposals', (table) => {
      table.string('id').primary();
      table.string('title').notNullable();
      table.text('description').notNullable();
      table.text('proposer').notNullable(); // JSON
      table.string('status').notNullable();
      table.integer('votesFor').notNullable().defaultTo(0);
      table.integer('votesAgainst').notNullable().defaultTo(0);
      table.integer('votesAbstain').notNullable().defaultTo(0);
      table.string('endDate').notNullable();
    });
    console.log('Table "proposals" created.');

    const proposals = await db('proposals').select();
    if (proposals.length === 0) {
        await db('proposals').insert([
            {
                id: 'p1',
                title: 'Q3 Budget Allocation for Marketing',
                description: 'This proposal outlines a 150,000 token budget for marketing initiatives in Q3...',
                proposer: JSON.stringify({ name: 'Marketing Guild', avatarUrl: 'https://picsum.photos/seed/guild1/100/100' }),
                status: 'Active',
                votesFor: 1250000,
                votesAgainst: 450000,
                votesAbstain: 100000,
                endDate: '3 days remaining',
            },
            {
                id: 'p2',
                title: 'Integrate New Oracle Service',
                description: 'Proposal to switch our primary oracle provider...',
                proposer: JSON.stringify({ name: 'Dev Guild', avatarUrl: 'https://picsum.photos/seed/guild2/100/100' }),
                status: 'Passed',
                votesFor: 2800000,
                votesAgainst: 150000,
                votesAbstain: 50000,
                endDate: 'Ended 2 days ago',
            },
        ]);
        console.log('Proposals seeded.');
    }
  }

  const hasTokenDistributionGroupsTable = await db.schema.hasTable('token_distribution_groups');
  if (!hasTokenDistributionGroupsTable) {
    await db.schema.createTable('token_distribution_groups', (table) => {
      table.string('id').primary();
      table.string('groupName').notNullable();
      table.float('percentage').notNullable();
      table.integer('totalTokens').notNullable();
      table.string('vestingPeriod').notNullable();
      table.integer('claimed').notNullable();
    });
    console.log('Table "token_distribution_groups" created.');

    const groups = await db('token_distribution_groups').select();
    if (groups.length === 0) {
        await db('token_distribution_groups').insert([
            { id: '1', groupName: 'Founders & Core Team', percentage: 20, totalTokens: 20000000, vestingPeriod: '4 years, 1 year cliff', claimed: 500000 },
            { id: '2', groupName: 'Advisors & Early Backers', percentage: 15, totalTokens: 15000000, vestingPeriod: '2 years, 6 month cliff', claimed: 2500000 },
            { id: '3', groupName: 'Community Treasury', percentage: 40, totalTokens: 40000000, vestingPeriod: 'N/A', claimed: 10000000 },
            { id: '4', groupName: 'Public Sale & Liquidity', percentage: 25, totalTokens: 25000000, vestingPeriod: 'N/A', claimed: 25000000 },
        ]);
        console.log('Token distribution groups seeded.');
    }
  }

  // User Balances Table (Custom Token System)
  const hasUserBalancesTable = await db.schema.hasTable('user_balances');
  if (!hasUserBalancesTable) {
    await db.schema.createTable('user_balances', (table) => {
      table.string('user_id').primary();
      table.integer('soda_balance').defaultTo(0);
      table.integer('bubble_score').defaultTo(0);
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Table "user_balances" created.');

    // Seed initial users
    await db('user_balances').insert([
      { user_id: 'user_founder1', soda_balance: 25000000, bubble_score: 1000 },
      { user_id: 'user_advisor1', soda_balance: 10000000, bubble_score: 500 },
      { user_id: 'user_community1', soda_balance: 5000, bubble_score: 150 },
      { user_id: 'user_community2', soda_balance: 3000, bubble_score: 100 },
    ]);
    console.log('User balances seeded.');
  }

  // Token Transactions Table
  const hasTokenTransactionsTable = await db.schema.hasTable('token_transactions');
  if (!hasTokenTransactionsTable) {
    await db.schema.createTable('token_transactions', (table) => {
      table.string('id').primary();
      table.string('from_user');
      table.string('to_user');
      table.integer('amount').notNullable();
      table.string('transaction_type').notNullable();
      table.string('reference_id');
      table.text('memo');
      table.string('status').defaultTo('completed');
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Table "token_transactions" created.');
  }

  // Bubbles Table (Agent 1)
  const hasBubblesTable = await db.schema.hasTable('bubbles');
  if (!hasBubblesTable) {
    await db.schema.createTable('bubbles', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('type');
      table.string('status').notNullable().defaultTo('Draft');
      table.integer('fundingProgress').defaultTo(0);
      table.integer('sodaRaised').defaultTo(0);
      table.integer('backers').defaultTo(0);
      table.integer('healthScore').defaultTo(75);
      table.text('team').defaultTo('[]');
      table.text('treasury').defaultTo('{"balance":0,"transactions":[]}');
      table.text('roadmap').defaultTo('[]');
      table.text('updates').defaultTo('[]');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Table "bubbles" created.');
  }

  // Agreements Table (Agent 2)
  const hasAgreementsTable = await db.schema.hasTable('agreements');
  if (!hasAgreementsTable) {
    await db.schema.createTable('agreements', (table) => {
      table.string('id').primary();
      table.string('title').notNullable();
      table.string('type').notNullable();
      table.text('party').notNullable(); // JSON stringified
      table.integer('termOfEngagement').notNullable();
      table.string('startDate').notNullable();
      table.string('status').notNullable().defaultTo('Active');
      table.text('details').notNullable(); // JSON stringified
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Table "agreements" created.');
  }

  // Negotiation Threads Table (Agent 2)
  const hasNegotiationThreadsTable = await db.schema.hasTable('negotiation_threads');
  if (!hasNegotiationThreadsTable) {
    await db.schema.createTable('negotiation_threads', (table) => {
      table.string('id').primary();
      table.string('agreementId').notNullable();
      table.string('sectionKey').notNullable();
      table.string('action').notNullable();
      table.text('proposedChange').notNullable(); // JSON stringified
      table.text('reasonCode').notNullable(); // JSON stringified
      table.text('message');
      table.string('createdBy').notNullable();
      table.string('status').notNullable().defaultTo('open');
      table.text('events').notNullable(); // JSON stringified
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Table "negotiation_threads" created.');
  }

  // Agreement Signatures Table (Agent 2)
  const hasAgreementSignaturesTable = await db.schema.hasTable('agreement_signatures');
  if (!hasAgreementSignaturesTable) {
    await db.schema.createTable('agreement_signatures', (table) => {
      table.string('id').primary();
      table.string('agreement_id').notNullable().references('id').inTable('agreements');
      table.string('signer_address').notNullable();
      table.text('signature').notNullable();
      table.boolean('verified').defaultTo(false);
      table.timestamp('signed_at').defaultTo(db.fn.now());
    });
    console.log('Table "agreement_signatures" created.');
  }

  // Vesting Schedules Table (Agent 4)
  const hasVestingSchedulesTable = await db.schema.hasTable('vesting_schedules');
  if (!hasVestingSchedulesTable) {
    await db.schema.createTable('vesting_schedules', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable();
      table.string('group_id').notNullable();
      table.integer('total_tokens').notNullable();
      table.integer('claimed_tokens').defaultTo(0);
      table.timestamp('start_date').notNullable();
      table.timestamp('cliff_date');
      table.timestamp('end_date').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Table "vesting_schedules" created.');

    // Seed initial vesting schedules for testing
    await db('vesting_schedules').insert([
      {
        id: 'vest_1',
        user_id: 'user_founder1',
        group_id: '1',
        total_tokens: 5000000,
        claimed_tokens: 500000,
        start_date: '2024-01-01T00:00:00Z',
        cliff_date: '2025-01-01T00:00:00Z',
        end_date: '2028-01-01T00:00:00Z'
      },
      {
        id: 'vest_2',
        user_id: 'user_advisor1',
        group_id: '2',
        total_tokens: 7500000,
        claimed_tokens: 2500000,
        start_date: '2024-01-01T00:00:00Z',
        cliff_date: '2024-07-01T00:00:00Z',
        end_date: '2026-01-01T00:00:00Z'
      }
    ]);
    console.log('Vesting schedules seeded.');
  }

  // Proposal Votes Table (Agent 3)
  const hasProposalVotesTable = await db.schema.hasTable('proposal_votes');
  if (!hasProposalVotesTable) {
    await db.schema.createTable('proposal_votes', (table) => {
      table.string('id').primary();
      table.string('proposal_id').notNullable().references('id').inTable('proposals');
      table.string('voter_address').notNullable();
      table.string('vote_type').notNullable(); // 'for', 'against', 'abstain'
      table.integer('voting_power').notNullable();
      table.timestamp('voted_at').defaultTo(db.fn.now());
      table.unique(['proposal_id', 'voter_address']); // Prevent duplicate votes
    });
    console.log('Table "proposal_votes" created.');
  }

  // Marketplace Tables (Agent 5)
  const hasMarketplaceItemsTable = await db.schema.hasTable('marketplace_items');
  if (!hasMarketplaceItemsTable) {
    await db.schema.createTable('marketplace_items', (table) => {
      table.string('id').primary();
      table.string('seller_id').notNullable();
      table.string('name').notNullable();
      table.string('type').notNullable(); // 'NFT', 'Ticket', 'Merch'
      table.integer('price').notNullable();
      table.text('description');
      table.text('image_url');
      table.string('category');
      table.integer('quantity').defaultTo(1);
      table.integer('sold_count').defaultTo(0);
      table.string('status').defaultTo('active'); // 'active', 'sold_out', 'removed'
      table.string('creator_name');
      table.string('creator_avatar_url');
      table.integer('edition_current');
      table.integer('edition_total');
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Table "marketplace_items" created.');

    // Seed initial marketplace items
    await db('marketplace_items').insert([
      {
        id: 'mkt1',
        seller_id: 'system',
        name: 'Genesis Soda Can SCS',
        type: 'NFT',
        price: 1500,
        image_url: 'https://picsum.photos/seed/mkt1/400/400',
        description: 'A limited edition, animated SmartContractSystem (SCS) celebrating the launch of the SODA ecosystem. Grants access to the founders channel.',
        category: 'Collectibles',
        quantity: 100,
        sold_count: 43,
        creator_name: 'SodaDAO',
        creator_avatar_url: 'https://picsum.photos/seed/sodadao/100/100',
        edition_current: 43,
        edition_total: 100,
        status: 'active'
      },
      {
        id: 'mkt2',
        seller_id: 'system',
        name: 'Jazz Mafia Shrine Concert Ticket',
        type: 'Ticket',
        price: 250,
        image_url: 'https://picsum.photos/seed/mkt2/400/400',
        description: 'General admission to the live VR concert hosted in the Jazz Mafia Shrine bubble. One-time use.',
        category: 'Events',
        quantity: 1000,
        sold_count: 0,
        creator_name: 'Jazz Mafia Shrine',
        creator_avatar_url: 'https://picsum.photos/id/1005/200/200',
        status: 'active'
      },
      {
        id: 'mkt3',
        seller_id: 'system',
        name: 'SODA DAO Official Hoodie',
        type: 'Merch',
        price: 750,
        image_url: 'https://picsum.photos/seed/mkt3/400/400',
        description: 'High-quality, embroidered hoodie with the official SODA DAO logo. Includes a digital twin SCS.',
        category: 'Apparel',
        quantity: 50,
        sold_count: 0,
        creator_name: 'SodaDAO',
        creator_avatar_url: 'https://picsum.photos/seed/sodadao/100/100',
        status: 'active'
      },
      {
        id: 'mkt4',
        seller_id: 'system',
        name: 'Virtual TV Show: Episode 1 Pass',
        type: 'Ticket',
        price: 100,
        image_url: 'https://picsum.photos/seed/mkt4/400/400',
        description: 'Access pass to watch the premiere of the first episode from the Virtual TV Show bubble.',
        category: 'Media',
        quantity: 500,
        sold_count: 182,
        creator_name: 'Virtual TV Show',
        creator_avatar_url: 'https://picsum.photos/id/1005/200/200',
        edition_current: 182,
        edition_total: 500,
        status: 'active'
      },
      {
        id: 'mkt5',
        seller_id: 'system',
        name: 'Liquid Dreams by Kenji',
        type: 'NFT',
        price: 3000,
        image_url: 'https://picsum.photos/seed/mkt5/400/400',
        description: '1/1 artwork from artist Kenji, exploring themes of digital identity and community.',
        category: 'Art',
        quantity: 1,
        sold_count: 0,
        creator_name: 'Kenji',
        creator_avatar_url: 'https://picsum.photos/seed/kenji/100/100',
        status: 'active'
      }
    ]);
    console.log('Marketplace items seeded.');
  }

  const hasMarketplacePurchasesTable = await db.schema.hasTable('marketplace_purchases');
  if (!hasMarketplacePurchasesTable) {
    await db.schema.createTable('marketplace_purchases', (table) => {
      table.string('id').primary();
      table.string('item_id').notNullable();
      table.string('buyer_id').notNullable();
      table.string('seller_id').notNullable();
      table.integer('price').notNullable();
      table.integer('quantity').notNullable();
      table.integer('total_cost').notNullable();
      table.string('transaction_id'); // Links to token_transactions
      table.timestamp('purchased_at').defaultTo(db.fn.now());
    });
    console.log('Table "marketplace_purchases" created.');
  }

  // Legal Frameworks Table - stores country-specific legal parameters for DAO contract generation
  const hasLegalFrameworksTable = await db.schema.hasTable('legal_frameworks');
  if (!hasLegalFrameworksTable) {
    await db.schema.createTable('legal_frameworks', (table) => {
      table.string('id').primary();
      table.string('country').notNullable().unique();
      table.text('governance_clauses').notNullable(); // JSON stringified
      table.text('membership_requirements').notNullable(); // JSON stringified
      table.text('voting_requirements').notNullable(); // JSON stringified
      table.text('treasury_rules').notNullable(); // JSON stringified
      table.text('liability_clauses').notNullable(); // JSON stringified
      table.text('dissolution_rules').notNullable(); // JSON stringified
      table.text('additional_requirements'); // JSON stringified - country-specific additions
      table.text('disclaimers').notNullable(); // Legal disclaimers specific to country
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    console.log('Table "legal_frameworks" created.');

    // Seed initial legal frameworks for common jurisdictions
    await db('legal_frameworks').insert([
      {
        id: 'lf_usa',
        country: 'United States',
        governance_clauses: JSON.stringify({
          structure: 'Member-managed LLC or Unincorporated Nonprofit Association',
          voting: 'Majority or supermajority voting as defined in bylaws',
          quorum: 'Minimum participation threshold required for valid votes',
          amendments: 'Process for amending governance rules'
        }),
        membership_requirements: JSON.stringify({
          eligibility: 'Open membership subject to DAO admission criteria',
          rights: 'Voting rights proportional to token holdings or membership status',
          obligations: 'Members must comply with DAO rules and applicable laws'
        }),
        voting_requirements: JSON.stringify({
          mechanism: 'On-chain voting via smart contracts',
          threshold: 'Specified percentage for different proposal types',
          duration: 'Minimum voting period defined in governance documents'
        }),
        treasury_rules: JSON.stringify({
          management: 'Multi-signature wallet or smart contract controlled',
          spending: 'Approved through governance proposals',
          audit: 'Regular financial reporting and transparency requirements'
        }),
        liability_clauses: JSON.stringify({
          limited_liability: 'Members generally not liable for DAO debts (if properly structured)',
          indemnification: 'DAO may indemnify members acting in good faith',
          insurance: 'Consider D&O insurance for protection'
        }),
        dissolution_rules: JSON.stringify({
          trigger: 'Supermajority vote or automatic conditions',
          process: 'Asset distribution according to governance rules',
          notice: 'Proper notification to members and regulatory bodies'
        }),
        additional_requirements: JSON.stringify({
          securities_law: 'Token may be subject to SEC regulations',
          tax_compliance: 'DAO may need to file tax returns and issue K-1s',
          state_registration: 'May need to register as LLC or UNA in specific state'
        }),
        disclaimers: 'This template is for informational purposes only and does not constitute legal advice. DAOs operating in the United States should consult with a qualified attorney regarding entity structure, securities law compliance, tax obligations, and state-specific requirements. Token offerings may be subject to federal and state securities laws.',
        is_active: true
      },
      {
        id: 'lf_uk',
        country: 'United Kingdom',
        governance_clauses: JSON.stringify({
          structure: 'Unincorporated Association or Limited Company',
          voting: 'Democratic voting as specified in constitution',
          quorum: 'Minimum member participation for valid decisions',
          amendments: 'Process compliant with Companies Act 2006 if incorporated'
        }),
        membership_requirements: JSON.stringify({
          eligibility: 'Open or restricted membership as defined in rules',
          rights: 'Voting rights and benefit entitlements',
          obligations: 'Compliance with DAO constitution and UK law'
        }),
        voting_requirements: JSON.stringify({
          mechanism: 'Electronic voting permitted under applicable law',
          threshold: 'Ordinary or special resolution as required',
          duration: 'Notice period and voting window specified'
        }),
        treasury_rules: JSON.stringify({
          management: 'Controlled by designated trustees or directors',
          spending: 'Authorized through governance process',
          audit: 'Financial reporting in accordance with UK standards'
        }),
        liability_clauses: JSON.stringify({
          limited_liability: 'Limited if structured as Ltd company, unlimited if unincorporated',
          indemnification: 'Subject to company law limitations',
          insurance: 'Professional indemnity and directors insurance recommended'
        }),
        dissolution_rules: JSON.stringify({
          trigger: 'Member resolution or statutory grounds',
          process: 'Comply with Insolvency Act and company law procedures',
          notice: 'File proper notices with Companies House'
        }),
        additional_requirements: JSON.stringify({
          fca_regulations: 'Token activities may require FCA authorization',
          data_protection: 'Compliance with UK GDPR and Data Protection Act 2018',
          aml_requirements: 'Anti-money laundering obligations if applicable'
        }),
        disclaimers: 'This template is for informational purposes only and does not constitute legal advice. DAOs operating in the United Kingdom should seek advice from a qualified UK solicitor regarding proper entity structure, Financial Conduct Authority regulations, data protection compliance, and anti-money laundering obligations.',
        is_active: true
      },
      {
        id: 'lf_singapore',
        country: 'Singapore',
        governance_clauses: JSON.stringify({
          structure: 'Company Limited by Guarantee or Private Limited Company',
          voting: 'Member resolutions as per company constitution',
          quorum: 'As specified in Articles of Association',
          amendments: 'Special resolution process under Companies Act'
        }),
        membership_requirements: JSON.stringify({
          eligibility: 'Members admitted per constitutional requirements',
          rights: 'Voting and participation rights defined',
          obligations: 'Compliance with Singapore law and DAO rules'
        }),
        voting_requirements: JSON.stringify({
          mechanism: 'Electronic voting permitted with proper safeguards',
          threshold: 'Ordinary or special resolution as required',
          duration: 'Notice requirements under Companies Act'
        }),
        treasury_rules: JSON.stringify({
          management: 'Directors responsible for financial management',
          spending: 'Subject to governance approval process',
          audit: 'Annual financial statements and audit if required'
        }),
        liability_clauses: JSON.stringify({
          limited_liability: 'Members liability limited to guarantee amount',
          indemnification: 'Permitted subject to Companies Act provisions',
          insurance: 'Directors and officers insurance recommended'
        }),
        dissolution_rules: JSON.stringify({
          trigger: 'Special resolution or court order',
          process: 'Wind-up procedures under Companies Act',
          notice: 'File with ACRA and notify stakeholders'
        }),
        additional_requirements: JSON.stringify({
          mas_regulations: 'Token offerings subject to MAS securities regulations',
          acra_filing: 'Annual filing requirements with ACRA',
          payment_services: 'Payment Services Act compliance if applicable'
        }),
        disclaimers: 'This template is for informational purposes only and does not constitute legal advice. DAOs operating in Singapore should consult with a qualified Singapore lawyer regarding the Companies Act, Monetary Authority of Singapore regulations, Payment Services Act requirements, and ACRA filing obligations.',
        is_active: true
      }
    ]);
    console.log('Legal frameworks seeded with USA, UK, and Singapore.');
  }

  // Admin Logs Table - tracks all admin actions for security auditing
  const hasAdminLogsTable = await db.schema.hasTable('admin_logs');
  if (!hasAdminLogsTable) {
    await db.schema.createTable('admin_logs', (table) => {
      table.string('id').primary();
      table.string('action').notNullable(); // login_success, login_failed, create_framework, etc.
      table.text('details'); // JSON string with additional details
      table.string('ip_address').notNullable();
      table.string('user_agent');
      table.string('session_id'); // null for failed login attempts
      table.boolean('success').notNullable().defaultTo(true);
      table.timestamp('timestamp').notNullable().defaultTo(db.fn.now());

      // Indexes for common queries
      table.index('action');
      table.index('session_id');
      table.index('timestamp');
      table.index('ip_address');
    });
    console.log('Table "admin_logs" created.');
  }
}

export default db;
export const getDatabase = async () => db;
