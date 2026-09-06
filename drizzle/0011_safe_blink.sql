ALTER TABLE `order_status_events` ADD `request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_status_events_request_unique` ON `order_status_events` (`request_id`);