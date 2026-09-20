// Pure Battle Plan/resource view-model helpers.
// Card DOM rendering, actions, modal state, and API mutations remain in manage.html.
(() => {
  function create({
    battleTargets,
    normalizeName,
    formatNumber
  }) {
    if (
      !battleTargets ||
      typeof battleTargets.key !== "function"
    ) {
      throw new Error(
        "PlannerBattlePlanLogic requires BattleTargets.key."
      );
    }

    if (
      typeof normalizeName !== "function" ||
      typeof formatNumber !== "function"
    ) {
      throw new Error(
        "PlannerBattlePlanLogic requires normalizeName and formatNumber helpers."
      );
    }

    function scoreTone(score) {
      const value =
        Number(
          score || 0
        );

      if (value >= 85) {
        return "tone-fire";
      }

      if (value >= 75) {
        return "tone-high";
      }

      if (value >= 60) {
        return "tone-good";
      }

      return "tone-low";
    }

    function zeroAllocationKey(
      item
    ) {
      return battleTargets.key({
        pokemon_name:
          item?.pokemon_name || "",
        battle_system:
          item?.battle_system || "raid",
        battle_variant:
          item?.battle_variant || null
      });
    }

    function mergeZeroAllocationItems({
      remoteRaidPlan = null,
      battleResourcePlan = null
    } = {}) {
      const byKey =
        new Map();

      for (
        const item of
        remoteRaidPlan
          ?.not_allocated ||
        []
      ) {
        const normalized = {
          ...item,
          battle_system:
            item?.battle_system ||
            "raid",
          battle_variant:
            item?.battle_variant ||
            null,
          reason:
            item?.reason ||
            item?.exclusion_reason ||
            "Marginal value fell below the allocation threshold."
        };

        byKey.set(
          zeroAllocationKey(
            normalized
          ),
          normalized
        );
      }

      for (
        const item of
        battleResourcePlan
          ?.not_allocated ||
        []
      ) {
        byKey.set(
          zeroAllocationKey(
            item
          ),
          item
        );
      }

      return [
        ...byKey.values()
      ];
    }

    function compactZeroAllocationReason(
      item
    ) {
      const code =
        String(
          item?.reason_code ||
          ""
        );

      const labels = {
        priority_skip:
          "Priority set to Skip",
        target_complete:
          "Target complete",
        below_threshold:
          "Below your paid-battle threshold",
        no_worthwhile_attempts:
          "No worthwhile paid attempts remain",
        remote_ineligible:
          "Not remotely eligible",
        remote_access_unconfirmed:
          "Remote access not confirmed",
        max_particle_cost_unknown:
          "MP cost unknown",
        remote_capacity_exhausted:
          "No Remote Pass capacity remains today",
        raid_plan_zero:
          "No additional Remote Raid uses planned today",
        max_plan_zero:
          "No additional Remote Max uses planned today",
        max_particles_reserved:
          "MP reserved for a stronger future opportunity",
        max_particles_insufficient:
          "Not enough spendable MP remains today",
        lower_marginal_value:
          "Higher-priority battles use today's worthwhile capacity"
      };

      if (
        code ===
          "future_reserve" &&
        item?.reason
      ) {
        return item.reason;
      }

      if (labels[code]) {
        return labels[code];
      }

      const reason =
        String(
          item?.reason ||
          item?.exclusion_reason ||
          ""
        ).trim();

      if (
        /max particle cost is unknown/i.test(
          reason
        )
      ) {
        return "MP cost unknown";
      }

      if (
        /priority is set to skip/i.test(
          reason
        )
      ) {
        return "Priority set to Skip";
      }

      if (
        /target is marked complete/i.test(
          reason
        )
      ) {
        return "Target complete";
      }

      if (
        /below.*threshold/i.test(
          reason
        )
      ) {
        return "Below your paid-battle threshold";
      }

      if (
        /not remotely eligible/i.test(
          reason
        )
      ) {
        return "Not remotely eligible";
      }

      if (
        /not confirmed as remotely accessible/i.test(
          reason
        )
      ) {
        return "Remote access not confirmed";
      }

      return (
        reason ||
        "No paid Remote use is planned for this opportunity today."
      );
    }

    function zeroAllocationSystemLabel(
      item
    ) {
      return item?.battle_system ===
        "max"
        ? "Max Battle"
        : "Raid";
    }

    function maxTierCostLabel(
      item
    ) {
      const tier =
        Number(
          item?.max_battle_tier ||
          0
        );

      const cost =
        Number(
          item?.max_particle_cost ??
          item?.max_particle_cost_each ??
          0
        );

      if (!cost) {
        return "MP cost unknown";
      }

      return tier
        ? `Tier ${formatNumber(tier)} · ${formatNumber(cost)} MP`
        : `${formatNumber(cost)} MP each`;
    }

    function recommendationCounts(
      recommendations = []
    ) {
      const list =
        Array.isArray(
          recommendations
        )
          ? recommendations
          : [];

      return {
        all:
          list.length,
        raid:
          list.filter(
            item =>
              (
                item?.battle_system ||
                "raid"
              ) ===
              "raid"
          ).length,
        max:
          list.filter(
            item =>
              item?.battle_system ===
              "max"
          ).length
      };
    }

    function filterRecommendations(
      recommendations = [],
      filter = "all"
    ) {
      const safeFilter =
        [
          "all",
          "raid",
          "max"
        ].includes(
          filter
        )
          ? filter
          : "all";

      return (
        Array.isArray(
          recommendations
        )
          ? recommendations
          : []
      ).filter(
        item =>
          safeFilter === "all" ||
          (
            item?.battle_system ||
            "raid"
          ) === safeFilter
      );
    }

    function visibleZeroAllocationItems({
      items = [],
      filter = "all"
    } = {}) {
      const safeFilter =
        [
          "all",
          "raid",
          "max"
        ].includes(
          filter
        )
          ? filter
          : "all";

      return (
        Array.isArray(items)
          ? items
          : []
      ).filter(
        item =>
          safeFilter === "all" ||
          (
            item?.battle_system ||
            "raid"
          ) === safeFilter
      );
    }

    function recommendationViewModel({
      recommendations = [],
      filter = "all",
      remoteRaidPlan = null,
      battleResourcePlan = null
    } = {}) {
      const visible =
        filterRecommendations(
          recommendations,
          filter
        );

      const legacyAllocationByName =
        new Map(
          (
            remoteRaidPlan
              ?.allocations ||
            []
          ).map(
            allocation => [
              normalizeName(
                allocation
                  .pokemon_name
              ),
              allocation
            ]
          )
        );

      const sharedAllocationByKey =
        new Map(
          (
            battleResourcePlan
              ?.allocations ||
            []
          ).map(
            allocation => [
              battleTargets.key(
                allocation
              ),
              allocation
            ]
          )
        );

      const zeroItems =
        mergeZeroAllocationItems({
          remoteRaidPlan,
          battleResourcePlan
        });

      const zeroAllocationByKey =
        new Map(
          zeroItems.map(
            item => [
              zeroAllocationKey(
                item
              ),
              item
            ]
          )
        );

      return {
        counts:
          recommendationCounts(
            recommendations
          ),
        visible,
        primary:
          visible.slice(
            0,
            4
          ),
        additional:
          visible.slice(
            4
          ),
        legacyAllocationByName,
        sharedAllocationByKey,
        zeroItems,
        zeroAllocationByKey
      };
    }

    return Object.freeze({
      scoreTone,
      zeroAllocationKey,
      mergeZeroAllocationItems,
      compactZeroAllocationReason,
      zeroAllocationSystemLabel,
      maxTierCostLabel,
      recommendationCounts,
      filterRecommendations,
      visibleZeroAllocationItems,
      recommendationViewModel
    });
  }

  globalThis.PlannerBattlePlanLogic =
    Object.freeze({
      create
    });
})();
