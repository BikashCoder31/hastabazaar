-- Source parity for 0099. Isolated fixtures only; canonical/live execution requires later authorization.

CREATE TABLE order_response_portions(
 id VARCHAR(191) NOT NULL,
 order_id VARCHAR(191) NOT NULL,
 seller_id VARCHAR(191) NOT NULL,
 operator_mode VARCHAR(191) NOT NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY(id),
 FOREIGN KEY(seller_id) REFERENCES seller_profiles(id),
 FOREIGN KEY(order_id) REFERENCES orders(id),
 UNIQUE(order_id,seller_id,operator_mode),
 CHECK(operator_mode IN('seller','company'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_cases(
 id VARCHAR(191) NOT NULL,
 portion_id VARCHAR(191) NOT NULL,
 source_key VARCHAR(191) NOT NULL,
 kind VARCHAR(191) NOT NULL,
 state VARCHAR(191) NOT NULL DEFAULT 'open',
 scope_json LONGTEXT NOT NULL,
 private_detail LONGTEXT NOT NULL,
 public_message LONGTEXT,
 proposed_ready_at BIGINT,
 owner_id VARCHAR(191),
 backup_id VARCHAR(191),
 reported_by VARCHAR(191),
 created_at BIGINT NOT NULL,
 first_action_at BIGINT,
 first_due_at BIGINT NOT NULL,
 next_update_at BIGINT,
 commitment_missing BIGINT NOT NULL DEFAULT 1,
 revision BIGINT NOT NULL DEFAULT 0,
 last_event_id VARCHAR(191) NOT NULL,
 PRIMARY KEY(id),
 FOREIGN KEY(reported_by) REFERENCES users(id),
 FOREIGN KEY(backup_id) REFERENCES users(id),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 FOREIGN KEY(portion_id) REFERENCES order_response_portions(id),
 UNIQUE(source_key),
 CHECK(kind IN('no_response','delay','cannot_fulfill','hold','promise_missed')),
 CHECK(state IN('open','waiting','resolved')),
 CHECK(json_valid(scope_json)),
 CHECK(commitment_missing IN(0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_items(
 order_item_id VARCHAR(191) NOT NULL,
 portion_id VARCHAR(191) NOT NULL,
 released_at BIGINT NOT NULL,
 progress_at BIGINT,
 exception_case_id VARCHAR(191),
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(order_item_id),
 FOREIGN KEY(exception_case_id) REFERENCES order_response_cases(id),
 FOREIGN KEY(portion_id) REFERENCES order_response_portions(id),
 FOREIGN KEY(order_item_id) REFERENCES order_items(id),
 CHECK(released_at>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_fulfillment_holds(
 id VARCHAR(191) NOT NULL,
 order_item_id VARCHAR(191) NOT NULL,
 reason VARCHAR(191) NOT NULL,
 source_type VARCHAR(191) NOT NULL,
 source_id VARCHAR(191) NOT NULL,
 imposed_by VARCHAR(191),
 owner_id VARCHAR(191),
 prevents_preparation BIGINT NOT NULL,
 prevents_handoff BIGINT NOT NULL,
 started_at BIGINT NOT NULL,
 review_due_at BIGINT NOT NULL,
 ended_at BIGINT,
 ended_by VARCHAR(191),
 release_reason LONGTEXT,
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(id),
 FOREIGN KEY(ended_by) REFERENCES users(id),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 FOREIGN KEY(imposed_by) REFERENCES users(id),
 FOREIGN KEY(order_item_id) REFERENCES order_items(id),
 CHECK(reason IN('cancellation','customer_clarification','payment_dispute','address_cod','safety','identity','ownership','carrier')),
 CHECK(prevents_preparation IN(0,1)),
 CHECK(prevents_handoff IN(0,1)),
 CHECK(ended_at IS NULL OR ended_at>=started_at),
 CHECK(prevents_preparation=1 OR prevents_handoff=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_events(
 id VARCHAR(191) NOT NULL,
 portion_id VARCHAR(191),
 case_id VARCHAR(191),
 order_id VARCHAR(191) NOT NULL,
 kind VARCHAR(191) NOT NULL,
 scope_json LONGTEXT NOT NULL,
 source_key VARCHAR(191) NOT NULL,
 actor_id VARCHAR(191),
 note LONGTEXT NOT NULL,
 created_at BIGINT NOT NULL,
 case_state VARCHAR(191),
 case_revision BIGINT,
 due_at BIGINT,
 expires_at BIGINT,
 PRIMARY KEY(id),
 FOREIGN KEY(actor_id) REFERENCES users(id),
 FOREIGN KEY(order_id) REFERENCES orders(id),
 FOREIGN KEY(case_id) REFERENCES order_response_cases(id),
 FOREIGN KEY(portion_id) REFERENCES order_response_portions(id),
 UNIQUE(source_key),
 CHECK(kind IN('released','reminder','escalation','checkpoint','delay','followup','customer_update')),
 CHECK(json_valid(scope_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_milestones(
 order_item_id VARCHAR(191) NOT NULL,
 milestone VARCHAR(191) NOT NULL,
 event_id VARCHAR(191) NOT NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY(order_item_id,milestone),
 FOREIGN KEY(event_id) REFERENCES order_response_events(id),
 FOREIGN KEY(order_item_id) REFERENCES order_response_items(order_item_id),
 CHECK(milestone IN('released','reminder','escalation','checkpoint'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_response_customer_state(
 order_id VARCHAR(191) NOT NULL,
 current_event_id VARCHAR(191) NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(order_id),
 FOREIGN KEY(current_event_id) REFERENCES order_response_events(id),
 FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX order_response_open_cases ON order_response_cases(state,first_due_at,next_update_at);

CREATE INDEX order_fulfillment_active_holds ON order_fulfillment_holds(order_item_id,ended_at);

DELIMITER //
CREATE TRIGGER order_response_release_retained BEFORE UPDATE ON order_response_items FOR EACH ROW
BEGIN
 IF NEW.order_item_id<>OLD.order_item_id OR NEW.portion_id<>OLD.portion_id OR NEW.released_at<>OLD.released_at OR (OLD.progress_at IS NOT NULL AND NOT(NEW.progress_at<=>OLD.progress_at)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_response_release_immutable';
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_response_events_immutable BEFORE UPDATE ON order_response_events FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_response_history_immutable';
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_response_events_retained BEFORE DELETE ON order_response_events FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_response_history_retained';
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_response_item_progress AFTER UPDATE ON order_items FOR EACH ROW
BEGIN
 IF (NOT(NEW.fulfillment_status<=>OLD.fulfillment_status)) AND (NEW.fulfillment_status<>OLD.fulfillment_status AND NEW.fulfillment_status IN('packing','ready_for_pickup','dispatched','delivered','cancelled')) THEN
 UPDATE order_response_items SET progress_at=COALESCE(progress_at,CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)),revision=revision+1 WHERE order_item_id=NEW.id;
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_preparation_hold_guard BEFORE UPDATE ON order_items FOR EACH ROW
BEGIN
 IF (NOT(NEW.fulfillment_status<=>OLD.fulfillment_status)) AND (NEW.fulfillment_status<>OLD.fulfillment_status AND EXISTS(SELECT 1 FROM order_fulfillment_holds h WHERE h.order_item_id=NEW.id AND h.ended_at IS NULL AND ((NEW.fulfillment_status IN('packing','ready_for_pickup') AND h.prevents_preparation=1) OR (NEW.fulfillment_status='dispatched' AND h.prevents_handoff=1)))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_fulfillment_scope_is_held';
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_handoff_hold_guard BEFORE UPDATE ON shipping_jobs FOR EACH ROW
BEGIN
 IF (NOT(NEW.status<=>OLD.status)) AND (NEW.direction='outbound' AND NEW.status='dispatched' AND OLD.status NOT IN('dispatched','delivered') AND EXISTS(SELECT 1 FROM order_items i JOIN order_fulfillment_holds h ON h.order_item_id=i.id WHERE i.order_id=NEW.order_id AND i.seller_id=NEW.seller_id AND i.fulfillment_status<>'cancelled' AND h.ended_at IS NULL AND h.prevents_handoff=1)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_handoff_scope_is_held';
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_hold_history_retained BEFORE DELETE ON order_fulfillment_holds FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_hold_history_retained';
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER order_hold_scope_immutable BEFORE UPDATE ON order_fulfillment_holds FOR EACH ROW
BEGIN
 IF NEW.order_item_id<>OLD.order_item_id OR NEW.reason<>OLD.reason OR NEW.source_type<>OLD.source_type OR NEW.source_id<>OLD.source_id OR NEW.started_at<>OLD.started_at OR NEW.prevents_preparation<>OLD.prevents_preparation OR NEW.prevents_handoff<>OLD.prevents_handoff OR (OLD.ended_at IS NOT NULL AND (NOT(NEW.ended_at<=>OLD.ended_at) OR NOT(NEW.ended_by<=>OLD.ended_by) OR NOT(NEW.release_reason<=>OLD.release_reason))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='order_hold_history_immutable';
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER payment_correction_preparation_hold AFTER INSERT ON manual_payment_exceptions FOR EACH ROW
BEGIN
 IF NEW.kind='receipt_reversal' AND NEW.order_id IS NOT NULL THEN
 INSERT IGNORE INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT CONCAT(NEW.last_event_id,':',i.id),i.id,'payment_dispute','payment_exception',NEW.id,NULL,NEW.owner_id,1,1,NEW.created_at,NEW.next_update_at FROM order_items i WHERE i.order_id=NEW.order_id AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup');
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER payment_correction_preparation_reopened AFTER UPDATE ON manual_payment_exceptions FOR EACH ROW
BEGIN
 IF (NOT(NEW.state<=>OLD.state)) AND (OLD.state='resolved' AND NEW.state<>'resolved' AND NEW.kind='receipt_reversal' AND NEW.order_id IS NOT NULL) THEN
 INSERT IGNORE INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT CONCAT(NEW.last_event_id,':',i.id),i.id,'payment_dispute','payment_exception',NEW.id,NULL,NEW.owner_id,1,1,NEW.created_at,NEW.next_update_at FROM order_items i WHERE i.order_id=NEW.order_id AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup');
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER payment_correction_hold_resolved AFTER UPDATE ON manual_payment_exceptions FOR EACH ROW
BEGIN
 IF (NOT(NEW.state<=>OLD.state)) AND (NEW.state='resolved' AND OLD.state<>'resolved') THEN
 UPDATE order_fulfillment_holds SET ended_at=CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED),release_reason='The exact Finance correction case was resolved.',revision=revision+1 WHERE source_type='payment_exception' AND source_id=NEW.id AND ended_at IS NULL;
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER response_hold_insert_revision AFTER INSERT ON order_fulfillment_holds FOR EACH ROW
BEGIN
 UPDATE order_response_items SET revision=revision+1 WHERE order_item_id=NEW.order_item_id;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER response_hold_end_revision AFTER UPDATE ON order_fulfillment_holds FOR EACH ROW
BEGIN
 IF (NOT(NEW.ended_at<=>OLD.ended_at)) AND (NOT(NEW.ended_at<=>OLD.ended_at)) THEN
 UPDATE order_response_items SET revision=revision+1 WHERE order_item_id=NEW.order_item_id;
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER response_work_resolves_initial_case AFTER UPDATE ON order_response_items FOR EACH ROW
BEGIN
 IF (NOT(NEW.progress_at<=>OLD.progress_at) OR NOT(NEW.exception_case_id<=>OLD.exception_case_id)) THEN
 UPDATE order_response_cases SET state='resolved',revision=revision+1 WHERE portion_id=NEW.portion_id AND kind='no_response' AND state<>'resolved' AND NOT EXISTS(SELECT 1 FROM order_items i JOIN order_response_items r ON r.order_item_id=i.id WHERE JSON_CONTAINS(order_response_cases.scope_json,JSON_QUOTE(i.id))=1 AND i.fulfillment_status='confirmed' AND r.progress_at IS NULL AND r.exception_case_id IS NULL);
 END IF;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER response_handoff_resolves_preparation_case AFTER UPDATE ON order_items FOR EACH ROW
BEGIN
 IF (NOT(NEW.fulfillment_status<=>OLD.fulfillment_status)) AND (NEW.fulfillment_status IN('dispatched','delivered','cancelled') AND OLD.fulfillment_status<>NEW.fulfillment_status) THEN
 UPDATE order_response_cases SET state='resolved',revision=revision+1 WHERE state<>'resolved' AND portion_id IN(SELECT portion_id FROM order_response_items WHERE order_item_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM order_items i WHERE JSON_CONTAINS(order_response_cases.scope_json,JSON_QUOTE(i.id))=1 AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup'));
 END IF;
END//
DELIMITER ;
