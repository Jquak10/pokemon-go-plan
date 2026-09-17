from pathlib import Path
import json


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


rules_module = r'''const MONTH_INDEX = {
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

const NAMED_TIMEZONE_OFFSETS = {
  PDT: -7 * 60,
  PST: -8 * 60,
  MDT: -6 * 60,
  MST: -7 * 60,
  CDT: -5 * 60,
  CST: -6 * 60,
  EDT: -4 * 60,
  EST: -5 * 60,
  UTC: 0,
  GMT: 0
};

function dateTokens(value) {
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
      end: regex.lastIndex,
      raw: match[0]
    });
  }

  return tokens;
}

function resolveDateYears(first, second) {
  const a = { ...first };
  const b = { ...second };

  if (!b.year && a.year) b.year = a.year;
  if (!a.year && b.year) a.year = b.year;

  const currentYear = new Date().getUTCFullYear();
  if (!a.year && !b.year) {
    a.year = currentYear;
    b.year = currentYear;
  }

  if (a.year === b.year && a.month > b.month) {
    b.year += 1;
  }

  return [a, b];
}

function clockFromSegment(value) {
  const match = String(value || "").match(
    /(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?(?:\s*((?:UTC|GMT)\s*[+-]\s*\d{1,2}(?::?\d{2})?|[A-Z]{2,5}))?/i
  );

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = String(match[3] || "").toLowerCase();

  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  if (meridiem === "p" && hour !== 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;

  return {
    hour,
    minute,
    timezone: match[4] ? String(match[4]).trim().toUpperCase() : null
  };
}

function timezoneOffsetMinutes(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (Object.prototype.hasOwnProperty.call(NAMED_TIMEZONE_OFFSETS, normalized)) {
    return NAMED_TIMEZONE_OFFSETS[normalized];
  }

  const match = normalized.match(/^(?:UTC|GMT)([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;

  const hour = Number(match[2]);
  const minute = Number(match[3] || 0);
  if (hour > 23 || minute > 59) return null;

  const total = hour * 60 + minute;
  return match[1] === "+" ? total : -total;
}

function instantFromParts(dateToken, clock, offsetMinutes) {
  const value = Date.UTC(
    dateToken.year,
    dateToken.month - 1,
    dateToken.day,
    clock.hour,
    clock.minute,
    0,
    0
  ) - offsetMinutes * 60 * 1000;

  return new Date(value).toISOString();
}

export function remoteRaidExactWindowFromText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const tokens = dateTokens(text);
  if (tokens.length < 2) return null;

  const [first, second] = resolveDateYears(tokens[0], tokens[1]);
  const firstSegment = text.slice(tokens[0].end, tokens[1].index);
  const secondSegment = text.slice(tokens[1].end);
  const startClock = clockFromSegment(firstSegment);
  const endClock = clockFromSegment(secondSegment);

  if (!startClock || !endClock) return null;

  const sharedTimezone = endClock.timezone || startClock.timezone;
  const startTimezone = startClock.timezone || sharedTimezone;
  const endTimezone = endClock.timezone || sharedTimezone;
  const startOffset = timezoneOffsetMinutes(startTimezone);
  const endOffset = timezoneOffsetMinutes(endTimezone);

  // Never guess an offset for phrases that only say "local time" or omit a
  // timezone. Date-only behavior remains the safe fallback for those rules.
  if (startOffset == null || endOffset == null) return null;

  const startAt = instantFromParts(first, startClock, startOffset);
  const endAt = instantFromParts(second, endClock, endOffset);

  if (Date.parse(endAt) <= Date.parse(startAt)) return null;

  return {
    start_at: startAt,
    end_at: endAt,
    start_timezone: startTimezone,
    end_timezone: endTimezone
  };
}

export function localDateForInstant(instant, timezone) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      })
        .formatToParts(date)
        .filter(part => part.type !== "literal")
        .map(part => [part.type, part.value])
    );

    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function remoteRaidRuleApplicability(
  rule,
  { localDate, timezone, referenceInstant = null } = {}
) {
  const exact = remoteRaidExactWindowFromText(rule?.source_excerpt || "");

  if (exact) {
    const startLocalDate = localDateForInstant(exact.start_at, timezone);
    const endLocalDate = localDateForInstant(exact.end_at, timezone);

    let applies;
    if (referenceInstant) {
      const reference = Date.parse(referenceInstant);
      applies = Number.isFinite(reference) &&
        reference >= Date.parse(exact.start_at) &&
        reference <= Date.parse(exact.end_at);
    } else {
      applies = Boolean(
        localDate &&
        startLocalDate &&
        endLocalDate &&
        startLocalDate <= localDate &&
        endLocalDate >= localDate
      );
    }

    return {
      applies,
      precision: "instant",
      start_at: exact.start_at,
      end_at: exact.end_at,
      start_local_date: startLocalDate,
      end_local_date: endLocalDate
    };
  }

  const startDate = String(rule?.start_date || "");
  const endDate = String(rule?.end_date || rule?.start_date || "");

  return {
    applies: Boolean(
      localDate &&
      startDate &&
      startDate <= localDate &&
      endDate >= localDate
    ),
    precision: "date",
    start_at: null,
    end_at: null,
    start_local_date: startDate || null,
    end_local_date: endDate || null
  };
}
'''
Path("src/remote-raid-rules.js").write_text(rules_module)

index_path = Path("src/index.js")
index = index_path.read_text()

index = replace_once(
    index,
    '''import {
  STANDARD_MAX_PARTICLE_DAILY_LIMIT,
  STANDARD_MAX_PARTICLE_STORAGE_LIMIT,
  buildBattleResourcePlan,
  inferMaxParticleCost,
  maxBattleRemotePassEligible
} from "./resource-planning.js";''',
    '''import {
  STANDARD_MAX_PARTICLE_DAILY_LIMIT,
  STANDARD_MAX_PARTICLE_STORAGE_LIMIT,
  buildBattleResourcePlan,
  inferMaxParticleCost,
  maxBattleRemotePassEligible
} from "./resource-planning.js";
import {
  remoteRaidRuleApplicability
} from "./remote-raid-rules.js";''',
    "remote rule import"
)

old_limit_function = '''async function remoteRaidLimitForDate(env, localDate) {
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
}'''

new_limit_function = '''async function remoteRaidLimitForDate(
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
}'''
index = replace_once(index, old_limit_function, new_limit_function, "remote limit evaluator")

index = replace_once(
    index,
    '''  const today =
    localDateForTimezone(
      user.timezone
    );

  const threshold =''',
    '''  const today =
    localDateForTimezone(
      user.timezone
    );

  const currentInstant =
    nowIso();

  const threshold =''',
    "forecast reference instant"
)

index = replace_once(
    index,
    '''        remoteRaidLimitForDate(
          env,
          date
        )''',
    '''        remoteRaidLimitForDate(
          env,
          date,
          user.timezone,
          date === today
            ? currentInstant
            : null
        )''',
    "forecast remote limit call"
)

index = replace_once(
    index,
    '''      remoteRaidLimitForDate(
        env,
        localDate
      ),''',
    '''      remoteRaidLimitForDate(
        env,
        localDate,
        user.timezone,
        nowIso()
      ),''',
    "current remote limit call"
)

index_path.write_text(index)


test_module = r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  remoteRaidExactWindowFromText,
  remoteRaidRuleApplicability
} from "../src/remote-raid-rules.js";

const staraptor =
  "Remote Raid limit increased to 20 from Friday, September 18, at 5:00 p.m. to Saturday, September 19, 2026, at 8:00 p.m. PDT.";

const staraptorWindow = remoteRaidExactWindowFromText(staraptor);
assert.deepEqual(staraptorWindow, {
  start_at: "2026-09-19T00:00:00.000Z",
  end_at: "2026-09-20T03:00:00.000Z",
  start_timezone: "PDT",
  end_timezone: "PDT"
});

const staraptorRule = {
  start_date: "2026-09-18",
  end_date: "2026-09-19",
  source_excerpt: staraptor
};

// Singapore must remain on the standard 10 cap throughout Sep 18.
assert.equal(
  remoteRaidRuleApplicability(staraptorRule, {
    localDate: "2026-09-18",
    timezone: "Asia/Singapore",
    referenceInstant: "2026-09-18T15:59:59.000Z"
  }).applies,
  false
);

// The event override starts at 08:00 SGT on Sep 19, not midnight.
assert.equal(
  remoteRaidRuleApplicability(staraptorRule, {
    localDate: "2026-09-19",
    timezone: "Asia/Singapore",
    referenceInstant: "2026-09-18T23:59:59.000Z"
  }).applies,
  false
);
assert.equal(
  remoteRaidRuleApplicability(staraptorRule, {
    localDate: "2026-09-19",
    timezone: "Asia/Singapore",
    referenceInstant: "2026-09-19T00:00:00.000Z"
  }).applies,
  true
);

// It remains active until 11:00 SGT on Sep 20, then returns to standard.
assert.equal(
  remoteRaidRuleApplicability(staraptorRule, {
    localDate: "2026-09-20",
    timezone: "Asia/Singapore",
    referenceInstant: "2026-09-20T02:59:59.000Z"
  }).applies,
  true
);
assert.equal(
  remoteRaidRuleApplicability(staraptorRule, {
    localDate: "2026-09-20",
    timezone: "Asia/Singapore",
    referenceInstant: "2026-09-20T03:00:01.000Z"
  }).applies,
  false
);

// Forecasts may recognize a partial future local day, but never shift the
// override backward onto Sep 18 in Singapore.
assert.equal(
  remoteRaidRuleApplicability(staraptorRule, {
    localDate: "2026-09-18",
    timezone: "Asia/Singapore"
  }).applies,
  false
);
assert.equal(
  remoteRaidRuleApplicability(staraptorRule, {
    localDate: "2026-09-20",
    timezone: "Asia/Singapore"
  }).applies,
  true
);

const goFest =
  "There will be no limit on Remote Raids from Saturday, July 25, at 1:00 p.m. PDT to Sunday, July 26, at 11:59 p.m. PDT.";
assert.deepEqual(remoteRaidExactWindowFromText(goFest), {
  start_at: "2026-07-25T20:00:00.000Z",
  end_at: "2026-07-27T06:59:00.000Z",
  start_timezone: "PDT",
  end_timezone: "PDT"
});

// If an official/manual rule has no parseable timezone, retain the existing
// date-only semantics rather than guessing an offset.
const dateOnly = {
  start_date: "2026-09-18",
  end_date: "2026-09-19",
  source_excerpt: "Remote Raid limit increased to 20 from September 18 to September 19, 2026."
};
assert.equal(remoteRaidExactWindowFromText(dateOnly.source_excerpt), null);
assert.equal(
  remoteRaidRuleApplicability(dateOnly, {
    localDate: "2026-09-18",
    timezone: "Asia/Singapore",
    referenceInstant: "2026-09-18T00:00:00.000Z"
  }).applies,
  true
);

const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
assert.match(index, /remoteRaidRuleApplicability/);
assert.match(index, /addDaysIso\(localDate, -1\)/);
assert.match(index, /addDaysIso\(localDate, 1\)/);
assert.match(index, /date === today[\s\S]*\? currentInstant[\s\S]*: null/);
assert.match(index, /user\.timezone,[\s\S]*nowIso\(\)/);

console.log("Remote Raid limit timezone-window tests passed");
'''
Path("tests/remote-raid-rules.test.mjs").write_text(test_module)

package_path = Path("package.json")
package = json.loads(package_path.read_text())
old_test = package["scripts"]["test"]
needle = "node tests/resource-planning.test.mjs"
if needle not in old_test:
    raise RuntimeError("package test script missing resource planning anchor")
package["scripts"]["test"] = old_test.replace(
    needle,
    "node tests/remote-raid-rules.test.mjs && " + needle,
    1
)
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n")
