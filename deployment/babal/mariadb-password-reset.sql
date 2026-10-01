-- Additive, repeatable; apply to the existing database before the new application.
CREATE TABLE IF NOT EXISTS password_reset_challenges (
 token_hash VARCHAR(64) PRIMARY KEY NOT NULL,
 code_hash VARCHAR(64) NOT NULL,
 user_id VARCHAR(191) NOT NULL,
 attempts BIGINT NOT NULL DEFAULT 0,
 expires_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 consumed_at BIGINT NULL,
 completion_id VARCHAR(64) NULL,
 INDEX idx_password_reset_user(user_id),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
