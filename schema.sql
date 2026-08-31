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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'mega_energy',
  target_value REAL,
  current_value REAL NOT NULL DEFAULT 0,
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
