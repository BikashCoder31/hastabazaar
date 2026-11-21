CREATE TABLE seller_staff_notes (
  id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  seller_id VARCHAR(191) NOT NULL,
  author_user_id VARCHAR(191) NOT NULL,
  body TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(body)) BETWEEN 1 AND 2000),
  created_at BIGINT NOT NULL,
  pinned TINYINT NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  KEY seller_staff_notes_timeline (seller_id, created_at, id),
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
  FOREIGN KEY (author_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
