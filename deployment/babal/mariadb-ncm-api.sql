-- Owner applied. Apply only to an approved database copy after mariadb-delivery-partners.sql.
-- Optional NCM storage starts empty. Connection credentials stay in the app environment.
CREATE TABLE IF NOT EXISTS ncm_partner_settings (
  partner_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  connection_fingerprint VARCHAR(191) COLLATE utf8mb4_nopad_bin,
  assigned_branches_json LONGTEXT NOT NULL,
  branches_json LONGTEXT NOT NULL,
  branches_checked_at BIGINT,
  refresh_started_at BIGINT,
  connected_at BIGINT,
  delivery_type VARCHAR(20) COLLATE utf8mb4_nopad_bin NOT NULL DEFAULT 'Door2Door',
  package_name LONGTEXT NOT NULL DEFAULT '',
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL,
  last_check_at BIGINT,
  check_started_at BIGINT,
  PRIMARY KEY (partner_id),
  CONSTRAINT ncm_settings_partner_fk FOREIGN KEY (partner_id) REFERENCES delivery_partners(id) ON DELETE RESTRICT,
  CONSTRAINT ncm_settings_assigned_json CHECK (JSON_VALID(assigned_branches_json) AND JSON_TYPE(assigned_branches_json)='ARRAY'),
  CONSTRAINT ncm_settings_branches_json CHECK (JSON_VALID(branches_json) AND JSON_TYPE(branches_json)='ARRAY'),
  CONSTRAINT ncm_settings_type CHECK (delivery_type IN ('Door2Door','Branch2Door','Branch2Branch','Door2Branch')),
  CONSTRAINT ncm_settings_revision CHECK (revision>=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ncm_pickup_branches (
  pickup_address_id VARCHAR(191) NOT NULL,
  partner_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  address_updated_at BIGINT NOT NULL,
  branch VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (pickup_address_id),
  KEY idx_ncm_pickup_partner (partner_id),
  CONSTRAINT ncm_pickup_address_fk FOREIGN KEY (pickup_address_id) REFERENCES seller_operational_addresses(id) ON DELETE CASCADE,
  CONSTRAINT ncm_pickup_partner_fk FOREIGN KEY (partner_id) REFERENCES delivery_partners(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ncm_bookings (
  job_id VARCHAR(191) NOT NULL,
  partner_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  vendor_reference VARCHAR(20) COLLATE utf8mb4_nopad_bin NOT NULL,
  ncm_order_id VARCHAR(191) COLLATE utf8mb4_nopad_bin,
  state VARCHAR(20) COLLATE utf8mb4_nopad_bin NOT NULL,
  request_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  started_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  response_json LONGTEXT,
  label_json LONGTEXT,
  cod_reported_paisa BIGINT,
  delivery_charge_paisa BIGINT,
  return_charge_paisa BIGINT,
  last_status LONGTEXT,
  PRIMARY KEY (job_id),
  UNIQUE KEY idx_ncm_booking_reference (vendor_reference),
  UNIQUE KEY idx_ncm_booking_order (ncm_order_id),
  UNIQUE KEY idx_ncm_booking_request (request_id),
  KEY idx_ncm_booking_partner_state (partner_id,state,job_id),
  KEY idx_ncm_booking_actor (actor_id),
  CONSTRAINT ncm_booking_job_fk FOREIGN KEY (job_id) REFERENCES shipping_jobs(id) ON DELETE RESTRICT,
  CONSTRAINT ncm_booking_partner_fk FOREIGN KEY (partner_id) REFERENCES delivery_partners(id) ON DELETE RESTRICT,
  CONSTRAINT ncm_booking_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT ncm_booking_reference CHECK (CHAR_LENGTH(vendor_reference) BETWEEN 1 AND 20),
  CONSTRAINT ncm_booking_state CHECK (state IN ('booking','needs_review','rejected','booked')),
  CONSTRAINT ncm_booking_response_json CHECK (response_json IS NULL OR JSON_VALID(response_json)),
  CONSTRAINT ncm_booking_label_json CHECK (label_json IS NULL OR JSON_VALID(label_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ncm_api_daily_usage (
  usage_day VARCHAR(10) COLLATE utf8mb4_nopad_bin NOT NULL,
  bucket VARCHAR(10) COLLATE utf8mb4_nopad_bin NOT NULL,
  used BIGINT NOT NULL,
  PRIMARY KEY (usage_day,bucket),
  CONSTRAINT ncm_usage_day CHECK (usage_day REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT ncm_usage_bucket CHECK (bucket IN ('create','view')),
  CONSTRAINT ncm_usage_nonnegative CHECK (used>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ncm_webhook_events (
  id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  kind VARCHAR(20) COLLATE utf8mb4_nopad_bin NOT NULL,
  event LONGTEXT NOT NULL,
  payload_json LONGTEXT NOT NULL,
  received_at BIGINT NOT NULL,
  processed_at BIGINT,
  attempts BIGINT NOT NULL DEFAULT 0,
  next_attempt_at BIGINT NOT NULL DEFAULT 0,
  claimed_at BIGINT,
  PRIMARY KEY (id),
  KEY idx_ncm_webhook_pending (processed_at,next_attempt_at,received_at,id),
  KEY idx_ncm_webhook_received (received_at),
  CONSTRAINT ncm_webhook_kind CHECK (kind IN ('delivery','comments')),
  CONSTRAINT ncm_webhook_payload_json CHECK (JSON_VALID(payload_json)),
  CONSTRAINT ncm_webhook_attempts CHECK (attempts>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ncm_courier_notes (
  ncm_order_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  comment_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  job_id VARCHAR(191) NOT NULL,
  kind VARCHAR(10) COLLATE utf8mb4_nopad_bin NOT NULL,
  `comment` LONGTEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (ncm_order_id,comment_id),
  KEY idx_ncm_note_job_created (job_id,created_at),
  CONSTRAINT ncm_note_job_fk FOREIGN KEY (job_id) REFERENCES shipping_jobs(id) ON DELETE RESTRICT,
  CONSTRAINT ncm_note_kind CHECK (kind IN ('Info','Action'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
