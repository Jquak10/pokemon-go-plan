import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDaysIso,
  dateFromPropertyLine,
  escapeIcs,
  firstProperty,
  inclusiveEndDateFromPropertyLine,
  parseIcsEvents,
  unescapeIcs,
  unfoldIcs
} from "../src/calendar-ics.js";

const worker =
  readFileSync(
    new URL(
      "../src/index.js",
      import.meta.url
    ),
    "utf8"
  );

assert.match(
  worker,
  /from "\.\/calendar-ics\.js"/
);
assert.doesNotMatch(
  worker,
  /function parseIcsEvents\(/
);
assert.doesNotMatch(
  worker,
  /function addDaysIso\(/
);

assert.equal(
  addDaysIso(
    "2026-02-28",
    1
  ),
  "2026-03-01"
);

assert.equal(
  addDaysIso(
    "not-a-date",
    1
  ),
  null
);

assert.equal(
  dateFromPropertyLine(
    "DTSTART;TZID=Asia/Singapore:20260920T180000"
  ),
  "2026-09-20"
);

assert.equal(
  inclusiveEndDateFromPropertyLine(
    "DTEND;VALUE=DATE:20260923",
    "2026-09-20"
  ),
  "2026-09-22",
  "RFC 5545 all-day DTEND must be converted from exclusive to inclusive"
);

assert.equal(
  inclusiveEndDateFromPropertyLine(
    "DTEND:20260923T010000Z",
    "2026-09-20"
  ),
  "2026-09-23",
  "Timed DTEND dates must not be shifted backward"
);

assert.equal(
  inclusiveEndDateFromPropertyLine(
    "DTEND;VALUE=DATE:20260920",
    "2026-09-20"
  ),
  "2026-09-20",
  "An exclusive DTEND that would precede the start must clamp to the start date"
);

const originalText =
  "Raid, Max; Event\nSecond line \\ value";

assert.equal(
  unescapeIcs(
    escapeIcs(
      originalText
    )
  ),
  originalText
);

assert.equal(
  unfoldIcs(
    "SUMMARY:Pokémon GO\r\n Finale\r\nDESCRIPTION:Test"
  ),
  "SUMMARY:Pokémon GOFinale\nDESCRIPTION:Test"
);

assert.deepEqual(
  firstProperty(
    [
      "UID:test-1",
      "SUMMARY;LANGUAGE=en:Test Event"
    ],
    "SUMMARY"
  ),
  {
    line:
      "SUMMARY;LANGUAGE=en:Test Event",
    left:
      "SUMMARY;LANGUAGE=en",
    value:
      "Test Event"
  }
);

const parsed =
  parseIcsEvents(
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-1",
      "SUMMARY:Pokémon GO\\, Max\\; Weekend",
      "DESCRIPTION:Line one\\nLine two",
      "DTSTART;VALUE=DATE:20260920",
      "DTEND;VALUE=DATE:20260923",
      "URL:https://example.com/event-1",
      "X-CUSTOM:keep-me",
      "SEQUENCE:2",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:event-2",
      "SUMMARY:Timed Raid Hour",
      "DTSTART;TZID=Asia/Singapore:20260924T180000",
      "DTEND;TZID=Asia/Singapore:20260924T190000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:ignored",
      "DTSTART;VALUE=DATE:20260925",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n")
  );

assert.equal(
  parsed.length,
  2,
  "VEVENTs without SUMMARY or DTSTART must be ignored"
);

assert.deepEqual(
  {
    source_uid:
      parsed[0].source_uid,
    summary:
      parsed[0].summary,
    description:
      parsed[0].description,
    start_date:
      parsed[0].start_date,
    end_date:
      parsed[0].end_date,
    source_url:
      parsed[0].source_url
  },
  {
    source_uid:
      "event-1",
    summary:
      "Pokémon GO, Max; Weekend",
    description:
      "Line one\nLine two",
    start_date:
      "2026-09-20",
    end_date:
      "2026-09-22",
    source_url:
      "https://example.com/event-1"
  }
);

assert.match(
  parsed[0].other_lines,
  /UID:event-1/
);
assert.match(
  parsed[0].other_lines,
  /URL:https:\/\/example\.com\/event-1/
);
assert.match(
  parsed[0].other_lines,
  /X-CUSTOM:keep-me/
);
assert.doesNotMatch(
  parsed[0].other_lines,
  /SEQUENCE:2|STATUS:CONFIRMED/
);

assert.equal(
  parsed[1].start_date,
  "2026-09-24"
);
assert.equal(
  parsed[1].end_date,
  "2026-09-24"
);

console.log(
  "calendar ICS regression tests passed"
);
