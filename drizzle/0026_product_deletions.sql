CREATE TABLE IF NOT EXISTS product_deletions (
 product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id),
 deleted_by TEXT NOT NULL REFERENCES users(id),
 deleted_at INTEGER NOT NULL,
 request_id TEXT NOT NULL
);
