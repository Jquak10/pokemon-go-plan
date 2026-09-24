import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import workerApp from "../src/index.js";
import {
  PLANNER_BACKUP_FORMAT,
  PLANNER_BACKUP_VERSION,
  normalizePlannerBackup
} from "../src/planner-backup.js";

class D1Statement {
  constructor(
    db,
    sql,
    values = []
  ) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(
      this.db,
      this.sql,
      values
    );
  }

  async first() {
    return this.db
      .prepare(this.sql)
      .get(...this.values) || null;
  }

  async run() {
    const result =
      this.db
        .prepare(this.sql)
        .run(...this.values);

    return {
      meta: {
        changes:
          Number(
            result.changes || 0
          )
      }
    };
  }

  async all() {
    return {
      results:
        this.db
          .prepare(this.sql)
          .all(...this.values)
    };
  }
}

class D1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new D1Statement(
      this.db,
      sql
    );
  }

  async batch(statements) {
    this.db.exec("BEGIN");

    try {
      const results = [];

      for (
        const statement of
        statements
      ) {
        results.push(
          await statement.run()
        );
      }

      this.db.exec("COMMIT");

      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

const schema =
  readFileSync(
    new URL(
      "../schema.sql",
      import.meta.url
    ),
    "utf8"
  );

const sqlite =
  new DatabaseSync(":memory:");

sqlite.exec(schema);

function localDate(
  timeZone
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    )
      .formatToParts(
        new Date()
      )
      .reduce(
        (result, part) => {
          if (
            ["year","month","day"]
              .includes(
                part.type
              )
          ) {
            result[part.type] =
              part.value;
          }
          return result;
        },
        {}
      );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(
  iso,
  days
) {
  const date =
    new Date(
      `${iso}T12:00:00Z`
    );

  date.setUTCDate(
    date.getUTCDate() +
      days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

const today =
  localDate(
    "Asia/Singapore"
  );
const futureDate =
  addDays(
    today,
    7
  );

function sha(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function insertUser(
  id,
  token,
  feedToken,
  overrides = {}
) {
  sqlite.prepare(`
    INSERT INTO users (
      id,
      manage_hash,
      feed_hash,
      timezone,
      included_sources,
      pve_weight,
      pvp_weight,
      collector_weight,
      remote_raid_budget,
      remote_raid_min_score,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sha(token),
    sha(feedToken),
    overrides.timezone ||
      "Asia/Singapore",
    JSON.stringify(
      overrides.included_sources ||
      ["raid_battles","max_battles"]
    ),
    overrides.pve_weight ?? 1.3,
    overrides.pvp_weight ?? 0.4,
    overrides.collector_weight ?? 0.8,
    overrides.remote_raid_budget ?? 4,
    overrides.remote_raid_min_score ?? 72,
    "2026-09-01T00:00:00.000Z",
    "2026-09-24T00:00:00.000Z"
  );
}

const sourceUser =
  "source-user";
const sourceToken =
  "source-management-token";
const sourceFeed =
  "source-feed-token";
const destinationUser =
  "destination-user";
const destinationToken =
  "destination-management-token";
const destinationFeed =
  "destination-feed-token";

insertUser(
  sourceUser,
  sourceToken,
  sourceFeed
);
insertUser(
  destinationUser,
  destinationToken,
  destinationFeed,
  {
    timezone:
      "Europe/Paris",
    included_sources:
      ["event"],
    pve_weight: 0.2,
    pvp_weight: 1.8,
    collector_weight: 0.1,
    remote_raid_budget: null,
    remote_raid_min_score: 10
  }
);

sqlite.prepare(`
  INSERT INTO feed_link_credentials (
    user_id,
    signed_generation,
    signed_enabled,
    updated_at
  )
  VALUES (?, 7, 1, 'destination-credential')
`).run(
  destinationUser
);

sqlite.prepare(`
  INSERT INTO targets (
    id,
    user_id,
    pokemon_name,
    target_type,
    battle_kind,
    target_value,
    current_value,
    expected_progress_per_raid,
    priority,
    completed,
    notes,
    created_at,
    updated_at
  )
  VALUES (
    'source-target',
    ?,
    'Dynamax Gengar',
    'candy',
    'dynamax',
    100,
    15,
    3,
    'high',
    0,
    'Private backup note',
    '2026-09-10T00:00:00.000Z',
    '2026-09-24T00:00:00.000Z'
  )
`).run(
  sourceUser
);

sqlite.prepare(`
  INSERT INTO remote_raid_usage (
    user_id,
    local_date,
    raids_used,
    updated_at
  )
  VALUES (?, '${today}', 1, '2026-09-24T00:00:00.000Z')
`).run(
  sourceUser
);

sqlite.prepare(`
  INSERT INTO remote_raid_daily_budget_overrides (
    user_id,
    local_date,
    budget_override,
    updated_at
  )
  VALUES (?, '${today}', 3, '2026-09-24T00:00:00.000Z')
`).run(
  sourceUser
);

sqlite.prepare(`
  INSERT INTO max_battle_cost_overrides (
    user_id,
    opportunity_key,
    pokemon_name,
    battle_variant,
    start_date,
    end_date,
    max_battle_tier,
    max_particle_cost,
    updated_at
  )
  VALUES (
    ?,
    'gengar-restore-opportunity',
    'Dynamax Gengar',
    'dynamax',
    '${today}',
    '${futureDate}',
    3,
    400,
    '2026-09-24T00:00:00.000Z'
  )
`).run(
  sourceUser
);

sqlite.prepare(`
  INSERT INTO battle_resource_state (
    user_id,
    max_particles_held,
    updated_at
  )
  VALUES (?, 1100, '2026-09-24T00:00:00.000Z')
`).run(
  sourceUser
);

sqlite.prepare(`
  INSERT INTO battle_resource_daily (
    user_id,
    local_date,
    max_particles_collected,
    remote_max_passes_used,
    updated_at
  )
  VALUES (?, '${today}', 800, 0, '2026-09-24T00:00:00.000Z')
`).run(
  sourceUser
);

sqlite.prepare(`
  INSERT INTO raid_log (
    id,
    user_id,
    pokemon_name,
    raid_type,
    raid_count,
    progress_gained,
    target_id,
    target_before_value,
    target_after_value,
    local_date,
    created_at,
    undone_at
  )
  VALUES (
    'source-legacy-log',
    ?,
    'Gengar',
    'local',
    1,
    2,
    'source-target',
    8,
    10,
    '2026-09-20',
    '2026-09-20T10:00:00.000Z',
    '2026-09-21T10:00:00.000Z'
  )
`).run(
  sourceUser
);

sqlite.prepare(`
  INSERT INTO battle_log (
    id,
    legacy_log_id,
    user_id,
    pokemon_name,
    battle_system,
    battle_variant,
    participation,
    battle_count,
    wins,
    max_particle_cost,
    max_particles_spent,
    remote_passes_used,
    progress_gained,
    target_id,
    target_before_value,
    target_after_value,
    local_date,
    created_at,
    undone_at
  )
  VALUES (
    'source-battle-log',
    'source-restore-seed-marker',
    ?,
    'Gengar',
    'raid',
    NULL,
    'remote',
    1,
    1,
    NULL,
    0,
    1,
    5,
    'source-target',
    10,
    15,
    '${today}',
    '2026-09-24T00:00:00.000Z',
    NULL
  )
`).run(
  sourceUser
);

const env = {
  DB:
    new D1Database(
      sqlite
    )
};

function managedRequest(
  path,
  token,
  {
    method = "GET",
    body = null
  } = {}
) {
  const headers = {
    authorization:
      `Bearer ${token}`
  };

  if (body != null) {
    headers["content-type"] =
      "application/json";
  }

  return new Request(
    `https://planner.example${path}`,
    {
      method,
      headers,
      body:
        body == null
          ? undefined
          : JSON.stringify(
              body
            )
    }
  );
}

const exportedResponse =
  await workerApp.fetch(
    managedRequest(
      "/api/planner/backup",
      sourceToken
    ),
    env
  );

assert.equal(
  exportedResponse.status,
  200
);
assert.match(
  exportedResponse.headers.get(
    "content-disposition"
  ) || "",
  /pokemon-go-planner-backup-\d{4}-\d{2}-\d{2}\.json/
);

const backup =
  await exportedResponse.json();

assert.equal(
  backup.format,
  PLANNER_BACKUP_FORMAT
);
assert.equal(
  backup.version,
  PLANNER_BACKUP_VERSION
);
assert.equal(
  backup.planner.timezone,
  "Asia/Singapore"
);
assert.equal(
  backup.data.targets.length,
  1
);
assert.equal(
  backup.data.battle_log.length,
  1
);
assert.equal(
  backup.data.raid_log.length,
  1
);
assert.equal(
  backup.data.targets[0].notes,
  "Private backup note"
);

const serializedBackup =
  JSON.stringify(
    backup
  );

for (
  const secret of [
    sourceToken,
    sourceFeed,
    sha(sourceToken),
    sha(sourceFeed)
  ]
) {
  assert.equal(
    serializedBackup.includes(
      secret
    ),
    false,
    "Backup must not contain management/calendar credentials or hashes"
  );
}

assert.doesNotMatch(
  serializedBackup,
  /management_url|calendar_url|manage_hash|feed_hash|signed_generation|signed_enabled/
);

assert.doesNotThrow(
  () =>
    normalizePlannerBackup(
      backup
    )
);

const wrongConfirmation =
  await workerApp.fetch(
    managedRequest(
      "/api/planner/restore",
      destinationToken,
      {
        method: "POST",
        body: {
          confirmation:
            "restore",
          backup
        }
      }
    ),
    env
  );

assert.equal(
  wrongConfirmation.status,
  400
);

const destinationManageHashBefore =
  sqlite.prepare(
    "SELECT manage_hash FROM users WHERE id = ?"
  ).get(
    destinationUser
  ).manage_hash;

const destinationFeedHashBefore =
  sqlite.prepare(
    "SELECT feed_hash FROM users WHERE id = ?"
  ).get(
    destinationUser
  ).feed_hash;

const restoredResponse =
  await workerApp.fetch(
    managedRequest(
      "/api/planner/restore",
      destinationToken,
      {
        method: "POST",
        body: {
          confirmation:
            "RESTORE",
          backup
        }
      }
    ),
    env
  );

assert.equal(
  restoredResponse.status,
  200,
  JSON.stringify(
    await restoredResponse
      .clone()
      .json()
  )
);

const restoredResult =
  await restoredResponse.json();

assert.deepEqual(
  restoredResult,
  {
    ok: true,
    restored: true,
    target_count: 1,
    battle_log_count: 1,
    legacy_raid_log_count: 1,
    note:
      "Planner backup restored. This destination planner keeps its current management and calendar credentials."
  }
);

const destinationUserRow =
  sqlite.prepare(
    "SELECT * FROM users WHERE id = ?"
  ).get(
    destinationUser
  );

assert.equal(
  destinationUserRow.timezone,
  "Asia/Singapore"
);
assert.equal(
  destinationUserRow.pve_weight,
  1.3
);
assert.equal(
  destinationUserRow.pvp_weight,
  0.4
);
assert.equal(
  destinationUserRow.collector_weight,
  0.8
);
assert.equal(
  destinationUserRow.remote_raid_budget,
  4
);
assert.equal(
  destinationUserRow.remote_raid_min_score,
  72
);
assert.equal(
  destinationUserRow.manage_hash,
  destinationManageHashBefore,
  "Restore must preserve the destination management capability"
);
assert.equal(
  destinationUserRow.feed_hash,
  destinationFeedHashBefore,
  "Restore must preserve the destination legacy calendar capability"
);

const destinationFeedCredential =
  sqlite.prepare(
    "SELECT * FROM feed_link_credentials WHERE user_id = ?"
  ).get(
    destinationUser
  );

assert.equal(
  destinationFeedCredential.signed_generation,
  7,
  "Restore must preserve the destination signed-calendar generation"
);
assert.equal(
  destinationFeedCredential.signed_enabled,
  1
);

const restoredTarget =
  sqlite.prepare(
    "SELECT * FROM targets WHERE user_id = ?"
  ).get(
    destinationUser
  );

assert.ok(
  restoredTarget
);
assert.notEqual(
  restoredTarget.id,
  "source-target",
  "Target IDs must be remapped so source and restored planners can coexist"
);
assert.equal(
  restoredTarget.current_value,
  15
);
assert.equal(
  restoredTarget.notes,
  "Private backup note"
);

const restoredBattleLog =
  sqlite.prepare(
    "SELECT * FROM battle_log WHERE user_id = ?"
  ).get(
    destinationUser
  );

assert.ok(
  restoredBattleLog
);
assert.notEqual(
  restoredBattleLog.id,
  "source-battle-log"
);
assert.equal(
  restoredBattleLog.target_id,
  restoredTarget.id
);
assert.ok(
  restoredBattleLog.legacy_log_id,
  "Restored current-state history must bypass replay triggers during import"
);
assert.equal(
  restoredBattleLog.undone_at,
  null
);

assert.equal(
  sqlite.prepare(
    `SELECT raids_used FROM remote_raid_usage WHERE user_id = ? AND local_date = '${today}'`
  ).get(
    destinationUser
  ).raids_used,
  1,
  "Restore must not replay the battle-log trigger and double-count Remote usage"
);

assert.equal(
  sqlite.prepare(
    "SELECT max_particles_held FROM battle_resource_state WHERE user_id = ?"
  ).get(
    destinationUser
  ).max_particles_held,
  1100
);

const restoredLegacy =
  sqlite.prepare(
    "SELECT * FROM raid_log WHERE user_id = ?"
  ).get(
    destinationUser
  );

assert.ok(
  restoredLegacy
);
assert.notEqual(
  restoredLegacy.id,
  "source-legacy-log"
);
assert.equal(
  restoredLegacy.target_id,
  restoredTarget.id
);

const sourceStillExists =
  sqlite.prepare(
    "SELECT COUNT(*) AS count FROM targets WHERE user_id = ?"
  ).get(
    sourceUser
  ).count;

assert.equal(
  sourceStillExists,
  1,
  "Restoring into another planner must not modify the source planner"
);

const secondRestore =
  await workerApp.fetch(
    managedRequest(
      "/api/planner/restore",
      destinationToken,
      {
        method: "POST",
        body: {
          confirmation:
            "RESTORE",
          backup
        }
      }
    ),
    env
  );

assert.equal(
  secondRestore.status,
  409
);
assert.match(
  (await secondRestore.json()).error,
  /empty planner/i
);

// The restored active battle log must remain reversible. If import had replayed
// its trigger, these values would be doubled before Undo.
const undo =
  await workerApp.fetch(
    managedRequest(
      "/api/battle-log/undo",
      destinationToken,
      {
        method: "POST",
        body: {
          log_id:
            restoredBattleLog.id,
          log_source:
            "battle"
        }
      }
    ),
    env
  );

assert.equal(
  undo.status,
  200
);

assert.equal(
  sqlite.prepare(
    "SELECT current_value FROM targets WHERE id = ?"
  ).get(
    restoredTarget.id
  ).current_value,
  10,
  "Undo after restore must reverse exactly the historical target delta"
);

assert.equal(
  sqlite.prepare(
    `SELECT raids_used FROM remote_raid_usage WHERE user_id = ? AND local_date = '${today}'`
  ).get(
    destinationUser
  ).raids_used,
  0,
  "Undo after restore must reverse exactly the historical Remote usage delta"
);

const invalidBackup =
  structuredClone(
    backup
  );

invalidBackup.format =
  "not-a-planner-backup";

const invalidResponse =
  await workerApp.fetch(
    managedRequest(
      "/api/planner/restore",
      "not-a-valid-token",
      {
        method: "POST",
        body: {
          confirmation:
            "RESTORE",
          backup:
            invalidBackup
        }
      }
    ),
    env
  );

assert.equal(
  invalidResponse.status,
  401,
  "Authentication must happen before backup validation details are exposed"
);

sqlite.close();

console.log(
  "planner backup export/restore tests passed"
);
