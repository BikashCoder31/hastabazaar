-- Additive migration. Existing reviews, orders and customer data are preserved.
CREATE TABLE IF NOT EXISTS review_photos (
 id VARCHAR(191) PRIMARY KEY,
 review_id VARCHAR(191) NOT NULL REFERENCES product_reviews(id),
 object_key VARCHAR(191) NOT NULL UNIQUE,
 mime_type VARCHAR(64) NOT NULL,
 size_bytes BIGINT NOT NULL,
 sort_order BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 UNIQUE(review_id,sort_order),
 CHECK(sort_order BETWEEN 0 AND 2),
 CHECK(size_bytes BETWEEN 1 AND 5242880)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS review_replies (
 id VARCHAR(191) PRIMARY KEY,
 review_id VARCHAR(191) NOT NULL REFERENCES product_reviews(id),
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),
 body TEXT NOT NULL,
 version BIGINT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 created_at BIGINT NOT NULL,
 moderated_by VARCHAR(191) REFERENCES users(id),
 moderation_note TEXT,
 UNIQUE(review_id,version),
 CHECK(version>0),
 CHECK(status IN ('pending','published','rejected','hidden'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
