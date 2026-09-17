import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

function offsetIsoDate(value, days) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

let battle = readFileSync("src/battle-opportunities.js", "utf8");

battle = replaceOnce(
  battle,
  `export const MAX_BATTLE_SOURCE_TYPES = new Set([\n  "max_battles",\n  "max_mondays"\n]);`,
  `export const MAX_ROTATION_SOURCE_TYPE = "max_rotation";\n\nexport const MAX_BATTLE_SOURCE_TYPES = new Set([\n  "max_battles",\n  "max_mondays",\n  MAX_ROTATION_SOURCE_TYPE\n]);`,
  "Max source types"
);

const helper = `function maxRotationDateOffset(dateValue, days) {\n  const match = String(dateValue || "").match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);\n  if (!match) return null;\n\n  const date = new Date(\n    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))\n  );\n  date.setUTCDate(date.getUTCDate() + days);\n  return date.toISOString().slice(0, 10);\n}\n\nfunction compactMaxRotationDate(dateValue) {\n  return String(dateValue || "").replace(/-/g, "");\n}\n\nexport function maxRotationEventFromMaxMonday(event) {\n  if (String(event?.source_type || "").trim() !== "max_mondays") {\n    return null;\n  }\n\n  const summary = String(event?.summary || "").trim();\n  const description = String(event?.description || "").trim();\n  const startDate = String(event?.start_date || "").trim();\n\n  if (!summary || !/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)) {\n    return null;\n  }\n\n  // A Gigantamax/G-Max Monday is a special event, not evidence that the same\n  // boss remains the normal weekly Power Spot rotation. Never extend it.\n  if (\n    maxBattleVariantFromText(summary) === BATTLE_VARIANT.GIGANTAMAX ||\n    maxBattleVariantFromText(description) === BATTLE_VARIANT.GIGANTAMAX\n  ) {\n    return null;\n  }\n\n  const endDate = maxRotationDateOffset(startDate, 6);\n  const exclusiveEndDate = maxRotationDateOffset(startDate, 7);\n  if (!endDate || !exclusiveEndDate) return null;\n\n  let featured = summary\n    .replace(/^\\[(?:MM|MB)\\]\\s*/i, "")\n    .replace(/\\s+during\\s+Max\\s+Monday\\b.*$/i, "")\n    .replace(/\\s+Max\\s+Monday\\b.*$/i, "")\n    .trim();\n\n  if (!featured) return null;\n  if (!/\\bdynamax\\b/i.test(featured)) {\n    featured = \\`Dynamax \\${featured}\\`;\n  }\n\n  const identity =\n    String(event?.source_uid || "").trim() ||\n    \\`\\${startDate}:\\${featured}\\`;\n\n  return {\n    source_type: MAX_ROTATION_SOURCE_TYPE,\n    source_uid: \\`derived-max-rotation:\\${identity}\\`,\n    summary: \\`[MR] \\${featured} in Max Battles\\`,\n    description:\n      \\`Weekly Max Battle rotation derived from the Max Monday schedule. Original event: \\${summary}\\`,\n    dtstart_line:\n      \\`DTSTART;VALUE=DATE:\\${compactMaxRotationDate(startDate)}\\`,\n    dtend_line:\n      \\`DTEND;VALUE=DATE:\\${compactMaxRotationDate(exclusiveEndDate)}\\`,\n    other_lines: "X-PG-DERIVED-FROM:max_mondays",\n    start_date: startDate,\n    end_date: endDate,\n    source_url: event?.source_url || null\n  };\n}\n\n`;

battle = replaceOnce(
  battle,
  `export function encounterNameForMaxPokemon(value) {`,
  helper + `export function encounterNameForMaxPokemon(value) {`,
  "Max rotation helper insertion"
);
writeFileSync("src/battle-opportunities.js", battle);

let worker = readFileSync("src/index.js", "utf8");
worker = replaceOnce(
  worker,
  `  BATTLE_SOURCE_TYPES,\n  MAX_BATTLE_SOURCE_TYPES,\n  battleOpportunityMetadata,`,
  `  BATTLE_SOURCE_TYPES,\n  MAX_BATTLE_SOURCE_TYPES,\n  MAX_ROTATION_SOURCE_TYPE,\n  battleOpportunityMetadata,`,
  "Max rotation import constant"
);
worker = replaceOnce(
  worker,
  `  maxBattleVariantFromText,\n  maxBattleVariantForEvent\n} from "./battle-opportunities.js";`,
  `  maxBattleVariantFromText,\n  maxBattleVariantForEvent,\n  maxRotationEventFromMaxMonday\n} from "./battle-opportunities.js";`,
  "Max rotation import helper"
);

const syncHelper = `async function syncDerivedMaxRotations(env) {\n  const today = todayUtc();\n  const windowStart = addDaysIso(today, -42);\n  const windowEnd = addDaysIso(today, 70);\n\n  const { results: maxMondays } = await env.DB.prepare(\\`\n    SELECT *\n    FROM events\n    WHERE source_type = 'max_mondays'\n      AND status = 'active'\n      AND start_date IS NOT NULL\n      AND start_date >= ?\n      AND start_date <= ?\n    ORDER BY start_date, summary\n  \\`).bind(windowStart, windowEnd).all();\n\n  const derived = (maxMondays || [])\n    .map(event => maxRotationEventFromMaxMonday(event))\n    .filter(Boolean);\n\n  // If there is no usable Max Monday schedule, retain the last known weekly\n  // rotation data instead of erasing availability because an upstream feed\n  // temporarily returned an incomplete window.\n  if (!derived.length) return 0;\n\n  const timestamp = nowIso();\n  const statements = [\n    env.DB.prepare(\\`\n      UPDATE events\n      SET status = 'stale',\n          sequence = sequence + 1,\n          updated_at = ?\n      WHERE source_type = ?\n        AND status = 'active'\n        AND COALESCE(end_date, start_date, '9999-12-31') >= ?\n    \\`).bind(timestamp, MAX_ROTATION_SOURCE_TYPE, today)\n  ];\n\n  for (const event of derived) {\n    const identity = event.source_uid ||\n      \\`\\${event.summary}|\\${event.dtstart_line}|\\${event.dtend_line || ""}\\`;\n    const id = await sha256Hex(\\`\\${MAX_ROTATION_SOURCE_TYPE}|\\${identity}\\`);\n    const contentHash = await sha256Hex(JSON.stringify(event));\n\n    statements.push(\n      env.DB.prepare(\\`\n        INSERT INTO events (\n          id, source_type, source_uid, summary, description,\n          dtstart_line, dtend_line, other_lines,\n          start_date, end_date, source_url, content_hash,\n          sequence, status, updated_at\n        )\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)\n        ON CONFLICT(id) DO UPDATE SET\n          source_uid = excluded.source_uid,\n          summary = excluded.summary,\n          description = excluded.description,\n          dtstart_line = excluded.dtstart_line,\n          dtend_line = excluded.dtend_line,\n          other_lines = excluded.other_lines,\n          start_date = excluded.start_date,\n          end_date = excluded.end_date,\n          source_url = excluded.source_url,\n          sequence = CASE\n            WHEN events.content_hash != excluded.content_hash\n              OR events.status != 'active'\n            THEN events.sequence + 1\n            ELSE events.sequence\n          END,\n          content_hash = excluded.content_hash,\n          status = 'active',\n          updated_at = excluded.updated_at\n      \\`).bind(\n        id,\n        MAX_ROTATION_SOURCE_TYPE,\n        event.source_uid,\n        event.summary,\n        event.description,\n        event.dtstart_line,\n        event.dtend_line,\n        event.other_lines,\n        event.start_date,\n        event.end_date,\n        event.source_url,\n        contentHash,\n        timestamp\n      )\n    );\n  }\n\n  await env.DB.batch(statements);\n  return derived.length;\n}\n\n`;

worker = replaceOnce(
  worker,
  `async function syncAllEvents(env) {`,
  syncHelper + `async function syncAllEvents(env) {`,
  "Derived Max rotation sync helper"
);
worker = replaceOnce(
  worker,
  `  for (const [sourceType, url] of Object.entries(SOURCES)) {\n    try {\n      const count = await syncOneSource(env, sourceType, url);\n      results.push({ source: sourceType, ok: true, count });\n    } catch (error) {\n      results.push({ source: sourceType, ok: false, error: String(error.message || error) });\n    }\n  }\n  return results;`,
  `  for (const [sourceType, url] of Object.entries(SOURCES)) {\n    try {\n      const count = await syncOneSource(env, sourceType, url);\n      results.push({ source: sourceType, ok: true, count });\n    } catch (error) {\n      results.push({ source: sourceType, ok: false, error: String(error.message || error) });\n    }\n  }\n\n  try {\n    const count = await syncDerivedMaxRotations(env);\n    results.push({\n      source: MAX_ROTATION_SOURCE_TYPE,\n      ok: true,\n      count,\n      derived: true\n    });\n  } catch (error) {\n    results.push({\n      source: MAX_ROTATION_SOURCE_TYPE,\n      ok: false,\n      derived: true,\n      error: String(error.message || error)\n    });\n  }\n\n  return results;`,
  "syncAllEvents derived rotation call"
);
worker = replaceOnce(
  worker,
  `        source_kind:\n          officialSource\n            ? "official"\n            : "calendar",\n        source_label:\n          officialSource\n            ? "Official Pokémon GO"\n            : "GO Calendar",`,
  `        source_kind:\n          officialSource\n            ? "official"\n            : event.source_type === MAX_ROTATION_SOURCE_TYPE\n              ? "derived"\n              : "calendar",\n        source_label:\n          officialSource\n            ? "Official Pokémon GO"\n            : event.source_type === MAX_ROTATION_SOURCE_TYPE\n              ? "Weekly Max rotation"\n              : "GO Calendar",`,
  "Derived rotation recommendation source label"
);
writeFileSync("src/index.js", worker);

let test = readFileSync("tests/battle-opportunities.test.mjs", "utf8");
test = replaceOnce(
  test,
  `  MAX_BATTLE_SOURCE_TYPES,\n  RAID_SOURCE_TYPES,`,
  `  MAX_BATTLE_SOURCE_TYPES,\n  MAX_ROTATION_SOURCE_TYPE,\n  RAID_SOURCE_TYPES,`,
  "Test Max rotation constant import"
);
test = replaceOnce(
  test,
  `  maxBattleVariantForEvent,\n  maxBattleVariantFromText\n} from "../src/battle-opportunities.js";`,
  `  maxBattleVariantForEvent,\n  maxBattleVariantFromText,\n  maxRotationEventFromMaxMonday\n} from "../src/battle-opportunities.js";`,
  "Test Max rotation helper import"
);

test = replaceOnce(
  test,
  `assert.equal(REMOTE_PASS_SOURCE_TYPES.has("max_mondays"), true);`,
  `assert.equal(REMOTE_PASS_SOURCE_TYPES.has("max_mondays"), true);\nassert.equal(BATTLE_SOURCE_TYPES.has(MAX_ROTATION_SOURCE_TYPE), true);\nassert.equal(REMOTE_PASS_SOURCE_TYPES.has(MAX_ROTATION_SOURCE_TYPE), true);`,
  "Test Max rotation source membership"
);

const testBlock = `\nconst rhyhornRotation = maxRotationEventFromMaxMonday({\n  source_type: "max_mondays",\n  source_uid: "max-mondays-2026-09-14",\n  summary: "[MM] Dynamax Rhyhorn during Max Monday",\n  description: "Power Spots refresh more frequently.",\n  start_date: "2026-09-14",\n  end_date: "2026-09-14",\n  source_url: "https://leekduck.com/events/max-mondays-2026-09-14/"\n});\nassert.equal(rhyhornRotation.source_type, MAX_ROTATION_SOURCE_TYPE);\nassert.equal(rhyhornRotation.start_date, "2026-09-14");\nassert.equal(rhyhornRotation.end_date, "2026-09-20");\nassert.equal(rhyhornRotation.dtend_line, "DTEND;VALUE=DATE:20260921");\nassert.equal(rhyhornRotation.summary, "[MR] Dynamax Rhyhorn in Max Battles");\nassert.equal(\n  maxBattleVariantForEvent(rhyhornRotation, "Rhyhorn"),\n  BATTLE_VARIANT.DYNAMAX\n);\n\nconst birdRotation = maxRotationEventFromMaxMonday({\n  source_type: "max_mondays",\n  source_uid: "max-mondays-2026-09-21",\n  summary: "[MM] Dynamax Articuno, Zapdos, and Moltres during Max Monday",\n  start_date: "2026-09-21",\n  source_url: "https://leekduck.com/events/max-mondays-2026-09-21/"\n});\nassert.equal(birdRotation.end_date, "2026-09-27");\nassert.match(birdRotation.summary, /Articuno, Zapdos, and Moltres/);\nassert.equal(\n  maxBattleVariantForEvent(birdRotation, "Zapdos"),\n  BATTLE_VARIANT.DYNAMAX\n);\n\nassert.equal(\n  maxRotationEventFromMaxMonday({\n    source_type: "max_mondays",\n    summary: "[MM] Gigantamax Gengar during Max Monday",\n    start_date: "2026-10-05"\n  }),\n  null\n);\nassert.equal(\n  maxRotationEventFromMaxMonday({\n    source_type: "max_battles",\n    summary: "[MB] Gigantamax Cinderace Max Battle Day",\n    start_date: "2026-10-03"\n  }),\n  null\n);\n`;

test = replaceOnce(
  test,
  `assert.equal(maxBattleVariantFromText("Beldum"), null);\n`,
  `assert.equal(maxBattleVariantFromText("Beldum"), null);\n` + testBlock,
  "Max rotation behavioral tests"
);

test = replaceOnce(
  test,
  `assert.match(\n  workerSource,\n  /const DEFAULT_SOURCES = \\[[\\s\\S]*"max_battles"[\\s\\S]*"max_mondays"[\\s\\S]*\\];/\n);`,
  `assert.match(\n  workerSource,\n  /const DEFAULT_SOURCES = \\[[\\s\\S]*"max_battles"[\\s\\S]*"max_mondays"[\\s\\S]*\\];/\n);\nassert.match(workerSource, /async function syncDerivedMaxRotations\\(env\\)/);\nassert.match(workerSource, /source_type = 'max_mondays'/);\nassert.match(workerSource, /source: MAX_ROTATION_SOURCE_TYPE,[\\s\\S]*derived: true/);\nassert.doesNotMatch(\n  workerSource.match(/const SOURCES = \\{[\\s\\S]*?\\n\\};/)?.[0] || "",\n  /max_rotation\\s*:/\n);`,
  "Max rotation integration assertions"
);
writeFileSync("tests/battle-opportunities.test.mjs", test);

// Guard against an accidental date helper drift in the patch itself.
if (offsetIsoDate("2026-09-14", 6) !== "2026-09-20") {
  throw new Error("Patch date sanity check failed");
}

console.log("weekly Max rotation patch applied");
