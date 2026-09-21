CREATE TABLE IF NOT EXISTS homepage_hero_media (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/webp','video/mp4')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
  width INTEGER NOT NULL CHECK(width>0),
  height INTEGER NOT NULL CHECK(height>0),
  duration_seconds REAL CHECK(duration_seconds IS NULL OR duration_seconds>0),
  created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  archived_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_homepage_hero_media_created ON homepage_hero_media(created_at,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_homepage_hero_media_archive ON homepage_hero_media(archived_at,id);
--> statement-breakpoint
INSERT OR IGNORE INTO homepage_hero_media (
  id, object_key, original_name, mime_type, size_bytes,
  width, height, duration_seconds, created_by, created_at, archived_at
) VALUES (
  'system-nepal-craft-hero',
  'public/homepage/nepal-craft-hero.webp',
  'nepal-craft-hero.webp',
  'image/webp',
  320794,
  1800,
  1125,
  NULL,
  NULL,
  0,
  NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO homepage_hero_media (
  id, object_key, original_name, mime_type, size_bytes,
  width, height, duration_seconds, created_by, created_at, archived_at
) VALUES
  (
    'system-maker-hands-hero',
    'public/homepage/maker-hands-hero.webp',
    'maker-hands-hero.webp',
    'image/webp',
    209526,
    1800,
    1125,
    NULL,
    NULL,
    0,
    NULL
  ),
  (
    'system-meaningful-gifts-hero',
    'public/homepage/meaningful-gifts-hero.webp',
    'meaningful-gifts-hero.webp',
    'image/webp',
    233764,
    1800,
    1125,
    NULL,
    NULL,
    0,
    NULL
  );
