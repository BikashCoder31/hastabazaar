-- Privacy-limited first-party browser-session estimates. No IP, user-agent,
-- checkout payload, account id, advertising id or replay content is stored.
CREATE TABLE IF NOT EXISTS `traffic_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `first_seen_at` BIGINT NOT NULL,
  `last_seen_at` BIGINT NOT NULL,
  `expires_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_traffic_sessions_token` (`token_hash`),
  KEY `idx_traffic_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `traffic_events` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `event_type` VARCHAR(40) NOT NULL,
  `path` VARCHAR(200) NOT NULL,
  `entity_key` VARCHAR(191) NULL,
  `event_key` VARCHAR(191) NOT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_traffic_events_key` (`event_key`),
  KEY `idx_traffic_events_created` (`created_at`),
  KEY `idx_traffic_events_type_created` (`event_type`,`created_at`),
  KEY `idx_traffic_events_session_created` (`session_id`,`created_at`),
  CONSTRAINT `traffic_events_session_fk` FOREIGN KEY (`session_id`) REFERENCES `traffic_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `traffic_events_type_check` CHECK (`event_type` IN ('page_view','product_view','add_to_cart','checkout_started','order_completed')),
  CONSTRAINT `traffic_events_path_check` CHECK (CHAR_LENGTH(`path`) BETWEEN 1 AND 200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
