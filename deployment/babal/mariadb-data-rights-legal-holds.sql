-- Additive stored legal-hold state. Placement/release is audited by the privacy repository.
CREATE TABLE IF NOT EXISTS `data_rights_legal_holds` (
  `id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `placed_by` VARCHAR(191) NOT NULL,
  `placed_at` BIGINT NOT NULL,
  `released_by` VARCHAR(191) NULL,
  `released_at` BIGINT NULL,
  `active_user_id` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `released_at` IS NULL THEN `user_id` ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_data_rights_legal_holds_one_active` (`active_user_id`),
  KEY `idx_data_rights_legal_holds_user_active` (`user_id`,`released_at`),
  CONSTRAINT `data_rights_legal_holds_reason` CHECK (CHAR_LENGTH(TRIM(`reason`)) BETWEEN 8 AND 2000),
  CONSTRAINT `data_rights_legal_holds_release` CHECK ((`released_by` IS NULL AND `released_at` IS NULL) OR (`released_by` IS NOT NULL AND `released_at` IS NOT NULL AND `released_at` >= `placed_at`)),
  CONSTRAINT `data_rights_legal_holds_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `data_rights_legal_holds_placed_by_fk` FOREIGN KEY (`placed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `data_rights_legal_holds_released_by_fk` FOREIGN KEY (`released_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
