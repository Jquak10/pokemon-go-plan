import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import workerApp from "../src/index.js";

class D1Statement {
  constructor(db, sql, values = []) {
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
          Number(result.changes || 0)
      }
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

const userId =
  "11111111-2222-4333-8444-555555555555";
const manageToken =
  "planner-delete-test-token";
const manageHash =
  createHash("sha256")
    .update(manageToken)
    .digest("hex");
const feedHash =
  createHash("sha256")
    .update("planner-delete-feed-token")
    .digest("hex");

sqlite.prepare(`
  INSERT INTO users (
    id,
    manage_hash,
    feed_hash,
    timezone,
    included_sources,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  userId,
  manageHash,
  feedHash,
  "Asia/Singapore",
  "[]",
  "2026-09-24T00:00:00.000Z",
  "2026-09-24T00:00:00.000Z"
);

sqlite.prepare(`
  INSERT INTO feed_link_credentials (
    user_id,
    updated_at
  ) VALUES (?, ?)
`).run(
  userId,
  "2026-09-24T00:00:00.000Z"
);

sqlite.prepare(`
  INSERT INTO targets (
    id,
    user_id,
    pokemon_name,
    target_type,
    battle_kind,
    current_value,
    priority,
    completed,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "target-delete-test",
  userId,
  "Mewtwo",
  "raids",
  "raid",
  1,
  "high",
  0,
  "2026-09-24T00:00:00.000Z",
  "2026-09-24T00:00:00.000Z"
);

sqlite.prepare(`
  INSERT INTO remote_raid_usage (
    user_id,
    local_date,
    raids_used,
    updated_at
  ) VALUES (?, ?, ?, ?)
`).run(
  userId,
  "2026-09-24",
  1,
  "2026-09-24T00:00:00.000Z"
);

sqlite.prepare(`
  INSERT INTO remote_raid_daily_budget_overrides (
    user_id,
    local_date,
    budget_override,
    updated_at
  ) VALUES (?, ?, ?, ?)
`).run(
  userId,
  "2026-09-24",
  2,
  "2026-09-24T00:00:00.000Z"
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
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  userId,
  "dynamax beldum|dynamax|2026-09-24|2026-09-24",
  "Dynamax Beldum",
  "dynamax",
  "2026-09-24",
  "2026-09-24",
  3,
  400,
  "2026-09-24T00:00:00.000Z"
);

sqlite.prepare(`
  INSERT INTO battle_resource_state (
    user_id,
    max_particles_held,
    updated_at
  ) VALUES (?, ?, ?)
`).run(
  userId,
  800,
  "2026-09-24T00:00:00.000Z"
);

sqlite.prepare(`
  INSERT INTO battle_resource_daily (
    user_id,
    local_date,
    max_particles_collected,
    remote_max_passes_used,
    updated_at
  ) VALUES (?, ?, ?, ?, ?)
`).run(
  userId,
  "2026-09-24",
  800,
  0,
  "2026-09-24T00:00:00.000Z"
);

sqlite.prepare(`
  INSERT INTO raid_log (
    id,
    user_id,
    pokemon_name,
    raid_type,
    raid_count,
    local_date,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "legacy-delete-test",
  userId,
  "Mewtwo",
  "local",
  1,
  "2026-09-24",
  "2026-09-24T00:00:00.000Z"
);

sqlite.prepare(`
  INSERT INTO battle_log (
    id,
    user_id,
    pokemon_name,
    battle_system,
    participation,
    battle_count,
    wins,
    remote_passes_used,
    local_date,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "battle-delete-test",
  userId,
  "Mewtwo",
  "raid",
  "local",
  1,
  1,
  0,
  "2026-09-24",
  "2026-09-24T00:00:00.000Z"
);

const env = {
  DB:
    new D1Database(
      sqlite
    )
};

function deleteRequest(
  confirmation
) {
  return new Request(
    "https://planner.example/api/planner",
    {
      method: "DELETE",
      headers: {
        authorization:
          `Bearer ${manageToken}`,
        "content-type":
          "application/json"
      },
      body:
        JSON.stringify({
          confirmation
        })
    }
  );
}

const rejected =
  await workerApp.fetch(
    deleteRequest("delete"),
    env
  );

assert.equal(
  rejected.status,
  400
);
assert.deepEqual(
  await rejected.json(),
  {
    error:
      "Type DELETE to confirm permanent planner deletion."
  }
);
assert.equal(
  sqlite.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE id = ?"
  ).get(
    userId
  ).count,
  1,
  "An incorrect confirmation must not delete the planner"
);

const deleted =
  await workerApp.fetch(
    deleteRequest("DELETE"),
    env
  );

assert.equal(
  deleted.status,
  200
);
assert.deepEqual(
  await deleted.json(),
  {
    ok: true,
    deleted: true,
    note:
      "Planner deleted permanently. Its management and calendar links are no longer valid."
  }
);

const plannerOwnedTables = [
  "users",
  "feed_link_credentials",
  "targets",
  "remote_raid_usage",
  "remote_raid_daily_budget_overrides",
  "max_battle_cost_overrides",
  "battle_resource_state",
  "battle_resource_daily",
  "raid_log",
  "battle_log"
];

for (
  const table of
  plannerOwnedTables
) {
  const row =
    sqlite.prepare(
      `SELECT COUNT(*) AS count FROM ${table}`
    ).get();

  assert.equal(
    Number(row.count),
    0,
    `${table} must be empty after parent planner deletion`
  );
}

const oldCredential =
  await workerApp.fetch(
    deleteRequest("DELETE"),
    env
  );

assert.equal(
  oldCredential.status,
  401,
  "The deleted management capability must stop authorizing immediately"
);

console.log(
  "planner deletion tests passed"
);
