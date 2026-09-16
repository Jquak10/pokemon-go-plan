export const RAID_RANK_METHOD_VERSION = "raid-rank-v3-form-scope-dedupe";

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

const FIXED_SPECIES_NAME_BY_DEX = new Map([
  [888, "Zacian"],
  [889, "Zamazenta"]
]);

const REGIONAL_PATTERNS = [
  ["alola", ["alola", "alolan"]],
  ["galar", ["galar", "galarian"]],
  ["hisui", ["hisui", "hisuian"]],
  ["paldea", ["paldea", "paldean"]]
];

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

function regionalFamily(displayName, formId) {
  const text = normalize(`${displayName || ""} ${formId || ""}`);
  for (const [key, patterns] of REGIONAL_PATTERNS) {
    if (patterns.some((pattern) => text.includes(pattern))) {
      return key;
    }
  }
  return null;
}

function formKind(displayName, formId, fallbackKind = "variant") {
  const text = normalize(`${displayName || ""} ${formId || ""}`);
  if (text.includes("shadow")) return "shadow";
  if (text.includes("primal")) return "primal";
  if (text.includes("mega")) return "mega";
  if (text.includes("crowned")) return "crowned";
  if (text.includes("origin")) return "origin";
  if (regionalFamily(displayName, formId)) return "regional";
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

  // In Pokémon GO, Iron Head transforms into the Crowned signature move.
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

function speciesNameForDex(dexNr, candidate) {
  return FIXED_SPECIES_NAME_BY_DEX.get(Number(dexNr)) || candidate;
}

function shouldPreferSpeciesName(current, candidate) {
  if (!current) return true;
  const currentText = normalize(current);
  const candidateText = normalize(candidate);
  const noisy = (value) =>
    /\b(mega|primal|shadow|alola|alolan|galar|galarian|hisui|hisuian|paldea|paldean|crowned|origin|hero)\b/.test(
      value
    );

  if (noisy(currentText) && !noisy(candidateText)) return true;
  if (!noisy(currentText) && noisy(candidateText)) return false;
  return candidateText.length < currentText.length;
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

  // A plain Zacian/Zamazenta record in the API can be a data container rather
  // than a distinct usable battle form. Once explicit Hero/Crowned forms are
  // present, remove the generic container from both display and rank pools.
  return forms.filter(
    (form) => normalize(form.displayName) !== baseKey
  );
}

function buildFormGroups(pokedex, moveIndex) {
  const groupMap = new Map();

  const ensureGroup = (dexNr, candidateBaseName) => {
    let group = groupMap.get(dexNr);
    if (!group) {
      group = {
        dexNr,
        baseName: speciesNameForDex(dexNr, candidateBaseName),
        forms: [],
        identities: new Set()
      };
      groupMap.set(dexNr, group);
    } else if (
      !FIXED_SPECIES_NAME_BY_DEX.has(dexNr) &&
      shouldPreferSpeciesName(group.baseName, candidateBaseName)
    ) {
      group.baseName = candidateBaseName;
    }
    return group;
  };

  const addForm = (group, formPokemon, options = {}) => {
    if (!formPokemon?.stats) return;

    const formId = String(
      formPokemon?.formId || formPokemon?.id || options.formId || ""
    );
    const displayName = String(
      options.displayName ||
        formPokemon?.names?.English ||
        formPokemon?.name?.English ||
        fallbackFormName(group.baseName, formId) ||
        group.baseName
    ).trim();

    const kind = formKind(
      displayName,
      formId,
      options.kind || "variant"
    );

    const form = {
      dexNr: group.dexNr,
      baseName: group.baseName,
      displayName,
      formId,
      kind,
      region: regionalFamily(displayName, formId),
      pokemon: formPokemon,
      fallbackPokemon: options.fallbackPokemon || null,
      energyCost: options.energyCost ?? formPokemon?.energyCost ?? null
    };

    // De-duplicate repeated API representations of the same usable form
    // without collapsing legitimately different named forms.
    const identity = `${normalize(displayName)}|${formSignature(form, moveIndex)}`;
    if (group.identities.has(identity)) return;
    group.identities.add(identity);
    group.forms.push(form);
  };

  for (const pokemon of Array.isArray(pokedex) ? pokedex : []) {
    const candidateBaseName = englishName(pokemon);
    const dexNr = Number(pokemon?.dexNr);
    if (!candidateBaseName || !Number.isFinite(dexNr)) continue;

    const group = ensureGroup(dexNr, candidateBaseName);

    addForm(group, pokemon, {
      kind: "base",
      formId: pokemon?.formId || pokemon?.id || candidateBaseName
    });

    for (const [formKey, formPokemon] of Object.entries(
      pokemon?.regionForms || {}
    )) {
      addForm(group, formPokemon, {
        formId: formKey,
        fallbackPokemon: pokemon
      });
    }

    for (const [megaKey, megaPokemon] of Object.entries(
      pokemon?.megaEvolutions || {}
    )) {
      addForm(group, megaPokemon, {
        formId: megaKey,
        kind: /primal/i.test(megaKey) ? "primal" : "mega",
        fallbackPokemon: pokemon,
        energyCost: megaPokemon?.energyCost
      });
    }
  }

  const groups = [];
  for (const group of groupMap.values()) {
    group.forms = canonicalizeZacianZamazentaForms(
      group.dexNr,
      group.baseName,
      group.forms
    );
    group.identities = undefined;
    for (const form of group.forms) {
      form.baseName = group.baseName;
    }
    if (group.forms.length) groups.push(group);
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

function preferredFormForSpeciesRequest(group) {
  if (!group) return null;

  if (group.dexNr === 888 || group.dexNr === 889) {
    const hero = group.forms.find((form) =>
      normalize(`${form.displayName} ${form.formId}`).includes("hero")
    );
    if (hero) return hero;
  }

  return (
    group.forms.find((form) => form.kind === "base" && !form.region) ||
    group.forms.find((form) => !form.region) ||
    group.forms[0] ||
    null
  );
}

function exactFormForRequest(requested, catalog) {
  const direct =
    catalog.allForms.find(
      (form) => normalize(form.displayName) === requested
    ) || null;
  if (direct) return direct;

  const group =
    catalog.groups.find(
      (item) => normalize(item.baseName) === requested
    ) || null;

  return preferredFormForSpeciesRequest(group);
}

function sameDisplayScope(form, exactForm) {
  const exactRegion = exactForm?.region || null;
  const candidateRegion = form?.region || null;

  // Regional forms are opt-in: normal/Mega/Primal/etc. profiles never add
  // regional comparisons, and a regional raid only compares within that
  // same regional family.
  if (exactRegion) {
    return candidateRegion === exactRegion;
  }
  return !candidateRegion;
}

export function raidRankProfileForName(pokemonName, catalog) {
  const requested = normalize(pokemonName);
  if (!requested) return null;

  const shadowRequested = requested.startsWith("shadow ");
  const nonShadowRequested = shadowRequested
    ? requested.replace(/^shadow\s+/, "")
    : requested;

  const exactForm = exactFormForRequest(nonShadowRequested, catalog);
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
        sameDisplayScope(form, exactForm) &&
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
      regional: 5,
      base: 6
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
