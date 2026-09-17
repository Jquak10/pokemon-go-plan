import assert from "node:assert/strict";
import {
  DEFAULT_FUTURE_RESERVE_SCORE_GAP,
  MAX_OPPORTUNITY_METHOD_VERSION,
  buildBattleResourcePlan,
  planningValueForRecommendation
} from "../src/resource-planning.js";

assert.equal(DEFAULT_FUTURE_RESERVE_SCORE_GAP, 8);
assert.equal(MAX_OPPORTUNITY_METHOD_VERSION, "max-opportunity-v1");

const raidValue = planningValueForRecommendation({
  pokemon_name: "Raid Boss",
  battle_system: "raid",
  score: 84
});

assert.deepEqual(raidValue, {
  score: 84,
  basis: "raid_recommendation",
  method_version: null,
  max_performance_ranked: null,
  components: {
    recommendation: 84
  },
  note: null
});

const dynamaxValue = planningValueForRecommendation({
  pokemon_name: "Dynamax Example",
  battle_system: "max",
  battle_variant: "dynamax",
  score: 96,
  meta: {
    rarity_score: 40,
    raid_rankings_json: JSON.stringify({
      attack_types: {
        Electric: [
          { rank: 1, pokemon_name: "Should Not Affect Max Value" }
        ]
      }
    })
  }
});

assert.equal(dynamaxValue.score, 79);
assert.equal(dynamaxValue.basis, MAX_OPPORTUNITY_METHOD_VERSION);
assert.equal(dynamaxValue.max_performance_ranked, false);
assert.match(dynamaxValue.note, /does not use normal Raid attacker rankings/i);

const gigantamaxValue = planningValueForRecommendation({
  pokemon_name: "Gigantamax Example",
  battle_system: "max",
  battle_variant: "gigantamax",
  score: 80,
  meta: {
    rarity_score: 90
  }
});

assert.equal(gigantamaxValue.score, 85);
assert.ok(gigantamaxValue.score > 80);

const raid = {
  pokemon_name: "Today Raid",
  battle_system: "raid",
  remote_eligible: true,
  score: 82
};

const futureStrong = [
  {
    date: "2026-09-18",
    label: "Fri, Sep 18",
    top_recommendations: [raid]
  },
  {
    date: "2026-09-19",
    label: "Sat, Sep 19",
    top_recommendations: [{
      pokemon_name: "Tomorrow Raid",
      battle_system: "raid",
      remote_eligible: true,
      score: 95
    }]
  }
];

const reserveOnlyPass = buildBattleResourcePlan({
  recommendations: [raid],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 3
  },
  personalRemotePassCeiling: 1,
  futureForecast: futureStrong
});

assert.equal(reserveOnlyPass.remote_passes.recommended_additional, 0);
assert.equal(reserveOnlyPass.remote_passes.reserved_for_future, 1);
assert.equal(reserveOnlyPass.opportunity_cost.decision, "reserve");
assert.equal(reserveOnlyPass.opportunity_cost.score_gap, 13);
assert.equal(reserveOnlyPass.future_opportunity.pokemon_name, "Tomorrow Raid");
assert.equal(reserveOnlyPass.next_remote_pass.action, "save");
assert.equal(reserveOnlyPass.next_remote_pass.pokemon_name, "Tomorrow Raid");
assert.equal(reserveOnlyPass.advice.code, "reserve");
assert.match(reserveOnlyPass.advice.headline, /Save your next Remote Pass/i);

const useOneSaveOne = buildBattleResourcePlan({
  recommendations: [raid],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 3
  },
  personalRemotePassCeiling: 2,
  futureForecast: futureStrong
});

assert.equal(useOneSaveOne.remote_passes.recommended_additional, 1);
assert.equal(useOneSaveOne.remote_passes.reserved_for_future, 1);
assert.equal(useOneSaveOne.allocations[0].pokemon_name, "Today Raid");
assert.equal(useOneSaveOne.next_remote_pass.action, "use");
assert.equal(useOneSaveOne.next_remote_pass.pokemon_name, "Today Raid");
assert.match(useOneSaveOne.advice.headline, /save 1 for Tomorrow Raid/i);

const futureClose = buildBattleResourcePlan({
  recommendations: [raid],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 3
  },
  personalRemotePassCeiling: 1,
  futureForecast: [
    futureStrong[0],
    {
      date: "2026-09-19",
      label: "Sat, Sep 19",
      top_recommendations: [{
        pokemon_name: "Slightly Better Raid",
        battle_system: "raid",
        score: 87
      }]
    }
  ]
});

assert.equal(futureClose.remote_passes.reserved_for_future, 0);
assert.equal(futureClose.remote_passes.recommended_additional, 1);
assert.equal(futureClose.future_opportunity, null);
assert.equal(futureClose.opportunity_cost.decision, "use_current_value");

const currentMax = {
  pokemon_name: "Dynamax Today",
  battle_system: "max",
  battle_variant: "dynamax",
  remote_pass_capable_by_source: true,
  max_particle_cost: 400,
  max_particle_cost_source: "explicit",
  score: 90
};

const futureGmax = buildBattleResourcePlan({
  recommendations: [currentMax],
  remoteRaidPlan: {
    raids_used: 0,
    official_remaining: 10,
    official_is_unlimited: false,
    system_recommended_budget: 0
  },
  resourceState: {
    max_particles_held: 900,
    max_particles_collected_today: 300,
    remote_max_passes_used: 0
  },
  personalRemotePassCeiling: 2,
  maxParticleDailyLimit: 300,
  maxParticleStorageLimit: 1500,
  futureForecast: [
    {
      date: "2026-09-18",
      label: "Fri, Sep 18",
      top_recommendations: [currentMax]
    },
    {
      date: "2026-09-19",
      label: "Sat, Sep 19",
      top_recommendations: [{
        pokemon_name: "Gigantamax Tomorrow",
        battle_system: "max",
        battle_variant: "gigantamax",
        remote_pass_capable_by_source: true,
        max_particle_cost: 800,
        max_particle_cost_source: "explicit",
        score: 99
      }]
    }
  ]
});

assert.equal(futureGmax.remote_passes.reserved_for_future, 1);
assert.equal(futureGmax.max_particles.reserved_for_future, 500);
assert.equal(futureGmax.max_particles.planned_spend, 400);
assert.equal(futureGmax.max_particles.projected_after_plan, 500);
assert.equal(futureGmax.opportunity_cost.projected_future_max_particles, 800);
assert.equal(futureGmax.allocations[0].score_basis, MAX_OPPORTUNITY_METHOD_VERSION);
assert.equal(futureGmax.allocations[0].max_performance_ranked, false);

console.log("recommendation engine refinement tests passed");
