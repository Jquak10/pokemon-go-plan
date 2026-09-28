import assert from "node:assert/strict";
import {
  REQUIRED_SCHEMA,
  hashSchemaComponentIdentifiers,
  requiredSchemaComponentIdentifiers
} from "../src/schema-health.js";
import {
  BL054_BOOTSTRAP_SCHEMA_FINGERPRINT,
  checkProductionSchemaRelease
} from "./candidate-schema-gate.mjs";

function jsonResponse(body, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8"
      }
    }
  );
}

const requiredIdentifiers =
  requiredSchemaComponentIdentifiers(
    REQUIRED_SCHEMA
  );
const requiredHashes =
  await hashSchemaComponentIdentifiers(
    requiredIdentifiers
  );
const allHashes =
  [...requiredHashes.values()];

const hashedRequests = [];
const hashedResult =
  await checkProductionSchemaRelease({
    fetchImpl: async (url, options) => {
      hashedRequests.push({
        path:
          new URL(url).pathname,
        method:
          options?.method
      });

      return jsonResponse({
        status: "available",
        algorithm: "sha256",
        component_count:
          allHashes.length,
        component_hashes:
          allHashes
      });
    },
    baseUrl:
      "https://planner.example",
    timeoutMs: 1000,
    attempts: 1
  });

assert.equal(
  hashedResult.mode,
  "hashed_snapshot"
);
assert.deepEqual(
  hashedRequests,
  [
    {
      path:
        "/api/health/schema-components",
      method: "GET"
    }
  ],
  "Candidate release gate must remain GET-only"
);

const missingHash =
  requiredHashes.get(
    "column:targets.battle_kind"
  );

await assert.rejects(
  () =>
    checkProductionSchemaRelease({
      fetchImpl: async () =>
        jsonResponse({
          status: "available",
          algorithm: "sha256",
          component_count:
            allHashes.length - 1,
          component_hashes:
            allHashes.filter(
              hash =>
                hash !==
                missingHash
            )
        }),
      baseUrl:
        "https://planner.example",
      timeoutMs: 1000,
    attempts: 1
    }),
  /column:targets\.battle_kind/,
  "Candidate gate must report the candidate-owned missing component name"
);

const bootstrapRequests = [];
const bootstrapResult =
  await checkProductionSchemaRelease({
    fetchImpl: async (url, options) => {
      const path =
        new URL(url).pathname;

      bootstrapRequests.push({
        path,
        method:
          options?.method
      });

      if (
        path ===
          "/api/health/schema-components"
      ) {
        return new Response(
          "Not found",
          {
            status: 404,
            headers: {
              "content-type":
                "text/plain"
            }
          }
        );
      }

      return jsonResponse({
        monitor_ok: true,
        status: "compatible",
        missing_count: 0,
        missing_components: []
      });
    },
    baseUrl:
      "https://planner.example",
    timeoutMs: 1000,
    attempts: 1
  });

assert.equal(
  bootstrapResult.mode,
  "bootstrap"
);
assert.equal(
  bootstrapResult.candidate_fingerprint,
  BL054_BOOTSTRAP_SCHEMA_FINGERPRINT,
  "Bootstrap fingerprint must remain pinned to the BL-054 pre-endpoint schema contract"
);
assert.deepEqual(
  bootstrapRequests,
  [
    {
      path:
        "/api/health/schema-components",
      method: "GET"
    },
    {
      path:
        "/api/health/schema-compatibility",
      method: "GET"
    }
  ]
);

const changedSchema = {
  ...REQUIRED_SCHEMA,
  tables: {
    ...REQUIRED_SCHEMA.tables,
    future_release_table: [
      "id"
    ]
  }
};

let changedFallbackCalls = 0;
await assert.rejects(
  () =>
    checkProductionSchemaRelease({
      fetchImpl: async () => {
        changedFallbackCalls += 1;
        return new Response(
          "Not found",
          {
            status: 404,
            headers: {
              "content-type":
                "text/plain"
            }
          }
        );
      },
      baseUrl:
        "https://planner.example",
      requiredSchema:
        changedSchema,
      timeoutMs: 1000,
    attempts: 1
    }),
  /candidate changes the required schema contract/i,
  "Bootstrap fallback must fail closed for schema-changing candidates"
);
assert.equal(
  changedFallbackCalls,
  1,
  "Schema-changing fallback must not probe the old compatibility endpoint"
);

await assert.rejects(
  () =>
    checkProductionSchemaRelease({
      fetchImpl: async () =>
        jsonResponse(
          {
            status:
              "unavailable",
            algorithm:
              "sha256",
            component_count: 0,
            component_hashes: []
          },
          503
        ),
      baseUrl:
        "https://planner.example",
      timeoutMs: 1000,
    attempts: 1
    }),
  /snapshot is unavailable/i,
  "Unavailable production schema evidence must block the release gate"
);

console.log(
  "candidate schema release gate tests passed"
);
