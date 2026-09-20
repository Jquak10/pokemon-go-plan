import assert from "node:assert/strict";
import {
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

console.log(
  "sync health tests passed"
);
