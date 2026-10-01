CREATE TABLE IF NOT EXISTS marketplace_settings (
  `key` VARCHAR(191) PRIMARY KEY,
  `value` LONGTEXT NOT NULL,
  updated_by VARCHAR(191) NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT marketplace_settings_actor_fk FOREIGN KEY (updated_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO marketplace_settings (`key`, `value`, updated_by, updated_at)
VALUES ('seller_commission_bps', '900', NULL, 0);
