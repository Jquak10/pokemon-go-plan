import assert from "node:assert/strict";
import {
  withSyncSourceHealth
} from "../src/index.js";

const source = {
  source_key:
    "meta:pokemon-go-api-pokedex",
  source_group:
    "meta",
  source_label:
    "Pokémon GO API Pokédex",
  source_url:
    "https://example.invalid/pokedex.json",
  minimum_viable_item_count: 1
};

const state = {
  last_attempt_at: null,
  last_success_at: null,
  last_error: null,
  item_count: null
};

const env = {
  DB: {
    prepare(sql) {
      assert.match(
        sql,
        /sync_source_health/
      );

      return {
        bind(
          sourceKey,
          sourceGroup,
          sourceLabel,
          sourceUrl,
          attemptedAt,
          successAt,
          error,
          itemCount
        ) {
          assert.equal(
            sourceKey,
            source.source_key
          );
          assert.equal(
            sourceGroup,
            source.source_group
          );
          assert.equal(
            sourceLabel,
            source.source_label
          );
          assert.equal(
            sourceUrl,
            source.source_url
          );

          return {
            async run() {
              state.last_attempt_at =
                attemptedAt;
              state.last_error =
                error;

              if (error == null) {
                state.last_success_at =
                  successAt;
                state.item_count =
                  itemCount;
              }
            }
          };
        }
      };
    }
  }
};

await withSyncSourceHealth(
  env,
  source,
  async () =>
    Array.from(
      { length: 25 },
      (_, index) => index
    ),
  result => result.length
);

const firstSuccess =
  state.last_success_at;

assert.ok(firstSuccess);
assert.equal(
  state.last_error,
  null
);
assert.equal(
  state.item_count,
  25
);

await assert.rejects(
  withSyncSourceHealth(
    env,
    source,
    async () => [],
    result => result.length
  ),
  /implausibly empty payload/i
);

assert.equal(
  state.last_success_at,
  firstSuccess,
  "Empty attempts must preserve the last-known-good success timestamp"
);
assert.equal(
  state.item_count,
  25,
  "Empty attempts must preserve the last-known-good item count"
);
assert.match(
  state.last_error,
  /implausibly empty payload/i
);
assert.ok(
  state.last_attempt_at >=
    firstSuccess
);

await withSyncSourceHealth(
  env,
  source,
  async () =>
    Array.from(
      { length: 30 },
      (_, index) => index
    ),
  result => result.length
);

assert.equal(
  state.last_error,
  null,
  "A healthy recovery must clear the degraded attempt"
);
assert.equal(
  state.item_count,
  30
);
assert.ok(
  state.last_success_at >=
    firstSuccess
);

console.log(
  "sync yield integration tests passed"
);
