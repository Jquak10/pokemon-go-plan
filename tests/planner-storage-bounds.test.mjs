import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  maxBattleCostOverrideKey,
  updateMaxBattleCostOverrideApi,
  updateRemoteRaidBudgetOverride,
  upsertTarget
} from "../src/index.js";
import {
  createBattleLog,
  normalizeBattleLog
} from "../src/battle-logging.js";
import {
  PLANNER_STORAGE_LIMITS,
  battleLogDailyLimitMessage,
  battleLogTotalLimitMessage,
  maxBattleOverrideLimitMessage,
  targetNotesLimitMessage,
  targetStorageLimitMessage
} from "../src/planner-storage-limits.js";

const read = path =>
  readFileSync(
    new URL(path, import.meta.url),
    "utf8"
  );

const sql =
  new DatabaseSync(":memory:");

sql.exec(read("../schema.sql"));

function tokenHash(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function addUser(id, token) {
  sql.prepare(`
    INSERT INTO users (
      id,
      manage_hash,
      feed_hash,
      timezone,
      included_sources,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'Asia/Singapore', '[]', 'now', 'now')
  `).run(
    id,
    tokenHash(token),
    `feed-${id}`
  );
}

addUser("targets-user", "targets-token");
addUser("daily-user", "daily-token");
addUser("total-user", "total-token");
addUser("override-user", "override-token");
addUser("budget-user", "budget-token");

const db = {
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        results.push(
          await statement.run()
        );
      }
      sql.exec("COMMIT");
      return results;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  },
  prepare(query) {
    let args = [];
    return {
      bind(...values) {
        args = values;
        return this;
      },
      async run() {
        const result =
          sql.prepare(query)
            .run(...args);
        return {
          meta: {
            changes:
              Number(
                result.changes
              )
          }
        };
      },
      async first() {
        return (
          sql.prepare(query)
            .get(...args) ||
          null
        );
      },
      async all() {
        return {
          results:
            sql.prepare(query)
              .all(...args)
        };
      }
    };
  }
};

const env = {
  DB: db
};

const post = (
  path,
  token,
  body
) =>
  new Request(
    `http://localhost${path}`,
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json"
      },
      body: JSON.stringify({
        token,
        ...body
      })
    }
  );

function singaporeDate(
  date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    )
      .formatToParts(date)
      .reduce(
        (result, part) => {
          if (
            [
              "year",
              "month",
              "day"
            ].includes(
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

  return [
    parts.year,
    parts.month,
    parts.day
  ].join("-");
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

assert.deepEqual(
  PLANNER_STORAGE_LIMITS,
  {
    targets: 250,
    target_notes_characters:
      2000,
    battle_logs_per_local_day:
      200,
    battle_logs_total: 20000,
    max_battle_cost_overrides:
      250
  }
);

// Targets are bounded, edits still work at capacity, and the SQL guard permits
// a new target immediately after capacity is freed.
{
  const insert =
    sql.prepare(`
      INSERT INTO targets (
        id,
        user_id,
        pokemon_name,
        target_type,
        battle_kind,
        current_value,
        priority,
        completed,
        notes,
        created_at,
        updated_at
      )
      VALUES (?, 'targets-user', ?, 'candy', 'raid', 0, 'medium', 0, '', 'now', 'now')
    `);

  sql.exec("BEGIN");
  for (
    let index = 0;
    index <
      PLANNER_STORAGE_LIMITS.targets;
    index += 1
  ) {
    insert.run(
      `target-${index}`,
      `Seed Pokémon ${index}`
    );
  }
  sql.exec("COMMIT");

  const blocked =
    await upsertTarget(
      post(
        "/api/targets",
        "targets-token",
        {
          pokemon_name:
            "Gengar",
          battle_kind:
            "raid",
          target_type:
            "candy",
          target_value: 100,
          current_value: 0
        }
      ),
      env
    );

  assert.equal(
    blocked.status,
    409
  );
  assert.equal(
    (await blocked.json()).error,
    targetStorageLimitMessage()
  );

  const edited =
    await upsertTarget(
      post(
        "/api/targets",
        "targets-token",
        {
          id: "target-0",
          pokemon_name:
            "Gengar",
          battle_kind:
            "raid",
          target_type:
            "candy",
          target_value: 100,
          current_value: 7,
          notes: "keep"
        }
      ),
      env
    );

  assert.equal(
    edited.status,
    200,
    "Editing an existing target must remain possible at capacity"
  );

  const oversizedNotes =
    await upsertTarget(
      post(
        "/api/targets",
        "targets-token",
        {
          id: "target-1",
          pokemon_name:
            "Machop",
          battle_kind:
            "raid",
          target_type:
            "candy",
          target_value: 100,
          current_value: 1,
          notes:
            "x".repeat(
              PLANNER_STORAGE_LIMITS.target_notes_characters +
                1
            )
        }
      ),
      env
    );

  assert.equal(
    oversizedNotes.status,
    400
  );
  assert.equal(
    (await oversizedNotes.json()).error,
    targetNotesLimitMessage()
  );

  sql.prepare(
    "DELETE FROM targets WHERE id = 'target-2'"
  ).run();

  const afterDelete =
    await upsertTarget(
      post(
        "/api/targets",
        "targets-token",
        {
          pokemon_name:
            "Pikachu",
          battle_kind:
            "raid",
          target_type:
            "candy",
          target_value: 100,
          current_value: 0
        }
      ),
      env
    );

  assert.equal(
    afterDelete.status,
    200
  );
  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS n FROM targets WHERE user_id = 'targets-user'"
    ).get().n,
    PLANNER_STORAGE_LIMITS.targets
  );
}

// Battle log bounds are applied to rows, not battle_count. Idempotent retries
// still return the original row even when the planner is already at capacity.
const baseLogInput =
  normalizeBattleLog(
    {
      pokemon_name:
        "Gengar",
      participation:
        "local",
      battle_count: 99,
      update_target: false
    },
    []
  );

const seedBattleRows = (
  userId,
  rows,
  localDate,
  prefix
) => {
  const insert =
    sql.prepare(`
      INSERT INTO battle_log (
        id,
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
        local_date,
        created_at
      )
      VALUES (?, ?, 'Gengar', 'raid', NULL, 'local', 99, 99, NULL, 0, 0, 0, NULL, ?, 'now')
    `);

  sql.exec("BEGIN");
  for (
    let index = 0;
    index < rows;
    index += 1
  ) {
    insert.run(
      `${prefix}-${index}`,
      userId,
      localDate
    );
  }
  sql.exec("COMMIT");
};

{
  const day =
    "2026-09-24";

  seedBattleRows(
    "daily-user",
    PLANNER_STORAGE_LIMITS
      .battle_logs_per_local_day,
    day,
    "daily"
  );

  await assert.rejects(
    () =>
      createBattleLog(
        db,
        "daily-user",
        day,
        "later",
        "daily-new",
        baseLogInput
      ),
    error =>
      error?.status === 409 &&
      error?.message ===
        battleLogDailyLimitMessage()
  );

  const retry =
    await createBattleLog(
      db,
      "daily-user",
      day,
      "later",
      "daily-0",
      baseLogInput
    );

  assert.equal(
    retry.id,
    "daily-0",
    "Idempotent retries must not be blocked by the daily storage bound"
  );
}

{
  const day =
    "2026-09-24";

  const insertMany = `
    WITH RECURSIVE
      a(x) AS (
        VALUES(0)
        UNION ALL
        SELECT x + 1
        FROM a
        WHERE x < 199
      ),
      b(y) AS (
        VALUES(0)
        UNION ALL
        SELECT y + 1
        FROM b
        WHERE y < 99
      )
    INSERT INTO battle_log (
      id,
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
      local_date,
      created_at
    )
    SELECT
      printf('total-%03d-%03d', x, y),
      'total-user',
      'Gengar',
      'raid',
      NULL,
      'local',
      1,
      1,
      NULL,
      0,
      0,
      0,
      NULL,
      '2026-01-01',
      'now'
    FROM a
    CROSS JOIN b
  `;

  sql.exec(insertMany);

  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS n FROM battle_log WHERE user_id = 'total-user'"
    ).get().n,
    PLANNER_STORAGE_LIMITS.battle_logs_total
  );

  await assert.rejects(
    () =>
      createBattleLog(
        db,
        "total-user",
        day,
        "later",
        "total-new",
        {
          ...baseLogInput,
          battle_count: 1,
          wins: 1
        }
      ),
    error =>
      error?.status === 409 &&
      error?.message ===
        battleLogTotalLimitMessage()
  );
}

// Max tier overrides prune expired rows, allow updates at capacity, and refuse
// unbounded active/future growth.
{
  const today =
    singaporeDate();
  const yesterday =
    addDays(
      today,
      -1
    );
  const tomorrow =
    addDays(
      today,
      1
    );

  const insert =
    sql.prepare(`
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
      VALUES ('override-user', ?, ?, 'dynamax', ?, ?, 1, 250, 'now')
    `);

  sql.exec("BEGIN");
  insert.run(
    "expired",
    "Dynamax Old",
    yesterday,
    yesterday
  );

  for (
    let index = 0;
    index <
      PLANNER_STORAGE_LIMITS.max_battle_cost_overrides -
        1;
    index += 1
  ) {
    insert.run(
      `active-${index}`,
      `Dynamax Seed ${index}`,
      today,
      tomorrow
    );
  }
  sql.exec("COMMIT");

  const pokemon =
    "Dynamax Rhyhorn";
  const key =
    maxBattleCostOverrideKey({
      pokemon_name:
        pokemon,
      battle_variant:
        "dynamax",
      start_date:
        today,
      end_date:
        tomorrow
    });

  const saved =
    await updateMaxBattleCostOverrideApi(
      post(
        "/api/max-battle-cost-override",
        "override-token",
        {
          opportunity_key:
            key,
          pokemon_name:
            pokemon,
          battle_variant:
            "dynamax",
          start_date:
            today,
          end_date:
            tomorrow,
          max_battle_tier: 1
        }
      ),
      env
    );

  assert.equal(
    saved.status,
    200,
    "An expired row should be pruned before capacity is evaluated"
  );
  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS n FROM max_battle_cost_overrides WHERE user_id = 'override-user'"
    ).get().n,
    PLANNER_STORAGE_LIMITS.max_battle_cost_overrides
  );
  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS n FROM max_battle_cost_overrides WHERE user_id = 'override-user' AND opportunity_key = 'expired'"
    ).get().n,
    0
  );

  const secondPokemon =
    "Dynamax Machop";
  const secondKey =
    maxBattleCostOverrideKey({
      pokemon_name:
        secondPokemon,
      battle_variant:
        "dynamax",
      start_date:
        today,
      end_date:
        tomorrow
    });

  const blocked =
    await updateMaxBattleCostOverrideApi(
      post(
        "/api/max-battle-cost-override",
        "override-token",
        {
          opportunity_key:
            secondKey,
          pokemon_name:
            secondPokemon,
          battle_variant:
            "dynamax",
          start_date:
            today,
          end_date:
            tomorrow,
          max_battle_tier: 1
        }
      ),
      env
    );

  assert.equal(
    blocked.status,
    409
  );
  assert.equal(
    (await blocked.json()).error,
    maxBattleOverrideLimitMessage()
  );

  const updated =
    await updateMaxBattleCostOverrideApi(
      post(
        "/api/max-battle-cost-override",
        "override-token",
        {
          opportunity_key:
            key,
          pokemon_name:
            pokemon,
          battle_variant:
            "dynamax",
          start_date:
            today,
          end_date:
            tomorrow,
          max_battle_tier: 3
        }
      ),
      env
    );

  assert.equal(
    updated.status,
    200,
    "Updating an existing override must remain possible at capacity"
  );
}

// Today's budget override is the only row the product reads. Direct callers
// cannot manufacture arbitrary dated rows, and a valid save cleans obsolete
// legacy/direct-API rows.
{
  const today =
    singaporeDate();
  const yesterday =
    addDays(
      today,
      -1
    );
  const tomorrow =
    addDays(
      today,
      1
    );

  sql.prepare(`
    INSERT INTO remote_raid_daily_budget_overrides (
      user_id,
      local_date,
      budget_override,
      updated_at
    )
    VALUES
      ('budget-user', ?, 3, 'old'),
      ('budget-user', ?, 4, 'old')
  `).run(
    yesterday,
    tomorrow
  );

  const rejected =
    await updateRemoteRaidBudgetOverride(
      post(
        "/api/remote-raid-budget-override",
        "budget-token",
        {
          local_date:
            tomorrow,
          budget_override: 5
        }
      ),
      env
    );

  assert.equal(
    rejected.status,
    400
  );

  const saved =
    await updateRemoteRaidBudgetOverride(
      post(
        "/api/remote-raid-budget-override",
        "budget-token",
        {
          local_date:
            today,
          budget_override: 6
        }
      ),
      env
    );

  assert.equal(
    saved.status,
    200
  );

  const rows =
    sql.prepare(`
      SELECT local_date, budget_override
      FROM remote_raid_daily_budget_overrides
      WHERE user_id = 'budget-user'
    `).all();

  assert.deepEqual(
    rows,
    [{
      local_date:
        today,
      budget_override: 6
    }]
  );

  const cleared =
    await updateRemoteRaidBudgetOverride(
      post(
        "/api/remote-raid-budget-override",
        "budget-token",
        {
          local_date:
            today,
          budget_override: ""
        }
      ),
      env
    );

  assert.equal(
    cleared.status,
    200
  );
  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS n FROM remote_raid_daily_budget_overrides WHERE user_id = 'budget-user'"
    ).get().n,
    0
  );
}

sql.close();

console.log(
  "planner storage bounds tests passed"
);
