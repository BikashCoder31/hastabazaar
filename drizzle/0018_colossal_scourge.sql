CREATE TABLE `backup_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`note` text NOT NULL,
	`verified_by` text NOT NULL,
	`request_id` text NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_backup_verifications_request_unique` ON `backup_verifications` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_backup_verifications_verified_at` ON `backup_verifications` (`verified_at`);--> statement-breakpoint
CREATE TABLE `data_rights_events` (
	`id` text PRIMARY KEY NOT NULL,
	`data_rights_request_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`note` text NOT NULL,
	`operation_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`data_rights_request_id`) REFERENCES `data_rights_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_data_rights_events_operation_unique` ON `data_rights_events` (`operation_request_id`);--> statement-breakpoint
CREATE INDEX `idx_data_rights_events_request_created` ON `data_rights_events` (`data_rights_request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `data_rights_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`request_type` text NOT NULL,
	`detail` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`assigned_to` text,
	`resolution` text,
	`created_request_id` text NOT NULL,
	`operation_request_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_data_rights_reference_unique` ON `data_rights_requests` (`reference_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_data_rights_created_request_unique` ON `data_rights_requests` (`created_request_id`);--> statement-breakpoint
CREATE INDEX `idx_data_rights_queue` ON `data_rights_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_user_id` text NOT NULL,
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
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notification_messages_request_unique` ON `notification_messages` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_notification_messages_recipient_created` ON `notification_messages` (`recipient_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_messages_delivery_queue` ON `notification_messages` (`channel`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `operational_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_number` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`resolution` text,
	`owner_id` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operational_incidents_reference_unique` ON `operational_incidents` (`reference_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operational_incidents_request_unique` ON `operational_incidents` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_operational_incidents_status_severity` ON `operational_incidents` (`status`,`severity`);--> statement-breakpoint
CREATE TABLE `prohibited_product_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title_en` text NOT NULL,
	`title_ne` text NOT NULL,
	`description_en` text NOT NULL,
	`description_ne` text NOT NULL,
	`severity` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_prohibited_product_rules_code_unique` ON `prohibited_product_rules` (`code`);--> statement-breakpoint
CREATE INDEX `idx_prohibited_product_rules_active` ON `prohibited_product_rules` (`is_active`,`severity`);--> statement-breakpoint
CREATE TABLE `promotion_products` (
	`promotion_id` text NOT NULL,
	`product_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`promotion_id`, `product_id`),
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_promotion_products_product` ON `promotion_products` (`product_id`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_ne` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`placement` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`note` text NOT NULL,
	`created_request_id` text NOT NULL,
	`operation_request_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "promotions_window_valid" CHECK("promotions"."ends_at" > "promotions"."starts_at"),
	CONSTRAINT "promotions_maker_checker" CHECK("promotions"."approved_by" IS NULL OR "promotions"."approved_by" != "promotions"."created_by")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_promotions_created_request_unique` ON `promotions` (`created_request_id`);--> statement-breakpoint
CREATE INDEX `idx_promotions_status_window` ON `promotions` (`status`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `shipping_job_events` (
	`id` text PRIMARY KEY NOT NULL,
	`shipping_job_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`note` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`shipping_job_id`) REFERENCES `shipping_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shipping_job_events_request_unique` ON `shipping_job_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_shipping_job_events_job_created` ON `shipping_job_events` (`shipping_job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `shipping_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`carrier` text DEFAULT 'nepal_can_move_manual' NOT NULL,
	`label_reference` text,
	`tracking_code` text,
	`pickup_window_start` integer,
	`pickup_window_end` integer,
	`claim_reference` text,
	`reconciliation_status` text DEFAULT 'unreconciled' NOT NULL,
	`reconciliation_note` text,
	`created_by` text NOT NULL,
	`created_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shipping_jobs_order_seller_direction_unique` ON `shipping_jobs` (`order_id`,`seller_id`,`direction`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shipping_jobs_created_request_unique` ON `shipping_jobs` (`created_request_id`);--> statement-breakpoint
CREATE INDEX `idx_shipping_jobs_seller_status` ON `shipping_jobs` (`seller_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_shipping_jobs_reconciliation` ON `shipping_jobs` (`reconciliation_status`,`updated_at`);