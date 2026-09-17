import assert from "node:assert/strict";
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
