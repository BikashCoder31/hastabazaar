-- Additive seller and maker participation foundation.
-- Staging migration only until production migration is separately approved.
ALTER TABLE `seller_profiles` ADD COLUMN IF NOT EXISTS `tax_registration_number_key` VARCHAR(191)
  GENERATED ALWAYS AS (NULLIF(`tax_registration_number`, '')) STORED;
ALTER TABLE `seller_profiles` DROP INDEX IF EXISTS `idx_seller_profiles_tax_number_unique`;
CREATE UNIQUE INDEX `idx_seller_profiles_tax_number_unique`
  ON `seller_profiles` (`tax_registration_number_key`);

CREATE TABLE IF NOT EXISTS `seller_participation_profiles` (
  `seller_id` VARCHAR(191) NOT NULL,
  `participation_route` VARCHAR(32) NOT NULL,
  `application_stage` VARCHAR(40) NOT NULL,
  `tax_status` VARCHAR(32) NULL,
  `public_name` LONGTEXT NOT NULL,
  `public_city` VARCHAR(191) NOT NULL,
  `craft_experience_json` LONGTEXT NOT NULL DEFAULT '[]',
  `social_links_json` LONGTEXT NOT NULL DEFAULT '{}',
  `commercial_model` VARCHAR(64) NULL,
  `legal_seller_reference` VARCHAR(191) NULL,
  `invoice_issuer_reference` VARCHAR(191) NULL,
  `payout_beneficiary_reference` VARCHAR(191) NULL,
  `return_destination_type` VARCHAR(48) NOT NULL DEFAULT 'maker_address',
  `version` BIGINT NOT NULL DEFAULT 1,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`seller_id`),
  KEY `idx_seller_participation_review` (`participation_route`, `application_stage`, `created_at`),
  CONSTRAINT `seller_participation_route` CHECK (`participation_route` IN ('registered_seller','managed_maker')),
  CONSTRAINT `seller_participation_stage` CHECK (`application_stage` IN ('draft','submitted','under_review','changes_requested','approved_for_activation','active','rejected','suspended')),
  CONSTRAINT `seller_participation_tax` CHECK (`tax_status` IS NULL OR `tax_status` IN ('business_pan_only','vat_registered')),
  CONSTRAINT `seller_participation_version` CHECK (`version` >= 1),
  CONSTRAINT `seller_participation_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_participation_guards` (
  `id` VARCHAR(191) NOT NULL,
  `valid` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `seller_participation_guard_valid` CHECK (`valid` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_operational_addresses` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `purpose` VARCHAR(32) NOT NULL,
  `same_as_address_id` VARCHAR(191) NULL,
  `province` LONGTEXT NOT NULL,
  `district` LONGTEXT NOT NULL,
  `municipality` LONGTEXT NOT NULL,
  `ward` LONGTEXT NULL,
  `locality` LONGTEXT NOT NULL,
  `is_public` BIGINT NOT NULL DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_seller_addresses_purpose` (`seller_id`, `purpose`),
  CONSTRAINT `seller_address_private` CHECK (`is_public` = 0),
  CONSTRAINT `seller_address_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `seller_address_same_as_fk` FOREIGN KEY (`same_as_address_id`) REFERENCES `seller_operational_addresses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `seller_profile_media` (
  `id` VARCHAR(191) NOT NULL,
  `seller_id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(32) NOT NULL,
  `object_key` VARCHAR(191) NOT NULL,
  `original_name` LONGTEXT NOT NULL,
  `mime_type` VARCHAR(191) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `moderation_status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `uploaded_at` BIGINT NOT NULL,
  `reviewed_at` BIGINT NULL,
  `reviewed_by` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_seller_profile_media_kind` (`seller_id`, `kind`),
  UNIQUE KEY `idx_seller_profile_media_object_key` (`object_key`),
  CONSTRAINT `seller_profile_media_seller_fk` FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `seller_profile_media_reviewer_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `seller_participation_profiles` (
  `seller_id`, `participation_route`, `application_stage`, `tax_status`,
  `public_name`, `public_city`, `craft_experience_json`, `social_links_json`,
  `commercial_model`, `legal_seller_reference`, `invoice_issuer_reference`,
  `payout_beneficiary_reference`, `return_destination_type`, `version`,
  `created_at`, `updated_at`
)
SELECT `id`, 'registered_seller',
  CASE `status` WHEN 'approved' THEN 'active' WHEN 'needs_changes' THEN 'changes_requested' ELSE `status` END,
  CASE WHEN `tax_mode` IN ('VAT','BOTH') THEN 'vat_registered' ELSE 'business_pan_only' END,
  `trading_name`, `municipality`, '[]', '{}', NULL,
  CASE WHEN `status` = 'approved' THEN `id` ELSE NULL END,
  CASE WHEN `status` = 'approved' THEN `id` ELSE NULL END,
  CASE WHEN `status` = 'approved' THEN `id` ELSE NULL END,
  'maker_address', 1, `created_at`, `updated_at`
FROM `seller_profiles`;

INSERT IGNORE INTO `seller_operational_addresses` (
  `id`, `seller_id`, `purpose`, `same_as_address_id`, `province`, `district`,
  `municipality`, `ward`, `locality`, `is_public`, `created_at`, `updated_at`
)
SELECT CONCAT('verification-', `id`), `id`, 'verification', NULL, `province`, `district`,
  `municipality`, `ward`, `locality`, 0, `created_at`, `updated_at`
FROM `seller_profiles`;
