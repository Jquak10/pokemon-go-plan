from pathlib import Path
import json

# ---------------- src/index.js ----------------
p = Path("src/index.js")
s = p.read_text(encoding="utf-8")

old = '''  if (wantsShadow) {
    const exactShadow =
      candidates.find(
        candidate =>
          candidate.image &&
          (candidate.text || "").includes("shadow")
      );

    // Never substitute a base-form image for a Shadow raid form.
    return exactShadow
      ? {
          sprite_url: exactShadow.image,
          shiny_sprite_url: exactShadow.shinyImage || null
        }
      : {
          sprite_url: null,
          shiny_sprite_url: null
        };
  }
'''
new = '''  if (wantsShadow) {
    const exactShadow =
      candidates.find(
        candidate =>
          candidate.image &&
          (candidate.text || "").includes("shadow")
      );

    if (exactShadow) {
      return {
        sprite_url: exactShadow.image,
        shiny_sprite_url: exactShadow.shinyImage || null
      };
    }

    // pokemon-go-api does not normally publish separate static Shadow icons;
    // the in-game Shadow treatment is applied over the species/form model.
    // Reuse only the best matching underlying GO form, then let the UI apply
    // an explicit Shadow aura treatment. This avoids both a blank card and a
    // silent substitution to a different form (for example Therian vs Incarnate).
    const shadowAliases = new Map([
      ["alolan", "alola"],
      ["galarian", "galar"],
      ["hisuian", "hisui"],
      ["paldean", "paldea"]
    ]);

    const shadowTokens =
      desiredTokens
        .filter(
          token =>
            token !== "shadow" &&
            token !== "form" &&
            token !== "forme"
        )
        .map(
          token =>
            shadowAliases.get(token) || token
        );

    const formMarkers = new Set([
      "alola",
      "galar",
      "hisui",
      "paldea",
      "incarnate",
      "therian",
      "origin",
      "attack",
      "defense",
      "speed"
    ]);

    const requestedMarkers =
      shadowTokens.filter(
        token =>
          formMarkers.has(token)
      );

    const underlying =
      candidates
        .filter(candidate => candidate.image)
        .map(candidate => {
          const text = candidate.text || "";
          let score = 0;

          for (const token of shadowTokens) {
            if (text.includes(token)) {
              score += formMarkers.has(token) ? 30 : 8;
            }
          }

          if (
            requestedMarkers.length &&
            !requestedMarkers.some(
              marker => text.includes(marker)
            )
          ) {
            score -= 40;
          }

          return { candidate, score };
        })
        .sort((a, b) => b.score - a.score)
        .find(item => item.score > 0)
        ?.candidate || null;

    return underlying
      ? {
          sprite_url: underlying.image,
          shiny_sprite_url: null,
          shadow_visual_fallback: true
        }
      : {
          sprite_url: null,
          shiny_sprite_url: null
        };
  }
'''
if s.count(old) != 1:
    raise SystemExit(f"expected one Shadow sprite block, found {s.count(old)}")
s = s.replace(old, new, 1)

if "export function spriteAssetsForDisplayName(" not in s:
    old_export = "function spriteAssetsForDisplayName(\n  pokemon,\n  displayName,\n  kind\n) {"
    new_export = "export function spriteAssetsForDisplayName(\n  pokemon,\n  displayName,\n  kind\n) {"
    if s.count(old_export) != 1:
        raise SystemExit("spriteAssetsForDisplayName marker missing")
    s = s.replace(old_export, new_export, 1)

# Shadow fallback is allowed only after exact meta lookup, so this maps to an
# exact same-form normal meta row rather than substituting an unrelated form.
s = s.replace(
    "/^(mega|primal|gigantamax|dynamax|armored)\\s+/",
    "/^(shadow|mega|primal|gigantamax|dynamax|armored)\\s+/",
    2,
)

old_priority = '''        const priorityBucket =
          missingRecord
            ? 0
            : spriteCorrection
              ? 1
              : spriteBackfill
                ? 2
                : raidRankRefresh
                  ? 3
                  : activeToday
                    ? 4
                    : 5;'''
new_priority = '''        const priorityBucket =
          missingRecord
            ? 0
            : spriteCorrection
              ? 1
              : spriteBackfill
                ? 2
                : activeToday
                  ? 3
                  : raidRankRefresh
                    ? 4
                    : 5;'''
if s.count(old_priority) != 1:
    raise SystemExit(f"expected one meta priority block, found {s.count(old_priority)}")
s = s.replace(old_priority, new_priority, 1)
p.write_text(s, encoding="utf-8")

# ---------------- public/manage.html ----------------
p = Path("public/manage.html")
s = p.read_text(encoding="utf-8")
if "/styles.css?v=29" not in s:
    raise SystemExit("expected styles.css?v=29 cache reference")
s = s.replace("/styles.css?v=29", "/styles.css?v=30", 1)

start = s.index("function spriteImg(\n")
end = s.index("\n\nfunction renderTodayBriefing()", start)
sprite_fn = r'''function spriteImg(
  url,
  name,
  className = "pokemon-sprite"
) {
  if (!url) {
    return "";
  }

  const isShadow =
    /^shadow\b/i.test(
      String(name || "").trim()
    );

  const classes =
    `${className}${isShadow ? " shadow-sprite" : ""}`;

  return `
    <img
      class="${esc(classes)}"
      src="${esc(url)}"
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onerror="this.hidden=true"
      title="${esc(name || "")}"
    >
  `;
}'''
s = s[:start] + sprite_fn + s[end:]

start = s.index("function raidRankingsHtml(value) {")
end = s.index("\nfunction renderRecommendationCard(", start)
rank_fn = r'''function raidRankingsHtml(value) {
  const profile =
    parseRaidRankProfile(value);

  const variants =
    (Array.isArray(profile?.variants)
      ? profile.variants
      : [])
      .map(variant => ({
        ...variant,
        rankings:
          Array.isArray(variant?.rankings)
            ? variant.rankings.slice(0, 2)
            : []
      }))
      .filter(
        variant =>
          variant.rankings.length
      );

  if (!variants.length) return "";

  const bestVariant =
    [...variants]
      .sort(
        (a, b) =>
          Math.min(...a.rankings.map(rank => Number(rank.rank) || 9999)) -
          Math.min(...b.rankings.map(rank => Number(rank.rank) || 9999))
      )[0];

  const rankText =
    variant =>
      variant.rankings
        .map(rank =>
          `#${formatNumber(rank.rank)} ${rank.type}`
        )
        .join(" · ");

  const moveText =
    variant =>
      variant.rankings
        .map(rank => {
          const moves =
            [
              rank.fast_move,
              rank.charged_move
            ]
              .filter(Boolean)
              .join(" + ");

          return moves
            ? `${rank.type}: ${moves}`
            : rank.type;
        })
        .join(" · ");

  return `
    <details class="raid-rank-details">
      <summary>
        <span class="raid-rank-summary-label">PvE attacker</span>
        <strong class="raid-rank-summary-value">
          ${esc(bestVariant.name)} · ${esc(rankText(bestVariant))}
        </strong>
        <span class="details-chevron" aria-hidden="true">⌄</span>
      </summary>

      <div class="raid-rank-list">
        ${variants
          .map(variant => `
            <div class="raid-rank-variant">
              <div>
                <strong>${esc(variant.name)}</strong>
                ${
                  variant.current
                    ? `<small class="raid-rank-current">Current raid form</small>`
                    : ""
                }
              </div>
              <span class="raid-rank-values">${esc(rankText(variant))}</span>
              <small class="raid-rank-moves">${esc(moveText(variant))}</small>
            </div>
          `)
          .join("")}

        <small class="raid-rank-method">
          Planner PvE · automatically recalculated from current Pokémon GO stats and moves
        </small>
      </div>
    </details>
  `;
}
'''
s = s[:start] + rank_fn + s[end:]

old_source = '''        ${
          rec.source_label
            ? `
              <span class="source-confidence-badge source-${esc(rec.source_kind || "calendar")}">
                ${rec.source_kind === "official" ? "✓ " : ""}${esc(rec.source_label)}
              </span>
            `
            : ""
        }
'''
new_source = '''        ${
          rec.source_label &&
          rec.source_kind === "official"
            ? `
              <span class="source-confidence-badge source-official">
                ✓ ${esc(rec.source_label)}
              </span>
            `
            : ""
        }
'''
if s.count(old_source) != 1:
    raise SystemExit(f"expected one recommendation source badge block, found {s.count(old_source)}")
s = s.replace(old_source, new_source, 1)

old_eyebrow = '<span class="section-eyebrow">${esc(rec.event_title || "ACTIVE RAID")}</span>'
new_eyebrow = '<span class="section-eyebrow" title="${esc(rec.source_label ? `Source: ${rec.source_label}` : "")}">${esc(rec.event_title || "ACTIVE RAID")}</span>'
if s.count(old_eyebrow) != 1:
    raise SystemExit(f"expected one recommendation event eyebrow, found {s.count(old_eyebrow)}")
s = s.replace(old_eyebrow, new_eyebrow, 1)
p.write_text(s, encoding="utf-8")

# ---------------- public/styles.css ----------------
p = Path("public/styles.css")
s = p.read_text(encoding="utf-8")
marker = "/* Raid rank compact details + Shadow sprite treatment */"
if marker not in s:
    s += r'''

/* Raid rank compact details + Shadow sprite treatment */
.shadow-sprite {
  filter:
    drop-shadow(0 0 3px rgba(112, 65, 180, 0.72))
    drop-shadow(0 0 8px rgba(80, 44, 145, 0.42));
}

.raid-rank-details {
  margin-top: 10px;
  border: 1px solid rgba(79, 120, 166, 0.18);
  border-radius: 12px;
  background: rgba(239, 247, 255, 0.58);
  overflow: hidden;
}

.raid-rank-details > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 7px 10px;
  cursor: pointer;
  list-style: none;
}

.raid-rank-details > summary::-webkit-details-marker {
  display: none;
}

.raid-rank-summary-label {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  opacity: 0.7;
}

.raid-rank-summary-value {
  min-width: 0;
  flex: 1 1 auto;
  font-size: 0.78rem;
  line-height: 1.25;
}

.raid-rank-details .details-chevron {
  flex: 0 0 auto;
  transition: transform 0.16s ease;
}

.raid-rank-details[open] .details-chevron {
  transform: rotate(180deg);
}

.raid-rank-list {
  display: grid;
  gap: 7px;
  padding: 8px 10px 10px;
  border-top: 1px solid rgba(79, 120, 166, 0.14);
}

.raid-rank-variant {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 2px 10px;
}

.raid-rank-variant > div {
  min-width: 0;
}

.raid-rank-variant strong,
.raid-rank-values {
  font-size: 0.77rem;
}

.raid-rank-values {
  font-weight: 800;
  white-space: nowrap;
}

.raid-rank-current,
.raid-rank-moves,
.raid-rank-method {
  font-size: 0.68rem;
  opacity: 0.72;
}

.raid-rank-current {
  display: block;
  margin-top: 1px;
}

.raid-rank-moves {
  grid-column: 1 / -1;
}

.raid-rank-method {
  padding-top: 3px;
  border-top: 1px dashed rgba(79, 120, 166, 0.15);
}

@media (max-width: 760px) {
  .raid-rank-details > summary {
    align-items: flex-start;
  }

  .raid-rank-summary-value {
    white-space: normal;
  }

  .raid-rank-variant {
    grid-template-columns: 1fr;
  }

  .raid-rank-values {
    white-space: normal;
  }
}
'''
p.write_text(s, encoding="utf-8")

# ---------------- tests ----------------
Path("tests").mkdir(exist_ok=True)
Path("tests/raid-rankings.test.mjs").write_text(r'''import assert from "node:assert/strict";
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
''', encoding="utf-8")

Path("tests/raid-rankings-live.mjs").write_text(r'''import assert from "node:assert/strict";
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
''', encoding="utf-8")

# ---------------- package scripts ----------------
p = Path("package.json")
package = json.loads(p.read_text(encoding="utf-8"))
scripts = package.setdefault("scripts", {})
scripts["test"] = "node tests/raid-rankings.test.mjs"
scripts["test:live"] = "node tests/raid-rankings-live.mjs"
p.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# ---------------- persistent regression workflow ----------------
workflow = '''name: Raid ranking regression

on:
  pull_request:
    paths:
      - "src/raid-rankings.js"
      - "src/index.js"
      - "public/manage.html"
      - "public/styles.css"
      - "tests/raid-rankings*.mjs"
      - "package.json"
  push:
    branches:
      - main
    paths:
      - "src/raid-rankings.js"
      - "src/index.js"
      - "public/manage.html"
      - "public/styles.css"
      - "tests/raid-rankings*.mjs"
      - "package.json"
  schedule:
    - cron: "17 19 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deterministic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node --check src/raid-rankings.js
      - run: node --check src/index.js
      - run: npm test
      - run: git diff --check

  live-contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm run test:live
'''
Path(".github/workflows/raid-ranking-regression.yml").write_text(workflow, encoding="utf-8")
