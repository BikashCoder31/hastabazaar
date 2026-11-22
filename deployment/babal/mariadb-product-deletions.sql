-- Additive and repeatable. Apply before deploying the product deletion update.
CREATE TABLE IF NOT EXISTS product_deletions (
 product_id VARCHAR(191) PRIMARY KEY NOT NULL,
 deleted_by VARCHAR(191) NOT NULL,
 deleted_at BIGINT NOT NULL,
 request_id VARCHAR(191) NOT NULL,
 FOREIGN KEY (product_id) REFERENCES products(id),
 FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
