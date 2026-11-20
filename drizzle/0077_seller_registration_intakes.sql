CREATE TABLE seller_registration_intakes (
 seller_id VARCHAR(191) PRIMARY KEY REFERENCES seller_profiles(id),
 user_id VARCHAR(191) NOT NULL UNIQUE REFERENCES users(id),
 version INTEGER NOT NULL,
 answers_json TEXT NOT NULL,
 documents_json TEXT NOT NULL,
 review_ready INTEGER NOT NULL CHECK(review_ready IN (0,1)),
 updated_at INTEGER NOT NULL
);
