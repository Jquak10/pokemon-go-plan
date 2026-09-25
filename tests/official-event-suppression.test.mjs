import assert from "node:assert/strict";
import {
  eventIsSuppressedByRules,
  eventSuppressionSelector,
  officialEventSuppressionRulesFromText,
  suppressionSourceTypesForEvent,
  visibleEventSegments
} from "../src/index.js";

const sourceUrl =
  "https://pokemongo.com/en/news/city-safari-boston-update";

const boston = {
  id: "boston",
  source_type: "event",
  source_uid: "gocal:boston",
  summary:
    "Pokémon GO City Safari: Boston",
  start_date: "2026-09-26",
  end_date: "2026-09-27"
};

const brisbane = {
  id: "brisbane",
  source_type: "event",
  source_uid: "gocal:brisbane",
  summary:
    "Pokémon GO City Safari: Brisbane",
  start_date: "2026-09-26",
  end_date: "2026-09-27"
};

const bostonSelector =
  eventSuppressionSelector(
    boston
  );

assert.equal(
  bostonSelector,
  "event:event:city safari boston"
);

assert.deepEqual(
  suppressionSourceTypesForEvent(
    boston
  ),
  [
    "event",
    bostonSelector
  ],
  "events must keep their ordinary source type plus a targeted suppression selector"
);

const bostonNotice = `
Event Update: City Safari Boston

Trainers,

The Pokémon GO team has been monitoring the weather forecasts for the Boston metropolitan area.
Due to the projected severity of the incoming storm, the City Safari Boston event will be rescheduled to a later date.
Ticket sales for City Safari Boston are closed.
Details regarding the rescheduled event and options for existing ticket holders will be shared as soon as possible.
`;

const bostonRules =
  officialEventSuppressionRulesFromText(
    bostonNotice,
    sourceUrl,
    [
      boston,
      brisbane
    ]
  );

assert.equal(
  bostonRules.length,
  1,
  "a definite official reschedule notice should create one targeted rule"
);

assert.deepEqual(
  bostonRules[0]
    .suppressed_source_types,
  [
    bostonSelector
  ],
  "the reschedule must target Boston rather than every general event"
);

assert.equal(
  bostonRules[0].start_date,
  "2026-09-26"
);

assert.equal(
  bostonRules[0].end_date,
  "2026-09-27"
);

assert.equal(
  eventIsSuppressedByRules(
    boston,
    bostonRules
  ),
  true,
  "the affected event must be hidden from availability/recommendation flows"
);

assert.equal(
  eventIsSuppressedByRules(
    brisbane,
    bostonRules
  ),
  false,
  "another City Safari on the same dates/source type must remain available"
);

assert.deepEqual(
  visibleEventSegments(
    boston,
    bostonRules
  ),
  [],
  "the matched event must disappear from Calendar/ICS visibility for its original window"
);

assert.deepEqual(
  visibleEventSegments(
    brisbane,
    bostonRules
  ),
  [
    brisbane
  ],
  "unrelated same-date events must remain visible in Calendar/ICS"
);

assert.deepEqual(
  officialEventSuppressionRulesFromText(
    bostonNotice,
    sourceUrl,
    [
      boston,
      brisbane
    ],
    bostonRules
  ),
  [],
  "an already-persisted official notice must not create duplicate targeted suppressions"
);

const postponedNotice =
  "Pokémon GO City Safari: Boston has been postponed. Further details will be announced later.";

assert.equal(
  officialEventSuppressionRulesFromText(
    postponedNotice,
    "https://pokemongo.com/news/boston-city-safari-know-before-you-go",
    [
      boston,
      brisbane
    ]
  ).length,
  1,
  "postponed must be recognized as a definite schedule change"
);

const cancelledNotice =
  "Pokémon GO City Safari: Boston has been canceled due to severe conditions.";

assert.equal(
  officialEventSuppressionRulesFromText(
    cancelledNotice,
    "https://pokemongo.com/news/example-cancelled",
    [
      boston,
      brisbane
    ]
  ).length,
  1,
  "US-English canceled spelling must be recognized"
);

const cautiousWeatherCopy = `
Pokémon GO City Safari: Boston is planned for September 26 and 27, 2026.
In the case of extreme weather or natural disasters, the event may be suspended.
Upcoming events are subject to change.
`;

assert.deepEqual(
  officialEventSuppressionRulesFromText(
    cautiousWeatherCopy,
    "https://pokemongo.com/news/boston-city-safari-know-before-you-go",
    [
      boston,
      brisbane
    ]
  ),
  [],
  "conditional may-be-suspended guidance must not suppress an event"
);

const unrelatedReschedule = `
Pokémon GO City Safari: Boston takes place September 26 and 27.
A community meetup in Cambridge has been rescheduled to a later date.
`;

assert.deepEqual(
  officialEventSuppressionRulesFromText(
    unrelatedReschedule,
    "https://pokemongo.com/news/example-unrelated",
    [
      boston,
      brisbane
    ]
  ),
  [],
  "a schedule-change verb elsewhere on the page must not suppress a merely mentioned event"
);

const broadText =
  "Seasonal Mega Raids, Seasonal Five-Star Raids, Seasonal Shadow Raids, Seasonal Raid Hours, and Seasonal Spotlight Hours will not take place from September 5, 2026 to September 6, 2026.";

const broadRules =
  officialEventSuppressionRulesFromText(
    broadText,
    "https://pokemongo.com/gofest/megafinale"
  );

assert.equal(
  broadRules.length,
  1
);

assert.deepEqual(
  broadRules[0]
    .suppressed_source_types,
  [
    "raid_battles",
    "raid_hour",
    "pokemon_spotlight_hour"
  ],
  "the existing multi-source Mega Finale suppression contract must remain intact"
);

console.log(
  "Official event cancellation/reschedule suppression tests passed."
);
