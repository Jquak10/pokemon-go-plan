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
    recommendation?.source_excerpt,
    recommendation?.event_other_lines
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

  const from = new Date(
    `${fromDate}T00:00:00Z`
  );

  const to = new Date(
    `${toDate}T00:00:00Z`
  );

  if (
    !Number.isFinite(
      from.getTime()
    ) ||
    !Number.isFinite(
      to.getTime()
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (to - from) /
        86400000
    )
  );
}

const MAX_TIER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6
});

function normalizedMaxTier(value) {
  const tier =
    Number(value);

  return (
    Number.isInteger(tier) &&
    tier >= 1 &&
    tier <= 6
  )
    ? tier
    : null;
}

export function maxBattleTierFromText(value) {
  const text =
    String(value || "")
      .replace(/[–—]/g, "-");

  const numericPatterns = [
    /\b(?:tier|difficulty)\s*[:#-]?\s*([1-6])\b/i,
    /\b([1-6])\s*(?:-?\s*star\b|★)/i
  ];

  for (const pattern of numericPatterns) {
    const match =
      text.match(pattern);

    const tier =
      normalizedMaxTier(
        match?.[1]
      );

    if (tier) {
      return tier;
    }
  }

  const wordPatterns = [
    /\b(?:tier|difficulty)\s*[:#-]?\s*(one|two|three|four|five|six)\b/i,
    /\b(one|two|three|four|five|six)\s*-?\s*star\b/i
  ];

  for (const pattern of wordPatterns) {
    const match =
      text.match(pattern);

    const tier =
      MAX_TIER_WORDS[
        String(
          match?.[1] || ""
        ).toLowerCase()
      ] || null;

    if (tier) {
      return tier;
    }
  }

  return null;
}

function explicitMaxParticleEntryCostFromText(
  value
) {
  const text =
    String(value || "");

  const patterns = [
    /X-POGO-MAX-PARTICLE-COST\s*:\s*(\d{2,5})/i,
    /\b(?:requires?|costs?|cost(?:s)?(?:\s+(?:of|is))?|entry\s+cost(?:\s+(?:of|is))?)\s*:?\s*(\d{2,5})\s*(?:Max\s*Particles?|MP)\b/i,
    /\b(\d{2,5})\s*(?:Max\s*Particles?|MP)\s+(?:to|for)\s+(?:enter|join|challenge|engage\s+in)\b/i,
    /\b(?:enter|join|challenge|engage\s+in)\b[^.]{0,80}?\b(\d{2,5})\s*(?:Max\s*Particles?|MP)\b/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    const cost =
      Number(
        match?.[1]
      );

    if (
      Number.isFinite(cost) &&
      cost > 0
    ) {
      return Math.floor(cost);
    }
  }

  return null;
}

function isOfficialCostEvidence(
  recommendation
) {
  return (
    recommendation
      ?.source_kind === "official" ||
    String(
      recommendation?.source_uid ||
      ""
    ).startsWith(
      "official-supplement:"
    ) ||
    recommendation
      ?.max_particle_cost_official ===
      true
  );
}

export function inferMaxParticleCost(recommendation) {
  if (
    recommendation?.battle_system !== "max"
  ) {
    return {
      cost: null,
      basis: null,
      confidence: null,
      tier: null,
      tier_source: null,
      evidence_source: null
    };
  }

  const structuredCost =
    Number(
      recommendation?.max_particle_cost
    );

  const structuredTier =
    normalizedMaxTier(
      recommendation?.max_battle_tier
    );

  if (
    Number.isFinite(
      structuredCost
    ) &&
    structuredCost > 0
  ) {
    return {
      cost:
        Math.floor(
          structuredCost
        ),
      basis:
        recommendation
          ?.max_particle_cost_source ||
        "structured_cost",
      confidence:
        recommendation
          ?.max_particle_cost_confidence ||
        "structured",
      tier:
        structuredTier,
      tier_source:
        recommendation
          ?.max_battle_tier_source ||
        null,
      evidence_source:
        recommendation
          ?.max_particle_cost_evidence_source ||
        recommendation?.source_kind ||
        "structured"
    };
  }

  const text =
    textForRecommendation(
      recommendation
    );

  const officialEvidence =
    isOfficialCostEvidence(
      recommendation
    );

  const parsedTier =
    structuredTier ||
    maxBattleTierFromText(
      text
    );

  if (officialEvidence) {
    const officialCost =
      explicitMaxParticleEntryCostFromText(
        text
      );

    if (officialCost) {
      return {
        cost:
          officialCost,
        basis:
          "official_explicit_cost",
        confidence:
          "official_explicit",
        tier:
          parsedTier,
        tier_source:
          parsedTier
            ? (
                structuredTier
                  ? recommendation
                      ?.max_battle_tier_source ||
                    "structured"
                  : "official_text"
              )
            : null,
        evidence_source:
          "official"
      };
    }
  }

  if (parsedTier) {
    const cost =
      MAX_PARTICLE_COST_BY_TIER[
        parsedTier
      ] || null;

    if (cost) {
      return {
        cost,
        basis:
          `standard_tier_${parsedTier}`,
        confidence:
          "verified_tier_standard_cost",
        tier:
          parsedTier,
        tier_source:
          structuredTier
            ? recommendation
                ?.max_battle_tier_source ||
              "structured"
            : officialEvidence
              ? "official_text"
              : (
                  recommendation
                    ?.source_kind ===
                    "derived"
                    ? "derived_event_text"
                    : "event_text"
                ),
        evidence_source:
          officialEvidence
            ? "official"
            : recommendation
                ?.source_kind ||
              "event"
      };
    }
  }

  return {
    cost: null,
    basis:
      "unknown",
    confidence:
      "unknown",
    tier:
      null,
    tier_source:
      null,
    evidence_source:
      null
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
 * Max opportunities deliberately use a separate method so a normal Raid
 * attacker ranking is never presented as Max Battle performance. Current
 * Max-specific profiles are used when available; otherwise the planner falls
 * back to the provisional general/personal value, rarity/availability, and
 * Max-capability signal from Part 6.
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
      recommendation
        ?.recommendation_score ??
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

export function priorityPresentationForScore(
  score,
  battleSystem = "raid"
) {
  const value =
    Math.round(
      scoreOrNull(score) ?? 0
    );

  if (value >= 85) {
    return {
      label:
        battleSystem === "max"
          ? "MUST BATTLE"
          : "MUST RAID",
      emoji:
        "🔥"
    };
  }

  if (value >= 70) {
    return {
      label:
        "HIGH PRIORITY",
      emoji:
        "⭐⭐⭐"
    };
  }

  if (value >= 50) {
    return {
      label:
        "RECOMMENDED",
      emoji:
        "⭐⭐"
    };
  }

  if (value >= 30) {
    return {
      label:
        "OPTIONAL",
      emoji:
        "⭐"
    };
  }

  return {
    label:
      "SKIP",
    emoji:
      "⛔"
  };
}

export function planningPriorityForRecommendation(
  recommendation
) {
  const value =
    planningValueForRecommendation(
      recommendation
    );

  const system =
    recommendation?.battle_system ||
    "raid";

  const presentation =
    priorityPresentationForScore(
      value.score,
      system
    );

  let rationale;

  if (system !== "max") {
    rationale =
      "Priority uses your personalized Raid value, including current meta inputs and target progress/priority.";
  } else if (
    value.max_performance_ranked
  ) {
    rationale =
      "Priority combines your personalized value, rarity/availability, Max capability, and current Max attacker utility.";
  } else {
    rationale =
      "Priority combines your personalized value, rarity/availability, and Max capability; current Max attacker utility is not available for this opportunity.";
  }

  return {
    ...value,
    ...presentation,
    rationale
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
    return `Planning priority score is below your ${minScore}-point paid-battle threshold.`;
  }

  return null;
}

function forecastIdentityKey(
  recommendation
) {
  const targetId =
    recommendation?.target?.id;

  if (targetId != null) {
    return `target:${targetId}`;
  }

  return [
    recommendation?.battle_system ||
      "raid",
    recommendation?.battle_variant ||
      "",
    String(
      recommendation?.pokemon_name ||
      ""
    )
      .trim()
      .toLocaleLowerCase()
  ].join("|");
}

function forecastRemoteBlockReason(
  recommendation
) {
  const system =
    recommendation?.battle_system ||
    "raid";

  if (
    system === "raid" &&
    !recommendation?.remote_eligible
  ) {
    return "This Raid is not remotely eligible.";
  }

  if (
    system === "max" &&
    !maxBattleRemotePassEligible(
      recommendation
    )
  ) {
    return "This Max Battle is not confirmed as remotely accessible.";
  }

  return null;
}

function simulateForecastParticles(
  days,
  resourceState
) {
  const state =
    normalizeBattleResourceState(
      resourceState
    );

  let held =
    state.max_particles_held;

  const output = [];
  let feasible = true;

  for (
    let index = 0;
    index < days.length;
    index++
  ) {
    const day =
      days[index];

    const dailyLimit =
      wholeNonNegative(
        day.max_particle_rule
          ?.daily_limit,
        STANDARD_MAX_PARTICLE_DAILY_LIMIT
      );

    const storageLimit =
      wholeNonNegative(
        day.max_particle_rule
          ?.storage_limit,
        STANDARD_MAX_PARTICLE_STORAGE_LIMIT
      );

    const alreadyCollected =
      index === 0
        ? state
            .max_particles_collected_today
        : 0;

    const collectionRemaining =
      Math.max(
        0,
        dailyLimit -
          alreadyCollected
      );

    const spendable =
      held +
      collectionRemaining;

    const plannedSpend =
      wholeNonNegative(
        day.max_particle_spend
      );

    if (
      plannedSpend >
      spendable
    ) {
      feasible = false;
    }

    const afterSpend =
      Math.max(
        0,
        spendable -
          plannedSpend
      );

    const projectedEnd =
      Math.min(
        storageLimit,
        afterSpend
      );

    output.push({
      held_start:
        held,
      collected_already:
        alreadyCollected,
      daily_limit:
        dailyLimit,
      storage_limit:
        storageLimit,
      collection_remaining:
        collectionRemaining,
      projected_spendable:
        spendable,
      planned_spend:
        plannedSpend,
      projected_end:
        projectedEnd
    });

    held =
      projectedEnd;
  }

  let cumulativeSpend = 0;
  let cumulativeCollection = 0;
  let requiredAfterToday = 0;

  for (
    let index = 1;
    index < output.length;
    index++
  ) {
    cumulativeSpend +=
      output[index]
        .planned_spend;

    cumulativeCollection +=
      output[index]
        .daily_limit;

    requiredAfterToday =
      Math.max(
        requiredAfterToday,
        cumulativeSpend -
          cumulativeCollection
      );

    output[index]
      .required_after_today =
      Math.max(
        0,
        requiredAfterToday
      );
  }

  if (output[0]) {
    output[0]
      .required_after_today = 0;
  }

  return {
    feasible,
    days:
      output
  };
}

/**
 * Build a shared seven-day-style forecast from already-normalized battle
 * opportunities. Every day competes for one Remote participation ceiling;
 * Max Battles additionally compete for Max Particles that replenish according
 * to that day's rule. Target attempt caps are shared across the horizon so the
 * same remaining progress is not budgeted independently on every day.
 */
export function buildBattleForecast({
  days = [],
  resourceState = {},
  minScore =
    DEFAULT_PAID_BATTLE_MIN_SCORE,
  marginalValueDecay =
    DEFAULT_MARGINAL_VALUE_DECAY
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

  const dayStates =
    (Array.isArray(days)
      ? days
      : [])
      .map(
        (input, index) => {
          const remoteUsed =
            wholeNonNegative(
              input.remote_used
            );

          const officialUnlimited =
            Boolean(
              input.official_rule
                ?.is_unlimited
            );

          const officialLimit =
            officialUnlimited
              ? null
              : wholeNonNegative(
                  input.official_rule
                    ?.limit
                );

          const officialRemaining =
            officialUnlimited
              ? Infinity
              : Math.max(
                  0,
                  officialLimit -
                    remoteUsed
                );

          const ceiling =
            input
              .personal_remote_pass_ceiling ==
              null ||
            input
              .personal_remote_pass_ceiling ===
              ""
              ? null
              : wholeNonNegative(
                  input
                    .personal_remote_pass_ceiling
                );

          const personalRemaining =
            ceiling == null
              ? Infinity
              : Math.max(
                  0,
                  ceiling -
                    remoteUsed
                );

          return {
            index,
            date:
              input.date || null,
            label:
              input.label ||
              input.date ||
              "Upcoming",
            recommendations:
              Array.isArray(
                input.recommendations
              )
                ? input.recommendations
                : [],
            official_rule:
              input.official_rule ||
              null,
            official_limit:
              officialLimit,
            official_is_unlimited:
              officialUnlimited,
            remote_used:
              remoteUsed,
            personal_remote_pass_ceiling:
              ceiling,
            remote_capacity:
              Math.min(
                officialRemaining,
                personalRemaining
              ),
            remote_allocated:
              0,
            raid_allocated:
              0,
            max_allocated:
              0,
            value_index:
              0,
            max_particle_rule:
              input.max_particle_rule ||
              {
                daily_limit:
                  STANDARD_MAX_PARTICLE_DAILY_LIMIT,
                storage_limit:
                  STANDARD_MAX_PARTICLE_STORAGE_LIMIT
              },
            max_particle_spend:
              0,
            allocations:
              new Map(),
            opportunities: [],
            completed_targets: [],
            skipped_targets: []
          };
        }
      );

  const groups =
    new Map();

  for (const day of dayStates) {
    for (
      const recommendation of
      day.recommendations
    ) {
      const system =
        recommendation
          ?.battle_system ||
        "raid";

      const planningValue =
        planningValueForRecommendation(
          recommendation
        );

      const target =
        recommendation?.target ||
        null;

      if (Number(target?.completed)) {
        day.completed_targets.push(
          recommendation.pokemon_name
        );
      }

      if (
        String(
          target?.priority || ""
        ).toLowerCase() ===
        "skip"
      ) {
        day.skipped_targets.push(
          recommendation.pokemon_name
        );
      }

      let blockedReason =
        recommendationBlockedReason(
          recommendation,
          planningValue.score,
          threshold
        );

      if (!blockedReason) {
        blockedReason =
          forecastRemoteBlockReason(
            recommendation
          );
      }

      let particleCost = {
        cost: null,
        basis: null,
        confidence: null
      };

      if (
        !blockedReason &&
        system === "max"
      ) {
        particleCost =
          inferMaxParticleCost(
            recommendation
          );

        if (!particleCost.cost) {
          blockedReason =
            "Max Particle cost is unknown.";
        }
      }

      const cap =
        naturalAttemptCap(
          recommendation,
          planningValue.score,
          threshold,
          decay
        );

      if (
        !blockedReason &&
        cap <= 0
      ) {
        blockedReason =
          "No worthwhile paid attempts remain above the threshold.";
      }

      const opportunity = {
        pokemon_name:
          recommendation
            ?.pokemon_name,
        battle_system:
          system,
        battle_variant:
          recommendation
            ?.battle_variant ||
          null,
        planning_score:
          planningValue.score,
        recommendation_score:
          scoreOrNull(
            recommendation
              ?.recommendation_score ??
            recommendation?.score
          ),
        score_basis:
          planningValue.basis,
        max_particle_cost:
          particleCost.cost,
        max_particle_cost_source:
          particleCost.basis,
        remote_eligible:
          !forecastRemoteBlockReason(
            recommendation
          ),
        eligible:
          !blockedReason,
        exclusion_reason:
          blockedReason,
        target_id:
          target?.id || null,
        sprite_url:
          recommendation
            ?.sprite_url ||
          recommendation
            ?.meta?.sprite_url ||
          null,
        source_type:
          recommendation
            ?.source_type ||
          null,
        source_label:
          recommendation
            ?.source_label ||
          null
      };

      day.opportunities.push(
        opportunity
      );

      if (blockedReason) {
        continue;
      }

      const key =
        forecastIdentityKey(
          recommendation
        );

      if (!groups.has(key)) {
        groups.set(
          key,
          {
            key,
            cap: 0,
            max_score: 0,
            entries: []
          }
        );
      }

      const group =
        groups.get(key);

      group.cap =
        Math.max(
          group.cap,
          cap
        );

      group.max_score =
        Math.max(
          group.max_score,
          planningValue.score
        );

      group.entries.push({
        day,
        recommendation,
        opportunity,
        planning_value:
          planningValue,
        particle_cost:
          particleCost.cost,
        particle_cost_source:
          particleCost.basis
      });
    }
  }

  const orderedGroups =
    [...groups.values()]
      .sort(
        (a, b) => {
          const aDays =
            new Set(
              a.entries.map(
                entry =>
                  entry.day.index
              )
            ).size;

          const bDays =
            new Set(
              b.entries.map(
                entry =>
                  entry.day.index
              )
            ).size;

          return (
            aDays - bDays ||
            b.max_score -
              a.max_score ||
            a.key.localeCompare(
              b.key
            )
          );
        }
      );

  const particleFeasible =
    () =>
      simulateForecastParticles(
        dayStates,
        resourceState
      ).feasible;

  for (const group of orderedGroups) {
    for (
      let attemptIndex = 0;
      attemptIndex < group.cap;
      attemptIndex++
    ) {
      const candidates =
        group.entries
          .map(entry => ({
            ...entry,
            marginal_score:
              entry
                .planning_value
                .score -
              attemptIndex *
                decay
          }))
          .filter(
            entry =>
              entry.marginal_score >=
                threshold &&
              entry.day
                .remote_allocated <
                entry.day
                  .remote_capacity
          )
          .sort(
            (a, b) =>
              b.marginal_score -
                a.marginal_score ||
              a.day
                .remote_allocated -
                b.day
                  .remote_allocated ||
              String(
                a.day.date || ""
              ).localeCompare(
                String(
                  b.day.date || ""
                )
              )
          );

      let selected = null;

      for (const candidate of candidates) {
        if (
          candidate
            .recommendation
            ?.battle_system !==
          "max"
        ) {
          selected =
            candidate;
          break;
        }

        candidate.day
          .max_particle_spend +=
          candidate.particle_cost;

        const feasible =
          particleFeasible();

        candidate.day
          .max_particle_spend -=
          candidate.particle_cost;

        if (feasible) {
          selected =
            candidate;
          break;
        }
      }

      if (!selected) {
        break;
      }

      const day =
        selected.day;

      day.remote_allocated += 1;
      day.value_index +=
        selected.marginal_score;

      if (
        selected
          .recommendation
          ?.battle_system ===
        "max"
      ) {
        day.max_allocated += 1;
        day.max_particle_spend +=
          selected.particle_cost;
      } else {
        day.raid_allocated += 1;
      }

      const allocationKey = [
        selected.recommendation
          ?.battle_system ||
          "raid",
        selected.recommendation
          ?.battle_variant ||
          "",
        selected.recommendation
          ?.pokemon_name ||
          ""
      ].join("|");

      const existing =
        day.allocations.get(
          allocationKey
        );

      if (existing) {
        existing.count += 1;
        existing.max_particles +=
          selected.particle_cost ||
          0;
        existing.planning_score =
          Math.max(
            existing.planning_score,
            selected.marginal_score
          );
      } else {
        day.allocations.set(
          allocationKey,
          {
            pokemon_name:
              selected
                .recommendation
                .pokemon_name,
            battle_system:
              selected
                .recommendation
                .battle_system ||
              "raid",
            battle_variant:
              selected
                .recommendation
                .battle_variant ||
              null,
            count: 1,
            planning_score:
              selected.marginal_score,
            recommendation_score:
              scoreOrNull(
                selected
                  .recommendation
                  ?.recommendation_score ??
                selected
                  .recommendation
                  ?.score
              ),
            score_basis:
              selected
                .planning_value
                .basis,
            max_particle_cost_each:
              selected
                .particle_cost,
            max_particles:
              selected
                .particle_cost ||
              0,
            max_particle_cost_source:
              selected
                .particle_cost_source,
            sprite_url:
              selected
                .recommendation
                .sprite_url ||
              selected
                .recommendation
                .meta?.sprite_url ||
              null
          }
        );
      }
    }
  }

  const particleProjection =
    simulateForecastParticles(
      dayStates,
      resourceState
    );

  const outputDays =
    dayStates.map(
      (day, index) => {
        const allocations =
          [...day.allocations.values()]
            .sort(
              (a, b) =>
                b.count -
                  a.count ||
                b.planning_score -
                  a.planning_score ||
                a.pokemon_name
                  .localeCompare(
                    b.pokemon_name
                  )
            );

        const allocatedByKey =
          new Map(
            allocations.map(
              item => [
                [
                  item.battle_system,
                  item.battle_variant ||
                    "",
                  item.pokemon_name
                ].join("|"),
                item.count
              ]
            )
          );

        const opportunities =
          day.opportunities
            .map(item => ({
              ...item,
              allocated_count:
                allocatedByKey.get(
                  [
                    item.battle_system,
                    item.battle_variant ||
                      "",
                    item.pokemon_name
                  ].join("|")
                ) || 0
            }))
            .sort(
              (a, b) =>
                b.planning_score -
                  a.planning_score ||
                String(
                  a.pokemon_name || ""
                ).localeCompare(
                  String(
                    b.pokemon_name || ""
                  )
                )
            );

        const reasons = [];

        if (
          day.completed_targets
            .length
        ) {
          reasons.push(
            `${[
              ...new Set(
                day
                  .completed_targets
              )
            ].join(", ")} already complete.`
          );
        }

        if (
          day.skipped_targets
            .length
        ) {
          reasons.push(
            `${[
              ...new Set(
                day
                  .skipped_targets
              )
            ].join(", ")} set to Skip.`
          );
        }

        const unknownCost =
          opportunities.some(
            item =>
              item.battle_system ===
                "max" &&
              /cost is unknown/i.test(
                item
                  .exclusion_reason ||
                ""
              )
          );

        if (unknownCost) {
          reasons.push(
            "At least one Max Battle has no verified MP entry cost, so it is not auto-budgeted."
          );
        }

        if (
          !day.remote_allocated
        ) {
          reasons.push(
            "No remotely accessible battle clears the shared value and resource rules for this day."
          );
        }

        const topScore =
          opportunities[0]
            ?.planning_score;

        const topRecommendations =
          topScore == null
            ? []
            : opportunities
                .filter(
                  item =>
                    item.planning_score ===
                    topScore
                )
                .map(item => ({
                  ...item,
                  score:
                    item.planning_score
                }));

        return {
          date:
            day.date,
          label:
            day.label,
          official_rule:
            day.official_rule,
          official_limit:
            day.official_limit,
          official_is_unlimited:
            day
              .official_is_unlimited,
          remote_used:
            day.remote_used,
          personal_remote_pass_ceiling:
            day
              .personal_remote_pass_ceiling,
          remote_capacity:
            Number.isFinite(
              day.remote_capacity
            )
              ? day.remote_capacity
              : null,
          recommended_budget:
            day.remote_allocated,
          recommended_raid_budget:
            day.raid_allocated,
          recommended_max_budget:
            day.max_allocated,
          value_index:
            Math.round(
              day.value_index
            ),
          allocations,
          opportunities,
          top_recommendations:
            topRecommendations,
          max_particles:
            particleProjection
              .days[index] ||
            null,
          completed_targets:
            [
              ...new Set(
                day
                  .completed_targets
              )
            ],
          skipped_targets:
            [
              ...new Set(
                day
                  .skipped_targets
              )
            ],
          reasons
        };
      }
    );

  const today =
    outputDays[0] ||
    null;

  const futureDays =
    outputDays.slice(1);

  const bestFutureDay =
    futureDays
      .filter(
        day =>
          day.recommended_budget >
          0
      )
      .sort(
        (a, b) =>
          b.value_index -
            a.value_index ||
          b.recommended_budget -
            a.recommended_budget ||
          String(
            a.date || ""
          ).localeCompare(
            String(
              b.date || ""
            )
          )
      )[0] || null;

  return {
    horizon_days:
      outputDays.length,
    today:
      today?.date || null,
    recommended_daily_budget:
      today
        ?.recommended_budget || 0,
    recommended_raid_budget:
      today
        ?.recommended_raid_budget ||
      0,
    recommended_max_budget:
      today
        ?.recommended_max_budget ||
      0,
    best_future_day:
      bestFutureDay,
    days:
      outputDays
  };
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
    const items =
      Array.isArray(
        day?.allocations
      ) &&
      day.allocations.length
        ? day.allocations
        : day
            ?.top_recommendations ||
          [];

    for (const item of items) {
      const hasCanonicalScore =
        Number.isFinite(
          Number(
            item?.planning_score
          )
        );

      const value =
        hasCanonicalScore
          ? {
              score:
                Number(
                  item.planning_score
                ),
              basis:
                item.score_basis ||
                null
            }
          : planningValueForRecommendation(
              item
            );

      if (value.score < threshold) {
        continue;
      }

      const particleCost =
        item?.battle_system ===
        "max"
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
            item.battle_variant ||
            null,
          max_particle_cost:
            item
              .max_particle_cost_each ??
            particleCost.cost ??
            item.max_particle_cost ??
            null,
          planning_score:
            value.score,
          score:
            value.score,
          recommendation_score:
            scoreOrNull(
              item
                ?.recommendation_score ??
              item?.score
            ),
          score_basis:
            value.basis,
          days_ahead:
            dayDistance(
              todayDate,
              day.date
            ),
          required_particles_after_today:
            day.max_particles
              ?.required_after_today ??
            null
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

  const forecastReserve =
    Number(
      futureOpportunity
        .required_particles_after_today
    );

  if (
    Number.isFinite(
      forecastReserve
    ) &&
    forecastReserve >= 0
  ) {
    return Math.min(
      particles
        .projected_spendable_today,
      forecastReserve
    );
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

  const sharedPassesUsed =
    wholeNonNegative(
      remoteRaidPlan.remote_limit_used ??
      remoteRaidPlan.raids_used
    );

  const remoteMaxPassesUsed =
    state.remote_max_passes_used;

  const ordinaryRemoteRaidsUsed =
    Math.max(
      0,
      sharedPassesUsed -
      remoteMaxPassesUsed
    );

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

  const forecastRaidSlots =
    Number(
      remoteRaidPlan
        .forecast_recommended_additional_raids
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
      Number.isFinite(
        forecastRaidSlots
      )
        ? Math.max(
            0,
            Math.floor(
              forecastRaidSlots
            )
          )
        : Math.max(
            0,
            systemRaidBudget -
              sharedPassesUsed
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
              .recommendation_score ??
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
        ordinaryRemoteRaidsUsed,
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
        sharedPassesUsed,
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
