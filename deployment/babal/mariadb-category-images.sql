-- Additive optional category imagery; preserve categories, products and form history.
-- Asset/request identifiers keep SQLite text equality. Parent IDs keep the
-- production users/categories utf8mb4_unicode_ci foreign-key contract.
CREATE TABLE IF NOT EXISTS `category_media` (
  `id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `category_id` VARCHAR(191) NULL,
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
  UNIQUE KEY `idx_category_media_object_key` (`object_key`),
  UNIQUE KEY `idx_category_media_actor_request` (`created_by`,`request_id`),
  KEY `idx_category_media_category` (`category_id`,`id`),
  CONSTRAINT `category_media_size` CHECK (`size_bytes`>0 AND `size_bytes`<=5242880),
  CONSTRAINT `category_media_dimensions` CHECK (`width`>0 AND `width`<=2400 AND `height`>0 AND `height`<=1600),
  CONSTRAINT `category_media_mime` CHECK (`mime_type`='image/webp'),
  CONSTRAINT `category_media_hash` CHECK (CHAR_LENGTH(`content_hash`)=64),
  CONSTRAINT `category_media_category_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `category_media_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `category_image_assignments` (
  `category_id` VARCHAR(191) NOT NULL,
  `media_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL,
  `updated_by` VARCHAR(191) NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `idx_category_image_assignments_media` (`media_id`),
  CONSTRAINT `category_image_assignments_category_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `category_image_assignments_media_fk` FOREIGN KEY (`media_id`) REFERENCES `category_media` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `category_image_assignments_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
