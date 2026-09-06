CREATE TABLE `order_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`note` text NOT NULL,
	`actor_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_order_status_events_order_created` ON `order_status_events` (`order_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `receipt_token_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_receipt_token_unique` ON `orders` (`receipt_token_hash`);
--> statement-breakpoint
CREATE TRIGGER `order_items_require_available_inventory`
BEFORE INSERT ON `order_items`
FOR EACH ROW
BEGIN
	SELECT CASE
		WHEN NEW.product_id IS NULL OR NOT EXISTS (
			SELECT 1 FROM products
			WHERE id = NEW.product_id
				AND status = 'published'
				AND inventory_quantity >= NEW.quantity
		)
		THEN RAISE(ABORT, 'product_unavailable')
	END;
END;
--> statement-breakpoint
CREATE TRIGGER `order_items_reserve_inventory`
AFTER INSERT ON `order_items`
FOR EACH ROW
BEGIN
	UPDATE products
	SET inventory_quantity = inventory_quantity - NEW.quantity,
		updated_at = CAST(strftime('%s', 'now') AS integer) * 1000
	WHERE id = NEW.product_id;
END;
