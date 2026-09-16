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
  assert.equal(profile.variants.some((variant) => variant.name === requested.split(" (")[0]), false);
  const crowned = profile.variants.find((variant) => variant.name === crownedName);
  assert.ok(crowned, `${crownedName} comparison missing`);
  const steel = crowned.rankings.find((ranking) => ranking.type === "Steel");
  assert.ok(steel, `${crownedName} Steel rank missing`);
  assert.equal(steel.charged_move, chargedMove);
  assert.ok(Number.isFinite(Number(steel.rank)) && Number(steel.rank) > 0);
};

verifyCrowned("Zacian (Hero of Many Battles)", "Zacian (Crowned Sword)", "Behemoth Blade");
verifyCrowned("Zamazenta (Hero of Many Battles)", "Zamazenta (Crowned Shield)", "Behemoth Bash");

const thundurus = pokedex.find((pokemon) => Number(pokemon?.dexNr) === 642);
assert.ok(thundurus, "Thundurus missing from Pokémon GO API");
const shadowSprite = spriteAssetsForDisplayName(thundurus, "Shadow Thundurus (Incarnate Forme)", "shadow");
assert.ok(shadowSprite?.sprite_url, "Shadow Thundurus underlying Incarnate sprite missing");
assert.match(shadowSprite.sprite_url, /pm642\.fINCARNATE/i);

console.log("live raid ranking + Shadow sprite contract passed");
