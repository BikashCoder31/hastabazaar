-- Additive source, isolated fixtures only. No canonical data migration or repair.
CREATE TABLE return_handling(
 case_id TEXT PRIMARY KEY REFERENCES return_requests(id),revision INTEGER NOT NULL DEFAULT 0,
 owner_id TEXT REFERENCES users(id),backup_id TEXT REFERENCES users(id),first_received_at INTEGER NOT NULL,first_due_at INTEGER NOT NULL,first_action_at INTEGER,next_update_at INTEGER,
 phase TEXT NOT NULL DEFAULT 'requested' CHECK(phase IN('requested','instructions','in_transit','received','inspected','waived')),
 calendar_version TEXT,enough_information_at INTEGER,instructions_due_at INTEGER,instructions_json TEXT,instructions_at INTEGER,handoff_due_at INTEGER,handed_at INTEGER,received_at INTEGER,sufficient_evidence_at INTEGER,inspection_due_at INTEGER,
 received_quantity INTEGER NOT NULL DEFAULT 0 CHECK(received_quantity>=0),inspected_quantity INTEGER NOT NULL DEFAULT 0 CHECK(inspected_quantity>=0),restocked_quantity INTEGER NOT NULL DEFAULT 0 CHECK(restocked_quantity>=0),waived_quantity INTEGER NOT NULL DEFAULT 0 CHECK(waived_quantity>=0),
 waiting_for TEXT NOT NULL DEFAULT 'none' CHECK(waiting_for IN('none','customer','seller','carrier','platform')),clarification_at INTEGER,clarification_due_at INTEGER,
 last_event_id TEXT,created_at INTEGER NOT NULL, CHECK(first_due_at=first_received_at+86400000),CHECK(restocked_quantity<=inspected_quantity),CHECK(inspected_quantity<=received_quantity)
);
--> statement-breakpoint
CREATE TABLE return_handling_events(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES return_requests(id),revision INTEGER NOT NULL,action TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),
 occurred_at INTEGER NOT NULL,recorded_at INTEGER NOT NULL,public_message TEXT NOT NULL,private_note TEXT NOT NULL,evidence_reference TEXT NOT NULL,details_json TEXT NOT NULL CHECK(json_valid(details_json)),request_id TEXT NOT NULL,
 UNIQUE(case_id,revision),UNIQUE(actor_id,request_id),CHECK(occurred_at<=recorded_at)
);
--> statement-breakpoint
CREATE TABLE return_replacement_shipments(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES return_requests(id),quantity INTEGER NOT NULL CHECK(quantity>0),offer_id TEXT REFERENCES product_offer_identities(id),
 state TEXT NOT NULL CHECK(state IN('reserved','dispatched','delivered','cancelled','lost')),revision INTEGER NOT NULL DEFAULT 0,
 customer_agreement_reference TEXT NOT NULL,promised_at INTEGER NOT NULL,carrier_reference TEXT,dispatched_at INTEGER,delivered_at INTEGER,closed_at INTEGER,created_at INTEGER NOT NULL,
 CHECK(delivered_at IS NULL OR dispatched_at IS NOT NULL AND delivered_at>=dispatched_at)
);
--> statement-breakpoint
CREATE TABLE return_stock_actions(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES return_requests(id),shipment_id TEXT REFERENCES return_replacement_shipments(id),offer_id TEXT REFERENCES product_offer_identities(id),product_id TEXT REFERENCES products(id),
 kind TEXT NOT NULL CHECK(kind IN('restock','replacement_reserve','replacement_dispatch','replacement_release')),quantity INTEGER NOT NULL CHECK(quantity>0),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(case_id,request_id,kind)
);
--> statement-breakpoint
CREATE TRIGGER return_request_starts_original_clock AFTER INSERT ON return_requests BEGIN
 INSERT INTO return_handling(case_id,first_received_at,first_due_at,calendar_version,created_at) VALUES(NEW.id,NEW.requested_at,NEW.requested_at+86400000,'continuous-v1',COALESCE(NEW.recorded_at,NEW.updated_at));
END;
--> statement-breakpoint
CREATE TRIGGER return_review_records_meaningful_action AFTER INSERT ON return_request_events WHEN NEW.action IN('admin_approve','admin_reject','admin_request_changes') BEGIN
 UPDATE return_handling SET first_action_at=COALESCE(first_action_at,NEW.created_at),enough_information_at=CASE WHEN NEW.action='admin_approve' THEN COALESCE(enough_information_at,(SELECT MAX(created_at) FROM return_request_events WHERE return_request_id=NEW.return_request_id AND action='customer_clarified'),first_received_at) ELSE enough_information_at END,instructions_due_at=CASE WHEN NEW.action='admin_approve' AND calendar_version='continuous-v1' THEN COALESCE(instructions_due_at,COALESCE(enough_information_at,(SELECT MAX(created_at) FROM return_request_events WHERE return_request_id=NEW.return_request_id AND action='customer_clarified'),first_received_at)+172800000) ELSE instructions_due_at END,revision=revision+1 WHERE case_id=NEW.return_request_id;
END;
--> statement-breakpoint
CREATE TRIGGER return_handling_originals_retained BEFORE UPDATE ON return_handling
 WHEN NEW.case_id<>OLD.case_id OR NEW.calendar_version IS NOT OLD.calendar_version OR NEW.revision<>OLD.revision+1 OR NEW.first_received_at<>OLD.first_received_at OR NEW.first_due_at<>OLD.first_due_at OR NEW.created_at<>OLD.created_at OR (OLD.first_action_at IS NOT NULL AND NEW.first_action_at IS NOT OLD.first_action_at) OR (OLD.instructions_at IS NOT NULL AND (NEW.instructions_at IS NOT OLD.instructions_at OR NEW.instructions_json IS NOT OLD.instructions_json OR NEW.handoff_due_at IS NOT OLD.handoff_due_at)) OR (OLD.received_at IS NOT NULL AND NEW.received_at IS NOT OLD.received_at) OR NEW.received_quantity<OLD.received_quantity OR NEW.inspected_quantity<OLD.inspected_quantity OR NEW.restocked_quantity<OLD.restocked_quantity OR NEW.waived_quantity<OLD.waived_quantity OR NEW.received_quantity+NEW.waived_quantity>(SELECT quantity FROM return_requests WHERE id=NEW.case_id)
 BEGIN SELECT RAISE(ABORT,'return_physical_history_or_quantity_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER return_handling_event_immutable BEFORE UPDATE ON return_handling_events BEGIN SELECT RAISE(ABORT,'return_handling_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER return_handling_event_retained BEFORE DELETE ON return_handling_events BEGIN SELECT RAISE(ABORT,'return_handling_event_retained'); END;
--> statement-breakpoint
CREATE TRIGGER return_stock_action_immutable BEFORE UPDATE ON return_stock_actions BEGIN SELECT RAISE(ABORT,'return_stock_action_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER return_stock_action_retained BEFORE DELETE ON return_stock_actions BEGIN SELECT RAISE(ABORT,'return_stock_action_retained'); END;
--> statement-breakpoint
CREATE TRIGGER return_replacement_one_active BEFORE INSERT ON return_replacement_shipments
 WHEN EXISTS(SELECT 1 FROM return_replacement_shipments WHERE case_id=NEW.case_id AND state IN('reserved','dispatched','delivered')) OR NEW.quantity<>(SELECT quantity FROM return_requests WHERE id=NEW.case_id)
 BEGIN SELECT RAISE(ABORT,'return_replacement_scope_or_duplicate'); END;
--> statement-breakpoint
CREATE TRIGGER return_replacement_history BEFORE UPDATE ON return_replacement_shipments
 WHEN NEW.id<>OLD.id OR NEW.case_id<>OLD.case_id OR NEW.quantity<>OLD.quantity OR NEW.offer_id IS NOT OLD.offer_id OR NEW.customer_agreement_reference<>OLD.customer_agreement_reference OR NEW.promised_at<>OLD.promised_at OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NOT (OLD.state='reserved' AND NEW.state IN('dispatched','cancelled') OR OLD.state='dispatched' AND NEW.state IN('delivered','lost'))
 BEGIN SELECT RAISE(ABORT,'return_replacement_history_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER return_replacement_retained BEFORE DELETE ON return_replacement_shipments BEGIN SELECT RAISE(ABORT,'return_replacement_retained'); END;
