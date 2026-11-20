-- Source only. Never apply to the canonical database to make startup pass.
-- A recovery explains an existing original adjustment; opening it posts no money.
CREATE TABLE seller_recovery_cases (
 id TEXT PRIMARY KEY, source_kind TEXT NOT NULL CHECK(source_kind IN('refund','supplier_adjustment')), source_id TEXT NOT NULL,
 refund_id TEXT REFERENCES refunds(id), supplier_adjustment_id TEXT REFERENCES managed_supplier_adjustments(id),
 seller_id TEXT NOT NULL REFERENCES seller_profiles(id), payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 currency TEXT NOT NULL DEFAULT 'NPR' CHECK(currency='NPR'), original_source_json TEXT NOT NULL CHECK(json_valid(original_source_json)),
 exposure_paisa INTEGER NOT NULL CHECK(exposure_paisa>=0 AND exposure_paisa<=9007199254740991),
 confirmed_paisa INTEGER NOT NULL DEFAULT 0 CHECK(confirmed_paisa>=0 AND confirmed_paisa<=exposure_paisa),
 approved_cap_paisa INTEGER NOT NULL DEFAULT 0 CHECK(approved_cap_paisa>=0 AND approved_cap_paisa<=confirmed_paisa),
 absorbed_paisa INTEGER NOT NULL DEFAULT 0 CHECK(absorbed_paisa>=0 AND absorbed_paisa<=confirmed_paisa),
 disputed_paisa INTEGER NOT NULL DEFAULT 0 CHECK(disputed_paisa>=0 AND disputed_paisa<=9007199254740991),
 historical_recovered_paisa INTEGER NOT NULL DEFAULT 0 CHECK(historical_recovered_paisa>=0 AND historical_recovered_paisa<=9007199254740991),
 state TEXT NOT NULL CHECK(state IN('provisional','awaiting_approval','open','disputed','repayment_plan','part_recovered','recovered','absorbed','reconciliation','closed_no_balance')),
 blocker TEXT, approved_by TEXT REFERENCES users(id), approved_at INTEGER, plan_json TEXT CHECK(plan_json IS NULL OR json_valid(plan_json)),
 owner_id TEXT NOT NULL REFERENCES users(id), backup_id TEXT REFERENCES users(id), revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 first_review_due_at INTEGER NOT NULL, next_action_at INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(source_kind,source_id),
 CHECK(source_kind='refund' AND refund_id IS NOT NULL AND refund_id=source_id AND supplier_adjustment_id IS NULL AND payout_model IN('registered','managed') OR source_kind='supplier_adjustment' AND supplier_adjustment_id IS NOT NULL AND supplier_adjustment_id=source_id AND refund_id IS NULL AND payout_model='fixed'),
 CHECK(approved_cap_paisa=0 OR approved_by IS NOT NULL AND approved_at IS NOT NULL AND plan_json IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX seller_recovery_owned_queue ON seller_recovery_cases(owner_id,state,next_action_at);
--> statement-breakpoint
CREATE TABLE seller_recovery_events (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id), revision INTEGER NOT NULL,
 action TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)), request_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
 UNIQUE(case_id,revision)
);
--> statement-breakpoint
CREATE TRIGGER seller_recovery_source_retained BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.id IS NOT OLD.id OR NEW.source_kind IS NOT OLD.source_kind OR NEW.source_id IS NOT OLD.source_id OR NEW.refund_id IS NOT OLD.refund_id
 OR NEW.supplier_adjustment_id IS NOT OLD.supplier_adjustment_id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.payout_model IS NOT OLD.payout_model
 OR NEW.currency IS NOT OLD.currency OR NEW.original_source_json IS NOT OLD.original_source_json OR NEW.created_by IS NOT OLD.created_by
 OR NEW.created_at IS NOT OLD.created_at OR NEW.first_review_due_at IS NOT OLD.first_review_due_at OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'original_recovery_source_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_history_retained BEFORE DELETE ON seller_recovery_cases BEGIN SELECT RAISE(ABORT,'recovery_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_event_immutable BEFORE UPDATE ON seller_recovery_events BEGIN SELECT RAISE(ABORT,'recovery_event_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_event_retained BEFORE DELETE ON seller_recovery_events BEGIN SELECT RAISE(ABORT,'recovery_event_retained'); END;
