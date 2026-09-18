import { targetBattleKind, targetBattleMetadata, targetBattleKey, matchingBattleTargets, canonicalTargetName, namedTargetKind } from "./battle-targets.js";
import { BattleLogError, normalizeBattleLog, createBattleLog, undoBattleLog, battleStorageError } from "./battle-logging.js";
import {
  RAID_RANK_METHOD_VERSION,
  buildRaidAttackerRankCatalog,
  raidRankProfileForName
} from "./raid-rankings.js";
import {
  MAX_RANK_METHOD_VERSION,
  buildMaxAttackerRankCatalog,
  canonicalMaxPokemonName,
  maxRankProfileForName
} from "./max-rankings.js";
import {
  BATTLE_SOURCE_TYPES,
  MAX_BATTLE_SOURCE_TYPES,
  MAX_ROTATION_SOURCE_TYPE,
  battleOpportunityMetadata,
  battleOpportunityPresentation,
  maxBattleVariantFromText,
  maxBattleVariantForEvent,
  maxRotationEventFromMaxMonday
} from "./battle-opportunities.js";
import {
  STANDARD_MAX_PARTICLE_DAILY_LIMIT,
  STANDARD_MAX_PARTICLE_STORAGE_LIMIT,
  buildBattleResourcePlan,
  inferMaxParticleCost,
  maxBattleRemotePassEligible,
  planningPriorityForRecommendation
} from "./resource-planning.js";
import {
  remoteRaidRuleApplicability
} from "./remote-raid-rules.js";

const SOURCE_BASE =
  "https://github.com/othyn/go-calendar/releases/latest/download/";

const SOURCES = {
  community_day: SOURCE_BASE + "gocal__community_day.ics",
  event: SOURCE_BASE + "gocal__event.ics",
  go_battle_league: SOURCE_BASE + "gocal__go_battle_league.ics",
  go_pass: SOURCE_BASE + "gocal__go_pass.ics",
  max_battles: SOURCE_BASE + "gocal__max_battles.ics",
  max_mondays: SOURCE_BASE + "gocal__max_mondays.ics",
  pokemon_go_fest: SOURCE_BASE + "gocal__pokemon_go_fest.ics",
  pokemon_spotlight_hour: SOURCE_BASE + "gocal__pokemon_spotlight_hour.ics",
  raid_battles: SOURCE_BASE + "gocal__raid_battles.ics",
  raid_day: SOURCE_BASE + "gocal__raid_day.ics",
  raid_hour: SOURCE_BASE + "gocal__raid_hour.ics",
  research: SOURCE_BASE + "gocal__research.ics",
  season: SOURCE_BASE + "gocal__season.ics"
};

const DEFAULT_SOURCES = [
  "community_day",
  "event",
  "max_battles",
  "max_mondays",
  "pokemon_go_fest",
  "pokemon_spotlight_hour",
  "raid_battles",
  "raid_day",
  "raid_hour",
  "research"
];

// Battle recommendations include standard Raids plus Max Battles.
// Keep the legacy constant name here so the existing meta/calendar plumbing
// remains stable while the UI migrates to the shared battle model.
const RAID_SOURCE_TYPES = BATTLE_SOURCE_TYPES;

// Only ordinary Raid events are candidates for the legacy Raid allocator.
// Daily Remote participation usage is shared with Remote Max Battles and is
// summed from the two existing ledgers before applying the official limit.
const REMOTE_RAID_SOURCE_TYPES = new Set([
  "raid_battles",
  "raid_day",
  "raid_hour"
]);

const DEFAULT_REMOTE_RAID_LIMIT = 10;
const DEFAULT_REMOTE_RAID_MIN_SCORE = 60;
const REMOTE_RAID_DECAY_PER_RAID = 3;
const REMOTE_BUDGET_LOOKAHEAD_DAYS = 7;
const REMOTE_BUDGET_HEAVY_RATIO = 0.67;
const REMOTE_BUDGET_LIGHT_RATIO = 0.33;
const DEFAULT_REMOTE_RAID_LIMIT_SOURCE =
  "https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2487-joining-battles-remotely/";

const OFFICIAL_POKEMON_GO_NEWS_URL =
  "https://pokemongo.com/news";

const PINNED_OFFICIAL_EVENT_PAGES = [
  "https://pokemongo.com/gofest/megafinale",
  "https://pokemongo.com/news/megafinale-2026-armored-mewtwo"
];

const MAX_OFFICIAL_EVENT_PAGES_PER_SYNC = 8;

const PVPOKE_MASTER_LEAGUE =
  "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-10000.json";

const POGO_API_POKEDEX =
  "https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json";

const BATTLE_MATCH_POKEDEX_TTL_MS = 6 * 60 * 60 * 1000;
let battleMatchPokedex = [];
let battleMatchPokedexLoadedAt = 0;
let battleMatchPokedexPending = null;

async function currentBattleMatchPokedex() {
  const now = Date.now();

  if (
    battleMatchPokedex.length &&
    now - battleMatchPokedexLoadedAt < BATTLE_MATCH_POKEDEX_TTL_MS
  ) {
    return battleMatchPokedex;
  }

  if (battleMatchPokedexPending) {
    return battleMatchPokedexPending;
  }

  battleMatchPokedexPending = (async () => {
    try {
      const response = await fetch(POGO_API_POKEDEX, {
        headers: { "user-agent": "PokemonGoPersonalCalendar/1.0" },
        redirect: "follow"
      });

      if (!response.ok) return battleMatchPokedex;

      const value = await response.json();
      if (Array.isArray(value) && value.length) {
        battleMatchPokedex = value;
        battleMatchPokedexLoadedAt = Date.now();
      }
    } catch {
      // Meta/target matching remains a safe fallback if the upstream catalog
      // is temporarily unavailable. A catalog failure must not break /api/me.
    } finally {
      battleMatchPokedexPending = null;
    }

    return battleMatchPokedex;
  })();

  return battleMatchPokedexPending;
}

const AUTO_META_METHOD_VERSION = "auto-meta-v5-max-ranks";
const RAID_RANK_SOURCE_NAME = "Raid attacker rankings";
const MAX_RANK_SOURCE_NAME = "Max attacker rankings";
const MAX_META_POKEMON_PER_SYNC = 20;
const MAX_RAID_RANK_BACKFILLS_PER_SYNC = 80;
const MAX_MAX_RANK_BACKFILLS_PER_SYNC = 80;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function bad(message, status = 400) {
  return json({ error: message }, status);
}

function nowIso() {
  return new Date().toISOString();
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[♀♂]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function randomToken(bytes = 24) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function feedSigningKey(env) {
  if (!env.FEED_LINK_KEY) {
    throw new Error(
      "FEED_LINK_KEY is not configured. Add it as a Worker runtime secret."
    );
  }

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(env.FEED_LINK_KEY)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function recoverableFeedSignature(env, userId) {
  const key = await feedSigningKey(env);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`pokemon-go-calendar-feed:${userId}`)
  );

  // 24 bytes is plenty for an unguessable read-only feed signature.
  return bytesToBase64Url(new Uint8Array(signature).slice(0, 24));
}

async function verifyRecoverableFeedSignature(env, userId, signature) {
  const expected = await recoverableFeedSignature(env, userId);
  if (expected.length !== String(signature || "").length) return false;

  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ String(signature).charCodeAt(i);
  }
  return difference === 0;
}

function escapeIcs(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function unescapeIcs(value) {
  return String(value ?? "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function unfoldIcs(text) {
  return String(text)
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .replace(/\r/g, "");
}

function firstProperty(lines, name) {
  const upper = name.toUpperCase();
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const propertyName = left.split(";")[0].toUpperCase();
    if (propertyName === upper) {
      return {
        line,
        left,
        value: line.slice(colon + 1)
      };
    }
  }
  return null;
}

function dateFromPropertyLine(line) {
  if (!line) return null;
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const raw = line.slice(colon + 1);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function inclusiveEndDateFromPropertyLine(line, fallbackStartDate = null) {
  const endDate = dateFromPropertyLine(line);
  if (!endDate) return fallbackStartDate;

  const colon = line.indexOf(":");
  const left = colon >= 0 ? line.slice(0, colon).toUpperCase() : "";
  const raw = colon >= 0 ? line.slice(colon + 1).trim() : "";
  const isAllDay = left.includes("VALUE=DATE") || /^\d{8}$/.test(raw);

  if (!isAllDay) return endDate;

  // RFC 5545 all-day DTEND is exclusive. Internally the app compares
  // inclusive calendar days, so subtract one day before storing/using it.
  const adjusted = addDaysIso(endDate, -1);
  if (!adjusted) return fallbackStartDate || endDate;
  if (fallbackStartDate && adjusted < fallbackStartDate) {
    return fallbackStartDate;
  }
  return adjusted;
}

function parseIcsEvents(text) {
  const unfolded = unfoldIcs(text);
  const blocks = unfolded.match(/BEGIN:VEVENT\n[\s\S]*?\nEND:VEVENT/g) || [];

  return blocks.map((block) => {
    const lines = block
      .split("\n")
      .filter((line) => line && line !== "BEGIN:VEVENT" && line !== "END:VEVENT");

    const summaryProp = firstProperty(lines, "SUMMARY");
    const descriptionProp = firstProperty(lines, "DESCRIPTION");
    const uidProp = firstProperty(lines, "UID");
    const dtstartProp = firstProperty(lines, "DTSTART");
    const dtendProp = firstProperty(lines, "DTEND");
    const urlProp = firstProperty(lines, "URL");

    if (!summaryProp || !dtstartProp) return null;

    const otherLines = lines.filter((line) => {
      const colon = line.indexOf(":");
      if (colon < 0) return true;
      const name = line.slice(0, colon).split(";")[0].toUpperCase();
      return !["SUMMARY", "DESCRIPTION", "DTSTART", "DTEND", "SEQUENCE", "STATUS"].includes(name);
    });

    return {
      source_uid: uidProp ? uidProp.value : null,
      summary: unescapeIcs(summaryProp.value),
      description: descriptionProp ? unescapeIcs(descriptionProp.value) : "",
      dtstart_line: dtstartProp.line,
      dtend_line: dtendProp ? dtendProp.line : null,
      other_lines: otherLines.join("\n"),
      start_date: dateFromPropertyLine(dtstartProp.line),
      end_date: dtendProp
      ? inclusiveEndDateFromPropertyLine(
          dtendProp.line,
          dateFromPropertyLine(dtstartProp.line)
        )
      : dateFromPropertyLine(dtstartProp.line),
      source_url: urlProp ? urlProp.value : null
    };
  }).filter(Boolean);
}

async function syncOneSource(env, sourceType, url) {
  const response = await fetch(url, {
    headers: { "user-agent": "PokemonGoPersonalCalendar/1.0" },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`${sourceType}: upstream returned ${response.status}`);
  }

  const text = await response.text();
  const parsed = parseIcsEvents(text);

  if (!parsed.length) {
    throw new Error(`${sourceType}: parsed zero events; refusing to replace existing data`);
  }

  const timestamp = nowIso();
  const day = todayUtc();
  const statements = [];

  statements.push(
    env.DB.prepare(`
      UPDATE events
      SET status = 'stale',
          sequence = sequence + 1,
          updated_at = ?
      WHERE source_type = ?
        AND status = 'active'
        AND COALESCE(end_date, start_date, '9999-12-31') >= ?
    `).bind(timestamp, sourceType, day)
  );

  for (const event of parsed) {
    const identity =
      event.source_uid ||
      `${event.summary}|${event.dtstart_line}|${event.dtend_line || ""}`;

    const id = await sha256Hex(`${sourceType}|${identity}`);
    const contentHash = await sha256Hex(JSON.stringify(event));

    statements.push(
      env.DB.prepare(`
        INSERT INTO events (
          id, source_type, source_uid, summary, description,
          dtstart_line, dtend_line, other_lines,
          start_date, end_date, source_url, content_hash,
          sequence, status, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)
        ON CONFLICT(id) DO UPDATE SET
          source_uid = excluded.source_uid,
          summary = excluded.summary,
          description = excluded.description,
          dtstart_line = excluded.dtstart_line,
          dtend_line = excluded.dtend_line,
          other_lines = excluded.other_lines,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          source_url = excluded.source_url,
          sequence = CASE
            WHEN events.content_hash != excluded.content_hash
              OR events.status != 'active'
            THEN events.sequence + 1
            ELSE events.sequence
          END,
          content_hash = excluded.content_hash,
          status = 'active',
          updated_at = excluded.updated_at
      `).bind(
        id,
        sourceType,
        event.source_uid,
        event.summary,
        event.description,
        event.dtstart_line,
        event.dtend_line,
        event.other_lines,
        event.start_date,
        event.end_date,
        event.source_url,
        contentHash,
        timestamp
      )
    );
  }

  await env.DB.batch(statements);
  return parsed.length;
}

async function syncDerivedMaxRotations(env) {
  const today = todayUtc();
  const windowStart = addDaysIso(today, -42);
  const windowEnd = addDaysIso(today, 70);

  const { results: maxMondays } = await env.DB.prepare(`
    SELECT *
    FROM events
    WHERE source_type = 'max_mondays'
      AND status = 'active'
      AND start_date IS NOT NULL
      AND start_date >= ?
      AND start_date <= ?
    ORDER BY start_date, summary
  `).bind(windowStart, windowEnd).all();

  const derived = (maxMondays || [])
    .map(event => maxRotationEventFromMaxMonday(event))
    .filter(Boolean);

  // Preserve last-known derived data if the upstream schedule window is
  // temporarily empty instead of erasing otherwise valid availability.
  if (!derived.length) return 0;

  const timestamp = nowIso();
  const statements = [
    env.DB.prepare(`
      UPDATE events
      SET status = 'stale',
          sequence = sequence + 1,
          updated_at = ?
      WHERE source_type = ?
        AND status = 'active'
        AND COALESCE(end_date, start_date, '9999-12-31') >= ?
    `).bind(timestamp, MAX_ROTATION_SOURCE_TYPE, today)
  ];

  for (const event of derived) {
    const identity = event.source_uid ||
      event.summary + "|" + event.dtstart_line + "|" + (event.dtend_line || "");
    const id = await sha256Hex(MAX_ROTATION_SOURCE_TYPE + "|" + identity);
    const contentHash = await sha256Hex(JSON.stringify(event));

    statements.push(
      env.DB.prepare(`
        INSERT INTO events (
          id, source_type, source_uid, summary, description,
          dtstart_line, dtend_line, other_lines,
          start_date, end_date, source_url, content_hash,
          sequence, status, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)
        ON CONFLICT(id) DO UPDATE SET
          source_uid = excluded.source_uid,
          summary = excluded.summary,
          description = excluded.description,
          dtstart_line = excluded.dtstart_line,
          dtend_line = excluded.dtend_line,
          other_lines = excluded.other_lines,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          source_url = excluded.source_url,
          sequence = CASE
            WHEN events.content_hash != excluded.content_hash
              OR events.status != 'active'
            THEN events.sequence + 1
            ELSE events.sequence
          END,
          content_hash = excluded.content_hash,
          status = 'active',
          updated_at = excluded.updated_at
      `).bind(
        id,
        MAX_ROTATION_SOURCE_TYPE,
        event.source_uid,
        event.summary,
        event.description,
        event.dtstart_line,
        event.dtend_line,
        event.other_lines,
        event.start_date,
        event.end_date,
        event.source_url,
        contentHash,
        timestamp
      )
    );
  }

  await env.DB.batch(statements);
  return derived.length;
}

async function syncAllEvents(env) {
  const results = [];
  for (const [sourceType, url] of Object.entries(SOURCES)) {
    try {
      const count = await syncOneSource(env, sourceType, url);
      results.push({ source: sourceType, ok: true, count });
    } catch (error) {
      results.push({ source: sourceType, ok: false, error: String(error.message || error) });
    }
  }

  try {
    const count = await syncDerivedMaxRotations(env);
    results.push({ source: MAX_ROTATION_SOURCE_TYPE, ok: true, count, derived: true });
  } catch (error) {
    results.push({
      source: MAX_ROTATION_SOURCE_TYPE,
      ok: false,
      derived: true,
      error: String(error.message || error)
    });
  }

  return results;
}


function englishName(pokemon) {
  return String(
    pokemon?.names?.English ||
    pokemon?.name ||
    pokemon?.id ||
    ""
  ).trim();
}

function objectValues(value) {
  if (!value || typeof value !== "object") return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function moveTypeName(move) {
  return String(
    move?.type?.names?.English ||
    move?.type?.type ||
    ""
  ).trim();
}

function pokemonTypeNames(pokemon) {
  const values = [
    pokemon?.primaryType?.names?.English || pokemon?.primaryType?.type,
    pokemon?.secondaryType?.names?.English || pokemon?.secondaryType?.type
  ];
  return values.filter(Boolean).map((v) => String(v).toLowerCase());
}

function bestPveCycleDps(pokemon) {
  const quickMoves = objectValues(pokemon?.quickMoves);
  const chargedMoves = objectValues(pokemon?.cinematicMoves);

  if (!quickMoves.length || !chargedMoves.length) {
    return null;
  }

  const types = new Set(pokemonTypeNames(pokemon));
  let best = 0;

  for (const fast of quickMoves) {
    const fastPower = Number(fast?.power || 0);
    const fastDuration = Math.max(Number(fast?.durationMs || 1000) / 1000, 0.1);
    const fastEnergy = Math.max(Math.abs(Number(fast?.energy || 0)), 1);
    const fastStab = types.has(moveTypeName(fast).toLowerCase()) ? 1.2 : 1.0;

    for (const charged of chargedMoves) {
      const chargePower = Number(charged?.power || 0);
      const chargeDuration = Math.max(Number(charged?.durationMs || 2000) / 1000, 0.1);
      const chargeCost = Math.max(Math.abs(Number(charged?.energy || 50)), 1);
      const chargeStab = types.has(moveTypeName(charged).toLowerCase()) ? 1.2 : 1.0;

      const fastCount = Math.max(1, Math.ceil(chargeCost / fastEnergy));
      const damage =
        fastCount * fastPower * fastStab +
        chargePower * chargeStab;
      const seconds =
        fastCount * fastDuration +
        chargeDuration;

      if (seconds > 0) {
        best = Math.max(best, damage / seconds);
      }
    }
  }

  return best || null;
}

function rawPvePower(pokemon) {
  const attack = Number(pokemon?.stats?.attack || 0);
  const defense = Number(pokemon?.stats?.defense || 0);
  const stamina = Number(pokemon?.stats?.stamina || 0);

  if (!attack) return 0;

  const cycleDps = bestPveCycleDps(pokemon);
  const bulk = Math.sqrt(Math.max(defense, 1) * Math.max(stamina, 1));

  if (cycleDps) {
    // Attack and best same-species move cycle dominate.
    // Bulk gets only a small weight because this is a raid-attacker proxy.
    return attack * cycleDps * Math.pow(bulk, 0.15);
  }

  return attack * Math.pow(bulk, 0.25);
}

function percentileScore(sortedValues, value) {
  if (!sortedValues.length) return 50;
  let low = 0;
  let high = sortedValues.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (sortedValues[mid] <= value) low = mid + 1;
    else high = mid;
  }

  const percentile = low / sortedValues.length;
  // Keep the bottom from being exactly zero and the top close to 100.
  return clamp(5 + percentile * 95, 0, 100);
}

function classRarity(pokemon) {
  const cls = String(pokemon?.pokemonClass || "");
  if (cls.includes("MYTHIC")) return 95;
  if (cls.includes("LEGENDARY")) return 90;
  if (cls.includes("ULTRA_BEAST")) return 88;
  return 55;
}

function daysBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function availabilityRarity(event, pokemon, kind) {
  let score = classRarity(pokemon);
  if (kind === "mega" || kind === "primal") score = Math.max(score, 82);
  if (kind === "gigantamax") score = Math.max(score, 82);

  const duration = daysBetween(event.start_date, event.end_date);
  if (duration != null) {
    if (duration <= 2) score += 15;
    else if (duration <= 4) score += 12;
    else if (duration <= 7) score += 8;
    else if (duration <= 14) score += 4;
  }

  return clamp(score, 0, 100);
}

function eventKindForMatch(summary, pokemonName) {
  const s = normalizeName(summary);
  const n = normalizeName(pokemonName);
  if (s.includes(`shadow ${n}`)) return "shadow";
  if (s.includes(`mega ${n}`)) return "mega";
  if (s.includes(`primal ${n}`)) return "primal";
  if (s.includes(`gigantamax ${n}`)) return "gigantamax";
  if (s.includes(`dynamax ${n}`)) return "dynamax";
  return "normal";
}

function displayNameForMatch(
  pokemonName,
  kind,
  summary = "",
  pokemon = null
) {
  const normalizedSummary =
    normalizeName(summary);

  const normalizedName =
    normalizeName(pokemonName);

  const exactRegionForm =
    Object.values(
      pokemon?.regionForms || {}
    )
      .map(form =>
        String(
          form?.names?.English ||
          form?.name?.English ||
          ""
        ).trim()
      )
      .filter(Boolean)
      .sort((a, b) =>
        normalizeName(b).length -
        normalizeName(a).length
      )
      .find(formName =>
        normalizedSummary.includes(
          normalizeName(formName)
        )
      ) || null;

  if (kind === "shadow") {
    return `Shadow ${exactRegionForm || pokemonName}`;
  }

  if (
    normalizedSummary.includes(
      `armored ${normalizedName}`
    )
  ) {
    return `Armored ${pokemonName}`;
  }

  if (kind === "mega") {
    if (
      normalizedSummary.includes(
        `mega ${normalizedName} x`
      )
    ) {
      return `Mega ${pokemonName} X`;
    }

    if (
      normalizedSummary.includes(
        `mega ${normalizedName} y`
      )
    ) {
      return `Mega ${pokemonName} Y`;
    }

    return `Mega ${pokemonName}`;
  }

  if (kind === "primal") {
    return `Primal ${pokemonName}`;
  }

  if (kind === "gigantamax") {
    return `Gigantamax ${exactRegionForm || pokemonName}`;
  }

  if (kind === "dynamax") {
    return `Dynamax ${exactRegionForm || pokemonName}`;
  }

  if (exactRegionForm) {
    return exactRegionForm;
  }

  return pokemonName;
}

function spriteCandidateText(
  value,
  extra = ""
) {
  if (!value) {
    return normalizeName(extra);
  }

  return normalizeName(
    [
      extra,
      value.id,
      value.formId,
      value.form,
      value.costume,
      value.names?.English,
      value.name?.English
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function spriteCandidatesForPokemon(
  pokemon
) {
  const candidates = [];

  const push =
    (
      value,
      label = "",
      fallbackAssets = null
    ) => {
      if (!value && !fallbackAssets) {
        return;
      }

      const assets =
        value?.assets ||
        fallbackAssets ||
        value ||
        {};

      const image =
        assets?.image || null;

      const shinyImage =
        assets?.shinyImage || null;

      if (!image && !shinyImage) {
        return;
      }

      candidates.push({
        image,
        shinyImage,
        text:
          spriteCandidateText(
            value,
            label
          )
      });
    };

  push(
    pokemon,
    "base",
    pokemon?.assets
  );

  for (
    const form of
    Array.isArray(pokemon?.assetForms)
      ? pokemon.assetForms
      : []
  ) {
    push(
      form,
      `asset form ${form?.form || ""} ${form?.costume || ""}`,
      form
    );
  }

  for (
    const [key, value] of
    Object.entries(
      pokemon?.megaEvolutions || {}
    )
  ) {
    push(
      value,
      `mega ${key}`,
      value?.assets
    );
  }

  for (
    const [key, value] of
    Object.entries(
      pokemon?.regionForms || {}
    )
  ) {
    push(
      value,
      `region ${key}`,
      value?.assets
    );
  }

  return candidates;
}

const SPECIAL_SPRITE_ASSETS = {
  "mega mewtwo x": {
    sprite_url:
      "https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm150.fMEGA_X.icon.png",
    shiny_sprite_url:
      "https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm150.fMEGA_X.s.icon.png",
    source:
      "pokemon-go-api-assets"
  },

  "mega mewtwo y": {
    sprite_url:
      "https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm150.fMEGA_Y.icon.png",
    shiny_sprite_url:
      "https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm150.fMEGA_Y.s.icon.png",
    source:
      "pokemon-go-api-assets"
  },

  "armored mewtwo": {
    sprite_url:
      "https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm150.fA.icon.png",
    shiny_sprite_url:
      null,
    source:
      "pokemon-go-api-assets"
  },

  // Do not substitute a visually different Raichu image for these forms.
  // If pokemon-go-api later exposes an exact GO form candidate, the resolver
  // below will automatically use it. Until then the UI intentionally shows
  // no sprite for these two forms.
  "mega raichu x": {
    sprite_url: null,
    shiny_sprite_url: null,
    source: "exact-go-asset-pending",
    force_clear_sprite: true
  },

  "mega raichu y": {
    sprite_url: null,
    shiny_sprite_url: null,
    source: "exact-go-asset-pending",
    force_clear_sprite: true
  }
};

function specialSpriteAssets(
  displayName,
  candidates = []
) {
  const key =
    normalizeName(
      displayName
    );

  const configured =
    SPECIAL_SPRITE_ASSETS[
      key
    ];

  if (!configured) {
    return null;
  }

  // For Raichu X/Y, automatically switch back to a real GO icon if
  // pokemon-go-api starts exposing a form-specific candidate later.
  if (
    key === "mega raichu x" ||
    key === "mega raichu y"
  ) {
    const suffix =
      key.endsWith(" x")
        ? "x"
        : "y";

    const exactGoCandidate =
      candidates.find(
        candidate => {
          const candidateText =
            candidate.text || "";

          return (
            candidate.image &&
            candidateText.includes(
              "mega"
            ) &&
            (
              candidateText.includes(
                `mega ${suffix}`
              ) ||
              candidateText.includes(
                `mega_${suffix}`
              ) ||
              candidateText.includes(
                `mega-${suffix}`
              ) ||
              candidateText.endsWith(
                ` ${suffix}`
              )
            )
          );
        }
      );

    if (exactGoCandidate) {
      return {
        sprite_url:
          exactGoCandidate.image,
        shiny_sprite_url:
          exactGoCandidate.shinyImage ||
          null
      };
    }
  }

  return {
    sprite_url:
      configured.sprite_url,
    shiny_sprite_url:
      configured.shiny_sprite_url,
    force_clear_sprite:
      Boolean(
        configured.force_clear_sprite
      )
  };
}

export function spriteAssetsForDisplayName(
  pokemon,
  displayName,
  kind
) {
  const candidates =
    spriteCandidatesForPokemon(
      pokemon
    );

  const special =
    specialSpriteAssets(
      displayName,
      candidates
    );

  if (special) {
    return special;
  }

  if (!candidates.length) {
    return {
      sprite_url: null,
      shiny_sprite_url: null
    };
  }

  const desired =
    normalizeName(displayName);

  const desiredTokens =
    desired.split(" ").filter(Boolean);

  const wantsMega =
    kind === "mega" ||
    desiredTokens.includes("mega");

  const wantsPrimal =
    kind === "primal" ||
    desiredTokens.includes("primal");

  const wantsGigantamax =
    kind === "gigantamax" ||
    desiredTokens.includes("gigantamax");

  const wantsDynamax =
    kind === "dynamax" ||
    desiredTokens.includes("dynamax");

  const wantsArmored =
    desiredTokens.includes("armored");

  const wantsShadow =
    desiredTokens.includes("shadow");

  if (wantsShadow) {
    const exactShadow =
      candidates.find(
        candidate =>
          candidate.image &&
          (candidate.text || "").includes("shadow")
      );

    if (exactShadow) {
      return {
        sprite_url: exactShadow.image,
        shiny_sprite_url: exactShadow.shinyImage || null
      };
    }

    // pokemon-go-api does not normally publish separate static Shadow icons;
    // the in-game Shadow treatment is applied over the species/form model.
    // Reuse only the best matching underlying GO form, then let the UI apply
    // an explicit Shadow aura treatment. This avoids both a blank card and a
    // silent substitution to a different form (for example Therian vs Incarnate).
    const shadowAliases = new Map([
      ["alolan", "alola"],
      ["galarian", "galar"],
      ["hisuian", "hisui"],
      ["paldean", "paldea"]
    ]);

    const shadowTokens =
      desiredTokens
        .filter(
          token =>
            token !== "shadow" &&
            token !== "form" &&
            token !== "forme"
        )
        .map(
          token =>
            shadowAliases.get(token) || token
        );

    const formMarkers = new Set([
      "alola",
      "galar",
      "hisui",
      "paldea",
      "incarnate",
      "therian",
      "origin",
      "attack",
      "defense",
      "speed"
    ]);

    const requestedMarkers =
      shadowTokens.filter(
        token =>
          formMarkers.has(token)
      );

    const underlying =
      candidates
        .filter(candidate => candidate.image)
        .map(candidate => {
          const text = candidate.text || "";
          let score = 0;

          for (const token of shadowTokens) {
            if (text.includes(token)) {
              score += formMarkers.has(token) ? 30 : 8;
            }
          }

          if (
            requestedMarkers.length &&
            !requestedMarkers.some(
              marker => text.includes(marker)
            )
          ) {
            score -= 40;
          }

          return { candidate, score };
        })
        .sort((a, b) => b.score - a.score)
        .find(item => item.score > 0)
        ?.candidate || null;

    return underlying
      ? {
          sprite_url: underlying.image,
          shiny_sprite_url: null,
          shadow_visual_fallback: true
        }
      : {
          sprite_url: null,
          shiny_sprite_url: null
        };
  }

  const wantsX =
    desiredTokens.at(-1) === "x";

  const wantsY =
    desiredTokens.at(-1) === "y";

  const scoreCandidate =
    candidate => {
      const text =
        candidate.text || "";

      let score = 0;

      for (const token of desiredTokens) {
        if (text.includes(token)) {
          score += 8;
        }
      }

      if (wantsMega) {
        score +=
          text.includes("mega")
            ? 35
            : -20;
      }

      if (wantsPrimal) {
        score +=
          text.includes("primal")
            ? 35
            : -20;
      }

      if (wantsGigantamax) {
        score +=
          text.includes("gigantamax")
            ? 35
            : -20;
      }

      if (wantsDynamax) {
        score +=
          text.includes("dynamax")
            ? 25
            : -10;
      }

      if (wantsArmored) {
        score +=
          text.includes("armored")
            ? 50
            : -25;
      }

      if (wantsX) {
        score +=
          (
            text.includes("mega x") ||
            text.includes("mega_x") ||
            text.endsWith(" x")
          )
            ? 45
            : -15;
      }

      if (wantsY) {
        score +=
          (
            text.includes("mega y") ||
            text.includes("mega_y") ||
            text.endsWith(" y")
          )
            ? 45
            : -15;
      }

      if (text.includes("base")) {
        score +=
          (
            wantsMega ||
            wantsPrimal ||
            wantsGigantamax ||
            wantsArmored ||
            wantsX ||
            wantsY
          )
            ? -10
            : 5;
      }

      return score;
    };

  const ranked =
    candidates
      .map(candidate => ({
        ...candidate,
        score:
          scoreCandidate(
            candidate
          )
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

  const best =
    ranked[0];

  return {
    sprite_url:
      best?.image || null,
    shiny_sprite_url:
      best?.shinyImage || null
  };
}

export function targetSpriteUrl(target, metas) {
  const kind = targetBattleKind(target);
  return metas.find(meta => normalizeName(meta.pokemon_name) === normalizeName(target.pokemon_name)
    && (kind !== "gigantamax" || namedTargetKind(meta.pokemon_name) === "gigantamax"))?.sprite_url || null;
}
function spriteUrlForPokemonName(
  name,
  metas
) {
  const normalized =
    normalizeName(name);

  const exact =
    metas.find(
      meta =>
        normalizeName(
          meta.pokemon_name
        ) === normalized
    );

  if (exact?.sprite_url) {
    return exact.sprite_url;
  }

  const base =
    normalized
      .replace(
        /^(shadow|mega|primal|gigantamax|dynamax|armored)\s+/,
        ""
      )
      .replace(/\s+[xy]$/, "");

  const fallback =
    metas.find(meta => {
      const candidate =
        normalizeName(
          meta.pokemon_name
        )
          .replace(
            /^(shadow|mega|primal|gigantamax|dynamax|armored)\s+/,
            ""
          )
          .replace(/\s+[xy]$/, "");

      return (
        candidate === base &&
        meta.sprite_url
      );
    });

  return fallback?.sprite_url || null;
}

export function raidRankProfileJsonIsCurrent(value) {
  if (!value) return false;

  try {
    const profile =
      typeof value === "string"
        ? JSON.parse(value)
        : value;

    return (
      profile &&
      typeof profile === "object" &&
      profile.method ===
        RAID_RANK_METHOD_VERSION
    );
  } catch {
    return false;
  }
}

function currentRaidRankingsJson(value) {
  return raidRankProfileJsonIsCurrent(value)
    ? value
    : null;
}

export function maxRankProfileJsonIsCurrent(value) {
  if (!value) return false;

  try {
    const profile =
      typeof value === "string"
        ? JSON.parse(value)
        : value;

    return (
      profile &&
      typeof profile === "object" &&
      profile.method_version ===
        MAX_RANK_METHOD_VERSION
    );
  } catch {
    return false;
  }
}

function currentMaxRankingsJson(value) {
  return maxRankProfileJsonIsCurrent(value)
    ? value
    : null;
}

function maxRankingsJsonForPokemonName(
  name,
  metas
) {
  const key =
    canonicalMaxPokemonName(name);

  if (!key) return null;

  const match =
    metas.find(
      meta =>
        canonicalMaxPokemonName(
          meta.pokemon_name
        ) === key &&
        meta.max_rankings_json
    );

  return currentMaxRankingsJson(
    match?.max_rankings_json
  );
}

function raidRankingsJsonForPokemonName(
  name,
  metas
) {
  const normalized =
    normalizeName(name);

  const exact =
    metas.find(
      meta =>
        normalizeName(
          meta.pokemon_name
        ) === normalized &&
        meta.raid_rankings_json
    );

  const exactRankingsJson =
    currentRaidRankingsJson(
      exact?.raid_rankings_json
    );

  if (exactRankingsJson) {
    return exactRankingsJson;
  }

  // A Shadow target must never inherit a normal-form comparison profile.
  // It will appear once the exact Shadow raid form has been assessed.
  if (normalized.startsWith("shadow ")) {
    return null;
  }

  const familyKey =
    value =>
      normalizeName(value)
        .replace(
          /^(shadow|mega|primal|gigantamax|dynamax|armored)\s+/,
          ""
        )
        .replace(/\s+[xy]$/, "")
        .replace(
          /\s+(crowned sword|crowned shield|origin forme|origin form|therian forme|incarnate forme)$/,
          ""
        );

  const base =
    familyKey(name);

  const fallback =
    metas.find(
      meta =>
        familyKey(
          meta.pokemon_name
        ) === base &&
        meta.raid_rankings_json
    );

  return currentRaidRankingsJson(
    fallback?.raid_rankings_json
  );
}

function automaticVerdict(pve, pvp, rarity, mega, kind) {
  const pveText =
    pve >= 85 ? "elite PvE potential" :
    pve >= 70 ? "strong PvE potential" :
    pve >= 50 ? "moderate PvE potential" :
    "limited PvE value";

  const rarityText =
    rarity >= 88 ? "highly limited/valuable availability" :
    rarity >= 72 ? "limited availability" :
    "normal availability";

  const extra =
    kind === "mega" || kind === "primal"
      ? ` Mega/support utility is ${mega >= 85 ? "excellent" : mega >= 70 ? "good" : "moderate"}.`
      : "";

  return `${pveText}; ${rarityText}.${extra}`;
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { "user-agent": "PokemonGoPersonalCalendar/1.0" },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }

  return response.json();
}

async function raidEventsForMeta(env) {
  const placeholders = [...RAID_SOURCE_TYPES].map(() => "?").join(",");

  const { results } = await env.DB.prepare(`
    SELECT *
    FROM events
    WHERE status = 'active'
      AND source_type IN (${placeholders})
      AND COALESCE(end_date, start_date, '9999-12-31') >= date('now', '-1 day')
      AND COALESCE(start_date, '0000-01-01') <= date('now', '+30 days')
    ORDER BY start_date, summary
    LIMIT 400
  `).bind(...RAID_SOURCE_TYPES).all();

  const rules =
    await eventSuppressionRules(
      env,
      todayUtc(),
      addDaysIso(
        todayUtc(),
        30
      )
    );

  return results.filter(
    (event) =>
      !eventIsSuppressedByRules(
        event,
        rules
      )
  );
}

async function maxEligibilityEventsForMeta(env) {
  const placeholders =
    [...MAX_BATTLE_SOURCE_TYPES]
      .map(() => "?")
      .join(",");

  const { results } =
    await env.DB.prepare(`
      SELECT
        summary,
        source_type,
        start_date,
        end_date,
        updated_at
      FROM events
      WHERE source_type IN (${placeholders})
        AND status IN ('active', 'stale')
      ORDER BY updated_at DESC
      LIMIT 1500
    `).bind(
      ...MAX_BATTLE_SOURCE_TYPES
    ).all();

  return results || [];
}

function maxEligibleNamesFromEvents(
  events,
  pokedex
) {
  const names = new Set();

  for (const event of events || []) {
    for (const match of
      findPokemonMatchesInSummary(
        event.summary,
        pokedex
      )) {
      const kind =
        eventKindForMatch(
          event.summary,
          match.name
        );

      names.add(
        displayNameForMatch(
          match.name,
          kind,
          event.summary,
          match.pokemon
        )
      );
    }
  }

  return [...names];
}

function findPokemonMatchesInSummary(summary, pokedex) {
  const haystack = normalizeName(summary);
  const matches = [];

  for (const pokemon of pokedex) {
    const name = englishName(pokemon);
    const needle = normalizeName(name);
    if (!needle || needle.length < 3) continue;

    if (haystack.includes(needle)) {
      matches.push({
        pokemon,
        name,
        kind: eventKindForMatch(summary, name),
        length: needle.length
      });
    }
  }

  // Longest matches first; remove nested accidental duplicates.
  matches.sort((a, b) => b.length - a.length);
  const selected = [];
  const seen = new Set();

  for (const match of matches) {
    const key = normalizeName(match.name);
    if (seen.has(key)) continue;

    // Avoid selecting a shorter name fully contained inside a longer already-selected name.
    if (selected.some((x) => normalizeName(x.name).includes(key) && normalizeName(x.name) !== key)) {
      continue;
    }

    seen.add(key);
    selected.push(match);
  }

  return selected.slice(0, 8);
}

async function syncAutomaticMeta(env) {
  const [
    pokedexRaw,
    pvpRankings,
    raidEvents,
    maxEligibilityEvents
  ] = await Promise.all([
    fetchJson(POGO_API_POKEDEX, "Pokémon GO API"),
    fetchJson(PVPOKE_MASTER_LEAGUE, "PvPoke"),
    raidEventsForMeta(env),
    maxEligibilityEventsForMeta(env)
  ]);

  const pokedex = Array.isArray(pokedexRaw) ? pokedexRaw : [];
  if (!pokedex.length) {
    throw new Error("Pokémon GO API returned no Pokédex entries.");
  }

  const rawPowers = pokedex
    .map(rawPvePower)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const raidRankCatalog =
    buildRaidAttackerRankCatalog(
      pokedex
    );

  const maxEligibleNames =
    maxEligibleNamesFromEvents(
      maxEligibilityEvents,
      pokedex
    );

  const maxRankCatalog =
    buildMaxAttackerRankCatalog(
      pokedex,
      {
        maxEligibleNames
      }
    );

  const pvpMap = new Map();
  for (const item of Array.isArray(pvpRankings) ? pvpRankings : []) {
    const species =
      item?.speciesName ||
      item?.speciesId ||
      item?.name;
    const score = Number(item?.score);

    if (species && Number.isFinite(score)) {
      pvpMap.set(normalizeName(species), clamp(score, 0, 100));
    }
  }

  const bestByDisplayName = new Map();

  for (const event of raidEvents) {
    const matches = findPokemonMatchesInSummary(event.summary, pokedex);

    for (const match of matches) {
      const displayName =
        displayNameForMatch(
          match.name,
          match.kind,
          event.summary,
          match.pokemon
        );
      const key = normalizeName(displayName);
      const pvePower =
        rawPvePower(match.pokemon) *
        (match.kind === "shadow" ? 1.2 : 1.0);
      const pve = percentileScore(rawPowers, pvePower);
      const pvp =
        match.kind === "mega" ||
        match.kind === "primal" ||
        match.kind === "shadow"
          ? null
          : (pvpMap.get(normalizeName(match.name)) ?? null);
      const rarity = availabilityRarity(event, match.pokemon, match.kind);

      const mega =
        match.kind === "mega" || match.kind === "primal"
          ? clamp(55 + pve * 0.45, 0, 100)
          : match.kind === "gigantamax"
            ? clamp(50 + pve * 0.35, 0, 100)
            : null;

      const pvpForOverall = pvp == null ? 50 : pvp;
      const megaForOverall = mega == null ? 50 : mega;
      const overall = clamp(
        pve * 0.55 +
        pvpForOverall * 0.10 +
        rarity * 0.20 +
        megaForOverall * 0.15,
        0,
        100
      );

      const spriteAssets =
        spriteAssetsForDisplayName(
          match.pokemon,
          displayName,
          match.kind
        );

      const candidate = {
        displayName,
        baseName: match.name,
        kind: match.kind,
        pve,
        pvp,
        rarity,
        mega,
        overall,
        event,
        pokemon: match.pokemon,
        raidRankProfile:
          raidRankProfileForName(
            displayName,
            raidRankCatalog
          ),
        maxRankProfile:
          maxRankProfileForName(
            maxRankCatalog,
            displayName
          ),
        ...spriteAssets
      };

      const existing = bestByDisplayName.get(key);
      if (!existing || candidate.overall > existing.overall) {
        bestByDisplayName.set(key, candidate);
      }
    }
  }

  const allCandidates =
    [...bestByDisplayName.values()];

  const {
    results: existingMetaRows
  } =
    await env.DB.prepare(`
      SELECT
        pm.pokemon_name,
        pm.sprite_url,
        (
          SELECT MAX(ms.updated_at)
          FROM meta_sources ms
          WHERE ms.pokemon_name = pm.pokemon_name
            AND ms.source_name = ?
        ) AS raid_rank_updated_at,
        (
          SELECT ms.note
          FROM meta_sources ms
          WHERE ms.pokemon_name = pm.pokemon_name
            AND ms.source_name = ?
          ORDER BY ms.updated_at DESC
          LIMIT 1
        ) AS raid_rankings_json,
        (
          SELECT MAX(ms.updated_at)
          FROM meta_sources ms
          WHERE ms.pokemon_name = pm.pokemon_name
            AND ms.source_name = ?
        ) AS max_rank_updated_at,
        (
          SELECT ms.note
          FROM meta_sources ms
          WHERE ms.pokemon_name = pm.pokemon_name
            AND ms.source_name = ?
          ORDER BY ms.updated_at DESC
          LIMIT 1
        ) AS max_rankings_json
      FROM pokemon_meta pm
    `).bind(
      RAID_RANK_SOURCE_NAME,
      RAID_RANK_SOURCE_NAME,
      MAX_RANK_SOURCE_NAME,
      MAX_RANK_SOURCE_NAME
    ).all();

  const existingMetaMap =
    new Map(
      (existingMetaRows || [])
        .map(row => [
          normalizeName(
            row.pokemon_name
          ),
          row
        ])
    );

  const today =
    todayUtc();

  const raidRankStaleBefore =
    new Date(
      Date.now() -
      7 * 86400000
    ).toISOString();

  const rankedCandidates =
    allCandidates
      .map(candidate => {
        const existing =
          existingMetaMap.get(
            normalizeName(
              candidate.displayName
            )
          ) || null;

        const missingRecord =
          !existing;

        const spriteBackfill =
          Boolean(
            candidate.sprite_url
          ) &&
          !existing?.sprite_url;

        const spriteCorrection =
          (
            Boolean(
              candidate.sprite_url
            ) &&
            Boolean(
              existing?.sprite_url
            ) &&
            candidate.sprite_url !==
              existing.sprite_url
          ) ||
          (
            Boolean(
              candidate.force_clear_sprite
            ) &&
            Boolean(
              existing?.sprite_url
            )
          );

        const startDate =
          candidate.event.start_date ||
          "9999-12-31";

        const endDate =
          candidate.event.end_date ||
          candidate.event.start_date ||
          startDate;

        const activeToday =
          startDate <= today &&
          endDate >= today;

        const raidRankRefresh =
        !existing?.raid_rank_updated_at ||
        existing.raid_rank_updated_at <
          raidRankStaleBefore ||
        (
          Boolean(
            existing?.raid_rankings_json
          ) &&
          !raidRankProfileJsonIsCurrent(
            existing.raid_rankings_json
          )
        );


        const maxRankRefresh =
          Boolean(
            candidate.maxRankProfile
          ) &&
          (
            !existing?.max_rank_updated_at ||
            existing.max_rank_updated_at <
              raidRankStaleBefore ||
            (
              Boolean(
                existing?.max_rankings_json
              ) &&
              !maxRankProfileJsonIsCurrent(
                existing.max_rankings_json
              )
            )
          );
        const priorityBucket =
          missingRecord
            ? 0
            : spriteCorrection
              ? 1
              : spriteBackfill
                ? 2
                : activeToday
                  ? 3
                  : (
                      raidRankRefresh ||
                      maxRankRefresh
                    )
                    ? 4
                    : 5;

        return {
          candidate,
          missingRecord,
          spriteBackfill,
          spriteCorrection,
          raidRankRefresh,
          maxRankRefresh,
          activeToday,
          priorityBucket,
          startDate
        };
      })
      .sort(
        (a, b) =>
          a.priorityBucket -
            b.priorityBucket ||
          a.startDate.localeCompare(
            b.startDate
          ) ||
          b.candidate.overall -
            a.candidate.overall ||
          a.candidate.displayName.localeCompare(
            b.candidate.displayName
          )
      );

  const candidates =
    rankedCandidates
      .slice(
        0,
        MAX_META_POKEMON_PER_SYNC
      )
      .map(
        item =>
          item.candidate
      );

  const selectedKeys =
    new Set(
      candidates.map(
        candidate =>
          normalizeName(
            candidate.displayName
          )
      )
    );

  const missingBeforeSync =
    rankedCandidates
      .filter(
        item =>
          item.missingRecord
      )
      .length;

  const spriteBackfillsSelected =
    rankedCandidates
      .filter(
        item =>
          item.spriteBackfill &&
          selectedKeys.has(
            normalizeName(
              item.candidate.displayName
            )
          )
      )
      .length;

  const spriteCorrectionsSelected =
    rankedCandidates
      .filter(
        item =>
          item.spriteCorrection &&
          selectedKeys.has(
            normalizeName(
              item.candidate.displayName
            )
          )
      )
      .length;

  const timestamp = nowIso();
  const statements = [];

  for (const candidate of candidates) {
    const verdict = automaticVerdict(
      candidate.pve,
      candidate.pvp,
      candidate.rarity,
      candidate.mega,
      candidate.kind
    );

    const notes = [
      `Automatically calculated by ${AUTO_META_METHOD_VERSION}.`,
      `PvE score is a relative raid-attacker proxy derived from current Pokémon GO base stats and best available move-cycle data from the public Pokémon GO API; it is not a matchup-specific simulator.`,
      candidate.pvp == null
        ? "PvP score not applied for this raid form."
        : "PvP score comes from PvPoke Master League overall rankings when a name match is available.",
      `Rarity/availability score uses Pokémon class plus the current raid-window duration.`,
      `Matched raid event: ${candidate.event.summary}`
    ].join("\n");

    statements.push(
      env.DB.prepare(`
        INSERT INTO pokemon_meta (
          pokemon_name, pve_score, pvp_score, rarity_score,
          mega_score, overall_score, verdict, notes,
          sprite_url, shiny_sprite_url, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(pokemon_name) DO UPDATE SET
          pve_score = excluded.pve_score,
          pvp_score = excluded.pvp_score,
          rarity_score = excluded.rarity_score,
          mega_score = excluded.mega_score,
          overall_score = excluded.overall_score,
          verdict = excluded.verdict,
          notes = excluded.notes,
          sprite_url = excluded.sprite_url,
          shiny_sprite_url = excluded.shiny_sprite_url,
          updated_at = excluded.updated_at
      `).bind(
        candidate.displayName,
        Math.round(candidate.pve * 10) / 10,
        candidate.pvp == null ? null : Math.round(candidate.pvp * 10) / 10,
        Math.round(candidate.rarity * 10) / 10,
        candidate.mega == null ? null : Math.round(candidate.mega * 10) / 10,
        Math.round(candidate.overall * 10) / 10,
        verdict,
        notes,
        candidate.sprite_url,
        candidate.shiny_sprite_url,
        timestamp
      )
    );

    const sourceId = await sha256Hex(
      `${normalizeName(candidate.displayName)}|automatic-meta-sources`
    );

    const sourceNote = [
      `Pokémon GO API: ${POGO_API_POKEDEX}`,
      candidate.pvp == null
        ? "PvPoke: not applied for this raid form."
        : `PvPoke Master League rankings: ${PVPOKE_MASTER_LEAGUE}`,
      `GO Calendar event source: ${candidate.event.source_url || "https://gocalendar.info/"}`,
      `Availability window: ${candidate.event.start_date || "?"} to ${candidate.event.end_date || "?"}.`
    ].join("\n");

    statements.push(
      env.DB.prepare(`
        INSERT INTO meta_sources (
          id, pokemon_name, source_name, source_url, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_url = excluded.source_url,
          note = excluded.note,
          updated_at = excluded.updated_at
      `).bind(
        sourceId,
        candidate.displayName,
        "Automatic meta sources",
        POGO_API_POKEDEX,
        sourceNote,
        timestamp
      )
    );

    if (candidate.raidRankProfile) {
      const rankSourceId =
        await sha256Hex(
          `${normalizeName(candidate.displayName)}|raid-attacker-rankings`
        );

      statements.push(
        env.DB.prepare(`
          INSERT INTO meta_sources (
            id, pokemon_name, source_name, source_url, note, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            source_url = excluded.source_url,
            note = excluded.note,
            updated_at = excluded.updated_at
        `).bind(
          rankSourceId,
          candidate.displayName,
          RAID_RANK_SOURCE_NAME,
          POGO_API_POKEDEX,
          JSON.stringify(
            candidate.raidRankProfile
          ),
          timestamp
        )
      );
    }

    if (candidate.maxRankProfile) {
      const maxRankSourceId =
        await sha256Hex(
          `${normalizeName(candidate.displayName)}|max-attacker-rankings`
        );

      statements.push(
        env.DB.prepare(`
          INSERT INTO meta_sources (
            id, pokemon_name, source_name, source_url, note, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            source_url = excluded.source_url,
            note = excluded.note,
            updated_at = excluded.updated_at
        `).bind(
          maxRankSourceId,
          candidate.displayName,
          MAX_RANK_SOURCE_NAME,
          POGO_API_POKEDEX,
          JSON.stringify(
            candidate.maxRankProfile
          ),
          timestamp
        )
      );
    }
  }

  const raidRankBackfillRows =
  (existingMetaRows || [])
    .filter(row =>
      !selectedKeys.has(
        normalizeName(
          row.pokemon_name
        )
      ) &&
      (
        !row.raid_rank_updated_at ||
        row.raid_rank_updated_at <
          raidRankStaleBefore ||
        (
          Boolean(
            row.raid_rankings_json
          ) &&
          !raidRankProfileJsonIsCurrent(
            row.raid_rankings_json
          )
        )
      )
    )
    .sort(
      (a, b) =>
        Number(
          Boolean(b.raid_rankings_json) &&
          !raidRankProfileJsonIsCurrent(
            b.raid_rankings_json
          )
        ) -
          Number(
            Boolean(a.raid_rankings_json) &&
            !raidRankProfileJsonIsCurrent(
              a.raid_rankings_json
            )
          ) ||
        String(
          a.raid_rank_updated_at || ""
        ).localeCompare(
          String(
            b.raid_rank_updated_at || ""
          )
        )
    )
    .slice(
      0,
      MAX_RAID_RANK_BACKFILLS_PER_SYNC
    );

  let raidRankBackfills = 0;

  for (const row of raidRankBackfillRows) {
    const profile =
      raidRankProfileForName(
        row.pokemon_name,
        raidRankCatalog
      );

    if (!profile) continue;

    const rankSourceId =
      await sha256Hex(
        `${normalizeName(row.pokemon_name)}|raid-attacker-rankings`
      );

    statements.push(
      env.DB.prepare(`
        INSERT INTO meta_sources (
          id, pokemon_name, source_name, source_url, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_url = excluded.source_url,
          note = excluded.note,
          updated_at = excluded.updated_at
      `).bind(
        rankSourceId,
        row.pokemon_name,
        RAID_RANK_SOURCE_NAME,
        POGO_API_POKEDEX,
        JSON.stringify(profile),
        timestamp
      )
    );

    raidRankBackfills += 1;
  }

  const maxRankBackfillRows =
    (existingMetaRows || [])
      .map(row => ({
        row,
        profile:
          maxRankProfileForName(
            maxRankCatalog,
            row.pokemon_name
          )
      }))
      .filter(item =>
        item.profile &&
        !selectedKeys.has(
          normalizeName(
            item.row.pokemon_name
          )
        ) &&
        (
          !item.row.max_rank_updated_at ||
          item.row.max_rank_updated_at <
            raidRankStaleBefore ||
          (
            Boolean(
              item.row.max_rankings_json
            ) &&
            !maxRankProfileJsonIsCurrent(
              item.row.max_rankings_json
            )
          )
        )
      )
      .sort((a, b) =>
        String(
          a.row.max_rank_updated_at || ""
        ).localeCompare(
          String(
            b.row.max_rank_updated_at || ""
          )
        ) ||
        a.row.pokemon_name.localeCompare(
          b.row.pokemon_name
        )
      )
      .slice(
        0,
        MAX_MAX_RANK_BACKFILLS_PER_SYNC
      );

  let maxRankBackfills = 0;

  for (const {
    row,
    profile
  } of maxRankBackfillRows) {
    const maxRankSourceId =
      await sha256Hex(
        `${normalizeName(row.pokemon_name)}|max-attacker-rankings`
      );

    statements.push(
      env.DB.prepare(`
        INSERT INTO meta_sources (
          id, pokemon_name, source_name, source_url, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_url = excluded.source_url,
          note = excluded.note,
          updated_at = excluded.updated_at
      `).bind(
        maxRankSourceId,
        row.pokemon_name,
        MAX_RANK_SOURCE_NAME,
        POGO_API_POKEDEX,
        JSON.stringify(profile),
        timestamp
      )
    );

    maxRankBackfills += 1;
  }

  for (
    let offset = 0;
    offset < statements.length;
    offset += 50
  ) {
    await env.DB.batch(
      statements.slice(
        offset,
        offset + 50
      )
    );
  }

  return {
    updated:
      candidates.length,
    raid_events_considered:
      raidEvents.length,
    pokedex_entries:
      pokedex.length,
    discovered_candidates:
      allCandidates.length,
    missing_before_sync:
      missingBeforeSync,
    sprite_backfills_selected:
      spriteBackfillsSelected,
    sprite_corrections_selected:
      spriteCorrectionsSelected,
    method:
      AUTO_META_METHOD_VERSION,
    raid_rank_method:
      RAID_RANK_METHOD_VERSION,
    raid_rank_backfills:
      raidRankBackfills,
    max_rank_method:
      MAX_RANK_METHOD_VERSION,
    max_rank_eligible_names:
      maxEligibleNames.length,
    max_rank_backfills:
      maxRankBackfills,
    write_statements:
      statements.length,
    truncated:
      allCandidates.length >
      MAX_META_POKEMON_PER_SYNC
        ? allCandidates.length -
          MAX_META_POKEMON_PER_SYNC
        : 0
  };
}

async function userByManageToken(env, token) {
  if (!token) return null;
  const hash = await sha256Hex(token);
  return env.DB.prepare(`SELECT * FROM users WHERE manage_hash = ?`)
    .bind(hash)
    .first();
}

async function userByFeedToken(env, token) {
  if (!token) return null;
  const hash = await sha256Hex(token);
  return env.DB.prepare(`SELECT * FROM users WHERE feed_hash = ?`)
    .bind(hash)
    .first();
}

function parseSources(row) {
  try {
    const parsed = JSON.parse(row.included_sources || "[]");
    return Array.isArray(parsed) ? parsed : DEFAULT_SOURCES;
  } catch {
    return DEFAULT_SOURCES;
  }
}


function publicBaseUrl(request, env) {
  const configured =
    String(
      env.PUBLIC_BASE_URL || ""
    )
      .trim()
      .replace(/\/+$/, "");

  if (
    configured &&
    /^https:\/\//i.test(configured)
  ) {
    return configured;
  }

  return new URL(request.url).origin;
}

async function createUser(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const id = crypto.randomUUID();
  const manageToken = randomToken(32);
  const feedToken = randomToken(32);
  const manageHash = await sha256Hex(manageToken);
  const feedHash = await sha256Hex(feedToken);
  const timestamp = nowIso();

  const timezone = String(body.timezone || "Asia/Singapore").slice(0, 80);
  const included = Array.isArray(body.included_sources)
    ? body.included_sources.filter((x) => SOURCES[x])
    : DEFAULT_SOURCES;

  await env.DB.prepare(`
    INSERT INTO users (
      id, manage_hash, feed_hash, timezone, included_sources,
      pve_weight, pvp_weight, collector_weight,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 1.0, 0.0, 0.4, ?, ?)
  `).bind(
    id,
    manageHash,
    feedHash,
    timezone,
    JSON.stringify(included),
    timestamp,
    timestamp
  ).run();

  const baseUrl =
    publicBaseUrl(
      request,
      env
    );

  let calendarUrl =
    `${baseUrl}/calendar/${feedToken}.ics`;

  let subscription_format =
    "legacy";

  if (env.FEED_LINK_KEY) {
    const signature =
      await recoverableFeedSignature(
        env,
        id
      );

    calendarUrl =
      `${baseUrl}/calendar/recover/${id}.${signature}.ics`;

    subscription_format =
      "signed";
  }

  return json({
    ok: true,
    management_url:
      `${baseUrl}/manage/${manageToken}`,
    calendar_url:
      calendarUrl,
    subscription_format,
    manage_token:
      manageToken,
    note:
      "Save the management URL. The calendar URL is a private read-only subscription link."
  });
}

async function getTargets(env, userId) {
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM targets
    WHERE user_id = ?
    ORDER BY
      CASE priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        WHEN 'skip' THEN 4
        ELSE 5
      END,
      pokemon_name
  `).bind(userId).all();

  return results;
}

async function getMeta(env) {
  const { results } = await env.DB.prepare(`
    SELECT
      pm.*,
      (
        SELECT ms.note
        FROM meta_sources ms
        WHERE ms.pokemon_name = pm.pokemon_name
          AND ms.source_name = ?
        ORDER BY ms.updated_at DESC
        LIMIT 1
      ) AS raid_rankings_json,
      (
        SELECT ms.note
        FROM meta_sources ms
        WHERE ms.pokemon_name = pm.pokemon_name
          AND ms.source_name = ?
        ORDER BY ms.updated_at DESC
        LIMIT 1
      ) AS max_rankings_json
    FROM pokemon_meta pm
    ORDER BY pm.pokemon_name
  `).bind(
    RAID_RANK_SOURCE_NAME,
    MAX_RANK_SOURCE_NAME
  ).all();
  return (results || []).map(row => ({
    ...row,
    raid_rankings_json:
      currentRaidRankingsJson(
        row.raid_rankings_json
      ),
    max_rankings_json:
      currentMaxRankingsJson(
        row.max_rankings_json
      )
  }));
}

export function findMatches(summary, targets, metas, event = null, pokedex = []) {
  const haystack = normalizeName(summary);
  const candidates = [];

  for (const meta of metas) {
    const needle = normalizeName(meta.pokemon_name);
    if (needle && haystack.includes(needle)) {
      candidates.push({ name: meta.pokemon_name, meta, target: null, length: needle.length });
    }
  }

  for (const target of targets) {
    const targetName = targetBattleKind(target) === 'raid' ? target.pokemon_name : globalThis.BattleTargets.formName(target.pokemon_name, targetBattleKind(target));
    const needle = normalizeName(targetName);
    if (!needle || !haystack.includes(needle)) continue;

    const existing = candidates.find(
      (candidate) => normalizeName(candidate.name) === needle
    );

    if (existing) {
      existing.target = target;
    } else {
      candidates.push({
        name: targetName,
        meta: null,
        target,
        length: needle.length
      });
    }
  }

  // Battle availability is authoritative even before automatic meta backfill.
  // Resolve bosses from the current Pokédex so a newly scheduled Max Pokémon
  // cannot disappear merely because pokemon_meta has not caught up yet.
  for (const match of findPokemonMatchesInSummary(summary, pokedex)) {
    const maxVariant = event
      ? maxBattleVariantForEvent(event, match.name)
      : null;

    const displayName = displayNameForMatch(
      match.name,
      maxVariant === "gigantamax" ? "gigantamax" : "normal",
      summary,
      match.pokemon
    );

    const needle = normalizeName(displayName);
    if (!needle) continue;

    const existing = candidates.find(candidate =>
      normalizeName(candidate.name) === needle
    );

    if (existing) continue;

    const exactMeta = metas.find(meta =>
      normalizeName(meta.pokemon_name) === needle
    ) || null;

    candidates.push({
      name: displayName,
      meta: exactMeta,
      target: null,
      length: needle.length
    });
  }

  candidates.sort(
    (a, b) =>
      b.length - a.length
  );

  const selected = [];

  for (const candidate of candidates) {
    const needle =
      normalizeName(
        candidate.name
      );

    const moreSpecific =
      selected.find(
        existing => {
          const existingNeedle =
            normalizeName(
              existing.name
            );

          return (
            existingNeedle !== needle &&
            existingNeedle.includes(
              needle
            )
          );
        }
      );

    if (moreSpecific) {
      if (
        !moreSpecific.target &&
        candidate.target
      ) {
        moreSpecific.target =
          candidate.target;
      }

      continue;
    }

    selected.push(
      candidate
    );
  }

  // Select by exact form AND battle context after event identity is known.
  // Never transfer a base-form target to a more specific form just by substring.
  return selected.map(candidate => ({...candidate, target: matchingBattleTargets(targets, {
    pokemon_name:candidate.name,
    ...(event ? battleOpportunityMetadata(event,{pokemonName:candidate.name}) : {battle_system:'raid'})
  })[0] || null}));
}

function weightedInternetScore(meta, user) {
  if (!meta) {
    return { score: 50, rated: false, explanation: "No curated internet assessment yet." };
  }

  const pve = meta.pve_score == null ? null : Number(meta.pve_score);
  const pvp = meta.pvp_score == null ? null : Number(meta.pvp_score);
  const rarity = meta.rarity_score == null ? null : Number(meta.rarity_score);
  const mega = meta.mega_score == null ? null : Number(meta.mega_score);
  const overall = meta.overall_score == null ? null : Number(meta.overall_score);

  const components = [];

  if (pve != null) {
    components.push({ value: pve, weight: Math.max(0, Number(user.pve_weight || 0)) });
  }
  if (pvp != null) {
    components.push({ value: pvp, weight: Math.max(0, Number(user.pvp_weight || 0)) });
  }
  if (rarity != null) {
    components.push({
      value: rarity,
      weight: Math.max(0, Number(user.collector_weight || 0))
    });
  }
  if (mega != null) {
    components.push({
      value: mega,
      weight: Math.max(0, Number(user.pve_weight || 0)) * 0.4
    });
  }

  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);

  let score;
  if (totalWeight > 0) {
    score =
      components.reduce((sum, item) => sum + item.value * item.weight, 0) /
      totalWeight;
  } else if (overall != null) {
    score = overall;
  } else {
    score = 50;
  }

  return {
    score: clamp(score, 0, 100),
    rated: true,
    explanation: meta.verdict || "Internet/meta assessment available."
  };
}

function recommendationFor(name, meta, target, user) {
  const internet = weightedInternetScore(meta, user);
  let bonus = 0;
  const reasons = [];

  if (internet.rated) {
    if (meta?.pve_score != null) reasons.push(`PvE score: ${Number(meta.pve_score).toFixed(0)}/100`);
    if (meta?.pvp_score != null && Number(user.pvp_weight || 0) > 0) {
      reasons.push(`PvP score: ${Number(meta.pvp_score).toFixed(0)}/100`);
    }
    if (meta?.rarity_score != null) {
      reasons.push(`Rarity/availability: ${Number(meta.rarity_score).toFixed(0)}/100`);
    }
  } else {
    reasons.push("No curated internet value score has been added yet.");
  }

  if (target) {
    const priority = String(target.priority || "medium").toLowerCase();
    const priorityBonus = { high: 15, medium: 8, low: 2, skip: -35 }[priority] ?? 5;
    bonus += priorityBonus;
    reasons.push(`Your priority: ${priority.toUpperCase()}`);

    if (Number(target.completed)) {
      bonus -= 25;
      reasons.push("Your target is marked complete.");
    } else if (
      target.target_value != null &&
      Number(target.target_value) > 0
    ) {
      const targetValue = Number(target.target_value);
      const currentValue = Number(target.current_value || 0);
      const remainingRatio = clamp((targetValue - currentValue) / targetValue, 0, 1);
      bonus += remainingRatio * 15;
      reasons.push(
        `Progress: ${currentValue.toLocaleString()} / ${targetValue.toLocaleString()}`
      );
    }
  } else {
    reasons.push("You have not set a personal target for this Pokémon.");
  }

  const finalScore = clamp(internet.score * 0.72 + 14 + bonus, 0, 100);

  let label;
  let emoji;
  if (finalScore >= 85) {
    label = "MUST RAID";
    emoji = "🔥";
  } else if (finalScore >= 70) {
    label = "HIGH PRIORITY";
    emoji = "⭐⭐⭐";
  } else if (finalScore >= 50) {
    label = "RECOMMENDED";
    emoji = "⭐⭐";
  } else if (finalScore >= 30) {
    label = "OPTIONAL";
    emoji = "⭐";
  } else {
    label = "SKIP";
    emoji = "⛔";
  }

  return {
    pokemon_name: name,
    score: Math.round(finalScore),
    label,
    emoji,
    reasons,
    sprite_url:
      meta?.sprite_url || null,
    shiny_sprite_url:
      meta?.shiny_sprite_url || null,
    meta,
    target
  };
}

function withPlanningPriority(
  recommendation
) {
  const recommendationScore =
    Math.round(
      Number(
        recommendation
          ?.recommendation_score ??
        recommendation?.score ??
        0
      )
    );

  const priority =
    planningPriorityForRecommendation({
      ...recommendation,
      recommendation_score:
        recommendationScore
    });

  return {
    ...recommendation,
    recommendation_score:
      recommendationScore,
    score:
      priority.score,
    label:
      priority.label,
    emoji:
      priority.emoji,
    planning_score:
      priority.score,
    planning_label:
      priority.label,
    planning_emoji:
      priority.emoji,
    score_basis:
      priority.basis,
    planning_method_version:
      priority.method_version,
    max_performance_ranked:
      priority.max_performance_ranked,
    planning_components:
      priority.components,
    planning_note:
      priority.note,
    planning_rationale:
      priority.rationale
  };
}


export async function recommendationsForDate(
  env,
  user,
  targets,
  metas,
  day,
  pokedex = null
) {
  const battlePokedex = Array.isArray(pokedex)
    ? pokedex
    : await currentBattleMatchPokedex();

  const placeholders = [...RAID_SOURCE_TYPES].map(() => "?").join(",");

  const { results: events } = await env.DB.prepare(`
    SELECT *
    FROM events
    WHERE status = 'active'
      AND source_type IN (${placeholders})
      AND COALESCE(start_date, '0000-01-01') <= ?
      AND COALESCE(end_date, start_date, '9999-12-31') >= ?
    ORDER BY
      CASE
        WHEN source_uid LIKE 'official-supplement:%' THEN 0
        ELSE 1
      END,
      start_date,
      summary
    LIMIT 250
  `).bind(...RAID_SOURCE_TYPES, day, day).all();

  const rules =
    await eventSuppressionRules(
      env,
      day,
      day
    );

  const map = new Map();

  for (const event of events) {
    const effectiveEndDate = event.dtend_line
      ? inclusiveEndDateFromPropertyLine(event.dtend_line, event.start_date)
      : (event.end_date || event.start_date);

    if (effectiveEndDate && effectiveEndDate < day) {
      continue;
    }

    if (
      eventIsSuppressedByRules(
        event,
        rules
      )
    ) {
      continue;
    }

    const matches =
      findMatches(
        event.summary,
        targets,
        metas,
        event,
        battlePokedex
      );

    for (const match of matches) {
      const rec =
        recommendationFor(
          match.name,
          match.meta,
          match.target,
          user
        );

      // Battle identity must be known before the canonical planning priority
      // is calculated because Max opportunities use a Max-specific value method.
      const remoteEligible =
        REMOTE_RAID_SOURCE_TYPES.has(
          event.source_type
        );

      const battleMetadata =
        battleOpportunityMetadata(
          event,
          {
            pokemonName: match.name,
            remoteEligible
          }
        );

      const battlePresentation =
        battleOpportunityPresentation(
          battleMetadata
        );

      const officialSource =
        isOfficialSupplementEvent(event);

      const sourceKind =
        officialSource
          ? "official"
          : event.source_type === MAX_ROTATION_SOURCE_TYPE
            ? "derived"
            : "calendar";

      const eventOtherLines =
        event.other_lines || "";

      const officialMaxCostEvidence =
        /(?:^|\n)X-POGO-MAX-EVIDENCE:official(?:\n|$)/i.test(
          eventOtherLines
        );

      const maxCostEvidenceUrl =
        eventOtherLines.match(
          /(?:^|\n)X-POGO-MAX-EVIDENCE-URL:([^\n]+)/i
        )?.[1]?.trim() ||
        (
          officialSource
            ? event.source_url || null
            : null
        );

      const maxParticleCost =
        inferMaxParticleCost({
          ...battleMetadata,
          pokemon_name:
            match.name,
          source_kind:
            sourceKind,
          source_uid:
            event.source_uid || null,
          source_url:
            event.source_url || null,
          max_particle_cost_official:
            officialSource ||
            officialMaxCostEvidence,
          event_title:
            event.summary,
          event_description:
            event.description || "",
          event_other_lines:
            eventOtherLines
        });

      const key = [
        battleMetadata?.battle_system || "raid",
        battleMetadata?.battle_variant || "",
        normalizeName(match.name)
      ].join("|");

      const existing = map.get(key);

      const occurrence =
        withPlanningPriority({
        ...rec,
        ...battleMetadata,
        battle_presentation:
          battlePresentation,
        max_particle_cost:
          maxParticleCost.cost,
        max_particle_cost_source:
          maxParticleCost.basis,
        max_particle_cost_confidence: maxParticleCost.confidence,
        max_battle_tier:
          maxParticleCost.tier,
        max_battle_tier_source:
          maxParticleCost.tier_source,
        max_particle_cost_evidence_source:
          maxParticleCost.evidence_source,
        max_particle_cost_evidence_url:
          maxCostEvidenceUrl,
        logging_remote_eligible: battleMetadata?.battle_system === "max"
          ? maxBattleRemotePassEligible({ ...battleMetadata, event_description: event.description, event_title: event.summary })
          : remoteEligible && !/(?:local|in[- ]person)[ -]?only|cannot be joined remotely/i.test(event.description || ""),
        event_description:
          event.description || "",
        sprite_exact_form:
          battleMetadata?.battle_variant === "gigantamax"
            ? maxBattleVariantFromText(match.name) === "gigantamax"
            : true,
        event_title: event.summary,
        source_type: event.source_type,
        source_url: event.source_url || null,
        source_kind:
          sourceKind,
        source_label:
          officialSource
            ? "Official Pokémon GO"
            : event.source_type === MAX_ROTATION_SOURCE_TYPE
              ? "Weekly Max rotation"
              : "GO Calendar",
        start_date: event.start_date,
        end_date: event.end_date,
        remote_eligible: remoteEligible
      });

      if (!existing) {
        map.set(key, occurrence);
        continue;
      }

      existing.remote_eligible =
        Boolean(
          existing.remote_eligible ||
          remoteEligible
        );

      if (occurrence.score > existing.score) {
        map.set(
          key,
          {
            ...occurrence,
            remote_eligible:
              Boolean(
                existing.remote_eligible ||
                remoteEligible
              )
          }
        );
      }
    }
  }

  return [...map.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.pokemon_name.localeCompare(
          b.pokemon_name
        )
    );
}

async function currentRecommendations(
  env,
  user,
  targets,
  metas
) {
  const day =
    localDateForTimezone(
      user.timezone
    );

  return recommendationsForDate(
    env,
    user,
    targets,
    metas,
    day
  );
}


const MONTH_INDEX = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function htmlToPlainText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|section|article|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function officialEventLinksFromHtml(html, baseUrl) {
  const maxBattleLinks = [];
  const otherLinks = [];

  const hrefRegex = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(String(html || "")))) {
    try {
      const url = new URL(match[1], baseUrl);

      if (!["pokemongo.com", "www.pokemongo.com", "pokemongolive.com", "www.pokemongolive.com"].includes(url.hostname)) {
        continue;
      }

      const path = url.pathname.toLowerCase();

      // Favor event/news detail pages; avoid account/store/legal/navigation pages.
      const looksRelevant =
        path.startsWith("/post/") ||
        path.startsWith("/news/") ||
        path.startsWith("/gofest/") ||
        path.includes("/events/") ||
        path.includes("/event/");

      if (!looksRelevant) continue;

      url.hash = "";
      url.search = "";

      const normalizedUrl =
        url.toString().replace(/\/$/, "");

      if (
        /(?:max[-_]?battle|gigantamax|dynamax)/i.test(
          path
        )
      ) {
        maxBattleLinks.push(
          normalizedUrl
        );
      } else {
        otherLinks.push(
          normalizedUrl
        );
      }
    } catch {}
  }

  // Max-event articles often carry the only official difficulty evidence
  // needed to derive a safe standard MP entry cost. Prioritize them without
  // increasing the number of official pages fetched per sync.
  return [
    ...new Set([
      ...PINNED_OFFICIAL_EVENT_PAGES,
      ...maxBattleLinks,
      ...otherLinks
    ])
  ].slice(
    0,
    MAX_OFFICIAL_EVENT_PAGES_PER_SYNC
  );
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateTokensFromText(value) {
  const monthPattern =
    "(January|February|March|April|May|June|July|August|September|October|November|December)";

  const regex = new RegExp(
    `(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\\s*,?\\s*${monthPattern}\\s+(\\d{1,2})(?:\\s*,\\s*(\\d{4}))?`,
    "gi"
  );

  const tokens = [];
  let match;

  while ((match = regex.exec(String(value || "")))) {
    tokens.push({
      month: MONTH_INDEX[String(match[1]).toLowerCase()],
      day: Number(match[2]),
      year: match[3] ? Number(match[3]) : null,
      index: match.index,
      raw: match[0]
    });
  }

  return tokens;
}

function inferDateRangeFromText(value) {
  const tokens = dateTokensFromText(value);
  if (tokens.length < 2) return null;

  const first = { ...tokens[0] };
  const second = { ...tokens[1] };

  if (!second.year && first.year) second.year = first.year;
  if (!first.year && second.year) first.year = second.year;

  const currentYear = new Date().getUTCFullYear();
  if (!first.year && !second.year) {
    first.year = currentYear;
    second.year = currentYear;
  }

  // Handle a Dec -> Jan range where only one year was stated.
  if (first.year === second.year && first.month > second.month) {
    second.year += 1;
  }

  return {
    start_date: isoDate(first.year, first.month, first.day),
    end_date: isoDate(second.year, second.month, second.day)
  };
}

function maxBattleOfficialDateRangeFromText(
  value
) {
  const fullText =
    String(value || "");

  const eventIndex =
    fullText.search(
      /(?:Gigantamax|Dynamax|Max)\b[^\n]{0,100}?Max Battle(?:s| Day| Weekend)?/i
    );

  const window =
    eventIndex >= 0
      ? fullText.slice(
          Math.max(0, eventIndex - 240),
          eventIndex + 1400
        )
      : fullText.slice(0, 1400);

  const tokens =
    dateTokensFromText(
      window
    );

  if (!tokens.length) {
    return null;
  }

  const first =
    tokens[0];

  const fallbackYear =
    first.year ||
    Number(
      window.match(
        /\b(20\d{2})\b/
      )?.[1]
    ) ||
    new Date().getUTCFullYear();

  const firstDate =
    isoDate(
      first.year || fallbackYear,
      first.month,
      first.day
    );

  if (tokens.length > 1) {
    const second =
      tokens[1];

    const secondDate =
      isoDate(
        second.year || fallbackYear,
        second.month,
        second.day
      );

    const firstMs =
      Date.parse(
        `${firstDate}T00:00:00Z`
      );

    const secondMs =
      Date.parse(
        `${secondDate}T00:00:00Z`
      );

    const gapDays =
      (
        secondMs -
        firstMs
      ) / 86400000;

    if (
      Number.isFinite(gapDays) &&
      gapDays >= 0 &&
      gapDays <= 4
    ) {
      return {
        start_date:
          firstDate,
        end_date:
          secondDate
      };
    }
  }

  return {
    start_date:
      firstDate,
    end_date:
      firstDate
  };
}

function cleanOfficialMaxPokemonLine(
  value
) {
  const line =
    String(value || "")
      .replace(
        /[＊*†‡]+$/g,
        ""
      )
      .trim();

  if (
    !line ||
    line.length > 64 ||
    /^(?:Featured Pokémon|Event Bonuses|Timed Research|Where can I find|Max out|Event Ticket|Pokémon GO Web Store|Learn More)$/i.test(
      line
    ) ||
    /\b(?:will|can|during|from|until|bonus|research|ticket|battle day|max battles? are|trainers?)\b/i.test(
      line
    ) ||
    /[.!?]$/.test(
      line
    )
  ) {
    return null;
  }

  if (
    /^(?:Gigantamax|Dynamax)\s+[A-Za-z0-9À-ž.'’()\- ]+$/u.test(
      line
    )
  ) {
    return line;
  }

  if (
    /^[A-ZÀ-Þ][A-Za-zÀ-ž0-9.'’()\-]*(?:\s+[A-ZÀ-Þ][A-Za-zÀ-ž0-9.'’()\-]*){0,4}$/u.test(
      line
    )
  ) {
    return line;
  }

  return null;
}

export function officialMaxBattleSupplementsFromText(
  text,
  sourceUrl
) {
  const fullText =
    String(text || "");

  const range =
    maxBattleOfficialDateRangeFromText(
      fullText
    );

  if (!range) {
    return [];
  }

  const lines =
    fullText
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

  const evidenceByName =
    new Map();

  const addEvidence =
    (
      value,
      evidence,
      excerpt
    ) => {
      const cleaned =
        cleanOfficialMaxPokemonLine(
          value
        );

      if (
        !cleaned ||
        !evidence?.cost
      ) {
        return;
      }

      const key =
        normalizeName(
          cleaned
        );

      if (
        !key ||
        evidenceByName.has(
          key
        )
      ) {
        return;
      }

      evidenceByName.set(
        key,
        {
          pokemon_name:
            cleaned,
          start_date:
            range.start_date,
          end_date:
            range.end_date,
          max_battle_tier:
            evidence.tier,
          max_particle_cost:
            evidence.cost,
          max_particle_cost_source:
            evidence.basis,
          max_particle_cost_confidence:
            evidence.confidence,
          source_url:
            sourceUrl,
          source_excerpt:
            excerpt || null
        }
      );
    };

  const tierGroups = [];

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const line =
      lines[index];

    if (
      !/\bMax Battles?\b/i.test(
        line
      )
    ) {
      continue;
    }

    const tier =
      maxBattleTierFromText(
        line
      );

    if (!tier) {
      continue;
    }

    const evidence =
      inferMaxParticleCost({
        battle_system:
          "max",
        source_kind:
          "official",
        event_description:
          line
      });

    if (!evidence.cost) {
      continue;
    }

    tierGroups.push({
      index,
      evidence
    });

    const excerpt =
      lines
        .slice(
          Math.max(0, index - 1),
          Math.min(
            lines.length,
            index + 7
          )
        )
        .join(" ");

    for (
      let lookahead = index + 1;
      lookahead <
        Math.min(
          lines.length,
          index + 12
        );
      lookahead++
    ) {
      const candidateLine =
        lines[lookahead];

      if (
        /\b(?:one|two|three|four|five|six|[1-6])\s*-?\s*star\s+Max Battles?\b/i.test(
          candidateLine
        ) ||
        /^(?:Event Bonuses|Timed Research|Where can I find|Max out|Event Ticket|Pokémon GO Web Store|Bonuses|Research)$/i.test(
          candidateLine
        )
      ) {
        break;
      }

      addEvidence(
        candidateLine,
        evidence,
        excerpt
      );
    }
  }

  // Some official articles state a battle entry cost directly without a
  // difficulty heading. In that case, attach the official explicit cost only
  // to a Pokémon named in the Max Battle Day title.
  const articleEvidence =
    inferMaxParticleCost({
      battle_system:
        "max",
      source_kind:
        "official",
      event_description:
        fullText
    });

  if (
    !evidenceByName.size &&
    articleEvidence.basis ===
      "official_explicit_cost"
  ) {
    for (
      const line of
      lines.slice(0, 20)
    ) {
      const titleMatch =
        line.match(
          /^((?:Gigantamax|Dynamax)\s+.+?)\s+Max Battle Day\b/i
        );

      if (titleMatch) {
        addEvidence(
          titleMatch[1],
          articleEvidence,
          line
        );
      }
    }
  }

  // If a single verified tier is present but the article layout did not place
  // the Pokémon immediately after its tier heading, a form-specific Max Battle
  // Day title can still bind that one tier to that one named opportunity.
  if (
    !evidenceByName.size &&
    tierGroups.length === 1
  ) {
    for (
      const line of
      lines.slice(0, 20)
    ) {
      const titleMatch =
        line.match(
          /^((?:Gigantamax|Dynamax)\s+.+?)\s+Max Battle Day\b/i
        );

      if (titleMatch) {
        addEvidence(
          titleMatch[1],
          tierGroups[0]
            .evidence,
          lines
            .slice(
              tierGroups[0].index,
              Math.min(
                lines.length,
                tierGroups[0].index + 6
              )
            )
            .join(" ")
        );
      }
    }
  }

  return [
    ...evidenceByName.values()
  ];
}

function nearbyDateWindow(text, startIndex, maxLength = 320) {
  return String(text || "").slice(startIndex, startIndex + maxLength);
}

function remoteRaidRulesFromOfficialText(text, sourceUrl) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const rules = [];

  // Numeric increases, e.g.
  // "The Remote Raid Pass limit will be increased to 30 from Monday..."
  const numericRegex =
    /(?:Remote Raid(?: Pass)? limit|Remote Raid Pass limit)[^.]{0,120}?(?:increased|raised|set)[^.]{0,60}?(?:to|at)\s+(\d{1,3})/gi;

  let match;
  while ((match = numericRegex.exec(normalized))) {
    const limit = Number(match[1]);
    if (!Number.isFinite(limit) || limit < 1 || limit > 500) continue;

    const window = nearbyDateWindow(normalized, match.index, 420);
    const range = inferDateRangeFromText(window);
    if (!range) continue;

    rules.push({
      event_name: `Official temporary Remote Raid limit: ${limit}`,
      start_date: range.start_date,
      end_date: range.end_date,
      remote_raid_limit: limit,
      is_unlimited: 0,
      source_url: sourceUrl,
      source_excerpt: window.slice(0, 500)
    });
  }

  // Unlimited periods, e.g.
  // "There will be no limit on Remote Raids from Saturday..."
  const unlimitedRegex =
    /(?:there\s+(?:will|would)\s+be\s+no\s+limit\s+on\s+Remote Raids|no\s+limit\s+on\s+Remote Raids|Remote Raid(?: Pass)? limit[^.]{0,80}?(?:removed|unlimited))/gi;

  while ((match = unlimitedRegex.exec(normalized))) {
    const window = nearbyDateWindow(normalized, match.index, 420);
    const range = inferDateRangeFromText(window);
    if (!range) continue;

    rules.push({
      event_name: "Official temporary Remote Raid limit: Unlimited",
      start_date: range.start_date,
      end_date: range.end_date,
      remote_raid_limit: 0,
      is_unlimited: 1,
      source_url: sourceUrl,
      source_excerpt: window.slice(0, 500)
    });
  }

  // Deduplicate identical rules from repeated page text.
  const dedupe = new Map();
  for (const rule of rules) {
    const key = [
      rule.start_date,
      rule.end_date,
      rule.remote_raid_limit,
      rule.is_unlimited
    ].join("|");
    if (!dedupe.has(key)) dedupe.set(key, rule);
  }

  return [...dedupe.values()];
}


function addDaysIso(dateValue, days) {
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]) + Number(days || 0)
    )
  );

  return date.toISOString().slice(0, 10);
}

function compactIcsDate(dateValue) {
  return String(dateValue || "").replace(/-/g, "");
}

function officialRaidDateFromLine(line, defaultYear) {
  const monthPattern =
    "(January|February|March|April|May|June|July|August|September|October|November|December)";

  const regex = new RegExp(
    `^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\s*,?\\s*${monthPattern}\\s+(\\d{1,2})(?:\\s*,\\s*(\\d{4}))?$`,
    "i"
  );

  const match = String(line || "").trim().match(regex);
  if (!match) return null;

  const month = MONTH_INDEX[String(match[1]).toLowerCase()];
  const day = Number(match[2]);
  const year = match[3] ? Number(match[3]) : Number(defaultYear);

  if (!month || !day || !year) return null;
  return isoDate(year, month, day);
}

function looksLikeMegaPokemonLine(line) {
  const value = String(line || "").trim();

  if (!/^Mega\s+/i.test(value)) return false;
  if (value.length > 48) return false;
  if (/Mega\s+(Raids?|Ascension|Evolution|Finale|Energy)/i.test(value)) {
    return false;
  }

  if (
    /\b(?:will|may|during|throughout|event|appear|following|majority)\b/i.test(
      value
    )
  ) {
    return false;
  }

  return /^Mega\s+[A-Za-z0-9À-ž.'’\- ]+(?:\s[XY])?$/u.test(value);
}

function megaAscensionRaidSupplementsFromOfficialText(text, sourceUrl) {
  const fullText = String(text || "");
  const lines = fullText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const introIndex = lines.findIndex((line) =>
    /following Mega-Evolved Pokémon will appear in raids during the Mega Ascension event/i.test(
      line
    )
  );

  if (introIndex < 0) return [];

  let endIndex = lines.findIndex(
    (line, index) =>
      index > introIndex &&
      /^Wild Encounters$/i.test(line)
  );

  if (endIndex < 0) {
    endIndex = Math.min(lines.length, introIndex + 90);
  }

  const yearMatch =
    fullText.match(
      /Mega Ascension[\s\S]{0,500}?September\s+\d{1,2}\s*,\s*(\d{4})/i
    ) ||
    fullText.match(/\b(20\d{2})\b/);

  const defaultYear = yearMatch
    ? Number(yearMatch[1])
    : new Date().getUTCFullYear();

  const eventRangeWindow = fullText.slice(
    Math.max(0, fullText.toLowerCase().indexOf("mega ascension")),
    Math.max(0, fullText.toLowerCase().indexOf("mega ascension")) + 900
  );

  const eventRange =
    inferDateRangeFromText(eventRangeWindow) ||
    {
      start_date: `${defaultYear}-08-31`,
      end_date: `${defaultYear}-09-04`
    };

  const supplements = [];
  let currentDate = null;

  for (let index = introIndex + 1; index < endIndex; index++) {
    const line = lines[index];

    const parsedDate = officialRaidDateFromLine(line, defaultYear);
    if (parsedDate) {
      currentDate = parsedDate;
      continue;
    }

    if (currentDate && looksLikeMegaPokemonLine(line)) {
      supplements.push({
        event_name: "Mega Ascension",
        pokemon_name: line,
        start_date: currentDate,
        end_date: currentDate,
        certainty: "featured",
        source_url: sourceUrl
      });
    }

    if (
      /Mega Latias and Mega Latios may also appear in Mega Raids throughout the Mega Ascension event/i.test(
        line
      )
    ) {
      for (const pokemonName of ["Mega Latias", "Mega Latios"]) {
        supplements.push({
          event_name: "Mega Ascension",
          pokemon_name: pokemonName,
          start_date: eventRange.start_date,
          end_date: eventRange.end_date,
          certainty: "possible",
          source_url: sourceUrl
        });
      }
    }
  }

  const dedupe = new Map();

  for (const item of supplements) {
    const key = [
      normalizeName(item.pokemon_name),
      item.start_date,
      item.end_date,
      item.certainty
    ].join("|");

    if (!dedupe.has(key)) dedupe.set(key, item);
  }

  return [...dedupe.values()];
}


function parseClockTimeTo24Hour(hourText, minuteText, meridiem) {
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);
  const suffix = String(meridiem || "").toLowerCase();

  if (suffix.startsWith("p") && hour !== 12) hour += 12;
  if (suffix.startsWith("a") && hour === 12) hour = 0;

  return {
    hour,
    minute,
    hhmmss:
      `${String(hour).padStart(2, "0")}` +
      `${String(minute).padStart(2, "0")}` +
      "00"
  };
}

function habitatTimeSlotsFromLine(line) {
  const value = String(line || "").trim();

  const regex =
    /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*(?:to|-)\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*and\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*(?:to|-)\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i;

  const match = value.match(regex);
  if (!match) return [];

  const firstStart = parseClockTimeTo24Hour(match[1], match[2], match[3]);
  const firstEnd = parseClockTimeTo24Hour(match[4], match[5], match[6]);
  const secondStart = parseClockTimeTo24Hour(match[7], match[8], match[9]);
  const secondEnd = parseClockTimeTo24Hour(match[10], match[11], match[12]);

  return [
    {
      start: firstStart.hhmmss,
      end: firstEnd.hhmmss
    },
    {
      start: secondStart.hhmmss,
      end: secondEnd.hhmmss
    }
  ];
}

function isHabitatTimeLine(line) {
  return habitatTimeSlotsFromLine(line).length === 2;
}

function megaFinaleRaidSupplementsFromOfficialText(text, sourceUrl) {
  const fullText = String(text || "");
  const lines = fullText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const yearMatch =
    fullText.match(
      /Mega Finale[\s\S]{0,400}?September\s+5\s+and\s+6\s*,\s*(20\d{2})/i
    ) ||
    fullText.match(/\b(20\d{2})\b/);

  const defaultYear =
    yearMatch
      ? Number(yearMatch[1])
      : new Date().getUTCFullYear();

  const finaleSectionIndex =
    lines.findIndex((line) =>
      /^Habitats and Raid Schedule$/i.test(line)
    );

  if (finaleSectionIndex < 0) {
    return {
      main_event: null,
      raid_events: []
    };
  }

  const saturdayIndex =
    lines.findIndex(
      (line, index) =>
        index > finaleSectionIndex &&
        /^Saturday,\s*September\s+5$/i.test(line)
    );

  const sundayIndex =
    lines.findIndex(
      (line, index) =>
        index > finaleSectionIndex &&
        /^Sunday,\s*September\s+6$/i.test(line)
    );

  if (saturdayIndex < 0 || sundayIndex < 0) {
    return {
      main_event: null,
      raid_events: []
    };
  }

  const endIndex =
    lines.findIndex(
      (line, index) =>
        index > sundayIndex &&
        /A special note to Trainers:/i.test(line)
    );

  const sectionEnd =
    endIndex > sundayIndex
      ? endIndex
      : Math.min(lines.length, sundayIndex + 180);

  const mainEvent = {
    kind: "main_event",
    event_name: "Pokémon GO Fest 2026: Mega Finale",
    summary: "Pokémon GO Fest 2026: Mega Finale",
    source_type: "event",
    start_date: isoDate(defaultYear, 9, 5),
    end_date: isoDate(defaultYear, 9, 6),
    source_url: sourceUrl,
    description:
      "Pokémon GO Fest 2026: Mega Finale runs from 10:00 a.m. to 6:00 p.m. local time on September 5 and 6, 2026. Rotating habitats and Mega Raid Bosses appear during event hours."
  };

  const raidEvents = [];

  const parseDay = ({
    dayStart,
    dayEnd,
    dateValue,
    superMegaBoss
  }) => {
    const beforeFirstTime = [];

    for (let index = dayStart + 1; index < dayEnd; index++) {
      const line = lines[index];

      if (isHabitatTimeLine(line)) break;

      if (
        !/^(?:Wild Encounters|Mega Raids|Super Mega Raids)$/i.test(line) &&
        !looksLikeMegaPokemonLine(line) &&
        line.length <= 40 &&
        !/^\[?Input\]?$/i.test(line)
      ) {
        beforeFirstTime.push(line);
      }
    }

    // The official page presents the four habitat names before the first
    // expanded habitat schedule. The final four concise labels are the habitats.
    const habitatNames = beforeFirstTime
      .filter((line) =>
        !/^Pokémon GO Fest/i.test(line) &&
        !/^Featured Pokémon$/i.test(line)
      )
      .slice(-4);

    const timeIndices = [];

    for (let index = dayStart + 1; index < dayEnd; index++) {
      if (isHabitatTimeLine(lines[index])) {
        timeIndices.push(index);
      }
    }

    for (
      let segmentIndex = 0;
      segmentIndex < Math.min(4, timeIndices.length);
      segmentIndex++
    ) {
      const startIndex = timeIndices[segmentIndex];
      const stopIndex =
        segmentIndex + 1 < timeIndices.length
          ? timeIndices[segmentIndex + 1]
          : dayEnd;

      const segmentLines =
        lines.slice(startIndex, stopIndex);

      const megaRaidsIndex =
        segmentLines.findIndex((line) =>
          /^Mega Raids$/i.test(line)
        );

      const superMegaIndex =
        segmentLines.findIndex((line) =>
          /^Super Mega Raids$/i.test(line)
        );

      if (megaRaidsIndex < 0) continue;

      const megaBosses = [];

      const bossStop =
        superMegaIndex > megaRaidsIndex
          ? superMegaIndex
          : segmentLines.length;

      for (
        let index = megaRaidsIndex + 1;
        index < bossStop;
        index++
      ) {
        const line = segmentLines[index];

        if (looksLikeMegaPokemonLine(line)) {
          megaBosses.push(line);
        }
      }

      const uniqueMegaBosses =
        [...new Set(megaBosses)];

      if (!uniqueMegaBosses.length) continue;

      const habitatName =
        habitatNames[segmentIndex] ||
        `Habitat ${segmentIndex + 1}`;

      const slots =
        habitatTimeSlotsFromLine(
          segmentLines[0]
        );

      for (const slot of slots) {
        raidEvents.push({
          kind: "habitat_raid_window",
          event_name: "Pokémon GO Fest 2026: Mega Finale",
          habitat_name: habitatName,
          date: dateValue,
          start_time: slot.start,
          end_time: slot.end,
          mega_bosses: uniqueMegaBosses,
          super_mega_boss: superMegaBoss,
          source_url: sourceUrl
        });
      }
    }
  };

  parseDay({
    dayStart: saturdayIndex,
    dayEnd: sundayIndex,
    dateValue: isoDate(defaultYear, 9, 5),
    superMegaBoss: "Mega Mewtwo X"
  });

  parseDay({
    dayStart: sundayIndex,
    dayEnd: sectionEnd,
    dateValue: isoDate(defaultYear, 9, 6),
    superMegaBoss: "Mega Mewtwo Y"
  });

  return {
    main_event: mainEvent,
    raid_events: raidEvents
  };
}

async function officialMegaFinaleSupplementStatements(
  env,
  finaleData,
  timestamp
) {
  const statements = [];

  if (!finaleData) return statements;

  if (finaleData.main_event) {
    const item = finaleData.main_event;
    const sourceUid = "official-supplement:mega-finale:main-event";
    const id = await sha256Hex(`event|${sourceUid}`);

    const eventObject = {
      source_uid: sourceUid,
      summary: item.summary,
      description: [
        item.description,
        `Official source: ${item.source_url}`
      ].join("\n"),
      dtstart_line:
        `DTSTART;VALUE=DATE:${compactIcsDate(item.start_date)}`,
      dtend_line:
        `DTEND;VALUE=DATE:${compactIcsDate(addDaysIso(item.end_date, 1))}`,
      other_lines: [
        `UID:${sourceUid}`,
        `URL:${item.source_url}`,
        "CATEGORIES:event",
        "X-POGO-SOURCE:official"
      ].join("\n"),
      start_date: item.start_date,
      end_date: item.end_date,
      source_url: item.source_url
    };

    const contentHash =
      await sha256Hex(
        JSON.stringify(eventObject)
      );

    statements.push(
      env.DB.prepare(`
        INSERT INTO events (
          id,
          source_type,
          source_uid,
          summary,
          description,
          dtstart_line,
          dtend_line,
          other_lines,
          start_date,
          end_date,
          source_url,
          content_hash,
          sequence,
          status,
          updated_at
        )
        VALUES (?, 'event', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)
        ON CONFLICT(id) DO UPDATE SET
          summary = excluded.summary,
          description = excluded.description,
          dtstart_line = excluded.dtstart_line,
          dtend_line = excluded.dtend_line,
          other_lines = excluded.other_lines,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          source_url = excluded.source_url,
          sequence = CASE
            WHEN events.content_hash != excluded.content_hash
              OR events.status != 'active'
            THEN events.sequence + 1
            ELSE events.sequence
          END,
          content_hash = excluded.content_hash,
          status = 'active',
          updated_at = excluded.updated_at
      `).bind(
        id,
        sourceUid,
        eventObject.summary,
        eventObject.description,
        eventObject.dtstart_line,
        eventObject.dtend_line,
        eventObject.other_lines,
        eventObject.start_date,
        eventObject.end_date,
        eventObject.source_url,
        contentHash,
        timestamp
      )
    );
  }

  for (const item of finaleData.raid_events || []) {
    const bossList =
      item.mega_bosses.join(", ");

    const sourceUid = [
      "official-supplement",
      "mega-finale",
      item.date,
      normalizeName(item.habitat_name).replace(/\s+/g, "-"),
      item.start_time
    ].join(":");

    const id =
      await sha256Hex(
        `raid_battles|${sourceUid}`
      );

    const summary =
      `${item.habitat_name} Mega Raids — ${bossList}` +
      ` + ${item.super_mega_boss}`;

    const description = [
      `Official Pokémon GO Fest 2026: Mega Finale habitat raid window.`,
      `Habitat: ${item.habitat_name}.`,
      `Mega Raids: ${bossList}.`,
      `${item.super_mega_boss} appears in Super Mega Raids at certain Gyms; at other Gyms, the habitat's Mega Raids appear.`,
      `Official source: ${item.source_url}`
    ].join("\n");

    const eventObject = {
      source_uid: sourceUid,
      summary,
      description,
      dtstart_line:
        `DTSTART:${compactIcsDate(item.date)}T${item.start_time}`,
      dtend_line:
        `DTEND:${compactIcsDate(item.date)}T${item.end_time}`,
      other_lines: [
        `UID:${sourceUid}`,
        `URL:${item.source_url}`,
        "CATEGORIES:raid_battles",
        "X-POGO-SOURCE:official",
        `X-POGO-HABITAT:${item.habitat_name}`
      ].join("\n"),
      start_date: item.date,
      end_date: item.date,
      source_url: item.source_url
    };

    const contentHash =
      await sha256Hex(
        JSON.stringify(eventObject)
      );

    statements.push(
      env.DB.prepare(`
        INSERT INTO events (
          id,
          source_type,
          source_uid,
          summary,
          description,
          dtstart_line,
          dtend_line,
          other_lines,
          start_date,
          end_date,
          source_url,
          content_hash,
          sequence,
          status,
          updated_at
        )
        VALUES (?, 'raid_battles', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)
        ON CONFLICT(id) DO UPDATE SET
          summary = excluded.summary,
          description = excluded.description,
          dtstart_line = excluded.dtstart_line,
          dtend_line = excluded.dtend_line,
          other_lines = excluded.other_lines,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          source_url = excluded.source_url,
          sequence = CASE
            WHEN events.content_hash != excluded.content_hash
              OR events.status != 'active'
            THEN events.sequence + 1
            ELSE events.sequence
          END,
          content_hash = excluded.content_hash,
          status = 'active',
          updated_at = excluded.updated_at
      `).bind(
        id,
        sourceUid,
        eventObject.summary,
        eventObject.description,
        eventObject.dtstart_line,
        eventObject.dtend_line,
        eventObject.other_lines,
        eventObject.start_date,
        eventObject.end_date,
        eventObject.source_url,
        contentHash,
        timestamp
      )
    );
  }

  return statements;
}


async function officialRaidSupplementStatements(env, supplements, timestamp) {
  const statements = [];

  // Only stale rows created by the official supplement importer.
  statements.push(
    env.DB.prepare(`
      UPDATE events
      SET status = 'stale',
          sequence = sequence + 1,
          updated_at = ?
      WHERE source_uid LIKE 'official-supplement:%'
        AND status = 'active'
        AND COALESCE(end_date, start_date, '9999-12-31') >= date('now', '-1 day')
    `).bind(timestamp)
  );

  for (const item of supplements) {
    const sourceUid = [
      "official-supplement",
      normalizeName(item.event_name).replace(/\s+/g, "-"),
      item.start_date,
      normalizeName(item.pokemon_name).replace(/\s+/g, "-"),
      item.certainty
    ].join(":");

    const id = await sha256Hex(`raid_battles|${sourceUid}`);

    const dateRange =
      item.start_date === item.end_date
        ? item.start_date
        : `${item.start_date} → ${item.end_date}`;

    const description = [
      `Official Pokémon GO raid schedule supplement for ${item.event_name}.`,
      item.certainty === "possible"
        ? `${item.pokemon_name} is listed by Pokémon GO as a possible Mega Raid appearance throughout the event; this is not guaranteed on every day.`
        : `${item.pokemon_name} is listed as a featured Mega Raid boss for ${dateRange}.`,
      `Official source: ${item.source_url}`
    ].join("\n");

    const summary =
      item.certainty === "possible"
        ? `${item.pokemon_name} — possible during ${item.event_name}`
        : `${item.pokemon_name} — ${item.event_name}`;

    const eventObject = {
      source_uid: sourceUid,
      summary,
      description,
      dtstart_line: `DTSTART;VALUE=DATE:${compactIcsDate(item.start_date)}`,
      dtend_line:
        `DTEND;VALUE=DATE:${compactIcsDate(addDaysIso(item.end_date, 1))}`,
      other_lines: [
        `UID:${sourceUid}`,
        `URL:${item.source_url}`,
        "CATEGORIES:raid_battles",
        "X-POGO-SOURCE:official"
      ].join("\n"),
      start_date: item.start_date,
      end_date: item.end_date,
      source_url: item.source_url
    };

    const contentHash = await sha256Hex(JSON.stringify(eventObject));

    statements.push(
      env.DB.prepare(`
        INSERT INTO events (
          id,
          source_type,
          source_uid,
          summary,
          description,
          dtstart_line,
          dtend_line,
          other_lines,
          start_date,
          end_date,
          source_url,
          content_hash,
          sequence,
          status,
          updated_at
        )
        VALUES (?, 'raid_battles', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)
        ON CONFLICT(id) DO UPDATE SET
          summary = excluded.summary,
          description = excluded.description,
          dtstart_line = excluded.dtstart_line,
          dtend_line = excluded.dtend_line,
          other_lines = excluded.other_lines,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          source_url = excluded.source_url,
          sequence = CASE
            WHEN events.content_hash != excluded.content_hash
              OR events.status != 'active'
            THEN events.sequence + 1
            ELSE events.sequence
          END,
          content_hash = excluded.content_hash,
          status = 'active',
          updated_at = excluded.updated_at
      `).bind(
        id,
        sourceUid,
        summary,
        description,
        eventObject.dtstart_line,
        eventObject.dtend_line,
        eventObject.other_lines,
        item.start_date,
        item.end_date,
        item.source_url,
        contentHash,
        timestamp
      )
    );
  }

  return statements;
}



function officialEventSuppressionRulesFromText(text, sourceUrl) {
  const fullText = String(text || "");
  const rules = [];

  const phraseIndex =
    fullText.search(
      /Seasonal Mega Raids,\s*Seasonal Five-Star Raids,\s*Seasonal Shadow Raids,\s*Seasonal Raid Hours,\s*and Seasonal Spotlight Hours will not take place/i
    );

  if (phraseIndex < 0) {
    return rules;
  }

  const window =
    fullText.slice(
      phraseIndex,
      phraseIndex + 760
    );

  const range =
    inferDateRangeFromText(window);

  if (!range) {
    return rules;
  }

  rules.push({
    event_name:
      "Mega Ascension + Mega Finale seasonal schedule suspension",

    start_date:
      range.start_date,

    end_date:
      range.end_date,

    suppressed_source_types: [
      "raid_battles",
      "raid_hour",
      "pokemon_spotlight_hour"
    ],

    note:
      "Hide normal seasonal Mega Raid, five-star Raid, Shadow Raid, Raid Hour, and Spotlight Hour schedule entries during the official replacement window. Official event supplements remain visible. Pokémon GO separately notes that seasonal Raid Bosses may still appear during Mega Ascension, so this suppresses scheduled calendar entries rather than claiming random seasonal appearances are impossible.",

    source_url:
      sourceUrl,

    source_excerpt:
      window.slice(0, 700)
  });

  return rules;
}

function armoredMewtwoSupplementsFromOfficialText(text, sourceUrl) {
  const fullText =
    String(text || "");

  if (
    !/Armored Mewtwo will appear in five-star raids on both Saturday and Sunday/i.test(
      fullText
    )
  ) {
    return [];
  }

  const headerIndex =
    fullText.search(
      /Pokémon GO Fest 2026:\s*Mega Finale/i
    );

  const headerWindow =
    headerIndex >= 0
      ? fullText.slice(
          headerIndex,
          headerIndex + 700
        )
      : fullText;

  const range =
    inferDateRangeFromText(
      headerWindow
    );

  if (!range) {
    return [];
  }

  const dates = [];
  let current = range.start_date;

  while (
    current &&
    current <= range.end_date &&
    dates.length < 7
  ) {
    dates.push(current);
    current =
      addDaysIso(
        current,
        1
      );
  }

  return dates.map((dateValue) => ({
    event_name:
      "Pokémon GO Fest 2026: Mega Finale",

    pokemon_name:
      "Armored Mewtwo",

    start_date:
      dateValue,

    end_date:
      dateValue,

    start_time:
      "100000",

    end_time:
      "180000",

    source_url:
      sourceUrl,

    note:
      "Armored Mewtwo will appear in five-star raids during Mega Finale event hours. Shiny Armored Mewtwo is not available for this event."
  }));
}

async function officialArmoredMewtwoStatements(
  env,
  supplements,
  timestamp
) {
  const statements = [];

  for (const item of supplements) {
    const sourceUid = [
      "official-supplement",
      "mega-finale",
      "armored-mewtwo",
      item.start_date
    ].join(":");

    const id =
      await sha256Hex(
        `raid_battles|${sourceUid}`
      );

    const summary =
      "Armored Mewtwo — Mega Finale Five-Star Raids";

    const description = [
      `Official Pokémon GO Fest 2026: Mega Finale five-star raid schedule.`,
      item.note,
      `Official source: ${item.source_url}`
    ].join("\n");

    const eventObject = {
      source_uid:
        sourceUid,

      summary,

      description,

      dtstart_line:
        `DTSTART:${compactIcsDate(item.start_date)}T${item.start_time}`,

      dtend_line:
        `DTEND:${compactIcsDate(item.end_date)}T${item.end_time}`,

      other_lines: [
        `UID:${sourceUid}`,
        `URL:${item.source_url}`,
        "CATEGORIES:raid_battles",
        "X-POGO-SOURCE:official",
        "X-POGO-RAID-TIER:five-star"
      ].join("\n"),

      start_date:
        item.start_date,

      end_date:
        item.end_date,

      source_url:
        item.source_url
    };

    const contentHash =
      await sha256Hex(
        JSON.stringify(eventObject)
      );

    statements.push(
      env.DB.prepare(`
        INSERT INTO events (
          id,
          source_type,
          source_uid,
          summary,
          description,
          dtstart_line,
          dtend_line,
          other_lines,
          start_date,
          end_date,
          source_url,
          content_hash,
          sequence,
          status,
          updated_at
        )
        VALUES (?, 'raid_battles', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)
        ON CONFLICT(id) DO UPDATE SET
          summary = excluded.summary,
          description = excluded.description,
          dtstart_line = excluded.dtstart_line,
          dtend_line = excluded.dtend_line,
          other_lines = excluded.other_lines,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          source_url = excluded.source_url,
          sequence = CASE
            WHEN events.content_hash != excluded.content_hash
              OR events.status != 'active'
            THEN events.sequence + 1
            ELSE events.sequence
          END,
          content_hash = excluded.content_hash,
          status = 'active',
          updated_at = excluded.updated_at
      `).bind(
        id,
        sourceUid,
        eventObject.summary,
        eventObject.description,
        eventObject.dtstart_line,
        eventObject.dtend_line,
        eventObject.other_lines,
        eventObject.start_date,
        eventObject.end_date,
        eventObject.source_url,
        contentHash,
        timestamp
      )
    );
  }

  return statements;
}


function stripMaxEvidenceLines(
  otherLines
) {
  return String(
    otherLines || ""
  )
    .split("\n")
    .filter(
      line =>
        line &&
        !/^X-POGO-MAX-(?:EVIDENCE|EVIDENCE-URL|BATTLE-TIER|PARTICLE-COST):/i.test(
          line
        )
    );
}

async function officialMaxBattleEvidenceStatements(
  env,
  supplements,
  timestamp
) {
  if (!supplements.length) {
    return {
      statements: [],
      matched_events: 0
    };
  }

  const startDate =
    supplements
      .map(item => item.start_date)
      .filter(Boolean)
      .sort()[0];

  const endDate =
    supplements
      .map(item => item.end_date)
      .filter(Boolean)
      .sort()
      .at(-1);

  if (!startDate || !endDate) {
    return {
      statements: [],
      matched_events: 0
    };
  }

  const { results } =
    await env.DB.prepare(`
      SELECT
        id,
        source_type,
        source_uid,
        summary,
        other_lines,
        start_date,
        end_date
      FROM events
      WHERE status = 'active'
        AND source_type IN (
          'max_battles',
          'max_mondays',
          '${MAX_ROTATION_SOURCE_TYPE}'
        )
        AND COALESCE(
          start_date,
          '0000-01-01'
        ) <= ?
        AND COALESCE(
          end_date,
          start_date,
          '9999-12-31'
        ) >= ?
      ORDER BY start_date, summary
    `).bind(
      endDate,
      startDate
    ).all();

  const statements = [];
  let matchedEvents = 0;

  for (const event of results || []) {
    const eventName =
      normalizeName(
        event.summary
      );

    const match =
      supplements.find(
        item =>
          item.start_date <=
            (event.end_date ||
              event.start_date) &&
          item.end_date >=
            event.start_date &&
          eventName.includes(
            normalizeName(
              item.pokemon_name
            )
          )
      );

    if (!match) {
      continue;
    }

    const lines =
      stripMaxEvidenceLines(
        event.other_lines
      );

    lines.push(
      "X-POGO-MAX-EVIDENCE:official"
    );

    if (
      match.max_battle_tier
    ) {
      lines.push(
        `X-POGO-MAX-BATTLE-TIER:${match.max_battle_tier}`
      );
    }

    if (
      match.max_particle_cost_source ===
      "official_explicit_cost"
    ) {
      lines.push(
        `X-POGO-MAX-PARTICLE-COST:${match.max_particle_cost}`
      );
    }

    if (match.source_url) {
      lines.push(
        `X-POGO-MAX-EVIDENCE-URL:${match.source_url}`
      );
    }

    statements.push(
      env.DB.prepare(`
        UPDATE events
        SET
          other_lines = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(
        lines.join("\n"),
        timestamp,
        event.id
      )
    );

    matchedEvents += 1;
  }

  return {
    statements,
    matched_events:
      matchedEvents
  };
}


async function fetchOfficialHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "PokemonGoPersonalCalendar/1.0 (+remote-raid-limit-detector)",
      "accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`${url}: official page returned ${response.status}`);
  }

  return response.text();
}

async function syncOfficialRemoteRaidLimits(env) {
  const detected = [];
  const officialRaidSupplements = [];
  const officialMaxBattleSupplements = [];
  const suppressionRules = [];
  const armoredMewtwoSupplements = [];
  let megaFinaleData = null;
  const errors = [];

  let indexHtml = "";

  try {
    indexHtml = await fetchOfficialHtml(OFFICIAL_POKEMON_GO_NEWS_URL);
  } catch (error) {
    errors.push(String(error.message || error));
  }

  const urls = officialEventLinksFromHtml(
    indexHtml,
    OFFICIAL_POKEMON_GO_NEWS_URL
  );

  for (const pinned of PINNED_OFFICIAL_EVENT_PAGES) {
    if (!urls.includes(pinned)) urls.unshift(pinned);
  }

  const pageUrls = [...new Set(urls)]
    .slice(0, MAX_OFFICIAL_EVENT_PAGES_PER_SYNC);

  const timestamp = nowIso();
  const dbStatements = [];

  for (const url of pageUrls) {
    try {
      const html = await fetchOfficialHtml(url);
      const plainText = htmlToPlainText(html);

      const maxBattleSupplements =
        officialMaxBattleSupplementsFromText(
          plainText,
          url
        );

      for (
        const item of
        maxBattleSupplements
      ) {
        const key = [
          normalizeName(
            item.pokemon_name
          ),
          item.start_date,
          item.end_date,
          item.max_battle_tier ||
            "",
          item.max_particle_cost ||
            ""
        ].join("|");

        if (
          !officialMaxBattleSupplements.some(
            existing =>
              [
                normalizeName(
                  existing.pokemon_name
                ),
                existing.start_date,
                existing.end_date,
                existing.max_battle_tier ||
                  "",
                existing.max_particle_cost ||
                  ""
              ].join("|") === key
          )
        ) {
          officialMaxBattleSupplements.push(
            item
          );
        }
      }

      const pageSuppressions =
        officialEventSuppressionRulesFromText(
          plainText,
          url
        );

      for (
        const rule of pageSuppressions
      ) {
        const key = [
          rule.start_date,
          rule.end_date,
          JSON.stringify(
            rule.suppressed_source_types
          )
        ].join("|");

        if (
          !suppressionRules.some(
            (existing) =>
              [
                existing.start_date,
                existing.end_date,
                JSON.stringify(
                  existing.suppressed_source_types
                )
              ].join("|") === key
          )
        ) {
          suppressionRules.push(
            rule
          );
        }
      }

      const armored =
        armoredMewtwoSupplementsFromOfficialText(
          plainText,
          url
        );

      for (
        const item of armored
      ) {
        const key = [
          item.pokemon_name,
          item.start_date
        ].join("|");

        if (
          !armoredMewtwoSupplements.some(
            (existing) =>
              [
                existing.pokemon_name,
                existing.start_date
              ].join("|") === key
          )
        ) {
          armoredMewtwoSupplements.push(
            item
          );
        }
      }

      const rules =
        remoteRaidRulesFromOfficialText(
          plainText,
          url
        );

      for (const rule of rules) {
        const id = await sha256Hex(
          [
            "official-remote-limit",
            rule.source_url,
            rule.start_date,
            rule.end_date,
            rule.is_unlimited
              ? "unlimited"
              : String(rule.remote_raid_limit)
          ].join("|")
        );

        dbStatements.push(
          env.DB.prepare(`
            INSERT INTO remote_raid_limit_overrides (
              id,
              event_name,
              start_date,
              end_date,
              remote_raid_limit,
              source_url,
              active,
              updated_at,
              is_unlimited,
              detected_automatically,
              source_excerpt,
              detected_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              event_name = excluded.event_name,
              start_date = excluded.start_date,
              end_date = excluded.end_date,
              remote_raid_limit = excluded.remote_raid_limit,
              source_url = excluded.source_url,
              active = 1,
              updated_at = excluded.updated_at,
              is_unlimited = excluded.is_unlimited,
              detected_automatically = 1,
              source_excerpt = excluded.source_excerpt,
              detected_at = excluded.detected_at
          `).bind(
            id,
            rule.event_name,
            rule.start_date,
            rule.end_date,
            rule.remote_raid_limit,
            rule.source_url,
            timestamp,
            rule.is_unlimited,
            rule.source_excerpt,
            timestamp
          )
        );

        detected.push({
          id,
          ...rule
        });
      }

      const supplements =
        megaAscensionRaidSupplementsFromOfficialText(
          plainText,
          url
        );

      const finaleCandidate =
        megaFinaleRaidSupplementsFromOfficialText(
          plainText,
          url
        );

      if (
        finaleCandidate.main_event &&
        finaleCandidate.raid_events.length
      ) {
        megaFinaleData = finaleCandidate;
      }

      for (const item of supplements) {
        const key = [
          normalizeName(item.pokemon_name),
          item.start_date,
          item.end_date,
          item.certainty
        ].join("|");

        if (
          !officialRaidSupplements.some(
            (existing) =>
              [
                normalizeName(existing.pokemon_name),
                existing.start_date,
                existing.end_date,
                existing.certainty
              ].join("|") === key
          )
        ) {
          officialRaidSupplements.push(item);
        }
      }
    } catch (error) {
      errors.push(String(error.message || error));
    }
  }

  for (
    const rule of suppressionRules
  ) {
    const id =
      await sha256Hex(
        [
          "official-event-suppression",
          rule.start_date,
          rule.end_date,
          JSON.stringify(
            rule.suppressed_source_types
          )
        ].join("|")
      );

    dbStatements.push(
      env.DB.prepare(`
        INSERT INTO event_suppression_rules (
          id,
          event_name,
          start_date,
          end_date,
          suppressed_source_types,
          note,
          source_url,
          active,
          detected_automatically,
          source_excerpt,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          event_name = excluded.event_name,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          suppressed_source_types = excluded.suppressed_source_types,
          note = excluded.note,
          source_url = excluded.source_url,
          active = 1,
          detected_automatically = 1,
          source_excerpt = excluded.source_excerpt,
          updated_at = excluded.updated_at
      `).bind(
        id,
        rule.event_name,
        rule.start_date,
        rule.end_date,
        JSON.stringify(
          rule.suppressed_source_types
        ),
        rule.note,
        rule.source_url,
        rule.source_excerpt,
        timestamp
      )
    );
  }

  const supplementStatements =
    await officialRaidSupplementStatements(
      env,
      officialRaidSupplements,
      timestamp
    );

  dbStatements.push(...supplementStatements);

  const megaFinaleStatements =
    await officialMegaFinaleSupplementStatements(
      env,
      megaFinaleData,
      timestamp
    );

  dbStatements.push(...megaFinaleStatements);

  const armoredMewtwoStatements =
    await officialArmoredMewtwoStatements(
      env,
      armoredMewtwoSupplements,
      timestamp
    );

  dbStatements.push(
    ...armoredMewtwoStatements
  );

  const maxBattleEvidence =
    await officialMaxBattleEvidenceStatements(
      env,
      officialMaxBattleSupplements,
      timestamp
    );

  dbStatements.push(
    ...maxBattleEvidence.statements
  );

  if (dbStatements.length) {
    await env.DB.batch(dbStatements);
  }

  return {
    pages_checked: pageUrls.length,
    rules_detected: detected.length,
    detected,
    official_raid_supplements: {
      count: officialRaidSupplements.length,
      events: officialRaidSupplements
    },
    official_max_battle_evidence: {
      detected:
        officialMaxBattleSupplements.length,
      matched_events:
        maxBattleEvidence.matched_events,
      events:
        officialMaxBattleSupplements
    },
    mega_finale_supplements: {
      main_event:
        megaFinaleData?.main_event || null,
      raid_windows:
        megaFinaleData?.raid_events || [],
      count:
        (megaFinaleData?.main_event ? 1 : 0) +
        (megaFinaleData?.raid_events?.length || 0)
    },
    armored_mewtwo_supplements: {
      count:
        armoredMewtwoSupplements.length,
      events:
        armoredMewtwoSupplements
    },
    suppression_rules: {
      count:
        suppressionRules.length,
      rules:
        suppressionRules
    },
    errors
  };
}


function localDateForTimezone(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date())
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );

    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return todayUtc();
  }
}

async function remoteRaidLimitForDate(
  env,
  localDate,
  timezone = "UTC",
  referenceInstant = null
) {
  // Official announcements often express temporary Remote limits in PDT/PST.
  // Search one source-calendar day either side, then let the exact timestamp
  // parser project that window into the user's timezone. This prevents a PDT
  // Sep 18 start from incorrectly becoming a full Sep 18 override in UTC+8.
  const searchStart = addDaysIso(localDate, -1) || localDate;
  const searchEnd = addDaysIso(localDate, 1) || localDate;

  const { results } = await env.DB.prepare(`
    SELECT
      event_name,
      start_date,
      end_date,
      remote_raid_limit,
      source_url,
      COALESCE(is_unlimited, 0) AS is_unlimited,
      COALESCE(detected_automatically, 0) AS detected_automatically,
      source_excerpt,
      detected_at
    FROM remote_raid_limit_overrides
    WHERE active = 1
      AND start_date <= ?
      AND end_date >= ?
    ORDER BY
      COALESCE(is_unlimited, 0) DESC,
      remote_raid_limit DESC,
      updated_at DESC
    LIMIT 20
  `).bind(searchEnd, searchStart).all();

  for (const override of results || []) {
    const timing = remoteRaidRuleApplicability(
      override,
      {
        localDate,
        timezone,
        referenceInstant
      }
    );

    if (!timing.applies) continue;

    return {
      limit: Number(override.remote_raid_limit || 0),
      is_unlimited: Boolean(Number(override.is_unlimited || 0)),
      label: override.event_name,
      start_date: override.start_date,
      end_date: override.end_date,
      start_at: timing.start_at,
      end_at: timing.end_at,
      start_local_date: timing.start_local_date,
      end_local_date: timing.end_local_date,
      timing_precision: timing.precision,
      source_url: override.source_url,
      source_excerpt: override.source_excerpt || null,
      detected_at: override.detected_at || null,
      detected_automatically: Boolean(Number(override.detected_automatically || 0)),
      is_override: true
    };
  }

  return {
    limit: DEFAULT_REMOTE_RAID_LIMIT,
    is_unlimited: false,
    label: "Standard daily Remote Raid limit",
    start_date: null,
    end_date: null,
    start_at: null,
    end_at: null,
    start_local_date: null,
    end_local_date: null,
    timing_precision: "standard",
    source_url: DEFAULT_REMOTE_RAID_LIMIT_SOURCE,
    source_excerpt: null,
    detected_at: null,
    detected_automatically: false,
    is_override: false
  };
}

async function remoteRaidUsageForDate(env, userId, localDate) {
  const row = await env.DB.prepare(`
    SELECT raids_used
    FROM remote_raid_usage
    WHERE user_id = ? AND local_date = ?
  `).bind(userId, localDate).first();

  return row ? Math.max(0, Number(row.raids_used || 0)) : 0;
}

async function remoteMaxPassUsageForDate(env, userId, localDate) {
  try {
    const row = await env.DB.prepare(`
      SELECT remote_max_passes_used
      FROM battle_resource_daily
      WHERE user_id = ? AND local_date = ?
    `).bind(userId, localDate).first();

    return row
      ? Math.max(0, Number(row.remote_max_passes_used || 0))
      : 0;
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) {
      return 0;
    }
    throw error;
  }
}

export async function remoteBattleUsageForDate(env, userId, localDate) {
  const [remoteRaids, remoteMax] = await Promise.all([
    remoteRaidUsageForDate(env, userId, localDate),
    remoteMaxPassUsageForDate(env, userId, localDate)
  ]);

  return remoteRaids + remoteMax;
}


const DEFAULT_MAX_PARTICLE_RULE_SOURCE =
  "https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/4797-collecting-max-particles-and-dynamaxing-or-gigantamaxing-pokemon-1729887059/";

function parseParticleLimitNumber(value) {
  const number = Number(
    String(value || "")
      .replace(/,/g, "")
  );

  return Number.isFinite(number) &&
    number > 0
      ? Math.floor(number)
      : null;
}

function explicitMaxParticleLimitsFromText(value) {
  const text =
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  if (!text) {
    return {
      daily_limit: null,
      storage_limit: null
    };
  }

  const dailyPatterns = [
    /(?:maximum number of Max Particles you can collect|Max Particle collection limit|daily Max Particle limit)[^0-9]{0,80}(?:increased to|raised to|set to|is|of)?\s*([\d,]{3,7})/i,
    /(?:collect|earn|receive)[^.]{0,100}?up to\s*([\d,]{3,7})\s*(?:Max Particles|MP)[^.]{0,40}?(?:per day|daily|each day)/i
  ];

  const storagePatterns = [
    /(?:maximum number of Max Particles you can hold|Max Particle storage limit|Max Particle storage capacity)[^0-9]{0,80}(?:increased to|raised to|set to|is|of)?\s*([\d,]{3,7})/i,
    /(?:hold|store|carry)[^.]{0,100}?up to\s*([\d,]{3,7})\s*(?:Max Particles|MP)/i
  ];

  const matchValue =
    patterns => {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        const parsed =
          parseParticleLimitNumber(
            match?.[1]
          );

        if (parsed) return parsed;
      }

      return null;
    };

  return {
    daily_limit:
      matchValue(dailyPatterns),
    storage_limit:
      matchValue(storagePatterns)
  };
}

async function maxParticleRuleForDate(
  env,
  localDate
) {
  const standard = {
    daily_limit:
      STANDARD_MAX_PARTICLE_DAILY_LIMIT,
    storage_limit:
      STANDARD_MAX_PARTICLE_STORAGE_LIMIT,
    label:
      "Standard Max Particle rules",
    source_url:
      DEFAULT_MAX_PARTICLE_RULE_SOURCE,
    source_kind:
      "official",
    is_override:
      false
  };

  let rows = [];

  try {
    const result =
      await env.DB.prepare(`
        SELECT
          summary,
          description,
          source_url,
          source_uid,
          source_type,
          updated_at
        FROM events
        WHERE status = 'active'
          AND source_type IN (
            'event',
            'max_battles',
            'max_mondays'
          )
          AND COALESCE(
            start_date,
            '0000-01-01'
          ) <= ?
          AND COALESCE(
            end_date,
            start_date,
            '9999-12-31'
          ) >= ?
        ORDER BY
          CASE
            WHEN source_uid LIKE
              'official-supplement:%'
            THEN 0
            ELSE 1
          END,
          updated_at DESC
        LIMIT 100
      `).bind(
        localDate,
        localDate
      ).all();

    rows =
      result.results || [];
  } catch {
    return standard;
  }

  let daily =
    standard.daily_limit;
  let storage =
    standard.storage_limit;
  let source = null;

  for (const row of rows) {
    const parsed =
      explicitMaxParticleLimitsFromText(
        `${row.summary || ""} ${row.description || ""}`
      );

    if (
      parsed.daily_limit != null &&
      parsed.daily_limit > daily
    ) {
      daily =
        parsed.daily_limit;
      source = row;
    }

    if (
      parsed.storage_limit != null &&
      parsed.storage_limit > storage
    ) {
      storage =
        parsed.storage_limit;
      source = source || row;
    }
  }

  if (!source) {
    return standard;
  }

  return {
    daily_limit:
      daily,
    storage_limit:
      storage,
    label:
      source.summary ||
      "Event Max Particle rules",
    source_url:
      source.source_url || null,
    source_kind:
      String(
        source.source_uid || ""
      ).startsWith(
        "official-supplement:"
      )
        ? "official"
        : "calendar",
    is_override:
      true
  };
}

async function battleResourceStateForDate(
  env,
  userId,
  localDate
) {
  try {
    const [
      persistent,
      daily
    ] =
      await Promise.all([
        env.DB.prepare(`
          SELECT
            max_particles_held
          FROM battle_resource_state
          WHERE user_id = ?
        `).bind(
          userId
        ).first(),
        env.DB.prepare(`
          SELECT
            max_particles_collected,
            remote_max_passes_used
          FROM battle_resource_daily
          WHERE user_id = ?
            AND local_date = ?
        `).bind(
          userId,
          localDate
        ).first()
      ]);

    return {
      max_particles_held:
        Math.max(
          0,
          Number(
            persistent
              ?.max_particles_held || 0
          )
        ),
      max_particles_collected_today:
        Math.max(
          0,
          Number(
            daily
              ?.max_particles_collected || 0
          )
        ),
      remote_max_passes_used:
        Math.max(
          0,
          Number(
            daily
              ?.remote_max_passes_used || 0
          )
        ),
      migration_ready:
        true
    };
  } catch (error) {
    if (
      /no such table/i.test(
        String(
          error?.message || error
        )
      )
    ) {
      return {
        max_particles_held: 0,
        max_particles_collected_today: 0,
        remote_max_passes_used: 0,
        migration_ready:
          false
      };
    }

    throw error;
  }
}

async function battleResourcePlanForUser(
  env,
  user,
  recommendations,
  remoteRaidPlan
) {
  const localDate =
    localDateForTimezone(
      user.timezone
    );

  const [
    resourceState,
    particleRule
  ] =
    await Promise.all([
      battleResourceStateForDate(
        env,
        user.id,
        localDate
      ),
      maxParticleRuleForDate(
        env,
        localDate
      )
    ]);

  const sharedCeiling =
    remoteRaidPlan
      .daily_budget_override != null
      ? remoteRaidPlan
          .daily_budget_override
      : user.remote_raid_budget;

  const plan =
    buildBattleResourcePlan({
      recommendations,
      remoteRaidPlan,
      resourceState,
      personalRemotePassCeiling:
        sharedCeiling,
      minScore:
        user.remote_raid_min_score,
      maxParticleDailyLimit:
        particleRule.daily_limit,
      maxParticleStorageLimit:
        particleRule.storage_limit,
      futureForecast:
        remoteRaidPlan
          .budget_forecast || []
    });

  return {
    local_date:
      localDate,
    state:
      resourceState,
    particle_rule:
      particleRule,
    ...plan
  };
}

async function updateBattleResourcesApi(
  request,
  env
) {
  const body =
    await request.json();

  const user =
    await userByManageToken(
      env,
      body.token
    );

  if (!user) {
    return bad(
      "Invalid management link.",
      401
    );
  }

  const validateWhole = (
    value,
    label,
    max
  ) => {
    const number =
      Number(value);

    if (
      !Number.isInteger(number) ||
      number < 0 ||
      number > max
    ) {
      throw new Error(
        `${label} must be a whole number between 0 and ${max.toLocaleString()}.`
      );
    }

    return number;
  };

  let held;
  let collected;
  let remoteMaxPasses;

  try {
    held =
      validateWhole(
        body.max_particles_held ?? 0,
        "Max Particles held",
        100000
      );

    collected =
      validateWhole(
        body.max_particles_collected_today ?? 0,
        "Max Particles collected today",
        100000
      );

    remoteMaxPasses =
      validateWhole(
        body.remote_max_passes_used ?? 0,
        "Remote Max Passes used",
        999
      );
  } catch (error) {
    return bad(
      error.message
    );
  }

  const localDate =
    localDateForTimezone(
      user.timezone
    );

  const timestamp =
    nowIso();

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO battle_resource_state (
          user_id,
          max_particles_held,
          updated_at
        )
        VALUES (?, ?, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET
          max_particles_held =
            excluded.max_particles_held,
          updated_at =
            excluded.updated_at
      `).bind(
        user.id,
        held,
        timestamp
      ),
      env.DB.prepare(`
        INSERT INTO battle_resource_daily (
          user_id,
          local_date,
          max_particles_collected,
          remote_max_passes_used,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(
          user_id,
          local_date
        )
        DO UPDATE SET
          max_particles_collected =
            excluded.max_particles_collected,
          remote_max_passes_used =
            excluded.remote_max_passes_used,
          updated_at =
            excluded.updated_at
      `).bind(
        user.id,
        localDate,
        collected,
        remoteMaxPasses,
        timestamp
      )
    ]);
  } catch (error) {
    if (
      /no such table/i.test(
        String(
          error?.message || error
        )
      )
    ) {
      return bad(
        "Battle resource storage is not ready yet. Apply migrations/0001_battle_resources.sql to D1 first.",
        503
      );
    }

    throw error;
  }

  return json({
    ok: true,
    local_date:
      localDate,
    max_particles_held:
      held,
    max_particles_collected_today:
      collected,
    remote_max_passes_used:
      remoteMaxPasses
  });
}


async function remoteRaidBudgetOverrideForDate(
  env,
  userId,
  localDate
) {
  const row = await env.DB.prepare(`
    SELECT budget_override
    FROM remote_raid_daily_budget_overrides
    WHERE user_id = ?
      AND local_date = ?
  `).bind(
    userId,
    localDate
  ).first();

  if (!row) return null;

  const value =
    Number(row.budget_override);

  return Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

function usefulRemoteRaidsForRecommendation(
  recommendation,
  minScore
) {
  if (!recommendation?.remote_eligible) {
    return 0;
  }

  const target =
    recommendation.target || null;

  if (
    String(target?.priority || "")
      .toLowerCase() === "skip"
  ) {
    return 0;
  }

  if (Number(target?.completed)) {
    return 0;
  }

  const score =
    Number(recommendation.score || 0);

  if (score < minScore) {
    return 0;
  }

  const scoreBasedCap =
    Math.max(
      0,
      Math.floor(
        (score - minScore) /
        REMOTE_RAID_DECAY_PER_RAID
      ) + 1
    );

  const targetCap =
    remoteTargetCap(target);

  return Number.isFinite(targetCap)
    ? Math.min(
        scoreBasedCap,
        targetCap
      )
    : scoreBasedCap;
}

function forecastDayCapacity(
  officialRule
) {
  if (officialRule?.is_unlimited) {
    return 999;
  }

  return Math.max(
    0,
    Number(
      officialRule?.limit || 0
    )
  );
}

function budgetAdviceLevel(
  day,
  bestFutureDay
) {
  const recommended =
    Number(
      day.recommended_budget || 0
    );

  const limit =
    day.official_is_unlimited
      ? null
      : Number(
          day.official_limit || 0
        );

  if (recommended <= 0) {
    return {
      code: "save",
      label: "SAVE MONEY",
      headline:
        "No paid Remote Raids are compelling enough today.",
      detail:
        bestFutureDay
          ? `Keep your raid spending for ${bestFutureDay.label}, which currently has stronger target value.`
          : "There is no need to buy passes simply because raid capacity is available."
    };
  }

  if (
    limit != null &&
    limit > 0 &&
    recommended >= limit
  ) {
    return {
      code: "max",
      label: "FULL-CAP DAY",
      headline:
        `The current plan justifies all ${limit} Remote Raid slots.`,
      detail:
        "If you are comfortable spending for a heavy raid day, this is one of the days where preparing for the full official cap is supported by your targets and value threshold."
    };
  }

  const ratio =
    limit && limit > 0
      ? recommended / limit
      : null;

  if (
    ratio != null &&
    ratio <= REMOTE_BUDGET_LIGHT_RATIO &&
    bestFutureDay &&
    Number(bestFutureDay.recommended_budget || 0) >
      recommended + 3
  ) {
    return {
      code: "save",
      label: "SAVE FOR LATER",
      headline:
        `Plan around ${recommended} paid raid${recommended === 1 ? "" : "s"} today rather than funding the full cap.`,
      detail:
        `${bestFutureDay.label} currently has a stronger forward-looking budget of about ${bestFutureDay.recommended_budget}.`
    };
  }

  if (
    ratio != null &&
    ratio >= REMOTE_BUDGET_HEAVY_RATIO
  ) {
    return {
      code: "heavy",
      label: "HEAVY RAID DAY",
      headline:
        `A strong paid-raid day: plan around ${recommended} Remote Raids.`,
      detail:
        limit && recommended < limit
          ? `The model still does not justify buying passes solely to force all ${limit} slots.`
          : "The model sees a high concentration of worthwhile target progress today."
    };
  }

  return {
    code: "selective",
    label: "BE SELECTIVE",
    headline:
      `Plan around ${recommended} paid raid${recommended === 1 ? "" : "s"} today.`,
    detail:
      bestFutureDay &&
      Number(bestFutureDay.value_index || 0) >
        Number(day.value_index || 0) * 1.15
        ? `There is stronger projected value on ${bestFutureDay.label}, so avoid spending just to fill today's cap.`
        : "Spend only on the bosses that remain above your value threshold; unused capacity is intentional."
  };
}

function shortDateLabel(dateValue) {
  const match =
    String(dateValue || "")
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return dateValue;
  }

  const date =
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12
      )
    );

  return new Intl.DateTimeFormat(
    "en",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }
  ).format(date);
}

async function buildRemoteRaidBudgetForecast(
  env,
  user,
  targets,
  metas
) {
  const today =
    localDateForTimezone(
      user.timezone
    );

  const currentInstant =
    nowIso();

  const threshold =
    clamp(
      Number(
        user.remote_raid_min_score ??
        DEFAULT_REMOTE_RAID_MIN_SCORE
      ),
      0,
      100
    );

  const days = [];

  for (
    let offset = 0;
    offset < REMOTE_BUDGET_LOOKAHEAD_DAYS;
    offset++
  ) {
    const date =
      addDaysIso(
        today,
        offset
      );

    const [
      recommendations,
      officialRule
    ] =
      await Promise.all([
        recommendationsForDate(
          env,
          user,
          targets,
          metas,
          date
        ),
        remoteRaidLimitForDate(
          env,
          date,
          user.timezone,
          date === today
            ? currentInstant
            : null
        )
      ]);

    days.push({
      date,
      label:
        shortDateLabel(date),
      recommendations,
      official_rule:
        officialRule,
      official_limit:
        officialRule.is_unlimited
          ? null
          : Number(
              officialRule.limit || 0
            ),
      official_is_unlimited:
        Boolean(
          officialRule.is_unlimited
        ),
      capacity:
        forecastDayCapacity(
          officialRule
        ),
      allocated: 0,
      value_index: 0,
      allocations:
        new Map(),
      completed_targets:
        recommendations
          .filter(
            rec =>
              Number(
                rec.target?.completed
              )
          )
          .map(
            rec =>
              rec.pokemon_name
          ),
      skipped_targets:
        recommendations
          .filter(
            rec =>
              String(
                rec.target?.priority || ""
              ).toLowerCase() === "skip"
          )
          .map(
            rec =>
              rec.pokemon_name
          )
    });
  }

  const species = new Map();

  for (const day of days) {
    for (
      const recommendation of
      day.recommendations
    ) {
      if (
        !recommendation.remote_eligible
      ) {
        continue;
      }

      const useful =
        usefulRemoteRaidsForRecommendation(
          recommendation,
          threshold
        );

      if (useful <= 0) {
        continue;
      }

      const key =
        normalizeName(
          recommendation.pokemon_name
        );

      if (!species.has(key)) {
        species.set(
          key,
          {
            pokemon_name:
              recommendation.pokemon_name,
            recommendation,
            useful_raids:
              useful,
            dates: []
          }
        );
      }

      const item =
        species.get(key);

      item.useful_raids =
        Math.max(
          item.useful_raids,
          useful
        );

      item.dates.push(
        day.date
      );

      if (
        recommendation.score >
        item.recommendation.score
      ) {
        item.recommendation =
          recommendation;
      }
    }
  }

  const dayByDate =
    new Map(
      days.map(
        day => [
          day.date,
          day
        ]
      )
    );

  const speciesItems =
    [...species.values()]
      .sort(
        (a, b) =>
          a.dates.length -
            b.dates.length ||
          b.recommendation.score -
            a.recommendation.score ||
          a.pokemon_name.localeCompare(
            b.pokemon_name
          )
      );

  const allocateOne = (
    day,
    item,
    marginalScore
  ) => {
    day.allocated += 1;
    day.value_index +=
      marginalScore;

    const current =
      day.allocations.get(
        item.pokemon_name
      ) || 0;

    day.allocations.set(
      item.pokemon_name,
      current + 1
    );
  };

  // Short-window / single-day opportunities are allocated first.
  for (
    const item of speciesItems
      .filter(
        item =>
          new Set(item.dates).size === 1
      )
  ) {
    const date =
      [...new Set(item.dates)][0];

    const day =
      dayByDate.get(date);

    if (!day) continue;

    for (
      let raidIndex = 0;
      raidIndex < item.useful_raids;
      raidIndex++
    ) {
      if (
        day.allocated >=
        day.capacity
      ) {
        break;
      }

      const marginalScore =
        item.recommendation.score -
        raidIndex *
          REMOTE_RAID_DECAY_PER_RAID;

      if (
        marginalScore <
        threshold
      ) {
        break;
      }

      allocateOne(
        day,
        item,
        marginalScore
      );
    }
  }

  // Flexible/multi-day targets are deliberately placed on the least-busy
  // eligible days. This is what lets, for example, a completed one-day boss
  // free up Thursday for multi-day Latios/Latias progress.
  for (
    const item of speciesItems
      .filter(
        item =>
          new Set(item.dates).size > 1
      )
  ) {
    const dates =
      [...new Set(item.dates)]
        .sort();

    for (
      let raidIndex = 0;
      raidIndex < item.useful_raids;
      raidIndex++
    ) {
      const marginalScore =
        item.recommendation.score -
        raidIndex *
          REMOTE_RAID_DECAY_PER_RAID;

      if (
        marginalScore <
        threshold
      ) {
        break;
      }

      const candidates =
        dates
          .map(
            date =>
              dayByDate.get(date)
          )
          .filter(
            day =>
              day &&
              day.allocated <
                day.capacity
          )
          .sort(
            (a, b) =>
              a.allocated -
                b.allocated ||
              a.value_index -
                b.value_index ||
              a.date.localeCompare(
                b.date
              )
          );

      if (!candidates.length) {
        break;
      }

      allocateOne(
        candidates[0],
        item,
        marginalScore
      );
    }
  }

  const outputDays =
    days.map(day => {
      const allocations =
        [...day.allocations.entries()]
          .map(
            ([pokemon_name, count]) => {
              const speciesItem =
                species.get(
                  normalizeName(
                    pokemon_name
                  )
                );

              return {
                pokemon_name,
                count,
                sprite_url:
                  speciesItem
                    ?.recommendation
                    ?.sprite_url ||
                  speciesItem
                    ?.recommendation
                    ?.meta
                    ?.sprite_url ||
                  null
              };
            }
          )
          .sort(
            (a, b) =>
              b.count - a.count ||
              a.pokemon_name.localeCompare(
                b.pokemon_name
              )
          );

      const flexibleBosses =
        allocations
          .filter(allocation => {
            const item =
              species.get(
                normalizeName(
                  allocation.pokemon_name
                )
              );

            return (
              item &&
              new Set(item.dates).size > 1
            );
          })
          .map(
            allocation =>
              allocation.pokemon_name
          );

      const reasons = [];

      if (
        day.completed_targets.length
      ) {
        reasons.push(
          `${day.completed_targets.join(", ")} already complete, so no paid-raid budget is reserved for that target.`
        );
      }

      if (
        day.skipped_targets.length
      ) {
        reasons.push(
          `${day.skipped_targets.join(", ")} set to Skip.`
        );
      }

      if (
        flexibleBosses.length
      ) {
        reasons.push(
          `Flexible multi-day progress is shifted here for ${[...new Set(flexibleBosses)].join(", ")}.`
        );
      }

      if (
        !day.allocated
      ) {
        reasons.push(
          "No remotely eligible target clears your current value threshold after target completion and priority rules."
        );
      }

      const topRecommendations =
        recommendationCoLeaders(
          day.recommendations
        );

      return {
        date: day.date,
        label: day.label,
        official_rule:
          day.official_rule,
        official_limit:
          day.official_limit,
        official_is_unlimited:
          day.official_is_unlimited,
        recommended_budget:
          day.allocated,
        value_index:
          Math.round(
            day.value_index
          ),
        allocations,
        top_recommendations:
          topRecommendations,
        completed_targets:
          day.completed_targets,
        skipped_targets:
          day.skipped_targets,
        reasons
      };
    });

  const todayForecast =
    outputDays[0];

  const futureDays =
    outputDays.slice(1);

  const bestFutureDay =
    futureDays
      .filter(
        day =>
          day.recommended_budget > 0
      )
      .sort(
        (a, b) =>
          b.value_index -
            a.value_index ||
          b.recommended_budget -
            a.recommended_budget ||
          a.date.localeCompare(
            b.date
          )
      )[0] || null;

  const advice =
    budgetAdviceLevel(
      todayForecast,
      bestFutureDay
    );

  return {
    horizon_days:
      REMOTE_BUDGET_LOOKAHEAD_DAYS,
    today,
    recommended_daily_budget:
      todayForecast.recommended_budget,
    advice,
    best_future_day:
      bestFutureDay,
    days:
      outputDays
  };
}


function remoteTargetCap(target) {
  if (!target) return Infinity;

  if (String(target.priority || "").toLowerCase() === "skip") return 0;
  if (Number(target.completed)) return 0;

  if (target.target_value == null) return Infinity;

  const targetValue = Number(target.target_value);
  const currentValue = Number(target.current_value || 0);
  if (!Number.isFinite(targetValue) || targetValue <= 0) return Infinity;

  const remaining = targetValue - currentValue;
  if (remaining <= 0) {
    // Reaching the numeric target is not the same as the user marking the goal
    // complete. Do not force a zero allocation unless completed=true.
    return Infinity;
  }

  if (["raids", "battles"].includes(target.target_type)) {
    return Math.max(0, Math.ceil(remaining));
  }

  const expected = Number(target.expected_progress_per_raid);
  if (Number.isFinite(expected) && expected > 0) {
    return Math.max(0, Math.ceil(remaining / expected));
  }

  return Infinity;
}

function buildRemoteRaidPlan({
  recommendations,
  officialRule,
  userBudget,
  raidsUsed,
  minScore
}) {
  const isUnlimited = Boolean(officialRule.is_unlimited);
  const officialLimit = isUnlimited
    ? null
    : Math.max(0, Number(officialRule.limit || 0));

  const used = clamp(Math.floor(Number(raidsUsed || 0)), 0, 999);
  const officialRemaining = isUnlimited
    ? null
    : Math.max(0, officialLimit - used);

  const configuredBudget =
    userBudget == null || userBudget === ""
      ? null
      : Math.max(0, Math.floor(Number(userBudget)));

  const threshold = clamp(
    Number(minScore || DEFAULT_REMOTE_RAID_MIN_SCORE),
    0,
    100
  );

  const candidates = recommendations
    .filter((rec) => rec.remote_eligible)
    .map((rec) => {
      const target = rec.target || null;
      const explicitSkip =
        String(target?.priority || "").toLowerCase() === "skip";
      const completed = Boolean(Number(target?.completed));
      const cap = remoteTargetCap(target);

      return {
        ...rec,
        allocated: 0,
        target_cap: Number.isFinite(cap) ? cap : null,
        eligible: !explicitSkip && !completed && rec.score >= threshold,
        exclusion_reason:
          explicitSkip
            ? "Personal priority is set to Skip."
            : completed
              ? "Personal target is marked complete."
              : rec.score < threshold
                ? `Recommendation score is below your ${threshold}-point Remote Raid threshold.`
                : null
      };
    });

  // Maximum number of raids that can remain above the user's threshold after
  // applying equal diminishing marginal value to every eligible boss.
  const naturalValueCap = candidates.reduce((sum, candidate) => {
    if (!candidate.eligible) return sum;

    const scoreBasedCap = Math.max(
      0,
      Math.floor((candidate.score - threshold) / REMOTE_RAID_DECAY_PER_RAID) + 1
    );

    const targetCap =
      candidate.target_cap == null
        ? scoreBasedCap
        : Math.min(scoreBasedCap, candidate.target_cap);

    return sum + targetCap;
  }, 0);

  let dailyPlanningCap;

  if (isUnlimited) {
    // With no game cap, either respect the user's explicit budget or allow only
    // the naturally worthwhile raids implied by the threshold/decay model.
    dailyPlanningCap =
      configuredBudget == null
        ? used + naturalValueCap
        : configuredBudget;
  } else {
    const budgetCap =
      configuredBudget == null
        ? officialLimit
        : Math.min(configuredBudget, officialLimit);

    dailyPlanningCap = budgetCap;
  }

  const planningCapacity = Math.max(0, dailyPlanningCap - used);

  for (let slot = 0; slot < planningCapacity; slot++) {
    let best = null;

    for (const candidate of candidates) {
      if (!candidate.eligible) continue;

      if (
        candidate.target_cap != null &&
        candidate.allocated >= candidate.target_cap
      ) {
        continue;
      }

      const marginalScore =
        candidate.score -
        candidate.allocated * REMOTE_RAID_DECAY_PER_RAID;

      if (marginalScore < threshold) continue;

      if (
        !best ||
        marginalScore > best.marginal_score ||
        (
          marginalScore === best.marginal_score &&
          candidate.pokemon_name.localeCompare(
            best.candidate.pokemon_name
          ) < 0
        )
      ) {
        best = {
          candidate,
          marginal_score: marginalScore
        };
      }
    }

    if (!best) break;
    best.candidate.allocated += 1;
  }

  const recommendedTotal = candidates.reduce(
    (sum, candidate) => sum + candidate.allocated,
    0
  );

  return {
    official_rule: officialRule,
    official_limit: officialLimit,
    official_is_unlimited: isUnlimited,
    raids_used: used,
    official_remaining: officialRemaining,
    user_budget: configuredBudget,
    daily_planning_cap: dailyPlanningCap,
    planning_capacity: planningCapacity,
    natural_value_cap: naturalValueCap,
    min_score: threshold,
    decay_per_additional_raid: REMOTE_RAID_DECAY_PER_RAID,
    recommended_total: recommendedTotal,
    unused_planning_capacity: Math.max(
      0,
      planningCapacity - recommendedTotal
    ),
    unused_official_capacity: isUnlimited
      ? null
      : Math.max(0, officialRemaining - recommendedTotal),
    allocations: candidates
      .filter((candidate) => candidate.allocated > 0)
      .sort(
        (a, b) =>
          b.allocated - a.allocated ||
          b.score - a.score
      ),
    not_allocated: candidates
      .filter((candidate) => candidate.allocated === 0)
      .sort((a, b) => b.score - a.score)
  };
}

async function remoteRaidPlanForUser(
  env,
  user,
  recommendations,
  targets,
  metas
) {
  const localDate =
    localDateForTimezone(
      user.timezone
    );

  const [
    officialRule,
    raidsUsed,
    dailyOverride,
    budgetForecast
  ] =
    await Promise.all([
      remoteRaidLimitForDate(
        env,
        localDate,
        user.timezone,
        nowIso()
      ),
      remoteBattleUsageForDate(
        env,
        user.id,
        localDate
      ),
      remoteRaidBudgetOverrideForDate(
        env,
        user.id,
        localDate
      ),
      buildRemoteRaidBudgetForecast(
        env,
        user,
        targets,
        metas
      )
    ]);

  const systemRecommendedBudget =
    Number(
      budgetForecast
        .recommended_daily_budget || 0
    );

  const usualCeiling =
    user.remote_raid_budget == null ||
    user.remote_raid_budget === ""
      ? null
      : Math.max(
          0,
          Math.floor(
            Number(
              user.remote_raid_budget
            )
          )
        );

  let effectiveBudgetCap;

  if (dailyOverride != null) {
    effectiveBudgetCap =
      dailyOverride;
  } else if (usualCeiling != null) {
    effectiveBudgetCap =
      Math.min(
        systemRecommendedBudget,
        usualCeiling
      );
  } else {
    effectiveBudgetCap =
      systemRecommendedBudget;
  }

  if (!officialRule.is_unlimited) {
    effectiveBudgetCap =
      Math.min(
        effectiveBudgetCap,
        Number(
          officialRule.limit || 0
        )
      );
  }

  // If the user has already used more than the current advice/ceiling,
  // preserve the used count so the planning bar remains coherent.
  effectiveBudgetCap =
    Math.max(
      effectiveBudgetCap,
      raidsUsed
    );

  const plan =
    buildRemoteRaidPlan({
      recommendations,
      officialRule,
      userBudget:
        effectiveBudgetCap,
      raidsUsed,
      minScore:
        user.remote_raid_min_score
    });

  return {
    local_date:
      localDate,

    ...plan,

    // Legacy `raids_used` remains for API compatibility; this alias makes the
    // shared Remote Raid + Remote Max daily-limit meaning explicit.
    remote_limit_used:
      plan.raids_used,

    system_recommended_budget:
      systemRecommendedBudget,

    usual_personal_ceiling:
      usualCeiling,

    daily_budget_override:
      dailyOverride,

    effective_budget_cap:
      effectiveBudgetCap,

    purchase_advice:
      budgetForecast.advice,

    best_future_day:
      budgetForecast.best_future_day,

    budget_forecast:
      budgetForecast.days,

    budget_forecast_horizon_days:
      budgetForecast.horizon_days
  };
}

function monthBounds(month) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200 ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return null;
  }

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    month: `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}`,
    start: `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-01`,
    end: `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  };
}

async function calendarEventsApi(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const user = await userByManageToken(env, token);

  if (!user) return bad("Invalid management link.", 401);

  const localDate = localDateForTimezone(user.timezone);
  const bounds = monthBounds(
    url.searchParams.get("month") || localDate.slice(0, 7)
  );

  if (!bounds) return bad("Month must use YYYY-MM.");

  const included = parseSources(user);

  if (!included.length) {
    return json({
      month: bounds.month,
      timezone: user.timezone,
      events: []
    });
  }

  const targets = await getTargets(env, user.id);
  const metas = await getMeta(env);
  const placeholders = included.map(() => "?").join(",");

  const { results } = await env.DB.prepare(`
    SELECT *
    FROM events
    WHERE source_type IN (${placeholders})
      AND (
        status = 'active'
        OR (
          status = 'stale'
          AND COALESCE(end_date, start_date, '0000-01-01') >= date('now', '-14 days')
        )
      )
      AND start_date IS NOT NULL
      AND start_date <= ?
      AND COALESCE(end_date, start_date) >= ?
    ORDER BY
      start_date,
      CASE
        WHEN source_uid LIKE 'official-supplement:%' THEN 0
        ELSE 1
      END,
      summary
    LIMIT 700
  `).bind(...included, bounds.end, bounds.start).all();

  const rules =
    await eventSuppressionRules(
      env,
      bounds.start,
      bounds.end
    );

  const dedupe = new Set();
  const events = [];

  for (const rawEvent of results) {
    const visibleSegments =
      visibleEventSegments(
        rawEvent,
        rules
      );

    for (const event of visibleSegments) {
      const key =
        calendarEventDedupeKey(
          event,
          targets,
          metas
        );

      if (dedupe.has(key)) continue;
      dedupe.add(key);

      const personalized =
        personalizeEvent(
          event,
          user,
          targets,
          metas
        );

      const raidSprites =
        RAID_SOURCE_TYPES.has(
          event.source_type
        )
          ? findMatches(
              event.summary,
              targets,
              metas
            )
              .map(
                match => ({
                  pokemon_name:
                    match.name,
                  sprite_url:
                    match.meta?.sprite_url ||
                    spriteUrlForPokemonName(
                      match.name,
                      metas
                    )
                })
              )
              .filter(
                item =>
                  item.sprite_url
              )
              .filter(
                (
                  item,
                  index,
                  array
                ) =>
                  array.findIndex(
                    candidate =>
                      normalizeName(
                        candidate.pokemon_name
                      ) ===
                      normalizeName(
                        item.pokemon_name
                      )
                  ) === index
              )
          : [];

      events.push({
        id: event.id,
        title: personalized.title,
        description:
          personalized.description || "",
        source_type:
          event.source_type,
        start_date:
          event.start_date,
        end_date:
          event.end_date ||
          event.start_date,
        original_title:
          event.summary,
        sprites:
          raidSprites
      });
    }
  }

  return json({
    month: bounds.month,
    timezone: user.timezone,
    events
  });
}

async function feedLinkApi(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const user = await userByManageToken(env, token);

  if (!user) return bad("Invalid management link.", 401);

  if (!env.FEED_LINK_KEY) {
    return bad(
      "ICS link recovery is not enabled yet. Add the FEED_LINK_KEY Worker runtime secret.",
      503
    );
  }

  const signature = await recoverableFeedSignature(env, user.id);

  const baseUrl =
    publicBaseUrl(
      request,
      env
    );

  return json({
    calendar_url:
      `${baseUrl}/calendar/recover/${user.id}.${signature}.ics`,
    read_only: true,
    preferred: true,
    format: "signed",
    note:
      "Private read-only calendar subscription URL."
  });
}


async function revokeLegacyFeedApi(
  request,
  env
) {
  let body = {};

  try {
    body =
      await request.json();
  } catch {}

  const user =
    await userByManageToken(
      env,
      body.token
    );

  if (!user) {
    return bad(
      "Invalid management link.",
      401
    );
  }

  // Replace the legacy feed hash with a new random value whose
  // plaintext token is deliberately discarded. This invalidates
  // every previously-issued /calendar/<random-token>.ics URL for
  // this user without affecting the signed recoverable URL.
  const discardedToken =
    randomToken(48);

  const discardedHash =
    await sha256Hex(
      discardedToken
    );

  await env.DB.prepare(`
    UPDATE users
    SET
      feed_hash = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(
    discardedHash,
    nowIso(),
    user.id
  ).run();

  return json({
    ok: true,
    legacy_feed_revoked: true,
    note:
      "Previous legacy random-token calendar URLs for this user are now invalid."
  });
}


async function updateRemoteRaidBudgetOverride(
  request,
  env
) {
  const body =
    await request.json();

  const user =
    await userByManageToken(
      env,
      body.token
    );

  if (!user) {
    return bad(
      "Invalid management link.",
      401
    );
  }

  const localDate =
    localDateForTimezone(
      user.timezone
    );

  const requestedDate =
    body.local_date ||
    localDate;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      requestedDate
    )
  ) {
    return bad(
      "Invalid local date."
    );
  }

  const value =
    body.budget_override;

  if (
    value === "" ||
    value == null
  ) {
    await env.DB.prepare(`
      DELETE FROM remote_raid_daily_budget_overrides
      WHERE user_id = ?
        AND local_date = ?
    `).bind(
      user.id,
      requestedDate
    ).run();

    return json({
      ok: true,
      local_date:
        requestedDate,
      budget_override:
        null
    });
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > 999
  ) {
    return bad(
      "Daily override must be between 0 and 999."
    );
  }

  const budgetOverride =
    Math.floor(number);

  await env.DB.prepare(`
    INSERT INTO remote_raid_daily_budget_overrides (
      user_id,
      local_date,
      budget_override,
      updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, local_date)
    DO UPDATE SET
      budget_override =
        excluded.budget_override,
      updated_at =
        excluded.updated_at
  `).bind(
    user.id,
    requestedDate,
    budgetOverride,
    nowIso()
  ).run();

  return json({
    ok: true,
    local_date:
      requestedDate,
    budget_override:
      budgetOverride
  });
}


export async function raidActivityForUser(env, user, metas) {
  const localDate = localDateForTimezone(user.timezone);
  const [remoteRaidUsage, remoteMaxPassUsage] = await Promise.all([
    remoteRaidUsageForDate(env, user.id, localDate),
    remoteMaxPassUsageForDate(env, user.id, localDate)
  ]);
  const remoteLimitUsage = remoteRaidUsage + remoteMaxPassUsage;
  let rows;
  let totals;
  let migrationReady = true;
  const readActivity = async (table, system, participation, count, mp) => {
    const [recent, summary] = await Promise.all([
      env.DB.prepare(table === "unified_battle_log" ? `
        SELECT *, participation AS raid_type, battle_count AS raid_count
        FROM unified_battle_log WHERE user_id = ? AND undone_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT 8
      ` : `
        SELECT *, 'raid' AS battle_system, 'legacy' AS log_source,
          raid_count AS battle_count, raid_type AS participation, 0 AS max_particles_spent
        FROM raid_log WHERE user_id = ? AND undone_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT 8
      `).bind(user.id).all(),
      env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN ${system} = 'raid' AND ${participation} = 'local' THEN ${count} ELSE 0 END), 0) AS local_raids,
          COALESCE(SUM(CASE WHEN ${system} = 'raid' AND ${participation} = 'remote' THEN ${count} ELSE 0 END), 0) AS logged_remote_raids,
          COALESCE(SUM(CASE WHEN ${system} = 'max' AND ${participation} = 'local' THEN ${count} ELSE 0 END), 0) AS local_max,
          COALESCE(SUM(CASE WHEN ${system} = 'max' AND ${participation} = 'remote' THEN ${count} ELSE 0 END), 0) AS remote_max,
          COALESCE(SUM(${mp}), 0) AS mp_spent
        FROM ${table} WHERE user_id = ? AND local_date = ? AND undone_at IS NULL
      `).bind(user.id, localDate).first()
    ]);
    return [recent.results || [], summary];
  };
  try {
    [rows, totals] = await readActivity("unified_battle_log", "battle_system", "participation", "battle_count", "max_particles_spent");
  } catch (error) {
    if (!/no such (table|view)/i.test(String(error?.message))) throw error;
    migrationReady = false;
    [rows, totals] = await readActivity("raid_log", "'raid'", "raid_type", "raid_count", "0");
  }
  const local = totals.local_raids;
  const remoteMax = totals.remote_max;
  const localMax = totals.local_max;
  return {
    local_date: localDate, migration_ready: migrationReady,
    remote_raids: remoteRaidUsage, local_raids: local, total_raids: remoteRaidUsage + local,
    remote_max_passes_used: remoteMaxPassUsage,
    remote_limit_used: remoteLimitUsage,
    local_max_battles: localMax, remote_max_battles: remoteMax,
    total_battles: remoteRaidUsage + local + localMax + remoteMax,
    max_particles_spent: totals.mp_spent,
    logged_remote_raids: totals.logged_remote_raids,
    manual_remote_adjustment: remoteRaidUsage - totals.logged_remote_raids,
    recent: rows.slice(0, 8).map(row => ({
      ...row,
      // Exact identity only. In particular, a base Gengar asset is not a GMAX asset.
      sprite_url: row.battle_variant === "gigantamax" && maxBattleVariantFromText(row.pokemon_name) !== "gigantamax"
        ? null
        : metas.find(meta => normalizeName(meta.pokemon_name) === normalizeName(row.pokemon_name))?.sprite_url || null
    }))
  };
}

export async function logRaidApi(request, env) {
  const body = await request.json();
  const user = await userByManageToken(env, body.token);
  if (!user) return bad("Invalid management link.", 401);
  try {
    const targets = await getTargets(env, user.id);
    const input = normalizeBattleLog(body, targets);
    // Recommendations retain an ordinary-Raid allocator flag. Do not mistake
    // that legacy false flag for a prohibition on Remote Max participation.
    if (body.recommendation_key) {
      const metas = await getMeta(env);
      const recs = await currentRecommendations(env, user, targets, metas);
      const rec = recs.find(item => [
        item.battle_system || "raid", item.battle_variant || "", item.pokemon_name
      ].join("|") === body.recommendation_key);
      if (rec && targetBattleKey(rec) !== targetBattleKey(input)) {
        throw new BattleLogError("Battle selection no longer matches its recommendation.");
      }
      if (rec?.logging_remote_eligible === false && input.participation === "remote") {
        throw new BattleLogError("This recommendation is local-only.");
      }
    }
    const id = body.request_id == null ? crypto.randomUUID() : String(body.request_id);
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id)) throw new BattleLogError("Invalid battle request ID.");
    const row = await createBattleLog(env.DB, user.id, localDateForTimezone(user.timezone), nowIso(), id, input);
    const remoteLimitUsed = row.participation === "remote"
      ? await remoteBattleUsageForDate(env, user.id, row.local_date)
      : null;
    return json({
      ok: true, ...row, log_id: row.id, raid_type: row.participation,
      raid_count: row.battle_count, target_updated: Boolean(row.target_id),
      remote_raids_used: row.participation === "remote" && row.battle_system === "raid"
        ? await remoteRaidUsageForDate(env, user.id, row.local_date) : null,
      remote_battles_used: remoteLimitUsed,
      remote_limit_used: remoteLimitUsed
    });
  } catch (error) {
    const mapped = battleStorageError(error);
    if (mapped instanceof BattleLogError) return bad(mapped.message, mapped.status);
    throw error;
  }
}

export async function undoRaidLogApi(request, env) {
  const body = await request.json();
  const user = await userByManageToken(env, body.token);
  if (!user) return bad("Invalid management link.", 401);
  if (!body.log_id) return bad("Battle log ID is required.");
  try {
    let source = body.log_source;
    if (!source) {
      // Compatibility with callers of the old /api/raid-log/undo endpoint.
      const row = await env.DB.prepare("SELECT log_source FROM unified_battle_log WHERE id = ? AND user_id = ?")
        .bind(String(body.log_id), user.id).first();
      const legacy = !row && await env.DB.prepare("SELECT id FROM raid_log WHERE id = ? AND user_id = ?")
        .bind(String(body.log_id), user.id).first();
      source = row?.log_source || (legacy ? "legacy" : "battle");
    }
    if (!["battle", "legacy"].includes(source)) return bad("Invalid log source.");
    await undoBattleLog(env.DB, user.id, String(body.log_id), nowIso(), source);
    return json({ ok: true, log_id: body.log_id });
  } catch (error) {
    const mapped = battleStorageError(error);
    if (mapped instanceof BattleLogError) return bad(mapped.message, mapped.status);
    throw error;
  }
}

export async function updateRemoteRaidUsage(request, env) {
  const body = await request.json();
  const user = await userByManageToken(env, body.token);
  if (!user) return bad("Invalid management link.", 401);

  const sharedCorrection = body.remote_battles_used != null;
  const requested = Number(
    sharedCorrection
      ? body.remote_battles_used
      : body.raids_used
  );

  if (!Number.isFinite(requested) || requested < 0 || requested > 999) {
    return bad(
      `${sharedCorrection ? "Remote battles" : "Remote Raids"} used must be a number between 0 and 999.`
    );
  }

  const localDate = localDateForTimezone(user.timezone);
  const timestamp = nowIso();
  const remoteMaxUsed = await remoteMaxPassUsageForDate(
    env,
    user.id,
    localDate
  );

  const requestedWhole = Math.floor(requested);

  if (sharedCorrection && requestedWhole < remoteMaxUsed) {
    return bad(
      `Shared Remote usage cannot be lower than the ${remoteMaxUsed} Remote Max Pass${remoteMaxUsed === 1 ? "" : "es"} already recorded today. Correct Remote Max usage first.`
    );
  }

  // Keep the existing ordinary-Raid ledger backward compatible. A shared
  // correction stores only the ordinary-Raid remainder after recorded Remote
  // Max usage; reads add the two ledgers back together for the official cap.
  const ordinaryRaidsUsed = sharedCorrection
    ? requestedWhole - remoteMaxUsed
    : requestedWhole;

  await env.DB.prepare(`
    INSERT INTO remote_raid_usage (
      user_id, local_date, raids_used, updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, local_date) DO UPDATE SET
      raids_used = excluded.raids_used,
      updated_at = excluded.updated_at
  `).bind(
    user.id,
    localDate,
    ordinaryRaidsUsed,
    timestamp
  ).run();

  const remoteLimitUsed = ordinaryRaidsUsed + remoteMaxUsed;

  return json({
    ok: true,
    local_date: localDate,
    raids_used: ordinaryRaidsUsed,
    remote_max_passes_used: remoteMaxUsed,
    remote_battles_used: remoteLimitUsed,
    remote_limit_used: remoteLimitUsed
  });
}


export async function targetOptionsForUser(
  env,
  user,
  targets,
  metas,
  recommendations,
  pokedex = null
) {
  const battlePokedex = Array.isArray(pokedex)
    ? pokedex
    : await currentBattleMatchPokedex();

  const today = localDateForTimezone(user.timezone);
  const horizon = addDaysIso(today, 30);
  const raidTypes = [...RAID_SOURCE_TYPES];
  const placeholders = raidTypes.map(() => "?").join(",");

  const rules = await eventSuppressionRules(
    env,
    today,
    horizon
  );

  const { results } = await env.DB.prepare(`
    SELECT *
    FROM events
    WHERE status = 'active'
      AND source_type IN (${placeholders})
      AND COALESCE(end_date, start_date, '9999-12-31') >= ?
      AND COALESCE(start_date, '0000-01-01') <= ?
    ORDER BY
      CASE
        WHEN source_uid LIKE 'official-supplement:%' THEN 0
        ELSE 1
      END,
      start_date,
      summary
    LIMIT 500
  `).bind(
    ...raidTypes,
    today,
    horizon
  ).all();

  const current = new Map();
  const upcoming = new Map();
  const existing = new Map();

  const addOption = (map, name, extra = {}) => {
    const clean = String(name || "").trim();
    if (!clean) return;

    const identity = targetBattleMetadata({...extra,pokemon_name:clean});
    const key = targetBattleKey({...identity,pokemon_name:clean});

    if (!map.has(key)) {
      map.set(key, {
        name: clean,
        ...extra,
        ...identity
      });
    }
  };

  for (const recommendation of recommendations) {
    addOption(
      current,
      recommendation.pokemon_name,
      {
        ...targetBattleMetadata(recommendation),
        source: "current_recommendation"
      }
    );
  }

  for (const event of results) {
    const visibleSegments =
      visibleEventSegments(
        event,
        rules
      );

    if (!visibleSegments.length) {
      continue;
    }

    const matches =
      findMatches(
        event.summary,
        targets,
        metas,
        event,
        battlePokedex
      );

    for (const match of matches) {
      const isCurrent =
        visibleSegments.some(
          (segment) =>
            segment.start_date <= today &&
            segment.end_date >= today
        );

      if (isCurrent) {
        addOption(
          current,
          match.name,
          {
            ...battleOpportunityMetadata(event,{pokemonName:match.name}),
            source: "current_event"
          }
        );
      } else {
        addOption(
          upcoming,
          match.name,
          {
            ...battleOpportunityMetadata(event,{pokemonName:match.name}),
            source: "upcoming_event"
          }
        );
      }
    }
  }

  for (const target of targets) {
    addOption(
      existing,
      target.pokemon_name,
      {
        ...targetBattleMetadata(target),
        source: "existing_target"
      }
    );
  }

  // Remove duplicates from lower-priority groups.
  for (const key of current.keys()) {
    upcoming.delete(key);
    existing.delete(key);
  }

  for (const key of upcoming.keys()) {
    existing.delete(key);
  }

  const sortOptions = (map) =>
    [...map.values()].sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          {
            sensitivity: "base",
            numeric: true
          }
        )
    );

  return {
    current:
      sortOptions(current),

    upcoming:
      sortOptions(upcoming),

    existing:
      sortOptions(existing),

    horizon_days: 30
  };
}




function recommendationCoLeaders(
  recommendations
) {
  const eligible =
    (recommendations || [])
      .filter(
        rec =>
          !Number(
            rec.target?.completed
          ) &&
          String(
            rec.target?.priority || ""
          ).toLowerCase() !== "skip"
      );

  if (!eligible.length) {
    return [];
  }

  const first =
    eligible[0];

  const visibleScore =
    Math.round(
      Number(first.score || 0)
    );

  const label =
    String(
      first.label || ""
    );

  return eligible
    .filter(
      rec =>
        Math.round(
          Number(rec.score || 0)
        ) === visibleScore &&
        String(
          rec.label || ""
        ) === label
    )
    .map(rec => ({
      pokemon_name:
        rec.pokemon_name,
      score:
        rec.score,
      label:
        rec.label,
      emoji:
        rec.emoji,
      recommendation_score:
        rec.recommendation_score ??
        rec.score,
      planning_score:
        rec.planning_score ??
        rec.score,
      score_basis:
        rec.score_basis || null,
      planning_rationale:
        rec.planning_rationale || null,
      source_kind:
        rec.source_kind,
      source_label:
        rec.source_label,
      battle_system:
        rec.battle_system || "raid",
      battle_variant:
        rec.battle_variant || null,
      max_particle_cost:
        rec.max_particle_cost ?? null,
      sprite_url:
        rec.sprite_url ||
        rec.meta?.sprite_url ||
        null
    }));
}


function normalizedRecommendationNames(day) {
  return (day?.top_recommendations || [])
    .map(item =>
      normalizeName(item.pokemon_name)
    )
    .filter(Boolean)
    .join("|");
}

function dashboardOverview(
  recommendations,
  remoteRaidPlan
) {
  const topPicks =
    recommendationCoLeaders(
      recommendations
    );

  const topPick =
    topPicks[0] || null;

  const forecast =
    remoteRaidPlan.budget_forecast || [];

  const today =
    forecast[0] || null;

  const todayNames =
    normalizedRecommendationNames(today);

  let nextChange = null;

  for (const day of forecast.slice(1)) {
    const names =
      normalizedRecommendationNames(day);

    if (names && names !== todayNames) {
      nextChange = {
        date: day.date,
        label: day.label,
        top_recommendations:
          day.top_recommendations || [],
        recommended_budget:
          day.recommended_budget
      };
      break;
    }
  }

  if (!nextChange && forecast.length > 1) {
    const day = forecast[1];
    nextChange = {
      date: day.date,
      label: day.label,
      top_recommendations:
        day.top_recommendations || [],
      recommended_budget:
        day.recommended_budget
    };
  }

  return {
    local_date:
      remoteRaidPlan.local_date,
    top_pick:
      topPick,
    top_picks:
      topPicks,
    top_pick_is_tie:
      topPicks.length > 1,
    paid_raid_guidance:
      remoteRaidPlan.purchase_advice,
    planner_budget:
      remoteRaidPlan.system_recommended_budget,
    effective_budget:
      remoteRaidPlan.effective_budget_cap,
    next_change:
      nextChange
  };
}

async function dataFreshnessForDashboard(env) {
  const row =
    await env.DB.prepare(`
      SELECT
        (
          SELECT MAX(updated_at)
          FROM events
          WHERE source_uid NOT LIKE 'official-supplement:%'
        ) AS event_feeds_updated_at,

        (
          SELECT MAX(updated_at)
          FROM events
          WHERE source_uid LIKE 'official-supplement:%'
        ) AS official_events_updated_at,

        (
          SELECT MAX(updated_at)
          FROM remote_raid_limit_overrides
          WHERE active = 1
        ) AS remote_rules_updated_at,

        (
          SELECT MAX(updated_at)
          FROM event_suppression_rules
          WHERE active = 1
        ) AS suppressions_updated_at,

        (
          SELECT MAX(updated_at)
          FROM pokemon_meta
        ) AS meta_updated_at
    `).first();

  const officialCandidates = [
    row?.official_events_updated_at,
    row?.remote_rules_updated_at,
    row?.suppressions_updated_at
  ]
    .filter(Boolean)
    .sort();

  return {
    event_feeds:
      row?.event_feeds_updated_at || null,
    official_schedules:
      officialCandidates.length
        ? officialCandidates[officialCandidates.length - 1]
        : null,
    raid_assessments:
      row?.meta_updated_at || null
  };
}



function cleanTypeName(typeObject) {
  const raw =
    typeObject?.names?.English ||
    typeObject?.type ||
    "";

  return String(raw)
    .replace(/^POKEMON_TYPE_/i, "")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase()
    );
}

function catalogDisplayName(
  pokemon,
  fallback = ""
) {
  return String(
    pokemon?.names?.English ||
    pokemon?.name?.English ||
    fallback ||
    ""
  ).trim();
}

function catalogAssets(
  pokemon
) {
  return {
    sprite_url:
      pokemon?.assets?.image ||
      null,
    shiny_sprite_url:
      pokemon?.assets
        ?.shinyImage ||
      null
  };
}

function compactCatalogEntry(
  pokemon,
  options = {}
) {
  const name =
    catalogDisplayName(
      pokemon,
      options.name
    );

  const stats =
    pokemon?.stats || {};

  const dexNr =
    Number(
      pokemon?.dexNr ??
      options.dexNr
    );

  if (
    !name ||
    !Number.isFinite(dexNr) ||
    !Number.isFinite(
      Number(stats.attack)
    ) ||
    !Number.isFinite(
      Number(stats.defense)
    ) ||
    !Number.isFinite(
      Number(stats.stamina)
    )
  ) {
    return null;
  }

  const primaryType =
    cleanTypeName(
      pokemon.primaryType
    );

  const secondaryType =
    cleanTypeName(
      pokemon.secondaryType
    );

  const types =
    [
      primaryType,
      secondaryType
    ].filter(Boolean);

  const formId =
    String(
      pokemon.formId ||
      pokemon.form ||
      options.formId ||
      ""
    );

  const kind =
    options.kind ||
    "base";

  const {
    sprite_url,
    shiny_sprite_url
  } =
    catalogAssets(
      pokemon
    );

  return {
    key:
      [
        dexNr,
        kind,
        normalizeName(name),
        normalizeName(formId)
      ].join("|"),
    dex_nr:
      dexNr,
    name,
    form_id:
      formId || null,
    kind,
    attack:
      Number(stats.attack),
    defense:
      Number(stats.defense),
    stamina:
      Number(stats.stamina),
    types,
    sprite_url,
    shiny_sprite_url
  };
}

function buildPokemonCatalog(
  pokedex
) {
  const map =
    new Map();

  const add =
    entry => {
      if (!entry) {
        return;
      }

      const dedupeKey =
        [
          normalizeName(
            entry.name
          ),
          entry.attack,
          entry.defense,
          entry.stamina,
          entry.types.join("/")
        ].join("|");

      if (
        !map.has(
          dedupeKey
        )
      ) {
        map.set(
          dedupeKey,
          entry
        );
      }
    };

  for (
    const pokemon of
    Array.isArray(pokedex)
      ? pokedex
      : []
  ) {
    add(
      compactCatalogEntry(
        pokemon,
        {
          kind: "base"
        }
      )
    );

    for (
      const [
        formKey,
        formPokemon
      ] of
      Object.entries(
        pokemon.regionForms || {}
      )
    ) {
      add(
        compactCatalogEntry(
          formPokemon,
          {
            kind: "regional",
            dexNr:
              pokemon.dexNr,
            formId:
              formKey
          }
        )
      );
    }

    for (
      const [
        megaKey,
        megaPokemon
      ] of
      Object.entries(
        pokemon.megaEvolutions || {}
      )
    ) {
      const fallbackName =
        megaKey
          .replace(/_/g, " ")
          .replace(
            /\b\w/g,
            character =>
              character.toUpperCase()
          );

      add(
        compactCatalogEntry(
          megaPokemon,
          {
            kind:
              /primal/i.test(
                fallbackName
              )
                ? "primal"
                : "mega",
            dexNr:
              pokemon.dexNr,
            formId:
              megaKey,
            name:
              catalogDisplayName(
                megaPokemon,
                fallbackName
              )
          }
        )
      );
    }
  }

  return [...map.values()]
    .sort(
      (a, b) =>
        a.dex_nr - b.dex_nr ||
        a.name.localeCompare(
          b.name
        )
    );
}

async function pokemonCatalogApi(
  request,
  env
) {
  const requestUrl =
    new URL(
      request.url
    );

  const cacheUrl =
    new URL(
      requestUrl.origin +
      "/api/pokemon-catalog?v=2"
    );

  const cacheKey =
    new Request(
      cacheUrl.toString(),
      {
        method: "GET"
      }
    );

  const cache =
    caches.default;

  const cached =
    await cache.match(
      cacheKey
    );

  if (cached) {
    return cached;
  }

  const response =
    await fetch(
      POGO_API_POKEDEX
    );

  if (!response.ok) {
    return bad(
      `Pokédex source returned ${response.status}.`,
      502
    );
  }

  const pokedex =
    await response.json();

  const entries =
    buildPokemonCatalog(
      pokedex
    );

  const result =
    json(
      {
        source:
          POGO_API_POKEDEX,
        generated_at:
          nowIso(),
        entries
      },
      200,
      {
        "cache-control":
          "public, max-age=21600"
      }
    );

  await cache.put(
    cacheKey,
    result.clone()
  );

  return result;
}


async function getMe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const user = await userByManageToken(env, token);
  if (!user) return bad("Invalid management link.", 401);

  const targets = await getTargets(env, user.id);
  const metas = await getMeta(env);
  const recommendations = await currentRecommendations(env, user, targets, metas);
  const remoteRaidPlan = await remoteRaidPlanForUser(
    env,
    user,
    recommendations,
    targets,
    metas
  );
  const battleResourcePlan =
    await battleResourcePlanForUser(
      env,
      user,
      recommendations,
      remoteRaidPlan
    );

  const targetOptions = await targetOptionsForUser(
    env,
    user,
    targets,
    metas,
    recommendations
  );

  const dataFreshness =
    await dataFreshnessForDashboard(env);

  const raidActivity =
    await raidActivityForUser(
      env,
      user,
      metas
    );

  const dashboard =
    dashboardOverview(
      recommendations,
      remoteRaidPlan
    );

  return json({
    user: {
      timezone: user.timezone,
      included_sources: parseSources(user),
      pve_weight: user.pve_weight,
      pvp_weight: user.pvp_weight,
      collector_weight: user.collector_weight,
      remote_raid_budget: user.remote_raid_budget,
      remote_raid_min_score:
        user.remote_raid_min_score == null
          ? DEFAULT_REMOTE_RAID_MIN_SCORE
          : user.remote_raid_min_score
    },
    targets:
      targets.map(
        target => ({
          ...target,
          ...targetBattleMetadata(target),
          sprite_url:
            targetSpriteUrl(
              target,
              metas
            ),
          raid_rankings_json: targetBattleKind(target) !== "raid" ? null :
            raidRankingsJsonForPokemonName(
              target.pokemon_name,
              metas
            ),
          max_rankings_json: targetBattleKind(target) === "raid" ? null :
            maxRankingsJsonForPokemonName(
              target.pokemon_name,
              metas
            )
        })
      ),
    recommendations,
    remote_raid_plan: remoteRaidPlan,
    battle_resource_plan:
      battleResourcePlan,
    battle_activity: raidActivity,
    raid_activity:
      raidActivity,
    target_options: targetOptions,
    dashboard,
    data_freshness: dataFreshness,
    available_sources: Object.keys(SOURCES)
  });
}

async function updateSettings(request, env) {
  const body = await request.json();
  const user = await userByManageToken(env, body.token);
  if (!user) return bad("Invalid management link.", 401);

  const included = Array.isArray(body.included_sources)
    ? body.included_sources.filter((item) => SOURCES[item])
    : parseSources(user);

  const pve = clamp(Number(body.pve_weight ?? user.pve_weight), 0, 2);
  const pvp = clamp(Number(body.pvp_weight ?? user.pvp_weight), 0, 2);
  const collector = clamp(Number(body.collector_weight ?? user.collector_weight), 0, 2);
  const timezone = String(body.timezone || user.timezone).slice(0, 80);

  let remoteRaidBudget = null;
  if (body.remote_raid_budget !== "" && body.remote_raid_budget != null) {
    const value = Number(body.remote_raid_budget);
    if (!Number.isFinite(value) || value < 0 || value > 999) {
      return bad("Remote Raid budget must be blank (Auto) or a number between 0 and 999.");
    }
    remoteRaidBudget = Math.floor(value);
  }

  const remoteRaidMinScore = clamp(
    Number(body.remote_raid_min_score ?? user.remote_raid_min_score ?? DEFAULT_REMOTE_RAID_MIN_SCORE),
    0,
    100
  );

  await env.DB.prepare(`
    UPDATE users
    SET timezone = ?,
        included_sources = ?,
        pve_weight = ?,
        pvp_weight = ?,
        collector_weight = ?,
        remote_raid_budget = ?,
        remote_raid_min_score = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    timezone,
    JSON.stringify(included),
    pve,
    pvp,
    collector,
    remoteRaidBudget,
    remoteRaidMinScore,
    nowIso(),
    user.id
  ).run();

  return json({ ok: true });
}

export async function upsertTarget(request, env) {
  const body = await request.json();
  const user = await userByManageToken(env, body.token);
  if (!user) return bad("Invalid management link.", 401);
  const name = String(body.pokemon_name || "").trim();
  if (!name || name.length > 200) return bad("Pokémon/form name is required (up to 200 characters).");
  const kind = body.battle_kind ?? namedTargetKind(name) ?? "raid";
  if (!["raid","dynamax","gigantamax"].includes(kind) || (namedTargetKind(name) && namedTargetKind(name) !== kind)) {
    return bad("Choose the battle type matching this Pokémon/form.");
  }
  if (!globalThis.BattleTargets.formName(name,kind)) return bad("Enter a Pokémon name as well as its battle type.");
  const targetType = String(body.target_type || (kind === "raid" ? "mega_energy" : "battles"));
  if (!["mega_energy","raids","battles","candy_xl","candy","custom"].includes(targetType)) return bad("Choose a supported goal type.");
  if (kind !== "raid" && targetType === "mega_energy") return bad("Mega Energy goals require an ordinary Raid target.");
  const targetValue = body.target_value === "" || body.target_value == null ? null : Number(body.target_value);
  const currentValue = body.current_value === "" || body.current_value == null ? 0 : Number(body.current_value);
  const expected = body.expected_progress_per_raid === "" || body.expected_progress_per_raid == null ? null : Number(body.expected_progress_per_raid);
  if ((targetValue != null && (!Number.isFinite(targetValue) || targetValue < 0)) || !Number.isFinite(currentValue) || currentValue < 0) return bad("Progress and desired target must be non-negative numbers.");
  if (expected != null && (!Number.isFinite(expected) || expected <= 0)) return bad("Expected progress per battle must be blank or greater than 0.");
  const priority = ["high","medium","low","skip"].includes(body.priority) ? body.priority : "medium";
  const targets = await getTargets(env,user.id);
  const identity = {pokemon_name:name,battle_kind:kind};
  const existing = body.id ? targets.find(t => t.id === String(body.id))
    : matchingBattleTargets(targets,identity).find(t => t.target_type === targetType);
  if (body.id && !existing) return bad("Target not found.",404);
  if (!body.id && body.battle_kind != null && existing) return bad("This target already exists. Use Edit to change its progress or settings.",409);
  if (existing && (targetBattleKey(existing) !== targetBattleKey(identity) || existing.target_type !== targetType)) {
    return bad("Pokémon, battle type and goal identify a target. Create a new target for a different identity.");
  }
  // Existing IDs and names stay intact so historical Undo retains its target.
  const pokemonName = existing?.pokemon_name || canonicalTargetName(name,kind);
  const id = existing?.id || await sha256Hex(`${user.id}|${normalizeName(pokemonName)}|${targetType}`);
  const timestamp = nowIso();
  try {
    const saved = await env.DB.prepare(`
      INSERT INTO targets (id,user_id,pokemon_name,target_type,battle_kind,target_value,
        current_value,expected_progress_per_raid,priority,completed,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET target_value=excluded.target_value,current_value=excluded.current_value,
        battle_kind=excluded.battle_kind,expected_progress_per_raid=excluded.expected_progress_per_raid,
        priority=excluded.priority,completed=excluded.completed,notes=excluded.notes,updated_at=excluded.updated_at
        WHERE targets.user_id=excluded.user_id AND ?
    `).bind(id,user.id,pokemonName,targetType,kind,targetValue,currentValue,expected,priority,
      body.completed === true || body.completed === 1 || body.completed === "1" ? 1 : 0,
      String(body.notes || "").slice(0,2000),existing?.created_at || timestamp,timestamp,existing ? 1 : 0).run();
    if (!saved.meta?.changes) return bad("This target already exists. Use Edit to change it.",409);
  } catch (error) {
    if (/no column named battle_kind|no such column:.*battle_kind/i.test(String(error.message))) return bad("Targets need migrations/0003_target_battle_kind.sql. No changes were saved.",503);
    throw error;
  }
  return json({ok:true,id});
}

async function deleteTarget(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const id = url.searchParams.get("id");
  const user = await userByManageToken(env, token);
  if (!user) return bad("Invalid management link.", 401);
  if (!id) return bad("Target id is required.");

  await env.DB.prepare(`
    DELETE FROM targets
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).run();

  return json({ ok: true });
}

async function bulkDeleteTargets(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const user = await userByManageToken(env, body?.token);
  if (!user) return bad("Invalid management link.", 401);

  const ids = [...new Set(
    (Array.isArray(body?.target_ids) ? body.target_ids : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  )];

  if (!ids.length) return bad("Select at least one target.");
  if (ids.length > 200) return bad("Too many targets selected.");

  const results = await env.DB.batch(
    ids.map((id) => env.DB.prepare(`
      DELETE FROM targets
      WHERE id = ? AND user_id = ?
    `).bind(id, user.id))
  );

  const deleted = results.reduce(
    (sum, result) => sum + Number(result?.meta?.changes || 0),
    0
  );

  return json({ ok: true, deleted });
}

function targetTypeLabel(type) {
  return {
    mega_energy: "Mega Energy",
    raids: "Raids",
    battles: "Battles won",
    candy_xl: "Candy XL",
    candy: "Candy",
    custom: "Progress"
  }[type] || type;
}


function calendarEventDedupeKey(event, targets, metas) {
  if (event.source_type === "raid_battles") {
    const matches = findMatches(event.summary, targets, metas, event);

    if (matches.length) {
      return [
        "raid",
        event.start_date || "",
        normalizeName(matches[0].name)
      ].join("|");
    }
  }

  return (
    event.source_uid ||
    `${normalizeName(event.summary)}|${event.dtstart_line}|${event.dtend_line || ""}`
  );
}

function isOfficialSupplementEvent(event) {
  return String(event.source_uid || "")
    .startsWith("official-supplement:");
}


function parseSuppressedSourceTypes(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function eventSuppressionRules(
  env,
  startDate = "0000-01-01",
  endDate = "9999-12-31"
) {
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM event_suppression_rules
    WHERE active = 1
      AND start_date <= ?
      AND end_date >= ?
    ORDER BY start_date, event_name
  `).bind(endDate, startDate).all();

  return results.map((rule) => ({
    ...rule,
    suppressed_source_types:
      parseSuppressedSourceTypes(
        rule.suppressed_source_types
      )
  }));
}

function eventIsSuppressedByRules(event, rules) {
  if (isOfficialSupplementEvent(event)) {
    return false;
  }

  const eventStart =
    event.start_date ||
    "0000-01-01";

  const eventEnd =
    event.end_date ||
    event.start_date ||
    "9999-12-31";

  return rules.some((rule) => {
    if (
      !rule.suppressed_source_types.includes(
        event.source_type
      )
    ) {
      return false;
    }

    const overlaps =
      eventStart <= rule.end_date &&
      eventEnd >= rule.start_date;

    return overlaps;
  });
}


function visibleEventSegments(event, rules) {
  if (
    isOfficialSupplementEvent(event) ||
    !event.start_date
  ) {
    return [event];
  }

  const applicableRules =
    rules.filter((rule) =>
      rule.suppressed_source_types.includes(
        event.source_type
      )
    );

  if (!applicableRules.length) {
    return [event];
  }

  let segments = [{
    start_date:
      event.start_date,

    end_date:
      event.end_date ||
      event.start_date
  }];

  for (const rule of applicableRules) {
    const nextSegments = [];

    for (const segment of segments) {
      const overlaps =
        segment.start_date <= rule.end_date &&
        segment.end_date >= rule.start_date;

      if (!overlaps) {
        nextSegments.push(segment);
        continue;
      }

      if (
        segment.start_date <
        rule.start_date
      ) {
        const beforeEnd =
          addDaysIso(
            rule.start_date,
            -1
          );

        if (
          beforeEnd &&
          segment.start_date <= beforeEnd
        ) {
          nextSegments.push({
            start_date:
              segment.start_date,

            end_date:
              beforeEnd
          });
        }
      }

      if (
        segment.end_date >
        rule.end_date
      ) {
        const afterStart =
          addDaysIso(
            rule.end_date,
            1
          );

        if (
          afterStart &&
          afterStart <= segment.end_date
        ) {
          nextSegments.push({
            start_date:
              afterStart,

            end_date:
              segment.end_date
          });
        }
      }
    }

    segments = nextSegments;
  }

  return segments.map(
    (segment, index) =>
      eventForVisibleSegment(
        event,
        segment.start_date,
        segment.end_date,
        index
      )
  );
}

function replaceDateInIcsPropertyLine(
  line,
  dateValue
) {
  if (!line || !dateValue) {
    return line;
  }

  const colon =
    line.indexOf(":");

  if (colon < 0) {
    return line;
  }

  const left =
    line.slice(0, colon);

  const value =
    line.slice(colon + 1);

  const compact =
    compactIcsDate(dateValue);

  const replaced =
    value.replace(
      /^\d{8}/,
      compact
    );

  return `${left}:${replaced}`;
}

function isAllDayIcsLine(line) {
  if (!line) return false;

  return (
    /;VALUE=DATE(?:;|:)/i.test(line) ||
    /:\d{8}$/.test(line)
  );
}

function eventForVisibleSegment(
  event,
  startDate,
  endDate,
  index
) {
  const clone = {
    ...event,

    start_date:
      startDate,

    end_date:
      endDate,

    source_uid:
      `${event.source_uid || event.id || "event"}:visible:${startDate}:${endDate}:${index}`,

    id:
      `${event.id || "event"}:visible:${startDate}:${endDate}:${index}`
  };

  clone.dtstart_line =
    replaceDateInIcsPropertyLine(
      event.dtstart_line,
      startDate
    );

  if (
    isAllDayIcsLine(
      event.dtstart_line
    )
  ) {
    const exclusiveEnd =
      addDaysIso(
        endDate,
        1
      );

    clone.dtend_line =
      `DTEND;VALUE=DATE:${compactIcsDate(exclusiveEnd)}`;
  } else if (event.dtend_line) {
    clone.dtend_line =
      replaceDateInIcsPropertyLine(
        event.dtend_line,
        endDate
      );
  }

  return clone;
}




function personalizeEvent(event, user, targets, metas) {
  const matches = findMatches(event.summary, targets, metas, event);
  const recommendations = matches.map((match) =>
    recommendationFor(match.name, match.meta, match.target, user)
  );

  recommendations.sort((a, b) => b.score - a.score);
  const best = recommendations[0];

  let title = event.summary;
  if (best) {
    title = `${best.emoji} ${event.summary}`;
  }

  const sections = [];
  if (event.description) sections.push(event.description.trim());

  if (recommendations.length) {
    const lines = ["PERSONAL RAID RECOMMENDATION"];

    for (const rec of recommendations.slice(0, 5)) {
      lines.push("");
      lines.push(`${rec.emoji} ${rec.pokemon_name}: ${rec.label} (${rec.score}/100)`);

      if (rec.target) {
        const t = rec.target;
        const typeLabel = targetTypeLabel(t.target_type);
        if (t.target_value != null) {
          lines.push(
            `${typeLabel}: ${Number(t.current_value || 0).toLocaleString()} / ${Number(t.target_value).toLocaleString()}`
          );
        } else {
          lines.push(`${typeLabel}: ${Number(t.current_value || 0).toLocaleString()}`);
        }
        if (Number(t.completed)) lines.push("Personal target: COMPLETE");
      }

      if (rec.meta?.verdict) lines.push(`Internet assessment: ${rec.meta.verdict}`);
      for (const reason of rec.reasons.slice(0, 4)) {
        lines.push(`• ${reason}`);
      }
    }

    sections.push(lines.join("\n"));
  }

  return {
    title,
    description: sections.filter(Boolean).join("\n\n──────────\n"),
    best
  };
}

function buildVevent(event, personalized) {
  const lines = ["BEGIN:VEVENT"];

  if (event.other_lines) {
    for (const line of event.other_lines.split("\n")) {
      if (line) lines.push(line);
    }
  }

  lines.push(event.dtstart_line);

  let effectiveDtendLine =
    event.dtend_line || null;

  if (
    !effectiveDtendLine &&
    event.end_date &&
    isAllDayIcsLine(event.dtstart_line)
  ) {
    const exclusiveEnd =
      addDaysIso(
        event.end_date,
        1
      );

    if (exclusiveEnd) {
      effectiveDtendLine =
        `DTEND;VALUE=DATE:${compactIcsDate(exclusiveEnd)}`;
    }
  }

  if (effectiveDtendLine) {
    lines.push(effectiveDtendLine);
  }

  lines.push(`SEQUENCE:${Number(event.sequence || 0)}`);

  if (event.status === "stale") {
    lines.push("STATUS:CANCELLED");
  }

  lines.push(`SUMMARY:${escapeIcs(personalized.title)}`);

  if (personalized.description) {
    lines.push(`DESCRIPTION:${escapeIcs(personalized.description)}`);
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

async function calendarFeedForUser(request, env, user) {
  const included = parseSources(user);
  if (!included.length) {
    return new Response(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Pokemon GO Personal Calendar//EN\r\nEND:VCALENDAR\r\n",
      {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "cache-control": "private, max-age=60"
        }
      }
    );
  }

  const targets = await getTargets(env, user.id);
  const metas = await getMeta(env);
  const placeholders = included.map(() => "?").join(",");

  const { results: events } = await env.DB.prepare(`
    SELECT *
    FROM events
    WHERE source_type IN (${placeholders})
      AND (
        status = 'active'
        OR (
          status = 'stale'
          AND COALESCE(end_date, start_date, '0000-01-01') >= date('now', '-14 days')
        )
      )
    ORDER BY
      COALESCE(start_date, '9999-12-31'),
      CASE
        WHEN source_uid LIKE 'official-supplement:%' THEN 0
        ELSE 1
      END,
      summary
    LIMIT 1500
  `).bind(...included).all();

  const rules =
    await eventSuppressionRules(
      env
    );

  const dedupe = new Set();
  const vevents = [];

  for (const rawEvent of events) {
    const visibleSegments =
      visibleEventSegments(
        rawEvent,
        rules
      );

    for (const event of visibleSegments) {
      const key =
        event.source_uid ||
        `${normalizeName(event.summary)}|${event.dtstart_line}|${event.dtend_line || ""}`;

      if (dedupe.has(key)) continue;
      dedupe.add(key);

      const personalized =
        personalizeEvent(
          event,
          user,
          targets,
          metas
        );

      vevents.push(
        buildVevent(
          event,
          personalized
        )
      );
    }
  }

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//Pokemon GO Personal Calendar//EN",
    "X-WR-CALNAME:Pokémon GO — Personal",
    ...vevents,
    "END:VCALENDAR",
    ""
  ].join("\r\n");

  const etag = `"${await sha256Hex(calendar)}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag }
    });
  }

  return new Response(calendar, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="pokemon-go-personal.ics"',
      "cache-control": "private, max-age=60, must-revalidate",
      etag
    }
  });
}

async function calendarFeed(request, env, feedToken) {
  const user = await userByFeedToken(env, feedToken);
  if (!user) {
    return new Response("Calendar not found.", { status: 404 });
  }

  return calendarFeedForUser(request, env, user);
}

async function recoverableCalendarFeed(request, env, userId, signature) {
  if (!env.FEED_LINK_KEY) {
    return new Response("Calendar not found.", { status: 404 });
  }

  const valid = await verifyRecoverableFeedSignature(
    env,
    userId,
    signature
  );

  if (!valid) {
    return new Response("Calendar not found.", { status: 404 });
  }

  const user = await env.DB.prepare(`
    SELECT *
    FROM users
    WHERE id = ?
  `).bind(userId).first();

  if (!user) {
    return new Response("Calendar not found.", { status: 404 });
  }

  return calendarFeedForUser(request, env, user);
}


async function adminMetaList(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return bad("Invalid admin key.", 401);
  }

  const { results: metas } = await env.DB.prepare(`
    SELECT * FROM pokemon_meta
    ORDER BY overall_score DESC, pokemon_name
  `).all();

  const { results: sources } = await env.DB.prepare(`
    SELECT * FROM meta_sources
    ORDER BY pokemon_name, source_name
  `).all();

  return json({
    metas,
    sources,
    automation: {
      enabled: true,
      method: AUTO_META_METHOD_VERSION,
      sources: [
        "Pokémon GO API (stats/moves)",
        "PvPoke (Master League ranking score)",
        "GO Calendar event availability window"
      ]
    }
  });
}



async function adminRemoteRaidLimits(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return bad("Invalid admin key.", 401);
  }

  const { results } = await env.DB.prepare(`
    SELECT
      id,
      event_name,
      start_date,
      end_date,
      remote_raid_limit,
      source_url,
      active,
      updated_at,
      COALESCE(is_unlimited, 0) AS is_unlimited,
      COALESCE(detected_automatically, 0) AS detected_automatically,
      source_excerpt,
      detected_at
    FROM remote_raid_limit_overrides
    ORDER BY start_date DESC, end_date DESC, remote_raid_limit DESC
    LIMIT 100
  `).all();

  return json({ rules: results });
}


async function adminOfficialRaidSupplements(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return bad("Invalid admin key.", 401);
  }

  const { results } = await env.DB.prepare(`
    SELECT
      id,
      source_type,
      summary,
      description,
      start_date,
      end_date,
      source_url,
      status,
      updated_at
    FROM events
    WHERE source_uid LIKE 'official-supplement:%'
    ORDER BY
      start_date DESC,
      summary
    LIMIT 100
  `).all();

  return json({
    events: results
  });
}



async function adminSuppressionRules(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return bad("Invalid admin key.", 401);
  }

  const { results } = await env.DB.prepare(`
    SELECT *
    FROM event_suppression_rules
    ORDER BY start_date DESC, event_name
    LIMIT 100
  `).all();

  return json({
    rules: results.map((rule) => ({
      ...rule,
      suppressed_source_types:
        parseSuppressedSourceTypes(
          rule.suppressed_source_types
        )
    }))
  });
}


async function readAdminKey(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {}

  if (!env.ADMIN_KEY || body.key !== env.ADMIN_KEY) {
    return { ok: false, response: bad("Invalid admin key.", 401) };
  }

  return { ok: true };
}

async function adminSyncEvents(request, env) {
  const auth = await readAdminKey(request, env);
  if (!auth.ok) return auth.response;

  const events = await syncAllEvents(env);

  return json({
    ok: true,
    phase: "events",
    events
  });
}

async function adminSyncRemoteLimits(request, env) {
  const auth = await readAdminKey(request, env);
  if (!auth.ok) return auth.response;

  const remoteRaidLimits = await syncOfficialRemoteRaidLimits(env);

  return json({
    ok: true,
    phase: "remote_raid_limits",
    remote_raid_limits: remoteRaidLimits
  });
}

async function adminSyncMeta(request, env) {
  const auth = await readAdminKey(request, env);
  if (!auth.ok) return auth.response;

  const automaticMeta = await syncAutomaticMeta(env);

  return json({
    ok: true,
    phase: "automatic_meta",
    automatic_meta: automaticMeta
  });
}

async function adminSyncLegacy(request, env) {
  const auth = await readAdminKey(request, env);
  if (!auth.ok) return auth.response;

  return json({
    ok: false,
    error:
      "The old all-in-one sync endpoint is disabled on the Free plan. Use the three phase-specific sync endpoints."
  }, 409);
}

async function asset(request, env, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return env.ASSETS.fetch(new Request(url.toString(), request));
}

async function handleFetch(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (request.method === "POST" && path === "/api/create") {
      return createUser(request, env);
    }

    if (request.method === "GET" && path === "/api/me") {
      return getMe(request, env);
    }

    if (
      request.method === "GET" &&
      path === "/api/pokemon-catalog"
    ) {
      return pokemonCatalogApi(
        request,
        env
      );
    }

    if (request.method === "GET" && path === "/api/calendar-events") {
      return calendarEventsApi(request, env);
    }

    if (request.method === "GET" && path === "/api/feed-link") {
      return feedLinkApi(request, env);
    }

    if (
      request.method === "POST" &&
      path === "/api/feed-link/revoke-legacy"
    ) {
      return revokeLegacyFeedApi(
        request,
        env
      );
    }

    if (request.method === "POST" && path === "/api/settings") {
      return updateSettings(request, env);
    }

    if (request.method === "POST" && path === "/api/remote-raid-usage") {
      return updateRemoteRaidUsage(request, env);
    }

    if (
      request.method === "POST" &&
      path === "/api/battle-resources"
    ) {
      return updateBattleResourcesApi(
        request,
        env
      );
    }

    if (
      request.method === "POST" &&
      (path === "/api/raid-log" || path === "/api/battle-log")
    ) {
      return logRaidApi(
        request,
        env
      );
    }

    if (
      request.method === "POST" &&
      (path === "/api/raid-log/undo" || path === "/api/battle-log/undo")
    ) {
      return undoRaidLogApi(
        request,
        env
      );
    }

    if (
      request.method === "POST" &&
      path === "/api/remote-raid-budget-override"
    ) {
      return updateRemoteRaidBudgetOverride(
        request,
        env
      );
    }

    if (request.method === "POST" && path === "/api/targets") {
      return upsertTarget(request, env);
    }

    if (request.method === "POST" && path === "/api/targets/bulk-delete") {
      return bulkDeleteTargets(request, env);
    }

    if (request.method === "DELETE" && path === "/api/targets") {
      return deleteTarget(request, env);
    }

    if (request.method === "GET" && path === "/api/admin/meta") {
      return adminMetaList(request, env);
    }

    if (request.method === "GET" && path === "/api/admin/remote-limits") {
      return adminRemoteRaidLimits(request, env);
    }

    if (request.method === "GET" && path === "/api/admin/official-raids") {
      return adminOfficialRaidSupplements(request, env);
    }

    if (request.method === "GET" && path === "/api/admin/suppressions") {
      return adminSuppressionRules(request, env);
    }


    if (request.method === "POST" && path === "/api/admin/sync/events") {
      return adminSyncEvents(request, env);
    }

    if (request.method === "POST" && path === "/api/admin/sync/remote-limits") {
      return adminSyncRemoteLimits(request, env);
    }

    if (request.method === "POST" && path === "/api/admin/sync/meta") {
      return adminSyncMeta(request, env);
    }

    if (request.method === "POST" && path === "/api/admin/sync") {
      return adminSyncLegacy(request, env);
    }

    const recoverableCalendarMatch =
      path.match(/^\/calendar\/recover\/([0-9a-fA-F-]{36})\.([A-Za-z0-9_-]+)\.ics$/);

    if (request.method === "GET" && recoverableCalendarMatch) {
      return recoverableCalendarFeed(
        request,
        env,
        recoverableCalendarMatch[1],
        recoverableCalendarMatch[2]
      );
    }

    const calendarMatch = path.match(/^\/calendar\/([A-Za-z0-9_-]+)\.ics$/);
    if (request.method === "GET" && calendarMatch) {
      return calendarFeed(request, env, calendarMatch[1]);
    }

    if (request.method === "GET" && /^\/manage\/[A-Za-z0-9_-]+\/?$/.test(path)) {
      return asset(request, env, "/manage");
    }

    if (request.method === "GET" && path === "/admin") {
      return asset(request, env, "/admin");
    }

    if (request.method === "GET" && path === "/sources") {
      return asset(request, env, "/sources");
    }

    return env.ASSETS.fetch(request);
  } catch (error) {
    console.error(error);
    return json(
      {
        error: "Unexpected server error.",
        detail: String(error.message || error)
      },
      500
    );
  }
}

export default {
  fetch: handleFetch,

  async scheduled(controller, env, ctx) {
    const cron = controller.cron;

    if (cron === "23 */6 * * *") {
      ctx.waitUntil(
        (async () => {
          const result = await syncAllEvents(env);
          console.log("Scheduled event sync:", JSON.stringify(result));
        })()
      );
      return;
    }

    if (cron === "33 */6 * * *") {
      ctx.waitUntil(
        (async () => {
          const result = await syncOfficialRemoteRaidLimits(env);
          console.log(
            "Scheduled official Remote Raid limit sync:",
            JSON.stringify(result)
          );
        })()
      );
      return;
    }

    if (cron === "43 */6 * * *") {
      ctx.waitUntil(
        (async () => {
          const result = await syncAutomaticMeta(env);
          console.log("Scheduled automatic meta sync:", JSON.stringify(result));
        })()
      );
      return;
    }

    console.warn("Unknown Cron Trigger:", cron);
  }
};
