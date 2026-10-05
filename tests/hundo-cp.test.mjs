import assert from "node:assert/strict";

await import(
  "../public/planner-hundo-logic.js"
);

const {
  cpMultiplierForLevel,
  hundoCp,
  searchMatches,
  isTransformedRaidForm,
  raidEncounterForSelection,
  benchmarkData
} =
  globalThis.PlannerHundoLogic;

const mewtwo = {
  key: "150|base|mewtwo|mewtwo",
  dex_nr: 150,
  name: "Mewtwo",
  form_id: "MEWTWO",
  kind: "base",
  attack: 300,
  defense: 182,
  stamina: 214,
  types: [
    "Psychic"
  ]
};

const expectedMewtwoCp = new Map([
  [15, 1791],
  [20, 2387],
  [25, 2984],
  [30, 3582],
  [35, 3880],
  [40, 4178],
  [50, 4724]
]);

for (
  const [
    level,
    expectedCp
  ] of expectedMewtwoCp
) {
  assert.equal(
    hundoCp(
      mewtwo,
      level
    ),
    expectedCp,
    `Mewtwo 15/15/15 CP must match the known Level ${level} value`
  );
}

assert.ok(
  Math.abs(
    cpMultiplierForLevel(
      20.5
    ) -
      0.6048236602280411
  ) <
    1e-12,
  "Level 20.5 must use the canonical RMS half-level CPM relationship"
);
assert.equal(
  hundoCp(
    mewtwo,
    20.5
  ),
  2447,
  "Half-level Hundo CP must remain deterministic"
);
assert.equal(
  cpMultiplierForLevel(
    20.25
  ),
  null,
  "Quarter levels are not valid Pokémon GO levels"
);

const raichu = {
  key: "26|base|raichu|raichu",
  dex_nr: 26,
  name: "Raichu",
  form_id: "RAICHU",
  kind: "base",
  attack: 193,
  defense: 151,
  stamina: 155,
  types: [
    "Electric"
  ]
};

const alolanRaichu = {
  key: "26|regional|raichu alola|raichu alola",
  dex_nr: 26,
  name: "Raichu (Alola)",
  form_id: "RAICHU_ALOLA",
  kind: "regional",
  attack: 201,
  defense: 154,
  stamina: 155,
  types: [
    "Electric",
    "Psychic"
  ]
};

assert.equal(
  hundoCp(
    raichu,
    20
  ),
  1247
);
assert.equal(
  hundoCp(
    alolanRaichu,
    20
  ),
  1306,
  "Regional forms must keep their own stats"
);
assert.deepEqual(
  searchMatches(
    [
      raichu,
      alolanRaichu
    ],
    "raichu"
  ).map(
    entry =>
      entry.key
  ),
  [
    raichu.key,
    alolanRaichu.key
  ],
  "Search must retain distinct base and regional form entries"
);

const charizard = {
  key: "6|base|charizard|charizard",
  dex_nr: 6,
  name: "Charizard",
  form_id: "CHARIZARD",
  kind: "base",
  attack: 223,
  defense: 173,
  stamina: 186,
  types: [
    "Fire",
    "Flying"
  ]
};

const megaCharizardX = {
  key: "6|mega|mega charizard x|charizard mega x",
  dex_nr: 6,
  name: "Mega Charizard X",
  form_id: "CHARIZARD_MEGA_X",
  kind: "mega",
  attack: 273,
  defense: 213,
  stamina: 186,
  types: [
    "Fire",
    "Dragon"
  ]
};

const groudon = {
  key: "383|base|groudon|groudon",
  dex_nr: 383,
  name: "Groudon",
  form_id: "GROUDON",
  kind: "base",
  attack: 270,
  defense: 228,
  stamina: 205,
  types: [
    "Ground"
  ]
};

const primalGroudon = {
  key: "383|primal|primal groudon|groudon primal",
  dex_nr: 383,
  name: "Primal Groudon",
  form_id: "GROUDON_PRIMAL",
  kind: "primal",
  attack: 353,
  defense: 268,
  stamina: 218,
  types: [
    "Ground",
    "Fire"
  ]
};

const catalog = [
  mewtwo,
  raichu,
  alolanRaichu,
  charizard,
  megaCharizardX,
  groudon,
  primalGroudon
];

assert.equal(
  isTransformedRaidForm(
    megaCharizardX
  ),
  true
);
assert.equal(
  isTransformedRaidForm(
    primalGroudon
  ),
  true
);
assert.equal(
  isTransformedRaidForm(
    charizard
  ),
  false
);
assert.equal(
  raidEncounterForSelection(
    megaCharizardX,
    catalog
  ),
  charizard,
  "Mega selections must resolve the underlying base catch encounter"
);
assert.equal(
  raidEncounterForSelection(
    primalGroudon,
    catalog
  ),
  groudon,
  "Primal selections must resolve the underlying base catch encounter"
);

const megaBenchmarks =
  benchmarkData(
    megaCharizardX,
    catalog
  );

const megaByLevel =
  new Map(
    megaBenchmarks.map(
      item => [
        item.level,
        item
      ]
    )
  );

assert.equal(
  megaByLevel.get(
    20
  ).cp,
  1651,
  "Mega raid Level 20 benchmark must use caught Charizard stats"
);
assert.equal(
  megaByLevel.get(
    25
  ).cp,
  2064,
  "Weather-boosted Mega raid benchmark must use caught Charizard stats"
);
assert.equal(
  megaByLevel.get(
    20
  ).label,
  "Raid encounter"
);
assert.equal(
  megaByLevel.get(
    25
  ).label,
  "Weather-boosted raid encounter"
);
assert.equal(
  megaByLevel.get(
    20
  ).cp_subject_name,
  "Charizard"
);
assert.equal(
  megaByLevel.get(
    20
  ).theoretical,
  false
);
assert.equal(
  megaByLevel.get(
    15
  ).cp,
  1650,
  "Non-raid transformed benchmark CP must keep Mega Charizard X stats"
);
assert.equal(
  megaByLevel.get(
    15
  ).label,
  "Selected form"
);
assert.equal(
  megaByLevel.get(
    15
  ).note,
  "Theoretical · Lv 15"
);
assert.equal(
  megaByLevel.get(
    15
  ).theoretical,
  true
);
assert.equal(
  hundoCp(
    megaCharizardX,
    20
  ),
  2200,
  "Custom-level calculation must preserve transformed-form stats"
);

const primalBenchmarks =
  benchmarkData(
    primalGroudon,
    catalog
  );
const primalByLevel =
  new Map(
    primalBenchmarks.map(
      item => [
        item.level,
        item
      ]
    )
  );

assert.equal(
  primalByLevel.get(
    20
  ).cp,
  2351
);
assert.equal(
  primalByLevel.get(
    25
  ).cp,
  2939
);
assert.equal(
  hundoCp(
    primalGroudon,
    20
  ),
  3372,
  "Theoretical/custom Primal CP must remain available separately from raid catch CP"
);

const missingEncounter =
  benchmarkData(
    megaCharizardX,
    [
      megaCharizardX
    ]
  );
const missingRaid =
  missingEncounter.find(
    item =>
      item.level === 20
  );

assert.equal(
  missingRaid.cp,
  null,
  "Missing exact catch form must show no raid CP rather than transformed-form CP"
);
assert.equal(
  missingRaid.encounter_missing,
  true
);
assert.equal(
  missingRaid.note,
  "Encounter form unavailable · Lv 20"
);

const normalBenchmarks =
  benchmarkData(
    mewtwo,
    catalog
  );

assert.equal(
  normalBenchmarks.find(
    item =>
      item.level === 20
  ).label,
  "Raid / Egg",
  "Ordinary forms must preserve the familiar benchmark labels"
);
assert.equal(
  normalBenchmarks.find(
    item =>
      item.level === 25
  ).label,
  "Weather-boosted raid"
);
assert.equal(
  normalBenchmarks.every(
    item =>
      item.theoretical ===
      false
  ),
  true
);

console.log(
  "Hundo CP correctness tests passed"
);
