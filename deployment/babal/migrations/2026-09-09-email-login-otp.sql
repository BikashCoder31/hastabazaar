CREATE TABLE IF NOT EXISTS `email_login_challenges` (
  `token_hash` VARCHAR(64) NOT NULL,
  `code_hash` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `attempts` BIGINT NOT NULL DEFAULT 0,
  `expires_at` BIGINT NOT NULL,
  `created_at` BIGINT NOT NULL,
  `consumed_at` BIGINT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_email_login_challenges_user_created` (`user_id`, `created_at`),
  KEY `idx_email_login_challenges_expiry` (`expires_at`),
  CONSTRAINT `email_login_challenges_user_id_users_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
