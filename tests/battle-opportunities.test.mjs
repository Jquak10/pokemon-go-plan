import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BATTLE_PLAN_FILTER,
  BATTLE_SOURCE_TYPES,
  BATTLE_SYSTEM,
  BATTLE_VARIANT,
  MAX_BATTLE_SOURCE_TYPES,
  RAID_SOURCE_TYPES,
  REMOTE_PASS_SOURCE_TYPES,
  battleOpportunityMetadata,
  battleOpportunityPresentation,
  battlePlanFilterMatches,
  battleSpritePolicy,
  battleSystemForSourceType,
  battleSystemLabel,
  battleVariantLabel,
  encounterNameForMaxPokemon,
  maxBattleVariantForEvent,
  maxBattleVariantFromText
} from "../src/battle-opportunities.js";

assert.equal(
  battleSystemForSourceType("raid_battles"),
  BATTLE_SYSTEM.RAID
);
assert.equal(
  battleSystemForSourceType("max_battles"),
  BATTLE_SYSTEM.MAX
);
assert.equal(
  battleSystemForSourceType("max_mondays"),
  BATTLE_SYSTEM.MAX
);
assert.equal(
  battleSystemForSourceType("community_day"),
  null
);

assert.equal(RAID_SOURCE_TYPES.has("max_battles"), false);
assert.equal(MAX_BATTLE_SOURCE_TYPES.has("raid_hour"), false);
assert.equal(BATTLE_SOURCE_TYPES.has("max_battles"), true);
assert.equal(BATTLE_SOURCE_TYPES.has("raid_hour"), true);
assert.equal(REMOTE_PASS_SOURCE_TYPES.has("raid_battles"), true);
assert.equal(REMOTE_PASS_SOURCE_TYPES.has("max_battles"), true);
assert.equal(REMOTE_PASS_SOURCE_TYPES.has("max_mondays"), true);

assert.equal(
  maxBattleVariantFromText("Gigantamax Gengar"),
  BATTLE_VARIANT.GIGANTAMAX
);
assert.equal(
  maxBattleVariantFromText("G-Max Charizard"),
  BATTLE_VARIANT.GIGANTAMAX
);
assert.equal(
  maxBattleVariantFromText("Dynamax Beldum"),
  BATTLE_VARIANT.DYNAMAX
);
assert.equal(maxBattleVariantFromText("Beldum"), null);

assert.equal(
  maxBattleVariantForEvent({
    source_type: "max_battles",
    summary: "Gigantamax Gengar Max Battles"
  }),
  BATTLE_VARIANT.GIGANTAMAX
);
assert.equal(
  maxBattleVariantForEvent({
    source_type: "raid_battles",
    summary: "Gigantamax Gengar"
  }),
  null
);
assert.equal(
  maxBattleVariantForEvent({
    source_type: "max_battles",
    summary: "Articuno, Zapdos & Moltres Max Battles"
  }),
  BATTLE_VARIANT.DYNAMAX
);
assert.equal(
  maxBattleVariantForEvent({
    source_type: "max_mondays",
    summary: "Rhyhorn"
  }),
  BATTLE_VARIANT.DYNAMAX
);

assert.equal(
  encounterNameForMaxPokemon("Gigantamax Charizard"),
  "Charizard"
);
assert.equal(
  encounterNameForMaxPokemon("Dynamax Alolan Raichu"),
  "Alolan Raichu"
);
assert.equal(
  encounterNameForMaxPokemon("Toxtricity Amped Form (Gigantamax)"),
  "Toxtricity Amped Form"
);
assert.equal(
  encounterNameForMaxPokemon("Charizard"),
  "Charizard"
);
assert.equal(encounterNameForMaxPokemon(""), null);

assert.equal(battleSystemLabel(BATTLE_SYSTEM.RAID), "Raid");
assert.equal(battleSystemLabel(BATTLE_SYSTEM.MAX), "Max Battle");
assert.equal(battleSystemLabel("unknown"), "Battle");
assert.equal(battleVariantLabel(BATTLE_VARIANT.DYNAMAX), "Dynamax");
assert.equal(battleVariantLabel(BATTLE_VARIANT.GIGANTAMAX), "Gigantamax");
assert.equal(battleVariantLabel(null), null);

assert.equal(
  battlePlanFilterMatches(BATTLE_PLAN_FILTER.ALL, BATTLE_SYSTEM.RAID),
  true
);
assert.equal(
  battlePlanFilterMatches(BATTLE_PLAN_FILTER.ALL, BATTLE_SYSTEM.MAX),
  true
);
assert.equal(
  battlePlanFilterMatches(BATTLE_PLAN_FILTER.RAIDS, BATTLE_SYSTEM.MAX),
  false
);
assert.equal(
  battlePlanFilterMatches(BATTLE_PLAN_FILTER.MAX_BATTLES, BATTLE_SYSTEM.MAX),
  true
);

assert.deepEqual(
  battleOpportunityMetadata(
    {
      source_type: "max_battles",
      summary: "Gigantamax Gengar"
    },
    {
      pokemonName: "Gigantamax Gengar",
      remoteEligible: true
    }
  ),
  {
    battle_system: "max",
    battle_variant: "gigantamax",
    boss_name: "Gigantamax Gengar",
    encounter_name: "Gengar",
    remote_pass_capable_by_source: true,
    remote_eligible: true
  }
);

assert.deepEqual(
  battleOpportunityMetadata(
    {
      source_type: "raid_hour",
      summary: "Raid Hour"
    },
    {
      pokemonName: "Mewtwo"
    }
  ),
  {
    battle_system: "raid",
    battle_variant: null,
    boss_name: "Mewtwo",
    encounter_name: null,
    remote_pass_capable_by_source: true,
    remote_eligible: null
  }
);

assert.equal(
  battleOpportunityMetadata({
    source_type: "community_day",
    summary: "Community Day"
  }),
  null
);

const gigantamaxMetadata = battleOpportunityMetadata(
  {
    source_type: "max_battles",
    summary: "Gigantamax Gengar"
  },
  {
    pokemonName: "Gigantamax Gengar"
  }
);

assert.deepEqual(
  battleSpritePolicy(gigantamaxMetadata),
  {
    identity: "Gigantamax Gengar",
    requires_exact_form: true,
    badge: "GMAX"
  }
);

const dynamaxMetadata = battleOpportunityMetadata(
  {
    source_type: "max_battles",
    summary: "Dynamax Beldum"
  },
  {
    pokemonName: "Dynamax Beldum"
  }
);

assert.deepEqual(
  battleSpritePolicy(dynamaxMetadata),
  {
    identity: "Beldum",
    requires_exact_form: false,
    badge: "DYNAMAX"
  }
);

assert.deepEqual(
  battleOpportunityPresentation(gigantamaxMetadata),
  {
    system_label: "Max Battle",
    variant_label: "Gigantamax",
    filter_key: "max",
    sprite_policy: {
      identity: "Gigantamax Gengar",
      requires_exact_form: true,
      badge: "GMAX"
    }
  }
);

// Max Battle and Max Monday feeds already participate in the existing event
// sync and default calendar selection. Keep that plumbing intact while the
// recommendation/UI layers migrate to the shared battle model in later PRs.
const workerSource = readFileSync(
  new URL("../src/index.js", import.meta.url),
  "utf8"
);

assert.match(
  workerSource,
  /max_battles:\s*SOURCE_BASE\s*\+\s*"gocal__max_battles\.ics"/
);
assert.match(
  workerSource,
  /max_mondays:\s*SOURCE_BASE\s*\+\s*"gocal__max_mondays\.ics"/
);
assert.match(
  workerSource,
  /const DEFAULT_SOURCES = \[[\s\S]*"max_battles"[\s\S]*"max_mondays"[\s\S]*\];/
);

console.log("battle opportunity foundation tests passed");
