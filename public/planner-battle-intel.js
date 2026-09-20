// Pure type-effectiveness and Battle Intel helpers.
// Catalog/form resolution and HTML rendering remain in manage.html.
(() => {
  const TYPE_SYMBOLS = Object.freeze({
    Normal: "◯",
    Fire: "🔥",
    Water: "💧",
    Electric: "⚡",
    Grass: "🌿",
    Ice: "❄",
    Fighting: "✊",
    Poison: "☠",
    Ground: "⛰",
    Flying: "🪽",
    Psychic: "🔮",
    Bug: "🐛",
    Rock: "🪨",
    Ghost: "👻",
    Dragon: "🐉",
    Dark: "🌑",
    Steel: "⚙",
    Fairy: "✨"
  });

  const TYPE_RELATIONS = Object.freeze({
    Normal: { weak: ["Fighting"], resist: [], immune: ["Ghost"] },
    Fire: { weak: ["Water", "Ground", "Rock"], resist: ["Fire", "Grass", "Ice", "Bug", "Steel", "Fairy"], immune: [] },
    Water: { weak: ["Electric", "Grass"], resist: ["Fire", "Water", "Ice", "Steel"], immune: [] },
    Electric: { weak: ["Ground"], resist: ["Electric", "Flying", "Steel"], immune: [] },
    Grass: { weak: ["Fire", "Ice", "Poison", "Flying", "Bug"], resist: ["Water", "Electric", "Grass", "Ground"], immune: [] },
    Ice: { weak: ["Fire", "Fighting", "Rock", "Steel"], resist: ["Ice"], immune: [] },
    Fighting: { weak: ["Flying", "Psychic", "Fairy"], resist: ["Bug", "Rock", "Dark"], immune: [] },
    Poison: { weak: ["Ground", "Psychic"], resist: ["Grass", "Fighting", "Poison", "Bug", "Fairy"], immune: [] },
    Ground: { weak: ["Water", "Grass", "Ice"], resist: ["Poison", "Rock"], immune: ["Electric"] },
    Flying: { weak: ["Electric", "Ice", "Rock"], resist: ["Grass", "Fighting", "Bug"], immune: ["Ground"] },
    Psychic: { weak: ["Bug", "Ghost", "Dark"], resist: ["Fighting", "Psychic"], immune: [] },
    Bug: { weak: ["Fire", "Flying", "Rock"], resist: ["Grass", "Fighting", "Ground"], immune: [] },
    Rock: { weak: ["Water", "Grass", "Fighting", "Ground", "Steel"], resist: ["Normal", "Fire", "Poison", "Flying"], immune: [] },
    Ghost: { weak: ["Ghost", "Dark"], resist: ["Poison", "Bug"], immune: ["Normal", "Fighting"] },
    Dragon: { weak: ["Ice", "Dragon", "Fairy"], resist: ["Fire", "Water", "Electric", "Grass"], immune: [] },
    Dark: { weak: ["Fighting", "Bug", "Fairy"], resist: ["Ghost", "Dark"], immune: ["Psychic"] },
    Steel: { weak: ["Fire", "Fighting", "Ground"], resist: ["Normal", "Grass", "Ice", "Flying", "Psychic", "Bug", "Rock", "Dragon", "Steel", "Fairy"], immune: ["Poison"] },
    Fairy: { weak: ["Poison", "Steel"], resist: ["Fighting", "Bug", "Dark"], immune: ["Dragon"] }
  });

  function defendingTypeMultipliers(types) {
    return Object.keys(TYPE_SYMBOLS).map(
      attackType => {
        let multiplier = 1;

        for (const defendingType of types || []) {
          const relation =
            TYPE_RELATIONS[defendingType];

          if (!relation) continue;

          if (relation.weak.includes(attackType)) {
            multiplier *= 1.6;
          }

          if (relation.resist.includes(attackType)) {
            multiplier *= 0.625;
          }

          if (relation.immune.includes(attackType)) {
            multiplier *= 0.390625;
          }
        }

        return {
          type: attackType,
          multiplier
        };
      }
    );
  }

  function matchupGroups(types) {
    const matchups =
      defendingTypeMultipliers(types);

    return {
      extraWeak:
        matchups
          .filter(item => item.multiplier >= 2.5)
          .sort((a, b) => b.multiplier - a.multiplier),
      weak:
        matchups
          .filter(item => item.multiplier > 1.01 && item.multiplier < 2.5)
          .sort((a, b) => b.multiplier - a.multiplier),
      resist:
        matchups
          .filter(item => item.multiplier < 0.99)
          .sort((a, b) => a.multiplier - b.multiplier)
    };
  }

  function buildBattleIntel({
    boss,
    encounter = null,
    hundoCp = null
  } = {}) {
    if (!boss) {
      return null;
    }

    const resolvedEncounter =
      encounter || boss;

    const groups =
      matchupGroups(
        boss.types
      );

    return {
      boss,
      encounter:
        resolvedEncounter,
      ...groups,
      normalCp:
        typeof hundoCp === "function"
          ? hundoCp(
              resolvedEncounter,
              20
            )
          : null,
      boostedCp:
        typeof hundoCp === "function"
          ? hundoCp(
              resolvedEncounter,
              25
            )
          : null
    };
  }

  globalThis.PlannerBattleIntel =
    Object.freeze({
      TYPE_SYMBOLS,
      TYPE_RELATIONS,
      defendingTypeMultipliers,
      matchupGroups,
      buildBattleIntel
    });
})();
