import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function replaceOne(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`Missing anchor: ${label}`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Ambiguous anchor: ${label}`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

function insertBeforeOne(text, marker, insertion, label) {
  const first = text.indexOf(marker);
  if (first < 0) throw new Error(`Missing marker: ${label}`);
  if (text.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`Ambiguous marker: ${label}`);
  }
  return text.slice(0, first) + insertion + text.slice(first);
}

function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing start marker: ${label}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing end marker: ${label}`);
  return text.slice(0, start) + replacement + text.slice(end);
}

let index = read("src/index.js");

index = replaceOne(
  index,
  `import {\n  RAID_RANK_METHOD_VERSION,\n  buildRaidAttackerRankCatalog,\n  raidRankProfileForName\n} from "./raid-rankings.js";\nimport {\n  BATTLE_SOURCE_TYPES,`,
  `import {\n  RAID_RANK_METHOD_VERSION,\n  buildRaidAttackerRankCatalog,\n  raidRankProfileForName\n} from "./raid-rankings.js";\nimport {\n  MAX_RANK_METHOD_VERSION,\n  buildMaxAttackerRankCatalog,\n  canonicalMaxPokemonName,\n  maxRankProfileForName\n} from "./max-rankings.js";\nimport {\n  BATTLE_SOURCE_TYPES,\n  MAX_BATTLE_SOURCE_TYPES,`,
  "Max ranking imports"
);

index = replaceOne(
  index,
  `const AUTO_META_METHOD_VERSION = "auto-meta-v4-raid-ranks";\nconst RAID_RANK_SOURCE_NAME = "Raid attacker rankings";\nconst MAX_META_POKEMON_PER_SYNC = 20;\nconst MAX_RAID_RANK_BACKFILLS_PER_SYNC = 80;`,
  `const AUTO_META_METHOD_VERSION = "auto-meta-v5-max-ranks";\nconst RAID_RANK_SOURCE_NAME = "Raid attacker rankings";\nconst MAX_RANK_SOURCE_NAME = "Max attacker rankings";\nconst MAX_META_POKEMON_PER_SYNC = 20;\nconst MAX_RAID_RANK_BACKFILLS_PER_SYNC = 80;\nconst MAX_MAX_RANK_BACKFILLS_PER_SYNC = 80;`,
  "ranking constants"
);

const raidCurrentBlock = `function currentRaidRankingsJson(value) {\n  return raidRankProfileJsonIsCurrent(value)\n    ? value\n    : null;\n}\n`;

index = replaceOne(
  index,
  raidCurrentBlock,
  `${raidCurrentBlock}\nexport function maxRankProfileJsonIsCurrent(value) {\n  if (!value) return false;\n\n  try {\n    const profile =\n      typeof value === "string"\n        ? JSON.parse(value)\n        : value;\n\n    return (\n      profile &&\n      typeof profile === "object" &&\n      profile.method_version ===\n        MAX_RANK_METHOD_VERSION\n    );\n  } catch {\n    return false;\n  }\n}\n\nfunction currentMaxRankingsJson(value) {\n  return maxRankProfileJsonIsCurrent(value)\n    ? value\n    : null;\n}\n\nfunction maxRankingsJsonForPokemonName(\n  name,\n  metas\n) {\n  const key =\n    canonicalMaxPokemonName(name);\n\n  if (!key) return null;\n\n  const match =\n    metas.find(\n      meta =>\n        canonicalMaxPokemonName(\n          meta.pokemon_name\n        ) === key &&\n        meta.max_rankings_json\n    );\n\n  return currentMaxRankingsJson(\n    match?.max_rankings_json\n  );\n}\n`,
  "Max profile validation helpers"
);

index = insertBeforeOne(
  index,
  `function findPokemonMatchesInSummary(summary, pokedex) {`,
  `async function maxEligibilityEventsForMeta(env) {\n  const placeholders =\n    [...MAX_BATTLE_SOURCE_TYPES]\n      .map(() => "?")\n      .join(",");\n\n  const { results } =\n    await env.DB.prepare(\`\n      SELECT\n        summary,\n        source_type,\n        start_date,\n        end_date,\n        updated_at\n      FROM events\n      WHERE source_type IN (\${placeholders})\n        AND status IN ('active', 'stale')\n      ORDER BY updated_at DESC\n      LIMIT 1500\n    \`).bind(\n      ...MAX_BATTLE_SOURCE_TYPES\n    ).all();\n\n  return results || [];\n}\n\nfunction maxEligibleNamesFromEvents(\n  events,\n  pokedex\n) {\n  const names = new Set();\n\n  for (const event of events || []) {\n    for (const match of\n      findPokemonMatchesInSummary(\n        event.summary,\n        pokedex\n      )) {\n      const kind =\n        eventKindForMatch(\n          event.summary,\n          match.name\n        );\n\n      names.add(\n        displayNameForMatch(\n          match.name,\n          kind,\n          event.summary,\n          match.pokemon\n        )\n      );\n    }\n  }\n\n  return [...names];\n}\n\n`,
  "Max eligibility helpers"
);

index = replaceOne(
  index,
  `  const [pokedexRaw, pvpRankings, raidEvents] = await Promise.all([\n    fetchJson(POGO_API_POKEDEX, "Pokémon GO API"),\n    fetchJson(PVPOKE_MASTER_LEAGUE, "PvPoke"),\n    raidEventsForMeta(env)\n  ]);`,
  `  const [\n    pokedexRaw,\n    pvpRankings,\n    raidEvents,\n    maxEligibilityEvents\n  ] = await Promise.all([\n    fetchJson(POGO_API_POKEDEX, "Pokémon GO API"),\n    fetchJson(PVPOKE_MASTER_LEAGUE, "PvPoke"),\n    raidEventsForMeta(env),\n    maxEligibilityEventsForMeta(env)\n  ]);`,
  "automatic meta inputs"
);

index = replaceOne(
  index,
  `  const raidRankCatalog =\n    buildRaidAttackerRankCatalog(\n      pokedex\n    );\n\n  const pvpMap = new Map();`,
  `  const raidRankCatalog =\n    buildRaidAttackerRankCatalog(\n      pokedex\n    );\n\n  const maxEligibleNames =\n    maxEligibleNamesFromEvents(\n      maxEligibilityEvents,\n      pokedex\n    );\n\n  const maxRankCatalog =\n    buildMaxAttackerRankCatalog(\n      pokedex,\n      {\n        maxEligibleNames\n      }\n    );\n\n  const pvpMap = new Map();`,
  "Max ranking catalog"
);

index = replaceOne(
  index,
  `        raidRankProfile:\n          raidRankProfileForName(\n            displayName,\n            raidRankCatalog\n          ),\n        ...spriteAssets`,
  `        raidRankProfile:\n          raidRankProfileForName(\n            displayName,\n            raidRankCatalog\n          ),\n        maxRankProfile:\n          maxRankProfileForName(\n            maxRankCatalog,\n            displayName\n          ),\n        ...spriteAssets`,
  "candidate Max profile"
);

index = replaceOne(
  index,
  `      SELECT\n        pm.pokemon_name,\n        pm.sprite_url,\n        (\n          SELECT MAX(ms.updated_at)\n          FROM meta_sources ms\n          WHERE ms.pokemon_name = pm.pokemon_name\n            AND ms.source_name = ?\n        ) AS raid_rank_updated_at,\n    (\n      SELECT ms.note\n      FROM meta_sources ms\n      WHERE ms.pokemon_name = pm.pokemon_name\n        AND ms.source_name = ?\n      ORDER BY ms.updated_at DESC\n      LIMIT 1\n    ) AS raid_rankings_json\n  FROM pokemon_meta pm\n\`).bind(\n  RAID_RANK_SOURCE_NAME,\n  RAID_RANK_SOURCE_NAME\n).all();`,
  `      SELECT\n        pm.pokemon_name,\n        pm.sprite_url,\n        (\n          SELECT MAX(ms.updated_at)\n          FROM meta_sources ms\n          WHERE ms.pokemon_name = pm.pokemon_name\n            AND ms.source_name = ?\n        ) AS raid_rank_updated_at,\n        (\n          SELECT ms.note\n          FROM meta_sources ms\n          WHERE ms.pokemon_name = pm.pokemon_name\n            AND ms.source_name = ?\n          ORDER BY ms.updated_at DESC\n          LIMIT 1\n        ) AS raid_rankings_json,\n        (\n          SELECT MAX(ms.updated_at)\n          FROM meta_sources ms\n          WHERE ms.pokemon_name = pm.pokemon_name\n            AND ms.source_name = ?\n        ) AS max_rank_updated_at,\n        (\n          SELECT ms.note\n          FROM meta_sources ms\n          WHERE ms.pokemon_name = pm.pokemon_name\n            AND ms.source_name = ?\n          ORDER BY ms.updated_at DESC\n          LIMIT 1\n        ) AS max_rankings_json\n      FROM pokemon_meta pm\n    \`).bind(\n      RAID_RANK_SOURCE_NAME,\n      RAID_RANK_SOURCE_NAME,\n      MAX_RANK_SOURCE_NAME,\n      MAX_RANK_SOURCE_NAME\n    ).all();`,
  "existing ranking profile query"
);

const refreshStart = `        const raidRankRefresh =\n        !existing?.raid_rank_updated_at ||`;
const refreshEnd = `\n        const priorityBucket =`;
const oldRefreshStart = index.indexOf(refreshStart);
if (oldRefreshStart < 0) throw new Error("Missing anchor: rank refresh");
const oldRefreshEnd = index.indexOf(refreshEnd, oldRefreshStart);
if (oldRefreshEnd < 0) throw new Error("Missing end anchor: rank refresh");
const oldRefresh = index.slice(oldRefreshStart, oldRefreshEnd);
index = index.slice(0, oldRefreshStart) + `${oldRefresh}\n\n        const maxRankRefresh =\n          Boolean(\n            candidate.maxRankProfile\n          ) &&\n          (\n            !existing?.max_rank_updated_at ||\n            existing.max_rank_updated_at <\n              raidRankStaleBefore ||\n            (\n              Boolean(\n                existing?.max_rankings_json\n              ) &&\n              !maxRankProfileJsonIsCurrent(\n                existing.max_rankings_json\n              )\n            )\n          );` + index.slice(oldRefreshEnd);

index = replaceOne(
  index,
  `                : activeToday\n                  ? 3\n                  : raidRankRefresh\n                    ? 4\n                    : 5;`,
  `                : activeToday\n                  ? 3\n                  : (\n                      raidRankRefresh ||\n                      maxRankRefresh\n                    )\n                    ? 4\n                    : 5;`,
  "ranking refresh priority"
);

index = replaceOne(
  index,
  `          raidRankRefresh,\n          activeToday,`,
  `          raidRankRefresh,\n          maxRankRefresh,\n          activeToday,`,
  "ranking refresh metadata"
);

index = replaceOne(
  index,
  `          timestamp\n        )\n      );\n    }\n  }\n\n  const raidRankBackfillRows =`,
  `          timestamp\n        )\n      );\n    }\n\n    if (candidate.maxRankProfile) {\n      const maxRankSourceId =\n        await sha256Hex(\n          \`${'${normalizeName(candidate.displayName)}'}|max-attacker-rankings\`\n        );\n\n      statements.push(\n        env.DB.prepare(\`\n          INSERT INTO meta_sources (\n            id, pokemon_name, source_name, source_url, note, updated_at\n          )\n          VALUES (?, ?, ?, ?, ?, ?)\n          ON CONFLICT(id) DO UPDATE SET\n            source_url = excluded.source_url,\n            note = excluded.note,\n            updated_at = excluded.updated_at\n        \`).bind(\n          maxRankSourceId,\n          candidate.displayName,\n          MAX_RANK_SOURCE_NAME,\n          POGO_API_POKEDEX,\n          JSON.stringify(\n            candidate.maxRankProfile\n          ),\n          timestamp\n        )\n      );\n    }\n  }\n\n  const raidRankBackfillRows =`,
  "candidate Max profile persistence"
);

index = replaceOne(
  index,
  `    raidRankBackfills += 1;\n  }\n\n  for (\n    let offset = 0;`,
  `    raidRankBackfills += 1;\n  }\n\n  const maxRankBackfillRows =\n    (existingMetaRows || [])\n      .map(row => ({\n        row,\n        profile:\n          maxRankProfileForName(\n            maxRankCatalog,\n            row.pokemon_name\n          )\n      }))\n      .filter(item =>\n        item.profile &&\n        !selectedKeys.has(\n          normalizeName(\n            item.row.pokemon_name\n          )\n        ) &&\n        (\n          !item.row.max_rank_updated_at ||\n          item.row.max_rank_updated_at <\n            raidRankStaleBefore ||\n          (\n            Boolean(\n              item.row.max_rankings_json\n            ) &&\n            !maxRankProfileJsonIsCurrent(\n              item.row.max_rankings_json\n            )\n          )\n        )\n      )\n      .sort((a, b) =>\n        String(\n          a.row.max_rank_updated_at || ""\n        ).localeCompare(\n          String(\n            b.row.max_rank_updated_at || ""\n          )\n        ) ||\n        a.row.pokemon_name.localeCompare(\n          b.row.pokemon_name\n        )\n      )\n      .slice(\n        0,\n        MAX_MAX_RANK_BACKFILLS_PER_SYNC\n      );\n\n  let maxRankBackfills = 0;\n\n  for (const {\n    row,\n    profile\n  } of maxRankBackfillRows) {\n    const maxRankSourceId =\n      await sha256Hex(\n        \`${'${normalizeName(row.pokemon_name)}'}|max-attacker-rankings\`\n      );\n\n    statements.push(\n      env.DB.prepare(\`\n        INSERT INTO meta_sources (\n          id, pokemon_name, source_name, source_url, note, updated_at\n        )\n        VALUES (?, ?, ?, ?, ?, ?)\n        ON CONFLICT(id) DO UPDATE SET\n          source_url = excluded.source_url,\n          note = excluded.note,\n          updated_at = excluded.updated_at\n      \`).bind(\n        maxRankSourceId,\n        row.pokemon_name,\n        MAX_RANK_SOURCE_NAME,\n        POGO_API_POKEDEX,\n        JSON.stringify(profile),\n        timestamp\n      )\n    );\n\n    maxRankBackfills += 1;\n  }\n\n  for (\n    let offset = 0;`,
  "Max ranking backfill"
);

index = replaceOne(
  index,
  `    raid_rank_method:\n      RAID_RANK_METHOD_VERSION,\n    raid_rank_backfills:\n      raidRankBackfills,`,
  `    raid_rank_method:\n      RAID_RANK_METHOD_VERSION,\n    raid_rank_backfills:\n      raidRankBackfills,\n    max_rank_method:\n      MAX_RANK_METHOD_VERSION,\n    max_rank_eligible_names:\n      maxEligibleNames.length,\n    max_rank_backfills:\n      maxRankBackfills,`,
  "sync result Max ranking metadata"
);

index = replaceOne(
  index,
  `      ) AS raid_rankings_json\n    FROM pokemon_meta pm\n    ORDER BY pm.pokemon_name\n  \`).bind(\n    RAID_RANK_SOURCE_NAME\n  ).all();\n  return (results || []).map(row => ({\n  ...row,\n  raid_rankings_json:\n    currentRaidRankingsJson(\n      row.raid_rankings_json\n    )\n}));`,
  `      ) AS raid_rankings_json,\n      (\n        SELECT ms.note\n        FROM meta_sources ms\n        WHERE ms.pokemon_name = pm.pokemon_name\n          AND ms.source_name = ?\n        ORDER BY ms.updated_at DESC\n        LIMIT 1\n      ) AS max_rankings_json\n    FROM pokemon_meta pm\n    ORDER BY pm.pokemon_name\n  \`).bind(\n    RAID_RANK_SOURCE_NAME,\n    MAX_RANK_SOURCE_NAME\n  ).all();\n  return (results || []).map(row => ({\n    ...row,\n    raid_rankings_json:\n      currentRaidRankingsJson(\n        row.raid_rankings_json\n      ),\n    max_rankings_json:\n      currentMaxRankingsJson(\n        row.max_rankings_json\n      )\n  }));`,
  "getMeta Max profile"
);

index = replaceOne(
  index,
  `          raid_rankings_json: targetBattleKind(target) !== "raid" ? null :\n            raidRankingsJsonForPokemonName(\n              target.pokemon_name,\n              metas\n            )`,
  `          raid_rankings_json: targetBattleKind(target) !== "raid" ? null :\n            raidRankingsJsonForPokemonName(\n              target.pokemon_name,\n              metas\n            ),\n          max_rankings_json: targetBattleKind(target) === "raid" ? null :\n            maxRankingsJsonForPokemonName(\n              target.pokemon_name,\n              metas\n            )`,
  "target Max profile"
);

write("src/index.js", index);

let resource = read("src/resource-planning.js");

resource = replaceOne(
  resource,
  `export const STANDARD_MAX_PARTICLE_DAILY_LIMIT = 800;`,
  `import { MAX_RANK_METHOD_VERSION } from "./max-rankings.js";\n\nexport const STANDARD_MAX_PARTICLE_DAILY_LIMIT = 800;`,
  "resource planner Max ranking import"
);

resource = insertBeforeOne(
  resource,
  `export function planningValueForRecommendation(\n  recommendation\n) {`,
  `function maxRankProfileForRecommendation(\n  recommendation\n) {\n  const raw =\n    recommendation?.max_rank_profile ||\n    recommendation?.meta\n      ?.max_rankings_json ||\n    null;\n\n  if (!raw) return null;\n\n  try {\n    const profile =\n      typeof raw === "string"\n        ? JSON.parse(raw)\n        : raw;\n\n    if (\n      !profile ||\n      typeof profile !== "object" ||\n      profile.method_version !==\n        MAX_RANK_METHOD_VERSION\n    ) {\n      return null;\n    }\n\n    return profile;\n  } catch {\n    return null;\n  }\n}\n\n`,
  "resource planner Max profile parser"
);

const maxScoreStart = `  const rarity =\n    scoreOrNull(\n      recommendation?.meta\n        ?.rarity_score\n    ) ??\n    recommendationScore;`;
const maxScoreEnd = `\n}\n\nfunction targetCap(`;
const replacementTail = `  const rarity =\n    scoreOrNull(\n      recommendation?.meta\n        ?.rarity_score\n    ) ??\n    recommendationScore;\n\n  const variant =\n    String(\n      recommendation?.battle_variant ||\n      ""\n    ).toLowerCase();\n\n  const capability =\n    MAX_CAPABILITY_VALUE[variant] ??\n    MAX_CAPABILITY_VALUE.default;\n\n  const maxProfile =\n    maxRankProfileForRecommendation(\n      recommendation\n    );\n\n  const maxUtility =\n    scoreOrNull(\n      maxProfile?.utility_score\n    );\n\n  if (maxUtility != null) {\n    const score =\n      clamp(\n        recommendationScore * 0.40 +\n        rarity * 0.15 +\n        capability * 0.15 +\n        maxUtility * 0.30,\n        0,\n        100\n      );\n\n    return {\n      score:\n        Math.round(score),\n      basis:\n        MAX_RANK_METHOD_VERSION,\n      method_version:\n        MAX_RANK_METHOD_VERSION,\n      max_performance_ranked:\n        true,\n      components: {\n        general_personal_value:\n          Math.round(\n            recommendationScore\n          ),\n        rarity_availability:\n          Math.round(rarity),\n        max_capability:\n          capability,\n        max_attacker_utility:\n          Math.round(maxUtility)\n      },\n      note:\n        "Uses the current Max-specific attacker profile; normal Raid attacker rankings are not used as Max performance."\n    };\n  }\n\n  const score =\n    clamp(\n      recommendationScore * 0.55 +\n      rarity * 0.20 +\n      capability * 0.25,\n      0,\n      100\n    );\n\n  return {\n    score:\n      Math.round(score),\n    basis:\n      MAX_OPPORTUNITY_METHOD_VERSION,\n    method_version:\n      MAX_OPPORTUNITY_METHOD_VERSION,\n    max_performance_ranked:\n      false,\n    components: {\n      general_personal_value:\n        Math.round(\n          recommendationScore\n        ),\n      rarity_availability:\n        Math.round(rarity),\n      max_capability:\n        capability\n    },\n    note:\n      "Provisional Max opportunity value only. It does not use normal Raid attacker rankings as Max Battle performance."\n  };`;

resource = replaceBetween(
  resource,
  maxScoreStart,
  maxScoreEnd,
  replacementTail,
  "Max planning value"
);

write("src/resource-planning.js", resource);

let manage = read("public/manage.html");

manage = insertBeforeOne(
  manage,
  `function recommendationSpriteUrl(rec) {`,
  `function maxRankingsHtml(value) {\n  const profile =\n    parseRaidRankProfile(value);\n\n  const entries =\n    Object.entries(\n      profile?.by_type || {}\n    )\n      .map(([type, item]) => ({\n        type,\n        ...item\n      }))\n      .sort((a, b) =>\n        Number(a.rank || 9999) -\n          Number(b.rank || 9999) ||\n        Number(b.utility_score || 0) -\n          Number(a.utility_score || 0) ||\n        a.type.localeCompare(b.type)\n      );\n\n  if (!entries.length) return "";\n\n  const best =\n    profile?.best ||\n    entries[0];\n\n  const summaryType =\n    String(\n      best.max_attack_type ||\n      entries[0].type ||\n      "Max"\n    );\n\n  const moveLine =\n    entry => {\n      const normal =\n        [\n          entry.fast_move,\n          entry.charged_move\n        ]\n          .filter(Boolean)\n          .join(" + ");\n\n      return [\n        entry.fast_move\n          ? \`${'${entry.fast_move}'} → Max ${'${entry.max_attack_type || entry.type}'}\`\n          : null,\n        normal\n          ? \`normal phase: ${'${normal}'}\`\n          : null\n      ]\n        .filter(Boolean)\n        .join(" · ");\n    };\n\n  return \`\n    <details class="raid-rank-details max-rank-details">\n      <summary>\n        <span class="raid-rank-summary-label">Max attacker</span>\n        <strong class="raid-rank-summary-value">\n          Max ${'${esc(summaryType)}'} · #${'${formatNumber(best.rank)}'} · ${'${formatNumber(profile.utility_score)}'} utility\n        </strong>\n        <span class="details-chevron" aria-hidden="true">⌄</span>\n      </summary>\n\n      <div class="raid-rank-list">\n        ${'${entries.slice(0, 4).map(entry => `'}\n          <div class="raid-rank-variant">\n            <div>\n              <strong>Max ${'${esc(entry.max_attack_type || entry.type)}'}</strong>\n              ${'${entry.has_gigantamax_evolution ? `<small class="raid-rank-current">Gigantamax capable</small>` : ""}'}\n            </div>\n            <span class="raid-rank-values">#${'${formatNumber(entry.rank)}'} · ${'${formatNumber(entry.utility_score)}'} utility</span>\n            <small class="raid-rank-moves">${'${esc(moveLine(entry))}'}</small>\n          </div>\n        ${'`).join("")}'}\n\n        <small class="raid-rank-method">\n          Planner Max · Max-eligible Pokémon only · survivability-aware · Max Attack type follows Fast Attack. G-Max move power/type is not guessed.\n        </small>\n      </div>\n    </details>\n  \`;\n}\n\n`,
  "Max ranking UI"
);

manage = replaceOne(
  manage,
  `      ${'${!isMax ? raidRankingsHtml(rec.meta?.raid_rankings_json) : ""}'}`, 
  `      ${'${isMax ? maxRankingsHtml(rec.meta?.max_rankings_json) : raidRankingsHtml(rec.meta?.raid_rankings_json)}'}`,
  "Max recommendation ranking UI"
);

manage = replaceOne(
  manage,
  `      ${'${BattleTargets.kind(target) === "raid" ? raidRankingsHtml(target.raid_rankings_json) : ""}'}`,
  `      ${'${BattleTargets.kind(target) === "raid" ? raidRankingsHtml(target.raid_rankings_json) : maxRankingsHtml(target.max_rankings_json)}'}`,
  "Max target ranking UI"
);

write("public/manage.html", manage);

const integrationTest = `import assert from "node:assert/strict";\nimport fs from "node:fs";\n\nconst index = fs.readFileSync("src/index.js", "utf8");\nconst resource = fs.readFileSync("src/resource-planning.js", "utf8");\nconst manage = fs.readFileSync("public/manage.html", "utf8");\n\nassert.match(index, /MAX_RANK_METHOD_VERSION/);\nassert.match(index, /MAX_RANK_SOURCE_NAME = "Max attacker rankings"/);\nassert.match(index, /maxEligibilityEventsForMeta/);\nassert.match(index, /MAX_BATTLE_SOURCE_TYPES/);\nassert.match(index, /buildMaxAttackerRankCatalog/);\nassert.match(index, /maxRankProfileForName/);\nassert.match(index, /AS max_rankings_json/);\nassert.match(index, /max_rankings_json: targetBattleKind\(target\) === "raid" \? null/);\nassert.match(index, /max_rank_backfills/);\n\nassert.match(resource, /maxRankProfileForRecommendation/);\nassert.match(resource, /max_attacker_utility/);\nassert.match(resource, /max_performance_ranked:\\n        true/);\nassert.match(resource, /normal Raid attacker rankings are not used as Max performance/);\n\nassert.match(manage, /function maxRankingsHtml/);\nassert.match(manage, /Max attacker/);\nassert.match(manage, /G-Max move power\\/type is not guessed/);\nassert.match(manage, /isMax \? maxRankingsHtml\(rec\.meta\?\.max_rankings_json\)/);\nassert.match(manage, /maxRankingsHtml\(target\.max_rankings_json\)/);\n\nconsole.log("Max ranking integration tests passed");\n`;
write("tests/max-ranking-integration.test.mjs", integrationTest);

const pkg = JSON.parse(read("package.json"));
if (!pkg.scripts.test.includes("tests/max-ranking-integration.test.mjs")) {
  pkg.scripts.test = pkg.scripts.test.replace(
    "node tests/max-rankings.test.mjs",
    "node tests/max-rankings.test.mjs && node tests/max-ranking-integration.test.mjs"
  );
}
write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

console.log("Part 7 integration patch applied");
