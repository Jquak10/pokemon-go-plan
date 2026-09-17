export const MAX_RANK_METHOD_VERSION = "max-rank-v1-fast-type-bulk";

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

function quickMoves(pokemon) {
  return [
    ...objectValues(pokemon?.quickMoves),
    ...objectValues(pokemon?.eliteQuickMoves)
  ];
}

function chargedMoves(pokemon) {
  return [
    ...objectValues(pokemon?.cinematicMoves),
    ...objectValues(pokemon?.eliteCinematicMoves)
  ];
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

  for (const pokemon of Array.isArray(pokedex) ? pokedex : []) {
    const baseName = englishName(pokemon);
    if (!baseName || !pokemon?.stats) continue;

    forms.push({
      name: baseName,
      pokemon,
      form_id: pokemon?.formId || pokemon?.id || null,
      form_kind: "base"
    });

    for (const [formId, region] of Object.entries(pokemon?.regionForms || {})) {
      if (!region?.stats) continue;
      forms.push({
        name:
          englishName(region) ||
          fallbackFormName(baseName, formId),
        pokemon: region,
        form_id: formId,
        form_kind: "regional"
      });
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

  const exact = new Set(values.map(normalize).filter(Boolean));
  return name => exact.has(normalize(name));
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
    const count = Math.max(1, Math.ceil(cost / Math.max(1, Number(fast?.energy || 1))));
    const fastSeconds = Math.max(0.1, Number(fast?.durationMs || 1000) / 1000);
    const chargedSeconds = Math.max(0.1, Number(charged?.durationMs || 2000) / 1000);
    const fastDamage = count * Math.max(0, Number(fast?.power || 0)) * (types.has(moveType(fast)) ? 1.2 : 1);
    const chargedDamage = Math.max(0, Number(charged?.power || 0)) * (types.has(moveType(charged)) ? 1.2 : 1);
    const dps = (fastDamage + chargedDamage) / (count * fastSeconds + chargedSeconds);

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

function rawMaxScore(pokemon, fast, cycle) {
  const stats = pokemon?.stats || {};
  const attack = Math.max(1, Number(stats.attack || 1));
  const defense = Math.max(1, Number(stats.defense || 1));
  const stamina = Math.max(1, Number(stats.stamina || 1));
  const bulk = Math.sqrt(defense * stamina);
  const maxPressure = attack * (1 + Math.min(0.35, cycle.fast_eps / 100));
  const standardPressure = attack * Math.max(1, cycle.dps) / 10;

  // Max Battles reward both damage and staying power: once the whole party
  // faints, the trainer cannot select a new party and rejoin mid-attempt.
  return (
    maxPressure * 0.38 +
    standardPressure * 0.27 +
    bulk * 0.35
  );
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

      output.push({
        pokemon_name: form.name,
        form_id: form.form_id,
        form_kind: form.form_kind,
        attack_type: attackType,
        max_attack_basis: "fast_attack_type",
        fast_move: moveName(fast),
        charged_move: cycle.charged_move,
        charged_type: cycle.charged_type,
        raw_score: rawMaxScore(form.pokemon, fast, cycle),
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
      const key = normalize(entry.pokemon_name);
      const existing = bestByPokemon.get(key);
      if (!existing || entry.raw_score > existing.raw_score) {
        bestByPokemon.set(key, entry);
      }
    }

    const sorted = [...bestByPokemon.values()]
      .sort((a, b) => b.raw_score - a.raw_score || a.pokemon_name.localeCompare(b.pokemon_name));
    const bestRaw = sorted[0]?.raw_score || 1;

    rankings[attackType] = sorted
      .slice(0, Math.max(1, Number(topN) || DEFAULT_TOP_N))
      .map((entry, index) => ({
        rank: index + 1,
        pokemon_name: entry.pokemon_name,
        form_id: entry.form_id,
        form_kind: entry.form_kind,
        score: Math.round((entry.raw_score / bestRaw) * 100),
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
    method: "Max Battle attacker ranking using Max-eligible forms only; Max Attack typing follows the selected Fast Attack for Dynamax candidates. Composite value weights attack pressure, normal-phase move cycle, and bulk. G-Max move power/type is not invented when the source data does not provide it.",
    eligibility_basis: "explicit_max_availability",
    rankings
  };
}

export function maxRankProfileForName(catalog, pokemonName) {
  const key = normalize(pokemonName);
  if (!key || !catalog?.rankings) return null;

  const by_type = {};
  let best = null;

  for (const [attackType, entries] of Object.entries(catalog.rankings)) {
    const entry = (entries || []).find(item => normalize(item.pokemon_name) === key);
    if (!entry) continue;
    by_type[attackType] = entry;
    if (!best || entry.score > best.score || (entry.score === best.score && entry.rank < best.rank)) {
      best = entry;
    }
  }

  if (!best) return null;

  return {
    method_version: catalog.method_version,
    method: catalog.method,
    eligibility_basis: catalog.eligibility_basis,
    best,
    by_type
  };
}
