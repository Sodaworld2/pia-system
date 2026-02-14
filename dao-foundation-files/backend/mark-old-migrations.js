const knex = require('knex')({
  client: 'sqlite3',
  connection: { filename: './mentor_chats.db' },
  useNullAsDefault: true,
});

async function run() {
  // Create knex_migrations table if it doesn't exist
  const hasTable = await knex.schema.hasTable('knex_migrations');
  if (!hasTable) {
    await knex.schema.createTable('knex_migrations', (t) => {
      t.increments('id');
      t.string('name');
      t.integer('batch');
      t.datetime('migration_time');
    });
    console.log('Created knex_migrations table');
  }

  // Create knex_migrations_lock table if it doesn't exist
  const hasLock = await knex.schema.hasTable('knex_migrations_lock');
  if (!hasLock) {
    await knex.schema.createTable('knex_migrations_lock', (t) => {
      t.increments('index');
      t.integer('is_locked');
    });
    await knex('knex_migrations_lock').insert({ is_locked: 0 });
    console.log('Created knex_migrations_lock table');
  }

  // Unlock any stale locks
  await knex('knex_migrations_lock').update({ is_locked: 0 });

  const now = new Date().toISOString();
  const oldMigrations = [
    '007_create_admin_logs.ts',
    '008_update_dao_schema.ts',
    '009_add_missing_indexes.ts',
    '010_add_founder_personal_details.ts',
    '011_add_agreement_multi_party.ts',
    '012_create_vesting_unlocks.ts',
    '013_add_version_to_user_balances.ts',
    '014_add_brain_metadata_to_messages.ts',
  ];

  for (const m of oldMigrations) {
    const exists = await knex('knex_migrations').where('name', m).first();
    if (!exists) {
      await knex('knex_migrations').insert({ name: m, batch: 0, migration_time: now });
      console.log('Marked as complete:', m);
    } else {
      console.log('Already tracked:', m);
    }
  }

  console.log('All old migrations marked. Now run: npx knex migrate:latest --knexfile knexfile.js');
  await knex.destroy();
}

run().catch((e) => { console.error(e); process.exit(1); });
