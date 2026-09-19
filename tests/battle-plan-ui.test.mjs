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

assert.match(manage, /function remoteRuleWindowLabel/);
assert.match(manage, /Local time ·/);
assert.match(manage, /rule\.start_at/);
assert.match(manage, /rule\.end_at/);
assert.match(manage, /state\?\.user\?\.timezone/);
assert.match(manage, /remoteRuleWindowLabel\(rule\)/);
assert.doesNotMatch(
  manage,
  /<span>\$\{esc\(rule\.start_date \|\| ""\)\}\$\{rule\.end_date \? " → " \+ esc\(rule\.end_date\) : ""\}<\/span>/
);

assert.match(manage, /function recommendationSpriteUrl/);
assert.match(manage, /requires_exact_form/);
assert.match(manage, /sprite_exact_form/);
assert.match(manage, /battleSystemBadgeHtml/);
assert.match(manage, /max-capability-badge/);

assert.match(manage, /rec\.boss_name/);
assert.match(manage, /const bossName =[\s\S]*rec\.battle_system === "max"[\s\S]*raidEncounterEntry\([\s\S]*bossName/);
assert.match(manage, /Battle intel unavailable for this form\./);
assert.match(manage, /pokemonCatalogLoadState/);
assert.match(manage, /POKEMON_CATALOG_CACHE_KEY/);
assert.match(manage, /data-retry-pokemon-catalog/);
assert.match(manage, /Battle intel temporarily unavailable\./);
assert.match(manage, /Using the last saved Pokémon catalog/);
assert.match(manage, /function readPokemonCatalogCache/);
assert.match(manage, /function writePokemonCatalogCache/);
assert.match(manage, /function retryPokemonCatalogLoad/);
assert.match(manage, /renderRecommendations\(\);[\s\S]*throw error/);
assert.match(manage, /rec\.encounter_name/);
assert.match(manage, /rec\.battle_system !== "max" && intel\.normalCp/);
assert.match(manage, />Weak to</);
assert.match(manage, /Battle form:/);
assert.match(manage, /Encounter form:/);

assert.match(manage, /function maxRankingsHtml/);
assert.match(manage, /isMax \? maxRankingsHtml\(rec\.meta\?\.max_rankings_json\)/);
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
  assert.match(read(page), /styles\.css\?v=38/);
}

assert.match(worker, /BATTLE_SOURCE_TYPES/);
assert.match(worker, /battleOpportunityMetadata/);
assert.match(worker, /battleOpportunityPresentation/);
assert.match(worker, /battle_presentation/);
assert.match(worker, /sprite_exact_form/);
assert.match(worker, /battleMetadata\?\.battle_system/);
assert.match(worker, /planningPriorityForRecommendation/);
assert.match(worker, /function withPlanningPriority/);
assert.match(worker, /recommendation_score:/);
assert.match(worker, /planning_score:/);
assert.match(worker, /planning_rationale:/);
assert.match(manage, /<strong>Planning priority:<\/strong>/);
assert.match(manage, /item\.label \|\| "Priority"/);

// Syntax-check the Planner's inline JavaScript without executing browser APIs.
const inlineScripts = [...manage.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .filter(Boolean);
assert.ok(inlineScripts.length >= 1, "Expected Planner inline JavaScript");
for (const [index, script] of inlineScripts.entries()) {
  new vm.Script(script, { filename: `manage-inline-${index + 1}.js` });
}

console.log("Battle Plan UI integration tests passed");


assert.match(manage, /Remote Battle Plan/);
assert.match(manage, /Paid Battle Forecast/);
assert.match(manage, /budgetForecastDetails/);
assert.match(manage, /data-forecast-day-index/);
assert.match(manage, /View all/);
assert.match(manage, /Max Particle cost is unknown/);
assert.match(styles, /PAID BATTLE FORECAST EXPANSION · v38/);
assert.match(styles, /\.forecast-expand-button/);
assert.match(styles, /\.forecast-detail-row/);
assert.match(worker, /function calendarSourceTypesForUser/);
assert.match(worker, /included\.includes\("max_battles"\)[\s\S]*MAX_ROTATION_SOURCE_TYPE/);
assert.match(worker, /calendarDisplaySourceType/);
assert.match(worker, /suppressionSourceTypesForEvent/);

assert.doesNotMatch(manage, /Paid Raid Budget Forecast/);
assert.match(manage, /Additional Remote Pass uses from the shared Raid \+ Max forecast/);
assert.match(manage, /item\.battle_system === "max" \? "Max" : "Raid"/);
assert.match(worker, /buildBattleForecast/);
assert.match(worker, /buildBattleBudgetForecast/);
assert.match(worker, /budget_forecast_kind:[\s\S]*"shared_battle"/);
assert.match(worker, /forecast_recommended_additional_raids/);
assert.match(worker, /forecast_recommended_additional_max/);
assert.doesNotMatch(worker, /buildRemoteRaidBudgetForecast/);

assert.match(manage, /BATTLE RESOURCES/);
assert.match(manage, /Remote Passes & Max Particles/);
assert.match(manage, /maxParticlesHeld/);
assert.match(manage, /maxParticlesCollectedToday/);
assert.match(manage, /remoteMaxPassesUsed/);
assert.match(manage, /saveBattleResources/);
assert.match(manage, /\/api\/battle-resources/);
assert.match(manage, /MP cost unknown/);
assert.match(manage, /Remote Max battle/);
assert.match(styles, /Battle resource planning — v32/);
assert.match(worker, /battle_resource_plan/);
assert.match(worker, /battleResourcePlanForUser/);
assert.match(worker, /updateBattleResourcesApi/);
assert.match(worker, /max_particle_cost/);

assert.match(styles, /Battle Plan compact desktop polish — v35/);
assert.match(styles, /grid-template-areas:[\s\S]*today-main resources[\s\S]*today-metrics resources/);
assert.match(styles, /battle-resource-panel[\s\S]*border-left:/);


// Part 8: shared-resource UX must stay battle-system aware.
assert.match(manage, /Additional worthwhile Remote Pass uses/);
assert.match(manage, /sharedPassPlan\.recommended_additional \?\? plan\.recommended_total/);
assert.match(manage, /battle_resource_plan[\s\S]*remote_passes[\s\S]*recommended_additional/);
assert.match(manage, /`\$\{recBattleLabel\} recommendation`/);
assert.match(manage, /openRaidLogModal\([\s\S]*rec\.pokemon_name,[\s\S]*rec\.target\?\.id \|\| null,[\s\S]*rec/);
assert.match(manage, /role="tablist"/);
assert.match(manage, /role="tabpanel"/);
assert.match(manage, /function lockPageForMobileMore/);
assert.match(manage, /function unlockPageForMobileMore/);
assert.match(styles, /PART 8 UX POLISH \+ REGRESSION HARDENING · v36/);
assert.match(styles, /html\.mobile-more-open/);
assert.match(styles, /\.battle-card-max[\s\S]*border-top-color/);
assert.match(styles, /recommendation-footer-row[\s\S]*grid-template-columns/);
assert.doesNotMatch(manage, /daily participation cap is not verified here/i);
assert.doesNotMatch(manage, /separate Raid-only rule/i);

// Part 8 mobile actions remain 44px+ and only real tabs receive tab state.
assert.match(styles, /recommendation-footer-row \.log-raid-button,[\s\S]*min-height:\s*44px/);
assert.match(manage, /querySelectorAll\("\.tab-button\[data-tab\]"\)/);


assert.match(styles, /Desktop text visibility \+ Max battle-intel hardening · v37/);
assert.match(styles, /@media \(min-width: 900px\)[\s\S]*\.battle-resource-advice \{[\s\S]*display: grid;[\s\S]*overflow: visible;/);
