-- Owner applied. Apply only to an approved database copy. Starts without partner rows.
CREATE TABLE IF NOT EXISTS delivery_partners (
  id VARCHAR(191) COLLATE utf8mb4_nopad_bin NOT NULL,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) COLLATE utf8mb4_nopad_bin NOT NULL,
  booking_mode VARCHAR(20) COLLATE utf8mb4_nopad_bin NOT NULL DEFAULT 'manual',
  collects_cod TINYINT NOT NULL,
  tracking_pattern VARCHAR(500),
  default_slot TINYINT,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_delivery_partners_name (name),
  UNIQUE KEY idx_delivery_partners_default (default_slot),
  CONSTRAINT delivery_partner_name CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 2 AND 120),
  CONSTRAINT delivery_partner_status CHECK (status IN ('in_use','setting_up','not_in_use')),
  CONSTRAINT delivery_partner_mode CHECK (booking_mode IN ('manual','api')),
  CONSTRAINT delivery_partner_collects_cod CHECK (collects_cod IN (0,1)),
  CONSTRAINT delivery_partner_revision CHECK (revision>=1),
  CONSTRAINT delivery_partner_default CHECK (default_slot IS NULL OR (default_slot=1 AND status='in_use' AND booking_mode='manual'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE shipping_parcels
  ADD COLUMN delivery_partner_id VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL,
  ADD INDEX idx_shipping_parcels_delivery_partner (delivery_partner_id),
  ADD CONSTRAINT shipping_parcels_delivery_partner_fk FOREIGN KEY (delivery_partner_id)
    REFERENCES delivery_partners(id) ON DELETE RESTRICT;
