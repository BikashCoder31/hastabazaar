CREATE TABLE IF NOT EXISTS traffic_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_traffic_sessions_expiry ON traffic_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS traffic_events (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES traffic_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('page_view','product_view','add_to_cart','checkout_started','order_completed')),
  path TEXT NOT NULL CHECK(length(path) BETWEEN 1 AND 200),
  entity_key TEXT,
  event_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_traffic_events_created ON traffic_events(created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_traffic_events_type_created ON traffic_events(event_type,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_traffic_events_session_created ON traffic_events(session_id,created_at);
