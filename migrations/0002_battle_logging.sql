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
