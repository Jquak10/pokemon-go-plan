import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relative =>
  readFileSync(
    new URL(`../${relative}`, import.meta.url),
    "utf8"
  );

const pages = {
  landing: read("public/index.html"),
  planner: read("public/manage.html"),
  sources: read("public/sources.html"),
  admin: read("public/admin.html")
};

function startTag(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<[^>]+\\bid="${escaped}"[^>]*>`, "i"))?.[0] || "";
}

function assertLiveStatus(html, id) {
  const tag = startTag(html, id);
  assert.ok(tag, `Missing #${id}`);
  assert.match(tag, /\brole="status"/i, `#${id} must expose status semantics`);
  assert.match(tag, /\baria-live="polite"/i, `#${id} must announce politely`);
  assert.match(tag, /\baria-atomic="true"/i, `#${id} must announce complete messages`);
}

function missingControlNames(html) {
  const labelFor = new Set(
    [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/gi)].map(match => match[1])
  );
  const wrapped = new Set();

  for (const match of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)) {
    for (const control of match[1].matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/gi)) {
      wrapped.add(control[1]);
    }
  }

  const missing = [];
  for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = match[2];
    const type = attrs.match(/\btype="([^"]+)"/i)?.[1]?.toLowerCase() || "";
    if (type === "hidden") continue;

    const id = attrs.match(/\bid="([^"]+)"/i)?.[1] || "";
    const named =
      /\baria-label="[^"]+"/i.test(attrs) ||
      /\baria-labelledby="[^"]+"/i.test(attrs) ||
      (id && (labelFor.has(id) || wrapped.has(id)));

    if (!named) missing.push(id || match[0]);
  }

  return missing;
}

for (const [name, html] of Object.entries(pages)) {
  assert.deepEqual(
    missingControlNames(html),
    [],
    `${name} form controls must all have programmatic accessible names`
  );
}

assertLiveStatus(pages.landing, "status");

for (const id of [
  "loadStatus",
  "battleResourceStatus",
  "dailyBudgetOverrideStatus",
  "raidUsageStatus",
  "settingsStatus",
  "managementLinkStatus",
  "plannerBackupStatus",
  "plannerRestoreStatus",
  "deletePlannerStatus",
  "feedLinkStatus",
  "signedFeedStatus",
  "legacyFeedStatus",
  "calendarStatus",
  "raidLogStatus",
  "targetStatus",
  "targetActionStatus"
]) {
  assertLiveStatus(pages.planner, id);
}

assertLiveStatus(pages.admin, "adminAuthBadge");

assert.equal(
  (pages.admin.match(/<small\b[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*>Waiting<\/small>/g) || []).length,
  3,
  "Each Admin sync phase must expose live status feedback"
);

const initialPressed = [
  [pages.planner, 'data-target-view="cards"', "true"],
  [pages.planner, 'data-target-view="list"', "false"],
  [pages.planner, 'data-target-status="active"', "true"],
  [pages.planner, 'data-target-status="completed"', "false"],
  [pages.planner, 'data-raid-type="remote"', "true"],
  [pages.planner, 'data-raid-type="local"', "false"],
  [pages.admin, 'data-admin-section="official"', "true"],
  [pages.admin, 'data-admin-section="meta"', "false"]
];

for (const [html, marker, expected] of initialPressed) {
  const tag = html.match(new RegExp(`<button\\b[^>]*${marker}[^>]*>`, "i"))?.[0] || "";
  assert.match(tag, new RegExp(`aria-pressed="${expected}"`), `${marker} must expose initial selected state`);
}

const plannerApp = read("public/planner-app.js");
const adminApp = read("public/admin-app.js");

for (const token of ["data.raidType", "data.targetView", "data.targetStatus"]) {
  const index = plannerApp.indexOf(token);
  assert.ok(index >= 0, `Missing runtime state handler for ${token}`);
  assert.match(
    plannerApp.slice(index, index + 900),
    /setAttribute\([\s\S]*?"aria-pressed"/,
    `${token} must synchronize aria-pressed`
  );
}

assert.match(
  plannerApp,
  /raid-activity-status[\s\S]{0,700}setAttribute\([\s\S]*?"role"[\s\S]*?"status"/,
  "Recent battle feedback created at runtime must expose status semantics"
);
assert.match(
  plannerApp,
  /max-tier-override-status" role="status" aria-live="polite" aria-atomic="true"/,
  "Max tier save feedback must be a live status"
);
assert.match(
  adminApp,
  /data\.adminSection[\s\S]{0,900}setAttribute\([\s\S]*?"aria-pressed"/,
  "Admin section selection must synchronize aria-pressed"
);

console.log("accessibility semantics checks passed");
