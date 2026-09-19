PRAGMA foreign_keys = ON;

-- Per-user fallback for Max Battle tier/cost when trusted automatic evidence
-- is unavailable. Verified automatic event/current-boss evidence always wins.
CREATE TABLE IF NOT EXISTS max_battle_cost_overrides (
  user_id TEXT NOT NULL,
  opportunity_key TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  battle_variant TEXT NOT NULL CHECK (battle_variant IN ('dynamax', 'gigantamax')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  max_battle_tier INTEGER NOT NULL CHECK (max_battle_tier BETWEEN 1 AND 6),
  max_particle_cost INTEGER NOT NULL CHECK (max_particle_cost > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, opportunity_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_max_battle_cost_overrides_dates
ON max_battle_cost_overrides(user_id, start_date, end_date);
