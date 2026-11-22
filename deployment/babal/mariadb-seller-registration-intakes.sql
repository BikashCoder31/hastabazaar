-- Additive upgrade. Review and back up the target before applying.
CREATE TABLE IF NOT EXISTS seller_registration_intakes (
 seller_id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL UNIQUE,
 version BIGINT NOT NULL,
 answers_json LONGTEXT NOT NULL,
 documents_json LONGTEXT NOT NULL,
 review_ready INTEGER NOT NULL CHECK(review_ready IN (0,1)),
 updated_at BIGINT NOT NULL,
 FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
