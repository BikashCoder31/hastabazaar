CREATE TABLE `inventory_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`previous_quantity` integer NOT NULL,
	`next_quantity` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_adjustments_quantities_non_negative" CHECK("inventory_adjustments"."previous_quantity" >= 0 AND "inventory_adjustments"."next_quantity" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_adjustments_product_created` ON `inventory_adjustments` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_inventory_adjustments_seller_created` ON `inventory_adjustments` (`seller_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `product_media` ADD `original_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_media` ADD `mime_type` text DEFAULT 'image/jpeg' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_media` ADD `size_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `review_request_id` text;