-- Additive homepage hero media registry. Publication remains versioned in Business Settings.
CREATE TABLE IF NOT EXISTS `homepage_hero_media` (
  `id` VARCHAR(191) PRIMARY KEY,
  `object_key` VARCHAR(512) NOT NULL UNIQUE,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(32) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `width` BIGINT NOT NULL,
  `height` BIGINT NOT NULL,
  `duration_seconds` DOUBLE NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` BIGINT NOT NULL,
  `archived_at` BIGINT NULL,
  KEY `idx_homepage_hero_media_created` (`created_at`,`id`),
  KEY `idx_homepage_hero_media_archive` (`archived_at`,`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CHECK (`mime_type` IN ('image/webp','video/mp4')),
  CHECK (`size_bytes`>0),
  CHECK (`width`>0),
  CHECK (`height`>0),
  CHECK (`duration_seconds` IS NULL OR `duration_seconds`>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `homepage_hero_media` (
  `id`,`object_key`,`original_name`,`mime_type`,`size_bytes`,
  `width`,`height`,`duration_seconds`,`created_by`,`created_at`,`archived_at`
) VALUES (
  'system-nepal-craft-hero',
  'public/homepage/nepal-craft-hero.webp',
  'nepal-craft-hero.webp',
  'image/webp',
  320794,
  1800,
  1125,
  NULL,
  NULL,
  0,
  NULL
);

INSERT IGNORE INTO `homepage_hero_media` (
  `id`,`object_key`,`original_name`,`mime_type`,`size_bytes`,
  `width`,`height`,`duration_seconds`,`created_by`,`created_at`,`archived_at`
) VALUES
  (
    'system-maker-hands-hero',
    'public/homepage/maker-hands-hero.webp',
    'maker-hands-hero.webp',
    'image/webp',
    209526,
    1800,
    1125,
    NULL,
    NULL,
    0,
    NULL
  ),
  (
    'system-meaningful-gifts-hero',
    'public/homepage/meaningful-gifts-hero.webp',
    'meaningful-gifts-hero.webp',
    'image/webp',
    233764,
    1800,
    1125,
    NULL,
    NULL,
    0,
    NULL
  );
