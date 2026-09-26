-- Additive form catalog. Published rows are frozen; restore publishes a new version.
CREATE TABLE IF NOT EXISTS `form_config_versions` (
  `id` VARCHAR(191) NOT NULL,
  `form_id` VARCHAR(191) NOT NULL,
  `version` BIGINT NOT NULL,
  `revision` BIGINT NOT NULL DEFAULT 1,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `config_json` LONGTEXT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_by` VARCHAR(191) NOT NULL,
  `updated_at` BIGINT NOT NULL,
  `published_by` VARCHAR(191) NULL,
  `published_at` BIGINT NULL,
  `last_request_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_form_config_versions_form_version` (`form_id`,`version`),
  UNIQUE KEY `idx_form_config_versions_form_id` (`form_id`,`id`),
  UNIQUE KEY `idx_form_config_versions_request` (`last_request_id`),
  KEY `idx_form_config_versions_current` (`form_id`,`status`,`version` DESC),
  CONSTRAINT `form_config_versions_form_id_length` CHECK (CHAR_LENGTH(`form_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_config_versions_version` CHECK (`version` >= 1),
  CONSTRAINT `form_config_versions_revision` CHECK (`revision` >= 1),
  CONSTRAINT `form_config_versions_status` CHECK (`status` IN ('draft','published')),
  CONSTRAINT `form_config_versions_json` CHECK (JSON_VALID(`config_json`) AND JSON_TYPE(`config_json`) = 'OBJECT' AND OCTET_LENGTH(`config_json`) <= 65536),
  CONSTRAINT `form_config_versions_reason` CHECK (CHAR_LENGTH(TRIM(`reason`)) BETWEEN 1 AND 2000),
  CONSTRAINT `form_config_versions_request_length` CHECK (CHAR_LENGTH(`last_request_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_config_versions_publication` CHECK ((`status` = 'draft' AND `published_by` IS NULL AND `published_at` IS NULL) OR (`status` = 'published' AND `published_by` IS NOT NULL AND `published_at` IS NOT NULL)),
  CONSTRAINT `form_config_versions_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `form_config_versions_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `form_config_versions_published_by_fk` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS `trg_form_config_versions_published_update` BEFORE UPDATE ON `form_config_versions` FOR EACH ROW BEGIN
  IF OLD.`status` = 'published' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'published form configuration is immutable'; END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER IF NOT EXISTS `trg_form_config_versions_published_delete` BEFORE DELETE ON `form_config_versions` FOR EACH ROW BEGIN
  IF OLD.`status` = 'published' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'published form configuration is immutable'; END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS `form_answer_sets` (
  `id` VARCHAR(191) NOT NULL,
  `form_id` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) NOT NULL,
  `config_version_id` VARCHAR(191) NOT NULL,
  `subject_type` VARCHAR(64) NOT NULL,
  `subject_id` VARCHAR(191) NOT NULL,
  `actor_id` VARCHAR(191) NULL,
  `answers_json` LONGTEXT NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_form_answer_sets_form_request` (`form_id`,`request_id`),
  KEY `idx_form_answer_sets_owner` (`subject_type`,`subject_id`,`created_at`),
  KEY `idx_form_answer_sets_version` (`config_version_id`,`created_at`),
  CONSTRAINT `form_answer_sets_form_id_length` CHECK (CHAR_LENGTH(`form_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_answer_sets_request_length` CHECK (CHAR_LENGTH(`request_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_answer_sets_subject_type_length` CHECK (CHAR_LENGTH(`subject_type`) BETWEEN 1 AND 64),
  CONSTRAINT `form_answer_sets_subject_id_length` CHECK (CHAR_LENGTH(`subject_id`) BETWEEN 1 AND 191),
  CONSTRAINT `form_answer_sets_json` CHECK (JSON_VALID(`answers_json`) AND JSON_TYPE(`answers_json`) = 'OBJECT' AND OCTET_LENGTH(`answers_json`) <= 131072),
  CONSTRAINT `form_answer_sets_version_fk` FOREIGN KEY (`form_id`,`config_version_id`) REFERENCES `form_config_versions` (`form_id`,`id`) ON DELETE RESTRICT,
  CONSTRAINT `form_answer_sets_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
