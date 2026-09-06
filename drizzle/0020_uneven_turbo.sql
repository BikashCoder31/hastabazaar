CREATE TABLE `order_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`document_number` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`request_id` text NOT NULL,
	`issued_at` integer NOT NULL,
	`voided_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_documents_number_unique` ON `order_documents` (`document_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_documents_request_unique` ON `order_documents` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_documents_order_kind_unique` ON `order_documents` (`order_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_order_documents_order_issued` ON `order_documents` (`order_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `order_policy_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`terms_snapshot_json` text NOT NULL,
	`acceptance_method` text NOT NULL,
	`actor_user_id` text,
	`request_id` text NOT NULL,
	`accepted_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_policy_acceptances_order_unique` ON `order_policy_acceptances` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_policy_acceptances_request_unique` ON `order_policy_acceptances` (`request_id`);--> statement-breakpoint
CREATE TABLE `request_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_request_rate_limits_expiry` ON `request_rate_limits` (`expires_at`);--> statement-breakpoint
ALTER TABLE `products` ADD `return_conditions` text;--> statement-breakpoint
ALTER TABLE `products` ADD `made_to_order` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `preparation_days` integer DEFAULT 2 NOT NULL;