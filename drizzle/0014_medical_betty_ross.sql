DROP INDEX `idx_return_requests_item_unique`;--> statement-breakpoint
CREATE INDEX `idx_return_requests_item` ON `return_requests` (`order_item_id`,`requested_at`);