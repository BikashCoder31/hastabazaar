-- Optional category imagery. Existing categories, products and form history are unchanged.
CREATE TABLE category_media (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
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
CREATE INDEX idx_category_media_category ON category_media(category_id,id);
--> statement-breakpoint
CREATE TABLE category_image_assignments (
  category_id TEXT PRIMARY KEY REFERENCES categories(id) ON DELETE RESTRICT,
  media_id TEXT UNIQUE REFERENCES category_media(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at INTEGER NOT NULL
);
