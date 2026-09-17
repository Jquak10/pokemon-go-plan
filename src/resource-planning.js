export const STANDARD_MAX_PARTICLE_DAILY_LIMIT = 800;
export const STANDARD_MAX_PARTICLE_STORAGE_LIMIT = 1500;
export const DEFAULT_PAID_BATTLE_MIN_SCORE = 60;
export const DEFAULT_MARGINAL_VALUE_DECAY = 3;

export const MAX_PARTICLE_COST_BY_TIER = Object.freeze({
  1: 250,
  2: 400,
  3: 400,
  4: 800,
  5: 800,
  6: 800
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
      /\b(\d{2,4})\s*(?:Max\s*Particles?|MP)\b/i
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
    target.target_type === "raids"
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
  minScore,
  decay
) {
  const score =
    finiteNonNegative(
      recommendation?.score
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
      recommendation?.score || 0
    ) < minScore
  ) {
    return `Recommendation score is below your ${minScore}-point paid-battle threshold.`;
  }

  return null;
}

function futureOpportunityFromForecast(
  forecast,
  currentBestScore
) {
  const days =
    Array.isArray(forecast)
      ? forecast.slice(1)
      : [];

  let best = null;

  for (const day of days) {
    for (
      const item of
      day?.top_recommendations || []
    ) {
      const score =
        Number(
          item?.score || 0
        );

      if (
        !best ||
        score > best.score
      ) {
        best = {
          date:
            day.date || null,
          label:
            day.label || day.date || "Upcoming",
          pokemon_name:
            item.pokemon_name,
          battle_system:
            item.battle_system || "raid",
          battle_variant:
            item.battle_variant || null,
          max_particle_cost:
            item.max_particle_cost ?? null,
          score
        };
      }
    }
  }

  if (
    !best ||
    best.score <
      Number(currentBestScore || 0) + 8
  ) {
    return null;
  }

  return best;
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
  futureForecast = []
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

    const blockedReason =
      recommendationBlockedReason(
        rec,
        threshold
      );

    const cap =
      naturalAttemptCap(
        rec,
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
          reason:
            "This Raid is not remotely eligible."
        });
        continue;
      }

      candidates.push({
        recommendation:
          rec,
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
          reason:
            "Max Particle cost is unknown, so the planner will not auto-allocate a Remote Pass."
        });
        continue;
      }

      candidates.push({
        recommendation:
          rec,
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

  let raidAllocated = 0;
  let maxParticlesRemaining =
    particles.projected_spendable_today;
  let passesAllocated = 0;

  const naturalPassCap =
    candidates.reduce(
      (sum, candidate) =>
        sum + candidate.cap,
      0
    );

  const allocationSlots =
    Number.isFinite(
      sharedAdditionalCapacity
    )
      ? Math.min(
          sharedAdditionalCapacity,
          naturalPassCap
        )
      : naturalPassCap;

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
          candidate.recommendation
            ?.score || 0
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
          Number(
            candidate.recommendation
              .score || 0
          ),
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
          b.score - a.score ||
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

  const currentBestScore =
    recommendations.reduce(
      (best, rec) =>
        Math.max(
          best,
          Number(
            rec?.score || 0
          )
        ),
      0
    );

  const futureOpportunity =
    futureOpportunityFromForecast(
      futureForecast,
      currentBestScore
    );

  let advice;

  if (!passesAllocated) {
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
  } else if (futureOpportunity) {
    advice = {
      code: "reserve",
      headline:
        `Use about ${passesAllocated} Remote Pass${passesAllocated === 1 ? "" : "es"} across today's best opportunities.`,
      detail:
        `A stronger ${futureOpportunity.battle_system === "max" ? "Max Battle" : "Raid"} opportunity is currently visible on ${futureOpportunity.label}: ${futureOpportunity.pokemon_name}. Avoid spending beyond today's plan just to use capacity.`
    };
  } else {
    advice = {
      code: "selective",
      headline:
        `Use about ${passesAllocated} Remote Pass${passesAllocated === 1 ? "" : "es"} across today's best opportunities.`,
      detail:
        plannedParticleSpend > 0
          ? `The shared plan reserves ${plannedParticleSpend} Max Particles for Max Battles and leaves lower-value capacity unused.`
          : "The shared plan leaves lower-value pass capacity unused rather than spending to a ceiling."
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
      projected_after_plan:
        Math.max(
          0,
          particles
            .projected_spendable_today -
          plannedParticleSpend
        )
    },
    min_score:
      threshold,
    marginal_value_decay:
      decay,
    allocations,
    not_allocated:
      blocked,
    future_opportunity:
      futureOpportunity,
    advice
  };
}
