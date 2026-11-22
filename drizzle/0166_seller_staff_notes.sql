CREATE TABLE seller_staff_notes (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX seller_staff_notes_timeline ON seller_staff_notes (seller_id, created_at, id);
