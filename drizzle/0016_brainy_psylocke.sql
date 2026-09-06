CREATE TABLE `payout_events` (
	`id` text PRIMARY KEY NOT NULL,
	`payout_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`note` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payout_id`) REFERENCES `payouts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_payout_events_payout_created` ON `payout_events` (`payout_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payout_events_request_unique` ON `payout_events` (`request_id`);--> statement-breakpoint
DROP INDEX `idx_payout_entries_ledger_unique`;--> statement-breakpoint
ALTER TABLE `payout_entries` ADD `released_at` integer;--> statement-breakpoint
ALTER TABLE `payout_entries` ADD `release_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payout_entries_active_ledger_unique` ON `payout_entries` (`ledger_entry_id`) WHERE "payout_entries"."released_at" IS NULL;--> statement-breakpoint
ALTER TABLE `payouts` ADD `processed_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `payouts` ADD `note` text;--> statement-breakpoint
ALTER TABLE `payouts` ADD `period_start` integer;--> statement-breakpoint
ALTER TABLE `payouts` ADD `period_end` integer;--> statement-breakpoint
ALTER TABLE `payouts` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `payouts` ADD `processed_at` integer;--> statement-breakpoint
ALTER TABLE `payouts` ADD `failed_at` integer;--> statement-breakpoint
ALTER TABLE `payouts` ADD `failure_reason` text;--> statement-breakpoint
ALTER TABLE `payouts` ADD `created_request_id` text;--> statement-breakpoint
ALTER TABLE `payouts` ADD `operation_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payouts_created_request_unique` ON `payouts` (`created_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payouts_status_scheduled` ON `payouts` (`status`,`scheduled_for`);--> statement-breakpoint
ALTER TABLE `seller_ledger_entries` ADD `payout_id` text REFERENCES payouts(id);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seller_ledger_payout_unique` ON `seller_ledger_entries` (`payout_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seller_ledger_order_item_type_unique` ON `seller_ledger_entries` (`order_item_id`,`type`) WHERE "seller_ledger_entries"."order_item_id" IS NOT NULL AND "seller_ledger_entries"."type" IN ('sale', 'commission', 'reserve_hold', 'reserve_release');