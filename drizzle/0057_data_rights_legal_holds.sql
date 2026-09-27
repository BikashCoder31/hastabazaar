CREATE TABLE IF NOT EXISTS data_rights_legal_holds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 8 AND 2000),
  placed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  placed_at INTEGER NOT NULL,
  released_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  released_at INTEGER,
  CHECK((released_by IS NULL AND released_at IS NULL) OR
    (released_by IS NOT NULL AND released_at IS NOT NULL AND released_at >= placed_at))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_data_rights_legal_holds_user_active
  ON data_rights_legal_holds(user_id,released_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_rights_legal_holds_one_active
  ON data_rights_legal_holds(user_id) WHERE released_at IS NULL;
