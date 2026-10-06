import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../schema.sql');
const migration = read('../migrations/0004_schema_baseline_operational_tables.sql');
const maxCostMigration = read('../migrations/0005_max_battle_cost_overrides.sql');
const syncHealthMigration = read('../migrations/0006_sync_source_health.sql');
const feedCredentialMigration = read('../migrations/0007_feed_link_credentials.sql');
const remoteRaidLimitIndexMigration = read('../migrations/0008_remote_raid_limit_index.sql');
const catalogSnapshotMigration = read('../migrations/0009_pokemon_catalog_snapshot.sql');

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

const syncHealthColumns = [
  ['source_key', 'TEXT', 0, null, 1],
  ['source_group', 'TEXT', 1, null, 0],
  ['source_label', 'TEXT', 1, null, 0],
  ['source_url', 'TEXT', 0, null, 0],
  ['last_attempt_at', 'TEXT', 1, null, 0],
  ['last_success_at', 'TEXT', 0, null, 0],
  ['last_error', 'TEXT', 0, null, 0],
  ['item_count', 'INTEGER', 0, null, 0],
  ['updated_at', 'TEXT', 1, null, 0]
];

function assertSyncHealthShape(db) {
  assert.deepEqual(
    columnShape(db, 'sync_source_health'),
    syncHealthColumns,
    'sync_source_health columns must match migration 0006'
  );

  const indexes = db.prepare('PRAGMA index_list(sync_source_health)').all().map(row => row.name);
  assert.ok(
    indexes.includes('idx_sync_source_health_group'),
    'sync_source_health must include its group index'
  );
}

const feedCredentialColumns = [
  ['user_id', 'TEXT', 0, null, 1],
  ['signed_generation', 'INTEGER', 1, '0', 0],
  ['signed_enabled', 'INTEGER', 1, '1', 0],
  ['updated_at', 'TEXT', 1, null, 0]
];

const catalogSnapshotColumns = [
  ['id', 'TEXT', 0, null, 1],
  ['source_url', 'TEXT', 1, null, 0],
  ['generated_at', 'TEXT', 1, null, 0],
  ['entry_count', 'INTEGER', 1, null, 0],
  ['catalog_json', 'TEXT', 1, null, 0],
  ['updated_at', 'TEXT', 1, null, 0]
];

function assertCatalogSnapshotShape(db) {
  assert.deepEqual(
    columnShape(db, 'pokemon_catalog_snapshot'),
    catalogSnapshotColumns,
    'pokemon_catalog_snapshot columns must match migration 0009'
  );
}

function assertFeedCredentialShape(db) {
  assert.deepEqual(
    columnShape(db, 'feed_link_credentials'),
    feedCredentialColumns,
    'feed_link_credentials columns must match migration 0007'
  );
}

const maxCostOverrideColumns = [
  ['user_id', 'TEXT', 1, null, 1],
  ['opportunity_key', 'TEXT', 1, null, 2],
  ['pokemon_name', 'TEXT', 1, null, 0],
  ['battle_variant', 'TEXT', 1, null, 0],
  ['start_date', 'TEXT', 1, null, 0],
  ['end_date', 'TEXT', 1, null, 0],
  ['max_battle_tier', 'INTEGER', 1, null, 0],
  ['max_particle_cost', 'INTEGER', 1, null, 0],
  ['updated_at', 'TEXT', 1, null, 0]
];

function assertMaxCostOverrideShape(db) {
  assert.deepEqual(
    columnShape(db, 'max_battle_cost_overrides'),
    maxCostOverrideColumns,
    'max_battle_cost_overrides columns must match the migration'
  );

  const indexes = db.prepare('PRAGMA index_list(max_battle_cost_overrides)').all().map(row => row.name);
  assert.ok(
    indexes.includes('idx_max_battle_cost_overrides_dates'),
    'max_battle_cost_overrides must include its date index'
  );
}

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
assertMaxCostOverrideShape(fresh);
assertSyncHealthShape(fresh);
assertFeedCredentialShape(fresh);
assertCatalogSnapshotShape(fresh);
fresh.exec(maxCostMigration);
assertMaxCostOverrideShape(fresh);
fresh.exec(syncHealthMigration);
assertSyncHealthShape(fresh);
fresh.exec(feedCredentialMigration);
assertFeedCredentialShape(fresh);
fresh.exec(catalogSnapshotMigration);
assertCatalogSnapshotShape(fresh);
fresh.exec(catalogSnapshotMigration);
assertCatalogSnapshotShape(fresh);
fresh.exec(feedCredentialMigration);
assertFeedCredentialShape(fresh);

const existing = new DatabaseSync(':memory:');
existing.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE users (id TEXT PRIMARY KEY);
`);
existing.exec(migration);
assertOperationalShape(existing);
existing.exec(maxCostMigration);
assertMaxCostOverrideShape(existing);
existing.exec(syncHealthMigration);
assertSyncHealthShape(existing);
existing.exec(syncHealthMigration);
assertSyncHealthShape(existing);
existing.exec(feedCredentialMigration);
assertFeedCredentialShape(existing);
existing.exec(catalogSnapshotMigration);
assertCatalogSnapshotShape(existing);
existing.exec(catalogSnapshotMigration);
assertCatalogSnapshotShape(existing);
existing.exec(feedCredentialMigration);
assertFeedCredentialShape(existing);

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
  INSERT INTO feed_link_credentials (
    user_id,
    updated_at
  ) VALUES (?, ?)
`).run(
  'user',
  'now'
);

const feedCredentialDefaults =
  existing.prepare(`
    SELECT
      signed_generation,
      signed_enabled
    FROM feed_link_credentials
    WHERE user_id = ?
  `).get(
    'user'
  );

assert.deepEqual(
  [
    Number(
      feedCredentialDefaults
        .signed_generation
    ),
    Number(
      feedCredentialDefaults
        .signed_enabled
    )
  ],
  [
    0,
    1
  ],
  'feed credential defaults must preserve generation-zero signed URLs'
);
existing.prepare(`
  INSERT INTO max_battle_cost_overrides (
    user_id, opportunity_key, pokemon_name, battle_variant,
    start_date, end_date, max_battle_tier, max_particle_cost, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'user',
  'dynamax moltres|dynamax|2026-09-21|2026-09-27',
  'Dynamax Moltres',
  'dynamax',
  '2026-09-21',
  '2026-09-27',
  5,
  800,
  'now'
);
existing.prepare(`
  INSERT INTO remote_raid_daily_budget_overrides (
    user_id, local_date, budget_override, updated_at
  ) VALUES (?, ?, ?, ?)
`).run('user', '2026-09-18', 7, 'now');

existing.exec(migration);
existing.exec(maxCostMigration);
existing.exec(feedCredentialMigration);
const preservedFeedCredential =
  existing.prepare(`
    SELECT
      signed_generation,
      signed_enabled
    FROM feed_link_credentials
    WHERE user_id = ?
  `).get(
    'user'
  );

assert.deepEqual(
  [
    Number(
      preservedFeedCredential
        .signed_generation
    ),
    Number(
      preservedFeedCredential
        .signed_enabled
    )
  ],
  [
    0,
    1
  ],
  're-running migration 0007 must preserve existing credential state'
);
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
assert.equal(
  existing.prepare(`SELECT COUNT(*) AS count FROM max_battle_cost_overrides WHERE user_id = 'user'`).get().count,
  0,
  'Max Battle cost overrides must cascade when their user is deleted'
);

assert.equal(
  existing.prepare(`
    SELECT COUNT(*) AS count
    FROM feed_link_credentials
    WHERE user_id = 'user'
  `).get().count,
  0,
  'feed credential state must cascade when its user is deleted'
);

existing.prepare(`
  INSERT INTO pokemon_catalog_snapshot (
    id, source_url, generated_at, entry_count, catalog_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`).run(
  'pokemon-go-api-pokedex',
  'https://example.test/pokedex.json',
  '2026-10-06T00:00:00.000Z',
  1,
  '[{"key":"1|base|bulbasaur|bulbasaur"}]',
  '2026-10-06T00:00:00.000Z'
);

existing.exec(catalogSnapshotMigration);

assert.equal(
  existing.prepare(`
    SELECT entry_count AS count
    FROM pokemon_catalog_snapshot
    WHERE id = ?
  `).get(
    'pokemon-go-api-pokedex'
  ).count,
  1,
  're-running migration 0009 must preserve the existing catalog snapshot'
);

const legacyRemoteLimitDb = new DatabaseSync(':memory:');
legacyRemoteLimitDb.exec(`
  CREATE TABLE remote_raid_limit_overrides (
    id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    remote_raid_limit INTEGER NOT NULL,
    source_url TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    is_unlimited INTEGER NOT NULL DEFAULT 0,
    detected_automatically INTEGER NOT NULL DEFAULT 0,
    source_excerpt TEXT,
    detected_at TEXT
  );
  INSERT INTO remote_raid_limit_overrides (
    id, event_name, start_date, end_date, remote_raid_limit, updated_at
  ) VALUES (
    'existing-limit', 'Existing event', '2026-09-01', '2026-09-02', 20, 'now'
  );
`);

legacyRemoteLimitDb.exec(remoteRaidLimitIndexMigration);
legacyRemoteLimitDb.exec(remoteRaidLimitIndexMigration);

assert.ok(
  legacyRemoteLimitDb
    .prepare('PRAGMA index_list(remote_raid_limit_overrides)')
    .all()
    .some(row => row.name === 'idx_remote_raid_limit_dates'),
  'migration 0008 must add the missing Remote Raid limit date index'
);
assert.equal(
  legacyRemoteLimitDb
    .prepare('SELECT COUNT(*) AS count FROM remote_raid_limit_overrides WHERE id = ?')
    .get('existing-limit').count,
  1,
  'migration 0008 must preserve existing Remote Raid limit rows'
);

console.log('schema completeness regression tests passed');
