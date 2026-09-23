import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import workerApp, {
  adminKeyFromRequest,
  hardenResponse,
  manageTokenFromRequest
} from "../src/index.js";
import {
  adminKeyFromRequest as directAdminKeyFromRequest,
  bad as securityBad,
  hardenResponse as directHardenResponse,
  json as securityJson,
  manageTokenFromRequest as directManageTokenFromRequest
} from "../src/http-security.js";

function read(relative) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const portal = read("../public/index.html");
const landingApp = read("../public/landing-app.js");
const jsonApiClient = read("../public/json-api-client.js");
const adminHtml = read("../public/admin.html");
const adminApp = read("../public/admin-app.js");
const admin = `${adminHtml}\n${adminApp}`;
const manageHtml = read("../public/manage.html");
const plannerApp = read("../public/planner-app.js");
const manage = `${manageHtml}\n${plannerApp}`;
const timezoneValidation = read("../public/timezone-validation.js");
const plannerClient = read("../public/planner-client.js");
const plannerOverlay = read("../public/planner-overlay.js");
const plannerTargetLogic = read("../public/planner-target-logic.js");
const plannerCalendarLogic = read("../public/planner-calendar-logic.js");
const plannerHundoLogic = read("../public/planner-hundo-logic.js");
const plannerBattlePlanLogic = read("../public/planner-battle-plan-logic.js");
const plannerBattleIntel = read("../public/planner-battle-intel.js");
const battleTargetsClient = read("../public/battle-targets.js");
const styles = read("../public/styles.css");
const plannerStyles = read("../public/planner.css");
const worker = read("../src/index.js");
const httpSecurity = read("../src/http-security.js");

const timezoneValidationContext =
  vm.createContext({
    Intl
  });

timezoneValidationContext.globalThis =
  timezoneValidationContext;

vm.runInContext(
  timezoneValidation,
  timezoneValidationContext
);

assert.equal(
  timezoneValidationContext
    .TimezoneValidation
    .parse("Asia/Singapore")
    .valid,
  true
);

assert.equal(
  timezoneValidationContext
    .TimezoneValidation
    .parse("Asia/Singapor")
    .valid,
  false
);

const jsonApiClientContext =
  vm.createContext({
    Headers,
    Request,
    Response
  });

jsonApiClientContext.globalThis =
  jsonApiClientContext;

vm.runInContext(
  jsonApiClient,
  jsonApiClientContext
);

const sharedJsonApiClient =
  jsonApiClientContext
    .JsonApiClient;

assert.ok(
  sharedJsonApiClient,
  "Shared public/Admin JSON API client must initialize"
);

assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      await sharedJsonApiClient
        .readJsonResponse(
          new Response(
            JSON.stringify({
              ok: true
            }),
            {
              status: 200,
              headers: {
                "content-type":
                  "application/json"
              }
            }
          ),
          {
            serviceName:
              "Fixture service"
          }
        )
    )
  ),
  {
    ok: true
  }
);

await assert.rejects(
  sharedJsonApiClient
    .readJsonResponse(
      new Response(
        JSON.stringify({
          error:
            "Specific server guidance"
        }),
        {
          status: 429,
          headers: {
            "content-type":
              "application/json"
          }
        }
      ),
      {
        serviceName:
          "Fixture service"
      }
    ),
  error =>
    error.message ===
      "Specific server guidance" &&
    error.kind ===
      "http" &&
    error.status ===
      429 &&
    error.retryable ===
      true
);

await assert.rejects(
  sharedJsonApiClient
    .readJsonResponse(
      new Response(
        "<!doctype html><title>Gateway exploded</title>",
        {
          status: 503,
          headers: {
            "content-type":
              "text/html"
          }
        }
      ),
      {
        serviceName:
          "Fixture service"
      }
    ),
  error =>
    error.message ===
      "The Fixture service is temporarily unavailable (HTTP 503). Please try again." &&
    !error.message.includes(
      "Gateway exploded"
    ) &&
    !error.message.includes(
      "Unexpected token"
    )
);

await assert.rejects(
  sharedJsonApiClient
    .readJsonResponse(
      new Response(
        "",
        {
          status: 502
        }
      ),
      {
        serviceName:
          "Fixture service"
      }
    ),
  error =>
    error.message ===
      "The Fixture service is temporarily unavailable (HTTP 502). Please try again."
);

await assert.rejects(
  sharedJsonApiClient
    .readJsonResponse(
      new Response(
        "<html>not json</html>",
        {
          status: 200
        }
      ),
      {
        serviceName:
          "Fixture service"
      }
    ),
  error =>
    error.message ===
      "The Fixture service returned an unreadable response. Refresh the page and try again." &&
    error.kind ===
      "invalid-response"
);

await assert.rejects(
  sharedJsonApiClient
    .readJsonResponse(
      new Response(
        "",
        {
          status: 200
        }
      ),
      {
        serviceName:
          "Fixture service"
      }
    ),
  error =>
    error.message ===
      "The Fixture service returned an empty response. Refresh the page and try again." &&
    error.kind ===
      "empty-response"
);

await assert.rejects(
  sharedJsonApiClient
    .fetchJson(
      "/fixture",
      {},
      {
        serviceName:
          "Fixture service",
        fetchImpl:
          async () => {
            throw new TypeError(
              "Failed to fetch"
            );
          }
      }
    ),
  error =>
    error.message ===
      "Could not reach the Fixture service. Check your internet connection and try again." &&
    !error.message.includes(
      "Failed to fetch"
    ) &&
    error.kind ===
      "network"
);

assert.match(
  portal,
  /<script src="\/timezone-validation\.js\?v=1"><\/script>/
);
assert.match(
  manage,
  /<script src="\/timezone-validation\.js\?v=1"><\/script>/
);
assert.match(
  manage,
  /timezone_valid/
);
assert.match(
  worker,
  /from "\.\/timezone\.js"/
);
assert.match(
  worker,
  /canonicalTimeZone\([\s\S]*body\.timezone/
);
assert.match(
  worker,
  /timezone_valid:[\s\S]*isValidTimeZone/
);

assert.match(manage, /Pokémon GO Battle Planner/);
assert.match(manage, /PERSONAL BATTLE STRATEGY/);
assert.match(manage, /nav-label-desktop">Battle Plan/);
assert.match(manage, /nav-label-mobile">Plan/);
assert.match(manage, /<script src="\/planner-client\.js\?v=3"><\/script>/);
assert.match(manage, /<script src="\/planner-overlay\.js\?v=1"><\/script>/);
assert.match(manage, /<link rel="stylesheet" href="\/planner\.css\?v=3">/);
assert.match(manage, /<script src="\/planner-target-logic\.js\?v=1"><\/script>/);
assert.match(manage, /<script src="\/planner-calendar-logic\.js\?v=1"><\/script>/);
assert.match(manage, /<script src="\/planner-hundo-logic\.js\?v=2"><\/script>/);
assert.match(manage, /<script src="\/planner-battle-plan-logic\.js\?v=1"><\/script>/);
assert.match(manage, /<script src="\/planner-battle-intel\.js\?v=1"><\/script>/);
assert.match(manage, /<script src="\/planner-app\.js\?v=4"><\/script>/);
assert.match(manage, /PlannerBattleIntel/);
const plannerTablistMarkup =
  manageHtml.match(
    /<nav[^>]*role="tablist"[^>]*>[\s\S]*?<\/nav>/
  )?.[0] || "";

assert.ok(
  plannerTablistMarkup,
  "Planner must expose a tablist"
);
assert.doesNotMatch(
  plannerTablistMarkup,
  /mobileMoreButton/,
  "Mobile More must not live inside the ARIA tablist"
);
assert.match(
  manageHtml,
  /<\/nav>\s*<button\s+id="mobileMoreButton"[\s\S]*aria-expanded="false"[\s\S]*aria-controls="mobileMoreSheet"/
);
assert.doesNotMatch(
  manageHtml.match(
    /<button\s+id="mobileMoreButton"[\s\S]*?<\/button>/
  )?.[0] || "",
  /role="tab"|aria-selected|data-tab=/,
  "Mobile More must remain a non-tab disclosure button"
);

for (const [name, expectedTabIndex] of [
  ["plan", "0"],
  ["targets", "-1"],
  ["hundo", "-1"],
  ["preferences", "-1"],
  ["calendar", "-1"]
]) {
  assert.match(
    plannerTablistMarkup,
    new RegExp(
      `id="tab-${name}"[\\s\\S]*role="tab"[\\s\\S]*aria-controls="panel-${name}"[\\s\\S]*tabindex="${expectedTabIndex}"`
    )
  );

  assert.match(
    manageHtml,
    new RegExp(
      `id="panel-${name}"[\\s\\S]*role="tabpanel"[\\s\\S]*aria-labelledby="tab-${name}"`
    )
  );
}

assert.match(
  plannerApp,
  /function syncPlannerTabState\(name\)[\s\S]*button\.tabIndex[\s\S]*rovingTab/
);
assert.match(
  plannerApp,
  /function handlePlannerTabKeydown[\s\S]*"ArrowRight"[\s\S]*"ArrowLeft"[\s\S]*"Home"[\s\S]*"End"/
);
assert.match(
  plannerApp,
  /nextTab\.focus\([\s\S]*preventScroll:[\s\S]*true[\s\S]*activateTab\([\s\S]*nextTab\.dataset\.tab[\s\S]*false/
);
assert.match(
  plannerApp,
  /plannerTabButtons\(\)[\s\S]*addEventListener\([\s\S]*"click"[\s\S]*addEventListener\([\s\S]*"keydown"[\s\S]*handlePlannerTabKeydown/
);
assert.match(
  plannerStyles,
  /#mobileMoreButton[\s\S]*position:\s*fixed[\s\S]*width:[\s\S]*100vw[\s\S]*\/ 5/
);
assert.match(
  manageHtml,
  /id="targetActionStatus"[\s\S]*role="status"[\s\S]*aria-live="polite"/
);
assert.match(
  plannerApp,
  /async function removeTarget\(id\)[\s\S]*try \{[\s\S]*await api\([\s\S]*method:[\s\S]*"DELETE"[\s\S]*await load\(\)[\s\S]*activateTab\([\s\S]*"targets"[\s\S]*catch \(error\)[\s\S]*Could not delete/
);
assert.match(
  plannerApp,
  /document\.getElementById\("targets"\)\.addEventListener\("click", async event => \{/
);
assert.match(
  plannerApp,
  /await removeTarget\([\s\S]*remove\.dataset\.deleteTarget/
);
assert.doesNotMatch(manage, /const TYPE_RELATIONS =/);
assert.doesNotMatch(manage, /function defendingTypeMultipliers\(/);
assert.match(manage, /PlannerBattlePlanLogic\.create/);
assert.doesNotMatch(manage, /function scoreTone\(/);
assert.doesNotMatch(manage, /function compactZeroAllocationReason\(/);
assert.doesNotMatch(manage, /function maxTierCostLabel\(/);
assert.match(manage, /PlannerHundoLogic/);
assert.doesNotMatch(manage, /const CP_MULTIPLIERS =/);
assert.doesNotMatch(manage, /function hundoCp\(/);
assert.doesNotMatch(manage, /function hundoBenchmarkData\(/);
assert.match(manage, /PlannerCalendarLogic/);
assert.doesNotMatch(manage, /function parseIsoDate\(/);
assert.doesNotMatch(manage, /function monthKeyFromDate\(/);
assert.doesNotMatch(manage, /function addMonthsUtc\(/);
assert.match(manage, /PlannerTargetLogic\.create/);
assert.doesNotMatch(manage, /function targetPriorityRank/);
assert.match(manage, /const \{[\s\S]*token,[\s\S]*api,[\s\S]*esc,[\s\S]*formatNumber[\s\S]*\} = PlannerClient;/);
assert.doesNotMatch(manage, /function managedApiRequest/);
assert.doesNotMatch(manage, /function api\(path, options/);
assert.doesNotMatch(manage, /function esc\(value\)/);
assert.doesNotMatch(manage, /function formatNumber\(value\)/);

assert.match(manage, /data-battle-filter="all"/);
assert.match(manage, /data-battle-filter="raid"/);
assert.match(manage, /data-battle-filter="max"/);
assert.match(manage, />\s*Max Battles\s*</);
assert.match(manage, /battlePlanFilter/);
assert.match(manage, /remoteRaidZeroDetails/);
assert.match(manage, /Battles receiving 0 Remote allocation/);
assert.match(manage, /function zeroAllocationItems/);
assert.match(plannerBattlePlanLogic, /function compactZeroAllocationReason/);
assert.match(manage, /function renderZeroAllocationDetails/);
assert.match(manage, /No Remote Max allocation/);
assert.match(manage, /No Remote Raid allocation/);
assert.match(plannerBattlePlanLogic, /max_particle_cost_unknown/);
assert.match(plannerBattlePlanLogic, /Priority set to Skip/);
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

assert.match(plannerStyles, /Battle Plan \/ Max Battle UI — v31/);
assert.match(plannerStyles, /\.battle-plan-filter/);
assert.match(plannerStyles, /\.battle-filter-button/);
assert.match(plannerStyles, /min-height:\s*44px/);
assert.match(plannerStyles, /\.nav-label-mobile/);
assert.match(plannerStyles, /@media \(max-width: 700px\)/);

for (const page of [
  "../public/manage.html",
  "../public/index.html",
  "../public/admin.html",
  "../public/sources.html"
]) {
  assert.match(read(page), /styles\.css\?v=42/);
}

assert.match(
  manage,
  /<link rel="stylesheet" href="\/planner\.css\?v=3">/
);
for (const page of [
  "../public/index.html",
  "../public/admin.html",
  "../public/sources.html"
]) {
  assert.doesNotMatch(
    read(page),
    /planner\.css/
  );
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

// BL-017: the Planner must remain executable with script-src 'self' only.
assert.match(
  manageHtml,
  /<script src="\/planner-app\.js\?v=4"><\/script>/
);

const inlineScripts = [
  ...manageHtml.matchAll(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
  )
]
  .map(match => match[1])
  .filter(script => script.trim());

assert.equal(
  inlineScripts.length,
  0,
  "Planner HTML must not contain executable inline script blocks"
);

assert.doesNotMatch(
  manageHtml,
  /\son[a-z]+\s*=\s*["']/i,
  "Planner HTML must not contain inline event handlers"
);

assert.doesNotMatch(
  plannerApp,
  /\son[a-z]+\s*=\s*["']/i,
  "Planner-generated markup must not reintroduce inline event handlers"
);

assert.match(
  plannerApp,
  /data-hide-on-error="true"/
);

assert.match(
  plannerApp,
  /document\.addEventListener\([\s\S]*"error"/
);

new vm.Script(
  plannerApp,
  {
    filename:
      "planner-app.js"
  }
);

new vm.Script(
  plannerClient,
  {
    filename:
      "planner-client.js"
  }
);

new vm.Script(
  plannerTargetLogic,
  {
    filename:
      "planner-target-logic.js"
  }
);

new vm.Script(
  plannerCalendarLogic,
  {
    filename:
      "planner-calendar-logic.js"
  }
);

new vm.Script(
  plannerHundoLogic,
  {
    filename:
      "planner-hundo-logic.js"
  }
);

new vm.Script(
  plannerBattlePlanLogic,
  {
    filename:
      "planner-battle-plan-logic.js"
  }
);

new vm.Script(
  plannerBattleIntel,
  {
    filename:
      "planner-battle-intel.js"
  }
);

const plannerClientContext = {
  location: {
    pathname:
      "/manage/browser-test-token",
    origin:
      "https://planner.example"
  },
  URL,
  Headers,
  Response,
  fetch:
    async (
      url,
      options
    ) =>
      new Response(
        JSON.stringify({
          url,
          authorization:
            options.headers.get(
              "authorization"
            ),
          body:
            options.body
        }),
        {
          status: 200,
          headers: {
            "content-type":
              "application/json"
          }
        }
      )
};

vm.createContext(
  plannerClientContext
);

new vm.Script(
  plannerClient,
  {
    filename:
      "planner-client.js"
  }
).runInContext(
  plannerClientContext
);

const plannerClientApi =
  plannerClientContext
    .PlannerClient;

assert.equal(
  plannerClientApi.token,
  "browser-test-token"
);

assert.equal(
  plannerClientApi.managementTokenFromPath(
    "/manage/example-token/"
  ),
  "example-token"
);

const initialManagedApiResult =
  await plannerClientApi.api(
    "/api/example"
  );

assert.equal(
  initialManagedApiResult.authorization,
  "Bearer browser-test-token"
);

plannerClientApi.setToken(
  "rotated-browser-token"
);

assert.equal(
  plannerClientApi.token,
  "rotated-browser-token"
);

const rotatedManagedApiResult =
  await plannerClientApi.api(
    "/api/example"
  );

assert.equal(
  rotatedManagedApiResult.authorization,
  "Bearer rotated-browser-token",
  "The shared Planner API client must switch immediately to a rotated management capability"
);

plannerClientApi.setToken(
  "browser-test-token"
);

const preparedManagedRequest =
  plannerClientApi
    .buildManagedApiRequest({
      token:
        "header-token",
      path:
        "/api/example?token=query-token&month=2026-09",
      origin:
        "https://planner.example",
      options: {
        method:
          "POST",
        headers: {
          "content-type":
            "application/json"
        },
        body:
          JSON.stringify({
            token:
              "body-token",
            value:
              7
          })
      }
    });

assert.equal(
  preparedManagedRequest.url,
  "/api/example?month=2026-09"
);

assert.equal(
  preparedManagedRequest
    .options
    .headers
    .get(
      "authorization"
    ),
  "Bearer header-token"
);

assert.deepEqual(
  JSON.parse(
    preparedManagedRequest
      .options
      .body
  ),
  {
    value: 7
  }
);

assert.equal(
  preparedManagedRequest
    .options
    .referrerPolicy,
  "no-referrer"
);

assert.match(
  plannerClient,
  /class PlannerApiError/
);
assert.match(
  plannerClient,
  /async function readApiResponse/
);
assert.match(
  plannerClient,
  /Could not reach the Planner service/
);
assert.match(
  plannerClient,
  /returned an empty response/
);
assert.match(
  plannerClient,
  /returned an unreadable response/
);

async function plannerApiFailure(
  responseOrError
) {
  const api =
    plannerClientApi
      .createApiClient({
        token:
          "failure-test-token",
        origin:
          "https://planner.example",
        fetchImpl:
          async () => {
            if (
              responseOrError instanceof
                Error
            ) {
              throw responseOrError;
            }

            return responseOrError;
          }
      });

  try {
    await api(
      "/api/failure"
    );
  } catch (error) {
    return error;
  }

  assert.fail(
    "Expected Planner API failure"
  );
}

const structuredApiError =
  await plannerApiFailure(
    new Response(
      JSON.stringify({
        error:
          "Fixture validation failed."
      }),
      {
        status: 400,
        headers: {
          "content-type":
            "application/json"
        }
      }
    )
  );

assert.equal(
  structuredApiError.message,
  "Fixture validation failed."
);
assert.equal(
  structuredApiError.kind,
  "http"
);
assert.equal(
  structuredApiError.status,
  400
);
assert.equal(
  structuredApiError.retryable,
  false
);

const htmlServerError =
  await plannerApiFailure(
    new Response(
      "<!doctype html><title>Upstream failure</title>",
      {
        status: 503,
        headers: {
          "content-type":
            "text/html"
        }
      }
    )
  );

assert.equal(
  htmlServerError.message,
  "The Planner service is temporarily unavailable (HTTP 503). Please try again."
);
assert.equal(
  htmlServerError.kind,
  "http"
);
assert.equal(
  htmlServerError.status,
  503
);
assert.equal(
  htmlServerError.retryable,
  true
);
assert.doesNotMatch(
  htmlServerError.message,
  /Upstream failure/
);

const emptyServerError =
  await plannerApiFailure(
    new Response(
      "",
      {
        status: 502
      }
    )
  );

assert.equal(
  emptyServerError.message,
  "The Planner service is temporarily unavailable (HTTP 502). Please try again."
);

const emptySuccessError =
  await plannerApiFailure(
    new Response(
      "",
      {
        status: 200
      }
    )
  );

assert.equal(
  emptySuccessError.kind,
  "empty-response"
);
assert.equal(
  emptySuccessError.message,
  "The Planner service returned an empty response. Refresh the page and try again."
);

const invalidSuccessError =
  await plannerApiFailure(
    new Response(
      "not json",
      {
        status: 200,
        headers: {
          "content-type":
            "text/plain"
        }
      }
    )
  );

assert.equal(
  invalidSuccessError.kind,
  "invalid-response"
);
assert.equal(
  invalidSuccessError.message,
  "The Planner service returned an unreadable response. Refresh the page and try again."
);

const networkApiError =
  await plannerApiFailure(
    new TypeError(
      "fixture connection reset"
    )
  );

assert.equal(
  networkApiError.kind,
  "network"
);
assert.equal(
  networkApiError.status,
  null
);
assert.equal(
  networkApiError.retryable,
  true
);
assert.equal(
  networkApiError.message,
  "Could not reach the Planner service. Check your internet connection and try again."
);
assert.doesNotMatch(
  networkApiError.message,
  /connection reset/
);

const unauthorizedApiError =
  await plannerApiFailure(
    new Response(
      "",
      {
        status: 401
      }
    )
  );

assert.equal(
  unauthorizedApiError.message,
  "This Planner link is no longer authorized. Open your current private management link and try again."
);

assert.equal(
  plannerClientApi.esc(
    "<&\"'"
  ),
  "&lt;&amp;&quot;&#39;"
);

assert.equal(
  plannerClientApi.formatNumber(
    "not-a-number"
  ),
  "—"
);

const battleIntelContext = {};
vm.createContext(
  battleIntelContext
);

new vm.Script(
  plannerBattleIntel,
  {
    filename:
      "planner-battle-intel.js"
  }
).runInContext(
  battleIntelContext
);

const battleIntel =
  battleIntelContext
    .PlannerBattleIntel;

const rhyhornMatchups =
  battleIntel.matchupGroups([
    "Ground",
    "Rock"
  ]);

assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      rhyhornMatchups
        .extraWeak
        .map(
          item => [
            item.type,
            item.multiplier
          ]
        )
    )
  ),
  [
    ["Water", 2.5600000000000005],
    ["Grass", 2.5600000000000005]
  ],
  "Ground/Rock must retain the compounded 2.56x Water and Grass weaknesses"
);

assert.equal(
  rhyhornMatchups
    .resist
    .find(
      item =>
        item.type ===
        "Electric"
    )
    .multiplier,
  0.390625,
  "Ground immunity should remain represented by the Pokémon GO immunity multiplier"
);

const bossFixture = {
  name: "Dynamax Rhyhorn",
  types: [
    "Ground",
    "Rock"
  ]
};

const encounterFixture = {
  name: "Rhyhorn",
  attack: 140,
  defense: 127,
  stamina: 190,
  types: [
    "Ground",
    "Rock"
  ]
};

const builtIntel =
  battleIntel.buildBattleIntel({
    boss:
      bossFixture,
    encounter:
      encounterFixture,
    hundoCp:
      (entry, level) =>
        `${entry.name}-${level}`
  });

assert.equal(
  builtIntel.boss,
  bossFixture
);

assert.equal(
  builtIntel.encounter,
  encounterFixture
);

assert.equal(
  builtIntel.normalCp,
  "Rhyhorn-20",
  "Hundo CP must use the encounter form rather than the Max battle-form object"
);

assert.equal(
  builtIntel.boostedCp,
  "Rhyhorn-25"
);

const battlePlanContext = {};
vm.createContext(
  battlePlanContext
);

new vm.Script(
  battleTargetsClient,
  {
    filename:
      "battle-targets.js"
  }
).runInContext(
  battlePlanContext
);

new vm.Script(
  plannerBattlePlanLogic,
  {
    filename:
      "planner-battle-plan-logic.js"
  }
).runInContext(
  battlePlanContext
);

const battlePlanLogic =
  battlePlanContext
    .PlannerBattlePlanLogic
    .create({
      battleTargets:
        battlePlanContext
          .BattleTargets,
      normalizeName:
        value =>
          String(
            value || ""
          )
            .toLowerCase()
            .trim(),
      formatNumber:
        value =>
          Number(value)
            .toLocaleString(
              "en-US"
            )
    });

assert.equal(
  battlePlanLogic.scoreTone(
    85
  ),
  "tone-fire"
);

assert.equal(
  battlePlanLogic.scoreTone(
    74
  ),
  "tone-good"
);

assert.equal(
  battlePlanLogic.maxTierCostLabel({
    max_battle_tier: 5,
    max_particle_cost: 800
  }),
  "Tier 5 · 800 MP"
);

assert.equal(
  battlePlanLogic.maxTierCostLabel({}),
  "MP cost unknown"
);

const mergedZeroItems =
  battlePlanLogic
    .mergeZeroAllocationItems({
      remoteRaidPlan: {
        not_allocated: [
          {
            pokemon_name:
              "Moltres",
            reason:
              "Legacy reason"
          }
        ]
      },
      battleResourcePlan: {
        not_allocated: [
          {
            pokemon_name:
              "Moltres",
            battle_system:
              "raid",
            reason_code:
              "priority_skip",
            reason:
              "Personal priority is set to Skip."
          },
          {
            pokemon_name:
              "Dynamax Zapdos",
            battle_system:
              "max",
            battle_variant:
              "dynamax",
            reason_code:
              "max_particle_cost_unknown",
            reason:
              "Max Particle cost is unknown."
          }
        ]
      }
    });

assert.equal(
  mergedZeroItems.length,
  2,
  "Shared Battle Resource entries must override the legacy Raid fallback by battle identity"
);

assert.equal(
  battlePlanLogic.compactZeroAllocationReason(
    mergedZeroItems.find(
      item =>
        item.pokemon_name ===
        "Moltres"
    )
  ),
  "Priority set to Skip"
);

assert.equal(
  battlePlanLogic.compactZeroAllocationReason(
    mergedZeroItems.find(
      item =>
        item.battle_system ===
        "max"
    )
  ),
  "MP cost unknown"
);

assert.equal(
  battlePlanLogic.zeroAllocationSystemLabel({
    battle_system:
      "max"
  }),
  "Max Battle"
);

const battlePlanView =
  battlePlanLogic
    .recommendationViewModel({
      recommendations: [
        {
          pokemon_name:
            "Mega Venusaur",
          battle_system:
            "raid"
        },
        {
          pokemon_name:
            "Dynamax Zapdos",
          battle_system:
            "max",
          battle_variant:
            "dynamax"
        },
        {
          pokemon_name:
            "Moltres",
          battle_system:
            "raid"
        },
        {
          pokemon_name:
            "Dynamax Articuno",
          battle_system:
            "max",
          battle_variant:
            "dynamax"
        },
        {
          pokemon_name:
            "Shadow Thundurus",
          battle_system:
            "raid"
        }
      ],
      filter:
        "all",
      remoteRaidPlan: {
        allocations: [
          {
            pokemon_name:
              "Mega Venusaur",
            count: 1
          }
        ],
        not_allocated: []
      },
      battleResourcePlan: {
        allocations: [
          {
            pokemon_name:
              "Dynamax Zapdos",
            battle_system:
              "max",
            battle_variant:
              "dynamax",
            count: 2
          }
        ],
        not_allocated:
          mergedZeroItems
    }
  });

assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      battlePlanView.counts
    )
  ),
  {
    all: 5,
    raid: 3,
    max: 2
  }
);

assert.equal(
  battlePlanView.primary.length,
  4
);

assert.equal(
  battlePlanView.additional.length,
  1
);

assert.equal(
  battlePlanView
    .legacyAllocationByName
    .get(
      "mega venusaur"
    )
    .count,
  1
);

assert.equal(
  battlePlanView
    .sharedAllocationByKey
    .get(
      battlePlanContext
        .BattleTargets
        .key({
          pokemon_name:
            "Dynamax Zapdos",
          battle_system:
            "max",
          battle_variant:
            "dynamax"
        })
    )
    .count,
  2
);

assert.equal(
  battlePlanLogic
    .filterRecommendations(
      battlePlanView.visible,
      "max"
    ).length,
  2
);

const hundoLogicContext = {};
vm.createContext(
  hundoLogicContext
);

new vm.Script(
  plannerHundoLogic,
  {
    filename:
      "planner-hundo-logic.js"
  }
).runInContext(
  hundoLogicContext
);

const hundoLogic =
  hundoLogicContext
    .PlannerHundoLogic;

const mewtwoStats = {
  name: "Mewtwo",
  dex_nr: 150,
  attack: 300,
  defense: 182,
  stamina: 214
};

assert.equal(
  hundoLogic.hundoCp(
    mewtwoStats,
    20
  ),
  2387,
  "Mewtwo Lv20 Hundo raid CP must remain 2387"
);

assert.equal(
  hundoLogic.hundoCp(
    mewtwoStats,
    25
  ),
  2984,
  "Mewtwo Lv25 weather-boosted Hundo raid CP must remain 2984"
);

assert.equal(
  hundoLogic.hundoCp(
    mewtwoStats,
    20.25
  ),
  null,
  "Custom Hundo levels only support 0.5-level steps"
);

const levelOnePointFiveCpm =
  hundoLogic.cpMultiplierForLevel(
    1.5
  );

assert.ok(
  Math.abs(
    levelOnePointFiveCpm -
      0.13513743215803847
  ) < 1e-12,
  "Lv1.5 CPM must use the Pokémon GO half-level root-mean-square formula"
);

assert.equal(
  hundoLogic.hundoCp(
    mewtwoStats,
    1.5
  ),
  122,
  "Mewtwo Lv1.5 Hundo CP must use the canonical half-level CPM"
);

assert.equal(
  hundoLogic.cpMultiplierForLevel(
    50.5
  ),
  null
);

const hundoBenchmarks =
  hundoLogic.benchmarkData(
    mewtwoStats
  );

assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      hundoBenchmarks.map(
        item => [
          item.level,
          item.cp
        ]
      )
    )
  ),
  [
    [15, 1791],
    [20, 2387],
    [25, 2984],
    [30, 3582],
    [35, 3880],
    [40, 4178],
    [50, 4724]
  ]
);

const hundoCatalog = [
  {
    key: "mewtwo",
    name: "Mewtwo",
    dex_nr: 150
  },
  {
    key: "mew",
    name: "Mew",
    dex_nr: 151
  },
  {
    key: "mewtwo-armored",
    name: "Armored Mewtwo",
    dex_nr: 150
  }
];

assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      hundoLogic
        .searchMatches(
          hundoCatalog,
          "#150"
        )
        .map(
          entry =>
            entry.key
        )
    )
  ),
  [
    "mewtwo-armored",
    "mewtwo"
  ]
);

assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      hundoLogic
        .searchMatches(
          hundoCatalog,
          "mew"
        )
        .map(
          entry =>
            entry.key
        )
    )
  ),
  [
    "mew",
    "mewtwo",
    "mewtwo-armored"
  ],
  "Exact Hundo search matches must rank ahead of prefixes and contains matches"
);

const calendarLogicContext = {};
vm.createContext(
  calendarLogicContext
);

new vm.Script(
  plannerCalendarLogic,
  {
    filename:
      "planner-calendar-logic.js"
  }
).runInContext(
  calendarLogicContext
);

const calendarLogic =
  calendarLogicContext
    .PlannerCalendarLogic;

assert.equal(
  calendarLogic.isoDateFromUtc(
    calendarLogic.parseIsoDate(
      "2026-09-20"
    )
  ),
  "2026-09-20"
);

assert.equal(
  calendarLogic.monthKeyFromDate(
    calendarLogic.parseIsoDate(
      "2026-09-20"
    )
  ),
  "2026-09"
);

assert.equal(
  calendarLogic.monthTitleFromDate(
    calendarLogic.parseIsoDate(
      "2026-09-20"
    )
  ),
  "September 2026"
);

assert.equal(
  calendarLogic.isoDateFromUtc(
    calendarLogic.addMonthsUtc(
      calendarLogic.parseIsoDate(
        "2026-09-20"
      ),
      1
    )
  ),
  "2026-10-01"
);

const calendarEvents = [
  {
    id: "multi",
    title: "Multi-day Event",
    start_date: "2026-09-19",
    end_date: "2026-09-21",
    source_type: "max_battles"
  },
  {
    id: "single",
    title: "Single Day",
    start_date: "2026-09-20",
    end_date: "2026-09-20",
    source_type: "raid_hour"
  }
];

assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      calendarLogic
        .eventsForDate(
          calendarEvents,
          "2026-09-20"
        )
        .map(
          event =>
            event.id
        )
    )
  ),
  ["multi", "single"]
);

assert.equal(
  calendarLogic.sourceClass(
    "Max Battles!"
  ),
  "calendar-source-MaxBattles"
);

const septemberGrid =
  calendarLogic.monthGrid({
    monthDate:
      calendarLogic.parseIsoDate(
        "2026-09-01"
      ),
    events:
      calendarEvents,
    todayIso:
      "2026-09-20",
    selectedDate:
      "2026-09-21"
  });

assert.equal(
  septemberGrid.length,
  42
);

assert.equal(
  calendarLogic.isoDateFromUtc(
    septemberGrid[0].date
  ),
  "2026-08-31",
  "Month grid must begin on Monday"
);

const september20 =
  septemberGrid.find(
    cell =>
      cell.dateIso ===
      "2026-09-20"
  );

assert.equal(
  september20.isToday,
  true
);

assert.equal(
  september20.events.length,
  2
);

assert.equal(
  septemberGrid.find(
    cell =>
      cell.dateIso ===
      "2026-09-21"
  ).selected,
  true
);

const targetLogicContext = {};
vm.createContext(
  targetLogicContext
);

new vm.Script(
  battleTargetsClient,
  {
    filename:
      "battle-targets.js"
  }
).runInContext(
  targetLogicContext
);

new vm.Script(
  plannerTargetLogic,
  {
    filename:
      "planner-target-logic.js"
  }
).runInContext(
  targetLogicContext
);

const normalizeTargetName =
  value =>
    String(
      value || ""
    )
      .toLowerCase()
      .trim();

const targetLogic =
  targetLogicContext
    .PlannerTargetLogic
    .create({
      battleTargets:
        targetLogicContext
          .BattleTargets,
      normalizeName:
        normalizeTargetName,
      formatNumber:
        value =>
          Number(value)
            .toLocaleString(
              "en-US"
            )
    });

const targetFixtures = [
  {
    id: "a",
    pokemon_name:
      "Dynamax Moltres",
    battle_kind:
      "dynamax",
    target_type:
      "battles",
    current_value: 2,
    target_value: 5,
    priority: "high",
    completed: 0,
    updated_at:
      "2026-09-20T10:00:00Z"
  },
  {
    id: "b",
    pokemon_name:
      "Dynamax Zapdos",
    battle_kind:
      "dynamax",
    target_type:
      "battles",
    current_value: 5,
    target_value: 5,
    priority: "medium",
    completed: 1,
    updated_at:
      "2026-09-20T11:00:00Z"
  },
  {
    id: "c",
    pokemon_name:
      "Mega Venusaur",
    battle_kind:
      "raid",
    target_type:
      "mega_energy",
    current_value: 100,
    target_value: 200,
    priority: "low",
    completed: 0,
    updated_at:
      "2026-09-20T12:00:00Z"
  }
];

const targetOptions = {
  current: [
    {
      pokemon_name:
        "Dynamax Moltres",
      battle_kind:
        "dynamax"
    }
  ],
  upcoming: [
    {
      pokemon_name:
        "Mega Venusaur",
      battle_kind:
        "raid"
    }
  ]
};

const plainTargetValue =
  value =>
    JSON.parse(
      JSON.stringify(
        value
      )
    );

assert.deepEqual(
  plainTargetValue(
    targetLogic.progress(
      targetFixtures[0]
    )
  ),
  {
    percent: 40,
    label: "2 / 5",
    known: true
  }
);

assert.equal(
  targetLogic.availability(
    targetFixtures[0],
    targetOptions
  ),
  "now"
);

assert.equal(
  targetLogic.availability(
    targetFixtures[2],
    targetOptions
  ),
  "upcoming"
);

const dynamaxView =
  targetLogic.viewModel({
    targets:
      targetFixtures,
    targetOptions,
    filterState: {
      status: "active",
      search: "",
      type: "all",
      battle: "dynamax",
      priority: "all",
      availability: "all",
      sort: "priority"
    }
  });

assert.deepEqual(
  plainTargetValue(
    dynamaxView.counts
  ),
  {
    active: 1,
    completed: 1,
    all: 2
  },
  "Target status counts must reflect the current non-status filters"
);

assert.deepEqual(
  plainTargetValue(
    dynamaxView
      .visibleTargets
      .map(
        target =>
          target.id
      )
  ),
  ["a"]
);

const allDynamaxView =
  targetLogic.viewModel({
    targets:
      targetFixtures,
    targetOptions,
    filterState: {
      status: "all",
      search: "",
      type: "all",
      battle: "dynamax",
      priority: "all",
      availability: "all",
      sort: "priority"
    }
  });

assert.deepEqual(
  plainTargetValue(
    allDynamaxView
      .visibleTargets
      .map(
        target =>
          target.id
      )
  ),
  ["a", "b"]
);

assert.deepEqual(
  plainTargetValue(
    allDynamaxView
      .groups
      .needsAttention
      .map(
        target =>
          target.id
      )
  ),
  ["a"]
);

assert.deepEqual(
  plainTargetValue(
    targetLogic
      .sortTargets({
        targets:
          targetFixtures,
        filterState: {
          status: "all",
          search: "",
          type: "all",
          battle: "all",
          priority: "all",
          availability: "all",
          sort: "closest"
        },
        targetOptions
      })
      .map(
        target =>
          target.id
      )
  ),
  ["b", "c", "a"]
);

const plannerApiResponse =
  await plannerClientApi.api(
    "/api/me?token=legacy"
  );

assert.equal(
  plannerApiResponse.url,
  "/api/me"
);

assert.equal(
  plannerApiResponse.authorization,
  "Bearer browser-test-token"
);

plannerClientContext.fetch =
  async () =>
    new Response(
      JSON.stringify({
        error:
          "Fixture request failed."
      }),
      {
        status: 400,
        headers: {
          "content-type":
            "application/json"
        }
      }
    );

await assert.rejects(
  () =>
    plannerClientApi.api(
      "/api/failure"
    ),
  /Fixture request failed\./
);

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
assert.match(plannerBattlePlanLogic, /MP cost unknown/);
assert.match(plannerStyles, /PAID BATTLE FORECAST EXPANSION · v38/);
assert.match(plannerStyles, /\.forecast-expand-button/);
assert.match(plannerStyles, /\.forecast-detail-row/);
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
assert.match(plannerBattlePlanLogic, /MP cost unknown/);
assert.match(manage, /Remote Max battle/);
assert.match(plannerStyles, /Battle resource planning — v32/);
assert.match(worker, /battle_resource_plan/);
assert.match(worker, /battleResourcePlanForUser/);
assert.match(worker, /updateBattleResourcesApi/);
assert.match(worker, /max_particle_cost/);
assert.match(worker, /POGO_API_MAX_BATTLES/);
assert.match(worker, /currentMaxBattleTiersFromPayload/);
assert.match(worker, /max_battle_cost_overrides/);
assert.match(worker, /updateMaxBattleCostOverrideApi/);

assert.match(plannerClient, /headers\.set\([\s\S]*"authorization"[\s\S]*Bearer/);
assert.match(plannerClient, /url\.searchParams\.delete\([\s\S]*"token"/);
assert.match(plannerClient, /delete parsed\.token/);
assert.match(plannerClient, /globalThis\.PlannerClient/);
assert.match(plannerClient, /function buildManagedApiRequest/);

assert.match(plannerOverlay, /function focusableElements/);
assert.match(plannerOverlay, /function isolateBackground/);
assert.match(plannerOverlay, /event\.key ===[\s\S]*"Escape"/);
assert.match(plannerOverlay, /event\.key !==[\s\S]*"Tab"/);
assert.match(plannerOverlay, /stopImmediatePropagation/);
assert.match(plannerOverlay, /element\.inert = true/);
assert.match(manage, /PlannerOverlay\.open/);
assert.match(manage, /PlannerOverlay\.close/);
assert.match(manage, /role",[\s\S]*"dialog"/);
assert.doesNotMatch(
  manage,
  /event\.key === "Escape" && !document\.getElementById\("targetModal"\)/
);
assert.match(plannerStyles, /:focus-visible/);
assert.match(plannerStyles, /prefers-reduced-motion: reduce/);
assert.match(plannerStyles, /transition-duration: 0\.01ms/);
assert.match(plannerStyles, /command-palette-open/);
assert.match(plannerClient, /function createApiClient/);
assert.match(plannerClient, /function setToken/);
assert.match(plannerClient, /tokenProvider/);
assert.doesNotMatch(manage, /\/api\/me\?token=/);
assert.doesNotMatch(manage, /\/api\/calendar-events\?token=/);
assert.doesNotMatch(manage, /\/api\/feed-link\?token=/);
assert.doesNotMatch(manage, /\/api\/targets\?token=/);

assert.match(
  portal,
  /<script src="\/json-api-client\.js\?v=1"><\/script>/
);
assert.match(
  portal,
  /<script src="\/landing-app\.js\?v=2"><\/script>/
);
assert.match(
  adminHtml,
  /<script src="\/json-api-client\.js\?v=1"><\/script>/
);
assert.match(
  adminHtml,
  /<script src="\/admin-app\.js\?v=2"><\/script>/
);

for (const [name, html] of [
  ["landing", portal],
  ["Admin", adminHtml]
]) {
  const inlineScripts = [
    ...html.matchAll(
      /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
    )
  ]
    .map(match => match[1])
    .filter(script => script.trim());

  assert.equal(
    inlineScripts.length,
    0,
    `${name} HTML must not contain executable inline script blocks`
  );

  assert.doesNotMatch(
    html,
    /\son[a-z]+\s*=\s*["']/i,
    `${name} HTML must not contain inline event handlers`
  );
}

assert.match(
  landingApp,
  /JsonApiClient\.fetchJson/
);
assert.match(
  adminApp,
  /JsonApiClient\.fetchJson/
);
assert.doesNotMatch(
  landingApp,
  /response\.json\(/
);
assert.doesNotMatch(
  adminApp,
  /response\.json\(/
);
assert.match(admin, /"x-admin-key"/);
assert.match(admin, /delete parsed\.key/);
assert.doesNotMatch(admin, /\/api\/admin\/meta\?key=/);
assert.doesNotMatch(admin, /\/api\/admin\/remote-limits\?key=/);
assert.doesNotMatch(admin, /\/api\/admin\/official-raids\?key=/);
assert.doesNotMatch(admin, /\/api\/admin\/suppressions\?key=/);

assert.match(worker, /from "\.\/http-security\.js"/);
assert.match(worker, /manageTokenFromRequest/);
assert.match(worker, /adminKeyFromRequest/);
assert.doesNotMatch(worker, /const HTML_CONTENT_SECURITY_POLICY/);
assert.match(httpSecurity, /content-security-policy/);
assert.match(httpSecurity, /frame-ancestors 'none'/);
assert.match(httpSecurity, /referrer-policy/);
assert.match(httpSecurity, /x-frame-options/);
assert.match(httpSecurity, /permissions-policy/);
assert.match(httpSecurity, /private, no-store, max-age=0/);

assert.equal(
  manageTokenFromRequest,
  directManageTokenFromRequest,
  "src/index.js must preserve the management-token helper re-export"
);
assert.equal(
  adminKeyFromRequest,
  directAdminKeyFromRequest,
  "src/index.js must preserve the admin-key helper re-export"
);
assert.equal(
  hardenResponse,
  directHardenResponse,
  "src/index.js must preserve the response-hardening helper re-export"
);

const securityJsonResponse =
  securityJson({
    ok: true
  });
assert.equal(
  securityJsonResponse.status,
  200
);
assert.match(
  securityJsonResponse.headers.get(
    "content-type"
  ) || "",
  /application\/json/
);
assert.equal(
  securityJsonResponse.headers.get(
    "referrer-policy"
  ),
  "no-referrer"
);

const securityBadResponse =
  securityBad(
    "Fixture error",
    418
  );
assert.equal(
  securityBadResponse.status,
  418
);

const internalFailure =
  new Error(
    "Sensitive D1 implementation detail"
  );
const loggedUnexpectedErrors = [];
const originalConsoleError =
  console.error;

let unexpectedFailureResponse;

try {
  console.error =
    (...args) =>
      loggedUnexpectedErrors.push(
        args
      );

  unexpectedFailureResponse =
    await workerApp.fetch(
      new Request(
        "https://planner.example/unexpected-failure"
      ),
      {
        ASSETS: {
          async fetch() {
            throw internalFailure;
          }
        }
      }
    );
} finally {
  console.error =
    originalConsoleError;
}

assert.equal(
  unexpectedFailureResponse.status,
  500
);

const unexpectedFailureBody =
  await unexpectedFailureResponse.json();

assert.deepEqual(
  unexpectedFailureBody,
  {
    error:
      "Unexpected server error."
  },
  "Generic 500 responses must expose only the stable public error message"
);

assert.equal(
  Object.prototype.hasOwnProperty.call(
    unexpectedFailureBody,
    "detail"
  ),
  false,
  "Unexpected 500 responses must not expose an internal detail field"
);

assert.doesNotMatch(
  JSON.stringify(
    unexpectedFailureBody
  ),
  /Sensitive D1 implementation detail/
);

assert.equal(
  loggedUnexpectedErrors.length,
  1,
  "Unexpected Worker failures must still be logged server-side"
);

assert.equal(
  loggedUnexpectedErrors[0][0],
  internalFailure,
  "Server logging must preserve the original exception object"
);
assert.deepEqual(
  await securityBadResponse.json(),
  {
    error:
      "Fixture error"
  }
);

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

assert.match(
  hardenedHtml.headers.get(
    "content-security-policy"
  ) || "",
  /script-src 'self' 'unsafe-inline'/
);

const strictPlannerHtml =
  hardenResponse(
    new Response(
      "<!doctype html><title>Planner</title>",
      {
        headers: {
          "content-type":
            "text/html; charset=utf-8"
        }
      }
    ),
    {
      noStore: true,
      allowInlineScript:
        false
    }
  );

const strictPlannerCsp =
  strictPlannerHtml.headers.get(
    "content-security-policy"
  ) || "";

assert.match(
  strictPlannerCsp,
  /(?:^|;\s*)script-src 'self'(?:;|$)/
);

assert.doesNotMatch(
  strictPlannerCsp,
  /script-src[^;]*'unsafe-inline'/
);

assert.match(
  strictPlannerCsp,
  /style-src 'self' 'unsafe-inline'/
);

const credentialSurfaceAssetFetches = [];

const credentialSurfaceEnv = {
  ASSETS: {
    async fetch(request) {
      credentialSurfaceAssetFetches.push(
        new URL(request.url).pathname
      );

      return new Response(
        "<!doctype html><title>Credential surface</title>",
        {
          headers: {
            "content-type":
              "text/html; charset=utf-8",
            "cache-control":
              "public, max-age=3600"
          }
        }
      );
    }
  }
};

const landingResponse =
  await workerApp.fetch(
    new Request(
      "https://planner.example/"
    ),
    credentialSurfaceEnv
  );

const landingCsp =
  landingResponse.headers.get(
    "content-security-policy"
  ) || "";

assert.match(
  landingCsp,
  /(?:^|;\s*)script-src 'self'(?:;|$)/
);
assert.doesNotMatch(
  landingCsp,
  /script-src[^;]*'unsafe-inline'/
);
assert.equal(
  landingResponse.headers.get(
    "referrer-policy"
  ),
  "no-referrer"
);
assert.equal(
  landingResponse.headers.get(
    "x-frame-options"
  ),
  "DENY"
);

const adminResponse =
  await workerApp.fetch(
    new Request(
      "https://planner.example/admin"
    ),
    credentialSurfaceEnv
  );

const adminCsp =
  adminResponse.headers.get(
    "content-security-policy"
  ) || "";

assert.match(
  adminCsp,
  /(?:^|;\s*)script-src 'self'(?:;|$)/
);
assert.doesNotMatch(
  adminCsp,
  /script-src[^;]*'unsafe-inline'/
);
assert.match(
  adminResponse.headers.get(
    "cache-control"
  ) || "",
  /no-store/
);
assert.equal(
  adminResponse.headers.get(
    "referrer-policy"
  ),
  "no-referrer"
);
assert.equal(
  adminResponse.headers.get(
    "x-frame-options"
  ),
  "DENY"
);
assert.deepEqual(
  credentialSurfaceAssetFetches,
  ["/", "/admin"],
  "Landing and Admin must preserve their existing asset paths"
);

assert.ok(
  worker.includes(
    'if (request.method === "GET" && /^\\/manage\\/[A-Za-z0-9_-]+\\/?$/.test(path))'
  ),
  "Planner route must remain explicitly identified for strict CSP handling"
);

assert.ok(
  (
    worker.match(
      /allowInlineScript:\s*false/g
    ) || []
  ).length >= 3,
  "Planner, landing, and Admin routes must disable inline script execution"
);

assert.match(
  httpSecurity,
  /allowInlineScript/
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

assert.match(plannerStyles, /Battle Plan compact desktop polish — v35/);
assert.match(plannerStyles, /grid-template-areas:[\s\S]*today-main resources[\s\S]*today-metrics resources/);
assert.match(plannerStyles, /battle-resource-panel[\s\S]*border-left:/);


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
assert.match(plannerStyles, /PART 8 UX POLISH \+ REGRESSION HARDENING · v36/);
assert.match(plannerStyles, /html\.mobile-more-open/);
assert.match(plannerStyles, /\.battle-card-max[\s\S]*border-top-color/);
assert.match(plannerStyles, /recommendation-footer-row[\s\S]*grid-template-columns/);
assert.doesNotMatch(manage, /daily participation cap is not verified here/i);
assert.doesNotMatch(manage, /separate Raid-only rule/i);

// Part 8 mobile actions remain 44px+ and only real tabs receive tab state.
assert.match(plannerStyles, /recommendation-footer-row \.log-raid-button,[\s\S]*min-height:\s*44px/);
assert.match(plannerApp, /plannerTabButtons\(\)/);
assert.match(manageHtml, /role="tablist"/);


assert.match(plannerStyles, /Desktop text visibility \+ Max battle-intel hardening · v37/);
assert.match(plannerStyles, /@media \(min-width: 900px\)[\s\S]*\.battle-resource-advice \{[\s\S]*display: grid;[\s\S]*overflow: visible;/);
assert.match(plannerStyles, /@media \(min-width: 1180px\)[\s\S]*\.dashboard-shell \{[\s\S]*calc\(100% - 224px\)/);
assert.match(plannerStyles, /BL-009 — INTERMEDIATE-WIDTH DESKTOP HARDENING · v41/);
assert.match(plannerStyles, /@media \(min-width: 761px\) and \(max-width: 1179px\)/);
assert.match(plannerStyles, /\.today-command-main \{[\s\S]*grid-template-columns: 1fr;/);
assert.match(plannerStyles, /\.budget-forecast-strip \{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(plannerStyles, /\.calendar-view-layout \{[\s\S]*grid-template-columns: 1fr;/);
assert.match(plannerStyles, /\.forecast-detail-main strong,[\s\S]*\.recent-raid-main strong[\s\S]*white-space: normal;/);

assert.doesNotMatch(
  styles,
  /RESPONSIVE APP SHELL — DESKTOP \/ MOBILE/,
  "Planner-only responsive overrides must stay out of shared styles.css"
);
assert.match(
  plannerStyles,
  /RESPONSIVE APP SHELL — DESKTOP \/ MOBILE/
);
