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

const PVPOKE_MASTER_LEAGUE =
  "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-10000.json";

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

async function syncPvPoke(env) {
  const response = await fetch(PVPOKE_MASTER_LEAGUE, {
    headers: { "user-agent": "PokemonGoPersonalCalendar/1.0" }
  });

  if (!response.ok) {
    throw new Error(`PvPoke returned ${response.status}`);
  }

  const rankings = await response.json();
  const { results: metas } = await env.DB.prepare(
    `SELECT pokemon_name FROM pokemon_meta`
  ).all();

  if (!metas.length) {
    return { updated: 0, message: "No pokemon_meta rows to match yet." };
  }

  const rankMap = new Map();
  for (const item of rankings) {
    if (item?.speciesName && Number.isFinite(Number(item?.score))) {
      rankMap.set(normalizeName(item.speciesName), Number(item.score));
    }
  }

  const timestamp = nowIso();
  const statements = [];
  let updated = 0;

  for (const row of metas) {
    const key = normalizeName(row.pokemon_name);
    const score = rankMap.get(key);
    if (score == null) continue;

    statements.push(
      env.DB.prepare(`
        UPDATE pokemon_meta
        SET pvp_score = ?, updated_at = ?
        WHERE pokemon_name = ?
      `).bind(score, timestamp, row.pokemon_name)
    );
    updated++;
  }

  if (statements.length) {
    await env.DB.batch(statements);
  }

  return { updated };
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
  const day = todayUtc();
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
      if (!existing || rec.score > existing.score) {
        map.set(key, {
          ...rec,
          event_title: event.summary,
          source_type: event.source_type,
          start_date: event.start_date,
          end_date: event.end_date
        });
      }
    }
  }

  return [...map.values()].sort((a, b) => b.score - a.score);
}

async function getMe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const user = await userByManageToken(env, token);
  if (!user) return bad("Invalid management link.", 401);

  const targets = await getTargets(env, user.id);
  const metas = await getMeta(env);
  const recommendations = await currentRecommendations(env, user, targets, metas);

  return json({
    user: {
      timezone: user.timezone,
      included_sources: parseSources(user),
      pve_weight: user.pve_weight,
      pvp_weight: user.pvp_weight,
      collector_weight: user.collector_weight
    },
    targets,
    recommendations,
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

  await env.DB.prepare(`
    UPDATE users
    SET timezone = ?,
        included_sources = ?,
        pve_weight = ?,
        pvp_weight = ?,
        collector_weight = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    timezone,
    JSON.stringify(included),
    pve,
    pvp,
    collector,
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

  if (targetValue != null && !Number.isFinite(targetValue)) {
    return bad("Target value must be a number.");
  }
  if (!Number.isFinite(currentValue)) {
    return bad("Current value must be a number.");
  }

  const id = await sha256Hex(
    `${user.id}|${normalizeName(pokemonName)}|${targetType}`
  );
  const timestamp = nowIso();

  await env.DB.prepare(`
    INSERT INTO targets (
      id, user_id, pokemon_name, target_type,
      target_value, current_value, priority,
      completed, notes, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, pokemon_name, target_type) DO UPDATE SET
      target_value = excluded.target_value,
      current_value = excluded.current_value,
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
    SELECT * FROM pokemon_meta ORDER BY pokemon_name
  `).all();

  const { results: sources } = await env.DB.prepare(`
    SELECT * FROM meta_sources ORDER BY pokemon_name, source_name
  `).all();

  return json({ metas, sources });
}

async function adminMetaUpsert(request, env) {
  const body = await request.json();
  if (!env.ADMIN_KEY || body.key !== env.ADMIN_KEY) {
    return bad("Invalid admin key.", 401);
  }

  const name = String(body.pokemon_name || "").trim();
  if (!name) return bad("Pokémon name is required.");

  const numberOrNull = (value) => {
    if (value === "" || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, 0, 100) : null;
  };

  const pve = numberOrNull(body.pve_score);
  const pvp = numberOrNull(body.pvp_score);
  const rarity = numberOrNull(body.rarity_score);
  const mega = numberOrNull(body.mega_score);
  const overall = numberOrNull(body.overall_score);

  const timestamp = nowIso();

  await env.DB.prepare(`
    INSERT INTO pokemon_meta (
      pokemon_name, pve_score, pvp_score, rarity_score,
      mega_score, overall_score, verdict, notes, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pokemon_name) DO UPDATE SET
      pve_score = excluded.pve_score,
      pvp_score = COALESCE(excluded.pvp_score, pokemon_meta.pvp_score),
      rarity_score = excluded.rarity_score,
      mega_score = excluded.mega_score,
      overall_score = excluded.overall_score,
      verdict = excluded.verdict,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).bind(
    name,
    pve,
    pvp,
    rarity,
    mega,
    overall,
    String(body.verdict || "").slice(0, 400),
    String(body.notes || "").slice(0, 2000),
    timestamp
  ).run();

  if (body.source_name && body.source_url) {
    const sourceId = await sha256Hex(
      `${normalizeName(name)}|${body.source_name}|${body.source_url}`
    );

    await env.DB.prepare(`
      INSERT INTO meta_sources (
        id, pokemon_name, source_name, source_url, note, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        note = excluded.note,
        updated_at = excluded.updated_at
    `).bind(
      sourceId,
      name,
      String(body.source_name).slice(0, 200),
      String(body.source_url).slice(0, 1500),
      String(body.source_note || "").slice(0, 1000),
      timestamp
    ).run();
  }

  return json({ ok: true });
}

async function adminSync(request, env) {
  const body = await request.json();
  if (!env.ADMIN_KEY || body.key !== env.ADMIN_KEY) {
    return bad("Invalid admin key.", 401);
  }

  const eventResults = await syncAllEvents(env);
  let pvpoke;
  try {
    pvpoke = await syncPvPoke(env);
  } catch (error) {
    pvpoke = { error: String(error.message || error) };
  }

  return json({ ok: true, events: eventResults, pvpoke });
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

    if (request.method === "POST" && path === "/api/targets") {
      return upsertTarget(request, env);
    }

    if (request.method === "DELETE" && path === "/api/targets") {
      return deleteTarget(request, env);
    }

    if (request.method === "GET" && path === "/api/admin/meta") {
      return adminMetaList(request, env);
    }

    if (request.method === "POST" && path === "/api/admin/meta") {
      return adminMetaUpsert(request, env);
    }

    if (request.method === "POST" && path === "/api/admin/sync") {
      return adminSync(request, env);
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

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const eventResults = await syncAllEvents(env);
        console.log("Event sync:", JSON.stringify(eventResults));

        try {
          const pvpoke = await syncPvPoke(env);
          console.log("PvPoke sync:", JSON.stringify(pvpoke));
        } catch (error) {
          console.error("PvPoke sync failed:", error);
        }
      })()
    );
  }
};
