PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS battle_resource_state (
  user_id TEXT PRIMARY KEY,
  max_particles_held INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS battle_resource_daily (
  user_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  max_particles_collected INTEGER NOT NULL DEFAULT 0,
  remote_max_passes_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, local_date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_battle_resource_daily_date
ON battle_resource_daily(local_date);
