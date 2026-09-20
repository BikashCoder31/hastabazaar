-- Additive purchaser, recipient, and saved-address checkout snapshots.
ALTER TABLE `orders`
  ADD COLUMN `delivery_for` VARCHAR(16) NOT NULL DEFAULT 'self',
  ADD COLUMN `recipient_email` VARCHAR(254) NULL,
  ADD COLUMN `source_address_id` VARCHAR(191) NULL,
  ADD COLUMN `address_saved_for_future` BIGINT NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS `invalidate_delivery_otp_after_destination_change`;
CREATE TRIGGER `invalidate_delivery_otp_after_destination_change`
AFTER UPDATE ON `orders` FOR EACH ROW
DELETE FROM `rider_otp_challenges`
WHERE (NOT (OLD.`shipping_address_json` <=> NEW.`shipping_address_json`)
  OR NOT (OLD.`delivery_for` <=> NEW.`delivery_for`)
  OR NOT (OLD.`recipient_email` <=> NEW.`recipient_email`))
  AND `shipping_job_id` IN (SELECT `id` FROM `shipping_jobs` WHERE `order_id` = NEW.`id`);
