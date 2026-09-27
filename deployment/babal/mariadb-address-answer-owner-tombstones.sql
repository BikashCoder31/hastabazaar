-- Retain only the owner link needed to resolve historical form answers after
-- a saved address is hard-deleted. The old address ID intentionally has no FK.
CREATE TABLE IF NOT EXISTS `address_answer_owner_tombstones` (
  `address_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `deletion_request_id` VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  `deleted_at` BIGINT NOT NULL,
  PRIMARY KEY (`address_id`),
  KEY `idx_address_answer_owner_tombstones_user` (`user_id`,`deleted_at`,`address_id`),
  CONSTRAINT `address_answer_owner_tombstones_address_length` CHECK (CHAR_LENGTH(`address_id`) BETWEEN 1 AND 191),
  CONSTRAINT `address_answer_owner_tombstones_request_length` CHECK (CHAR_LENGTH(`deletion_request_id`) BETWEEN 1 AND 191),
  CONSTRAINT `address_answer_owner_tombstones_time` CHECK (`deleted_at` >= 0),
  CONSTRAINT `address_answer_owner_tombstones_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
