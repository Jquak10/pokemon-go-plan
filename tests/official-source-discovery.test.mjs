import assert from "node:assert/strict";
import {
  activePinnedOfficialEventPageUrls,
  officialEventLinksFromHtml,
  officialEventPageUrlsForSync
} from "../src/index.js";

const megaFinale =
  "https://pokemongo.com/gofest/megafinale";
const armoredMewtwo =
  "https://pokemongo.com/news/megafinale-2026-armored-mewtwo";

assert.deepEqual(
  activePinnedOfficialEventPageUrls(
    "2026-09-06"
  ),
  [
    megaFinale,
    armoredMewtwo
  ],
  "event-scoped pins must remain active through their final official event date"
);

assert.deepEqual(
  activePinnedOfficialEventPageUrls(
    "2026-09-07"
  ),
  [],
  "expired pins must leave the priority discovery lane immediately after their event horizon"
);

const currentLinks =
  Array.from(
    {
      length: 10
    },
    (_unused, index) =>
      `https://pokemongo.com/news/current-event-${index + 1}`
  );

const indexHtml =
  currentLinks
    .map(
      url =>
        `<a href="${url}">Current event</a>`
    )
    .join("\n");

const beforeExpiry =
  officialEventLinksFromHtml(
    indexHtml,
    "https://pokemongo.com/news",
    "2026-09-06"
  );

assert.deepEqual(
  beforeExpiry.slice(
    0,
    2
  ),
  [
    megaFinale,
    armoredMewtwo
  ],
  "active pins must retain their temporary priority ahead of current-news links"
);

const afterExpiry =
  officialEventLinksFromHtml(
    indexHtml,
    "https://pokemongo.com/news",
    "2026-09-07"
  );

assert.equal(
  afterExpiry.includes(
    megaFinale
  ),
  false
);

assert.equal(
  afterExpiry.includes(
    armoredMewtwo
  ),
  false
);

assert.deepEqual(
  afterExpiry.slice(
    0,
    8
  ),
  currentLinks.slice(
    0,
    8
  ),
  "after pin expiry the full bounded discovery capacity must be available to current official news"
);

const limitedBefore =
  officialEventPageUrlsForSync(
    beforeExpiry,
    [],
    {
      discoveryLimit: 8,
      retainedLimit: 48
    }
  );

assert.equal(
  limitedBefore.length,
  8
);

assert.deepEqual(
  limitedBefore.slice(
    0,
    2
  ),
  [
    megaFinale,
    armoredMewtwo
  ],
  "before expiry the known event may deliberately consume two discovery slots"
);

const retainedFutureUrl =
  "https://pokemongo.com/news/future-retained-event";

const limitedAfter =
  officialEventPageUrlsForSync(
    afterExpiry,
    [
      megaFinale,
      retainedFutureUrl
    ],
    {
      discoveryLimit: 8,
      retainedLimit: 48
    }
  );

assert.equal(
  limitedAfter.length,
  10,
  "retained future sources must be appended independently after the eight-page discovery budget"
);

assert.deepEqual(
  limitedAfter.slice(
    0,
    8
  ),
  currentLinks.slice(
    0,
    8
  ),
  "retained pages must not displace current discovery pages"
);

assert.deepEqual(
  limitedAfter.slice(
    8
  ),
  [
    megaFinale,
    retainedFutureUrl
  ],
  "an expired former pin must still be eligible for the separate retained-future recovery lane"
);

const duplicateRetained =
  officialEventPageUrlsForSync(
    afterExpiry,
    [
      currentLinks[0],
      retainedFutureUrl
    ],
    {
      discoveryLimit: 8,
      retainedLimit: 48
    }
  );

assert.equal(
  duplicateRetained.filter(
    url =>
      url ===
      currentLinks[0]
  ).length,
  1,
  "retained recovery must not duplicate a URL already present in current discovery"
);

console.log(
  "Official source pin expiry and retained-future tests passed."
);
