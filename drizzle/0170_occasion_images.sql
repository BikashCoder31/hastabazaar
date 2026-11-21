-- Owner applied. Apply only to an approved database copy.
-- Optional occasion imagery. Existing occasions, products and form history are unchanged.
CREATE TABLE occasion_media (
  id TEXT PRIMARY KEY,
  occasion_id TEXT REFERENCES occasions(id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type='image/webp'),
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),
  width INTEGER NOT NULL CHECK(width>0 AND width<=2400),
  height INTEGER NOT NULL CHECK(height>0 AND height<=1600),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(created_by,request_id)
);
--> statement-breakpoint
CREATE INDEX idx_occasion_media_occasion ON occasion_media(occasion_id,id);
--> statement-breakpoint
CREATE TABLE occasion_image_assignments (
  occasion_id TEXT PRIMARY KEY REFERENCES occasions(id) ON DELETE RESTRICT,
  media_id TEXT UNIQUE REFERENCES occasion_media(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at INTEGER NOT NULL
);
