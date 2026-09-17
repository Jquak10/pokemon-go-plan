import { MAX_RANK_METHOD_VERSION } from "./max-rankings.js";

export const STANDARD_MAX_PARTICLE_DAILY_LIMIT = 800;
export const STANDARD_MAX_PARTICLE_STORAGE_LIMIT = 1500;
export const DEFAULT_PAID_BATTLE_MIN_SCORE = 60;
export const DEFAULT_MARGINAL_VALUE_DECAY = 3;
export const DEFAULT_FUTURE_RESERVE_SCORE_GAP = 8;
export const MAX_OPPORTUNITY_METHOD_VERSION = "max-opportunity-v1";

export const MAX_PARTICLE_COST_BY_TIER = Object.freeze({
  1: 250,
  2: 400,
  3: 400,
  4: 800,
  5: 800,
  6: 800
});

const MAX_CAPABILITY_VALUE = Object.freeze({
  gigantamax: 92,
  dynamax: 72,
  default: 65
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, number)
    : fallback;
}

function wholeNonNegative(value, fallback = 0) {
  return Math.floor(
    finiteNonNegative(value, fallback)
  );
}

function scoreOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? clamp(number, 0, 100)
    : null;
}

function textForRecommendation(recommendation) {
  return [
    recommendation?.event_title,
    recommendation?.event_description,
    recommendation?.description,
    recommendation?.source_excerpt
  ]
    .filter(Boolean)
    .join(" ");
}

function battleSystemLabel(value) {
  return value === "max"
    ? "Max Battle"
    : "Raid";
}

function dayDistance(fromDate, toDate) {
  if (!fromDate || !toDate) return null;

  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);

  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime())
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (to - from) / 86400000
    )
  );
}

export function inferMaxParticleCost(recommendation) {
  if (
    recommendation?.battle_system !== "max"
  ) {
    return {
      cost: null,
      basis: null,
      confidence: null
    };
  }

  const explicit =
    Number(
      recommendation?.max_particle_cost
    );

  if (
    Number.isFinite(explicit) &&
    explicit > 0
  ) {
    return {
      cost:
        Math.floor(explicit),
      basis:
        recommendation?.max_particle_cost_source ||
        "explicit",
      confidence:
        "known"
    };
  }

  const text =
    textForRecommendation(
      recommendation
    );

  const explicitMatch =
    text.match(
      /\b(?:requires?|costs?|cost(?:s)?(?:\s+(?:of|is))?|entry\s+cost(?:\s+(?:of|is))?)\s*:?\s*(\d{2,5})\s*(?:Max\s*Particles?|MP)\b/i
    );

  if (explicitMatch) {
    const cost =
      Number(
        explicitMatch[1]
      );

    if (
      Number.isFinite(cost) &&
      cost > 0
    ) {
      return {
        cost,
        basis:
          "event_text",
        confidence:
          "known"
      };
    }
  }

  const namedTierMatch =
    text.match(
      /\b(?:tier|difficulty)\s*([1-6])\b/i
    );

  const starTierMatch =
    text.match(
      /\b([1-6])\s*(?:-?\s*star|★)/i
    );

  const tierMatch =
    namedTierMatch ||
    starTierMatch;

  if (tierMatch) {
    const tier =
      Number(
        tierMatch[1]
      );

    const cost =
      MAX_PARTICLE_COST_BY_TIER[
        tier
      ] || null;

    if (cost) {
      return {
        cost,
        basis:
          `tier_${tier}`,
        confidence:
          "standard_tier_cost"
      };
    }
  }

  if (
    recommendation?.battle_variant ===
      "gigantamax" ||
    /\bgigantamax\b|\bg[\s-]?max\b/i.test(
      `${recommendation?.pokemon_name || ""} ${text}`
    )
  ) {
    return {
      cost: 800,
      basis:
        "gigantamax_standard",
      confidence:
        "standard_tier_cost"
    };
  }

  return {
    cost: null,
    basis:
      "unknown",
    confidence:
      "unknown"
  };
}

export function maxBattleRemotePassEligible(
  recommendation
) {
  if (
    recommendation?.battle_system !== "max"
  ) {
    return false;
  }

  if (
    !recommendation
      ?.remote_pass_capable_by_source
  ) {
    return false;
  }

  const text =
    textForRecommendation(
      recommendation
    );

  if (
    /(?:in[- ]person|local)[ -]?only|cannot be joined remotely|remote raid passes? (?:cannot|can not|won't|will not) be used|remote participation (?:is )?not available/i.test(
      text
    )
  ) {
    return false;
  }

  return true;
}

export function normalizeBattleResourceState(
  value = {}
) {
  return {
    max_particles_held:
      wholeNonNegative(
        value.max_particles_held
      ),
    max_particles_collected_today:
      wholeNonNegative(
        value.max_particles_collected_today
      ),
    remote_max_passes_used:
      wholeNonNegative(
        value.remote_max_passes_used
      )
  };
}

export function maxParticleAvailability({
  resourceState,
  dailyLimit =
    STANDARD_MAX_PARTICLE_DAILY_LIMIT,
  storageLimit =
    STANDARD_MAX_PARTICLE_STORAGE_LIMIT
}) {
  const state =
    normalizeBattleResourceState(
      resourceState
    );

  const resolvedDailyLimit =
    wholeNonNegative(
      dailyLimit,
      STANDARD_MAX_PARTICLE_DAILY_LIMIT
    );

  const resolvedStorageLimit =
    wholeNonNegative(
      storageLimit,
      STANDARD_MAX_PARTICLE_STORAGE_LIMIT
    );

  const dailyCollectionRemaining =
    Math.max(
      0,
      resolvedDailyLimit -
      state.max_particles_collected_today
    );

  const storageHeadroom =
    Math.max(
      0,
      resolvedStorageLimit -
      state.max_particles_held
    );

  return {
    held:
      state.max_particles_held,
    collected_today:
      state.max_particles_collected_today,
    daily_limit:
      resolvedDailyLimit,
    storage_limit:
      resolvedStorageLimit,
    daily_collection_remaining:
      dailyCollectionRemaining,
    storage_headroom:
      storageHeadroom,
    collectible_without_spending:
      Math.min(
        dailyCollectionRemaining,
        storageHeadroom
      ),
    projected_spendable_today:
      state.max_particles_held +
      dailyCollectionRemaining,
    over_storage_limit:
      state.max_particles_held >
      resolvedStorageLimit
  };
}

/**
 * Resource-planning value for one opportunity.
 *
 * Raid opportunities retain the existing personalized recommendation score.
 * Max opportunities deliberately use a separate provisional method so a
 * normal Raid attacker ranking is never presented as Max Battle performance.
 * Until Part 7 supplies Max-attacker intelligence, the Max planning score is
 * based on the existing general/personal value signal, rarity/availability,
 * and the distinct value of the Max capability itself.
 */
function maxRankProfileForRecommendation(
  recommendation
) {
  const raw =
    recommendation?.max_rank_profile ||
    recommendation?.meta
      ?.max_rankings_json ||
    null;

  if (!raw) return null;

  try {
    const profile =
      typeof raw === "string"
        ? JSON.parse(raw)
        : raw;

    if (
      !profile ||
      typeof profile !== "object" ||
      profile.method_version !==
        MAX_RANK_METHOD_VERSION
    ) {
      return null;
    }

    return profile;
  } catch {
    return null;
  }
}

export function planningValueForRecommendation(
  recommendation
) {
  const system =
    recommendation?.battle_system ||
    "raid";

  const recommendationScore =
    scoreOrNull(
      recommendation?.score
    ) ?? 0;

  if (system !== "max") {
    return {
      score:
        Math.round(
          recommendationScore
        ),
      basis:
        "raid_recommendation",
      method_version:
        null,
      max_performance_ranked:
        null,
      components: {
        recommendation:
          recommendationScore
      },
      note:
        null
    };
  }

  const rarity =
    scoreOrNull(
      recommendation?.meta
        ?.rarity_score
    ) ??
    recommendationScore;

  const variant =
    String(
      recommendation?.battle_variant ||
      ""
    ).toLowerCase();

  const capability =
    MAX_CAPABILITY_VALUE[variant] ??
    MAX_CAPABILITY_VALUE.default;

  const maxProfile =
    maxRankProfileForRecommendation(
      recommendation
    );

  const maxUtility =
    scoreOrNull(
      maxProfile?.utility_score
    );

  if (maxUtility != null) {
    const score =
      clamp(
        recommendationScore * 0.40 +
        rarity * 0.15 +
        capability * 0.15 +
        maxUtility * 0.30,
        0,
        100
      );

    return {
      score:
        Math.round(score),
      basis:
        MAX_RANK_METHOD_VERSION,
      method_version:
        MAX_RANK_METHOD_VERSION,
      max_performance_ranked:
        true,
      components: {
        general_personal_value:
          Math.round(
            recommendationScore
          ),
        rarity_availability:
          Math.round(rarity),
        max_capability:
          capability,
        max_attacker_utility:
          Math.round(maxUtility)
      },
      note:
        "Uses the current Max-specific attacker profile; normal Raid attacker rankings are not used as Max performance."
    };
  }

  const score =
    clamp(
      recommendationScore * 0.55 +
      rarity * 0.20 +
      capability * 0.25,
      0,
      100
    );

  return {
    score:
      Math.round(score),
    basis:
      MAX_OPPORTUNITY_METHOD_VERSION,
    method_version:
      MAX_OPPORTUNITY_METHOD_VERSION,
    max_performance_ranked:
      false,
    components: {
      general_personal_value:
        Math.round(
          recommendationScore
        ),
      rarity_availability:
        Math.round(rarity),
      max_capability:
        capability
    },
    note:
      "Provisional Max opportunity value only. It does not use normal Raid attacker rankings as Max Battle performance."
  };
}

function targetCap(target) {
  if (!target) return Infinity;

  if (
    String(
      target.priority || ""
    ).toLowerCase() === "skip"
  ) {
    return 0;
  }

  if (Number(target.completed)) {
    return 0;
  }

  if (target.target_value == null) {
    return Infinity;
  }

  const desired =
    Number(
      target.target_value
    );

  const current =
    Number(
      target.current_value || 0
    );

  if (
    !Number.isFinite(desired) ||
    desired <= 0
  ) {
    return Infinity;
  }

  const remaining =
    desired - current;

  if (remaining <= 0) {
    return Infinity;
  }

  if (
    ["raids", "battles"].includes(
      target.target_type
    )
  ) {
    return Math.max(
      0,
      Math.ceil(remaining)
    );
  }

  const expected =
    Number(
      target.expected_progress_per_raid
    );

  if (
    Number.isFinite(expected) &&
    expected > 0
  ) {
    return Math.max(
      0,
      Math.ceil(
        remaining / expected
      )
    );
  }

  return Infinity;
}

function naturalAttemptCap(
  recommendation,
  planningScore,
  minScore,
  decay
) {
  const score =
    finiteNonNegative(
      planningScore
    );

  if (score < minScore) {
    return 0;
  }

  const scoreCap =
    Math.max(
      0,
      Math.floor(
        (score - minScore) /
        decay
      ) + 1
    );

  const cap =
    targetCap(
      recommendation?.target
    );

  return Number.isFinite(cap)
    ? Math.min(
        scoreCap,
        cap
      )
    : scoreCap;
}

function recommendationBlockedReason(
  recommendation,
  planningScore,
  minScore
) {
  const target =
    recommendation?.target || null;

  if (
    String(
      target?.priority || ""
    ).toLowerCase() === "skip"
  ) {
    return "Personal priority is set to Skip.";
  }

  if (Number(target?.completed)) {
    return "Personal target is marked complete.";
  }

  if (
    Number(
      planningScore || 0
    ) < minScore
  ) {
    return `${recommendation?.battle_system === "max" ? "Max planning value" : "Recommendation score"} is below your ${minScore}-point paid-battle threshold.`;
  }

  return null;
}

function bestForecastOpportunity(
  forecast,
  threshold
) {
  const days =
    Array.isArray(forecast)
      ? forecast.slice(1)
      : [];

  const todayDate =
    Array.isArray(forecast)
      ? forecast[0]?.date || null
      : null;

  let best = null;

  for (const day of days) {
    for (
      const item of
      day?.top_recommendations || []
    ) {
      const value =
        planningValueForRecommendation(
          item
        );

      if (value.score < threshold) {
        continue;
      }

      const particleCost =
        item?.battle_system === "max"
          ? inferMaxParticleCost(
              item
            )
          : {
              cost: null,
              basis: null
            };

      if (
        !best ||
        value.score >
          best.planning_score
      ) {
        best = {
          date:
            day.date || null,
          label:
            day.label ||
            day.date ||
            "Upcoming",
          pokemon_name:
            item.pokemon_name,
          battle_system:
            item.battle_system ||
            "raid",
          battle_variant:
            item.battle_variant || null,
          max_particle_cost:
            particleCost.cost ??
            item.max_particle_cost ??
            null,
          planning_score:
            value.score,
          score:
            value.score,
          recommendation_score:
            scoreOrNull(
              item?.score
            ),
          score_basis:
            value.basis,
          days_ahead:
            dayDistance(
              todayDate,
              day.date
            )
        };
      }
    }
  }

  return best;
}

function futureParticleReserve({
  futureOpportunity,
  materiallyStronger,
  particles
}) {
  if (
    !materiallyStronger ||
    futureOpportunity?.battle_system !==
      "max" ||
    !futureOpportunity
      ?.max_particle_cost
  ) {
    return 0;
  }

  const daysAhead =
    Math.max(
      1,
      wholeNonNegative(
        futureOpportunity.days_ahead,
        1
      )
    );

  const replenishable =
    particles.daily_limit *
    daysAhead;

  const minimumNeededAfterToday =
    Math.max(
      0,
      Number(
        futureOpportunity
          .max_particle_cost
      ) - replenishable
    );

  return Math.min(
    particles
      .projected_spendable_today,
    minimumNeededAfterToday
  );
}

export function buildBattleResourcePlan({
  recommendations = [],
  remoteRaidPlan = {},
  resourceState = {},
  personalRemotePassCeiling = null,
  minScore =
    DEFAULT_PAID_BATTLE_MIN_SCORE,
  marginalValueDecay =
    DEFAULT_MARGINAL_VALUE_DECAY,
  maxParticleDailyLimit =
    STANDARD_MAX_PARTICLE_DAILY_LIMIT,
  maxParticleStorageLimit =
    STANDARD_MAX_PARTICLE_STORAGE_LIMIT,
  futureForecast = [],
  futureReserveScoreGap =
    DEFAULT_FUTURE_RESERVE_SCORE_GAP
} = {}) {
  const threshold =
    clamp(
      Number(minScore),
      0,
      100
    );

  const decay =
    Math.max(
      1,
      finiteNonNegative(
        marginalValueDecay,
        DEFAULT_MARGINAL_VALUE_DECAY
      )
    );

  const reserveGap =
    Math.max(
      0,
      finiteNonNegative(
        futureReserveScoreGap,
        DEFAULT_FUTURE_RESERVE_SCORE_GAP
      )
    );

  const state =
    normalizeBattleResourceState(
      resourceState
    );

  const particles =
    maxParticleAvailability({
      resourceState:
        state,
      dailyLimit:
        maxParticleDailyLimit,
      storageLimit:
        maxParticleStorageLimit
    });

  const raidLimitUsed =
    wholeNonNegative(
      remoteRaidPlan.raids_used
    );

  const remoteMaxPassesUsed =
    state.remote_max_passes_used;

  const sharedPassesUsed =
    raidLimitUsed +
    remoteMaxPassesUsed;

  const ceilingValue =
    personalRemotePassCeiling == null ||
    personalRemotePassCeiling === ""
      ? null
      : wholeNonNegative(
          personalRemotePassCeiling
        );

  const sharedAdditionalCapacity =
    ceilingValue == null
      ? Infinity
      : Math.max(
          0,
          ceilingValue -
          sharedPassesUsed
        );

  const officialRaidRemaining =
    remoteRaidPlan
      .official_is_unlimited
      ? Infinity
      : wholeNonNegative(
          remoteRaidPlan
            .official_remaining
        );

  const systemRaidBudget =
    wholeNonNegative(
      remoteRaidPlan
        .system_recommended_budget ??
      remoteRaidPlan
        .recommended_total
    );

  const recommendedRaidSlots =
    Math.min(
      officialRaidRemaining,
      Math.max(
        0,
        systemRaidBudget -
        raidLimitUsed
      )
    );

  const candidates = [];
  const blocked = [];

  for (const rec of recommendations) {
    const system =
      rec?.battle_system ||
      "raid";

    const planningValue =
      planningValueForRecommendation(
        rec
      );

    const blockedReason =
      recommendationBlockedReason(
        rec,
        planningValue.score,
        threshold
      );

    const cap =
      naturalAttemptCap(
        rec,
        planningValue.score,
        threshold,
        decay
      );

    if (
      blockedReason ||
      cap <= 0
    ) {
      blocked.push({
        pokemon_name:
          rec?.pokemon_name,
        battle_system:
          system,
        planning_score:
          planningValue.score,
        score_basis:
          planningValue.basis,
        reason:
          blockedReason ||
          "No worthwhile paid attempts remain above the threshold."
      });
      continue;
    }

    if (system === "raid") {
      if (!rec?.remote_eligible) {
        blocked.push({
          pokemon_name:
            rec?.pokemon_name,
          battle_system:
            system,
          planning_score:
            planningValue.score,
          score_basis:
            planningValue.basis,
          reason:
            "This Raid is not remotely eligible."
        });
        continue;
      }

      candidates.push({
        recommendation:
          rec,
        planning_value:
          planningValue,
        system,
        cap,
        allocated: 0,
        max_particle_cost:
          null,
        cost_basis:
          null
      });
      continue;
    }

    if (system === "max") {
      if (
        !maxBattleRemotePassEligible(
          rec
        )
      ) {
        blocked.push({
          pokemon_name:
            rec?.pokemon_name,
          battle_system:
            system,
          planning_score:
            planningValue.score,
          score_basis:
            planningValue.basis,
          reason:
            "This Max Battle is not confirmed as remotely accessible."
        });
        continue;
      }

      const cost =
        inferMaxParticleCost(
          rec
        );

      if (!cost.cost) {
        blocked.push({
          pokemon_name:
            rec?.pokemon_name,
          battle_system:
            system,
          planning_score:
            planningValue.score,
          score_basis:
            planningValue.basis,
          reason:
            "Max Particle cost is unknown, so the planner will not auto-allocate a Remote Pass."
        });
        continue;
      }

      candidates.push({
        recommendation:
          rec,
        planning_value:
          planningValue,
        system,
        cap,
        allocated: 0,
        max_particle_cost:
          cost.cost,
        cost_basis:
          cost.basis
      });
    }
  }

  const currentComparable =
    candidates
      .filter(candidate => {
        if (
          candidate.system === "raid"
        ) {
          return recommendedRaidSlots > 0;
        }

        return (
          candidate.max_particle_cost <=
          particles
            .projected_spendable_today
        );
      })
      .sort(
        (a, b) =>
          b.planning_value.score -
            a.planning_value.score ||
          String(
            a.recommendation
              ?.pokemon_name || ""
          ).localeCompare(
            String(
              b.recommendation
                ?.pokemon_name || ""
            )
          )
      );

  const currentBest =
    currentComparable[0] || null;

  const currentBestScore =
    currentBest
      ?.planning_value
      ?.score || 0;

  const bestFuture =
    bestForecastOpportunity(
      futureForecast,
      threshold
    );

  const futureScoreGap =
    bestFuture
      ? bestFuture.planning_score -
        currentBestScore
      : null;

  const materiallyStrongerFuture =
    Boolean(
      bestFuture &&
      futureScoreGap >= reserveGap
    );

  const reservedRemotePasses =
    materiallyStrongerFuture
      ? 1
      : 0;

  const reservedMaxParticles =
    futureParticleReserve({
      futureOpportunity:
        bestFuture,
      materiallyStronger:
        materiallyStrongerFuture,
      particles
    });

  let raidAllocated = 0;
  let maxParticlesRemaining =
    Math.max(
      0,
      particles
        .projected_spendable_today -
      reservedMaxParticles
    );
  let passesAllocated = 0;
  const allocationSequence = [];

  const naturalPassCap =
    candidates.reduce(
      (sum, candidate) =>
        sum + candidate.cap,
      0
    );

  const rawAllocationSlots =
    Number.isFinite(
      sharedAdditionalCapacity
    )
      ? Math.min(
          sharedAdditionalCapacity,
          naturalPassCap
        )
      : naturalPassCap;

  const allocationSlots =
    Math.max(
      0,
      rawAllocationSlots -
      Math.min(
        reservedRemotePasses,
        rawAllocationSlots
      )
    );

  for (
    let slot = 0;
    slot < allocationSlots;
    slot++
  ) {
    let best = null;

    for (const candidate of candidates) {
      if (
        candidate.allocated >=
        candidate.cap
      ) {
        continue;
      }

      if (
        candidate.system === "raid" &&
        raidAllocated >=
          recommendedRaidSlots
      ) {
        continue;
      }

      if (
        candidate.system === "max" &&
        maxParticlesRemaining <
          candidate.max_particle_cost
      ) {
        continue;
      }

      const marginalScore =
        Number(
          candidate
            .planning_value
            .score || 0
        ) -
        candidate.allocated *
          decay;

      if (
        marginalScore <
        threshold
      ) {
        continue;
      }

      const particleTieBreaker =
        candidate.max_particle_cost || 0;

      if (
        !best ||
        marginalScore >
          best.marginal_score ||
        (
          marginalScore ===
            best.marginal_score &&
          particleTieBreaker <
            best.particle_cost
        ) ||
        (
          marginalScore ===
            best.marginal_score &&
          particleTieBreaker ===
            best.particle_cost &&
          String(
            candidate.recommendation
              ?.pokemon_name || ""
          ).localeCompare(
            String(
              best.candidate
                .recommendation
                ?.pokemon_name || ""
            )
          ) < 0
        )
      ) {
        best = {
          candidate,
          marginal_score:
            marginalScore,
          particle_cost:
            particleTieBreaker
        };
      }
    }

    if (!best) break;

    best.candidate.allocated += 1;
    passesAllocated += 1;

    allocationSequence.push({
      step:
        allocationSequence.length + 1,
      action:
        "use",
      pokemon_name:
        best.candidate
          .recommendation
          .pokemon_name,
      battle_system:
        best.candidate.system,
      battle_variant:
        best.candidate
          .recommendation
          .battle_variant || null,
      planning_score:
        best.marginal_score,
      score_basis:
        best.candidate
          .planning_value
          .basis,
      max_particle_cost:
        best.candidate
          .max_particle_cost
    });

    if (
      best.candidate.system ===
      "raid"
    ) {
      raidAllocated += 1;
    } else {
      maxParticlesRemaining -=
        best.candidate
          .max_particle_cost;
    }
  }

  const allocations =
    candidates
      .filter(
        candidate =>
          candidate.allocated > 0
      )
      .map(candidate => ({
        pokemon_name:
          candidate.recommendation
            .pokemon_name,
        battle_system:
          candidate.system,
        battle_variant:
          candidate.recommendation
            .battle_variant || null,
        score:
          candidate
            .planning_value
            .score,
        planning_score:
          candidate
            .planning_value
            .score,
        recommendation_score:
          scoreOrNull(
            candidate
              .recommendation
              .score
          ),
        score_basis:
          candidate
            .planning_value
            .basis,
        max_performance_ranked:
          candidate
            .planning_value
            .max_performance_ranked,
        planning_note:
          candidate
            .planning_value
            .note,
        count:
          candidate.allocated,
        remote_passes:
          candidate.allocated,
        max_particle_cost_each:
          candidate.max_particle_cost,
        max_particles:
          candidate.max_particle_cost
            ? candidate.allocated *
              candidate.max_particle_cost
            : 0,
        max_particle_cost_source:
          candidate.cost_basis,
        sprite_url:
          candidate.recommendation
            .sprite_url ||
          candidate.recommendation
            .meta?.sprite_url ||
          null
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          b.planning_score -
            a.planning_score ||
          a.pokemon_name.localeCompare(
            b.pokemon_name
          )
      );

  const plannedParticleSpend =
    allocations.reduce(
      (sum, allocation) =>
        sum +
        allocation.max_particles,
      0
    );

  const projectedParticlesAfterPlan =
    Math.max(
      0,
      particles
        .projected_spendable_today -
      plannedParticleSpend
    );

  let projectedFutureParticles = null;

  if (
    bestFuture?.battle_system === "max"
  ) {
    const daysAhead =
      Math.max(
        1,
        wholeNonNegative(
          bestFuture.days_ahead,
          1
        )
      );

    projectedFutureParticles =
      Math.min(
        particles.storage_limit,
        projectedParticlesAfterPlan +
        particles.daily_limit *
          daysAhead
      );
  }

  const futureOpportunity =
    materiallyStrongerFuture
      ? bestFuture
      : null;

  const opportunityCost = {
    decision:
      materiallyStrongerFuture
        ? "reserve"
        : "use_current_value",
    current_best:
      currentBest
        ? {
            pokemon_name:
              currentBest
                .recommendation
                .pokemon_name,
            battle_system:
              currentBest.system,
            battle_variant:
              currentBest
                .recommendation
                .battle_variant || null,
            planning_score:
              currentBest
                .planning_value
                .score,
            score_basis:
              currentBest
                .planning_value
                .basis
          }
        : null,
    future_best:
      bestFuture,
    score_gap:
      futureScoreGap,
    reserve_threshold:
      reserveGap,
    remote_passes_reserved:
      reservedRemotePasses,
    max_particles_reserved:
      reservedMaxParticles,
    projected_future_max_particles:
      projectedFutureParticles
  };

  let advice;

  if (
    materiallyStrongerFuture &&
    !passesAllocated
  ) {
    const mpDetail =
      reservedMaxParticles > 0
        ? ` Keep at least ${reservedMaxParticles.toLocaleString()} MP unspent today so the future Max Battle remains reachable after normal daily collection.`
        : bestFuture.battle_system === "max"
          ? " You do not need to hold extra MP back today under the current collection limit; normal replenishment can cover the future Max cost."
          : "";

    advice = {
      code: "reserve",
      headline:
        `Save your next Remote Pass for ${bestFuture.pokemon_name}.`,
      detail:
        `${battleSystemLabel(bestFuture.battle_system)} ${bestFuture.pokemon_name} on ${bestFuture.label} has materially stronger planning value than today's best allocatable option.${mpDetail}`
    };
  } else if (!passesAllocated) {
    advice = {
      code: "save",
      headline:
        "Save your Remote Passes today.",
      detail:
        blocked.some(
          item =>
            item.battle_system ===
              "max" &&
            /cost is unknown/i.test(
              item.reason
            )
        )
          ? "No currently allocatable battle clears every resource rule; at least one Max opportunity has an unknown MP cost."
          : "No current paid battle clears your value threshold and resource constraints."
    };
  } else if (materiallyStrongerFuture) {
    const mpDetail =
      reservedMaxParticles > 0
        ? ` Keep ${reservedMaxParticles.toLocaleString()} MP in reserve as well.`
        : bestFuture.battle_system === "max"
          ? " Current MP replenishment is sufficient, so only the Remote Pass needs reserving."
          : "";

    advice = {
      code: "reserve",
      headline:
        `Use about ${passesAllocated} Remote Pass${passesAllocated === 1 ? "" : "es"} today; save 1 for ${bestFuture.pokemon_name}.`,
      detail:
        `${battleSystemLabel(bestFuture.battle_system)} ${bestFuture.pokemon_name} on ${bestFuture.label} has materially stronger planning value than today's best remaining use.${mpDetail}`
    };
  } else {
    advice = {
      code: "selective",
      headline:
        `Use about ${passesAllocated} Remote Pass${passesAllocated === 1 ? "" : "es"} across today's best opportunities.`,
      detail:
        plannedParticleSpend > 0
          ? `The shared plan assigns ${plannedParticleSpend.toLocaleString()} Max Particles to worthwhile Max Battles and leaves lower-value pass capacity unused.`
          : "The shared plan leaves lower-value pass capacity unused rather than spending to a ceiling."
    };
  }

  let nextRemotePass;

  if (allocationSequence.length) {
    nextRemotePass =
      allocationSequence[0];
  } else if (
    materiallyStrongerFuture
  ) {
    nextRemotePass = {
      action:
        "save",
      pokemon_name:
        bestFuture.pokemon_name,
      battle_system:
        bestFuture.battle_system,
      battle_variant:
        bestFuture.battle_variant,
      planning_score:
        bestFuture.planning_score,
      score_basis:
        bestFuture.score_basis,
      date:
        bestFuture.date,
      label:
        bestFuture.label
    };
  } else {
    nextRemotePass = {
      action:
        "save",
      pokemon_name:
        null,
      battle_system:
        null,
      battle_variant:
        null,
      planning_score:
        null,
      score_basis:
        null,
      date:
        null,
      label:
        null
    };
  }

  return {
    remote_passes: {
      ordinary_remote_raids_used:
        raidLimitUsed,
      remote_max_passes_used:
        remoteMaxPassesUsed,
      used_total:
        sharedPassesUsed,
      personal_daily_ceiling:
        ceilingValue,
      planning_capacity:
        Number.isFinite(
          sharedAdditionalCapacity
        )
          ? sharedAdditionalCapacity
          : null,
      recommended_additional:
        passesAllocated,
      reserved_for_future:
        reservedRemotePasses,
      projected_used_after_plan:
        sharedPassesUsed +
        passesAllocated,
      unused_personal_capacity:
        ceilingValue == null
          ? null
          : Math.max(
              0,
              ceilingValue -
              sharedPassesUsed -
              passesAllocated
            )
    },
    remote_raid_limit: {
      used:
        raidLimitUsed,
      remaining:
        Number.isFinite(
          officialRaidRemaining
        )
          ? officialRaidRemaining
          : null,
      recommended_additional_raids:
        raidAllocated,
      is_unlimited:
        Boolean(
          remoteRaidPlan
            .official_is_unlimited
        )
    },
    max_particles: {
      ...particles,
      planned_spend:
        plannedParticleSpend,
      reserved_for_future:
        reservedMaxParticles,
      projected_after_plan:
        projectedParticlesAfterPlan
    },
    min_score:
      threshold,
    marginal_value_decay:
      decay,
    future_reserve_score_gap:
      reserveGap,
    allocations,
    allocation_sequence:
      allocationSequence,
    next_remote_pass:
      nextRemotePass,
    not_allocated:
      blocked,
    future_opportunity:
      futureOpportunity,
    opportunity_cost:
      opportunityCost,
    advice
  };
}
