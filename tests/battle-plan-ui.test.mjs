import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/battle-plan-ui.js", import.meta.url),
  "utf8"
);

assert.match(source, /MAX_SOURCE_TYPES\s*=\s*new Set\(\[/);
assert.match(source, /"max_battles"/);
assert.match(source, /"max_mondays"/);

assert.match(source, /pogo-battle-plan-filter/);
assert.match(source, /data-battle-filter="all"/);
assert.match(source, /data-battle-filter="raid"/);
assert.match(source, /data-battle-filter="max"/);
assert.match(source, /All/);
assert.match(source, /Raids/);
assert.match(source, /Max Battles/);

assert.match(source, /Pokémon GO Battle Planner/);
assert.match(source, /PERSONAL BATTLE STRATEGY/);
assert.match(source, /desktop-plan-label/);
assert.match(source, /mobile-plan-label/);

assert.match(source, /battleSystemForRecommendation/);
assert.match(source, /maxVariantForRecommendation/);
assert.match(source, /Gigantamax/);
assert.match(source, /Dynamax/);

assert.match(source, /exactGigantamaxCatalogEntry/);
assert.match(source, /return exact\?\.sprite_url/);
assert.match(source, /raidEncounterEntry\(rec\?\.pokemon_name\)/);

assert.match(source, /Remote: Pass \+ MP/);
assert.match(source, /Planning only/);
assert.match(source, /isMax \? "" : raidRankingsHtml/);
assert.match(source, /Raid-level Hundo CP is intentionally not reused for Max Battles/);
assert.match(source, /Weak to/);
assert.match(source, /BOSS TYPE/);
assert.match(source, /RESISTS/);

assert.match(source, /battlePlanFilter === "max"/);
assert.match(source, /zero-raid-details/);
assert.match(source, /classList\.toggle\(\s*"hidden"/);

assert.match(source, /min-height:\s*44px/);
assert.match(source, /@media \(max-width: 760px\)/);
assert.match(source, /@media \(min-width: 761px\)/);

console.log("Battle Plan UI contract tests passed");
