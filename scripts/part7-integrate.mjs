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

let index = read("src/index.js");
index = replaceOne(
  index,
  `  if (kind === "gigantamax") {\n    return \`Gigantamax \${pokemonName}\`;\n  }\n\n  if (kind === "dynamax") {\n    return \`Dynamax \${pokemonName}\`;\n  }`,
  `  if (kind === "gigantamax") {\n    return \`Gigantamax \${exactRegionForm || pokemonName}\`;\n  }\n\n  if (kind === "dynamax") {\n    return \`Dynamax \${exactRegionForm || pokemonName}\`;\n  }`,
  "preserve regional Max form identity"
);
write("src/index.js", index);

let resource = read("src/resource-planning.js");
resource = replaceOne(
  resource,
  ` * Max opportunities deliberately use a separate provisional method so a\n * normal Raid attacker ranking is never presented as Max Battle performance.\n * Until Part 7 supplies Max-attacker intelligence, the Max planning score is\n * based on the existing general/personal value signal, rarity/availability,\n * and the distinct value of the Max capability itself.`,
  ` * Max opportunities deliberately use a separate method so a normal Raid\n * attacker ranking is never presented as Max Battle performance. Current\n * Max-specific profiles are used when available; otherwise the planner falls\n * back to the provisional general/personal value, rarity/availability, and\n * Max-capability signal from Part 6.`,
  "resource planning Max-ranking comment"
);
write("src/resource-planning.js", resource);

let test = read("tests/recommendation-engine.test.mjs");
test = replaceOne(
  test,
  `import {\n  DEFAULT_FUTURE_RESERVE_SCORE_GAP,`,
  `import { MAX_RANK_METHOD_VERSION } from "../src/max-rankings.js";\nimport {\n  DEFAULT_FUTURE_RESERVE_SCORE_GAP,`,
  "recommendation test Max method import"
);

test = replaceOne(
  test,
  `assert.match(dynamaxValue.note, /does not use normal Raid attacker rankings/i);\n\nconst gigantamaxValue`,
  `assert.match(dynamaxValue.note, /does not use normal Raid attacker rankings/i);\n\nconst rankedMaxValue = planningValueForRecommendation({\n  pokemon_name: "Dynamax Ranked",\n  battle_system: "max",\n  battle_variant: "dynamax",\n  score: 80,\n  meta: {\n    rarity_score: 70,\n    raid_rankings_json: JSON.stringify({\n      method: "fake-raid-best",\n      utility_score: 100\n    }),\n    max_rankings_json: JSON.stringify({\n      method_version: MAX_RANK_METHOD_VERSION,\n      utility_score: 90,\n      best: {\n        rank: 1,\n        max_attack_type: "electric"\n      },\n      by_type: {}\n    })\n  }\n});\n\nassert.equal(rankedMaxValue.score, 80);\nassert.equal(rankedMaxValue.basis, MAX_RANK_METHOD_VERSION);\nassert.equal(rankedMaxValue.method_version, MAX_RANK_METHOD_VERSION);\nassert.equal(rankedMaxValue.max_performance_ranked, true);\nassert.equal(rankedMaxValue.components.max_attacker_utility, 90);\nassert.match(rankedMaxValue.note, /normal Raid attacker rankings are not used/i);\n\nconst staleMaxValue = planningValueForRecommendation({\n  pokemon_name: "Dynamax Stale",\n  battle_system: "max",\n  battle_variant: "dynamax",\n  score: 80,\n  meta: {\n    rarity_score: 70,\n    max_rankings_json: JSON.stringify({\n      method_version: "old-max-method",\n      utility_score: 100\n    })\n  }\n});\n\nassert.equal(staleMaxValue.basis, MAX_OPPORTUNITY_METHOD_VERSION);\nassert.equal(staleMaxValue.max_performance_ranked, false);\n\nconst gigantamaxValue`,
  "real Max ranking recommendation regression"
);
write("tests/recommendation-engine.test.mjs", test);

const integration = read("tests/max-ranking-integration.test.mjs");
if (!integration.includes("exactRegionForm || pokemonName")) {
  write(
    "tests/max-ranking-integration.test.mjs",
    integration.replace(
      `assert.match(index, /max_rank_backfills/);`,
      `assert.match(index, /max_rank_backfills/);\nassert.equal((index.match(/exactRegionForm \\|\\| pokemonName/g) || []).length >= 2, true);`
    )
  );
}

console.log("Part 7 finalization patch applied");
