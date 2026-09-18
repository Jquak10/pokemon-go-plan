import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../schema.sql');
const migration = read('../migrations/0004_schema_baseline_operational_tables.sql');

const expectedColumns = {
  event_suppression_rules: [
    ['id', 'TEXT', 0, null, 1],
    ['event_name', 'TEXT', 1, null, 0],
    ['start_date', 'TEXT', 1, null, 0],
    ['end_date', 'TEXT', 1, null, 0],
    ['suppressed_source_types', 'TEXT', 1, null, 0],
    ['note', 'TEXT', 0, null, 0],
    ['source_url', 'TEXT', 0, null, 0],
    ['active', 'INTEGER', 1, '1', 0],
    ['detected_automatically', 'INTEGER', 1, '1', 0],
    ['source_excerpt', 'TEXT', 0, null, 0],
    ['updated_at', 'TEXT', 1, null, 0]
  ],
  remote_raid_daily_budget_overrides: [
    ['user_id', 'TEXT', 1, null, 1],
    ['local_date', 'TEXT', 1, null, 2],
    ['budget_override', 'INTEGER', 1, null, 0],
    ['updated_at', 'TEXT', 1, null, 0]
  ]
};

const expectedIndexes = {
  event_suppression_rules: 'idx_event_suppression_dates',
  remote_raid_daily_budget_overrides: 'idx_remote_raid_daily_budget_overrides_date'
};

function columnShape(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all()
    .map(row => [row.name, row.type, Number(row.notnull), row.dflt_value, Number(row.pk)]);
}

function assertOperationalShape(db) {
  for (const [table, columns] of Object.entries(expectedColumns)) {
    assert.deepEqual(columnShape(db, table), columns, `${table} columns must match verified production D1`);

    const indexes = db.prepare(`PRAGMA index_list(${table})`).all().map(row => row.name);
    assert.ok(indexes.includes(expectedIndexes[table]), `${table} must include ${expectedIndexes[table]}`);
  }
}

const fresh = new DatabaseSync(':memory:');
fresh.exec(schema);
assertOperationalShape(fresh);
fresh.exec(migration);
assertOperationalShape(fresh);

const existing = new DatabaseSync(':memory:');
existing.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE users (id TEXT PRIMARY KEY);
`);
existing.exec(migration);
assertOperationalShape(existing);

existing.prepare(`
  INSERT INTO event_suppression_rules (
    id, event_name, start_date, end_date, suppressed_source_types, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`).run('rule', 'Test event', '2026-09-18', '2026-09-19', '["raid_battles"]', 'now');

const defaults = existing.prepare(`
  SELECT active, detected_automatically
  FROM event_suppression_rules
  WHERE id = 'rule'
`).get();
assert.deepEqual(
  [Number(defaults.active), Number(defaults.detected_automatically)],
  [1, 1],
  'suppression defaults must match production'
);

existing.prepare(`
  INSERT INTO users(id) VALUES (?)
`).run('user');
existing.prepare(`
  INSERT INTO remote_raid_daily_budget_overrides (
    user_id, local_date, budget_override, updated_at
  ) VALUES (?, ?, ?, ?)
`).run('user', '2026-09-18', 7, 'now');

existing.exec(migration);
assert.equal(
  existing.prepare(`SELECT budget_override AS value FROM remote_raid_daily_budget_overrides WHERE user_id = 'user'`).get().value,
  7,
  're-running migration must preserve existing data'
);

assert.throws(
  () => existing.prepare(`
    INSERT INTO remote_raid_daily_budget_overrides (
      user_id, local_date, budget_override, updated_at
    ) VALUES (?, ?, ?, ?)
  `).run('missing-user', '2026-09-18', 1, 'now'),
  /FOREIGN KEY constraint failed/,
  'daily overrides must retain the verified users foreign key'
);

existing.prepare(`DELETE FROM users WHERE id = ?`).run('user');
assert.equal(
  existing.prepare(`SELECT COUNT(*) AS count FROM remote_raid_daily_budget_overrides WHERE user_id = 'user'`).get().count,
  0,
  'daily overrides must cascade when their user is deleted'
);

console.log('schema completeness regression tests passed');
