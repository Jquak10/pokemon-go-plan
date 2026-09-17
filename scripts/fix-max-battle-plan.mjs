import { readFileSync, writeFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const write = (path, value) => writeFileSync(path, value);

function replaceOnce(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 anchor, found ${count}`);
  return text.replace(oldValue, newValue);
}

function replaceInFunction(text, startNeedle, endNeedle, transform, label) {
  const start = text.indexOf(startNeedle);
  if (start < 0) throw new Error(`${label}: start anchor missing`);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`${label}: end anchor missing`);
  const before = text.slice(0, start);
  const segment = text.slice(start, end);
  const after = text.slice(end);
  return before + transform(segment) + after;
}

let index = read("src/index.js");

index = replaceOnce(
  index,
  `const POGO_API_POKEDEX =\n  "https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json";\n\nconst AUTO_META_METHOD_VERSION`,
  `const POGO_API_POKEDEX =\n  "https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json";\n\nconst BATTLE_MATCH_POKEDEX_TTL_MS = 6 * 60 * 60 * 1000;\nlet battleMatchPokedex = [];\nlet battleMatchPokedexLoadedAt = 0;\nlet battleMatchPokedexPending = null;\n\nasync function currentBattleMatchPokedex() {\n  const now = Date.now();\n\n  if (\n    battleMatchPokedex.length &&\n    now - battleMatchPokedexLoadedAt < BATTLE_MATCH_POKEDEX_TTL_MS\n  ) {\n    return battleMatchPokedex;\n  }\n\n  if (battleMatchPokedexPending) {\n    return battleMatchPokedexPending;\n  }\n\n  battleMatchPokedexPending = (async () => {\n    try {\n      const response = await fetch(POGO_API_POKEDEX, {\n        headers: { "user-agent": "PokemonGoPersonalCalendar/1.0" },\n        redirect: "follow"\n      });\n\n      if (!response.ok) return battleMatchPokedex;\n\n      const value = await response.json();\n      if (Array.isArray(value) && value.length) {\n        battleMatchPokedex = value;\n        battleMatchPokedexLoadedAt = Date.now();\n      }\n    } catch {\n      // Meta/target matching remains a safe fallback if the upstream catalog\n      // is temporarily unavailable. A catalog failure must not break /api/me.\n    } finally {\n      battleMatchPokedexPending = null;\n    }\n\n    return battleMatchPokedex;\n  })();\n\n  return battleMatchPokedexPending;\n}\n\nconst AUTO_META_METHOD_VERSION`,
  "battle Pokédex cache"
);

index = replaceInFunction(
  index,
  "export function findMatches(summary, targets, metas, event = null) {",
  "\nfunction weightedInternetScore",
  segment => {
    segment = replaceOnce(
      segment,
      "export function findMatches(summary, targets, metas, event = null) {",
      "export function findMatches(summary, targets, metas, event = null, pokedex = []) {",
      "findMatches signature"
    );

    segment = replaceOnce(
      segment,
      "\n  candidates.sort(\n",
      `\n  // Battle availability is authoritative even before automatic meta backfill.\n  // Resolve bosses from the current Pokédex so a newly scheduled Max Pokémon\n  // cannot disappear merely because pokemon_meta has not caught up yet.\n  for (const match of findPokemonMatchesInSummary(summary, pokedex)) {\n    const maxVariant = event\n      ? maxBattleVariantForEvent(event, match.name)\n      : null;\n\n    const displayName = displayNameForMatch(\n      match.name,\n      maxVariant === "gigantamax" ? "gigantamax" : "normal",\n      summary,\n      match.pokemon\n    );\n\n    const needle = normalizeName(displayName);\n    if (!needle) continue;\n\n    const existing = candidates.find(candidate =>\n      normalizeName(candidate.name) === needle\n    );\n\n    if (existing) continue;\n\n    const exactMeta = metas.find(meta =>\n      normalizeName(meta.pokemon_name) === needle\n    ) || null;\n\n    candidates.push({\n      name: displayName,\n      meta: exactMeta,\n      target: null,\n      length: needle.length\n    });\n  }\n\n  candidates.sort(\n`,
      "Pokédex battle fallback"
    );
    return segment;
  },
  "findMatches"
);

index = replaceInFunction(
  index,
  "export async function recommendationsForDate(",
  "\nasync function currentRecommendations(",
  segment => {
    segment = replaceOnce(
      segment,
      `  metas,\n  day\n) {\n  const placeholders`,
      `  metas,\n  day,\n  pokedex = null\n) {\n  const battlePokedex = Array.isArray(pokedex)\n    ? pokedex\n    : await currentBattleMatchPokedex();\n\n  const placeholders`,
      "recommendations Pokédex parameter"
    );
    segment = replaceOnce(
      segment,
      `        metas,\n        event\n      );`,
      `        metas,\n        event,\n        battlePokedex\n      );`,
      "recommendations findMatches"
    );
    return segment;
  },
  "recommendationsForDate"
);

index = replaceInFunction(
  index,
  "export async function targetOptionsForUser(",
  "\nfunction recommendationCoLeaders(",
  segment => {
    segment = replaceOnce(
      segment,
      `  metas,\n  recommendations\n) {\n  const today`,
      `  metas,\n  recommendations,\n  pokedex = null\n) {\n  const battlePokedex = Array.isArray(pokedex)\n    ? pokedex\n    : await currentBattleMatchPokedex();\n\n  const today`,
      "target options Pokédex parameter"
    );
    segment = replaceOnce(
      segment,
      `        metas,\n        event\n      );`,
      `        metas,\n        event,\n        battlePokedex\n      );`,
      "target options findMatches"
    );
    return segment;
  },
  "targetOptionsForUser"
);

write("src/index.js", index);

let battleTests = read("tests/battle-opportunities.test.mjs");
battleTests = replaceOnce(
  battleTests,
  `assert.equal(\n  maxBattleVariantForEvent({\n    source_type: "raid_battles",\n    summary: "Gigantamax Gengar"\n  }),\n  null\n);`,
  `assert.equal(\n  maxBattleVariantForEvent({\n    source_type: "raid_battles",\n    summary: "Gigantamax Gengar"\n  }),\n  null\n);\nassert.equal(\n  maxBattleVariantForEvent({\n    source_type: "max_battles",\n    summary: "Articuno, Zapdos & Moltres Max Battles"\n  }),\n  BATTLE_VARIANT.DYNAMAX\n);\nassert.equal(\n  maxBattleVariantForEvent({\n    source_type: "max_mondays",\n    summary: "Rhyhorn"\n  }),\n  BATTLE_VARIANT.DYNAMAX\n);`,
  "default Dynamax tests"
);
write("tests/battle-opportunities.test.mjs", battleTests);

let targetTests = read("tests/battle-targets.test.mjs");
targetTests = replaceOnce(
  targetTests,
  `import {buildBattleResourcePlan} from '../src/resource-planning.js';`,
  `import {buildBattleResourcePlan} from '../src/resource-planning.js';\nimport {battleOpportunityMetadata} from '../src/battle-opportunities.js';`,
  "target test import"
);
targetTests = replaceOnce(
  targetTests,
  `assert.equal(targetSpriteUrl({pokemon_name:'Gigantamax Gengar',battle_kind:'gigantamax'},metas),'gmax.png');`,
  `assert.equal(targetSpriteUrl({pokemon_name:'Gigantamax Gengar',battle_kind:'gigantamax'},metas),'gmax.png');\n\n// A battle boss must be discoverable before pokemon_meta catches up. Multi-boss\n// Max feeds also inherit standard Dynamax capability consistently.\nconst maxFallbackPokedex=[\n  {dexNr:111,names:{English:'Rhyhorn'},regionForms:{}},\n  {dexNr:144,names:{English:'Articuno'},regionForms:{}},\n  {dexNr:145,names:{English:'Zapdos'},regionForms:{}},\n  {dexNr:146,names:{English:'Moltres'},regionForms:{}}\n];\nconst birdsEvent={source_type:'max_battles',summary:'Articuno, Zapdos & Moltres Max Battles'};\nconst birdMatches=findMatches(birdsEvent.summary,[],[],birdsEvent,maxFallbackPokedex);\nassert.deepEqual(birdMatches.map(match=>match.name).sort(),['Articuno','Moltres','Zapdos']);\nfor(const match of birdMatches){\n  const metadata=battleOpportunityMetadata(birdsEvent,{pokemonName:match.name});\n  assert.equal(metadata.battle_variant,'dynamax');\n  assert.equal(T.canonicalName(match.name,T.kind(metadata)),`Dynamax ${match.name}`);\n}\nconst rhyhornEvent={source_type:'max_battles',summary:'Rhyhorn Max Battles'};\nassert.equal(findMatches(rhyhornEvent.summary,[],[],rhyhornEvent,maxFallbackPokedex)[0].name,'Rhyhorn');`,
  "Max fallback identity tests"
);

targetTests = replaceOnce(
  targetTests,
  `const recs=await recommendationsForDate(env,user,all(),metas,today);`,
  `insertEvent.run('rhyhorn-max','max_battles','Rhyhorn Max Battles',today,today,'4');\nconst fallbackRecs=await recommendationsForDate(env,user,all(),metas,today,maxFallbackPokedex);\nconst rhyhornRec=fallbackRecs.find(r=>r.battle_system==='max'&&r.pokemon_name==='Rhyhorn');\nassert.ok(rhyhornRec,'Current Max boss without pokemon_meta must still render as a recommendation');\nassert.equal(rhyhornRec.battle_variant,'dynamax');\nsql.prepare("DELETE FROM events WHERE id='rhyhorn-max'").run();\nconst recs=await recommendationsForDate(env,user,all(),metas,today);`,
  "Max recommendation fallback test"
);
write("tests/battle-targets.test.mjs", targetTests);

let styles = read("public/styles.css");
if (!styles.includes("Battle Plan compact desktop polish — v35")) {
  styles += `\n\n/* ============================================================\n   Battle Plan compact desktop polish — v35\n   Keep the decision summary useful without burying battle cards.\n   ============================================================ */\n@media (min-width: 900px) {\n  .today-command-card {\n    display: grid;\n    grid-template-columns: minmax(0, 1.55fr) minmax(340px, .8fr);\n    grid-template-areas:\n      "today-main resources"\n      "today-metrics resources"\n      "freshness resources";\n    align-items: stretch;\n  }\n\n  .today-command-main {\n    grid-area: today-main;\n    grid-template-columns: 1fr;\n    gap: 8px;\n    padding: 14px 16px 8px;\n  }\n\n  .today-command-main h2 {\n    font-size: clamp(1.15rem, 1.8vw, 1.55rem);\n  }\n\n  .today-spend-signal {\n    margin-top: 7px;\n    padding: 9px 11px;\n  }\n\n  .today-spend-signal strong {\n    font-size: .84rem;\n  }\n\n  .today-spend-signal small {\n    font-size: .7rem;\n    line-height: 1.3;\n  }\n\n  .today-command-grid {\n    grid-area: today-metrics;\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n    border-bottom: 0;\n  }\n\n  .today-command-grid article {\n    padding: 9px 13px;\n  }\n\n  .today-command-grid strong {\n    font-size: 1rem;\n  }\n\n  .today-next-change strong {\n    font-size: .84rem;\n  }\n\n  .freshness-strip {\n    grid-area: freshness;\n    min-height: 36px;\n  }\n\n  .battle-resource-panel {\n    grid-area: resources;\n    min-width: 0;\n    margin: 0;\n    padding: 13px 14px;\n    border-top: 0;\n    border-left: 1px solid #e2eaf2;\n    background: rgba(248, 251, 255, .66);\n  }\n\n  .battle-resource-panel-head {\n    margin-bottom: 7px;\n  }\n\n  .battle-resource-panel-head h3 {\n    font-size: 1rem;\n  }\n\n  .battle-resource-grid {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 7px;\n  }\n\n  .battle-resource-grid article {\n    padding: 8px 9px;\n  }\n\n  .battle-resource-grid span {\n    font-size: .68rem;\n  }\n\n  .battle-resource-grid strong {\n    margin: 2px 0;\n    font-size: .94rem;\n  }\n\n  .battle-resource-grid small {\n    font-size: .68rem;\n    line-height: 1.25;\n  }\n\n  .battle-resource-advice {\n    display: -webkit-box;\n    margin-top: 7px;\n    padding: 7px 9px;\n    overflow: hidden;\n    font-size: .75rem;\n    line-height: 1.3;\n    -webkit-box-orient: vertical;\n    -webkit-line-clamp: 2;\n  }\n\n  .battle-resource-editor {\n    margin-top: 6px;\n  }\n\n  .battle-resource-editor > summary {\n    min-height: 38px;\n    padding: 7px 9px;\n  }\n}\n`;
}
write("public/styles.css", styles);

for (const page of ["public/manage.html", "public/index.html", "public/admin.html", "public/sources.html"]) {
  let html = read(page);
  html = replaceOnce(html, "styles.css?v=34", "styles.css?v=35", `${page} cache version`);
  write(page, html);
}

let uiTests = read("tests/battle-plan-ui.test.mjs");
uiTests = uiTests.replace(/styles\\\.css\\\?v=34/g, "styles\\.css\\?v=35");
if (!uiTests.includes("Battle Plan compact desktop polish")) {
  uiTests += `\nassert.match(styles, /Battle Plan compact desktop polish — v35/);\nassert.match(styles, /grid-template-areas:[\\s\\S]*today-main resources[\\s\\S]*today-metrics resources/);\nassert.match(styles, /battle-resource-panel[\\s\\S]*border-left:/);\n`;
}
write("tests/battle-plan-ui.test.mjs", uiTests);

console.log("Max Battle card, capability and Battle Plan UI patch applied");
