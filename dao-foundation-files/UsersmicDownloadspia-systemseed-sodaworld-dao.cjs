const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'pia.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const now = new Date().toISOString();
const counts = {};

function addCount(table, n) {
  counts[table] = (counts[table] || 0) + n;
}