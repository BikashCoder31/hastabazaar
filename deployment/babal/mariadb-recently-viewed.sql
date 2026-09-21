CREATE TABLE IF NOT EXISTS `recently_viewed_products` (
  `user_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `last_viewed_at` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`,`product_id`),
  KEY `idx_recently_viewed_user_time` (`user_id`,`last_viewed_at`),
  CONSTRAINT `recently_viewed_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recently_viewed_product_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
