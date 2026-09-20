import assert from "node:assert/strict";
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_ERROR,
  canonicalTimeZone,
  isValidTimeZone
} from "../src/timezone.js";

assert.equal(DEFAULT_TIMEZONE, "Asia/Singapore");
assert.match(TIMEZONE_ERROR, /valid IANA timezone/);
assert.equal(canonicalTimeZone(" Asia/Singapore "), "Asia/Singapore");
assert.equal(canonicalTimeZone("UTC"), "UTC");
assert.equal(isValidTimeZone("America/New_York"), true);
assert.equal(canonicalTimeZone("Asia/Singapor"), null);
assert.equal(canonicalTimeZone(""), null);
assert.equal(canonicalTimeZone("x".repeat(81)), null);

console.log("timezone validation tests passed");
