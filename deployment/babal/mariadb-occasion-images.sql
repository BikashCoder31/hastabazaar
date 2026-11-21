-- Owner applied. Apply only to an approved database copy.
-- Additive optional occasion imagery; preserve occasions, products and form history.
-- Asset/request identifiers keep SQLite text equality. Parent IDs keep the
-- production users/occasions utf8mb4_unicode_ci foreign-key contract.
CREATE TABLE IF NOT EXISTS `occasion_media` (
  `id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `occasion_id` VARCHAR(191) NULL,
  `object_key` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `original_name` LONGTEXT NOT NULL,
  `mime_type` VARCHAR(32) COLLATE utf8mb4_nopad_bin NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `width` BIGINT NOT NULL,
  `height` BIGINT NOT NULL,
  `content_hash` VARCHAR(64) COLLATE utf8mb4_nopad_bin NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_occasion_media_object_key` (`object_key`),
  UNIQUE KEY `idx_occasion_media_actor_request` (`created_by`,`request_id`),
  KEY `idx_occasion_media_occasion` (`occasion_id`,`id`),
  CONSTRAINT `occasion_media_size` CHECK (`size_bytes`>0 AND `size_bytes`<=5242880),
  CONSTRAINT `occasion_media_dimensions` CHECK (`width`>0 AND `width`<=2400 AND `height`>0 AND `height`<=1600),
  CONSTRAINT `occasion_media_mime` CHECK (`mime_type`='image/webp'),
  CONSTRAINT `occasion_media_hash` CHECK (CHAR_LENGTH(`content_hash`)=64),
  CONSTRAINT `occasion_media_occasion_fk` FOREIGN KEY (`occasion_id`) REFERENCES `occasions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `occasion_media_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `occasion_image_assignments` (
  `occasion_id` VARCHAR(191) NOT NULL,
  `media_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL,
  `updated_by` VARCHAR(191) NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`occasion_id`),
  UNIQUE KEY `idx_occasion_image_assignments_media` (`media_id`),
  CONSTRAINT `occasion_image_assignments_occasion_fk` FOREIGN KEY (`occasion_id`) REFERENCES `occasions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `occasion_image_assignments_media_fk` FOREIGN KEY (`media_id`) REFERENCES `occasion_media` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `occasion_image_assignments_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
