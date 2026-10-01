CREATE TABLE `notification_messages_guest_new` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_user_id` text,
	`audience_role` text NOT NULL,
	`channel` text NOT NULL,
	`template_key` text NOT NULL,
	`subject_en` text NOT NULL,
	`subject_ne` text NOT NULL,
	`body_en` text NOT NULL,
	`body_ne` text NOT NULL,
	`related_type` text,
	`related_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_reference` text,
	`failure_reason` text,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`read_at` integer,
	`business_event_key` text,
	`required_permission` text,
	`delivery_attempts` integer DEFAULT 0 NOT NULL,
	`delivery_next_attempt_at` integer DEFAULT 0 NOT NULL,
	`delivery_lease_until` integer DEFAULT 0 NOT NULL,
	`delivery_claim_token` text,
	`guest_email` text,
	`guest_order_id` text,
	CHECK (recipient_user_id IS NOT NULL OR (audience_role='customer' AND channel='email' AND guest_email IS NOT NULL AND guest_order_id IS NOT NULL AND business_event_key IS NOT NULL)),
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO notification_messages_guest_new(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,provider_reference,failure_reason,request_id,created_at,sent_at,read_at,business_event_key,required_permission,delivery_attempts,delivery_next_attempt_at,delivery_lease_until,delivery_claim_token) SELECT id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,provider_reference,failure_reason,request_id,created_at,sent_at,read_at,business_event_key,required_permission,delivery_attempts,delivery_next_attempt_at,delivery_lease_until,delivery_claim_token FROM notification_messages;
--> statement-breakpoint
DROP TABLE notification_messages;
--> statement-breakpoint
ALTER TABLE notification_messages_guest_new RENAME TO notification_messages;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notification_messages_request_unique` ON `notification_messages` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_notification_messages_recipient_created` ON `notification_messages` (`recipient_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_messages_delivery_queue` ON `notification_messages` (`channel`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX idx_business_notification_queue ON notification_messages(channel,status,delivery_next_attempt_at,delivery_lease_until);
