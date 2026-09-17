import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function read(relative) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const manage = read("../public/manage.html");
const styles = read("../public/styles.css");
const worker = read("../src/index.js");

assert.match(manage, /Pokémon GO Battle Planner/);
assert.match(manage, /PERSONAL BATTLE STRATEGY/);
assert.match(manage, /nav-label-desktop">Battle Plan/);
assert.match(manage, /nav-label-mobile">Plan/);

assert.match(manage, /data-battle-filter="all"/);
assert.match(manage, /data-battle-filter="raid"/);
assert.match(manage, /data-battle-filter="max"/);
assert.match(manage, />\s*Max Battles\s*</);
assert.match(manage, /battlePlanFilter/);
assert.match(manage, /remoteRaidZeroDetails/);

assert.match(manage, /function recommendationSpriteUrl/);
assert.match(manage, /requires_exact_form/);
assert.match(manage, /sprite_exact_form/);
assert.match(manage, /battleSystemBadgeHtml/);
assert.match(manage, /max-capability-badge/);

assert.match(manage, /rec\.boss_name/);
assert.match(manage, /rec\.encounter_name/);
assert.match(manage, /rec\.battle_system !== "max" && intel\.normalCp/);
assert.match(manage, />Weak to</);
assert.match(manage, /Battle form:/);
assert.match(manage, /Encounter form:/);

assert.match(manage, /!isMax \? raidRankingsHtml/);
assert.match(manage, /rec\.battle_system === "max"\s*\? null/);
assert.doesNotMatch(manage, /battle-plan-ui\.js/);

assert.match(styles, /Battle Plan \/ Max Battle UI — v31/);
assert.match(styles, /\.battle-plan-filter/);
assert.match(styles, /\.battle-filter-button/);
assert.match(styles, /min-height:\s*44px/);
assert.match(styles, /\.nav-label-mobile/);
assert.match(styles, /@media \(max-width: 700px\)/);

for (const page of [
  "../public/manage.html",
  "../public/index.html",
  "../public/admin.html",
  "../public/sources.html"
]) {
  assert.match(read(page), /styles\.css\?v=31/);
}

assert.match(worker, /BATTLE_SOURCE_TYPES/);
assert.match(worker, /battleOpportunityMetadata/);
assert.match(worker, /battleOpportunityPresentation/);
assert.match(worker, /battle_presentation/);
assert.match(worker, /sprite_exact_form/);
assert.match(worker, /battleMetadata\?\.battle_system/);

// Syntax-check the Planner's inline JavaScript without executing browser APIs.
const inlineScripts = [...manage.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .filter(Boolean);
assert.ok(inlineScripts.length >= 1, "Expected Planner inline JavaScript");
for (const [index, script] of inlineScripts.entries()) {
  new vm.Script(script, { filename: `manage-inline-${index + 1}.js` });
}

console.log("Battle Plan UI integration tests passed");
