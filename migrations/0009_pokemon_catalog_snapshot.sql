-- BL-060: durable last-known-good Pokémon catalog snapshot.
--
-- Additive and idempotent. Stores one validated compact catalog JSON snapshot
-- so first-time/new-device users can continue using Hundo/Battle Intel when
-- the upstream Pokémon GO API is temporarily unavailable.
CREATE TABLE IF NOT EXISTS pokemon_catalog_snapshot (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  entry_count INTEGER NOT NULL CHECK (entry_count > 0),
  catalog_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
