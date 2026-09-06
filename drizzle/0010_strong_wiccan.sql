CREATE TABLE `order_item_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`note` text NOT NULL,
	`actor_id` text,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_order_item_status_events_item_created` ON `order_item_status_events` (`order_item_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_item_status_events_request_item_unique` ON `order_item_status_events` (`request_id`,`order_item_id`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `fulfillment_status` text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `fulfillment_request_id` text;--> statement-breakpoint
CREATE INDEX `idx_order_items_seller_order` ON `order_items` (`seller_id`,`order_id`);