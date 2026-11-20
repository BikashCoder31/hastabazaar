-- Derived exclusively from existing SQLite 0033 and 0035; no new SQLite migration.
-- 0033 SHA256 87f1f28e308e288ae356051dcb4f87cd7457c0fdddb7229c4baa4ba5add9823c
-- 0035 SHA256 edca5c83b959ab533e1293e24d582ae64d23c4deeaa899e81eaf87c1560e4fee
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS business_event_key LONGTEXT NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS required_permission LONGTEXT NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_attempts BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_next_attempt_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_lease_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_claim_token LONGTEXT NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS guest_email LONGTEXT NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS guest_order_id LONGTEXT NULL;
ALTER TABLE notification_messages MODIFY COLUMN recipient_user_id VARCHAR(191) NULL;
CREATE INDEX IF NOT EXISTS idx_business_notification_queue ON notification_messages(channel,status,delivery_next_attempt_at,delivery_lease_until);
DELIMITER $$
CREATE OR REPLACE TRIGGER notification_recipient_shape_insert BEFORE INSERT ON notification_messages FOR EACH ROW BEGIN IF NOT (NEW.recipient_user_id IS NOT NULL OR (BINARY NEW.audience_role=BINARY 'customer' AND BINARY NEW.channel=BINARY 'email' AND NEW.guest_email IS NOT NULL AND NEW.guest_order_id IS NOT NULL AND NEW.business_event_key IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='notification_recipient_shape'; END IF; END$$
DELIMITER ;
DELIMITER $$
CREATE OR REPLACE TRIGGER notification_recipient_shape_update BEFORE UPDATE ON notification_messages FOR EACH ROW BEGIN IF NOT (NEW.recipient_user_id IS NOT NULL OR (BINARY NEW.audience_role=BINARY 'customer' AND BINARY NEW.channel=BINARY 'email' AND NEW.guest_email IS NOT NULL AND NEW.guest_order_id IS NOT NULL AND NEW.business_event_key IS NOT NULL)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='notification_recipient_shape'; END IF; END$$
DELIMITER ;
