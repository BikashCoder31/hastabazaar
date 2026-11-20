-- Source-only parity for 0100. Never execute against canonical or live data without cutover authorization.
ALTER TABLE order_cancellation_reviews ADD COLUMN revision BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN owner_id VARCHAR(191), ADD COLUMN backup_id VARCHAR(191),
 ADD COLUMN first_action_at BIGINT, ADD COLUMN first_due_at BIGINT, ADD COLUMN next_update_at BIGINT,
 ADD COLUMN original_facts_json LONGTEXT CHECK(original_facts_json IS NULL OR JSON_VALID(original_facts_json)),
 ADD CONSTRAINT fk_cancellation_review_owner FOREIGN KEY(owner_id) REFERENCES users(id),
 ADD CONSTRAINT fk_cancellation_review_backup FOREIGN KEY(backup_id) REFERENCES users(id);
DELIMITER //
CREATE TRIGGER cancellation_request_first_due BEFORE INSERT ON order_cancellation_reviews FOR EACH ROW
BEGIN SET NEW.first_due_at=NEW.created_at+7200000; END//
CREATE TRIGGER cancellation_request_scoped_hold AFTER INSERT ON order_cancellation_reviews FOR EACH ROW
BEGIN
 INSERT INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT REPLACE(UUID(),'-',''),i.id,'cancellation','cancellation_review',NEW.id,NEW.requested_by,NEW.owner_id,1,1,NEW.created_at,NEW.created_at+7200000
 FROM order_items i WHERE i.order_id=NEW.order_id AND JSON_CONTAINS(NEW.seller_ids_json,JSON_QUOTE(i.seller_id))=1
 AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup') AND NOT EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=i.order_id AND j.seller_id=i.seller_id AND j.direction='outbound' AND j.status NOT IN('pickup_requested','label_pending','label_ready','pickup_scheduled','cancelled'));
END//
CREATE TRIGGER cancellation_decision_releases_own_hold AFTER UPDATE ON order_cancellation_reviews FOR EACH ROW
BEGIN IF OLD.status='pending' AND NEW.status IN('approved','rejected') THEN
 UPDATE order_fulfillment_holds SET ended_at=CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED),ended_by=NEW.reviewed_by,release_reason=NEW.review_note,revision=revision+1 WHERE source_type='cancellation_review' AND source_id=NEW.id AND ended_at IS NULL;
END IF; END//
CREATE TRIGGER cancellation_scope_facts_retained BEFORE UPDATE ON order_cancellation_reviews FOR EACH ROW
BEGIN IF NOT (NEW.original_facts_json <=> OLD.original_facts_json) OR (OLD.first_due_at IS NOT NULL AND NOT (NEW.first_due_at <=> OLD.first_due_at)) OR (OLD.first_action_at IS NOT NULL AND NOT (NEW.first_action_at <=> OLD.first_action_at)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='cancellation_original_facts_immutable'; END IF; END//
DELIMITER ;
