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
