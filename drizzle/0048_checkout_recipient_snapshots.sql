ALTER TABLE orders ADD COLUMN delivery_for TEXT NOT NULL DEFAULT 'self' CHECK (delivery_for IN ('self','other'));
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN recipient_email TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN source_address_id TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN address_saved_for_future INTEGER NOT NULL DEFAULT 0 CHECK (address_saved_for_future IN (0,1));
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS invalidate_delivery_otp_after_destination_change
AFTER UPDATE OF shipping_address_json, recipient_email, delivery_for ON orders
WHEN OLD.shipping_address_json <> NEW.shipping_address_json
  OR OLD.delivery_for <> NEW.delivery_for
  OR OLD.recipient_email IS NOT NEW.recipient_email
BEGIN
  DELETE FROM rider_otp_challenges
  WHERE shipping_job_id IN (SELECT id FROM shipping_jobs WHERE order_id = NEW.id);
END;
