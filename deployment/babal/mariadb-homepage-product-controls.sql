CREATE TABLE IF NOT EXISTS homepage_product_controls (
  product_id VARCHAR(191) PRIMARY KEY,
  is_hidden BIGINT NOT NULL DEFAULT 0,
  reason LONGTEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_by VARCHAR(191) NOT NULL,
  last_request_id VARCHAR(191) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  KEY idx_homepage_product_controls_hidden_updated (is_hidden, updated_at),
  CONSTRAINT homepage_product_controls_hidden_boolean CHECK (is_hidden IN (0, 1)),
  CONSTRAINT homepage_product_controls_version_positive CHECK (version >= 1),
  CONSTRAINT homepage_product_controls_product_fk FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT homepage_product_controls_actor_fk FOREIGN KEY (updated_by)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
