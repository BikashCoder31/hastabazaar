CREATE TABLE `review_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `product_reviews`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_photos_object_key_unique` ON `review_photos` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_review_photo_slot` ON `review_photos` (`review_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `review_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`body` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`moderated_by` text,
	`moderation_note` text,
	FOREIGN KEY (`review_id`) REFERENCES `product_reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller_id`) REFERENCES `seller_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`moderated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_review_reply_version` ON `review_replies` (`review_id`,`version`);