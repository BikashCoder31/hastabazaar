CREATE TABLE occasion_discovery (
  occasion_id VARCHAR(191) NOT NULL,
  group_name VARCHAR(80) DEFAULT NULL CHECK(group_name IS NULL OR CHAR_LENGTH(TRIM(group_name)) BETWEEN 1 AND 80),
  group_sort_order BIGINT NOT NULL DEFAULT 0 CHECK(group_sort_order>=0),
  season_starts_at BIGINT DEFAULT NULL,
  season_ends_at BIGINT DEFAULT NULL,
  PRIMARY KEY (occasion_id),
  CONSTRAINT occasion_discovery_source_fk FOREIGN KEY (occasion_id) REFERENCES occasions(id) ON DELETE CASCADE,
  CONSTRAINT occasion_discovery_window CHECK(
    (season_starts_at IS NULL AND season_ends_at IS NULL) OR
    (season_starts_at IS NOT NULL AND season_ends_at IS NOT NULL AND season_starts_at>=0 AND season_ends_at>season_starts_at)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
