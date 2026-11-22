-- Additive upgrade for an existing installation. Review/backup before applying.
CREATE TABLE IF NOT EXISTS seller_application_drafts (
 user_id VARCHAR(191) PRIMARY KEY,
 revision VARCHAR(36) NOT NULL,
 attempt_id VARCHAR(100) NOT NULL,
 form_version BIGINT NOT NULL,
 answers_json LONGTEXT NOT NULL,
 files_json LONGTEXT NOT NULL,
 updated_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id),
 INDEX seller_application_drafts_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS seller_application_draft_uploads (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL,
 object_key VARCHAR(255) NOT NULL UNIQUE,
 status VARCHAR(16) NOT NULL CHECK(status IN ('uploading','ready','deleting')),
 expires_at BIGINT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id),
 INDEX seller_application_draft_uploads_expiry(status,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
