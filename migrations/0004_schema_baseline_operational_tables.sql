PRAGMA foreign_keys = ON;

-- BL-001: production D1 definitions verified on 18 September 2026.
-- This migration repairs existing installations that are missing these
-- operational tables or their explicit indexes. It is safe to re-run.
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
