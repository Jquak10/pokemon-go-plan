import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path =>
  readFileSync(
    new URL(
      `../${path}`,
      import.meta.url
    ),
    "utf8"
  );

const help =
  read(
    "public/help.html"
  );
const landing =
  read(
    "public/index.html"
  );
const sources =
  read(
    "public/sources.html"
  );
const planner =
  read(
    "public/manage.html"
  );

for (const [
  label,
  html
] of [
  ["Landing", landing],
  ["Data Sources", sources],
  ["Planner", planner]
]) {
  assert.match(
    html,
    /href="\/help"/,
    `${label} must expose the public Help & Data Handling page`
  );
}

for (const phrase of [
  "management URL is a bearer credential",
  "calendar subscription URL is a bearer credential",
  "There is no email/password account",
  "System / Light / Dark appearance choice is saved only in this browser's local storage",
  "The planner does not keep that downloaded file as a separate server-side recovery archive",
  "Without the management link or a saved backup, the old planner cannot be recovered",
  "Preferences → Delete Planner permanently removes",
  "Do not include private management URLs, calendar subscription URLs"
]) {
  assert.ok(
    help.includes(
      phrase
    ),
    `Help page must explain: ${phrase}`
  );
}

assert.match(
  help,
  /href="https:\/\/github\.com\/Jquak10\/pokemon-go-plan\/issues\/new"/,
  "Help page must provide the public GitHub issue-reporting route"
);

for (const forbidden of [
  "ADMIN_KEY=",
  "FEED_LINK_KEY=",
  "/manage/bl-",
  "/calendar/"
]) {
  assert.equal(
    help.includes(
      forbidden
    ),
    false,
    `Help page must not embed private credential material: ${forbidden}`
  );
}

console.log(
  "public Help & Data Handling checks passed"
);
