import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  recoverableFeedPath,
  recoverableFeedSignaturePayload
} from "../src/index.js";

const userId =
  "11111111-2222-4333-8444-555555555555";

assert.equal(
  recoverableFeedSignaturePayload(
    userId,
    0
  ),
  `pokemon-go-calendar-feed:${userId}`,
  "Generation zero must preserve the exact pre-BL-015 signed-feed payload"
);

assert.equal(
  recoverableFeedSignaturePayload(
    userId,
    3
  ),
  `pokemon-go-calendar-feed:${userId}:3`
);

assert.equal(
  recoverableFeedPath(
    userId,
    0,
    "legacySignature"
  ),
  `/calendar/recover/${userId}.legacySignature.ics`,
  "Generation zero must preserve existing signed calendar URLs"
);

assert.equal(
  recoverableFeedPath(
    userId,
    3,
    "rotatedSignature"
  ),
  `/calendar/recover/${userId}.3.rotatedSignature.ics`
);

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
  /credentialState\.generation !==[\s\S]*requestedGeneration/
);
assert.match(
  worker,
  /!credentialState\.enabled/
);
assert.match(
  worker,
  /signed_generation\s*=\s*signed_generation \+ 1/
);
assert.match(
  worker,
  /path === "\/api\/feed-link\/rotate"/
);
assert.match(
  worker,
  /path === "\/api\/feed-link\/revoke"/
);
assert.match(
  worker,
  /path === "\/api\/manage-link\/rotate"/
);
assert.match(
  worker,
  /SET[\s\S]*manage_hash = \?/
);
assert.match(
  worker,
  /Calendar credential rotation requires D1 migration 0007_feed_link_credentials\.sql/
);

console.log(
  "credential rotation tests passed"
);
