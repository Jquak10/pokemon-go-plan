export const MAX_RANK_METHOD_VERSION = "max-rank-v2-event-eligibility-bulk";

const DEFAULT_TOP_N = 6;

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[♀♂]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

export function canonicalMaxPokemonName(value) {
  return normalize(value)
    .replace(/^(?:dynamax|gigantamax|g max)\s+/, "")
    .replace(/\s+(?:dynamax|gigantamax|g max)$/, "")
    .trim();
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

function moveName(move) {
  return String(
    move?.names?.English ||
    move?.name ||
    move?.id ||
    ""
  ).trim();
}

function typeName(typeObject) {
  return String(
    typeObject?.names?.English ||
    typeObject?.type ||
    ""
  )
    .replace(/^POKEMON_TYPE_/i, "")
    .trim()
    .toLowerCase();
}

function moveType(move) {
  return typeName(move?.type);
}

function pokemonTypes(pokemon) {
  return [
    typeName(pokemon?.primaryType),
    typeName(pokemon?.secondaryType)
  ].filter(Boolean);
}

function mergedMoves(...sources) {
  const map = new Map();

  for (const source of sources) {
    for (const move of objectValues(source)) {
      const key = String(
        move?.id ||
        moveName(move) ||
        JSON.stringify(move)
      );
      if (!map.has(key)) map.set(key, move);
    }
  }

  return [...map.values()];
}

function quickMoves(pokemon) {
  return mergedMoves(
    pokemon?.quickMoves,
    pokemon?.eliteQuickMoves
  );
}

function chargedMoves(pokemon) {
  return mergedMoves(
    pokemon?.cinematicMoves,
    pokemon?.eliteCinematicMoves
  );
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase());
}

function fallbackFormName(baseName, formId) {
  const human = titleCase(
    String(formId || "")
      .replace(/_FORM$/i, "")
      .replace(/_/g, " ")
      .trim()
  );
  if (!human) return baseName;
  if (normalize(human).startsWith(normalize(baseName))) {
    const suffix = human.slice(String(baseName).length).trim();
    return suffix ? `${baseName} (${suffix})` : baseName;
  }
  return human;
}

function candidateForms(pokedex) {
  const forms = [];
  const seen = new Set();

  const push = (name, pokemon, formId, formKind) => {
    if (!name || !pokemon?.stats) return;
    const key = [
      canonicalMaxPokemonName(name),
      String(formId || ""),
      Number(pokemon?.stats?.attack || 0),
      Number(pokemon?.stats?.defense || 0),
      Number(pokemon?.stats?.stamina || 0)
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    forms.push({
      name,
      pokemon,
      form_id: formId || null,
      form_kind: formKind
    });
  };

  for (const pokemon of Array.isArray(pokedex) ? pokedex : []) {
    const baseName = englishName(pokemon);
    if (!baseName || !pokemon?.stats) continue;

    push(
      baseName,
      pokemon,
      pokemon?.formId || pokemon?.id || null,
      "base"
    );

    for (const [formId, region] of Object.entries(pokemon?.regionForms || {})) {
      push(
        englishName(region) || fallbackFormName(baseName, formId),
        region,
        formId,
        "regional"
      );
    }
  }

  return forms;
}

function eligibilityMatcher(maxEligibleNames) {
  const values =
    maxEligibleNames instanceof Set
      ? [...maxEligibleNames]
      : Array.isArray(maxEligibleNames)
        ? maxEligibleNames
        : [];

  const exact = new Set(
    values
      .map(canonicalMaxPokemonName)
      .filter(Boolean)
  );

  return name =>
    exact.has(
      canonicalMaxPokemonName(name)
    );
}

function fastMoveMetrics(move, pokemon) {
  const power = Math.max(0, Number(move?.power || 0));
  const energy = Math.max(0, Number(move?.energy || 0));
  const seconds = Math.max(0.1, Number(move?.durationMs || 1000) / 1000);
  const types = new Set(pokemonTypes(pokemon));
  const stab = types.has(moveType(move)) ? 1.2 : 1;

  return {
    dps: power * stab / seconds,
    eps: energy / seconds
  };
}

function bestStandardCycle(pokemon, fast) {
  const types = new Set(pokemonTypes(pokemon));
  const fastMetrics = fastMoveMetrics(fast, pokemon);
  let best = null;

  for (const charged of chargedMoves(pokemon)) {
    const cost = Math.max(1, Math.abs(Number(charged?.energy || 50)));
    const fastEnergy = Math.max(1, Number(fast?.energy || 1));
    const count = Math.max(1, Math.ceil(cost / fastEnergy));
    const fastSeconds = Math.max(0.1, Number(fast?.durationMs || 1000) / 1000);
    const chargedSeconds = Math.max(0.1, Number(charged?.durationMs || 2000) / 1000);
    const fastDamage =
      count *
      Math.max(0, Number(fast?.power || 0)) *
      (types.has(moveType(fast)) ? 1.2 : 1);
    const chargedDamage =
      Math.max(0, Number(charged?.power || 0)) *
      (types.has(moveType(charged)) ? 1.2 : 1);
    const dps =
      (fastDamage + chargedDamage) /
      (count * fastSeconds + chargedSeconds);

    if (!best || dps > best.dps) {
      best = {
        dps,
        fast_move: moveName(fast),
        charged_move: moveName(charged),
        charged_type: moveType(charged),
        fast_eps: fastMetrics.eps
      };
    }
  }

  return best || {
    dps: fastMetrics.dps,
    fast_move: moveName(fast),
    charged_move: null,
    charged_type: null,
    fast_eps: fastMetrics.eps
  };
}

function maxCombatMetrics(pokemon, cycle) {
  const stats = pokemon?.stats || {};
  const attack = Math.max(1, Number(stats.attack || 1));
  const defense = Math.max(1, Number(stats.defense || 1));
  const stamina = Math.max(1, Number(stats.stamina || 1));
  const bulk = Math.sqrt(defense * stamina);
  const maxPressure =
    attack *
    (1 + Math.min(0.35, cycle.fast_eps / 100));
  const standardPressure =
    attack *
    Math.max(1, cycle.dps) /
    10;

  return {
    raw_score:
      maxPressure * 0.38 +
      standardPressure * 0.27 +
      bulk * 0.35,
    max_pressure: maxPressure,
    standard_pressure: standardPressure,
    bulk
  };
}

export function maxAttackTypeForFastMove(move) {
  return moveType(move) || null;
}

export function maxAttackerCandidates(
  pokedex,
  { maxEligibleNames = [] } = {}
) {
  const isEligible = eligibilityMatcher(maxEligibleNames);
  const output = [];

  for (const form of candidateForms(pokedex)) {
    if (!isEligible(form.name)) continue;

    for (const fast of quickMoves(form.pokemon)) {
      const attackType = maxAttackTypeForFastMove(fast);
      if (!attackType) continue;
      const cycle = bestStandardCycle(form.pokemon, fast);
      const combat = maxCombatMetrics(form.pokemon, cycle);

      output.push({
        pokemon_name: form.name,
        form_id: form.form_id,
        form_kind: form.form_kind,
        attack_type: attackType,
        max_attack_basis: "fast_attack_type",
        fast_move: moveName(fast),
        charged_move: cycle.charged_move,
        charged_type: cycle.charged_type,
        raw_score: combat.raw_score,
        max_pressure: combat.max_pressure,
        standard_pressure: combat.standard_pressure,
        bulk: combat.bulk,
        attack: Number(form.pokemon?.stats?.attack || 0),
        defense: Number(form.pokemon?.stats?.defense || 0),
        stamina: Number(form.pokemon?.stats?.stamina || 0),
        standard_cycle_dps: cycle.dps,
        fast_energy_per_second: cycle.fast_eps,
        has_gigantamax_evolution: Boolean(form.pokemon?.hasGigantamaxEvolution)
      });
    }
  }

  return output;
}

export function buildMaxAttackerRankCatalog(
  pokedex,
  { maxEligibleNames = [], topN = DEFAULT_TOP_N } = {}
) {
  const candidates = maxAttackerCandidates(pokedex, { maxEligibleNames });
  const byType = new Map();
  const globalBestRaw = Math.max(
    1,
    ...candidates.map(candidate => candidate.raw_score)
  );

  for (const candidate of candidates) {
    if (!byType.has(candidate.attack_type)) {
      byType.set(candidate.attack_type, []);
    }
    byType.get(candidate.attack_type).push(candidate);
  }

  const rankings = {};

  for (const [attackType, entries] of byType.entries()) {
    const bestByPokemon = new Map();
    for (const entry of entries) {
      const key = canonicalMaxPokemonName(entry.pokemon_name);
      const existing = bestByPokemon.get(key);
      if (!existing || entry.raw_score > existing.raw_score) {
        bestByPokemon.set(key, entry);
      }
    }

    const sorted = [...bestByPokemon.values()]
      .sort((a, b) =>
        b.raw_score - a.raw_score ||
        a.pokemon_name.localeCompare(b.pokemon_name)
      );
    const bestRawForType = sorted[0]?.raw_score || 1;

    rankings[attackType] = sorted
      .slice(0, Math.max(1, Number(topN) || DEFAULT_TOP_N))
      .map((entry, index) => ({
        rank: index + 1,
        pokemon_name: entry.pokemon_name,
        form_id: entry.form_id,
        form_kind: entry.form_kind,
        score: Math.round((entry.raw_score / bestRawForType) * 100),
        utility_score: Math.round((entry.raw_score / globalBestRaw) * 100),
        fast_move: entry.fast_move,
        charged_move: entry.charged_move,
        charged_type: entry.charged_type,
        max_attack_type: attackType,
        max_attack_basis: entry.max_attack_basis,
        has_gigantamax_evolution: entry.has_gigantamax_evolution
      }));
  }

  return {
    method_version: MAX_RANK_METHOD_VERSION,
    method:
      "Max Battle attacker ranking using only Pokémon/forms with explicit Max Battle availability evidence. Dynamax Max Attack typing follows the selected Fast Attack. Composite value weights Max-phase attack pressure, normal-phase Fast/Charged pressure, and survivability. G-Max move type or power is not invented when the source data does not provide it.",
    eligibility_basis: "max_battle_event_history",
    eligible_pokemon_count:
      new Set(
        candidates.map(candidate =>
          canonicalMaxPokemonName(candidate.pokemon_name)
        )
      ).size,
    candidate_count: candidates.length,
    rankings
  };
}

export function maxRankProfileForName(catalog, pokemonName) {
  const key = canonicalMaxPokemonName(pokemonName);
  if (!key || !catalog?.rankings) return null;

  const by_type = {};
  let best = null;

  for (const [attackType, entries] of Object.entries(catalog.rankings)) {
    const entry = (entries || []).find(
      item =>
        canonicalMaxPokemonName(item.pokemon_name) === key
    );
    if (!entry) continue;
    by_type[attackType] = entry;
    if (
      !best ||
      Number(entry.utility_score || 0) > Number(best.utility_score || 0) ||
      (
        Number(entry.utility_score || 0) === Number(best.utility_score || 0) &&
        entry.rank < best.rank
      )
    ) {
      best = entry;
    }
  }

  if (!best) return null;

  return {
    method_version: catalog.method_version,
    method: catalog.method,
    eligibility_basis: catalog.eligibility_basis,
    utility_score: Number(best.utility_score || 0),
    coverage_types: Object.keys(by_type).sort(),
    best,
    by_type
  };
}
