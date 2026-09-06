CREATE TABLE `occasions` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ne` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_occasions_slug_unique` ON `occasions` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_occasions_active_sort` ON `occasions` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `product_occasions` (
	`product_id` text NOT NULL,
	`occasion_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`product_id`, `occasion_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`occasion_id`) REFERENCES `occasions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_product_occasions_occasion_product` ON `product_occasions` (`occasion_id`,`product_id`);
