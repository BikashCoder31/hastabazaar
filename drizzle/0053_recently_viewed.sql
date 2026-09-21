CREATE TABLE IF NOT EXISTS recently_viewed_products (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, product_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_time ON recently_viewed_products(user_id, last_viewed_at DESC);
