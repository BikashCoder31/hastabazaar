CREATE TABLE IF NOT EXISTS homepage_product_controls (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK(is_hidden IN (0, 1)),
  reason TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  last_request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_homepage_product_controls_hidden_updated
  ON homepage_product_controls(is_hidden, updated_at);
