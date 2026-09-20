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
  canonicalBattlePokemonName,
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
  calendarDisplaySourceType,
  calendarSourceTypesForUser,
  eventSyncHealthSourcesForUser,
  findMatches,
  officialEventPageUrlsForSync,
  officialMaxBattleSupplementsFromText,
  officialRaidSupplementStatements,
  retainedOfficialEventPageUrls,
  suppressionSourceTypesForEvent
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

assert.deepEqual(
  calendarSourceTypesForUser({
    included_sources:
      JSON.stringify([
        "raid_battles",
        "max_battles",
        "max_mondays"
      ])
  }),
  [
    "raid_battles",
    "max_battles",
    "max_mondays",
    MAX_ROTATION_SOURCE_TYPE
  ]
);
assert.deepEqual(
  calendarSourceTypesForUser({
    included_sources:
      JSON.stringify([
        "raid_battles",
        "max_mondays"
      ])
  }),
  [
    "raid_battles",
    "max_mondays"
  ],
  "Weekly rotations inherit Max Battles, not the separate Max Monday calendar toggle"
);
assert.equal(
  calendarDisplaySourceType(
    MAX_ROTATION_SOURCE_TYPE
  ),
  "max_battles"
);

const maxHealthSources =
  eventSyncHealthSourcesForUser({
    included_sources:
      JSON.stringify([
        "max_battles"
      ])
  });

assert.deepEqual(
  maxHealthSources.map(
    source =>
      source.source_key
  ),
  [
    "event:max_battles",
    `event:${MAX_ROTATION_SOURCE_TYPE}`,
    "event:pokemon_go_api_current_max_battles"
  ],
  "Per-source freshness must include only selected event feeds plus their Max-derived dependencies"
);
assert.equal(
  maxHealthSources.some(
    source =>
      source.source_key ===
      "event:community_day"
  ),
  false
);
assert.deepEqual(
  suppressionSourceTypesForEvent({
    source_type:
      MAX_ROTATION_SOURCE_TYPE
  }),
  [
    MAX_ROTATION_SOURCE_TYPE,
    "max_battles"
  ]
);

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
assert.equal(
  canonicalBattlePokemonName(
    birdRotation,
    "Zapdos"
  ),
  "Dynamax Zapdos"
);
assert.equal(
  canonicalBattlePokemonName(
    birdRotation,
    "Moltres"
  ),
  "Dynamax Moltres"
);

const groupedBirdMatches =
  findMatches(
    birdRotation.summary,
    [],
    [],
    birdRotation,
    [
      { names: { English: "Articuno" } },
      { names: { English: "Zapdos" } },
      { names: { English: "Moltres" } }
    ]
  );

assert.deepEqual(
  groupedBirdMatches
    .map(item => item.name)
    .sort(),
  [
    "Dynamax Articuno",
    "Dynamax Moltres",
    "Dynamax Zapdos"
  ]
);

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
    birdRotation,
    {
      pokemonName: "Zapdos",
      remoteEligible: true
    }
  ),
  {
    battle_system: "max",
    battle_variant: "dynamax",
    boss_name: "Dynamax Zapdos",
    encounter_name: "Zapdos",
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
assert.match(
  workerSource,
  /source:\s*MAX_ROTATION_SOURCE_TYPE,[\s\S]*?ok:\s*true,[\s\S]*?count,[\s\S]*?derived:\s*true/
);
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

const mixedTierEvidence =
  officialMaxBattleSupplementsFromText(
    [
      "Dynamax Example Max Battle Day",
      "Saturday, October 10, 2026",
      "Featured Pokémon",
      "The following Pokémon will appear in one-star Max Battles!",
      "Dynamax Wooloo",
      "The following Pokémon will appear in three-star Max Battles!",
      "Dynamax Beldum",
      "Event Bonuses"
    ].join("\n"),
    "https://pokemongo.com/news/mixed-tier-example"
  );

assert.deepEqual(
  mixedTierEvidence.map(
    item => ({
      pokemon_name:
        item.pokemon_name,
      max_battle_tier:
        item.max_battle_tier,
      max_particle_cost:
        item.max_particle_cost
    })
  ),
  [
    {
      pokemon_name:
        "Dynamax Wooloo",
      max_battle_tier:
        1,
      max_particle_cost:
        250
    },
    {
      pokemon_name:
        "Dynamax Beldum",
      max_battle_tier:
        3,
      max_particle_cost:
        400
    }
  ]
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

const discoveredOfficialPages =
  Array.from(
    { length: 8 },
    (_value, index) =>
      `https://pokemongo.com/news/current-${index + 1}`
  );

const retainedLongLeadPage =
  "https://pokemongo.com/news/long-lead-event";

assert.deepEqual(
  officialEventPageUrlsForSync(
    discoveredOfficialPages,
    [
      retainedLongLeadPage,
      discoveredOfficialPages[0],
      "https://example.com/not-official"
    ]
  ),
  [
    ...discoveredOfficialPages,
    retainedLongLeadPage
  ],
  "A still-upcoming retained official source must survive beyond the newest-news discovery budget"
);

assert.deepEqual(
  officialEventPageUrlsForSync(
    [
      ...discoveredOfficialPages,
      "https://pokemongo.com/news/current-9"
    ],
    [],
    {
      discoveryLimit: 8
    }
  ),
  discoveredOfficialPages,
  "Fresh discovery remains bounded independently from retained future sources"
);

const retainedQueries = [];
const retainedSourceEnv = {
  DB: {
    prepare(sql) {
      return {
        bind(...args) {
          retainedQueries.push({
            sql,
            args
          });

          return {
            async all() {
              return {
                results: [
                  {
                    source_url:
                      retainedLongLeadPage
                  },
                  {
                    source_url:
                      "https://example.com/not-official"
                  }
                ]
              };
            }
          };
        }
      };
    }
  }
};

assert.deepEqual(
  await retainedOfficialEventPageUrls(
    retainedSourceEnv,
    "2026-09-21"
  ),
  [
    retainedLongLeadPage
  ],
  "Retained future-source recovery must reject non-official stored URLs"
);
assert.match(
  retainedQueries[0].sql,
  /status IN \([\s\S]*'active',[\s\S]*'stale'/
);
assert.deepEqual(
  retainedQueries[0].args,
  [
    "2026-09-21",
    48
  ],
  "Retained official-source lookup must cover the future event horizon with its independent safety cap"
);

const preparedStatements = [];
const supplementEnv = {
  DB: {
    prepare(sql) {
      return {
        bind(...args) {
          const statement = {
            sql,
            args
          };

          preparedStatements.push(
            statement
          );

          return statement;
        }
      };
    }
  }
};

const preservedStatements =
  await officialRaidSupplementStatements(
    supplementEnv,
    [],
    "2026-09-21T00:00:00.000Z",
    []
  );

assert.equal(
  preservedStatements.length,
  0,
  "If no official page refreshed successfully, last-known future supplements must not be blanket-staled"
);

const scopedStatements =
  await officialRaidSupplementStatements(
    supplementEnv,
    [],
    "2026-09-21T00:00:00.000Z",
    [
      retainedLongLeadPage
    ]
  );

assert.equal(
  scopedStatements.length,
  1
);
assert.match(
  preparedStatements.at(-1).sql,
  /source_url IN \(\?\)/
);
assert.deepEqual(
  preparedStatements.at(-1).args,
  [
    "2026-09-21T00:00:00.000Z",
    retainedLongLeadPage
  ],
  "Only a fully refreshed official source page is eligible to stale its previous supplement rows"
);

assert.match(
  workerSource,
  /retainedOfficialEventPageUrls/
);
assert.match(
  workerSource,
  /status IN \([\s\S]*'active',[\s\S]*'stale'/
);
assert.match(
  workerSource,
  /refreshedPageUrls/
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
