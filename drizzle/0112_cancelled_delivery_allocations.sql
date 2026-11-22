CREATE TABLE order_delivery_adjustments(
 event_id TEXT NOT NULL REFERENCES order_cancellation_events(id),order_item_id TEXT NOT NULL REFERENCES order_items(id),order_id TEXT NOT NULL REFERENCES orders(id),seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0),original_quantity INTEGER NOT NULL CHECK(original_quantity>0),policy_version TEXT NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,order_item_id)
);
--> statement-breakpoint
CREATE TRIGGER delivery_adjustment_original_event BEFORE INSERT ON order_delivery_adjustments WHEN NOT EXISTS(SELECT 1 FROM order_cancellation_events e JOIN order_items i ON i.order_id=e.order_id WHERE e.id=NEW.event_id AND e.order_id=NEW.order_id AND i.id=NEW.order_item_id AND i.seller_id=NEW.seller_id AND i.quantity=NEW.original_quantity AND i.fulfillment_status<>'cancelled' AND e.created_at=NEW.created_at) BEGIN SELECT RAISE(ABORT,'delivery_adjustment_original_event_required'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_adjustment_no_update BEFORE UPDATE ON order_delivery_adjustments BEGIN SELECT RAISE(ABORT,'delivery_adjustment_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_adjustment_no_delete BEFORE DELETE ON order_delivery_adjustments BEGIN SELECT RAISE(ABORT,'delivery_adjustment_history_retained'); END;
