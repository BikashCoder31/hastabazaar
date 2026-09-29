-- Additive contact security tables; no existing contact proofs are backfilled.
-- The generated base snapshot predates the existing mailbox proof migration.
CREATE TABLE IF NOT EXISTS account_email_verifications (
 user_id VARCHAR(191) PRIMARY KEY NOT NULL,email VARCHAR(254) NOT NULL,verified_at BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS account_phone_verifications (
 user_id VARCHAR(191) PRIMARY KEY NOT NULL,
 phone VARCHAR(32) NOT NULL,
 verified_at BIGINT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS account_contact_challenges (
 token_hash VARCHAR(64) PRIMARY KEY NOT NULL, code_hash VARCHAR(64) NOT NULL,
 user_id VARCHAR(191) NOT NULL, auth_subject VARCHAR(191) NOT NULL,
 channel VARCHAR(8) NOT NULL CHECK(channel IN ('email','phone')),
 contact_value VARCHAR(254) NOT NULL, contact_snapshot VARCHAR(254) NOT NULL,
 attempts BIGINT NOT NULL DEFAULT 0 CHECK(attempts>=0),expires_at BIGINT NOT NULL,created_at BIGINT NOT NULL,
 delivered_at BIGINT NULL,consumed_at BIGINT NULL,
 UNIQUE KEY idx_account_contact_owner_channel(user_id,channel),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS local_contact_captures (
 token_hash VARCHAR(64) PRIMARY KEY NOT NULL,user_id VARCHAR(191) NOT NULL,channel VARCHAR(8) NOT NULL,
 contact_value VARCHAR(254) NOT NULL,code VARCHAR(6) NOT NULL,expires_at BIGINT NOT NULL,
 simulation_label VARCHAR(80) NOT NULL CHECK(simulation_label='SIMULATED — NOT VALID FOR PRODUCTION'),
 FOREIGN KEY(token_hash) REFERENCES account_contact_challenges(token_hash) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DROP TRIGGER IF EXISTS account_phone_change_revoke;
DELIMITER $$
CREATE TRIGGER account_phone_change_revoke AFTER UPDATE ON users FOR EACH ROW
BEGIN
 IF NOT (OLD.phone <=> NEW.phone) THEN
  DELETE FROM account_phone_verifications WHERE user_id=NEW.id;
  DELETE FROM account_contact_challenges WHERE user_id=NEW.id AND channel='phone';
 END IF;
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS account_email_change_revoke;
DELIMITER $$
CREATE TRIGGER account_email_change_revoke AFTER UPDATE ON users FOR EACH ROW
BEGIN
 IF lower(OLD.email)<>lower(NEW.email) THEN
  DELETE FROM account_email_verifications WHERE user_id=NEW.id;
  DELETE FROM account_contact_challenges WHERE user_id=NEW.id AND channel='email';
 END IF;
END$$
DELIMITER ;
