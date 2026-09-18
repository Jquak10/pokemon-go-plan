import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BATTLE_PLAN_FILTER,
  BATTLE_SOURCE_TYPES,
  BATTLE_SYSTEM,
  BATTLE_VARIANT,
  MAX_BATTLE_SOURCE_TYPES,
  MAX_ROTATION_SOURCE_TYPE,
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
  maxBattleVariantFromText,
  maxRotationEventFromMaxMonday
} from "../src/battle-opportunities.js";
import {
  officialMaxBattleSupplementsFromText
} from "../src/index.js";

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
assert.equal(BATTLE_SOURCE_TYPES.has(MAX_ROTATION_SOURCE_TYPE), true);
assert.equal(REMOTE_PASS_SOURCE_TYPES.has(MAX_ROTATION_SOURCE_TYPE), true);

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

const rhyhornRotation = maxRotationEventFromMaxMonday({
  source_type: "max_mondays",
  source_uid: "max-mondays-2026-09-14",
  summary: "[MM] Dynamax Rhyhorn during Max Monday",
  description: "Power Spots refresh more frequently.",
  start_date: "2026-09-14",
  end_date: "2026-09-14",
  source_url: "https://leekduck.com/events/max-mondays-2026-09-14/"
});
assert.equal(rhyhornRotation.source_type, MAX_ROTATION_SOURCE_TYPE);
assert.equal(rhyhornRotation.start_date, "2026-09-14");
assert.equal(rhyhornRotation.end_date, "2026-09-20");
assert.equal(rhyhornRotation.dtend_line, "DTEND;VALUE=DATE:20260921");
assert.equal(rhyhornRotation.summary, "[MR] Dynamax Rhyhorn in Max Battles");
assert.equal(maxBattleVariantForEvent(rhyhornRotation, "Rhyhorn"), BATTLE_VARIANT.DYNAMAX);

const birdRotation = maxRotationEventFromMaxMonday({
  source_type: "max_mondays",
  source_uid: "max-mondays-2026-09-21",
  summary: "[MM] Dynamax Articuno, Zapdos, and Moltres during Max Monday",
  start_date: "2026-09-21",
  source_url: "https://leekduck.com/events/max-mondays-2026-09-21/"
});
assert.equal(birdRotation.end_date, "2026-09-27");
assert.match(birdRotation.summary, /Articuno, Zapdos, and Moltres/);
assert.equal(maxBattleVariantForEvent(birdRotation, "Zapdos"), BATTLE_VARIANT.DYNAMAX);

assert.equal(maxRotationEventFromMaxMonday({
  source_type: "max_mondays",
  summary: "[MM] Gigantamax Gengar during Max Monday",
  start_date: "2026-10-05"
}), null);
assert.equal(maxRotationEventFromMaxMonday({
  source_type: "max_battles",
  summary: "[MB] Gigantamax Cinderace Max Battle Day",
  start_date: "2026-10-03"
}), null);

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
assert.match(workerSource, /async function syncDerivedMaxRotations\(env\)/);
assert.match(workerSource, /source_type = 'max_mondays'/);
assert.match(workerSource, /source: MAX_ROTATION_SOURCE_TYPE, ok: true, count, derived: true/);
assert.doesNotMatch(
  workerSource.match(/const SOURCES = \{[\s\S]*?\n\};/)?.[0] || "",
  /max_rotation\s*:/
);

const officialCinderaceText = [
  "Gigantamax Cinderace Max Battle Day",
  "Saturday, October 3, 2026, from 2:00 p.m. to 5:00 p.m. local time",
  "Featured Pokémon",
  "The following Pokémon will appear in six-star Max Battles!",
  "Gigantamax Cinderace",
  "For the first time in Pokémon GO, Shiny Gigantamax Cinderace may appear.",
  "Event Bonuses",
  "Max Particle collection limit increased to 1,600",
  "From October 2 at 5:00 p.m. to October 3 at 8:00 p.m. PDT, the Remote Raid limit will increase.",
  "Pokémon GO Web Store",
  "The ticket box includes 800 Max Particles at no additional cost."
].join("\n");

const cinderaceEvidence =
  officialMaxBattleSupplementsFromText(
    officialCinderaceText,
    "https://pokemongo.com/news/gigantamax-cinderace-max-battle-day-2026"
  );

assert.equal(
  cinderaceEvidence.length,
  1
);
assert.equal(
  cinderaceEvidence[0].pokemon_name,
  "Gigantamax Cinderace"
);
assert.equal(
  cinderaceEvidence[0].start_date,
  "2026-10-03"
);
assert.equal(
  cinderaceEvidence[0].end_date,
  "2026-10-03"
);
assert.equal(
  cinderaceEvidence[0].max_battle_tier,
  6
);
assert.equal(
  cinderaceEvidence[0].max_particle_cost,
  800
);
assert.equal(
  cinderaceEvidence[0].max_particle_cost_source,
  "standard_tier_6"
);
assert.equal(
  cinderaceEvidence[0].max_particle_cost_confidence,
  "verified_tier_standard_cost"
);

// Store-bundle MP text is not battle entry-cost evidence, and species identity
// alone must not create a cost.
assert.deepEqual(
  officialMaxBattleSupplementsFromText(
    [
      "Gigantamax Example Max Battle Day",
      "Saturday, October 10, 2026",
      "Featured Pokémon",
      "Gigantamax Example",
      "The ticket box includes 800 Max Particles at no additional cost."
    ].join("\n"),
    "https://pokemongo.com/news/example"
  ),
  []
);

assert.match(
  workerSource,
  /officialMaxBattleEvidenceStatements/
);
assert.match(
  workerSource,
  /X-POGO-MAX-EVIDENCE:official/
);
assert.match(
  workerSource,
  /X-POGO-MAX-BATTLE-TIER:/
);
assert.match(
  workerSource,
  /max_battle_tier:/
);
assert.match(
  workerSource,
  /max_particle_cost_evidence_source:/
);
assert.match(
  workerSource,
  /maxBattleLinks[\s\S]*otherLinks/
);

console.log("battle opportunity foundation tests passed");
