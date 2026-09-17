import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

let battle = readFileSync("src/battle-opportunities.js", "utf8");

battle = replaceOnce(
  battle,
  'export const MAX_BATTLE_SOURCE_TYPES = new Set([\n  "max_battles",\n  "max_mondays"\n]);',
  'export const MAX_ROTATION_SOURCE_TYPE = "max_rotation";\n\nexport const MAX_BATTLE_SOURCE_TYPES = new Set([\n  "max_battles",\n  "max_mondays",\n  MAX_ROTATION_SOURCE_TYPE\n]);',
  "Max source types"
);

const helper = [
  'function maxRotationDateOffset(dateValue, days) {',
  '  const match = String(dateValue || "").match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);',
  '  if (!match) return null;',
  '',
  '  const date = new Date(',
  '    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))',
  '  );',
  '  date.setUTCDate(date.getUTCDate() + days);',
  '  return date.toISOString().slice(0, 10);',
  '}',
  '',
  'function compactMaxRotationDate(dateValue) {',
  '  return String(dateValue || "").replace(/-/g, "");',
  '}',
  '',
  'export function maxRotationEventFromMaxMonday(event) {',
  '  if (String(event?.source_type || "").trim() !== "max_mondays") {',
  '    return null;',
  '  }',
  '',
  '  const summary = String(event?.summary || "").trim();',
  '  const description = String(event?.description || "").trim();',
  '  const startDate = String(event?.start_date || "").trim();',
  '',
  '  if (!summary || !/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)) {',
  '    return null;',
  '  }',
  '',
  '  // Gigantamax/G-Max Mondays are special events. Never stretch them into',
  '  // a week-long standard Power Spot rotation.',
  '  if (',
  '    maxBattleVariantFromText(summary) === BATTLE_VARIANT.GIGANTAMAX ||',
  '    maxBattleVariantFromText(description) === BATTLE_VARIANT.GIGANTAMAX',
  '  ) {',
  '    return null;',
  '  }',
  '',
  '  const endDate = maxRotationDateOffset(startDate, 6);',
  '  const exclusiveEndDate = maxRotationDateOffset(startDate, 7);',
  '  if (!endDate || !exclusiveEndDate) return null;',
  '',
  '  let featured = summary',
  '    .replace(/^\\[(?:MM|MB)\\]\\s*/i, "")',
  '    .replace(/\\s+during\\s+Max\\s+Monday\\b.*$/i, "")',
  '    .replace(/\\s+Max\\s+Monday\\b.*$/i, "")',
  '    .trim();',
  '',
  '  if (!featured) return null;',
  '  if (!/\\bdynamax\\b/i.test(featured)) {',
  '    featured = "Dynamax " + featured;',
  '  }',
  '',
  '  const identity = String(event?.source_uid || "").trim() ||',
  '    startDate + ":" + featured;',
  '',
  '  return {',
  '    source_type: MAX_ROTATION_SOURCE_TYPE,',
  '    source_uid: "derived-max-rotation:" + identity,',
  '    summary: "[MR] " + featured + " in Max Battles",',
  '    description:',
  '      "Weekly Max Battle rotation derived from the Max Monday schedule. Original event: " + summary,',
  '    dtstart_line:',
  '      "DTSTART;VALUE=DATE:" + compactMaxRotationDate(startDate),',
  '    dtend_line:',
  '      "DTEND;VALUE=DATE:" + compactMaxRotationDate(exclusiveEndDate),',
  '    other_lines: "X-PG-DERIVED-FROM:max_mondays",',
  '    start_date: startDate,',
  '    end_date: endDate,',
  '    source_url: event?.source_url || null',
  '  };',
  '}',
  ''
].join("\n") + "\n";

battle = replaceOnce(
  battle,
  'export function encounterNameForMaxPokemon(value) {',
  helper + 'export function encounterNameForMaxPokemon(value) {',
  "Max rotation helper insertion"
);
writeFileSync("src/battle-opportunities.js", battle);

let worker = readFileSync("src/index.js", "utf8");
worker = replaceOnce(
  worker,
  '  BATTLE_SOURCE_TYPES,\n  MAX_BATTLE_SOURCE_TYPES,\n  battleOpportunityMetadata,',
  '  BATTLE_SOURCE_TYPES,\n  MAX_BATTLE_SOURCE_TYPES,\n  MAX_ROTATION_SOURCE_TYPE,\n  battleOpportunityMetadata,',
  "Max rotation import constant"
);
worker = replaceOnce(
  worker,
  '  maxBattleVariantFromText,\n  maxBattleVariantForEvent\n} from "./battle-opportunities.js";',
  '  maxBattleVariantFromText,\n  maxBattleVariantForEvent,\n  maxRotationEventFromMaxMonday\n} from "./battle-opportunities.js";',
  "Max rotation import helper"
);

const syncHelper = [
  'async function syncDerivedMaxRotations(env) {',
  '  const today = todayUtc();',
  '  const windowStart = addDaysIso(today, -42);',
  '  const windowEnd = addDaysIso(today, 70);',
  '',
  '  const { results: maxMondays } = await env.DB.prepare(`',
  '    SELECT *',
  '    FROM events',
  "    WHERE source_type = 'max_mondays'",
  "      AND status = 'active'",
  '      AND start_date IS NOT NULL',
  '      AND start_date >= ?',
  '      AND start_date <= ?',
  '    ORDER BY start_date, summary',
  '  `).bind(windowStart, windowEnd).all();',
  '',
  '  const derived = (maxMondays || [])',
  '    .map(event => maxRotationEventFromMaxMonday(event))',
  '    .filter(Boolean);',
  '',
  '  // Preserve last-known derived data if the upstream schedule window is',
  '  // temporarily empty instead of erasing otherwise valid availability.',
  '  if (!derived.length) return 0;',
  '',
  '  const timestamp = nowIso();',
  '  const statements = [',
  '    env.DB.prepare(`',
  '      UPDATE events',
  "      SET status = 'stale',",
  '          sequence = sequence + 1,',
  '          updated_at = ?',
  '      WHERE source_type = ?',
  "        AND status = 'active'",
  "        AND COALESCE(end_date, start_date, '9999-12-31') >= ?",
  '    `).bind(timestamp, MAX_ROTATION_SOURCE_TYPE, today)',
  '  ];',
  '',
  '  for (const event of derived) {',
  '    const identity = event.source_uid ||',
  '      event.summary + "|" + event.dtstart_line + "|" + (event.dtend_line || "");',
  '    const id = await sha256Hex(MAX_ROTATION_SOURCE_TYPE + "|" + identity);',
  '    const contentHash = await sha256Hex(JSON.stringify(event));',
  '',
  '    statements.push(',
  '      env.DB.prepare(`',
  '        INSERT INTO events (',
  '          id, source_type, source_uid, summary, description,',
  '          dtstart_line, dtend_line, other_lines,',
  '          start_date, end_date, source_url, content_hash,',
  '          sequence, status, updated_at',
  '        )',
  "        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)",
  '        ON CONFLICT(id) DO UPDATE SET',
  '          source_uid = excluded.source_uid,',
  '          summary = excluded.summary,',
  '          description = excluded.description,',
  '          dtstart_line = excluded.dtstart_line,',
  '          dtend_line = excluded.dtend_line,',
  '          other_lines = excluded.other_lines,',
  '          start_date = excluded.start_date,',
  '          end_date = excluded.end_date,',
  '          source_url = excluded.source_url,',
  '          sequence = CASE',
  '            WHEN events.content_hash != excluded.content_hash',
  "              OR events.status != 'active'",
  '            THEN events.sequence + 1',
  '            ELSE events.sequence',
  '          END,',
  '          content_hash = excluded.content_hash,',
  "          status = 'active',",
  '          updated_at = excluded.updated_at',
  '      `).bind(',
  '        id,',
  '        MAX_ROTATION_SOURCE_TYPE,',
  '        event.source_uid,',
  '        event.summary,',
  '        event.description,',
  '        event.dtstart_line,',
  '        event.dtend_line,',
  '        event.other_lines,',
  '        event.start_date,',
  '        event.end_date,',
  '        event.source_url,',
  '        contentHash,',
  '        timestamp',
  '      )',
  '    );',
  '  }',
  '',
  '  await env.DB.batch(statements);',
  '  return derived.length;',
  '}',
  ''
].join("\n") + "\n";

worker = replaceOnce(
  worker,
  'async function syncAllEvents(env) {',
  syncHelper + 'async function syncAllEvents(env) {',
  "Derived Max rotation sync helper"
);
worker = replaceOnce(
  worker,
  '  for (const [sourceType, url] of Object.entries(SOURCES)) {\n    try {\n      const count = await syncOneSource(env, sourceType, url);\n      results.push({ source: sourceType, ok: true, count });\n    } catch (error) {\n      results.push({ source: sourceType, ok: false, error: String(error.message || error) });\n    }\n  }\n  return results;',
  '  for (const [sourceType, url] of Object.entries(SOURCES)) {\n    try {\n      const count = await syncOneSource(env, sourceType, url);\n      results.push({ source: sourceType, ok: true, count });\n    } catch (error) {\n      results.push({ source: sourceType, ok: false, error: String(error.message || error) });\n    }\n  }\n\n  try {\n    const count = await syncDerivedMaxRotations(env);\n    results.push({ source: MAX_ROTATION_SOURCE_TYPE, ok: true, count, derived: true });\n  } catch (error) {\n    results.push({\n      source: MAX_ROTATION_SOURCE_TYPE,\n      ok: false,\n      derived: true,\n      error: String(error.message || error)\n    });\n  }\n\n  return results;',
  "syncAllEvents derived rotation call"
);
worker = replaceOnce(
  worker,
  '        source_kind:\n          officialSource\n            ? "official"\n            : "calendar",\n        source_label:\n          officialSource\n            ? "Official Pokémon GO"\n            : "GO Calendar",',
  '        source_kind:\n          officialSource\n            ? "official"\n            : event.source_type === MAX_ROTATION_SOURCE_TYPE\n              ? "derived"\n              : "calendar",\n        source_label:\n          officialSource\n            ? "Official Pokémon GO"\n            : event.source_type === MAX_ROTATION_SOURCE_TYPE\n              ? "Weekly Max rotation"\n              : "GO Calendar",',
  "Derived rotation source label"
);
writeFileSync("src/index.js", worker);

let test = readFileSync("tests/battle-opportunities.test.mjs", "utf8");
test = replaceOnce(
  test,
  '  MAX_BATTLE_SOURCE_TYPES,\n  RAID_SOURCE_TYPES,',
  '  MAX_BATTLE_SOURCE_TYPES,\n  MAX_ROTATION_SOURCE_TYPE,\n  RAID_SOURCE_TYPES,',
  "Test Max rotation constant import"
);
test = replaceOnce(
  test,
  '  maxBattleVariantForEvent,\n  maxBattleVariantFromText\n} from "../src/battle-opportunities.js";',
  '  maxBattleVariantForEvent,\n  maxBattleVariantFromText,\n  maxRotationEventFromMaxMonday\n} from "../src/battle-opportunities.js";',
  "Test Max rotation helper import"
);
test = replaceOnce(
  test,
  'assert.equal(REMOTE_PASS_SOURCE_TYPES.has("max_mondays"), true);',
  'assert.equal(REMOTE_PASS_SOURCE_TYPES.has("max_mondays"), true);\nassert.equal(BATTLE_SOURCE_TYPES.has(MAX_ROTATION_SOURCE_TYPE), true);\nassert.equal(REMOTE_PASS_SOURCE_TYPES.has(MAX_ROTATION_SOURCE_TYPE), true);',
  "Test source membership"
);

const testBlock = [
  '',
  'const rhyhornRotation = maxRotationEventFromMaxMonday({',
  '  source_type: "max_mondays",',
  '  source_uid: "max-mondays-2026-09-14",',
  '  summary: "[MM] Dynamax Rhyhorn during Max Monday",',
  '  description: "Power Spots refresh more frequently.",',
  '  start_date: "2026-09-14",',
  '  end_date: "2026-09-14",',
  '  source_url: "https://leekduck.com/events/max-mondays-2026-09-14/"',
  '});',
  'assert.equal(rhyhornRotation.source_type, MAX_ROTATION_SOURCE_TYPE);',
  'assert.equal(rhyhornRotation.start_date, "2026-09-14");',
  'assert.equal(rhyhornRotation.end_date, "2026-09-20");',
  'assert.equal(rhyhornRotation.dtend_line, "DTEND;VALUE=DATE:20260921");',
  'assert.equal(rhyhornRotation.summary, "[MR] Dynamax Rhyhorn in Max Battles");',
  'assert.equal(maxBattleVariantForEvent(rhyhornRotation, "Rhyhorn"), BATTLE_VARIANT.DYNAMAX);',
  '',
  'const birdRotation = maxRotationEventFromMaxMonday({',
  '  source_type: "max_mondays",',
  '  source_uid: "max-mondays-2026-09-21",',
  '  summary: "[MM] Dynamax Articuno, Zapdos, and Moltres during Max Monday",',
  '  start_date: "2026-09-21",',
  '  source_url: "https://leekduck.com/events/max-mondays-2026-09-21/"',
  '});',
  'assert.equal(birdRotation.end_date, "2026-09-27");',
  'assert.match(birdRotation.summary, /Articuno, Zapdos, and Moltres/);',
  'assert.equal(maxBattleVariantForEvent(birdRotation, "Zapdos"), BATTLE_VARIANT.DYNAMAX);',
  '',
  'assert.equal(maxRotationEventFromMaxMonday({',
  '  source_type: "max_mondays",',
  '  summary: "[MM] Gigantamax Gengar during Max Monday",',
  '  start_date: "2026-10-05"',
  '}), null);',
  'assert.equal(maxRotationEventFromMaxMonday({',
  '  source_type: "max_battles",',
  '  summary: "[MB] Gigantamax Cinderace Max Battle Day",',
  '  start_date: "2026-10-03"',
  '}), null);',
  ''
].join("\n");

test = replaceOnce(
  test,
  'assert.equal(maxBattleVariantFromText("Beldum"), null);\n',
  'assert.equal(maxBattleVariantFromText("Beldum"), null);\n' + testBlock,
  "Behavior tests"
);

test = replaceOnce(
  test,
  'assert.match(\n  workerSource,\n  /const DEFAULT_SOURCES = \\[[\\s\\S]*"max_battles"[\\s\\S]*"max_mondays"[\\s\\S]*\\];/\n);',
  'assert.match(\n  workerSource,\n  /const DEFAULT_SOURCES = \\[[\\s\\S]*"max_battles"[\\s\\S]*"max_mondays"[\\s\\S]*\\];/\n);\nassert.match(workerSource, /async function syncDerivedMaxRotations\\(env\\)/);\nassert.match(workerSource, /source_type = \'max_mondays\'/);\nassert.match(workerSource, /source: MAX_ROTATION_SOURCE_TYPE, ok: true, count, derived: true/);\nassert.doesNotMatch(\n  workerSource.match(/const SOURCES = \\{[\\s\\S]*?\\n\\};/)?.[0] || "",\n  /max_rotation\\s*:/\n);',
  "Integration assertions"
);
writeFileSync("tests/battle-opportunities.test.mjs", test);

console.log("weekly Max rotation patch applied");
