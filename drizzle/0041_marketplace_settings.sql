CREATE TABLE IF NOT EXISTS marketplace_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO marketplace_settings (key, value, updated_by, updated_at)
VALUES ('seller_commission_bps', '900', NULL, 0);
