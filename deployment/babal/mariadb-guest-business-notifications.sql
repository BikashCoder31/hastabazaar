-- Data-preserving extension of the existing notification outbox. Existing user FK and indexes remain.
ALTER TABLE notification_messages MODIFY COLUMN recipient_user_id VARCHAR(191) NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS guest_email VARCHAR(320) NULL;
ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS guest_order_id VARCHAR(191) NULL;
ALTER TABLE notification_messages ADD CONSTRAINT IF NOT EXISTS chk_notification_guest_shape CHECK (recipient_user_id IS NOT NULL OR (audience_role='customer' AND channel='email' AND guest_email IS NOT NULL AND guest_order_id IS NOT NULL AND business_event_key IS NOT NULL));
