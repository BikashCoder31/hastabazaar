-- Owner applied. Apply only to an approved database copy after 0171.
-- Optional NCM storage starts empty. Connection credentials stay in the app environment.
CREATE TABLE ncm_partner_settings (
  partner_id TEXT NOT NULL PRIMARY KEY REFERENCES delivery_partners(id) ON DELETE RESTRICT,
  connection_fingerprint TEXT,
  assigned_branches_json TEXT NOT NULL,
  branches_json TEXT NOT NULL,
  branches_checked_at INTEGER,
  refresh_started_at INTEGER,
  connected_at INTEGER,
  delivery_type TEXT NOT NULL DEFAULT 'Door2Door',
  package_name TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  last_check_at INTEGER,
  check_started_at INTEGER,
  CONSTRAINT ncm_settings_assigned_json CHECK (json_valid(assigned_branches_json) AND json_type(assigned_branches_json)='array'),
  CONSTRAINT ncm_settings_branches_json CHECK (json_valid(branches_json) AND json_type(branches_json)='array'),
  CONSTRAINT ncm_settings_type CHECK (delivery_type IN ('Door2Door','Branch2Door','Branch2Branch','Door2Branch')),
  CONSTRAINT ncm_settings_revision CHECK (revision>=1)
);
--> statement-breakpoint
CREATE TABLE ncm_pickup_branches (
  pickup_address_id TEXT NOT NULL PRIMARY KEY REFERENCES seller_operational_addresses(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL REFERENCES delivery_partners(id) ON DELETE RESTRICT,
  address_updated_at INTEGER NOT NULL,
  branch TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_ncm_pickup_partner ON ncm_pickup_branches(partner_id);
--> statement-breakpoint
CREATE TABLE ncm_bookings (
  job_id TEXT NOT NULL PRIMARY KEY REFERENCES shipping_jobs(id) ON DELETE RESTRICT,
  partner_id TEXT NOT NULL REFERENCES delivery_partners(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vendor_reference TEXT NOT NULL,
  ncm_order_id TEXT,
  state TEXT NOT NULL,
  request_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  response_json TEXT,
  label_json TEXT,
  cod_reported_paisa INTEGER,
  delivery_charge_paisa INTEGER,
  return_charge_paisa INTEGER,
  last_status TEXT,
  CONSTRAINT ncm_booking_reference CHECK (length(vendor_reference) BETWEEN 1 AND 20),
  CONSTRAINT ncm_booking_state CHECK (state IN ('booking','needs_review','rejected','booked')),
  CONSTRAINT ncm_booking_response_json CHECK (response_json IS NULL OR json_valid(response_json)),
  CONSTRAINT ncm_booking_label_json CHECK (label_json IS NULL OR json_valid(label_json))
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_ncm_booking_reference ON ncm_bookings(vendor_reference);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_ncm_booking_order ON ncm_bookings(ncm_order_id);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_ncm_booking_request ON ncm_bookings(request_id);
--> statement-breakpoint
CREATE INDEX idx_ncm_booking_partner_state ON ncm_bookings(partner_id,state,job_id);
--> statement-breakpoint
CREATE INDEX idx_ncm_booking_actor ON ncm_bookings(actor_id);
--> statement-breakpoint
CREATE TABLE ncm_api_daily_usage (
  usage_day TEXT NOT NULL,
  bucket TEXT NOT NULL,
  used INTEGER NOT NULL,
  PRIMARY KEY (usage_day,bucket),
  CONSTRAINT ncm_usage_day CHECK (usage_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CONSTRAINT ncm_usage_bucket CHECK (bucket IN ('create','view')),
  CONSTRAINT ncm_usage_nonnegative CHECK (used>=0)
);
--> statement-breakpoint
CREATE TABLE ncm_webhook_events (
  id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL,
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER,
  CONSTRAINT ncm_webhook_kind CHECK (kind IN ('delivery','comments')),
  CONSTRAINT ncm_webhook_payload_json CHECK (json_valid(payload_json)),
  CONSTRAINT ncm_webhook_attempts CHECK (attempts>=0)
);
--> statement-breakpoint
CREATE INDEX idx_ncm_webhook_pending ON ncm_webhook_events(processed_at,next_attempt_at,received_at,id);
--> statement-breakpoint
CREATE INDEX idx_ncm_webhook_received ON ncm_webhook_events(received_at);
--> statement-breakpoint
CREATE TABLE ncm_courier_notes (
  ncm_order_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  job_id TEXT NOT NULL REFERENCES shipping_jobs(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (ncm_order_id,comment_id),
  CONSTRAINT ncm_note_kind CHECK (kind IN ('Info','Action'))
);
--> statement-breakpoint
CREATE INDEX idx_ncm_note_job_created ON ncm_courier_notes(job_id,created_at);
