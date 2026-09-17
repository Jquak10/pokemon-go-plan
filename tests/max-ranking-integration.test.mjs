import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync("src/index.js", "utf8");
const resource = fs.readFileSync("src/resource-planning.js", "utf8");
const manage = fs.readFileSync("public/manage.html", "utf8");

assert.match(index, /MAX_RANK_METHOD_VERSION/);
assert.match(index, /MAX_RANK_SOURCE_NAME = "Max attacker rankings"/);
assert.match(index, /maxEligibilityEventsForMeta/);
assert.match(index, /MAX_BATTLE_SOURCE_TYPES/);
assert.match(index, /buildMaxAttackerRankCatalog/);
assert.match(index, /maxRankProfileForName/);
assert.match(index, /AS max_rankings_json/);
assert.match(index, /max_rankings_json:\s*targetBattleKind\(target\)\s*===\s*"raid"\s*\?\s*null/);
assert.match(index, /max_rank_backfills/);
assert.equal((index.match(/exactRegionForm \|\| pokemonName/g) || []).length >= 2, true);

assert.match(resource, /maxRankProfileForRecommendation/);
assert.match(resource, /max_attacker_utility/);
assert.match(resource, /max_performance_ranked:\n        true/);
assert.match(resource, /normal Raid attacker rankings are not used as Max performance/);

assert.match(manage, /function maxRankingsHtml/);
assert.match(manage, /Max attacker/);
assert.match(manage, /G-Max move power\/type is not guessed/);
assert.ok(manage.includes("isMax ? maxRankingsHtml(rec.meta?.max_rankings_json)"));
assert.ok(manage.includes("maxRankingsHtml(target.max_rankings_json)"));

console.log("Max ranking integration tests passed");
