// Pure Target-list logic for the Planner.
// Rendering, DOM state, selection UI, and API mutations remain in manage.html.
(() => {
  function create({
    battleTargets,
    normalizeName,
    formatNumber
  }) {
    if (
      !battleTargets ||
      typeof battleTargets.kind !== "function" ||
      typeof battleTargets.matches !== "function"
    ) {
      throw new Error(
        "PlannerTargetLogic requires BattleTargets helpers."
      );
    }

    if (
      typeof normalizeName !== "function" ||
      typeof formatNumber !== "function"
    ) {
      throw new Error(
        "PlannerTargetLogic requires normalizeName and formatNumber helpers."
      );
    }

    function progress(target) {
      const current =
        Number(
          target?.current_value || 0
        );

      const desired =
        Number(
          target?.target_value
        );

      if (
        !Number.isFinite(
          desired
        ) ||
        desired <= 0
      ) {
        return {
          percent: 0,
          label:
            `${formatNumber(current)} tracked`,
          known: false
        };
      }

      const percent =
        Math.max(
          0,
          Math.min(
            100,
            (
              current /
              desired
            ) * 100
          )
        );

      return {
        percent,
        label:
          `${formatNumber(current)} / ${formatNumber(desired)}`,
        known: true
      };
    }

    function availability(
      target,
      targetOptions = {}
    ) {
      const current =
        targetOptions.current ||
        [];

      if (
        current.some(
          item =>
            battleTargets.matches(
              target,
              item
            )
        )
      ) {
        return "now";
      }

      const upcoming =
        targetOptions.upcoming ||
        [];

      if (
        upcoming.some(
          item =>
            battleTargets.matches(
              target,
              item
            )
        )
      ) {
        return "upcoming";
      }

      return "not_raiding";
    }

    function priorityRank(
      priority
    ) {
      return {
        high: 0,
        medium: 1,
        low: 2,
        skip: 3
      }[
        String(
          priority ||
          "medium"
        )
      ] ?? 4;
    }

    function matchingNonStatusFilters({
      targets = [],
      filterState,
      targetOptions = {}
    }) {
      const search =
        normalizeName(
          filterState.search
        );

      return targets.filter(
        target => {
          if (
            search &&
            !normalizeName(
              target.pokemon_name
            ).includes(
              search
            )
          ) {
            return false;
          }

          if (
            filterState.battle !==
              "all" &&
            battleTargets.kind(
              target
            ) !==
              filterState.battle
          ) {
            return false;
          }

          if (
            filterState.type !==
              "all" &&
            String(
              target.target_type
            ) !==
              filterState.type
          ) {
            return false;
          }

          if (
            filterState.priority !==
              "all" &&
            String(
              target.priority
            ) !==
              filterState.priority
          ) {
            return false;
          }

          if (
            filterState.availability !==
              "all" &&
            availability(
              target,
              targetOptions
            ) !==
              filterState.availability
          ) {
            return false;
          }

          return true;
        }
      );
    }

    function sortTargets({
      targets = [],
      filterState,
      targetOptions = {}
    }) {
      return [
        ...targets
      ].sort(
        (a, b) => {
          if (
            filterState.sort ===
              "name"
          ) {
            return String(
              a.pokemon_name
            ).localeCompare(
              String(
                b.pokemon_name
              )
            );
          }

          if (
            filterState.sort ===
              "updated"
          ) {
            return String(
              b.updated_at || ""
            ).localeCompare(
              String(
                a.updated_at || ""
              )
            );
          }

          if (
            filterState.sort ===
              "closest"
          ) {
            return (
              progress(b).percent -
              progress(a).percent
            );
          }

          return (
            Number(
              a.completed
            ) -
              Number(
                b.completed
              ) ||
            priorityRank(
              a.priority
            ) -
              priorityRank(
                b.priority
              ) ||
            (
              availability(
                a,
                targetOptions
              ) === "now"
                ? -1
                : 0
            ) -
            (
              availability(
                b,
                targetOptions
              ) === "now"
                ? -1
                : 0
            ) ||
            String(
              a.pokemon_name
            ).localeCompare(
              String(
                b.pokemon_name
              )
            )
          );
        }
      );
    }

    function filteredTargets({
      matchingTargets = [],
      filterState,
      targetOptions = {}
    }) {
      const statusFiltered =
        matchingTargets.filter(
          target => {
            const completed =
              Number(
                target.completed
              );

            if (
              filterState.status ===
                "active"
            ) {
              return !completed;
            }

            if (
              filterState.status ===
                "completed"
            ) {
              return Boolean(
                completed
              );
            }

            return true;
          }
        );

      return sortTargets({
        targets:
          statusFiltered,
        filterState,
        targetOptions
      });
    }

    function counts(
      matchingTargets = []
    ) {
      const active =
        matchingTargets.filter(
          target =>
            !Number(
              target.completed
            )
        ).length;

      const completed =
        matchingTargets.filter(
          target =>
            Number(
              target.completed
            )
        ).length;

      return {
        active,
        completed,
        all:
          matchingTargets.length
      };
    }

    function groups({
      targets = [],
      targetOptions = {}
    }) {
      const active =
        targets.filter(
          target =>
            !Number(
              target.completed
            )
        );

      const needsAttention =
        active.filter(
          target =>
            target.priority ===
              "high" ||
            availability(
              target,
              targetOptions
            ) ===
              "now"
        );

      const attentionIds =
        new Set(
          needsAttention.map(
            target =>
              String(
                target.id
              )
          )
        );

      return {
        needsAttention,
        tracking:
          active.filter(
            target =>
              !attentionIds.has(
                String(
                  target.id
                )
              )
          ),
        completed:
          targets.filter(
            target =>
              Number(
                target.completed
              )
          )
      };
    }

    function viewModel({
      targets = [],
      filterState,
      targetOptions = {}
    }) {
      const matchingTargets =
        matchingNonStatusFilters({
          targets,
          filterState,
          targetOptions
        });

      const matchingCounts =
        counts(
          matchingTargets
        );

      const visibleTargets =
        filteredTargets({
          matchingTargets,
          filterState,
          targetOptions
        });

      return {
        matchingTargets,
        counts:
          matchingCounts,
        visibleTargets,
        groups:
          groups({
            targets:
              visibleTargets,
            targetOptions
          })
      };
    }

    return Object.freeze({
      progress,
      availability,
      priorityRank,
      matchingNonStatusFilters,
      sortTargets,
      filteredTargets,
      counts,
      groups,
      viewModel
    });
  }

  globalThis.PlannerTargetLogic =
    Object.freeze({
      create
    });
})();
