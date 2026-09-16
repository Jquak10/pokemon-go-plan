export const RAID_RANK_METHOD_VERSION = "raid-rank-v2-crowned-form-moves";

const MAX_VARIANTS = 6;

const CROWNED_SIGNATURE_MOVE_BY_DEX = new Map([
  [888, "Behemoth Blade"],
  [889, "Behemoth Bash"]
]);

const CROWNED_SIGNATURE_MOVE_FALLBACKS = new Map([
  [
    "behemoth blade",
    {
      id: "BEHEMOTH_BLADE",
      names: { English: "Behemoth Blade" },
      type: {
        type: "POKEMON_TYPE_STEEL",
        names: { English: "Steel" }
      },
      power: 200,
      energy: -100,
      durationMs: 3500
    }
  ],
  [
    "behemoth bash",
    {
      id: "BEHEMOTH_BASH",
      names: { English: "Behemoth Bash" },
      type: {
        type: "POKEMON_TYPE_STEEL",
        names: { English: "Steel" }
      },
      power: 125,
      energy: -50,
      durationMs: 1500
    }
  ]
]);

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[♀♂]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function objectValues(value) {
  if (!value || typeof value !== "object") return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function englishName(pokemon) {
  return String(
    pokemon?.names?.English ||
      pokemon?.name?.English ||
      pokemon?.name ||
      pokemon?.id ||
      ""
  ).trim();
}

function typeName(typeObject) {
  return String(typeObject?.names?.English || typeObject?.type || "")
    .replace(/^POKEMON_TYPE_/i, "")
    .trim()
    .toLowerCase();
}

function pokemonTypes(pokemon) {
  return [
    typeName(pokemon?.primaryType),
    typeName(pokemon?.secondaryType)
  ].filter(Boolean);
}

function moveTypeName(move) {
  return typeName(move?.type);
}

function moveName(move) {
  return String(
    move?.names?.English ||
      move?.name ||
      move?.id ||
      ""
  ).trim();
}

function mergedMoves(...sources) {
  const map = new Map();

  for (const source of sources) {
    for (const move of objectValues(source)) {
      const key = String(
        move?.id || moveName(move) || JSON.stringify(move)
      );
      if (!map.has(key)) map.set(key, move);
    }
  }

  return [...map.values()];
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function fallbackFormName(baseName, formId) {
  const human = titleCase(
    String(formId || "")
      .replace(/_FORM$/i, "")
      .replace(/_/g, " ")
      .trim()
  );
  if (!human) return baseName;

  if (human.toLowerCase().startsWith(String(baseName).toLowerCase())) {
    const suffix = human.slice(String(baseName).length).trim();
    if (suffix) return `${baseName} (${suffix})`;
  }

  return human;
}

function formKind(displayName, formId, fallbackKind = "variant") {
  const text = normalize(`${displayName || ""} ${formId || ""}`);
  if (text.includes("shadow")) return "shadow";
  if (text.includes("primal")) return "primal";
  if (text.includes("mega")) return "mega";
  if (text.includes("crowned")) return "crowned";
  if (text.includes("origin")) return "origin";
  return fallbackKind;
}

function collectPokemonMoves(pokemon, moveIndex) {
  if (!pokemon || typeof pokemon !== "object") return;

  const moves = mergedMoves(
    pokemon.quickMoves,
    pokemon.eliteQuickMoves,
    pokemon.cinematicMoves,
    pokemon.eliteCinematicMoves
  );

  for (const move of moves) {
    const key = normalize(moveName(move));
    if (key && !moveIndex.has(key)) {
      moveIndex.set(key, move);
    }
  }

  for (const form of objectValues(pokemon.regionForms)) {
    collectPokemonMoves(form, moveIndex);
  }

  for (const form of objectValues(pokemon.megaEvolutions)) {
    collectPokemonMoves(form, moveIndex);
  }
}

function buildMoveIndex(pokedex) {
  const moveIndex = new Map();

  for (const pokemon of Array.isArray(pokedex) ? pokedex : []) {
    collectPokemonMoves(pokemon, moveIndex);
  }

  return moveIndex;
}

function crownedSignatureMoveName(form) {
  if (!form || form.kind !== "crowned") return null;
  return CROWNED_SIGNATURE_MOVE_BY_DEX.get(Number(form.dexNr)) || null;
}

function chargedMovesForForm(form, moveIndex) {
  const pokemon = form?.pokemon || null;
  const fallbackPokemon = form?.fallbackPokemon || null;

  let chargedMoves = mergedMoves(
    pokemon?.cinematicMoves,
    pokemon?.eliteCinematicMoves
  );

  if (!chargedMoves.length && fallbackPokemon) {
    chargedMoves = mergedMoves(
      fallbackPokemon?.cinematicMoves,
      fallbackPokemon?.eliteCinematicMoves
    );
  }

  const signatureName = crownedSignatureMoveName(form);
  if (!signatureName) return chargedMoves;

  // Zacian/Zamazenta Crowned forms are special transformation forms in GO:
  // Iron Head becomes the signature move while Crowned. The public Pokédex
  // payload can expose the form without that transformed move in its normal
  // charged-move list, so apply the transformation explicitly for PvE ranks.
  chargedMoves = chargedMoves.filter(
    (move) => normalize(moveName(move)) !== "iron head"
  );

  const signatureKey = normalize(signatureName);
  const signatureMove =
    moveIndex?.get(signatureKey) ||
    CROWNED_SIGNATURE_MOVE_FALLBACKS.get(signatureKey) ||
    null;

  if (signatureMove) {
    chargedMoves = mergedMoves(chargedMoves, [signatureMove]);
  }

  return chargedMoves;
}

function quickMovesForForm(form) {
  const pokemon = form?.pokemon || null;
  const fallbackPokemon = form?.fallbackPokemon || null;

  let quickMoves = mergedMoves(
    pokemon?.quickMoves,
    pokemon?.eliteQuickMoves
  );

  if (!quickMoves.length && fallbackPokemon) {
    quickMoves = mergedMoves(
      fallbackPokemon?.quickMoves,
      fallbackPokemon?.eliteQuickMoves
    );
  }

  return quickMoves;
}

function bestCycleForType(form, attackType, moveIndex) {
  const pokemon = form?.pokemon || null;
  const typeKey = normalize(attackType);
  if (!pokemon || !typeKey) return null;

  const types = new Set(pokemonTypes(pokemon));
  if (!types.has(typeKey)) return null;

  const quickMoves = quickMovesForForm(form);
  const chargedMoves = chargedMovesForForm(form, moveIndex);

  const typedChargedMoves = chargedMoves.filter(
    (move) => moveTypeName(move) === typeKey
  );

  if (!quickMoves.length || !typedChargedMoves.length) return null;

  let best = null;

  for (const fast of quickMoves) {
    const fastPower = Number(fast?.power || 0);
    const fastDuration = Math.max(
      Number(fast?.durationMs || 1000) / 1000,
      0.1
    );
    const fastEnergy = Math.max(Math.abs(Number(fast?.energy || 0)), 1);
    const fastStab = types.has(moveTypeName(fast)) ? 1.2 : 1.0;

    for (const charged of typedChargedMoves) {
      const chargePower = Number(charged?.power || 0);
      const chargeDuration = Math.max(
        Number(charged?.durationMs || 2000) / 1000,
        0.1
      );
      const chargeCost = Math.max(
        Math.abs(Number(charged?.energy || 50)),
        1
      );
      const fastCount = Math.max(1, Math.ceil(chargeCost / fastEnergy));
      const damage =
        fastCount * fastPower * fastStab + chargePower * 1.2;
      const seconds = fastCount * fastDuration + chargeDuration;
      if (seconds <= 0) continue;

      const cycleDps = damage / seconds;
      if (!best || cycleDps > best.cycle_dps) {
        best = {
          cycle_dps: cycleDps,
          fast_move: moveName(fast),
          charged_move: moveName(charged)
        };
      }
    }
  }

  return best;
}

function formSignature(form, moveIndex) {
  const pokemon = form.pokemon || {};
  const stats = pokemon.stats || {};
  const types = pokemonTypes(pokemon).slice().sort().join("/");
  const quickMoves = quickMovesForForm(form);
  const chargedMoves = chargedMovesForForm(form, moveIndex);

  const moveKey = [...quickMoves, ...chargedMoves]
    .map((move) => String(move?.id || moveName(move)))
    .sort()
    .join("|");

  return [
    Number(stats.attack || 0),
    Number(stats.defense || 0),
    Number(stats.stamina || 0),
    types,
    moveKey
  ].join("|");
}

function isComparable(form) {
  if (!form) return false;

  const text = normalize(`${form.displayName || ""} ${form.formId || ""}`);
  if (
    text.includes("purified") ||
    text.includes("dynamax") ||
    text.includes("gigantamax") ||
    text.includes("costume")
  ) {
    return false;
  }

  if (form.kind === "base") return true;

  if (form.kind === "mega" || form.kind === "primal") {
    return form.energyCost != null;
  }

  return Boolean(
    form.pokemon?.stats &&
      (objectValues(form.pokemon?.quickMoves).length ||
        objectValues(form.fallbackPokemon?.quickMoves).length) &&
      (objectValues(form.pokemon?.cinematicMoves).length ||
        objectValues(form.fallbackPokemon?.cinematicMoves).length)
  );
}

function canonicalizeZacianZamazentaForms(dexNr, baseName, forms) {
  if (dexNr !== 888 && dexNr !== 889) return forms;

  const baseKey = normalize(baseName);
  const hasNamedHero = forms.some((form) => {
    const text = normalize(`${form.displayName} ${form.formId}`);
    return text.includes("hero") && normalize(form.displayName) !== baseKey;
  });
  const hasNamedCrowned = forms.some(
    (form) => form.kind === "crowned" && normalize(form.displayName) !== baseKey
  );

  if (!hasNamedHero && !hasNamedCrowned) return forms;

  // The API can expose a generic species record alongside the explicit Hero
  // and Crowned battle forms. It is a data container, not a third usable form,
  // and showing it creates misleading entries such as plain "Zamazenta".
  return forms.filter(
    (form) => normalize(form.displayName) !== baseKey
  );
}

function buildFormGroups(pokedex, moveIndex) {
  const groups = [];

  for (const pokemon of Array.isArray(pokedex) ? pokedex : []) {
    const baseName = englishName(pokemon);
    const dexNr = Number(pokemon?.dexNr);
    if (!baseName || !Number.isFinite(dexNr)) continue;

    const forms = [];
    const signatures = new Set();

    const addForm = (formPokemon, options = {}) => {
      if (!formPokemon?.stats) return;

      const formId = String(
        formPokemon?.formId || formPokemon?.id || options.formId || ""
      );
      const displayName = String(
        options.displayName ||
          formPokemon?.names?.English ||
          formPokemon?.name?.English ||
          fallbackFormName(baseName, formId) ||
          baseName
      ).trim();
      const kind = formKind(
        displayName,
        formId,
        options.kind || "variant"
      );

      const form = {
        dexNr,
        baseName,
        displayName,
        formId,
        kind,
        pokemon: formPokemon,
        fallbackPokemon: options.fallbackPokemon || null,
        energyCost: options.energyCost ?? formPokemon?.energyCost ?? null
      };

      const signature = formSignature(form, moveIndex);
      if (signatures.has(signature)) return;
      signatures.add(signature);
      forms.push(form);
    };

    addForm(pokemon, {
      kind: "base",
      formId: pokemon?.formId || pokemon?.id || baseName
    });

    for (const [formKey, formPokemon] of Object.entries(
      pokemon?.regionForms || {}
    )) {
      addForm(formPokemon, {
        formId: formKey,
        fallbackPokemon: pokemon
      });
    }

    for (const [megaKey, megaPokemon] of Object.entries(
      pokemon?.megaEvolutions || {}
    )) {
      addForm(megaPokemon, {
        formId: megaKey,
        kind: /primal/i.test(megaKey) ? "primal" : "mega",
        fallbackPokemon: pokemon,
        energyCost: megaPokemon?.energyCost
      });
    }

    const canonicalForms = canonicalizeZacianZamazentaForms(
      dexNr,
      baseName,
      forms
    );

    if (canonicalForms.length) {
      groups.push({ dexNr, baseName, forms: canonicalForms });
    }
  }

  return groups;
}

function powerForType(form, attackType, shadow = false, moveIndex = null) {
  const cycle = bestCycleForType(form, attackType, moveIndex);
  if (!cycle) return null;

  const stats = form?.pokemon?.stats || {};
  let attack = Number(stats.attack || 0);
  let defense = Number(stats.defense || 0);
  const stamina = Number(stats.stamina || 0);
  if (!attack) return null;

  if (shadow) {
    attack *= 1.2;
    defense /= 1.2;
  }

  const bulk = Math.sqrt(
    Math.max(defense, 1) * Math.max(stamina, 1)
  );

  return {
    score: attack * cycle.cycle_dps * Math.pow(bulk, 0.15),
    fast_move: cycle.fast_move,
    charged_move: cycle.charged_move
  };
}

function typeLabel(value) {
  return titleCase(
    String(value || "")
      .replace(/^pokemon_type_/i, "")
      .replace(/_/g, " ")
  );
}

export function buildRaidAttackerRankCatalog(pokedex) {
  const moveIndex = buildMoveIndex(pokedex);
  const groups = buildFormGroups(pokedex, moveIndex);
  const pools = new Map();
  const allForms = [];

  for (const group of groups) {
    for (const form of group.forms) {
      allForms.push(form);
      if (form.kind === "shadow" || !isComparable(form)) continue;

      for (const attackType of pokemonTypes(form.pokemon)) {
        const result = powerForType(
          form,
          attackType,
          false,
          moveIndex
        );
        if (!result) continue;
        if (!pools.has(attackType)) pools.set(attackType, []);
        pools.get(attackType).push({ form, ...result });
      }
    }
  }

  for (const pool of pools.values()) {
    pool.sort(
      (a, b) =>
        b.score - a.score ||
        a.form.displayName.localeCompare(b.form.displayName)
    );
  }

  return { groups, allForms, pools, moveIndex };
}

function entriesForForm(form, catalog, shadow = false) {
  const entries = [];

  for (const attackType of pokemonTypes(form?.pokemon)) {
    const result = powerForType(
      form,
      attackType,
      shadow,
      catalog.moveIndex
    );
    if (!result) continue;

    const pool = catalog.pools.get(attackType) || [];
    const rank =
      1 + pool.filter((item) => item.score > result.score).length;

    entries.push({
      type: typeLabel(attackType),
      rank,
      fast_move: result.fast_move,
      charged_move: result.charged_move,
      score: Math.round(result.score * 100) / 100
    });
  }

  return entries
    .sort((a, b) => a.rank - b.rank || a.type.localeCompare(b.type))
    .slice(0, 2);
}

export function raidRankProfileForName(pokemonName, catalog) {
  const requested = normalize(pokemonName);
  if (!requested) return null;

  const shadowRequested = requested.startsWith("shadow ");
  const nonShadowRequested = shadowRequested
    ? requested.replace(/^shadow\s+/, "")
    : requested;

  let exactForm =
    catalog.allForms.find(
      (form) => normalize(form.displayName) === nonShadowRequested
    ) || null;

  if (!exactForm) {
    exactForm =
      catalog.allForms.find(
        (form) => normalize(form.baseName) === nonShadowRequested
      ) || null;
  }

  if (!exactForm) return null;

  const group = catalog.groups.find(
    (item) => item.dexNr === exactForm.dexNr
  );
  if (!group) return null;

  if (shadowRequested) {
    const rankings = entriesForForm(exactForm, catalog, true);
    if (!rankings.length) return null;

    return {
      method: RAID_RANK_METHOD_VERSION,
      pokemon_name: pokemonName,
      variants: [
        {
          name: `Shadow ${exactForm.displayName}`,
          kind: "shadow",
          current: true,
          rankings
        }
      ]
    };
  }

  const comparableForms = group.forms
    .filter(
      (form) =>
        form.kind !== "shadow" &&
        (form === exactForm || isComparable(form))
    )
    .map((form) => ({
      form,
      rankings: entriesForForm(form, catalog, false)
    }))
    .filter((item) => item.rankings.length);

  comparableForms.sort((a, b) => {
    if (a.form === exactForm) return -1;
    if (b.form === exactForm) return 1;

    const kindOrder = {
      primal: 0,
      mega: 1,
      crowned: 2,
      origin: 3,
      variant: 4,
      base: 5
    };

    return (
      (kindOrder[a.form.kind] ?? 9) -
        (kindOrder[b.form.kind] ?? 9) ||
      (a.rankings[0]?.rank ?? 9999) -
        (b.rankings[0]?.rank ?? 9999) ||
      a.form.displayName.localeCompare(b.form.displayName)
    );
  });

  const variants = comparableForms
    .slice(0, MAX_VARIANTS)
    .map((item) => ({
      name: item.form.displayName,
      kind: item.form.kind,
      current: item.form === exactForm,
      rankings: item.rankings
    }));

  if (!variants.length) return null;

  return {
    method: RAID_RANK_METHOD_VERSION,
    pokemon_name: pokemonName,
    variants
  };
}
