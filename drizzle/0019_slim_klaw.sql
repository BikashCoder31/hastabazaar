CREATE TABLE `payout_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`seller_note` text NOT NULL,
	`available_amount_snapshot_paisa` integer NOT NULL,
	`payout_id` text,
	`processed_by` text,
	`processing_note` text,
	`created_request_id` text NOT NULL,
	`operation_request_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payout_id`) REFERENCES `payouts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payout_requests_created_unique` ON `payout_requests` (`created_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payout_requests_seller_status` ON `payout_requests` (`seller_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_payout_requests_queue` ON `payout_requests` (`status`,`created_at`);