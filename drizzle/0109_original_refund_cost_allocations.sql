CREATE TABLE refund_cost_allocations(
 refund_id TEXT NOT NULL REFERENCES refunds(id),component TEXT NOT NULL CHECK(component IN('merchandise','original_delivery')),
 party TEXT NOT NULL,seller_id TEXT REFERENCES seller_profiles(id),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
 policy_version TEXT NOT NULL CHECK(policy_version='approved_original_refund_costs_v1'),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,
 PRIMARY KEY(refund_id,component),CHECK((party='seller' AND seller_id IS NOT NULL) OR (party<>'seller' AND seller_id IS NULL))
);
--> statement-breakpoint
CREATE TRIGGER refund_cost_original_capacity BEFORE INSERT ON refund_cost_allocations WHEN NOT EXISTS(
 SELECT 1 FROM refunds r JOIN return_requests c ON c.id=r.return_request_id JOIN order_items i ON i.id=c.order_item_id WHERE r.id=NEW.refund_id
 AND NEW.amount_paisa=CASE WHEN NEW.component='merchandise' THEN r.item_amount_paisa ELSE r.delivery_amount_paisa END
 AND NEW.party=CASE WHEN NEW.component='original_delivery' AND c.reason='change_of_mind' THEN 'platform' ELSE r.liability END
 AND (NEW.party<>'seller' OR NEW.seller_id=i.seller_id))
 BEGIN SELECT RAISE(ABORT,'refund_cost_requires_original_authorization'); END;
--> statement-breakpoint
CREATE TRIGGER refund_cost_no_update BEFORE UPDATE ON refund_cost_allocations BEGIN SELECT RAISE(ABORT,'original_refund_cost_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_cost_no_delete BEFORE DELETE ON refund_cost_allocations BEGIN SELECT RAISE(ABORT,'original_refund_cost_retained'); END;
