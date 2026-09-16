from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Worker integration
# ---------------------------------------------------------------------------
p = Path("src/index.js")
s = p.read_text(encoding="utf-8")

s = replace_once(
    s,
    'const SOURCE_BASE =\n',
    'import {\n'
    '  RAID_RANK_METHOD_VERSION,\n'
    '  buildRaidAttackerRankCatalog,\n'
    '  raidRankProfileForName\n'
    '} from "./raid-rankings.js";\n\n'
    'const SOURCE_BASE =\n',
    "ranking imports",
)

s = replace_once(
    s,
    'const AUTO_META_METHOD_VERSION = "auto-meta-v3-exact-sprites";\n'
    'const MAX_META_POKEMON_PER_SYNC = 20;\n',
    'const AUTO_META_METHOD_VERSION = "auto-meta-v4-raid-ranks";\n'
    'const RAID_RANK_SOURCE_NAME = "Raid attacker rankings";\n'
    'const MAX_META_POKEMON_PER_SYNC = 20;\n'
    'const MAX_RAID_RANK_BACKFILLS_PER_SYNC = 80;\n',
    "meta constants",
)

s = replace_once(
    s,
    'function eventKindForMatch(summary, pokemonName) {\n'
    '  const s = normalizeName(summary);\n'
    '  const n = normalizeName(pokemonName);\n'
    '  if (s.includes(`mega ${n}`)) return "mega";\n',
    'function eventKindForMatch(summary, pokemonName) {\n'
    '  const s = normalizeName(summary);\n'
    '  const n = normalizeName(pokemonName);\n'
    '  if (s.includes(`shadow ${n}`)) return "shadow";\n'
    '  if (s.includes(`mega ${n}`)) return "mega";\n',
    "shadow event kind",
)

old_display = '''function displayNameForMatch(
  pokemonName,
  kind,
  summary = ""
) {
  const normalizedSummary =
    normalizeName(summary);

  const normalizedName =
    normalizeName(pokemonName);

  if (
    normalizedSummary.includes(
      `armored ${normalizedName}`
    )
  ) {
    return `Armored ${pokemonName}`;
  }
'''
new_display = '''function displayNameForMatch(
  pokemonName,
  kind,
  summary = "",
  pokemon = null
) {
  const normalizedSummary =
    normalizeName(summary);

  const normalizedName =
    normalizeName(pokemonName);

  const exactRegionForm =
    Object.values(
      pokemon?.regionForms || {}
    )
      .map(form =>
        String(
          form?.names?.English ||
          form?.name?.English ||
          ""
        ).trim()
      )
      .filter(Boolean)
      .sort((a, b) =>
        normalizeName(b).length -
        normalizeName(a).length
      )
      .find(formName =>
        normalizedSummary.includes(
          normalizeName(formName)
        )
      ) || null;

  if (kind === "shadow") {
    return `Shadow ${exactRegionForm || pokemonName}`;
  }

  if (
    normalizedSummary.includes(
      `armored ${normalizedName}`
    )
  ) {
    return `Armored ${pokemonName}`;
  }
'''
s = replace_once(s, old_display, new_display, "display name signature")

s = replace_once(
    s,
    '''  if (kind === "dynamax") {
    return `Dynamax ${pokemonName}`;
  }

  return pokemonName;
}
''',
    '''  if (kind === "dynamax") {
    return `Dynamax ${pokemonName}`;
  }

  if (exactRegionForm) {
    return exactRegionForm;
  }

  return pokemonName;
}
''',
    "region form display name",
)

s = replace_once(
    s,
    '''  const wantsArmored =
    desiredTokens.includes("armored");

  const wantsX =
''',
    '''  const wantsArmored =
    desiredTokens.includes("armored");

  const wantsShadow =
    desiredTokens.includes("shadow");

  if (wantsShadow) {
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

  const wantsX =
''',
    "shadow sprite safety",
)

s = replace_once(
    s,
    '''  const rawPowers = pokedex
    .map(rawPvePower)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const pvpMap = new Map();
''',
    '''  const rawPowers = pokedex
    .map(rawPvePower)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const raidRankCatalog =
    buildRaidAttackerRankCatalog(
      pokedex
    );

  const pvpMap = new Map();
''',
    "ranking catalog build",
)

s = replace_once(
    s,
    '''      const displayName =
        displayNameForMatch(
          match.name,
          match.kind,
          event.summary
        );
      const key = normalizeName(displayName);
      const pve = percentileScore(rawPowers, rawPvePower(match.pokemon));
      const pvp =
        match.kind === "mega" || match.kind === "primal"
          ? null
          : (pvpMap.get(normalizeName(match.name)) ?? null);
''',
    '''      const displayName =
        displayNameForMatch(
          match.name,
          match.kind,
          event.summary,
          match.pokemon
        );
      const key = normalizeName(displayName);
      const pvePower =
        rawPvePower(match.pokemon) *
        (match.kind === "shadow" ? 1.2 : 1.0);
      const pve = percentileScore(rawPowers, pvePower);
      const pvp =
        match.kind === "mega" ||
        match.kind === "primal" ||
        match.kind === "shadow"
          ? null
          : (pvpMap.get(normalizeName(match.name)) ?? null);
''',
    "form-aware candidate setup",
)

s = replace_once(
    s,
    '''        event,
        pokemon: match.pokemon,
        ...spriteAssets
      };
''',
    '''        event,
        pokemon: match.pokemon,
        raidRankProfile:
          raidRankProfileForName(
            displayName,
            raidRankCatalog
          ),
        ...spriteAssets
      };
''',
    "candidate ranking profile",
)

s = replace_once(
    s,
    '''      SELECT
        pokemon_name,
        sprite_url
      FROM pokemon_meta
    `).all();
''',
    '''      SELECT
        pm.pokemon_name,
        pm.sprite_url,
        (
          SELECT MAX(ms.updated_at)
          FROM meta_sources ms
          WHERE ms.pokemon_name = pm.pokemon_name
            AND ms.source_name = ?
        ) AS raid_rank_updated_at
      FROM pokemon_meta pm
    `).bind(
      RAID_RANK_SOURCE_NAME
    ).all();
''',
    "existing ranking timestamps",
)

s = replace_once(
    s,
    '''  const today =
    todayUtc();

  const rankedCandidates =
''',
    '''  const today =
    todayUtc();

  const raidRankStaleBefore =
    new Date(
      Date.now() -
      7 * 86400000
    ).toISOString();

  const rankedCandidates =
''',
    "ranking stale cutoff",
)

s = replace_once(
    s,
    '''        const activeToday =
          startDate <= today &&
          endDate >= today;

        const priorityBucket =
          missingRecord
            ? 0
            : spriteCorrection
              ? 1
              : spriteBackfill
                ? 2
                : activeToday
                  ? 3
                  : 4;

        return {
          candidate,
          missingRecord,
          spriteBackfill,
          spriteCorrection,
          activeToday,
          priorityBucket,
          startDate
        };
''',
    '''        const activeToday =
          startDate <= today &&
          endDate >= today;

        const raidRankRefresh =
          !existing?.raid_rank_updated_at ||
          existing.raid_rank_updated_at <
            raidRankStaleBefore;

        const priorityBucket =
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
                    : 5;

        return {
          candidate,
          missingRecord,
          spriteBackfill,
          spriteCorrection,
          raidRankRefresh,
          activeToday,
          priorityBucket,
          startDate
        };
''',
    "ranking refresh priority",
)

rank_source_insert = '''
    if (candidate.raidRankProfile) {
      const rankSourceId =
        await sha256Hex(
          `${normalizeName(candidate.displayName)}|raid-attacker-rankings`
        );

      statements.push(
        env.DB.prepare(`
          INSERT INTO meta_sources (
            id, pokemon_name, source_name, source_url, note, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            source_url = excluded.source_url,
            note = excluded.note,
            updated_at = excluded.updated_at
        `).bind(
          rankSourceId,
          candidate.displayName,
          RAID_RANK_SOURCE_NAME,
          POGO_API_POKEDEX,
          JSON.stringify(
            candidate.raidRankProfile
          ),
          timestamp
        )
      );
    }
'''
s = replace_once(
    s,
    '''    statements.push(
      env.DB.prepare(`
        INSERT INTO meta_sources (
          id, pokemon_name, source_name, source_url, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_url = excluded.source_url,
          note = excluded.note,
          updated_at = excluded.updated_at
      `).bind(
        sourceId,
        candidate.displayName,
        "Automatic meta sources",
        POGO_API_POKEDEX,
        sourceNote,
        timestamp
      )
    );
  }

  if (statements.length) {
    await env.DB.batch(statements);
  }
''',
    '''    statements.push(
      env.DB.prepare(`
        INSERT INTO meta_sources (
          id, pokemon_name, source_name, source_url, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_url = excluded.source_url,
          note = excluded.note,
          updated_at = excluded.updated_at
      `).bind(
        sourceId,
        candidate.displayName,
        "Automatic meta sources",
        POGO_API_POKEDEX,
        sourceNote,
        timestamp
      )
    );
''' + rank_source_insert + '''  }

  const raidRankBackfillRows =
    (existingMetaRows || [])
      .filter(row =>
        !selectedKeys.has(
          normalizeName(
            row.pokemon_name
          )
        ) &&
        (
          !row.raid_rank_updated_at ||
          row.raid_rank_updated_at <
            raidRankStaleBefore
        )
      )
      .slice(
        0,
        MAX_RAID_RANK_BACKFILLS_PER_SYNC
      );

  let raidRankBackfills = 0;

  for (const row of raidRankBackfillRows) {
    const profile =
      raidRankProfileForName(
        row.pokemon_name,
        raidRankCatalog
      );

    if (!profile) continue;

    const rankSourceId =
      await sha256Hex(
        `${normalizeName(row.pokemon_name)}|raid-attacker-rankings`
      );

    statements.push(
      env.DB.prepare(`
        INSERT INTO meta_sources (
          id, pokemon_name, source_name, source_url, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_url = excluded.source_url,
          note = excluded.note,
          updated_at = excluded.updated_at
      `).bind(
        rankSourceId,
        row.pokemon_name,
        RAID_RANK_SOURCE_NAME,
        POGO_API_POKEDEX,
        JSON.stringify(profile),
        timestamp
      )
    );

    raidRankBackfills += 1;
  }

  for (
    let offset = 0;
    offset < statements.length;
    offset += 50
  ) {
    await env.DB.batch(
      statements.slice(
        offset,
        offset + 50
      )
    );
  }
''',
    "ranking source persistence",
)

s = replace_once(
    s,
    '''    method:
      AUTO_META_METHOD_VERSION,
    write_statements:
''',
    '''    method:
      AUTO_META_METHOD_VERSION,
    raid_rank_method:
      RAID_RANK_METHOD_VERSION,
    raid_rank_backfills:
      raidRankBackfills,
    write_statements:
''',
    "sync ranking stats",
)

old_get_meta = '''async function getMeta(env) {
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM pokemon_meta
    ORDER BY pokemon_name
  `).all();
  return results;
}
'''
new_get_meta = '''async function getMeta(env) {
  const { results } = await env.DB.prepare(`
    SELECT
      pm.*,
      (
        SELECT ms.note
        FROM meta_sources ms
        WHERE ms.pokemon_name = pm.pokemon_name
          AND ms.source_name = ?
        ORDER BY ms.updated_at DESC
        LIMIT 1
      ) AS raid_rankings_json
    FROM pokemon_meta pm
    ORDER BY pm.pokemon_name
  `).bind(
    RAID_RANK_SOURCE_NAME
  ).all();
  return results;
}
'''
s = replace_once(s, old_get_meta, new_get_meta, "getMeta ranking join")

sprite_helper_end = '''  return fallback?.sprite_url || null;
}

function automaticVerdict'''
rank_helper = '''  return fallback?.sprite_url || null;
}

function raidRankingsJsonForPokemonName(
  name,
  metas
) {
  const normalized =
    normalizeName(name);

  const exact =
    metas.find(
      meta =>
        normalizeName(
          meta.pokemon_name
        ) === normalized &&
        meta.raid_rankings_json
    );

  if (exact?.raid_rankings_json) {
    return exact.raid_rankings_json;
  }

  const familyKey =
    value =>
      normalizeName(value)
        .replace(
          /^(shadow|mega|primal|gigantamax|dynamax|armored)\\s+/,
          ""
        )
        .replace(/\\s+[xy]$/, "")
        .replace(
          /\\s+(crowned sword|crowned shield|origin forme|origin form|therian forme|incarnate forme)$/,
          ""
        );

  const base =
    familyKey(name);

  const fallback =
    metas.find(
      meta =>
        familyKey(
          meta.pokemon_name
        ) === base &&
        meta.raid_rankings_json
    );

  return fallback?.raid_rankings_json || null;
}

function automaticVerdict'''
s = replace_once(s, sprite_helper_end, rank_helper, "ranking lookup helper")

s = replace_once(
    s,
    '''          sprite_url:
            spriteUrlForPokemonName(
              target.pokemon_name,
              metas
            )
        })
''',
    '''          sprite_url:
            spriteUrlForPokemonName(
              target.pokemon_name,
              metas
            ),
          raid_rankings_json:
            raidRankingsJsonForPokemonName(
              target.pokemon_name,
              metas
            )
        })
''',
    "target ranking payload",
)

p.write_text(s, encoding="utf-8")


# ---------------------------------------------------------------------------
# Ranking engine small release-safety refinement
# ---------------------------------------------------------------------------
p = Path("src/raid-rankings.js")
s = p.read_text(encoding="utf-8")
s = replace_once(
    s,
    '''  if (form.kind === "mega" || form.kind === "primal") {
    return form.energyCost != null || Boolean(form.pokemon?.assets?.image);
  }
''',
    '''  if (form.kind === "mega" || form.kind === "primal") {
    // A real Mega/Primal energy cost is a stronger release signal than an
    // asset alone, which can arrive before the form is actually obtainable.
    return form.energyCost != null;
  }
''',
    "mega release gate",
)
p.write_text(s, encoding="utf-8")


# ---------------------------------------------------------------------------
# Dashboard UI
# ---------------------------------------------------------------------------
p = Path("public/manage.html")
s = p.read_text(encoding="utf-8")

helper_marker = '''function renderRecommendationCard(
  rec,
  allocation
) {
'''
helper_code = '''function parseRaidRankProfile(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function raidRankingsHtml(value) {
  const profile =
    parseRaidRankProfile(value);

  const variants =
    Array.isArray(profile?.variants)
      ? profile.variants
      : [];

  if (!variants.length) return "";

  const chips =
    variants
      .map(variant => {
        const rankings =
          Array.isArray(variant?.rankings)
            ? variant.rankings.slice(0, 2)
            : [];

        if (!rankings.length) return "";

        const rankText =
          rankings
            .map(rank =>
              `#${formatNumber(rank.rank)} ${rank.type}`
            )
            .join(" · ");

        const moveText =
          rankings
            .map(rank => {
              const moves =
                [
                  rank.fast_move,
                  rank.charged_move
                ]
                  .filter(Boolean)
                  .join(" + ");

              return moves
                ? `${rank.type} #${rank.rank}: ${moves}`
                : `${rank.type} #${rank.rank}`;
            })
            .join(" | ");

        return `
          <span
            class="status-badge ${variant.current ? "badge-blue" : ""}"
            title="${esc(moveText)}"
          >
            ${esc(variant.name)} · ${esc(rankText)}
          </span>
        `;
      })
      .filter(Boolean)
      .join("");

  if (!chips) return "";

  return `
    <div class="recommendation-card-meta" aria-label="Raid attacker rankings">
      <span class="source-confidence-badge source-calendar">
        Raid ranks · Planner PvE
      </span>
      ${chips}
    </div>
  `;
}

function renderRecommendationCard(
  rec,
  allocation
) {
'''
s = replace_once(s, helper_marker, helper_code, "ranking UI helper")

s = replace_once(
    s,
    '''      </div>

      ${raidIntelHtml(rec)}

      <div class="recommendation-footer-row">
''',
    '''      </div>

      ${raidRankingsHtml(rec.meta?.raid_rankings_json)}

      ${raidIntelHtml(rec)}

      <div class="recommendation-footer-row">
''',
    "recommendation ranking UI",
)

s = replace_once(
    s,
    '''      <div class="target-actions compact-target-actions">
        ${targetSelectionMode ? `
''',
    '''      ${raidRankingsHtml(target.raid_rankings_json)}

      <div class="target-actions compact-target-actions">
        ${targetSelectionMode ? `
''',
    "target ranking UI",
)

p.write_text(s, encoding="utf-8")


# Remove the one-shot implementation machinery from the resulting commit.
Path(".github/scripts/apply_raid_rankings_feature.py").unlink(missing_ok=True)
Path(".github/workflows/apply-raid-rankings-feature.yml").unlink(missing_ok=True)
