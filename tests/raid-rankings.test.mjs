import assert from "node:assert/strict";
import {
  buildRaidAttackerRankCatalog,
  raidRankProfileForName
} from "../src/raid-rankings.js";

const type = (name) => ({
  type: `POKEMON_TYPE_${name.toUpperCase()}`,
  names: { English: name }
});
const move = (id, name, moveType, power, energy, durationMs) => ({
  id,
  names: { English: name },
  type: type(moveType),
  power,
  energy,
  durationMs
});
const metalClaw = move("METAL_CLAW", "Metal Claw", "Steel", 8, 10, 700);
const ironHead = move("IRON_HEAD", "Iron Head", "Steel", 60, -50, 1900);
const closeCombat = move("CLOSE_COMBAT", "Close Combat", "Fighting", 100, -100, 2300);
const playRough = move("PLAY_ROUGH", "Play Rough", "Fairy", 90, -50, 2900);
const thunderShock = move("THUNDER_SHOCK", "Thunder Shock", "Electric", 5, 8, 600);
const thunderbolt = move("THUNDERBOLT", "Thunderbolt", "Electric", 80, -50, 2500);
const form = ({ id, dexNr, name, attack, defense, stamina, primary, secondary = null, quickMoves = {}, cinematicMoves = {} }) => ({
  id,
  formId: id,
  dexNr,
  names: { English: name },
  stats: { attack, defense, stamina },
  primaryType: type(primary),
  secondaryType: secondary ? type(secondary) : null,
  quickMoves,
  cinematicMoves,
  eliteQuickMoves: {},
  eliteCinematicMoves: {},
  regionForms: {},
  megaEvolutions: {}
});

const zacianHero = form({ id: "ZACIAN_HERO", dexNr: 888, name: "Zacian (Hero of Many Battles)", attack: 254, defense: 236, stamina: 192, primary: "Fairy", quickMoves: { METAL_CLAW: metalClaw }, cinematicMoves: { IRON_HEAD: ironHead, PLAY_ROUGH: playRough } });
const zacianCrowned = form({ id: "ZACIAN_CROWNED_SWORD", dexNr: 888, name: "Zacian (Crowned Sword)", attack: 332, defense: 240, stamina: 192, primary: "Fairy", secondary: "Steel", quickMoves: { METAL_CLAW: metalClaw }, cinematicMoves: { IRON_HEAD: ironHead, PLAY_ROUGH: playRough } });
const zacian = form({ id: "ZACIAN", dexNr: 888, name: "Zacian", attack: 253, defense: 236, stamina: 192, primary: "Fairy", quickMoves: { METAL_CLAW: metalClaw }, cinematicMoves: { IRON_HEAD: ironHead, PLAY_ROUGH: playRough } });
zacian.regionForms = { ZACIAN_HERO: zacianHero, ZACIAN_CROWNED_SWORD: zacianCrowned };

const zamazentaHero = form({ id: "ZAMAZENTA_HERO", dexNr: 889, name: "Zamazenta (Hero of Many Battles)", attack: 254, defense: 236, stamina: 192, primary: "Fighting", quickMoves: { METAL_CLAW: metalClaw }, cinematicMoves: { IRON_HEAD: ironHead, CLOSE_COMBAT: closeCombat } });
const zamazentaCrowned = form({ id: "ZAMAZENTA_CROWNED_SHIELD", dexNr: 889, name: "Zamazenta (Crowned Shield)", attack: 250, defense: 292, stamina: 192, primary: "Fighting", secondary: "Steel", quickMoves: { METAL_CLAW: metalClaw }, cinematicMoves: { IRON_HEAD: ironHead, CLOSE_COMBAT: closeCombat } });
const zamazenta = form({ id: "ZAMAZENTA", dexNr: 889, name: "Zamazenta", attack: 253, defense: 236, stamina: 192, primary: "Fighting", quickMoves: { METAL_CLAW: metalClaw }, cinematicMoves: { IRON_HEAD: ironHead, CLOSE_COMBAT: closeCombat } });
zamazenta.regionForms = { ZAMAZENTA_HERO: zamazentaHero, ZAMAZENTA_CROWNED_SHIELD: zamazentaCrowned };

const thundurusIncarnate = form({ id: "THUNDURUS_INCARNATE", dexNr: 642, name: "Thundurus (Incarnate Forme)", attack: 266, defense: 164, stamina: 188, primary: "Electric", secondary: "Flying", quickMoves: { THUNDER_SHOCK: thunderShock }, cinematicMoves: { THUNDERBOLT: thunderbolt } });
const thundurus = form({ id: "THUNDURUS", dexNr: 642, name: "Thundurus", attack: 265, defense: 164, stamina: 188, primary: "Electric", secondary: "Flying", quickMoves: { THUNDER_SHOCK: thunderShock }, cinematicMoves: { THUNDERBOLT: thunderbolt } });
thundurus.regionForms = { THUNDURUS_INCARNATE: thundurusIncarnate };

const catalog = buildRaidAttackerRankCatalog([zacian, zamazenta, thundurus]);

const zacianProfile = raidRankProfileForName("Zacian (Hero of Many Battles)", catalog);
assert.ok(zacianProfile);
assert.equal(zacianProfile.variants.some((variant) => variant.name === "Zacian"), false);
const crownedSword = zacianProfile.variants.find((variant) => variant.name === "Zacian (Crowned Sword)");
assert.ok(crownedSword, "Crowned Sword comparison must exist");
const zacianSteel = crownedSword.rankings.find((ranking) => ranking.type === "Steel");
assert.ok(zacianSteel, "Crowned Sword must have a Steel attacker rank");
assert.equal(zacianSteel.charged_move, "Behemoth Blade");

const zamazentaProfile = raidRankProfileForName("Zamazenta (Hero of Many Battles)", catalog);
assert.ok(zamazentaProfile);
assert.equal(zamazentaProfile.variants.some((variant) => variant.name === "Zamazenta"), false);
const crownedShield = zamazentaProfile.variants.find((variant) => variant.name === "Zamazenta (Crowned Shield)");
assert.ok(crownedShield, "Crowned Shield comparison must exist");
const zamazentaSteel = crownedShield.rankings.find((ranking) => ranking.type === "Steel");
assert.ok(zamazentaSteel, "Crowned Shield must have a Steel attacker rank");
assert.equal(zamazentaSteel.charged_move, "Behemoth Bash");

const shadowProfile = raidRankProfileForName("Shadow Thundurus (Incarnate Forme)", catalog);
assert.ok(shadowProfile, "Explicit Shadow raid targets must receive a Shadow rank profile");
assert.equal(shadowProfile.variants.length, 1);
assert.equal(shadowProfile.variants[0].kind, "shadow");
assert.match(shadowProfile.variants[0].name, /^Shadow Thundurus/);

console.log("raid ranking regression tests passed");
