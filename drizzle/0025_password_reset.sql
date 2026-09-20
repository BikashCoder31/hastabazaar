CREATE TABLE IF NOT EXISTS password_reset_challenges (
 token_hash TEXT PRIMARY KEY NOT NULL,
 code_hash TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 attempts INTEGER NOT NULL DEFAULT 0,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 consumed_at INTEGER,
 completion_id TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_challenges(user_id);
