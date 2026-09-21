CREATE TABLE IF NOT EXISTS feed_link_credentials (
  user_id TEXT PRIMARY KEY,
  signed_generation INTEGER NOT NULL DEFAULT 0
    CHECK (signed_generation >= 0),
  signed_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (signed_enabled IN (0, 1)),
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
