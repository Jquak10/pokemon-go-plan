import assert from "node:assert/strict";
import {
  buildRaidAttackerRankCatalog,
  raidRankProfileForName
} from "../src/raid-rankings.js";
import { spriteAssetsForDisplayName } from "../src/index.js";

const url = "https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json";
const response = await fetch(url);
assert.equal(response.ok, true, `Pokémon GO API returned ${response.status}`);
const pokedex = await response.json();
const catalog = buildRaidAttackerRankCatalog(pokedex);

const verifyCrowned = (requested, crownedName, chargedMove) => {
  const profile = raidRankProfileForName(requested, catalog);
  assert.ok(profile, `No profile for ${requested}`);
  assert.equal(
    profile.variants.some((variant) => variant.name === requested.split(" (")[0]),
    false
  );
  const crowned = profile.variants.find((variant) => variant.name === crownedName);
  assert.ok(crowned, `${crownedName} comparison missing`);
  const steel = crowned.rankings.find((ranking) => ranking.type === "Steel");
  assert.ok(steel, `${crownedName} Steel rank missing`);
  assert.equal(steel.charged_move, chargedMove);
  assert.ok(Number.isFinite(Number(steel.rank)) && Number(steel.rank) > 0);
  return profile;
};

const zacianHero = verifyCrowned(
  "Zacian (Hero of Many Battles)",
  "Zacian (Crowned Sword)",
  "Behemoth Blade"
);
verifyCrowned(
  "Zamazenta (Hero of Many Battles)",
  "Zamazenta (Crowned Shield)",
  "Behemoth Bash"
);

const zacianAlias = raidRankProfileForName("Zacian", catalog);
assert.ok(zacianAlias, "Plain Zacian alias did not resolve");
assert.equal(
  zacianAlias.variants.find((variant) => variant.current)?.name,
  "Zacian (Hero of Many Battles)"
);
assert.equal(
  catalog.allForms.some((form) => form.displayName === "Zacian"),
  false,
  "Generic Zacian data container leaked into the catalog"
);
const explicitHeroFairy = zacianHero.variants
  .find((variant) => variant.name === "Zacian (Hero of Many Battles)")
  ?.rankings.find((ranking) => ranking.type === "Fairy");
const aliasHeroFairy = zacianAlias.variants
  .find((variant) => variant.name === "Zacian (Hero of Many Battles)")
  ?.rankings.find((ranking) => ranking.type === "Fairy");
assert.ok(explicitHeroFairy && aliasHeroFairy, "Zacian Hero Fairy rank missing");
assert.equal(
  aliasHeroFairy.rank,
  explicitHeroFairy.rank,
  "Plain Zacian and Hero alias produced different Fairy ranks"
);
console.log(`Current Planner PvE Zacian Hero Fairy rank: #${aliasHeroFairy.rank}`);

const raichuProfile = raidRankProfileForName("Raichu", catalog);
assert.ok(raichuProfile, "Raichu profile missing");
assert.equal(
  raichuProfile.variants.some((variant) =>
    /alola|galar|hisui|paldea/i.test(variant.name)
  ),
  false,
  "Normal Raichu profile leaked a regional comparison"
);

const megaRaichuXProfile = raidRankProfileForName("Mega Raichu X", catalog);
if (megaRaichuXProfile) {
  assert.equal(
    megaRaichuXProfile.variants.some((variant) =>
      /alola|galar|hisui|paldea/i.test(variant.name)
    ),
    false,
    "Mega Raichu X profile leaked a regional comparison"
  );
}

const alolanRaichuForm = catalog.allForms.find(
  (form) => Number(form.dexNr) === 26 && form.region === "alola"
);
if (alolanRaichuForm) {
  const regionalProfile = raidRankProfileForName(
    alolanRaichuForm.displayName,
    catalog
  );
  assert.ok(regionalProfile, "Alolan Raichu profile missing");
  assert.equal(
    regionalProfile.variants.every((variant) =>
      /alola/i.test(variant.name)
    ),
    true,
    "Regional Raichu profile leaked normal/non-regional comparisons"
  );
}

const thundurus = pokedex.find((pokemon) => Number(pokemon?.dexNr) === 642);
assert.ok(thundurus, "Thundurus missing from Pokémon GO API");
const shadowSprite = spriteAssetsForDisplayName(
  thundurus,
  "Shadow Thundurus (Incarnate Forme)",
  "shadow"
);
assert.ok(
  shadowSprite?.sprite_url,
  "Shadow Thundurus underlying Incarnate sprite missing"
);
assert.match(shadowSprite.sprite_url, /pm642\.fINCARNATE/i);

console.log("live raid ranking + form-scope + Shadow sprite contract passed");
