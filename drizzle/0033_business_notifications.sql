-- Extend the existing notification_messages outbox; legacy rows remain unmarked.
ALTER TABLE notification_messages ADD COLUMN business_event_key TEXT;
ALTER TABLE notification_messages ADD COLUMN required_permission TEXT;
ALTER TABLE notification_messages ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN delivery_next_attempt_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN delivery_lease_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN delivery_claim_token TEXT;
CREATE INDEX IF NOT EXISTS idx_business_notification_queue ON notification_messages(channel,status,delivery_next_attempt_at,delivery_lease_until);
