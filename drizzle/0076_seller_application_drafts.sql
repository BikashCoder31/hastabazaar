-- Additive only. Apply through a separately reviewed upgrade; never during startup.
CREATE TABLE seller_application_drafts (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 revision VARCHAR(36) NOT NULL,
 attempt_id VARCHAR(100) NOT NULL,
 form_version INTEGER NOT NULL,
 answers_json TEXT NOT NULL,
 files_json TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX seller_application_drafts_expiry ON seller_application_drafts(expires_at);
CREATE TABLE seller_application_draft_uploads (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES users(id),
 object_key VARCHAR(255) NOT NULL UNIQUE,
 status VARCHAR(16) NOT NULL CHECK(status IN ('uploading','ready','deleting')),
 expires_at INTEGER NOT NULL
);
CREATE INDEX seller_application_draft_uploads_expiry ON seller_application_draft_uploads(status,expires_at);
