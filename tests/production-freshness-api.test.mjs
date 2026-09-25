import assert from "node:assert/strict";
import workerApp from "../src/index.js";

let rows = [];
const statements = [];

const env = {
  DB: {
    prepare(sql) {
      statements.push(
        String(sql)
      );

      return {
        async all() {
          return {
            results:
              rows
          };
        }
      };
    }
  }
};

async function requestFreshness() {
  return workerApp.fetch(
    new Request(
      "https://planner.example/api/health/data-freshness",
      {
        method: "GET",
        headers: {
          accept:
            "application/json"
        }
      }
    ),
    env
  );
}

const missingResponse =
  await requestFreshness();

assert.equal(
  missingResponse.status,
  503
);

const missing =
  await missingResponse.json();

assert.equal(
  missing.monitor_ok,
  false
);
assert.equal(
  missing.status,
  "unknown"
);
assert.ok(
  missing.source_count >
    0
);
assert.equal(
  missing.missing_count,
  missing.source_count
);
assert.equal(
  missing.stale_after_hours,
  18
);

const now =
  Date.now();

rows =
  missing.sources.map(
    source => ({
      source_key:
        source.source_key,
      source_group:
        source.source_group,
      source_label:
        source.source_label,
      last_attempt_at:
        new Date(
          now -
          60 * 60 * 1000
        ).toISOString(),
      last_success_at:
        new Date(
          now -
          60 * 60 * 1000
        ).toISOString(),
      last_error: null,
      item_count: 1
    })
  );

const healthyResponse =
  await requestFreshness();

assert.equal(
  healthyResponse.status,
  200
);

const healthy =
  await healthyResponse.json();

assert.equal(
  healthy.monitor_ok,
  true
);
assert.equal(
  healthy.status,
  "healthy"
);
assert.equal(
  healthy.missing_count,
  0
);
assert.equal(
  healthy.stale_count,
  0
);

rows = rows.map(
  (
    row,
    index
  ) =>
    index === 0
      ? {
          ...row,
          last_attempt_at:
            new Date(
              now -
              60 * 60 * 1000
            ).toISOString(),
          last_success_at:
            new Date(
              now -
              7 *
                60 *
                60 *
                1000
            ).toISOString(),
          last_error:
            "synthetic upstream 503"
        }
      : row
);

const degradedResponse =
  await requestFreshness();

assert.equal(
  degradedResponse.status,
  200
);

const degraded =
  await degradedResponse.json();

assert.equal(
  degraded.monitor_ok,
  true
);
assert.equal(
  degraded.status,
  "degraded"
);
assert.equal(
  degraded.degraded_count,
  1
);

const degradedText =
  JSON.stringify(
    degraded
  );

assert.equal(
  degradedText.includes(
    "synthetic upstream 503"
  ),
  false,
  "Public freshness health must not expose raw upstream error text"
);
assert.equal(
  degradedText.includes(
    "source_url"
  ),
  false,
  "Public freshness health must not expose source URLs"
);

rows = rows.map(
  (
    row,
    index
  ) =>
    index === 0
      ? {
          ...row,
          last_success_at:
            new Date(
              now -
              19 *
                60 *
                60 *
                1000
            ).toISOString()
        }
      : row
);

const staleResponse =
  await requestFreshness();

assert.equal(
  staleResponse.status,
  503
);

const stale =
  await staleResponse.json();

assert.equal(
  stale.monitor_ok,
  false
);
assert.equal(
  stale.status,
  "stale"
);
assert.equal(
  stale.stale_count,
  1
);

assert.ok(
  statements.length >=
    4
);
assert.equal(
  statements.every(
    sql =>
      /\bSELECT\b/i.test(
        sql
      ) &&
      !/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(
        sql
      )
  ),
  true,
  "Production freshness endpoint must remain read-only"
);

console.log(
  "production freshness API tests passed"
);
