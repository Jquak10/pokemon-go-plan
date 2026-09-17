import assert from "node:assert/strict";
import {
  MAX_RANK_METHOD_VERSION,
  buildMaxAttackerRankCatalog,
  maxAttackTypeForFastMove,
  maxAttackerCandidates,
  maxRankProfileForName
} from "../src/max-rankings.js";

const move = (name, type, power, energy, durationMs) => ({
  id: name.toUpperCase().replace(/\s+/g, "_"),
  names: { English: name },
  type: { names: { English: type } },
  power,
  energy,
  durationMs
});

const charizard = {
  id: "CHARIZARD",
  formId: "CHARIZARD",
  names: { English: "Charizard" },
  stats: { attack: 223, defense: 173, stamina: 186 },
  primaryType: { names: { English: "Fire" } },
  secondaryType: { names: { English: "Flying" } },
  quickMoves: {
    FIRE_SPIN_FAST: move("Fire Spin", "Fire", 14, 10, 1100),
    AIR_SLASH_FAST: move("Air Slash", "Flying", 14, 10, 1200)
  },
  cinematicMoves: {
    BLAST_BURN: move("Blast Burn", "Fire", 110, -50, 3300)
  },
  eliteQuickMoves: {},
  eliteCinematicMoves: {},
  hasGigantamaxEvolution: true,
  regionForms: {}
};

const blastoise = {
  id: "BLASTOISE",
  formId: "BLASTOISE",
  names: { English: "Blastoise" },
  stats: { attack: 171, defense: 207, stamina: 188 },
  primaryType: { names: { English: "Water" } },
  secondaryType: null,
  quickMoves: {
    WATER_GUN_FAST: move("Water Gun", "Water", 5, 5, 500)
  },
  cinematicMoves: {
    HYDRO_CANNON: move("Hydro Cannon", "Water", 90, -50, 1900)
  },
  eliteQuickMoves: {},
  eliteCinematicMoves: {},
  hasGigantamaxEvolution: true,
  regionForms: {}
};

const ineligible = {
  id: "MEWTWO",
  formId: "MEWTWO",
  names: { English: "Mewtwo" },
  stats: { attack: 300, defense: 182, stamina: 214 },
  primaryType: { names: { English: "Psychic" } },
  secondaryType: null,
  quickMoves: {
    CONFUSION_FAST: move("Confusion", "Psychic", 20, 15, 1600)
  },
  cinematicMoves: {
    PSYSTRIKE: move("Psystrike", "Psychic", 90, -50, 2300)
  },
  eliteQuickMoves: {},
  eliteCinematicMoves: {},
  hasGigantamaxEvolution: false,
  regionForms: {}
};

assert.equal(MAX_RANK_METHOD_VERSION, "max-rank-v1-fast-type-bulk");
assert.equal(
  maxAttackTypeForFastMove(charizard.quickMoves.FIRE_SPIN_FAST),
  "fire"
);

const candidates = maxAttackerCandidates(
  [charizard, blastoise, ineligible],
  { maxEligibleNames: ["Charizard", "Blastoise"] }
);

assert.equal(candidates.some(item => item.pokemon_name === "Mewtwo"), false);
assert.equal(candidates.some(item => item.pokemon_name === "Charizard" && item.attack_type === "fire"), true);
assert.equal(candidates.some(item => item.pokemon_name === "Charizard" && item.attack_type === "flying"), true);

const catalog = buildMaxAttackerRankCatalog(
  [charizard, blastoise, ineligible],
  { maxEligibleNames: ["Charizard", "Blastoise"], topN: 6 }
);

assert.equal(catalog.method_version, MAX_RANK_METHOD_VERSION);
assert.equal(catalog.eligibility_basis, "explicit_max_availability");
assert.match(catalog.method, /Fast Attack/i);
assert.match(catalog.method, /bulk/i);
assert.match(catalog.method, /G-Max move power\/type is not invented/i);
assert.equal(catalog.rankings.fire[0].pokemon_name, "Charizard");
assert.equal(catalog.rankings.fire[0].max_attack_type, "fire");
assert.equal(catalog.rankings.fire[0].max_attack_basis, "fast_attack_type");
assert.equal(catalog.rankings.water[0].pokemon_name, "Blastoise");
assert.equal(catalog.rankings.psychic, undefined);

const charizardProfile = maxRankProfileForName(catalog, "Charizard");
assert.equal(charizardProfile.method_version, MAX_RANK_METHOD_VERSION);
assert.equal(charizardProfile.by_type.fire.pokemon_name, "Charizard");
assert.equal(charizardProfile.by_type.flying.pokemon_name, "Charizard");
assert.equal(charizardProfile.best.score, 100);

assert.equal(maxRankProfileForName(catalog, "Mewtwo"), null);

console.log("Max attacker ranking tests passed");
