import type { Knex } from 'knex';

/**
 * SodaWorld DAO Foundation Tables
 *
 * Creates the core schema for the DAO platform:
 *   users, daos, dao_members, agreements, agreement_signatures,
 *   proposals, votes, ai_conversations, knowledge_items,
 *   bounties, marketplace_items.
 */
export async function up(knex: Knex): Promise<void> {
  // -----------------------------------------------------------------------
  // users
  // -----------------------------------------------------------------------
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.string('firebase_uid', 128).notNullable().unique();
    t.string('email', 255).notNullable().unique();
    t.string('display_name', 255).notNullable();
    t.text('avatar_url').nullable();
    t.enum('role', ['founder', 'admin', 'member', 'contributor', 'observer'])
      .notNullable()
      .defaultTo('member');
    t.string('wallet_address', 255).nullable().unique();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamps(true, true);

    t.index('firebase_uid');
    t.index('email');
    t.index('role');
  });

  // -----------------------------------------------------------------------
  // daos
  // -----------------------------------------------------------------------
  await knex.schema.createTable('daos', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.string('name', 255).notNullable();
    t.string('slug', 255).notNullable().unique();
    t.text('description').notNullable().defaultTo('');
    t.text('mission').nullable();
    t.enum('phase', ['inception', 'formation', 'operating', 'scaling', 'sunset'])
      .notNullable()
      .defaultTo('inception');
    t.enum('governance_model', [
      'founder_led', 'council', 'token_weighted',
      'quadratic', 'conviction', 'holographic',
    ])
      .notNullable()
      .defaultTo('founder_led');
    t.string('treasury_address', 255).nullable();
    t.jsonb('settings').notNullable().defaultTo('{}');
    t.uuid('founder_id').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamps(true, true);

    t.index('slug');
    t.index('phase');
    t.index('founder_id');
  });

  // -----------------------------------------------------------------------
  // dao_members
  // -----------------------------------------------------------------------
  await knex.schema.createTable('dao_members', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('dao_id').notNullable()
      .references('id').inTable('daos').onDelete('CASCADE');
    t.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.enum('role', ['founder', 'admin', 'member', 'contributor', 'observer'])
      .notNullable()
      .defaultTo('member');
    t.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('left_at').nullable();
    t.decimal('voting_power', 18, 8).notNullable().defaultTo(1);
    t.decimal('reputation_score', 12, 4).notNullable().defaultTo(0);
    t.jsonb('metadata').notNullable().defaultTo('{}');

    t.unique(['dao_id', 'user_id']);
    t.index('dao_id');
    t.index('user_id');
    t.index('role');
  });

  // -----------------------------------------------------------------------
  // agreements
  // -----------------------------------------------------------------------
  await knex.schema.createTable('agreements', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('dao_id').notNullable()
      .references('id').inTable('daos').onDelete('CASCADE');
    t.string('title', 500).notNullable();
    t.enum('type', [
      'operating_agreement', 'contributor_agreement', 'nda',
      'ip_assignment', 'service_agreement', 'token_grant', 'custom',
    ]).notNullable();
    t.enum('status', [
      'draft', 'review', 'pending_signatures',
      'active', 'expired', 'terminated', 'amended',
    ])
      .notNullable()
      .defaultTo('draft');
    t.integer('version').notNullable().defaultTo(1);
    t.text('content_markdown').notNullable().defaultTo('');
    t.jsonb('terms').notNullable().defaultTo('{}');
    t.uuid('created_by').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('parent_agreement_id').nullable()
      .references('id').inTable('agreements').onDelete('SET NULL');
    t.timestamps(true, true);

    t.index('dao_id');
    t.index('type');
    t.index('status');
    t.index('created_by');
    t.index('parent_agreement_id');
  });

  // -----------------------------------------------------------------------
  // agreement_signatures
  // -----------------------------------------------------------------------
  await knex.schema.createTable('agreement_signatures', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('agreement_id').notNullable()
      .references('id').inTable('agreements').onDelete('CASCADE');
    t.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('signed_at').notNullable().defaultTo(knex.fn.now());
    t.string('signature_hash', 512).notNullable();
    t.string('ip_address', 45).notNullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');

    t.unique(['agreement_id', 'user_id']);
    t.index('agreement_id');
    t.index('user_id');
  });

  // -----------------------------------------------------------------------
  // proposals
  // -----------------------------------------------------------------------
  await knex.schema.createTable('proposals', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('dao_id').notNullable()
      .references('id').inTable('daos').onDelete('CASCADE');
    t.string('title', 500).notNullable();
    t.text('description').notNullable().defaultTo('');
    t.enum('type', [
      'treasury_spend', 'membership', 'governance_change',
      'agreement_ratification', 'bounty', 'parameter_change', 'custom',
    ]).notNullable();
    t.enum('status', [
      'draft', 'discussion', 'voting',
      'passed', 'rejected', 'executed', 'cancelled',
    ])
      .notNullable()
      .defaultTo('draft');
    t.uuid('author_id').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('voting_starts_at').nullable();
    t.timestamp('voting_ends_at').nullable();
    t.decimal('quorum_required', 5, 4).notNullable().defaultTo(0.5);
    t.decimal('approval_threshold', 5, 4).notNullable().defaultTo(0.5);
    t.jsonb('execution_payload').nullable();
    t.jsonb('result_summary').nullable();
    t.timestamps(true, true);

    t.index('dao_id');
    t.index('type');
    t.index('status');
    t.index('author_id');
    t.index(['voting_starts_at', 'voting_ends_at']);
  });

  // -----------------------------------------------------------------------
  // votes
  // -----------------------------------------------------------------------
  await knex.schema.createTable('votes', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('proposal_id').notNullable()
      .references('id').inTable('proposals').onDelete('CASCADE');
    t.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.enum('choice', ['yes', 'no', 'abstain']).notNullable();
    t.decimal('weight', 18, 8).notNullable().defaultTo(1);
    t.text('reason').nullable();
    t.timestamp('cast_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['proposal_id', 'user_id']);
    t.index('proposal_id');
    t.index('user_id');
    t.index('choice');
  });

  // -----------------------------------------------------------------------
  // ai_conversations (stores all AI module messages)
  // -----------------------------------------------------------------------
  await knex.schema.createTable('ai_conversations', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('dao_id').notNullable()
      .references('id').inTable('daos').onDelete('CASCADE');
    t.enum('module_id', [
      'coach', 'legal', 'treasury', 'governance',
      'community', 'product', 'security', 'analytics', 'onboarding',
    ]).notNullable();
    t.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.enum('role', ['user', 'assistant', 'system']).notNullable();
    t.text('content').notNullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.uuid('parent_message_id').nullable()
      .references('id').inTable('ai_conversations').onDelete('SET NULL');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index('dao_id');
    t.index('module_id');
    t.index('user_id');
    t.index('parent_message_id');
    t.index(['dao_id', 'module_id', 'user_id']);
    t.index('created_at');
  });

  // -----------------------------------------------------------------------
  // knowledge_items
  // -----------------------------------------------------------------------
  await knex.schema.createTable('knowledge_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('dao_id').notNullable()
      .references('id').inTable('daos').onDelete('CASCADE');
    t.enum('module_id', [
      'coach', 'legal', 'treasury', 'governance',
      'community', 'product', 'security', 'analytics', 'onboarding',
    ]).notNullable();
    t.enum('category', [
      'goal', 'strength', 'preference', 'contract', 'precedent',
      'terms', 'policy', 'procedure', 'metric', 'decision',
      'lesson', 'resource', 'contact', 'custom',
    ]).notNullable();
    t.string('title', 500).notNullable();
    t.text('content').notNullable();
    t.enum('source', [
      'user_input', 'ai_derived', 'document_import',
      'api_sync', 'conversation_extract',
    ]).notNullable();
    t.decimal('confidence', 5, 4).notNullable().defaultTo(1.0);
    t.jsonb('tags').notNullable().defaultTo('[]');
    // Stored as JSON array; use pgvector extension for real vector search
    t.jsonb('embedding_vector').nullable();
    t.uuid('created_by').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('expires_at').nullable();
    t.timestamps(true, true);

    t.index('dao_id');
    t.index('module_id');
    t.index('category');
    t.index('source');
    t.index(['dao_id', 'module_id', 'category']);
    t.index('created_by');
    t.index('expires_at');
  });

  // -----------------------------------------------------------------------
  // bounties
  // -----------------------------------------------------------------------
  await knex.schema.createTable('bounties', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('dao_id').notNullable()
      .references('id').inTable('daos').onDelete('CASCADE');
    t.string('title', 500).notNullable();
    t.text('description').notNullable().defaultTo('');
    t.decimal('reward_amount', 18, 8).notNullable();
    t.string('reward_token', 32).notNullable().defaultTo('USDC');
    t.enum('status', [
      'open', 'claimed', 'in_progress',
      'review', 'completed', 'cancelled',
    ])
      .notNullable()
      .defaultTo('open');
    t.uuid('created_by').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('claimed_by').nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('deadline').nullable();
    t.jsonb('deliverables').notNullable().defaultTo('[]');
    t.jsonb('tags').notNullable().defaultTo('[]');
    t.timestamps(true, true);

    t.index('dao_id');
    t.index('status');
    t.index('created_by');
    t.index('claimed_by');
    t.index('deadline');
  });

  // -----------------------------------------------------------------------
  // marketplace_items
  // -----------------------------------------------------------------------
  await knex.schema.createTable('marketplace_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.string('title', 500).notNullable();
    t.text('description').notNullable().defaultTo('');
    t.enum('type', ['template', 'module', 'integration', 'service']).notNullable();
    t.enum('status', ['draft', 'listed', 'delisted'])
      .notNullable()
      .defaultTo('draft');
    t.decimal('price', 18, 8).notNullable().defaultTo(0);
    t.string('currency', 16).notNullable().defaultTo('USDC');
    t.uuid('author_id').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('dao_id').nullable()
      .references('id').inTable('daos').onDelete('SET NULL');
    t.integer('download_count').notNullable().defaultTo(0);
    t.decimal('rating_avg', 3, 2).notNullable().defaultTo(0);
    t.integer('rating_count').notNullable().defaultTo(0);
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamps(true, true);

    t.index('type');
    t.index('status');
    t.index('author_id');
    t.index('dao_id');
    t.index(['type', 'status']);
    t.index('download_count');
    t.index('rating_avg');
  });
}

/**
 * Reverse the migration: drop all foundation tables in dependency order.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('marketplace_items');
  await knex.schema.dropTableIfExists('bounties');
  await knex.schema.dropTableIfExists('knowledge_items');
  await knex.schema.dropTableIfExists('ai_conversations');
  await knex.schema.dropTableIfExists('votes');
  await knex.schema.dropTableIfExists('proposals');
  await knex.schema.dropTableIfExists('agreement_signatures');
  await knex.schema.dropTableIfExists('agreements');
  await knex.schema.dropTableIfExists('dao_members');
  await knex.schema.dropTableIfExists('daos');
  await knex.schema.dropTableIfExists('users');
}
