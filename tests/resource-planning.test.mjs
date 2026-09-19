import assert from "node:assert/strict";
import {
  MAX_PARTICLE_COST_BY_TIER,
  STANDARD_MAX_PARTICLE_DAILY_LIMIT,
  STANDARD_MAX_PARTICLE_STORAGE_LIMIT,
  buildBattleForecast,
  buildBattleResourcePlan,
  inferMaxParticleCost,
  maxBattleTierFromText,
  maxBattleRemotePassEligible,
  maxParticleAvailability,
  normalizeBattleResourceState
} from "../src/resource-planning.js";

assert.equal(STANDARD_MAX_PARTICLE_DAILY_LIMIT, 800);
assert.equal(STANDARD_MAX_PARTICLE_STORAGE_LIMIT, 1500);
assert.deepEqual(MAX_PARTICLE_COST_BY_TIER, {
  1: 250,
  2: 400,
  3: 400,
  4: 800,
  5: 800,
  6: 800
});

assert.equal(
  maxBattleTierFromText(
    "The following Pokémon will appear in six-star Max Battles!"
  ),
  6
);
assert.equal(
  maxBattleTierFromText(
    "Difficulty: 3"
  ),
  3
);
assert.equal(
  maxBattleTierFromText(
    "Tier two Max Battle"
  ),
  2
);
assert.equal(
  maxBattleTierFromText(
    "Difficulty 3★"
  ),
  3
);


assert.deepEqual(
  inferMaxParticleCost({
    battle_system: "max",
    event_title: "Tier 3 Max Battle"
  }),
  {
    cost: 400,
    basis: "standard_tier_3",
    confidence: "verified_tier_standard_cost",
    tier: 3,
    tier_source: "event_text",
    evidence_source: "event"
  }
);

assert.deepEqual(
  inferMaxParticleCost({
    battle_system: "max",
    source_kind: "official",
    event_title:
      "Gigantamax Cinderace Max Battle Day",
    event_description:
      "The following Pokémon will appear in six-star Max Battles!"
  }),
  {
    cost: 800,
    basis: "standard_tier_6",
    confidence: "verified_tier_standard_cost",
    tier: 6,
    tier_source: "official_text",
    evidence_source: "official"
  }
);

assert.deepEqual(
  inferMaxParticleCost({
    battle_system: "max",
    source_kind: "calendar",
    max_particle_cost_official: true,
    event_other_lines: [
      "X-POGO-MAX-EVIDENCE:official",
      "X-POGO-MAX-BATTLE-TIER:6",
      "X-POGO-MAX-EVIDENCE-URL:https://pokemongo.com/news/example"
    ].join("\n")
  }),
  {
    cost: 800,
    basis: "standard_tier_6",
    confidence: "verified_tier_standard_cost",
    tier: 6,
    tier_source: "official_text",
    evidence_source: "official"
  }
);

assert.deepEqual(
  inferMaxParticleCost({
    battle_system: "max",
    source_kind: "calendar",
    max_particle_cost_official: true,
    event_other_lines: [
      "X-POGO-MAX-EVIDENCE:official",
      "X-POGO-MAX-PARTICLE-COST:400"
    ].join("\n")
  }),
  {
    cost: 400,
    basis: "official_explicit_cost",
    confidence: "official_explicit",
    tier: null,
    tier_source: null,
    evidence_source: "official"
  }
);

assert.deepEqual(
  inferMaxParticleCost({
    battle_system: "max",
    source_kind: "official",
    event_description:
      "Each Trainer must use an entry cost of 250 Max Particles."
  }),
  {
    cost: 250,
    basis: "official_explicit_cost",
    confidence: "official_explicit",
    tier: null,
    tier_source: null,
    evidence_source: "official"
  }
);

assert.equal(
  inferMaxParticleCost({
    battle_system: "max",
    source_kind: "calendar",
    event_description:
      "This community note says the battle requires 250 Max Particles."
  }).cost,
  null
);

assert.equal(
  inferMaxParticleCost({
    battle_system: "max",
    battle_variant: "gigantamax",
    pokemon_name: "Gigantamax Gengar"
  }).cost,
  null,
  "Gigantamax identity alone must not invent an MP cost"
);

assert.equal(
  inferMaxParticleCost({
    battle_system: "max",
    battle_variant: "dynamax",
    pokemon_name: "Dynamax Example"
  }).cost,
  null
);

assert.equal(
  maxBattleRemotePassEligible({
    battle_system: "max",
    remote_pass_capable_by_source: true,
    event_title: "Gigantamax Gengar Max Battles"
  }),
  true
);

assert.equal(
  maxBattleRemotePassEligible({
    battle_system: "max",
    remote_pass_capable_by_source: true,
    event_description: "This event is in-person only."
  }),
  false
);

assert.deepEqual(
  normalizeBattleResourceState({
    max_particles_held: "1200",
    max_particles_collected_today: "500",
    remote_max_passes_used: "2"
  }),
  {
    max_particles_held: 1200,
    max_particles_collected_today: 500,
    remote_max_passes_used: 2
  }
);

assert.deepEqual(
  maxParticleAvailability({
    resourceState: {
      max_particles_held: 1200,
      max_particles_collected_today: 500
    }
  }),
  {
    held: 1200,
    collected_today: 500,
    daily_limit: 800,
    storage_limit: 1500,
    daily_collection_remaining: 300,
    storage_headroom: 300,
    collectible_without_spending: 300,
    projected_spendable_today: 1500,
    over_storage_limit: false
  }
);

const raid = {
  pokemon_name: "Raid Boss",
  battle_system: "raid",
  remote_eligible: true,
  score: 82,
  target: null
};

const gmax = {
  pokemon_name: "Gigantamax Gengar",
  battle_system: "max",
  battle_variant: "gigantamax",
  remote_pass_capable_by_source: true,
  max_battle_tier: 6,
  max_battle_tier_source: "official_text",
  score: 90,
  target: null
};

const sharedOne = buildBattleResourcePlan({
  recommendations: [raid, gmax],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 3
  },
  resourceState: {
    max_particles_held: 800,
    max_particles_collected_today: 800,
    remote_max_passes_used: 0
  },
  personalRemotePassCeiling: 1,
  minScore: 60
});

assert.equal(sharedOne.remote_passes.recommended_additional, 1);
assert.equal(sharedOne.allocations.length, 1);
assert.equal(sharedOne.allocations[0].battle_system, "max");
assert.equal(sharedOne.allocations[0].pokemon_name, "Gigantamax Gengar");
assert.equal(sharedOne.allocations[0].max_particles, 800);
assert.equal(sharedOne.remote_raid_limit.recommended_additional_raids, 0);

const sharedTwo = buildBattleResourcePlan({
  recommendations: [raid, gmax],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 3
  },
  resourceState: {
    max_particles_held: 800,
    max_particles_collected_today: 800,
    remote_max_passes_used: 0
  },
  personalRemotePassCeiling: 2,
  minScore: 60
});

assert.equal(sharedTwo.remote_passes.recommended_additional, 2);
assert.equal(
  sharedTwo.allocations.find(item => item.battle_system === "max")?.count,
  1
);
assert.equal(
  sharedTwo.allocations.find(item => item.battle_system === "raid")?.count,
  1
);
assert.equal(sharedTwo.remote_raid_limit.recommended_additional_raids, 1);

const alreadyAtCeiling = buildBattleResourcePlan({
  recommendations: [raid, gmax],
  remoteRaidPlan: {
    // Shared official-limit usage: 2 ordinary Remote Raids + 1 Remote Max.
    raids_used: 3,
    remote_limit_used: 3,
    official_remaining: 7,
    official_is_unlimited: false,
    system_recommended_budget: 4
  },
  resourceState: {
    max_particles_held: 1500,
    max_particles_collected_today: 0,
    remote_max_passes_used: 1
  },
  personalRemotePassCeiling: 3
});

assert.equal(alreadyAtCeiling.remote_passes.used_total, 3);
assert.equal(alreadyAtCeiling.remote_passes.ordinary_remote_raids_used, 2);
assert.equal(alreadyAtCeiling.remote_raid_limit.used, 3);
assert.equal(alreadyAtCeiling.remote_passes.recommended_additional, 0);
assert.equal(alreadyAtCeiling.allocations.length, 0);


const unlimitedSharedLimit = buildBattleResourcePlan({
  recommendations: [raid],
  remoteRaidPlan: {
    // An event has removed the game cap. Five of these 12 shared uses were
    // Remote Max; they must not be added a second time.
    raids_used: 12,
    remote_limit_used: 12,
    official_remaining: null,
    official_is_unlimited: true,
    system_recommended_budget: 20
  },
  resourceState: {
    max_particles_held: 1500,
    max_particles_collected_today: 0,
    remote_max_passes_used: 5
  },
  personalRemotePassCeiling: 15
});
assert.equal(unlimitedSharedLimit.remote_passes.used_total, 12);
assert.equal(unlimitedSharedLimit.remote_passes.ordinary_remote_raids_used, 7);
assert.equal(unlimitedSharedLimit.remote_raid_limit.used, 12);
assert.equal(unlimitedSharedLimit.remote_raid_limit.is_unlimited, true);

const canCollectThenSpend = buildBattleResourcePlan({
  recommendations: [gmax],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 0
  },
  resourceState: {
    max_particles_held: 600,
    max_particles_collected_today: 500,
    remote_max_passes_used: 0
  },
  personalRemotePassCeiling: 1
});

assert.equal(canCollectThenSpend.max_particles.projected_spendable_today, 900);
assert.equal(canCollectThenSpend.max_particles.planned_spend, 800);
assert.equal(canCollectThenSpend.remote_passes.recommended_additional, 1);

const unknownMax = buildBattleResourcePlan({
  recommendations: [{
    pokemon_name: "Dynamax Unknown",
    battle_system: "max",
    battle_variant: "dynamax",
    remote_pass_capable_by_source: true,
    score: 95
  }],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    system_recommended_budget: 0
  },
  resourceState: {
    max_particles_held: 1500,
    max_particles_collected_today: 0
  },
  personalRemotePassCeiling: 5
});

assert.equal(unknownMax.allocations.length, 0);
assert.match(
  unknownMax.not_allocated[0].reason,
  /cost is unknown/i
);

const localOnly = buildBattleResourcePlan({
  recommendations: [{
    ...gmax,
    event_description: "In-person only"
  }],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    system_recommended_budget: 0
  },
  resourceState: {
    max_particles_held: 1500,
    max_particles_collected_today: 0
  },
  personalRemotePassCeiling: 5
});

assert.equal(localOnly.allocations.length, 0);
assert.match(localOnly.not_allocated[0].reason, /not confirmed as remotely accessible/i);

const withFuture = buildBattleResourcePlan({
  recommendations: [raid],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 1
  },
  resourceState: {},
  personalRemotePassCeiling: 1,
  futureForecast: [
    {
      date: "2026-09-17",
      label: "Thu, Sep 17",
      top_recommendations: [{
        pokemon_name: "Raid Boss",
        score: 82,
        battle_system: "raid"
      }]
    },
    {
      date: "2026-09-18",
      label: "Fri, Sep 18",
      top_recommendations: [{
        pokemon_name: "Future Boss",
        score: 95,
        battle_system: "max",
        battle_variant: "gigantamax",
        max_particle_cost: 800
      }]
    }
  ]
});

assert.equal(withFuture.future_opportunity.pokemon_name, "Future Boss");
assert.equal(withFuture.advice.code, "reserve");

const sharedForecast = buildBattleForecast({
  resourceState: {
    max_particles_held: 900,
    max_particles_collected_today: 300,
    remote_max_passes_used: 0
  },
  minScore: 60,
  marginalValueDecay: 3,
  days: [
    {
      date: "2026-09-19",
      label: "Sat, Sep 19",
      remote_used: 0,
      personal_remote_pass_ceiling: 2,
      official_rule: {
        limit: 10,
        is_unlimited: false
      },
      max_particle_rule: {
        daily_limit: 300,
        storage_limit: 1500
      },
      recommendations: [{
        pokemon_name: "Flexible Raid",
        battle_system: "raid",
        remote_eligible: true,
        score: 82,
        target: {
          id: "raid-target",
          target_type: "raids",
          current_value: 0,
          target_value: 2,
          priority: "high",
          completed: 0
        }
      }]
    },
    {
      date: "2026-09-20",
      label: "Sun, Sep 20",
      remote_used: 0,
      personal_remote_pass_ceiling: 2,
      official_rule: {
        limit: 10,
        is_unlimited: false
      },
      max_particle_rule: {
        daily_limit: 300,
        storage_limit: 1500
      },
      recommendations: [
        {
          pokemon_name: "Flexible Raid",
          battle_system: "raid",
          remote_eligible: true,
          score: 82,
          target: {
            id: "raid-target",
            target_type: "raids",
            current_value: 0,
            target_value: 2,
            priority: "high",
            completed: 0
          }
        },
        {
          pokemon_name: "Gigantamax Mid",
          battle_system: "max",
          battle_variant: "gigantamax",
          remote_pass_capable_by_source: true,
          max_particle_cost: 800,
          max_particle_cost_source: "official_explicit_cost",
          max_particle_cost_confidence: "official_explicit",
          recommendation_score: 82,
          score: 88
        }
      ]
    },
    {
      date: "2026-09-21",
      label: "Mon, Sep 21",
      remote_used: 0,
      personal_remote_pass_ceiling: 2,
      official_rule: {
        limit: 10,
        is_unlimited: false
      },
      max_particle_rule: {
        daily_limit: 300,
        storage_limit: 1500
      },
      recommendations: [{
        pokemon_name: "Gigantamax Future",
        battle_system: "max",
        battle_variant: "gigantamax",
        remote_pass_capable_by_source: true,
        max_particle_cost: 800,
        max_particle_cost_source: "official_explicit_cost",
        max_particle_cost_confidence: "official_explicit",
        recommendation_score: 96,
        score: 99
      }]
    }
  ]
});

assert.equal(sharedForecast.days.length, 3);
assert.equal(sharedForecast.days[0].recommended_raid_budget, 1);
assert.equal(sharedForecast.days[1].recommended_raid_budget, 1);
assert.equal(
  sharedForecast.days
    .flatMap(day => day.allocations)
    .filter(item => item.pokemon_name === "Flexible Raid")
    .reduce((sum, item) => sum + item.count, 0),
  2,
  "Target progress must be budgeted once across the horizon, not once per day"
);
assert.equal(
  sharedForecast.days[2].recommended_max_budget,
  1,
  "The stronger future Max opportunity should remain reachable after MP replenishment"
);
assert.equal(
  sharedForecast.days[1].recommended_max_budget,
  0,
  "The forecast must not spend MP twice when the later higher-value Max battle would become unreachable"
);
assert.equal(
  sharedForecast.days[2].max_particles.required_after_today,
  200
);
assert.equal(
  sharedForecast.best_future_day.date,
  "2026-09-21"
);
assert.equal(
  sharedForecast.days[2].allocations[0].battle_system,
  "max"
);

const sharedForecastReserve = buildBattleResourcePlan({
  recommendations: [{
    pokemon_name: "Today Raid",
    battle_system: "raid",
    remote_eligible: true,
    score: 82
  }],
  remoteRaidPlan: {
    raids_used: 0,
    remote_limit_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 2,
    forecast_recommended_additional_raids: 1
  },
  resourceState: {
    max_particles_held: 600,
    max_particles_collected_today: 300
  },
  personalRemotePassCeiling: 2,
  minScore: 60,
  maxParticleDailyLimit: 300,
  futureForecast: sharedForecast.days
});

assert.equal(
  sharedForecastReserve.future_opportunity.pokemon_name,
  "Gigantamax Future"
);
assert.equal(
  sharedForecastReserve.max_particles.reserved_for_future,
  200,
  "Future-saving guidance must use the shared forecast's actual replenishment path"
);

console.log("shared battle resource planning tests passed");
