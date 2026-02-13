import type { Knex } from 'knex';

/**
 * SodaWorld DAO Foundation Tables
 *
 * Creates or ensures the core schema for the DAO platform.
 * Handles the case where some tables already exist from initializeDatabase().
 */
export async function up(knex: Knex): Promise<void> {
  // Helper: create table only if it doesn't exist
  async function createIfNotExists(
    name: string,
    builder: (t: Knex.CreateTableBuilder) => void,
  ) {
    const exists = await knex.schema.hasTable(name);
    if (!exists) {
      await knex.schema.createTable(name, builder);
      console.log(`Created table: ${name}`);
    } else {
      console.log(`Table already exists, skipping: ${name}`);
    }
  }

  // Helper: add column if it doesn't exist
  async function addColumnIfNotExists(
    table: string,
    column: string,
    builder: (t: Knex.AlterTableBuilder) => void,
  ) {
    const exists = await knex.schema.hasColumn(table, column);
    if (!exists) {
      await knex.schema.alterTable(table, builder);
      console.log(`Added column ${column} to ${table}`);
    }
  }

  // -----------------------------------------------------------------------
  // users — master user table
  // -----------------------------------------------------------------------
  await createIfNotExists('users', (t) => {
    t.string('id').primary();
    t.string('firebase_uid', 128).unique();
    t.string('email', 255).unique();
    t.string('display_name', 255);
    t.text('avatar_url').nullable();
    t.string('role', 50).defaultTo('member');
    t.string('wallet_address', 255).nullable();
    t.text('metadata').defaultTo('{}');
    t.timestamps(true, true);
  });

  // -----------------------------------------------------------------------
  // daos — ensure v2 columns exist
  // -----------------------------------------------------------------------
  const hasDaos = await knex.schema.hasTable('daos');
  if (hasDaos) {
    // Add missing columns to existing daos table
    await addColumnIfNotExists('daos', 'slug', (t) => {
      t.string('slug', 255).nullable();
    });
    await addColumnIfNotExists('daos', 'mission', (t) => {
      t.text('mission').nullable();
    });
    await addColumnIfNotExists('daos', 'phase', (t) => {
      t.string('phase', 50).defaultTo('inception');
    });
    await addColumnIfNotExists('daos', 'governance_model', (t) => {
      t.string('governance_model', 50).defaultTo('founder_led');
    });
    await addColumnIfNotExists('daos', 'treasury_address', (t) => {
      t.string('treasury_address', 255).nullable();
    });
    await addColumnIfNotExists('daos', 'settings', (t) => {
      t.text('settings').defaultTo('{}');
    });
    await addColumnIfNotExists('daos', 'founder_id', (t) => {
      t.string('founder_id').nullable();
    });
    console.log('Updated existing daos table with foundation columns');
  } else {
    await knex.schema.createTable('daos', (t) => {
      t.string('id').primary();
      t.string('name', 255).notNullable();
      t.string('slug', 255).nullable();
      t.text('description').defaultTo('');
      t.text('mission').nullable();
      t.string('phase', 50).defaultTo('inception');
      t.string('governance_model', 50).defaultTo('founder_led');
      t.string('treasury_address', 255).nullable();
      t.text('settings').defaultTo('{}');
      t.string('founder_id').nullable();
      t.timestamps(true, true);
    });
    console.log('Created table: daos');
  }

  // -----------------------------------------------------------------------
  // dao_members
  // -----------------------------------------------------------------------
  await createIfNotExists('dao_members', (t) => {
    t.string('id').primary();
    t.string('dao_id').notNullable();
    t.string('user_id').notNullable();
    t.string('role', 50).defaultTo('member');
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.timestamp('left_at').nullable();
    t.decimal('voting_power', 18, 8).defaultTo(1);
    t.decimal('reputation_score', 12, 4).defaultTo(0);
    t.text('metadata').defaultTo('{}');
  });

  // -----------------------------------------------------------------------
  // agreements
  // -----------------------------------------------------------------------
  await createIfNotExists('agreements', (t) => {
    t.string('id').primary();
    t.string('dao_id').notNullable();
    t.string('title', 500).notNullable();
    t.string('type', 50).notNullable();
    t.string('status', 50).defaultTo('draft');
    t.integer('version').defaultTo(1);
    t.text('content_markdown').defaultTo('');
    t.text('terms').defaultTo('{}');
    t.string('created_by').notNullable();
    t.string('parent_agreement_id').nullable();
    t.timestamps(true, true);
  });

  // -----------------------------------------------------------------------
  // agreement_signatures
  // -----------------------------------------------------------------------
  await createIfNotExists('agreement_signatures', (t) => {
    t.string('id').primary();
    t.string('agreement_id').notNullable();
    t.string('user_id').notNullable();
    t.timestamp('signed_at').defaultTo(knex.fn.now());
    t.string('signature_hash', 512).notNullable();
    t.string('ip_address', 45).notNullable();
    t.text('metadata').defaultTo('{}');
  });

  // -----------------------------------------------------------------------
  // proposals — ensure v2 columns exist
  // -----------------------------------------------------------------------
  const hasProposals = await knex.schema.hasTable('proposals');
  if (hasProposals) {
    await addColumnIfNotExists('proposals', 'dao_id', (t) => {
      t.string('dao_id').nullable();
    });
    await addColumnIfNotExists('proposals', 'type', (t) => {
      t.string('type', 50).defaultTo('custom');
    });
    await addColumnIfNotExists('proposals', 'author_id', (t) => {
      t.string('author_id').nullable();
    });
    await addColumnIfNotExists('proposals', 'voting_starts_at', (t) => {
      t.timestamp('voting_starts_at').nullable();
    });
    await addColumnIfNotExists('proposals', 'voting_ends_at', (t) => {
      t.timestamp('voting_ends_at').nullable();
    });
    await addColumnIfNotExists('proposals', 'quorum_required', (t) => {
      t.decimal('quorum_required', 5, 4).defaultTo(0.5);
    });
    await addColumnIfNotExists('proposals', 'approval_threshold', (t) => {
      t.decimal('approval_threshold', 5, 4).defaultTo(0.5);
    });
    await addColumnIfNotExists('proposals', 'execution_payload', (t) => {
      t.text('execution_payload').nullable();
    });
    await addColumnIfNotExists('proposals', 'result_summary', (t) => {
      t.text('result_summary').nullable();
    });
    console.log('Updated existing proposals table with foundation columns');
  } else {
    await knex.schema.createTable('proposals', (t) => {
      t.string('id').primary();
      t.string('dao_id').notNullable();
      t.string('title', 500).notNullable();
      t.text('description').defaultTo('');
      t.string('type', 50).notNullable();
      t.string('status', 50).defaultTo('draft');
      t.string('author_id').notNullable();
      t.timestamp('voting_starts_at').nullable();
      t.timestamp('voting_ends_at').nullable();
      t.decimal('quorum_required', 5, 4).defaultTo(0.5);
      t.decimal('approval_threshold', 5, 4).defaultTo(0.5);
      t.text('execution_payload').nullable();
      t.text('result_summary').nullable();
      t.timestamps(true, true);
    });
    console.log('Created table: proposals');
  }

  // -----------------------------------------------------------------------
  // votes
  // -----------------------------------------------------------------------
  await createIfNotExists('votes', (t) => {
    t.string('id').primary();
    t.string('proposal_id').notNullable();
    t.string('user_id').notNullable();
    t.string('choice', 20).notNullable();
    t.decimal('weight', 18, 8).defaultTo(1);
    t.text('reason').nullable();
    t.timestamp('cast_at').defaultTo(knex.fn.now());
  });

  // -----------------------------------------------------------------------
  // ai_conversations
  // -----------------------------------------------------------------------
  await createIfNotExists('ai_conversations', (t) => {
    t.string('id').primary();
    t.string('dao_id').notNullable();
    t.string('module_id', 50).notNullable();
    t.string('user_id').notNullable();
    t.string('role', 20).notNullable();
    t.text('content').notNullable();
    t.text('metadata').defaultTo('{}');
    t.string('parent_message_id').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // -----------------------------------------------------------------------
  // knowledge_items
  // -----------------------------------------------------------------------
  await createIfNotExists('knowledge_items', (t) => {
    t.string('id').primary();
    t.string('dao_id').notNullable();
    t.string('module_id', 50).notNullable();
    t.string('category', 50).notNullable();
    t.string('title', 500).notNullable();
    t.text('content').notNullable();
    t.string('source', 50).notNullable();
    t.decimal('confidence', 5, 4).defaultTo(1.0);
    t.text('tags').defaultTo('[]');
    t.text('embedding_vector').nullable();
    t.string('created_by').notNullable();
    t.timestamp('expires_at').nullable();
    t.timestamps(true, true);
  });

  // -----------------------------------------------------------------------
  // bounties
  // -----------------------------------------------------------------------
  await createIfNotExists('bounties', (t) => {
    t.string('id').primary();
    t.string('dao_id').notNullable();
    t.string('title', 500).notNullable();
    t.text('description').defaultTo('');
    t.decimal('reward_amount', 18, 8).notNullable();
    t.string('reward_token', 32).defaultTo('USDC');
    t.string('status', 50).defaultTo('open');
    t.string('created_by').notNullable();
    t.string('claimed_by').nullable();
    t.timestamp('deadline').nullable();
    t.text('deliverables').defaultTo('[]');
    t.text('tags').defaultTo('[]');
    t.timestamps(true, true);
  });

  // -----------------------------------------------------------------------
  // marketplace_items
  // -----------------------------------------------------------------------
  await createIfNotExists('marketplace_items', (t) => {
    t.string('id').primary();
    t.string('title', 500).notNullable();
    t.text('description').defaultTo('');
    t.string('type', 50).notNullable();
    t.string('status', 50).defaultTo('draft');
    t.decimal('price', 18, 8).defaultTo(0);
    t.string('currency', 16).defaultTo('USDC');
    t.string('author_id').notNullable();
    t.string('dao_id').nullable();
    t.integer('download_count').defaultTo(0);
    t.decimal('rating_avg', 3, 2).defaultTo(0);
    t.integer('rating_count').defaultTo(0);
    t.text('metadata').defaultTo('{}');
    t.timestamps(true, true);
  });

  console.log('Foundation migration 015 complete.');
}

/**
 * Reverse the migration: drop only the tables we created (not pre-existing ones).
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('marketplace_items');
  await knex.schema.dropTableIfExists('bounties');
  await knex.schema.dropTableIfExists('knowledge_items');
  await knex.schema.dropTableIfExists('ai_conversations');
  await knex.schema.dropTableIfExists('votes');
  await knex.schema.dropTableIfExists('agreement_signatures');
  await knex.schema.dropTableIfExists('agreements');
  await knex.schema.dropTableIfExists('dao_members');
  // Don't drop proposals and daos as they may be original tables
  // await knex.schema.dropTableIfExists('proposals');
  // await knex.schema.dropTableIfExists('daos');
  await knex.schema.dropTableIfExists('users');
}
