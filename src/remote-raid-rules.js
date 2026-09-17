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
    /(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?(?:\s*((?:UTC|GMT)\s*[+-]\s*\d{1,2}(?::?\d{2})?|PDT|PST|MDT|MST|CDT|CST|EDT|EST|UTC|GMT))?/i
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
