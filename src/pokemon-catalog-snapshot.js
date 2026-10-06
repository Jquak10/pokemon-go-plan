const SNAPSHOT_ID =
  "pokemon-go-api-pokedex";
const MAX_SNAPSHOT_BYTES =
  2 * 1024 * 1024;

function validString(
  value
) {
  return (
    typeof value ===
      "string" &&
    value.trim().length >
      0
  );
}

export function usablePokemonCatalogEntries(
  entries
) {
  return (
    Array.isArray(
      entries
    ) &&
    entries.length >
      0 &&
    entries.every(
      entry =>
        entry &&
        validString(
          entry.key
        ) &&
        Number.isInteger(
          Number(
            entry.dex_nr
          )
        ) &&
        Number(
          entry.dex_nr
        ) >
          0 &&
        validString(
          entry.name
        ) &&
        validString(
          entry.kind
        ) &&
        Number.isFinite(
          Number(
            entry.attack
          )
        ) &&
        Number.isFinite(
          Number(
            entry.defense
          )
        ) &&
        Number.isFinite(
          Number(
            entry.stamina
          )
        ) &&
        Array.isArray(
          entry.types
        ) &&
        entry.types.length >
          0 &&
        entry.types.every(
          validString
        )
    )
  );
}

function jsonByteLength(
  value
) {
  return new TextEncoder()
    .encode(
      value
    )
    .byteLength;
}

export function serializePokemonCatalogSnapshot(
  {
    sourceUrl,
    generatedAt,
    entries
  }
) {
  if (
    !validString(
      sourceUrl
    ) ||
    !validString(
      generatedAt
    ) ||
    !usablePokemonCatalogEntries(
      entries
    )
  ) {
    throw new Error(
      "Pokémon catalog snapshot is not structurally usable."
    );
  }

  const catalogJson =
    JSON.stringify(
      entries
    );

  if (
    jsonByteLength(
      catalogJson
    ) >
      MAX_SNAPSHOT_BYTES
  ) {
    throw new Error(
      "Pokémon catalog snapshot exceeds the server-side size limit."
    );
  }

  return {
    id:
      SNAPSHOT_ID,
    source_url:
      sourceUrl,
    generated_at:
      generatedAt,
    entry_count:
      entries.length,
    catalog_json:
      catalogJson,
    updated_at:
      generatedAt
  };
}

export function normalizePokemonCatalogSnapshotRow(
  row
) {
  if (!row) {
    return null;
  }

  let entries;

  try {
    entries =
      JSON.parse(
        String(
          row.catalog_json ||
          ""
        )
      );
  } catch {
    return null;
  }

  if (
    !usablePokemonCatalogEntries(
      entries
    ) ||
    Number(
      row.entry_count
    ) !==
      entries.length ||
    !validString(
      row.source_url
    ) ||
    !validString(
      row.generated_at
    )
  ) {
    return null;
  }

  return {
    source:
      String(
        row.source_url
      ),
    generated_at:
      String(
        row.generated_at
      ),
    entry_count:
      entries.length,
    entries
  };
}

export async function writePokemonCatalogSnapshot(
  db,
  snapshot
) {
  const row =
    serializePokemonCatalogSnapshot(
      snapshot
    );

  await db.prepare(`
    INSERT INTO pokemon_catalog_snapshot (
      id,
      source_url,
      generated_at,
      entry_count,
      catalog_json,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_url =
        excluded.source_url,
      generated_at =
        excluded.generated_at,
      entry_count =
        excluded.entry_count,
      catalog_json =
        excluded.catalog_json,
      updated_at =
        excluded.updated_at
  `).bind(
    row.id,
    row.source_url,
    row.generated_at,
    row.entry_count,
    row.catalog_json,
    row.updated_at
  ).run();

  return {
    generated_at:
      row.generated_at,
    entry_count:
      row.entry_count
  };
}

export async function readPokemonCatalogSnapshot(
  db
) {
  const row =
    await db.prepare(`
      SELECT
        source_url,
        generated_at,
        entry_count,
        catalog_json
      FROM pokemon_catalog_snapshot
      WHERE id = ?
      LIMIT 1
    `).bind(
      SNAPSHOT_ID
    ).first();

  return normalizePokemonCatalogSnapshotRow(
    row
  );
}

export const POKEMON_CATALOG_SNAPSHOT_ID =
  SNAPSHOT_ID;
export const POKEMON_CATALOG_SNAPSHOT_MAX_BYTES =
  MAX_SNAPSHOT_BYTES;
