-- Preserve answer ownership after a saved address is removed. No address FK:
-- the original address ID must remain resolvable after that row is deleted.
CREATE TABLE IF NOT EXISTS address_answer_owner_tombstones (
  address_id TEXT PRIMARY KEY CHECK(length(address_id) BETWEEN 1 AND 191),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  deletion_request_id TEXT NOT NULL CHECK(length(deletion_request_id) BETWEEN 1 AND 191),
  deleted_at INTEGER NOT NULL CHECK(deleted_at >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_address_answer_owner_tombstones_user
  ON address_answer_owner_tombstones(user_id,deleted_at,address_id);
