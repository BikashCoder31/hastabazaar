-- Additive source only. Apply solely to reviewed isolated fixtures until a later authorized cutover.
CREATE TABLE order_response_portions (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
 operator_mode TEXT NOT NULL CHECK(operator_mode IN('seller','company')),created_at INTEGER NOT NULL,
 UNIQUE(order_id,seller_id,operator_mode)
);
--> statement-breakpoint
CREATE TABLE order_response_cases (
 id TEXT PRIMARY KEY,portion_id TEXT NOT NULL REFERENCES order_response_portions(id),source_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN('no_response','delay','cannot_fulfill','hold','promise_missed')),
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN('open','waiting','resolved')),
 scope_json TEXT NOT NULL CHECK(json_valid(scope_json)),private_detail TEXT NOT NULL,public_message TEXT,proposed_ready_at INTEGER,
 owner_id TEXT REFERENCES users(id),backup_id TEXT REFERENCES users(id),reported_by TEXT REFERENCES users(id),
 created_at INTEGER NOT NULL,first_action_at INTEGER,first_due_at INTEGER NOT NULL,next_update_at INTEGER,
 commitment_missing INTEGER NOT NULL DEFAULT 1 CHECK(commitment_missing IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 0,last_event_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE order_response_items (
 order_item_id TEXT PRIMARY KEY REFERENCES order_items(id),portion_id TEXT NOT NULL REFERENCES order_response_portions(id),
 released_at INTEGER NOT NULL CHECK(released_at>=0),progress_at INTEGER,
 exception_case_id TEXT REFERENCES order_response_cases(id),revision INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE order_fulfillment_holds (
 id TEXT PRIMARY KEY,order_item_id TEXT NOT NULL REFERENCES order_items(id),
 reason TEXT NOT NULL CHECK(reason IN('cancellation','customer_clarification','payment_dispute','address_cod','safety','identity','ownership','carrier')),
 source_type TEXT NOT NULL,source_id TEXT NOT NULL,imposed_by TEXT REFERENCES users(id),owner_id TEXT REFERENCES users(id),
 prevents_preparation INTEGER NOT NULL CHECK(prevents_preparation IN(0,1)),prevents_handoff INTEGER NOT NULL CHECK(prevents_handoff IN(0,1)),
 started_at INTEGER NOT NULL,review_due_at INTEGER NOT NULL,ended_at INTEGER,ended_by TEXT REFERENCES users(id),release_reason TEXT,
 revision INTEGER NOT NULL DEFAULT 0,
 CHECK(ended_at IS NULL OR ended_at>=started_at),CHECK(prevents_preparation=1 OR prevents_handoff=1)
);
--> statement-breakpoint
CREATE TABLE order_response_events (
 id TEXT PRIMARY KEY,portion_id TEXT REFERENCES order_response_portions(id),case_id TEXT REFERENCES order_response_cases(id),
 order_id TEXT NOT NULL REFERENCES orders(id),kind TEXT NOT NULL CHECK(kind IN('released','reminder','escalation','checkpoint','delay','followup','customer_update')),
 scope_json TEXT NOT NULL CHECK(json_valid(scope_json)),source_key TEXT NOT NULL UNIQUE,actor_id TEXT REFERENCES users(id),
 note TEXT NOT NULL,created_at INTEGER NOT NULL,case_state TEXT,case_revision INTEGER,due_at INTEGER,expires_at INTEGER
);
--> statement-breakpoint
CREATE INDEX order_response_open_cases ON order_response_cases(state,first_due_at,next_update_at);
--> statement-breakpoint
CREATE INDEX order_fulfillment_active_holds ON order_fulfillment_holds(order_item_id,ended_at);
--> statement-breakpoint
CREATE TRIGGER order_response_release_retained BEFORE UPDATE ON order_response_items
 WHEN NEW.order_item_id<>OLD.order_item_id OR NEW.portion_id<>OLD.portion_id OR NEW.released_at<>OLD.released_at OR (OLD.progress_at IS NOT NULL AND NEW.progress_at IS NOT OLD.progress_at)
 BEGIN SELECT RAISE(ABORT,'order_response_release_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_response_events_immutable BEFORE UPDATE ON order_response_events BEGIN SELECT RAISE(ABORT,'order_response_history_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER order_response_events_retained BEFORE DELETE ON order_response_events BEGIN SELECT RAISE(ABORT,'order_response_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER order_response_item_progress AFTER UPDATE OF fulfillment_status ON order_items
 WHEN NEW.fulfillment_status<>OLD.fulfillment_status AND NEW.fulfillment_status IN('packing','ready_for_pickup','dispatched','delivered','cancelled')
 BEGIN UPDATE order_response_items SET progress_at=COALESCE(progress_at,CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)),revision=revision+1 WHERE order_item_id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER order_preparation_hold_guard BEFORE UPDATE OF fulfillment_status ON order_items
 WHEN NEW.fulfillment_status<>OLD.fulfillment_status AND EXISTS(SELECT 1 FROM order_fulfillment_holds h WHERE h.order_item_id=NEW.id AND h.ended_at IS NULL AND ((NEW.fulfillment_status IN('packing','ready_for_pickup') AND h.prevents_preparation=1) OR (NEW.fulfillment_status='dispatched' AND h.prevents_handoff=1)))
 BEGIN SELECT RAISE(ABORT,'order_fulfillment_scope_is_held'); END;
--> statement-breakpoint
CREATE TRIGGER order_handoff_hold_guard BEFORE UPDATE OF status ON shipping_jobs
 WHEN NEW.direction='outbound' AND NEW.status='dispatched' AND OLD.status NOT IN('dispatched','delivered') AND EXISTS(SELECT 1 FROM order_items i JOIN order_fulfillment_holds h ON h.order_item_id=i.id WHERE i.order_id=NEW.order_id AND i.seller_id=NEW.seller_id AND i.fulfillment_status<>'cancelled' AND h.ended_at IS NULL AND h.prevents_handoff=1)
 BEGIN SELECT RAISE(ABORT,'order_handoff_scope_is_held'); END;
--> statement-breakpoint
CREATE TRIGGER order_hold_history_retained BEFORE DELETE ON order_fulfillment_holds BEGIN SELECT RAISE(ABORT,'order_hold_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER order_hold_scope_immutable BEFORE UPDATE ON order_fulfillment_holds
 WHEN NEW.order_item_id<>OLD.order_item_id OR NEW.reason<>OLD.reason OR NEW.source_type<>OLD.source_type OR NEW.source_id<>OLD.source_id OR NEW.started_at<>OLD.started_at OR NEW.prevents_preparation<>OLD.prevents_preparation OR NEW.prevents_handoff<>OLD.prevents_handoff OR (OLD.ended_at IS NOT NULL AND (NEW.ended_at IS NOT OLD.ended_at OR NEW.ended_by IS NOT OLD.ended_by OR NEW.release_reason IS NOT OLD.release_reason))
 BEGIN SELECT RAISE(ABORT,'order_hold_history_immutable'); END;
--> statement-breakpoint
CREATE TABLE order_response_milestones (
 order_item_id TEXT NOT NULL REFERENCES order_response_items(order_item_id),milestone TEXT NOT NULL CHECK(milestone IN('released','reminder','escalation','checkpoint')),
 event_id TEXT NOT NULL REFERENCES order_response_events(id),created_at INTEGER NOT NULL,PRIMARY KEY(order_item_id,milestone)
);
--> statement-breakpoint
CREATE TRIGGER payment_correction_preparation_hold AFTER INSERT ON manual_payment_exceptions WHEN NEW.kind='receipt_reversal' AND NEW.order_id IS NOT NULL
 BEGIN INSERT OR IGNORE INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT NEW.last_event_id||':'||i.id,i.id,'payment_dispute','payment_exception',NEW.id,NULL,NEW.owner_id,1,1,NEW.created_at,NEW.next_update_at FROM order_items i WHERE i.order_id=NEW.order_id AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup'); END;
--> statement-breakpoint
CREATE TRIGGER payment_correction_preparation_reopened AFTER UPDATE OF state ON manual_payment_exceptions WHEN OLD.state='resolved' AND NEW.state<>'resolved' AND NEW.kind='receipt_reversal' AND NEW.order_id IS NOT NULL
 BEGIN INSERT OR IGNORE INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at)
 SELECT NEW.last_event_id||':'||i.id,i.id,'payment_dispute','payment_exception',NEW.id,NULL,NEW.owner_id,1,1,NEW.created_at,NEW.next_update_at FROM order_items i WHERE i.order_id=NEW.order_id AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup'); END;
--> statement-breakpoint
CREATE TRIGGER payment_correction_hold_resolved AFTER UPDATE OF state ON manual_payment_exceptions WHEN NEW.state='resolved' AND OLD.state<>'resolved'
 BEGIN UPDATE order_fulfillment_holds SET ended_at=CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER),release_reason='The exact Finance correction case was resolved.',revision=revision+1 WHERE source_type='payment_exception' AND source_id=NEW.id AND ended_at IS NULL; END;
--> statement-breakpoint
CREATE TRIGGER response_hold_insert_revision AFTER INSERT ON order_fulfillment_holds BEGIN UPDATE order_response_items SET revision=revision+1 WHERE order_item_id=NEW.order_item_id; END;
--> statement-breakpoint
CREATE TRIGGER response_hold_end_revision AFTER UPDATE OF ended_at ON order_fulfillment_holds WHEN NEW.ended_at IS NOT OLD.ended_at BEGIN UPDATE order_response_items SET revision=revision+1 WHERE order_item_id=NEW.order_item_id; END;
--> statement-breakpoint
CREATE TRIGGER response_work_resolves_initial_case AFTER UPDATE OF progress_at,exception_case_id ON order_response_items
 BEGIN UPDATE order_response_cases SET state='resolved',revision=revision+1 WHERE portion_id=NEW.portion_id AND kind='no_response' AND state<>'resolved' AND NOT EXISTS(SELECT 1 FROM json_each(order_response_cases.scope_json) scope JOIN order_items i ON i.id=scope.value JOIN order_response_items r ON r.order_item_id=i.id WHERE i.fulfillment_status='confirmed' AND r.progress_at IS NULL AND r.exception_case_id IS NULL); END;
--> statement-breakpoint
CREATE TABLE order_response_customer_state (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),current_event_id TEXT NOT NULL REFERENCES order_response_events(id),revision INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TRIGGER response_handoff_resolves_preparation_case AFTER UPDATE OF fulfillment_status ON order_items
 WHEN NEW.fulfillment_status IN('dispatched','delivered','cancelled') AND OLD.fulfillment_status<>NEW.fulfillment_status
 BEGIN UPDATE order_response_cases SET state='resolved',revision=revision+1 WHERE state<>'resolved' AND portion_id IN(SELECT portion_id FROM order_response_items WHERE order_item_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM json_each(order_response_cases.scope_json) scope JOIN order_items i ON i.id=scope.value WHERE i.fulfillment_status IN('confirmed','packing','ready_for_pickup')); END;
