CREATE TABLE order_delivery_allocations (
 order_item_id TEXT PRIMARY KEY REFERENCES order_items(id),
 order_id TEXT NOT NULL REFERENCES orders(id),
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0),
 original_quantity INTEGER NOT NULL CHECK(original_quantity>0),
 policy_version TEXT NOT NULL CHECK(policy_version='original_seller_item_largest_remainder_v1'),
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX order_delivery_allocations_order_idx ON order_delivery_allocations(order_id);
--> statement-breakpoint
CREATE TRIGGER order_delivery_allocation_no_update BEFORE UPDATE ON order_delivery_allocations
 BEGIN SELECT RAISE(ABORT,'Original delivery allocation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_delivery_allocation_no_delete BEFORE DELETE ON order_delivery_allocations
 BEGIN SELECT RAISE(ABORT,'Original delivery allocation is immutable'); END;
