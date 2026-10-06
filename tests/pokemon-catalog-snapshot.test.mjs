import assert from "node:assert/strict";
import {
  readFileSync
} from "node:fs";
import {
  DatabaseSync
} from "node:sqlite";
import {
  normalizePokemonCatalogSnapshotRow,
  serializePokemonCatalogSnapshot,
  usablePokemonCatalogEntries,
  writePokemonCatalogSnapshot
} from "../src/pokemon-catalog-snapshot.js";
import {
  fetchPokedexWithSnapshotHealth,
  pokemonCatalogApi
} from "../src/index.js";

const read =
  path =>
    readFileSync(
      new URL(
        path,
        import.meta.url
      ),
      "utf8"
    );

const syncHealthMigration =
  read(
    "../migrations/0006_sync_source_health.sql"
  );
const catalogMigration =
  read(
    "../migrations/0009_pokemon_catalog_snapshot.sql"
  );

class D1Statement {
  constructor(
    statement,
    args = []
  ) {
    this.statement =
      statement;
    this.args =
      args;
  }

  bind(
    ...args
  ) {
    return new D1Statement(
      this.statement,
      args
    );
  }

  async run() {
    return this.statement.run(
      ...this.args
    );
  }

  async first() {
    return (
      this.statement.get(
        ...this.args
      ) ||
      null
    );
  }

  async all() {
    return {
      results:
        this.statement.all(
          ...this.args
        )
    };
  }
}

class D1Database {
  constructor() {
    this.sqlite =
      new DatabaseSync(
        ":memory:"
      );
  }

  exec(
    sql
  ) {
    this.sqlite.exec(
      sql
    );
  }

  prepare(
    sql
  ) {
    return new D1Statement(
      this.sqlite.prepare(
        sql
      )
    );
  }

  row(
    sql,
    ...args
  ) {
    return this.sqlite
      .prepare(
        sql
      )
      .get(
        ...args
      );
  }
}

class FakeCache {
  constructor() {
    this.values =
      new Map();
    this.putCount = 0;
  }

  async match(
    request
  ) {
    const value =
      this.values.get(
        request.url
      );

    return value
      ? value.clone()
      : undefined;
  }

  async put(
    request,
    response
  ) {
    this.putCount += 1;
    this.values.set(
      request.url,
      response.clone()
    );
  }
}

function createDb({
  health = false
} = {}) {
  const db =
    new D1Database();

  if (health) {
    db.exec(
      syncHealthMigration
    );
  }

  db.exec(
    catalogMigration
  );

  return db;
}

const rawPokedex = [
  {
    dexNr: 6,
    names: {
      English:
        "Charizard"
    },
    stats: {
      attack: 223,
      defense: 173,
      stamina: 186
    },
    primaryType: {
      names: {
        English:
          "Fire"
      }
    },
    secondaryType: {
      names: {
        English:
          "Flying"
      }
    },
    assets: {
      image:
        "https://example.test/charizard.png",
      shinyImage:
        "https://example.test/charizard-shiny.png"
    },
    megaEvolutions: {
      CHARIZARD_MEGA_X: {
        names: {
          English:
            "Mega Charizard X"
        },
        stats: {
          attack: 273,
          defense: 213,
          stamina: 186
        },
        primaryType: {
          names: {
            English:
              "Fire"
          }
        },
        secondaryType: {
          names: {
            English:
              "Dragon"
          }
        }
      }
    }
  }
];

const compactFixture = [
  {
    key:
      "6|base|charizard|charizard",
    dex_nr: 6,
    name: "Charizard",
    form_id:
      "CHARIZARD",
    kind: "base",
    attack: 223,
    defense: 173,
    stamina: 186,
    types: [
      "Fire",
      "Flying"
    ],
    sprite_url: null,
    shiny_sprite_url:
      null
  }
];

assert.equal(
  usablePokemonCatalogEntries(
    compactFixture
  ),
  true
);
assert.equal(
  usablePokemonCatalogEntries(
    []
  ),
  false
);
assert.equal(
  usablePokemonCatalogEntries([
    {
      ...compactFixture[0],
      types: []
    }
  ]),
  false,
  "Catalog entries without typing must never become last-known-good data"
);

const serialized =
  serializePokemonCatalogSnapshot({
    sourceUrl:
      "https://example.test/pokedex.json",
    generatedAt:
      "2026-10-06T05:00:00.000Z",
    entries:
      compactFixture
  });

assert.equal(
  serialized.entry_count,
  1
);
assert.deepEqual(
  normalizePokemonCatalogSnapshotRow(
    serialized
  )?.entries,
  compactFixture
);
assert.equal(
  normalizePokemonCatalogSnapshotRow({
    ...serialized,
    entry_count: 2
  }),
  null,
  "Snapshot row count mismatches must fail closed"
);
assert.equal(
  normalizePokemonCatalogSnapshotRow({
    ...serialized,
    catalog_json:
      "{bad json"
  }),
  null,
  "Corrupt snapshot JSON must never be served"
);
assert.throws(
  () =>
    serializePokemonCatalogSnapshot({
      sourceUrl:
        "https://example.test/pokedex.json",
      generatedAt:
        "2026-10-06T05:00:00.000Z",
      entries: []
    }),
  /not structurally usable/i
);

const originalFetch =
  globalThis.fetch;
const originalCaches =
  globalThis.caches;

try {
  {
    const db =
      createDb();
    const cache =
      new FakeCache();

    globalThis.caches = {
      default: cache
    };
    globalThis.fetch =
      async () =>
        new Response(
          JSON.stringify(
            rawPokedex
          ),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json"
            }
          }
        );

    const response =
      await pokemonCatalogApi(
        new Request(
          "https://planner.example/api/pokemon-catalog"
        ),
        {
          DB: db
        }
      );
    const body =
      await response.json();

    assert.equal(
      response.status,
      200
    );
    assert.equal(
      body.catalog_status,
      "live"
    );
    assert.equal(
      body.snapshot_available,
      true
    );
    assert.equal(
      body.entry_count,
      2,
      "Base and exact Mega form must both remain in the compact catalog"
    );
    assert.deepEqual(
      body.entries.map(
        entry =>
          entry.name
      ),
      [
        "Charizard",
        "Mega Charizard X"
      ]
    );
    assert.equal(
      cache.putCount,
      1,
      "Only a live catalog backed by a durable snapshot should enter the six-hour edge cache"
    );

    const snapshotRow =
      db.row(`
        SELECT
          entry_count,
          catalog_json
        FROM pokemon_catalog_snapshot
        WHERE id = ?
      `,
      "pokemon-go-api-pokedex"
      );

    assert.equal(
      Number(
        snapshotRow.entry_count
      ),
      2
    );

    const cacheOnly =
      await pokemonCatalogApi(
        new Request(
          "https://planner.example/api/pokemon-catalog"
        ),
        {
          DB: db
        }
      );

    assert.equal(
      cacheOnly.status,
      200
    );
    assert.equal(
      cache.putCount,
      1,
      "A warm edge hit must not rewrite the snapshot"
    );
  }

  {
    const db =
      createDb();

    await writePokemonCatalogSnapshot(
      db,
      {
        sourceUrl:
          "https://example.test/pokedex.json",
        generatedAt:
          "2026-10-06T04:00:00.000Z",
        entries:
          compactFixture
      }
    );

    globalThis.caches = {
      default:
        new FakeCache()
    };
    globalThis.fetch =
      async () =>
        new Response(
          "upstream down",
          {
            status: 503
          }
        );

    const response =
      await pokemonCatalogApi(
        new Request(
          "https://planner.example/api/pokemon-catalog"
        ),
        {
          DB: db
        }
      );
    const body =
      await response.json();

    assert.equal(
      response.status,
      200
    );
    assert.equal(
      body.catalog_status,
      "last_known_good"
    );
    assert.equal(
      body.snapshot_available,
      true
    );
    assert.equal(
      body.generated_at,
      "2026-10-06T04:00:00.000Z"
    );
    assert.deepEqual(
      body.entries,
      compactFixture
    );
    assert.match(
      response.headers.get(
        "cache-control"
      ) || "",
      /max-age=300/,
      "Fallback responses must use only a short cache window so live recovery is discovered quickly"
    );
  }

  {
    const db =
      createDb();

    await writePokemonCatalogSnapshot(
      db,
      {
        sourceUrl:
          "https://example.test/pokedex.json",
        generatedAt:
          "2026-10-06T04:00:00.000Z",
        entries:
          compactFixture
      }
    );

    globalThis.caches = {
      default:
        new FakeCache()
    };
    globalThis.fetch =
      async () =>
        new Response(
          JSON.stringify(
            []
          ),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json"
            }
          }
        );

    const response =
      await pokemonCatalogApi(
        new Request(
          "https://planner.example/api/pokemon-catalog"
        ),
        {
          DB: db
        }
      );
    const body =
      await response.json();

    assert.equal(
      body.catalog_status,
      "last_known_good",
      "An implausibly empty upstream catalog must preserve and serve the previous safe snapshot"
    );
    assert.deepEqual(
      body.entries,
      compactFixture
    );
  }

  {
    const db =
      createDb();

    globalThis.caches = {
      default:
        new FakeCache()
    };
    globalThis.fetch =
      async () =>
        new Response(
          "upstream down",
          {
            status: 503
          }
        );

    const response =
      await pokemonCatalogApi(
        new Request(
          "https://planner.example/api/pokemon-catalog"
        ),
        {
          DB: db
        }
      );
    const body =
      await response.json();

    assert.equal(
      response.status,
      503
    );
    assert.deepEqual(
      body,
      {
        error:
          "Pokémon catalog is temporarily unavailable.",
        catalog_status:
          "unavailable",
        snapshot_available:
          false
      }
    );
    assert.match(
      response.headers.get(
        "cache-control"
      ) || "",
      /no-store/
    );
  }

  {
    const db =
      createDb({
        health: true
      });

    globalThis.fetch =
      async () =>
        new Response(
          JSON.stringify(
            rawPokedex
          ),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json"
            }
          }
        );

    const result =
      await fetchPokedexWithSnapshotHealth({
        DB: db
      });

    assert.equal(
      result.length,
      1
    );

    const snapshot =
      db.row(`
        SELECT
          entry_count
        FROM pokemon_catalog_snapshot
        WHERE id = ?
      `,
      "pokemon-go-api-pokedex"
      );

    assert.equal(
      Number(
        snapshot.entry_count
      ),
      2,
      "Scheduled meta Pokédex sync must seed the same durable compact catalog snapshot"
    );

    const health =
      db.row(`
        SELECT
          last_success_at,
          last_error,
          item_count
        FROM sync_source_health
        WHERE source_key = ?
      `,
      "meta:pokemon-go-api-pokedex"
      );

    assert.ok(
      health.last_success_at
    );
    assert.equal(
      health.last_error,
      null
    );
    assert.equal(
      Number(
        health.item_count
      ),
      1
    );
  }
} finally {
  globalThis.fetch =
    originalFetch;

  if (
    originalCaches ===
      undefined
  ) {
    delete globalThis.caches;
  } else {
    globalThis.caches =
      originalCaches;
  }
}

console.log(
  "Pokémon catalog last-known-good tests passed"
);
