import assert from "node:assert/strict";
import {
  PRODUCTION_FRESHNESS_STALE_AFTER_MS,
  evaluateProductionFreshness,
  summarizeSyncHealth
} from "../src/sync-health.js";

const expected = [
  {
    source_key: "event:raid_battles",
    source_label: "Raid Battles"
  },
  {
    source_key: "event:max_battles",
    source_label: "Max Battles"
  }
];

assert.deepEqual(
  summarizeSyncHealth(
    [
      {
        source_key:
          "event:raid_battles",
        source_label:
          "Raid Battles",
        last_attempt_at:
          "2026-09-21T00:00:00.000Z",
        last_success_at:
          "2026-09-21T00:00:00.000Z",
        last_error: null,
        item_count: 12
      },
      {
        source_key:
          "event:max_battles",
        source_label:
          "Max Battles",
        last_attempt_at:
          "2026-09-21T00:00:00.000Z",
        last_success_at:
          "2026-09-20T18:00:00.000Z",
        last_error:
          "upstream returned 503",
        item_count: 4
      }
    ],
    expected
  ),
  {
    status: "degraded",
    updated_at:
      "2026-09-20T18:00:00.000Z",
    source_count: 2,
    degraded_count: 1,
    missing_count: 0,
    degraded_sources: [
      {
        source_key:
          "event:max_battles",
        source_label:
          "Max Battles",
        source_url: null,
        last_attempt_at:
          "2026-09-21T00:00:00.000Z",
        last_success_at:
          "2026-09-20T18:00:00.000Z",
        last_error:
          "upstream returned 503",
        item_count: 4
      }
    ],
    missing_sources: [],
    sources: [
      {
        source_key:
          "event:raid_battles",
        source_label:
          "Raid Battles",
        source_url: null,
        last_attempt_at:
          "2026-09-21T00:00:00.000Z",
        last_success_at:
          "2026-09-21T00:00:00.000Z",
        last_error: null,
        item_count: 12
      },
      {
        source_key:
          "event:max_battles",
        source_label:
          "Max Battles",
        source_url: null,
        last_attempt_at:
          "2026-09-21T00:00:00.000Z",
        last_success_at:
          "2026-09-20T18:00:00.000Z",
        last_error:
          "upstream returned 503",
        item_count: 4
      }
    ]
  }
);

const unknown =
  summarizeSyncHealth(
    [
      {
        source_key:
          "event:raid_battles",
        source_label:
          "Raid Battles",
        last_attempt_at:
          "2026-09-21T00:00:00.000Z",
        last_success_at:
          "2026-09-21T00:00:00.000Z",
        last_error: null,
        item_count: 12
      }
    ],
    expected,
    "2026-09-19T00:00:00.000Z"
  );

assert.equal(
  unknown.status,
  "unknown"
);
assert.equal(
  unknown.missing_count,
  1
);
assert.deepEqual(
  unknown.missing_sources,
  [
    {
      source_key:
        "event:max_battles",
      source_label:
        "Max Battles"
    }
  ]
);
assert.equal(
  unknown.updated_at,
  "2026-09-21T00:00:00.000Z"
);

const empty =
  summarizeSyncHealth(
    [],
    expected,
    "2026-09-19T00:00:00.000Z"
  );

assert.equal(
  empty.status,
  "unknown"
);
assert.equal(
  empty.updated_at,
  "2026-09-19T00:00:00.000Z"
);
assert.equal(
  empty.missing_count,
  2
);

assert.deepEqual(
  summarizeSyncHealth(
    [],
    [],
    "2026-09-19T00:00:00.000Z"
  ),
  {
    status: "not_applicable",
    updated_at: null,
    source_count: 0,
    degraded_count: 0,
    missing_count: 0,
    degraded_sources: [],
    missing_sources: [],
    sources: []
  }
);



const productionExpected = [
  {
    source_key:
      "event:raid_battles",
    source_group:
      "event",
    source_label:
      "Raid Battles"
  },
  {
    source_key:
      "official:pokemon-go-schedules",
    source_group:
      "official",
    source_label:
      "Official Pokémon GO schedules"
  },
  {
    source_key:
      "meta:pokemon-go-api-pokedex",
    source_group:
      "meta",
    source_label:
      "Pokémon GO API Pokédex"
  }
];

const freshnessNow =
  new Date(
    "2026-09-25T00:00:00.000Z"
  );

function healthRow(
  source,
  {
    successHoursAgo = 1,
    attemptHoursAgo = 1,
    error = null
  } = {}
) {
  return {
    ...source,
    last_success_at:
      new Date(
        freshnessNow.getTime() -
        successHoursAgo *
          60 *
          60 *
          1000
      ).toISOString(),
    last_attempt_at:
      new Date(
        freshnessNow.getTime() -
        attemptHoursAgo *
          60 *
          60 *
          1000
      ).toISOString(),
    last_error:
      error,
    item_count: 1
  };
}

const healthyProduction =
  evaluateProductionFreshness(
    productionExpected.map(
      source =>
        healthRow(
          source
        )
    ),
    productionExpected,
    {
      now:
        freshnessNow
    }
  );

assert.equal(
  healthyProduction.monitor_ok,
  true
);
assert.equal(
  healthyProduction.status,
  "healthy"
);
assert.equal(
  healthyProduction.stale_after_hours,
  18
);
assert.equal(
  healthyProduction.source_count,
  3
);

const transientProduction =
  evaluateProductionFreshness(
    productionExpected.map(
      source =>
        source.source_group ===
          "official"
          ? healthRow(
              source,
              {
                successHoursAgo:
                  7,
                attemptHoursAgo:
                  1,
                error:
                  "upstream 503"
              }
            )
          : healthRow(
              source
            )
    ),
    productionExpected,
    {
      now:
        freshnessNow
    }
  );

assert.equal(
  transientProduction.monitor_ok,
  true
);
assert.equal(
  transientProduction.status,
  "degraded"
);
assert.equal(
  transientProduction.degraded_count,
  1
);
assert.equal(
  transientProduction.groups
    .official.status,
  "degraded"
);

const staleProduction =
  evaluateProductionFreshness(
    productionExpected.map(
      source =>
        source.source_group ===
          "meta"
          ? healthRow(
              source,
              {
                successHoursAgo:
                  18,
                attemptHoursAgo:
                  6,
                error:
                  "second failed cycle"
              }
            )
          : healthRow(
              source
            )
    ),
    productionExpected,
    {
      now:
        freshnessNow
    }
  );

assert.equal(
  staleProduction.monitor_ok,
  false
);
assert.equal(
  staleProduction.status,
  "stale"
);
assert.equal(
  staleProduction.stale_count,
  1
);
assert.equal(
  staleProduction.groups
    .meta.status,
  "stale"
);
assert.deepEqual(
  staleProduction.groups
    .meta.stale_sources
    .map(
      source =>
        source.source_key
    ),
  [
    "meta:pokemon-go-api-pokedex"
  ]
);

const missingProduction =
  evaluateProductionFreshness(
    [
      healthRow(
        productionExpected[0]
      ),
      healthRow(
        productionExpected[1]
      )
    ],
    productionExpected,
    {
      now:
        freshnessNow
    }
  );

assert.equal(
  missingProduction.monitor_ok,
  false
);
assert.equal(
  missingProduction.status,
  "unknown"
);
assert.equal(
  missingProduction.missing_count,
  1
);
assert.equal(
  missingProduction.groups
    .meta.status,
  "unknown"
);

assert.equal(
  PRODUCTION_FRESHNESS_STALE_AFTER_MS,
  18 * 60 * 60 * 1000
);

console.log(
  "sync health tests passed"
);
