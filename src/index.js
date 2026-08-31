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

const RAID_SOURCE_TYPES = new Set([
  "raid_battles",
  "raid_day",
  "raid_hour",
  "max_battles",
  "max_mondays"
]);

// Only these event classes can consume a Remote Raid Pass.
// Max Battles / Max Mondays are deliberately excluded.
const REMOTE_RAID_SOURCE_TYPES = new Set([
  "raid_battles",
  "raid_day",
  "raid_hour"
]);

const DEFAULT_REMOTE_RAID_LIMIT = 10;
const DEFAULT_REMOTE_RAID_MIN_SCORE = 60;
const REMOTE_RAID_DECAY_PER_RAID = 3;
const DEFAULT_REMOTE_RAID_LIMIT_SOURCE =
  "https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2487-joining-battles-remotely/";

const OFFICIAL_POKEMON_GO_NEWS_URL =
  "https://pokemongo.com/news";

const PINNED_OFFICIAL_EVENT_PAGES = [
  "https://pokemongo.com/gofest/megafinale"
];

const MAX_OFFICIAL_EVENT_PAGES_PER_SYNC = 8;

const PVPOKE_MASTER_LEAGUE =
  "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-10000.json";

const POGO_API_POKEDEX =
  "https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json";

const AUTO_META_METHOD_VERSION = "auto-meta-v1";
const MAX_META_POKEMON_PER_SYNC = 20;

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
      end_date: dateFromPropertyLine(dtendProp?.line || dtstartProp.line),
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
  if (s.includes(`mega ${n}`)) return "mega";
  if (s.includes(`primal ${n}`)) return "primal";
  if (s.includes(`gigantamax ${n}`)) return "gigantamax";
  if (s.includes(`dynamax ${n}`)) return "dynamax";
  return "normal";
}

function displayNameForMatch(pokemonName, kind) {
  if (kind === "mega") return `Mega ${pokemonName}`;
  if (kind === "primal") return `Primal ${pokemonName}`;
  if (kind === "gigantamax") return `Gigantamax ${pokemonName}`;
  if (kind === "dynamax") return `Dynamax ${pokemonName}`;
  return pokemonName;
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

  return results;
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
  const [pokedexRaw, pvpRankings, raidEvents] = await Promise.all([
    fetchJson(POGO_API_POKEDEX, "Pokémon GO API"),
    fetchJson(PVPOKE_MASTER_LEAGUE, "PvPoke"),
    raidEventsForMeta(env)
  ]);

  const pokedex = Array.isArray(pokedexRaw) ? pokedexRaw : [];
  if (!pokedex.length) {
    throw new Error("Pokémon GO API returned no Pokédex entries.");
  }

  const rawPowers = pokedex
    .map(rawPvePower)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

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
      const displayName = displayNameForMatch(match.name, match.kind);
      const key = normalizeName(displayName);
      const pve = percentileScore(rawPowers, rawPvePower(match.pokemon));
      const pvp =
        match.kind === "mega" || match.kind === "primal"
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
        pokemon: match.pokemon
      };

      const existing = bestByDisplayName.get(key);
      if (!existing || candidate.overall > existing.overall) {
        bestByDisplayName.set(key, candidate);
      }
    }
  }

  const candidates = [...bestByDisplayName.values()]
    .sort((a, b) => b.overall - a.overall)
    .slice(0, MAX_META_POKEMON_PER_SYNC);

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
          mega_score, overall_score, verdict, notes, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(pokemon_name) DO UPDATE SET
          pve_score = excluded.pve_score,
          pvp_score = excluded.pvp_score,
          rarity_score = excluded.rarity_score,
          mega_score = excluded.mega_score,
          overall_score = excluded.overall_score,
          verdict = excluded.verdict,
          notes = excluded.notes,
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
  }

  if (statements.length) {
    await env.DB.batch(statements);
  }

  return {
    updated: candidates.length,
    raid_events_considered: raidEvents.length,
    pokedex_entries: pokedex.length,
    method: AUTO_META_METHOD_VERSION,
    write_statements: statements.length,
    truncated:
      bestByDisplayName.size > MAX_META_POKEMON_PER_SYNC
        ? bestByDisplayName.size - MAX_META_POKEMON_PER_SYNC
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

  const origin = new URL(request.url).origin;

  return json({
    ok: true,
    management_url: `${origin}/manage/${manageToken}`,
    calendar_url: `${origin}/calendar/${feedToken}.ics`,
    manage_token: manageToken,
    feed_token: feedToken,
    note: "Save the management URL. There is no account recovery in this starter version."
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
    SELECT *
    FROM pokemon_meta
    ORDER BY pokemon_name
  `).all();
  return results;
}

function findMatches(summary, targets, metas) {
  const haystack = normalizeName(summary);
  const candidates = [];

  for (const meta of metas) {
    const needle = normalizeName(meta.pokemon_name);
    if (needle && haystack.includes(needle)) {
      candidates.push({ name: meta.pokemon_name, meta, target: null, length: needle.length });
    }
  }

  for (const target of targets) {
    const needle = normalizeName(target.pokemon_name);
    if (!needle || !haystack.includes(needle)) continue;

    const existing = candidates.find(
      (candidate) => normalizeName(candidate.name) === needle
    );

    if (existing) {
      existing.target = target;
    } else {
      candidates.push({
        name: target.pokemon_name,
        meta: null,
        target,
        length: needle.length
      });
    }
  }

  candidates.sort((a, b) => b.length - a.length);
  return candidates;
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
    meta,
    target
  };
}

async function currentRecommendations(env, user, targets, metas) {
  const day = localDateForTimezone(user.timezone);
  const placeholders = [...RAID_SOURCE_TYPES].map(() => "?").join(",");

  const { results: events } = await env.DB.prepare(`
    SELECT *
    FROM events
    WHERE status = 'active'
      AND source_type IN (${placeholders})
      AND COALESCE(start_date, '0000-01-01') <= ?
      AND COALESCE(end_date, start_date, '9999-12-31') >= ?
    ORDER BY start_date, summary
    LIMIT 200
  `).bind(...RAID_SOURCE_TYPES, day, day).all();

  const map = new Map();

  for (const event of events) {
    const matches = findMatches(event.summary, targets, metas);
    for (const match of matches) {
      const key = normalizeName(match.name);
      const rec = recommendationFor(match.name, match.meta, match.target, user);

      const existing = map.get(key);
      const remoteEligible = REMOTE_RAID_SOURCE_TYPES.has(event.source_type);

      if (!existing) {
        map.set(key, {
          ...rec,
          event_title: event.summary,
          source_type: event.source_type,
          start_date: event.start_date,
          end_date: event.end_date,
          remote_eligible: remoteEligible
        });
      } else {
        // The same Pokémon can appear in more than one event feed. Preserve the
        // fact that at least one active occurrence is remotely eligible.
        existing.remote_eligible = Boolean(existing.remote_eligible || remoteEligible);

        if (rec.score > existing.score) {
          map.set(key, {
            ...rec,
            event_title: event.summary,
            source_type: event.source_type,
            start_date: event.start_date,
            end_date: event.end_date,
            remote_eligible: Boolean(existing.remote_eligible || remoteEligible)
          });
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => b.score - a.score);
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
  const links = new Set(PINNED_OFFICIAL_EVENT_PAGES);

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
      links.add(url.toString().replace(/\/$/, ""));
    } catch {}
  }

  return [...links].slice(0, MAX_OFFICIAL_EVENT_PAGES_PER_SYNC);
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateTokensFromText(value) {
  const monthPattern =
    "(January|February|March|April|May|June|July|August|September|October|November|December)";

  const regex = new RegExp(
    `(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\\\\s*,?\\\\s*${monthPattern}\\\\s+(\\\\d{1,2})(?:\\\\s*,\\\\s*(\\\\d{4}))?`,
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
  const errors = [];

  let indexHtml = "";
  try {
    indexHtml = await fetchOfficialHtml(OFFICIAL_POKEMON_GO_NEWS_URL);
  } catch (error) {
    errors.push(String(error.message || error));
  }

  const urls = officialEventLinksFromHtml(indexHtml, OFFICIAL_POKEMON_GO_NEWS_URL);

  // Always include pinned high-value current event pages even if the news index
  // changes its HTML structure.
  for (const pinned of PINNED_OFFICIAL_EVENT_PAGES) {
    if (!urls.includes(pinned)) urls.unshift(pinned);
  }

  const pageUrls = [...new Set(urls)].slice(0, MAX_OFFICIAL_EVENT_PAGES_PER_SYNC);
  const timestamp = nowIso();

  for (const url of pageUrls) {
    try {
      const html = await fetchOfficialHtml(url);
      const plainText = htmlToPlainText(html);
      const rules = remoteRaidRulesFromOfficialText(plainText, url);

      for (const rule of rules) {
        const id = await sha256Hex(
          [
            "official-remote-limit",
            rule.source_url,
            rule.start_date,
            rule.end_date,
            rule.is_unlimited ? "unlimited" : String(rule.remote_raid_limit)
          ].join("|")
        );

        await env.DB.prepare(`
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
        ).run();

        detected.push({ id, ...rule });
      }
    } catch (error) {
      errors.push(String(error.message || error));
    }
  }

  return {
    pages_checked: pageUrls.length,
    rules_detected: detected.length,
    detected,
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

async function remoteRaidLimitForDate(env, localDate) {
  const override = await env.DB.prepare(`
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
    LIMIT 1
  `).bind(localDate, localDate).first();

  if (override) {
    return {
      limit: Number(override.remote_raid_limit || 0),
      is_unlimited: Boolean(Number(override.is_unlimited || 0)),
      label: override.event_name,
      start_date: override.start_date,
      end_date: override.end_date,
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

  if (target.target_type === "raids") {
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

async function remoteRaidPlanForUser(env, user, recommendations) {
  const localDate = localDateForTimezone(user.timezone);
  const [officialRule, raidsUsed] = await Promise.all([
    remoteRaidLimitForDate(env, localDate),
    remoteRaidUsageForDate(env, user.id, localDate)
  ]);

  const plan = buildRemoteRaidPlan({
    recommendations,
    officialRule,
    userBudget: user.remote_raid_budget,
    raidsUsed,
    minScore: user.remote_raid_min_score
  });

  return { local_date: localDate, ...plan };
}

async function updateRemoteRaidUsage(request, env) {
  const body = await request.json();
  const user = await userByManageToken(env, body.token);
  if (!user) return bad("Invalid management link.", 401);

  const raidsUsed = Number(body.raids_used);
  if (!Number.isFinite(raidsUsed) || raidsUsed < 0 || raidsUsed > 999) {
    return bad("Remote Raids used must be a number between 0 and 999.");
  }

  const localDate = localDateForTimezone(user.timezone);
  const timestamp = nowIso();

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
    Math.floor(raidsUsed),
    timestamp
  ).run();

  return json({ ok: true, local_date: localDate, raids_used: Math.floor(raidsUsed) });
}

async function getMe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const user = await userByManageToken(env, token);
  if (!user) return bad("Invalid management link.", 401);

  const targets = await getTargets(env, user.id);
  const metas = await getMeta(env);
  const recommendations = await currentRecommendations(env, user, targets, metas);
  const remoteRaidPlan = await remoteRaidPlanForUser(env, user, recommendations);

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
    targets,
    recommendations,
    remote_raid_plan: remoteRaidPlan,
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

async function upsertTarget(request, env) {
  const body = await request.json();
  const user = await userByManageToken(env, body.token);
  if (!user) return bad("Invalid management link.", 401);

  const pokemonName = String(body.pokemon_name || "").trim();
  if (!pokemonName) return bad("Pokémon name is required.");

  const targetType = String(body.target_type || "mega_energy").slice(0, 40);
  const priority = ["high", "medium", "low", "skip"].includes(body.priority)
    ? body.priority
    : "medium";

  const targetValue =
    body.target_value === "" || body.target_value == null
      ? null
      : Number(body.target_value);

  const currentValue =
    body.current_value === "" || body.current_value == null
      ? 0
      : Number(body.current_value);

  const expectedProgressPerRaid =
    body.expected_progress_per_raid === "" || body.expected_progress_per_raid == null
      ? null
      : Number(body.expected_progress_per_raid);

  if (targetValue != null && !Number.isFinite(targetValue)) {
    return bad("Target value must be a number.");
  }
  if (!Number.isFinite(currentValue)) {
    return bad("Current value must be a number.");
  }
  if (
    expectedProgressPerRaid != null &&
    (!Number.isFinite(expectedProgressPerRaid) || expectedProgressPerRaid <= 0)
  ) {
    return bad("Expected progress per raid must be blank or a number greater than 0.");
  }

  const id = await sha256Hex(
    `${user.id}|${normalizeName(pokemonName)}|${targetType}`
  );
  const timestamp = nowIso();

  await env.DB.prepare(`
    INSERT INTO targets (
      id, user_id, pokemon_name, target_type,
      target_value, current_value, expected_progress_per_raid, priority,
      completed, notes, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, pokemon_name, target_type) DO UPDATE SET
      target_value = excluded.target_value,
      current_value = excluded.current_value,
      expected_progress_per_raid = excluded.expected_progress_per_raid,
      priority = excluded.priority,
      completed = excluded.completed,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).bind(
    id,
    user.id,
    pokemonName,
    targetType,
    targetValue,
    currentValue,
    expectedProgressPerRaid,
    priority,
    body.completed ? 1 : 0,
    String(body.notes || "").slice(0, 2000),
    timestamp,
    timestamp
  ).run();

  return json({ ok: true });
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

function targetTypeLabel(type) {
  return {
    mega_energy: "Mega Energy",
    raids: "Raids",
    candy_xl: "Candy XL",
    candy: "Candy",
    custom: "Progress"
  }[type] || type;
}

function personalizeEvent(event, user, targets, metas) {
  const matches = findMatches(event.summary, targets, metas);
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
  if (event.dtend_line) lines.push(event.dtend_line);
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

async function calendarFeed(request, env, feedToken) {
  const user = await userByFeedToken(env, feedToken);
  if (!user) {
    return new Response("Calendar not found.", { status: 404 });
  }

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
    ORDER BY COALESCE(start_date, '9999-12-31'), summary
    LIMIT 1500
  `).bind(...included).all();

  const dedupe = new Set();
  const vevents = [];

  for (const event of events) {
    const key =
      event.source_uid ||
      `${normalizeName(event.summary)}|${event.dtstart_line}|${event.dtend_line || ""}`;

    if (dedupe.has(key)) continue;
    dedupe.add(key);

    const personalized = personalizeEvent(event, user, targets, metas);
    vevents.push(buildVevent(event, personalized));
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

    if (request.method === "POST" && path === "/api/settings") {
      return updateSettings(request, env);
    }

    if (request.method === "POST" && path === "/api/remote-raid-usage") {
      return updateRemoteRaidUsage(request, env);
    }

    if (request.method === "POST" && path === "/api/targets") {
      return upsertTarget(request, env);
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
