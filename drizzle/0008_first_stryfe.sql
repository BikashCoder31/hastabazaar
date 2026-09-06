CREATE INDEX `idx_products_seller_updated` ON `products` (`seller_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_products_review_queue` ON `products` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_products_public_recent` ON `products` (`status`,`published_at`);