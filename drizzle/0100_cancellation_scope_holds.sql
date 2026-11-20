-- Source only. Existing canonical data must not be migrated to pass local startup.
ALTER TABLE order_cancellation_reviews ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE order_cancellation_reviews ADD COLUMN owner_id TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE order_cancellation_reviews ADD COLUMN backup_id TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE order_cancellation_reviews ADD COLUMN first_action_at INTEGER;
--> statement-breakpoint
ALTER TABLE order_cancellation_reviews ADD COLUMN first_due_at INTEGER;
--> statement-breakpoint
ALTER TABLE order_cancellation_reviews ADD COLUMN next_update_at INTEGER;
--> statement-breakpoint
ALTER TABLE order_cancellation_reviews ADD COLUMN original_facts_json TEXT CHECK(original_facts_json IS NULL OR json_valid(original_facts_json));
--> statement-breakpoint
CREATE TRIGGER cancellation_request_scoped_hold AFTER INSERT ON order_cancellation_reviews
 BEGIN
 UPDATE order_cancellation_reviews SET first_due_at=NEW.created_at+7200000 WHERE id=NEW.id;
 INSERT INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT lower(hex(randomblob(16))),i.id,'cancellation','cancellation_review',NEW.id,NEW.requested_by,NEW.owner_id,1,1,NEW.created_at,NEW.created_at+7200000
 FROM order_items i WHERE i.order_id=NEW.order_id AND i.seller_id IN(SELECT value FROM json_each(NEW.seller_ids_json))
 AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup') AND NOT EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=i.order_id AND j.seller_id=i.seller_id AND j.direction='outbound' AND j.status NOT IN('pickup_requested','label_pending','label_ready','pickup_scheduled','cancelled'));
 END;
--> statement-breakpoint
CREATE TRIGGER cancellation_decision_releases_own_hold AFTER UPDATE OF status ON order_cancellation_reviews
 WHEN OLD.status='pending' AND NEW.status IN('approved','rejected')
 BEGIN UPDATE order_fulfillment_holds SET ended_at=CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER),ended_by=NEW.reviewed_by,release_reason=NEW.review_note,revision=revision+1 WHERE source_type='cancellation_review' AND source_id=NEW.id AND ended_at IS NULL; END;

--> statement-breakpoint
CREATE TRIGGER cancellation_scope_facts_retained BEFORE UPDATE ON order_cancellation_reviews
 WHEN NEW.original_facts_json IS NOT OLD.original_facts_json OR (OLD.first_due_at IS NOT NULL AND NEW.first_due_at IS NOT OLD.first_due_at) OR (OLD.first_action_at IS NOT NULL AND NEW.first_action_at IS NOT OLD.first_action_at)
 BEGIN SELECT RAISE(ABORT,'cancellation_original_facts_immutable'); END;
