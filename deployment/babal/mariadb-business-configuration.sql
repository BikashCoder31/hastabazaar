-- Additive business-configuration tables for an existing MariaDB deployment.
-- Staging migration only until production migration is separately approved.
CREATE TABLE IF NOT EXISTS `business_setting_versions` (
  `id` VARCHAR(191) NOT NULL,
  `setting_key` VARCHAR(191) NOT NULL,
  `version` BIGINT NOT NULL,
  `value_json` LONGTEXT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `revision` BIGINT NOT NULL DEFAULT 1,
  `change_control` VARCHAR(32) NOT NULL,
  `effective_from` BIGINT NULL,
  `effective_until` BIGINT NULL,
  `reason` LONGTEXT NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `submitted_by` VARCHAR(191) NULL,
  `submitted_at` BIGINT NULL,
  `approved_by` VARCHAR(191) NULL,
  `approved_at` BIGINT NULL,
  `published_by` VARCHAR(191) NULL,
  `published_at` BIGINT NULL,
  `decision_note` LONGTEXT NULL,
  `supersedes_id` VARCHAR(191) NULL,
  `last_request_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_business_setting_versions_key_version` (`setting_key`, `version`),
  UNIQUE KEY `idx_business_setting_versions_request` (`last_request_id`),
  KEY `idx_business_setting_versions_effective` (`setting_key`, `status`, `effective_from`, `effective_until`),
  KEY `idx_business_setting_versions_review` (`status`, `created_at`),
  CONSTRAINT `business_setting_versions_status` CHECK (`status` IN ('draft', 'pending_approval', 'published', 'rejected', 'cancelled')),
  CONSTRAINT `business_setting_versions_revision` CHECK (`revision` >= 1),
  CONSTRAINT `business_setting_versions_control` CHECK (`change_control` IN ('simple', 'controlled')),
  CONSTRAINT `business_setting_versions_interval` CHECK (`effective_until` IS NULL OR (`effective_from` IS NOT NULL AND `effective_until` > `effective_from`)),
  CONSTRAINT `business_setting_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `business_setting_versions_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `business_setting_versions_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `business_setting_versions_published_by_users_id_fk` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `business_setting_versions_supersedes_id_fk` FOREIGN KEY (`supersedes_id`) REFERENCES `business_setting_versions` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `business_setting_guards` (
  `id` VARCHAR(191) NOT NULL,
  `valid` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `business_setting_guards_valid` CHECK (`valid` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
