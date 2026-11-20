-- Source parity for 0102. Isolated targets only; canonical and live migrations remain held.
CREATE TABLE return_handling(
 case_id VARCHAR(191) PRIMARY KEY REFERENCES return_requests(id),revision BIGINT NOT NULL DEFAULT 0,
 owner_id VARCHAR(191) REFERENCES users(id),backup_id VARCHAR(191) REFERENCES users(id),first_received_at BIGINT NOT NULL,first_due_at BIGINT NOT NULL,first_action_at BIGINT,next_update_at BIGINT,
 phase VARCHAR(191) NOT NULL DEFAULT 'requested' CHECK(phase IN('requested','instructions','in_transit','received','inspected','waived')),
 calendar_version VARCHAR(191),enough_information_at BIGINT,instructions_due_at BIGINT,instructions_json LONGTEXT,instructions_at BIGINT,handoff_due_at BIGINT,handed_at BIGINT,received_at BIGINT,sufficient_evidence_at BIGINT,inspection_due_at BIGINT,
 received_quantity BIGINT NOT NULL DEFAULT 0 CHECK(received_quantity>=0),inspected_quantity BIGINT NOT NULL DEFAULT 0 CHECK(inspected_quantity>=0),restocked_quantity BIGINT NOT NULL DEFAULT 0 CHECK(restocked_quantity>=0),waived_quantity BIGINT NOT NULL DEFAULT 0 CHECK(waived_quantity>=0),
 waiting_for VARCHAR(191) NOT NULL DEFAULT 'none' CHECK(waiting_for IN('none','customer','seller','carrier','platform')),clarification_at BIGINT,clarification_due_at BIGINT,
 last_event_id VARCHAR(191),created_at BIGINT NOT NULL, CHECK(first_due_at=first_received_at+86400000),CHECK(restocked_quantity<=inspected_quantity),CHECK(inspected_quantity<=received_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_handling_events(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES return_requests(id),revision BIGINT NOT NULL,action VARCHAR(191) NOT NULL,actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 occurred_at BIGINT NOT NULL,recorded_at BIGINT NOT NULL,public_message LONGTEXT NOT NULL,private_note LONGTEXT NOT NULL,evidence_reference LONGTEXT NOT NULL,details_json LONGTEXT NOT NULL CHECK(json_valid(details_json)),request_id VARCHAR(191) NOT NULL,
 UNIQUE(case_id,revision),UNIQUE(actor_id,request_id),CHECK(occurred_at<=recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_replacement_shipments(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES return_requests(id),quantity BIGINT NOT NULL CHECK(quantity>0),offer_id VARCHAR(191) REFERENCES product_offer_identities(id),
 state VARCHAR(191) NOT NULL CHECK(state IN('reserved','dispatched','delivered','cancelled','lost')),revision BIGINT NOT NULL DEFAULT 0,
 customer_agreement_reference LONGTEXT NOT NULL,promised_at BIGINT NOT NULL,carrier_reference LONGTEXT,dispatched_at BIGINT,delivered_at BIGINT,closed_at BIGINT,created_at BIGINT NOT NULL,
 CHECK(delivered_at IS NULL OR dispatched_at IS NOT NULL AND delivered_at>=dispatched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE return_stock_actions(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES return_requests(id),shipment_id VARCHAR(191) REFERENCES return_replacement_shipments(id),offer_id VARCHAR(191) REFERENCES product_offer_identities(id),product_id VARCHAR(191) REFERENCES products(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN('restock','replacement_reserve','replacement_dispatch','replacement_release')),quantity BIGINT NOT NULL CHECK(quantity>0),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL,created_at BIGINT NOT NULL,UNIQUE(case_id,request_id,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER //
CREATE TRIGGER return_request_starts_original_clock AFTER INSERT ON return_requests FOR EACH ROW BEGIN
 INSERT INTO return_handling(case_id,first_received_at,first_due_at,calendar_version,created_at) VALUES(NEW.id,NEW.requested_at,NEW.requested_at+86400000,'continuous-v1',COALESCE(NEW.recorded_at,NEW.updated_at)); END//
CREATE TRIGGER return_review_records_meaningful_action AFTER INSERT ON return_request_events FOR EACH ROW BEGIN
 IF NEW.action IN('admin_approve','admin_reject','admin_request_changes') THEN
 UPDATE return_handling SET first_action_at=COALESCE(first_action_at,NEW.created_at),enough_information_at=CASE WHEN NEW.action='admin_approve' THEN COALESCE(enough_information_at,(SELECT MAX(created_at) FROM return_request_events WHERE return_request_id=NEW.return_request_id AND action='customer_clarified'),first_received_at) ELSE enough_information_at END,instructions_due_at=CASE WHEN NEW.action='admin_approve' AND calendar_version='continuous-v1' THEN COALESCE(instructions_due_at,COALESCE(enough_information_at,(SELECT MAX(created_at) FROM return_request_events WHERE return_request_id=NEW.return_request_id AND action='customer_clarified'),first_received_at)+172800000) ELSE instructions_due_at END,revision=revision+1 WHERE case_id=NEW.return_request_id;
 END IF; END//
CREATE TRIGGER return_handling_originals_retained BEFORE UPDATE ON return_handling FOR EACH ROW BEGIN
 IF NEW.case_id<>OLD.case_id OR NOT(NEW.calendar_version <=> OLD.calendar_version) OR NEW.revision<>OLD.revision+1 OR NEW.first_received_at<>OLD.first_received_at OR NEW.first_due_at<>OLD.first_due_at OR NEW.created_at<>OLD.created_at OR (OLD.first_action_at IS NOT NULL AND NOT(NEW.first_action_at <=> OLD.first_action_at)) OR (OLD.instructions_at IS NOT NULL AND NOT(NEW.instructions_at <=> OLD.instructions_at AND NEW.instructions_json <=> OLD.instructions_json AND NEW.handoff_due_at <=> OLD.handoff_due_at)) OR (OLD.received_at IS NOT NULL AND NOT(NEW.received_at <=> OLD.received_at)) OR NEW.received_quantity<OLD.received_quantity OR NEW.inspected_quantity<OLD.inspected_quantity OR NEW.restocked_quantity<OLD.restocked_quantity OR NEW.waived_quantity<OLD.waived_quantity OR NEW.received_quantity+NEW.waived_quantity>(SELECT quantity FROM return_requests WHERE id=NEW.case_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_physical_history_or_quantity_conflict'; END IF; END//
CREATE TRIGGER return_handling_event_immutable BEFORE UPDATE ON return_handling_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_handling_event_immutable'; END//
CREATE TRIGGER return_handling_event_retained BEFORE DELETE ON return_handling_events FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_handling_event_retained'; END//
CREATE TRIGGER return_stock_action_immutable BEFORE UPDATE ON return_stock_actions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_stock_action_immutable'; END//
CREATE TRIGGER return_stock_action_retained BEFORE DELETE ON return_stock_actions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_stock_action_retained'; END//
CREATE TRIGGER return_replacement_one_active BEFORE INSERT ON return_replacement_shipments FOR EACH ROW BEGIN
 IF EXISTS(SELECT 1 FROM return_replacement_shipments WHERE case_id=NEW.case_id AND state IN('reserved','dispatched','delivered')) OR NEW.quantity<>(SELECT quantity FROM return_requests WHERE id=NEW.case_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_replacement_scope_or_duplicate'; END IF; END//
CREATE TRIGGER return_replacement_history BEFORE UPDATE ON return_replacement_shipments FOR EACH ROW BEGIN
 IF NEW.id<>OLD.id OR NEW.case_id<>OLD.case_id OR NEW.quantity<>OLD.quantity OR NOT(NEW.offer_id <=> OLD.offer_id) OR NEW.customer_agreement_reference<>OLD.customer_agreement_reference OR NEW.promised_at<>OLD.promised_at OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NOT(OLD.state='reserved' AND NEW.state IN('dispatched','cancelled') OR OLD.state='dispatched' AND NEW.state IN('delivered','lost')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_replacement_history_conflict'; END IF; END//
CREATE TRIGGER return_replacement_retained BEFORE DELETE ON return_replacement_shipments FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='return_replacement_retained'; END//
DELIMITER ;
