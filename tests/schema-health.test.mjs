import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  REQUIRED_SCHEMA,
  evaluateSchemaCompatibility,
  evaluateSchemaComponentHashes,
  hashSchemaComponentIdentifiers,
  inspectSchemaCompatibility,
  inspectSchemaComponentHashes,
  requiredSchemaComponentIdentifiers
} from "../src/schema-health.js";
import {
  productionSchemaCompatibilityApi,
  productionSchemaComponentHashesApi
} from "../src/index.js";

function d1Adapter(db) {
  return {
    prepare(sql) {
      return {
        async all() {
          return {
            results:
              db.prepare(sql).all()
          };
        }
      };
    }
  };
}

const schema =
  readFileSync(
    new URL(
      "../schema.sql",
      import.meta.url
    ),
    "utf8"
  );

const compatibleDb =
  new DatabaseSync(":memory:");
compatibleDb.exec(schema);

const compatible =
  await inspectSchemaCompatibility(
    d1Adapter(compatibleDb)
  );

assert.deepEqual(
  compatible,
  {
    monitor_ok: true,
    status: "compatible",
    missing_count: 0,
    missing_components: []
  }
);

const compatibleResponse =
  await productionSchemaCompatibilityApi({
    DB: d1Adapter(compatibleDb)
  });

assert.equal(
  compatibleResponse.status,
  200
);
assert.match(
  compatibleResponse.headers.get(
    "cache-control"
  ) || "",
  /no-store/i
);
assert.deepEqual(
  await compatibleResponse.json(),
  compatible
);

const componentSnapshot =
  await inspectSchemaComponentHashes(
    d1Adapter(compatibleDb)
  );

assert.equal(
  componentSnapshot.status,
  "available"
);
assert.equal(
  componentSnapshot.algorithm,
  "sha256"
);
assert.ok(
  componentSnapshot.component_count >
    0
);
assert.equal(
  componentSnapshot.component_hashes
    .length,
  componentSnapshot.component_count
);

const requiredComponentHashes =
  await hashSchemaComponentIdentifiers(
    requiredSchemaComponentIdentifiers(
      REQUIRED_SCHEMA
    )
  );

for (const hash of requiredComponentHashes.values()) {
  assert.ok(
    componentSnapshot
      .component_hashes
      .includes(
        hash
      ),
    "Compatible schema snapshot must contain every candidate-required component hash"
  );
}

assert.doesNotMatch(
  JSON.stringify(
    componentSnapshot
  ),
  /users|targets|manage_hash|feed_hash|CREATE|SELECT/i,
  "Public schema snapshot must expose hashes only, never object names, SQL, or private column identifiers"
);

const componentSnapshotResponse =
  await productionSchemaComponentHashesApi({
    DB: d1Adapter(compatibleDb)
  });

assert.equal(
  componentSnapshotResponse.status,
  200
);
assert.match(
  componentSnapshotResponse.headers.get(
    "cache-control"
  ) || "",
  /no-store/i
);
assert.deepEqual(
  await componentSnapshotResponse.json(),
  componentSnapshot
);

const objects =
  compatibleDb.prepare(`
    SELECT type, name
    FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
  `).all();

const columnsByTable = {};
for (const table of Object.keys(REQUIRED_SCHEMA.tables)) {
  columnsByTable[table] =
    compatibleDb.prepare(
      `PRAGMA table_info("${table}")`
    ).all();
}

columnsByTable.targets =
  columnsByTable.targets.filter(
    row =>
      row.name !== "battle_kind"
  );

const missingColumn =
  evaluateSchemaCompatibility(
    objects,
    columnsByTable
  );

assert.equal(
  missingColumn.monitor_ok,
  false
);
assert.deepEqual(
  missingColumn.missing_components,
  [
    "column:targets.battle_kind"
  ]
);

compatibleDb.exec(
  "DROP INDEX idx_sync_source_health_group"
);

const incompatibleSnapshot =
  await inspectSchemaComponentHashes(
    d1Adapter(compatibleDb)
  );
const candidateCompatibility =
  await evaluateSchemaComponentHashes(
    incompatibleSnapshot
      .component_hashes,
    REQUIRED_SCHEMA
  );

assert.equal(
  candidateCompatibility.monitor_ok,
  false
);
assert.deepEqual(
  candidateCompatibility
    .missing_components,
  [
    "index:idx_sync_source_health_group"
  ],
  "Candidate comparison must map a missing production hash back to the candidate-owned component name"
);

const incompatible =
  await inspectSchemaCompatibility(
    d1Adapter(compatibleDb)
  );

assert.equal(
  incompatible.monitor_ok,
  false
);
assert.equal(
  incompatible.status,
  "incompatible"
);
assert.ok(
  incompatible.missing_components.includes(
    "index:idx_sync_source_health_group"
  )
);
assert.equal(
  incompatible.missing_components.some(
    component =>
      /CREATE|SELECT|manage_hash|feed_hash/i.test(
        component
      )
  ),
  false,
  "Health output must contain component identifiers only"
);

const incompatibleResponse =
  await productionSchemaCompatibilityApi({
    DB: d1Adapter(compatibleDb)
  });

assert.equal(
  incompatibleResponse.status,
  503
);
assert.deepEqual(
  await incompatibleResponse.json(),
  incompatible
);

const unavailableResponse =
  await productionSchemaCompatibilityApi({
    DB: {
      prepare() {
        throw new Error(
          "sensitive internal SQL detail"
        );
      }
    }
  });

assert.equal(
  unavailableResponse.status,
  503
);
assert.deepEqual(
  await unavailableResponse.json(),
  {
    monitor_ok: false,
    status: "unavailable",
    missing_count: 0,
    missing_components: []
  },
  "Unexpected inspection errors must not leak database details"
);

const unavailableComponentResponse =
  await productionSchemaComponentHashesApi({
    DB: {
      prepare() {
        throw new Error(
          "sensitive schema inventory detail"
        );
      }
    }
  });

assert.equal(
  unavailableComponentResponse.status,
  503
);
assert.deepEqual(
  await unavailableComponentResponse.json(),
  {
    status: "unavailable",
    algorithm: "sha256",
    component_count: 0,
    component_hashes: []
  },
  "Schema component snapshot errors must remain sanitized"
);

console.log(
  "schema health regression tests passed"
);
