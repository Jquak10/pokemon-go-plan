// Pure Hundo CP/search helpers for the Planner.
// Catalog loading, recent selections, DOM rendering, and input events remain in manage.html.
(() => {
  const CP_MULTIPLIERS = Object.freeze({
    "1": 0.094,
    "2": 0.16639787,
    "3": 0.21573247,
    "4": 0.25572005,
    "5": 0.29024988,
    "6": 0.3210876,
    "7": 0.34921268,
    "8": 0.3752356,
    "9": 0.39956728,
    "10": 0.4225,
    "11": 0.44310755,
    "12": 0.4627984,
    "13": 0.48168495,
    "14": 0.49985844,
    "15": 0.51739395,
    "16": 0.5343543,
    "17": 0.5507927,
    "18": 0.5667545,
    "19": 0.5822789,
    "20": 0.5974,
    "21": 0.6121573,
    "22": 0.6265671,
    "23": 0.64065295,
    "24": 0.65443563,
    "25": 0.667934,
    "26": 0.6811649,
    "27": 0.69414365,
    "28": 0.7068842,
    "29": 0.7193991,
    "30": 0.7317,
    "31": 0.7377695,
    "32": 0.74378943,
    "33": 0.74976104,
    "34": 0.7556855,
    "35": 0.76156384,
    "36": 0.76739717,
    "37": 0.7731865,
    "38": 0.77893275,
    "39": 0.784637,
    "40": 0.7903,
    "41": 0.7953,
    "42": 0.8003,
    "43": 0.8053,
    "44": 0.8103,
    "45": 0.8153,
    "46": 0.8203,
    "47": 0.8253,
    "48": 0.8303,
    "49": 0.8353,
    "50": 0.8403
  });

  const BENCHMARKS = Object.freeze([
    Object.freeze({
      label: "Research",
      level: 15,
      note: "Lv 15"
    }),
    Object.freeze({
      label: "Raid / Egg",
      level: 20,
      note: "Lv 20"
    }),
    Object.freeze({
      label: "Weather-boosted raid",
      level: 25,
      note: "Lv 25"
    }),
    Object.freeze({
      label: "Wild max",
      level: 30,
      note: "Lv 30"
    }),
    Object.freeze({
      label: "Weather-boosted wild max",
      level: 35,
      note: "Lv 35"
    }),
    Object.freeze({
      label: "Level 40",
      level: 40,
      note: "Lv 40"
    }),
    Object.freeze({
      label: "Level 50",
      level: 50,
      note: "Lv 50"
    })
  ]);

  function cpMultiplierForLevel(
    level
  ) {
    const value =
      Number(level);

    if (
      !Number.isFinite(value) ||
      value < 1 ||
      value > 50 ||
      Math.round(value * 2) !==
        value * 2
    ) {
      return null;
    }

    if (
      Number.isInteger(
        value
      )
    ) {
      return (
        CP_MULTIPLIERS[
          String(value)
        ] || null
      );
    }

    const lower =
      Math.floor(value);

    const upper =
      Math.ceil(value);

    const lowerCpm =
      CP_MULTIPLIERS[
        String(lower)
      ];

    const upperCpm =
      CP_MULTIPLIERS[
        String(upper)
      ];

    if (
      !lowerCpm ||
      !upperCpm
    ) {
      return null;
    }

    // Pokémon GO half-level CPMs are the root-mean-square of the
    // adjacent whole-level CPMs, not their arithmetic mean.
    return Math.sqrt(
      (
        lowerCpm *
          lowerCpm +
        upperCpm *
          upperCpm
      ) / 2
    );
  }

  function hundoCp(
    entry,
    level
  ) {
    if (!entry) {
      return null;
    }

    const cpm =
      cpMultiplierForLevel(
        level
      );

    if (!cpm) {
      return null;
    }

    const attack =
      Number(entry.attack) +
      15;

    const defense =
      Number(entry.defense) +
      15;

    const stamina =
      Number(entry.stamina) +
      15;

    if (
      !Number.isFinite(
        attack
      ) ||
      !Number.isFinite(
        defense
      ) ||
      !Number.isFinite(
        stamina
      )
    ) {
      return null;
    }

    return Math.max(
      10,
      Math.floor(
        (
          attack *
          Math.sqrt(defense) *
          Math.sqrt(stamina) *
          cpm *
          cpm
        ) / 10
      )
    );
  }

  function searchMatches(
    catalog,
    query,
    limit = 12
  ) {
    if (
      !Array.isArray(catalog)
    ) {
      return [];
    }

    const raw =
      String(
        query || ""
      )
        .trim()
        .toLowerCase();

    if (!raw) {
      return [];
    }

    const numeric =
      raw.replace(
        /^#/,
        ""
      );

    return catalog
      .map(
        entry => {
          const name =
            String(
              entry.name || ""
            ).toLowerCase();

          let score = 99;

          if (
            /^\d+$/.test(
              numeric
            ) &&
            String(
              entry.dex_nr
            ) ===
              numeric
          ) {
            score = 0;
          } else if (
            name === raw
          ) {
            score = 1;
          } else if (
            name.startsWith(
              raw
            )
          ) {
            score = 2;
          } else if (
            name.includes(
              raw
            )
          ) {
            score = 3;
          }

          return {
            entry,
            score
          };
        }
      )
      .filter(
        item =>
          item.score < 99
      )
      .sort(
        (a, b) =>
          a.score -
            b.score ||
          Number(
            a.entry.dex_nr
          ) -
            Number(
              b.entry.dex_nr
            ) ||
          String(
            a.entry.name
          ).localeCompare(
            String(
              b.entry.name
            )
          )
      )
      .slice(
        0,
        Math.max(
          0,
          Number(limit) || 0
        )
      )
      .map(
        item =>
          item.entry
      );
  }

  function isTransformedRaidForm(
    entry
  ) {
    return [
      "mega",
      "primal"
    ].includes(
      String(
        entry?.kind || ""
      ).toLowerCase()
    );
  }

  function raidEncounterForSelection(
    entry,
    catalog
  ) {
    if (!entry) {
      return null;
    }

    if (
      !isTransformedRaidForm(
        entry
      )
    ) {
      return entry;
    }

    const dexNr =
      Number(
        entry.dex_nr
      );

    if (
      !Number.isFinite(
        dexNr
      ) ||
      !Array.isArray(
        catalog
      )
    ) {
      return null;
    }

    return (
      catalog.find(
        candidate =>
          Number(
            candidate?.dex_nr
          ) === dexNr &&
          String(
            candidate?.kind ||
            ""
          ).toLowerCase() ===
            "base"
      ) ||
      null
    );
  }

  function benchmarkData(
    entry,
    catalog = []
  ) {
    const transformed =
      isTransformedRaidForm(
        entry
      );

    const raidEncounter =
      transformed
        ? raidEncounterForSelection(
            entry,
            catalog
          )
        : entry;

    return BENCHMARKS.map(
      item => {
        if (!transformed) {
          return {
            ...item,
            cp:
              hundoCp(
                entry,
                item.level
              ),
            cp_subject_name:
              entry?.name || null,
            cp_subject_kind:
              "selected_form",
            theoretical:
              false,
            encounter_missing:
              false
          };
        }

        const isRaidCatchLevel =
          item.level === 20 ||
          item.level === 25;

        if (
          isRaidCatchLevel
        ) {
          return {
            ...item,
            label:
              item.level === 20
                ? "Raid encounter"
                : "Weather-boosted raid encounter",
            note:
              raidEncounter
                ? `${raidEncounter.name} · Lv ${item.level}`
                : `Encounter form unavailable · Lv ${item.level}`,
            cp:
              raidEncounter
                ? hundoCp(
                    raidEncounter,
                    item.level
                  )
                : null,
            cp_subject_name:
              raidEncounter?.name ||
              null,
            cp_subject_kind:
              "raid_encounter",
            theoretical:
              false,
            encounter_missing:
              !raidEncounter
          };
        }

        return {
          ...item,
          label:
            item.level <= 35
              ? "Selected form"
              : item.label,
          note:
            `Theoretical · Lv ${item.level}`,
          cp:
            hundoCp(
              entry,
              item.level
            ),
          cp_subject_name:
            entry?.name || null,
          cp_subject_kind:
            "selected_form",
          theoretical:
            true,
          encounter_missing:
            false
        };
      }
    );
  }

  globalThis.PlannerHundoLogic =
    Object.freeze({
      CP_MULTIPLIERS,
      BENCHMARKS,
      cpMultiplierForLevel,
      hundoCp,
      searchMatches,
      isTransformedRaidForm,
      raidEncounterForSelection,
      benchmarkData
    });
})();
