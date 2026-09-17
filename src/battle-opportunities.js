export const BATTLE_SYSTEM = Object.freeze({
  RAID: "raid",
  MAX: "max"
});

export const BATTLE_VARIANT = Object.freeze({
  DYNAMAX: "dynamax",
  GIGANTAMAX: "gigantamax"
});

export const BATTLE_PLAN_FILTER = Object.freeze({
  ALL: "all",
  RAIDS: "raid",
  MAX_BATTLES: "max"
});

export const RAID_SOURCE_TYPES = new Set([
  "raid_battles",
  "raid_day",
  "raid_hour"
]);

export const MAX_BATTLE_SOURCE_TYPES = new Set([
  "max_battles",
  "max_mondays"
]);

export const BATTLE_SOURCE_TYPES = new Set([
  ...RAID_SOURCE_TYPES,
  ...MAX_BATTLE_SOURCE_TYPES
]);

// Source families where a Remote Raid Pass can be part of the entry cost.
// This is deliberately a capability flag, not a promise that every event in
// the family is remotely eligible. Event-specific/local-only rules belong in
// the availability layer and can override this later.
export const REMOTE_PASS_SOURCE_TYPES = new Set([
  ...RAID_SOURCE_TYPES,
  ...MAX_BATTLE_SOURCE_TYPES
]);

export function battleSystemForSourceType(sourceType) {
  const value = String(sourceType || "").trim();

  if (RAID_SOURCE_TYPES.has(value)) {
    return BATTLE_SYSTEM.RAID;
  }

  if (MAX_BATTLE_SOURCE_TYPES.has(value)) {
    return BATTLE_SYSTEM.MAX;
  }

  return null;
}

export function maxBattleVariantFromText(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  if (/\bgigantamax\b|\bg[\s-]?max\b/i.test(text)) {
    return BATTLE_VARIANT.GIGANTAMAX;
  }

  if (/\bdynamax\b/i.test(text)) {
    return BATTLE_VARIANT.DYNAMAX;
  }

  return null;
}

export function maxBattleVariantForEvent(event, pokemonName = null) {
  if (
    battleSystemForSourceType(event?.source_type) !==
    BATTLE_SYSTEM.MAX
  ) {
    return null;
  }

  // GO Calendar's standard Max Battle/Max Monday feeds do not always repeat
  // the word "Dynamax" in every event title. Gigantamax is the exceptional
  // form and is explicitly named when present; otherwise a Max-source battle
  // is a standard Dynamax battle.
  return (
    maxBattleVariantFromText(pokemonName) ||
    maxBattleVariantFromText(event?.summary) ||
    maxBattleVariantFromText(event?.description) ||
    BATTLE_VARIANT.DYNAMAX
  );
}

export function encounterNameForMaxPokemon(value) {
  let name = String(value || "").trim();
  if (!name) return null;

  name = name
    .replace(/^(?:gigantamax|dynamax)\s+/i, "")
    .replace(/\s+(?:gigantamax|dynamax)$/i, "")
    .replace(/\s*\((?:gigantamax|dynamax)\)\s*$/i, "")
    .trim();

  return name || null;
}

export function battleSystemLabel(system) {
  if (system === BATTLE_SYSTEM.RAID) return "Raid";
  if (system === BATTLE_SYSTEM.MAX) return "Max Battle";
  return "Battle";
}

export function battleVariantLabel(variant) {
  if (variant === BATTLE_VARIANT.DYNAMAX) return "Dynamax";
  if (variant === BATTLE_VARIANT.GIGANTAMAX) return "Gigantamax";
  return null;
}

export function battlePlanFilterMatches(filter, battleSystem) {
  const selected = String(filter || BATTLE_PLAN_FILTER.ALL).trim();

  if (selected === BATTLE_PLAN_FILTER.ALL) return true;
  if (selected === BATTLE_PLAN_FILTER.RAIDS) {
    return battleSystem === BATTLE_SYSTEM.RAID;
  }
  if (selected === BATTLE_PLAN_FILTER.MAX_BATTLES) {
    return battleSystem === BATTLE_SYSTEM.MAX;
  }

  return true;
}

export function battleSpritePolicy(metadata) {
  if (!metadata) {
    return {
      identity: null,
      requires_exact_form: false,
      badge: null
    };
  }

  if (
    metadata.battle_system === BATTLE_SYSTEM.MAX &&
    metadata.battle_variant === BATTLE_VARIANT.GIGANTAMAX
  ) {
    return {
      identity: metadata.boss_name || null,
      requires_exact_form: true,
      badge: "GMAX"
    };
  }

  if (
    metadata.battle_system === BATTLE_SYSTEM.MAX &&
    metadata.battle_variant === BATTLE_VARIANT.DYNAMAX
  ) {
    return {
      identity:
        metadata.encounter_name ||
        metadata.boss_name ||
        null,
      requires_exact_form: false,
      badge: "DYNAMAX"
    };
  }

  return {
    identity: metadata.boss_name || null,
    requires_exact_form: false,
    badge: null
  };
}

export function battleOpportunityPresentation(metadata) {
  if (!metadata) return null;

  return {
    system_label:
      battleSystemLabel(
        metadata.battle_system
      ),
    variant_label:
      battleVariantLabel(
        metadata.battle_variant
      ),
    filter_key:
      metadata.battle_system,
    sprite_policy:
      battleSpritePolicy(metadata)
  };
}

export function battleOpportunityMetadata(
  event,
  {
    pokemonName = null,
    encounterName = null,
    remoteEligible = null
  } = {}
) {
  const sourceType =
    String(event?.source_type || "").trim();

  const battleSystem =
    battleSystemForSourceType(sourceType);

  if (!battleSystem) return null;

  const bossName =
    String(pokemonName || "").trim() ||
    null;

  const battleVariant =
    battleSystem === BATTLE_SYSTEM.MAX
      ? maxBattleVariantForEvent(
          event,
          bossName
        )
      : null;

  const resolvedEncounterName =
    String(encounterName || "").trim() ||
    (
      battleSystem === BATTLE_SYSTEM.MAX
        ? encounterNameForMaxPokemon(
            bossName
          )
        : null
    );

  return {
    battle_system: battleSystem,
    battle_variant: battleVariant,
    boss_name: bossName,
    encounter_name: resolvedEncounterName,
    remote_pass_capable_by_source:
      REMOTE_PASS_SOURCE_TYPES.has(
        sourceType
      ),
    remote_eligible:
      remoteEligible == null
        ? null
        : Boolean(remoteEligible)
  };
}
