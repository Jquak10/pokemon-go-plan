import assert from "node:assert/strict";
import {
  REQUIRED_SCHEMA,
  hashSchemaComponentIdentifiers,
  requiredSchemaComponentIdentifiers,
  schemaContractFingerprint
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

function unavailableSnapshotResponse() {
  return jsonResponse(
    {
      status: "unavailable",
      algorithm: "sha256",
      component_count: 0,
      component_hashes: []
    },
    503
  );
}

function healthyCompatibilityResponse({
  fingerprint
} = {}) {
  return jsonResponse({
    monitor_ok: true,
    status: "compatible",
    missing_count: 0,
    missing_components: [],
    ...(
      fingerprint
        ? {
            required_schema_fingerprint:
              fingerprint
          }
        : {}
    )
  });
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
const currentFingerprint =
  await schemaContractFingerprint(
    REQUIRED_SCHEMA
  );

const {
  pokemon_catalog_snapshot:
    _catalogSnapshotRequirement,
  ...bootstrapTables
} =
  REQUIRED_SCHEMA.tables;

const bootstrapRequiredSchema = {
  ...REQUIRED_SCHEMA,
  tables:
    bootstrapTables
};

const bootstrapSchemaFingerprint =
  await schemaContractFingerprint(
    bootstrapRequiredSchema
  );

assert.equal(
  bootstrapSchemaFingerprint,
  BL054_BOOTSTRAP_SCHEMA_FINGERPRINT,
  "BL-054 bootstrap fingerprint must remain pinned to the pre-BL-060 required schema contract"
);
assert.notEqual(
  currentFingerprint,
  BL054_BOOTSTRAP_SCHEMA_FINGERPRINT,
  "BL-060 must be recognized as a real schema-changing candidate until production migration 0009 is applied"
);

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

      return healthyCompatibilityResponse();
    },
    baseUrl:
      "https://planner.example",
    requiredSchema:
      bootstrapRequiredSchema,
    timeoutMs: 1000,
    attempts: 1
  });

assert.equal(
  bootstrapResult.mode,
  "bootstrap"
);
assert.equal(
  bootstrapResult.candidate_fingerprint,
  BL054_BOOTSTRAP_SCHEMA_FINGERPRINT
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
  ...bootstrapRequiredSchema,
  tables: {
    ...bootstrapRequiredSchema.tables,
    future_release_table: [
      "id"
    ]
  }
};

let changed404Calls = 0;
await assert.rejects(
  () =>
    checkProductionSchemaRelease({
      fetchImpl: async () => {
        changed404Calls += 1;
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
  "Pre-endpoint bootstrap must fail closed for schema-changing candidates"
);
assert.equal(
  changed404Calls,
  1,
  "Schema-changing 404 fallback must not probe the old compatibility endpoint"
);

const unavailableBootstrapRequests = [];
const unavailableBootstrapResult =
  await checkProductionSchemaRelease({
    fetchImpl: async (url, options) => {
      const path =
        new URL(url).pathname;

      unavailableBootstrapRequests.push({
        path,
        method:
          options?.method
      });

      return path ===
        "/api/health/schema-components"
        ? unavailableSnapshotResponse()
        : healthyCompatibilityResponse();
    },
    baseUrl:
      "https://planner.example",
    requiredSchema:
      bootstrapRequiredSchema,
    timeoutMs: 1000,
    attempts: 1
  });

assert.equal(
  unavailableBootstrapResult.mode,
  "bootstrap",
  "The BL-054 recovery PR may use the pinned unchanged contract while the new snapshot endpoint itself is unavailable"
);
assert.deepEqual(
  unavailableBootstrapRequests.map(
    request =>
      request.path
  ),
  [
    "/api/health/schema-components",
    "/api/health/schema-compatibility"
  ]
);

const deployedFallbackResult =
  await checkProductionSchemaRelease({
    fetchImpl: async url => {
      const path =
        new URL(url).pathname;

      return path ===
        "/api/health/schema-components"
        ? unavailableSnapshotResponse()
        : healthyCompatibilityResponse({
            fingerprint:
              currentFingerprint
          });
    },
    baseUrl:
      "https://planner.example",
    timeoutMs: 1000,
    attempts: 1
  });

assert.equal(
  deployedFallbackResult.mode,
  "deployed_contract_fallback",
  "A healthy deployed compatibility endpoint may prove an unchanged candidate contract when the hash snapshot is temporarily unavailable"
);

await assert.rejects(
  () =>
    checkProductionSchemaRelease({
      fetchImpl: async url => {
        const path =
          new URL(url).pathname;

        return path ===
          "/api/health/schema-components"
          ? unavailableSnapshotResponse()
          : healthyCompatibilityResponse({
              fingerprint:
                currentFingerprint
            });
      },
      baseUrl:
        "https://planner.example",
      requiredSchema:
        changedSchema,
      timeoutMs: 1000,
      attempts: 1
    }),
  /changes the required schema contract relative to the deployed Worker/i,
  "Snapshot recovery must fail closed when the candidate schema differs from the deployed Worker contract"
);

await assert.rejects(
  () =>
    checkProductionSchemaRelease({
      fetchImpl: async url => {
        const path =
          new URL(url).pathname;

        return path ===
          "/api/health/schema-components"
          ? unavailableSnapshotResponse()
          : jsonResponse(
              {
                monitor_ok: false,
                status: "unavailable",
                missing_count: 0,
                missing_components: []
              },
              503
            );
      },
      baseUrl:
        "https://planner.example",
      timeoutMs: 1000,
      attempts: 1
    }),
  /Fallback production schema compatibility is not healthy/i,
  "If neither production schema signal can prove compatibility, the release gate must fail closed"
);

console.log(
  "candidate schema release gate tests passed"
);
