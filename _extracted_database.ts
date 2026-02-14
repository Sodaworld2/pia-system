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
  if (!hasUser
