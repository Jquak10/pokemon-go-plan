import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const readme = read('../README.md');
const history = read('../docs/ROLLOUT_HISTORY.md');

assert.match(
  readme,
  /\[Historical rollout and migration reference\]\(docs\/ROLLOUT_HISTORY\.md\)/,
  'README must link the historical rollout/migration reference'
);
assert.match(
  readme,
  /schema\.sql.*authoritative baseline for a \*\*fresh\*\* D1 database/s,
  'README must identify schema.sql as the fresh-database baseline'
);
assert.match(
  readme,
  /latest retained numbered migration is `0007_feed_link_credentials\.sql`/,
  'README must state the current retained migration boundary'
);
assert.doesNotMatch(
  readme,
  /^## Part \d+:/m,
  'implementation-stage Part headings must not return to the current README'
);
assert.doesNotMatch(
  readme,
  /wrangler d1 execute DB --remote --file=migrations\/000[1-7][^\s`]*/,
  'historical production migration commands must not appear in the current README'
);

assert.match(
  history,
  /> \*\*Historical reference — do not execute these commands as a current deployment checklist\.\*\*/,
  'historical rollout document must carry an explicit do-not-rerun warning'
);
assert.match(
  history,
  /For \*\*current\*\* setup and deployment guidance, use \[README\.md\]\(\.\.\/README\.md\)/,
  'historical document must point operators back to current README guidance'
);
assert.match(
  history,
  /0003_target_battle_kind\.sql.*one-time.*do not rerun/is,
  'historical document must preserve the non-repeatable migration 0003 warning'
);

for (let number = 1; number <= 7; number += 1) {
  assert.match(
    history,
    new RegExp(`\\`000${number}_[^\\`]+\\``),
    `historical migration inventory must retain migration 000${number}`
  );
}

console.log('Documentation safety checks passed.');
