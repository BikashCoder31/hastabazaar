CREATE TABLE occasion_discovery (
  occasion_id TEXT NOT NULL PRIMARY KEY REFERENCES occasions(id) ON DELETE CASCADE,
  group_name TEXT DEFAULT NULL CHECK(group_name IS NULL OR length(trim(group_name)) BETWEEN 1 AND 80),
  group_sort_order INTEGER NOT NULL DEFAULT 0 CHECK(typeof(group_sort_order)='integer' AND group_sort_order>=0),
  season_starts_at INTEGER DEFAULT NULL,
  season_ends_at INTEGER DEFAULT NULL,
  CHECK(
    (season_starts_at IS NULL AND season_ends_at IS NULL) OR
    (typeof(season_starts_at)='integer' AND typeof(season_ends_at)='integer'
      AND season_starts_at>=0 AND season_ends_at>season_starts_at)
  )
);
