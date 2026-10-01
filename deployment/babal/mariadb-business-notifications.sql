-- Extend the existing notification_messages outbox; legacy rows remain unmarked.
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS business_event_key TEXT;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS required_permission TEXT;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_attempts BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_next_attempt_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_lease_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS delivery_claim_token TEXT;
CREATE INDEX IF NOT EXISTS idx_business_notification_queue ON notification_messages(channel,status,delivery_next_attempt_at,delivery_lease_until);
