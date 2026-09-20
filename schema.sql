PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  manage_hash TEXT NOT NULL UNIQUE,
  feed_hash TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Singapore',
  included_sources TEXT NOT NULL,
  pve_weight REAL NOT NULL DEFAULT 1.0,
  pvp_weight REAL NOT NULL DEFAULT 0.0,
  collector_weight REAL NOT NULL DEFAULT 0.4,
  remote_raid_budget INTEGER,
  remote_raid_min_score REAL NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'mega_energy',
  battle_kind TEXT CHECK (battle_kind IN ('raid', 'dynamax', 'gigantamax')),
  target_value REAL,
  current_value REAL NOT NULL DEFAULT 0,
  expected_progress_per_raid REAL,
  priority TEXT NOT NULL DEFAULT 'medium',
  completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, pokemon_name, target_type),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_uid TEXT,
  summary TEXT NOT NULL,
  description TEXT,
  dtstart_line TEXT NOT NULL,
  dtend_line TEXT,
  other_lines TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  source_url TEXT,
  content_hash TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_source
ON events(source_type);

CREATE INDEX IF NOT EXISTS idx_events_dates
ON events(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_events_status
ON events(status);

CREATE TABLE IF NOT EXISTS pokemon_meta (
  pokemon_name TEXT PRIMARY KEY,
  pve_score REAL,
  pvp_score REAL,
  rarity_score REAL,
  mega_score REAL,
  overall_score REAL,
  verdict TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta_sources (
  id TEXT PRIMARY KEY,
  pokemon_name TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(pokemon_name) REFERENCES pokemon_meta(pokemon_name) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meta_sources_pokemon
ON meta_sources(pokemon_name);

CREATE TABLE IF NOT EXISTS sync_source_health (
  source_key TEXT PRIMARY KEY,
  source_group TEXT NOT NULL CHECK (
    source_group IN ('event', 'official', 'meta')
  ),
  source_label TEXT NOT NULL,
  source_url TEXT,
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error TEXT,
  item_count INTEGER CHECK (
    item_count IS NULL OR item_count >= 0
  ),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_source_health_group
ON sync_source_health(source_group, source_key);

CREATE TABLE IF NOT EXISTS remote_raid_usage (
  user_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  raids_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, local_date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS remote_raid_limit_overrides (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  remote_raid_limit INTEGER NOT NULL,
  source_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  is_unlimited INTEGER NOT NULL DEFAULT 0,
  detected_automatically INTEGER NOT NULL DEFAULT 0,
  source_excerpt TEXT,
  detected_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_remote_raid_limit_dates
ON remote_raid_limit_overrides(start_date, end_date, active);

CREATE TABLE IF NOT EXISTS event_suppression_rules (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  suppressed_source_types TEXT NOT NULL,
  note TEXT,
  source_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  detected_automatically INTEGER NOT NULL DEFAULT 1,
  source_excerpt TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_suppression_dates
ON event_suppression_rules(start_date, end_date, active);

CREATE TABLE IF NOT EXISTS remote_raid_daily_budget_overrides (
  user_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  budget_override INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, local_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_remote_raid_daily_budget_overrides_date
ON remote_raid_daily_budget_overrides(local_date);

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

PRAGMA foreign_keys = ON;

-- Existing installations already have raid_log. Keep its rows in place.
-- Also supply its historical shape for new databases (missing in the old schema).
CREATE TABLE IF NOT EXISTS raid_log (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, pokemon_name TEXT NOT NULL,
  raid_type TEXT NOT NULL, raid_count INTEGER NOT NULL,
  progress_gained REAL NOT NULL DEFAULT 0, target_id TEXT,
  target_before_value REAL, target_after_value REAL,
  local_date TEXT NOT NULL, created_at TEXT NOT NULL, undone_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS battle_log (
  id TEXT PRIMARY KEY,
  legacy_log_id TEXT UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pokemon_name TEXT NOT NULL,
  battle_system TEXT NOT NULL CHECK (battle_system IN ('raid', 'max')),
  battle_variant TEXT CHECK (battle_variant IN ('dynamax', 'gigantamax')),
  participation TEXT NOT NULL CHECK (participation IN ('local', 'remote')),
  battle_count INTEGER NOT NULL CHECK (battle_count BETWEEN 1 AND 99),
  wins INTEGER NOT NULL CHECK (wins BETWEEN 0 AND battle_count),
  max_particle_cost INTEGER CHECK (max_particle_cost BETWEEN 0 AND 100000),
  max_particles_spent INTEGER NOT NULL DEFAULT 0 CHECK (max_particles_spent >= 0),
  remote_passes_used INTEGER NOT NULL DEFAULT 0 CHECK (remote_passes_used BETWEEN 0 AND battle_count),
  progress_gained REAL NOT NULL DEFAULT 0 CHECK (progress_gained BETWEEN 0 AND 1000000),
  target_id TEXT,
  target_before_value REAL, target_after_value REAL,
  local_date TEXT NOT NULL, created_at TEXT NOT NULL, undone_at TEXT,
  CHECK ((battle_system = 'raid' AND battle_variant IS NULL AND max_particle_cost IS NULL AND max_particles_spent = 0)
    OR (battle_system = 'max' AND battle_variant IS NOT NULL
      AND (wins = 0 OR max_particle_cost IS NOT NULL)
      AND max_particles_spent = wins * COALESCE(max_particle_cost, 0))),
  CHECK (participation = 'remote' OR remote_passes_used = 0)
);
CREATE INDEX IF NOT EXISTS idx_battle_log_user_date ON battle_log(user_id, local_date, created_at);

-- A single INSERT and its trigger are one SQLite/D1 transaction. Never read,
-- calculate and overwrite resource totals in separate requests.
CREATE TRIGGER IF NOT EXISTS battle_log_apply
AFTER INSERT ON battle_log
WHEN NEW.legacy_log_id IS NULL
BEGIN
  SELECT CASE WHEN NEW.target_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM targets WHERE id = NEW.target_id AND user_id = NEW.user_id
  ) THEN RAISE(ABORT, 'battle_target_missing') END;
  SELECT CASE WHEN NEW.max_particles_spent > COALESCE((
    SELECT max_particles_held FROM battle_resource_state WHERE user_id = NEW.user_id
  ), 0) THEN RAISE(ABORT, 'battle_insufficient_particles') END;

  UPDATE battle_log SET
    target_before_value = (SELECT current_value FROM targets WHERE id = NEW.target_id AND user_id = NEW.user_id),
    target_after_value = (SELECT current_value + NEW.progress_gained FROM targets WHERE id = NEW.target_id AND user_id = NEW.user_id)
  WHERE id = NEW.id;
  UPDATE targets SET current_value = current_value + NEW.progress_gained, updated_at = NEW.created_at
  WHERE id = NEW.target_id AND user_id = NEW.user_id;
  UPDATE battle_resource_state SET max_particles_held = max_particles_held - NEW.max_particles_spent, updated_at = NEW.created_at
  WHERE user_id = NEW.user_id AND NEW.max_particles_spent > 0;
  INSERT INTO remote_raid_usage(user_id, local_date, raids_used, updated_at)
    SELECT NEW.user_id, NEW.local_date, NEW.remote_passes_used, NEW.created_at
    WHERE NEW.battle_system = 'raid' AND NEW.remote_passes_used > 0
    ON CONFLICT(user_id, local_date) DO UPDATE SET
      raids_used = raids_used + excluded.raids_used, updated_at = excluded.updated_at;
  INSERT INTO battle_resource_daily(user_id, local_date, remote_max_passes_used, updated_at)
    SELECT NEW.user_id, NEW.local_date, NEW.remote_passes_used, NEW.created_at
    WHERE NEW.battle_system = 'max' AND NEW.remote_passes_used > 0
    ON CONFLICT(user_id, local_date) DO UPDATE SET
      remote_max_passes_used = remote_max_passes_used + excluded.remote_max_passes_used, updated_at = excluded.updated_at;
END;

-- Refuse inconsistent undo as a whole, rather than silently clamp a counter
-- or skip a deleted target. Later independent logs/collections stay intact.
CREATE TRIGGER IF NOT EXISTS battle_log_undo
AFTER UPDATE OF undone_at ON battle_log
WHEN OLD.undone_at IS NULL AND NEW.undone_at IS NOT NULL
BEGIN
  SELECT CASE WHEN OLD.target_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM targets WHERE id = OLD.target_id AND user_id = OLD.user_id
      AND current_value >= OLD.progress_gained
  ) THEN RAISE(ABORT, 'battle_undo_target_conflict') END;
  SELECT CASE WHEN OLD.battle_system = 'raid' AND OLD.remote_passes_used > COALESCE((
    SELECT raids_used FROM remote_raid_usage WHERE user_id = OLD.user_id AND local_date = OLD.local_date
  ), 0) THEN RAISE(ABORT, 'battle_undo_remote_conflict') END;
  SELECT CASE WHEN OLD.battle_system = 'max' AND OLD.remote_passes_used > COALESCE((
    SELECT remote_max_passes_used FROM battle_resource_daily WHERE user_id = OLD.user_id AND local_date = OLD.local_date
  ), 0) THEN RAISE(ABORT, 'battle_undo_remote_conflict') END;

  UPDATE targets SET current_value = CASE WHEN current_value = OLD.target_after_value
    THEN OLD.target_before_value ELSE current_value - OLD.progress_gained END, updated_at = NEW.undone_at
  WHERE id = OLD.target_id AND user_id = OLD.user_id;
  INSERT INTO battle_resource_state(user_id, max_particles_held, updated_at)
    SELECT OLD.user_id, OLD.max_particles_spent, NEW.undone_at WHERE OLD.max_particles_spent > 0
    ON CONFLICT(user_id) DO UPDATE SET
      max_particles_held = max_particles_held + excluded.max_particles_held, updated_at = excluded.updated_at;
  UPDATE remote_raid_usage SET raids_used = raids_used - OLD.remote_passes_used, updated_at = NEW.undone_at
  WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND OLD.battle_system = 'raid' AND OLD.remote_passes_used > 0;
  UPDATE battle_resource_daily SET remote_max_passes_used = remote_max_passes_used - OLD.remote_passes_used, updated_at = NEW.undone_at
  WHERE user_id = OLD.user_id AND local_date = OLD.local_date AND OLD.battle_system = 'max' AND OLD.remote_passes_used > 0;
END;

-- Legacy Raid records remain untouched until Undo imports that one record.
-- No trigger is attached to raid_log: older Workers must remain safe while
-- the additive migration and new Worker are being rolled out.
CREATE VIEW IF NOT EXISTS unified_battle_log AS
SELECT id, user_id, pokemon_name, battle_system, battle_variant, participation,
  battle_count, wins, max_particle_cost, max_particles_spent, remote_passes_used,
  progress_gained, target_id, target_before_value, target_after_value,
  local_date, created_at, undone_at, 'battle' AS log_source
FROM battle_log
UNION ALL
SELECT id, user_id, pokemon_name, 'raid', NULL, raid_type, raid_count, raid_count,
  NULL, 0, CASE WHEN raid_type = 'remote' THEN raid_count ELSE 0 END,
  progress_gained, target_id, target_before_value, target_after_value,
  local_date, created_at, undone_at, 'legacy'
FROM raid_log
WHERE NOT EXISTS (SELECT 1 FROM battle_log WHERE legacy_log_id = raid_log.id);
