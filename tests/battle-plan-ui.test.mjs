import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  adminKeyFromRequest,
  hardenResponse,
  manageTokenFromRequest
} from "../src/index.js";

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
assert.match(manage, /Battles receiving 0 Remote allocation/);
assert.match(manage, /function zeroAllocationItems/);
assert.match(manage, /function compactZeroAllocationReason/);
assert.match(manage, /function renderZeroAllocationDetails/);
assert.match(manage, /No Remote Max allocation/);
assert.match(manage, /No Remote Raid allocation/);
assert.match(manage, /max_particle_cost_unknown/);
assert.match(manage, /Priority set to Skip/);
assert.doesNotMatch(manage, /Raid bosses receiving 0 Remote Raids/);

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

assert.match(manage, /function maxTierOverrideControlHtml/);
assert.match(manage, /data-max-tier-override/);
assert.match(manage, /\/api\/max-battle-cost-override/);
assert.match(manage, /Set Max tier…/);
assert.match(manage, /Use automatic data/);
assert.match(manage, /current Max data/);
assert.match(manage, /You can correct the Pokémon, battle type, or goal type/);
assert.doesNotMatch(manage, /Existing targets keep their Pokémon, battle and goal identity/);

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
  assert.match(read(page), /styles\.css\?v=40/);
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
assert.match(manage, /const raidCount =/);
assert.match(manage, /const maxCount =/);
assert.match(manage, /const systemCountLabel =/);
assert.match(manage, /\.join\("\ \+ "\)/);

assert.match(manage, /item\.exclusion_reason/);
assert.match(manage, /MP cost unknown/);
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
assert.match(worker, /POGO_API_MAX_BATTLES/);
assert.match(worker, /currentMaxBattleTiersFromPayload/);
assert.match(worker, /max_battle_cost_overrides/);
assert.match(worker, /updateMaxBattleCostOverrideApi/);

assert.match(manage, /headers\.set\([\s\S]*"authorization"[\s\S]*Bearer/);
assert.match(manage, /url\.searchParams\.delete\([\s\S]*"token"/);
assert.match(manage, /delete parsed\.token/);
assert.doesNotMatch(manage, /\/api\/me\?token=/);
assert.doesNotMatch(manage, /\/api\/calendar-events\?token=/);
assert.doesNotMatch(manage, /\/api\/feed-link\?token=/);
assert.doesNotMatch(manage, /\/api\/targets\?token=/);

const admin = read("../public/admin.html");
assert.match(admin, /"x-admin-key"/);
assert.match(admin, /delete parsed\.key/);
assert.doesNotMatch(admin, /\/api\/admin\/meta\?key=/);
assert.doesNotMatch(admin, /\/api\/admin\/remote-limits\?key=/);
assert.doesNotMatch(admin, /\/api\/admin\/official-raids\?key=/);
assert.doesNotMatch(admin, /\/api\/admin\/suppressions\?key=/);

assert.match(worker, /manageTokenFromRequest/);
assert.match(worker, /adminKeyFromRequest/);
assert.match(worker, /content-security-policy/);
assert.match(worker, /frame-ancestors 'none'/);
assert.match(worker, /referrer-policy/);
assert.match(worker, /x-frame-options/);
assert.match(worker, /permissions-policy/);
assert.match(worker, /private, no-store, max-age=0/);

assert.equal(
  manageTokenFromRequest(
    new Request(
      "https://planner.example/api/me?token=legacy-query",
      {
        headers: {
          authorization:
            "Bearer header-token"
        }
      }
    ),
    {
      token:
        "legacy-body"
    }
  ),
  "header-token",
  "Authorization header must take precedence over legacy token locations"
);

assert.equal(
  manageTokenFromRequest(
    new Request(
      "https://planner.example/api/me?token=legacy-query"
    )
  ),
  "legacy-query",
  "Legacy query-token clients must remain compatible"
);

assert.equal(
  adminKeyFromRequest(
    new Request(
      "https://planner.example/api/admin/meta?key=legacy-admin",
      {
        headers: {
          "x-admin-key":
            "header-admin"
        }
      }
    )
  ),
  "header-admin",
  "Admin header must take precedence over the legacy query key"
);

assert.equal(
  adminKeyFromRequest(
    new Request(
      "https://planner.example/api/admin/meta?key=legacy-admin"
    )
  ),
  "legacy-admin",
  "Legacy admin query-key clients must remain compatible"
);

const hardenedHtml =
  hardenResponse(
    new Response(
      "<!doctype html><title>Private</title>",
      {
        headers: {
          "content-type":
            "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=3600"
        }
      }
    ),
    {
      noStore: true
    }
  );

assert.equal(
  hardenedHtml.headers.get(
    "referrer-policy"
  ),
  "no-referrer"
);
assert.equal(
  hardenedHtml.headers.get(
    "x-frame-options"
  ),
  "DENY"
);
assert.match(
  hardenedHtml.headers.get(
    "content-security-policy"
  ) || "",
  /frame-ancestors 'none'/
);
assert.match(
  hardenedHtml.headers.get(
    "cache-control"
  ) || "",
  /no-store/
);

const hardenedCalendar =
  hardenResponse(
    new Response(
      "BEGIN:VCALENDAR",
      {
        headers: {
          "content-type":
            "text/calendar; charset=utf-8",
          "cache-control":
            "private, max-age=60"
        }
      }
    )
  );

assert.equal(
  hardenedCalendar.headers.get(
    "cache-control"
  ),
  "private, max-age=60",
  "Calendar ETag/private cache semantics should remain intact"
);
assert.equal(
  hardenedCalendar.headers.get(
    "referrer-policy"
  ),
  "no-referrer"
);
assert.equal(
  hardenedCalendar.headers.get(
    "content-security-policy"
  ),
  null
);
assert.match(read("../src/resource-planning.js"), /reason_code:/);
assert.match(read("../src/resource-planning.js"), /remote_capacity_exhausted/);
assert.match(read("../src/resource-planning.js"), /lower_marginal_value/);

assert.match(styles, /Max Battle tier fallback controls · v40/);
assert.match(styles, /\.max-tier-override-select/);
assert.match(styles, /\.forecast-detail-side/);
assert.match(styles, /max-tier-override-select \{[\s\S]*min-height:\s*44px/);

assert.match(styles, /BL-008 — direct zero-Remote allocation explanations · v39/);
assert.match(styles, /\.allocation-reason-inline/);
assert.match(styles, /\.allocation-reason-max/);

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
assert.match(styles, /BL-009 — INTERMEDIATE-WIDTH DESKTOP HARDENING · v41/);
assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1179px\)/);
assert.match(styles, /\.today-command-main \{[\s\S]*grid-template-columns: 1fr;/);
assert.match(styles, /\.budget-forecast-strip \{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.calendar-view-layout \{[\s\S]*grid-template-columns: 1fr;/);
assert.match(styles, /\.forecast-detail-main strong,[\s\S]*\.recent-raid-main strong[\s\S]*white-space: normal;/);
