-- Additive source for disposable fixtures. Existing local/live data is not migrated by this work.
CREATE TABLE refund_obligations(
 id TEXT PRIMARY KEY,source_kind TEXT NOT NULL CHECK(source_kind IN('return_refund','receipt_return','service_fee','cancellation')),
 source_id TEXT NOT NULL,order_id TEXT REFERENCES orders(id),receipt_id TEXT REFERENCES company_money_receipts(id),receipt_use_id TEXT UNIQUE REFERENCES manual_receipt_uses(id),
 customer_id TEXT NOT NULL REFERENCES users(id),cash_paisa INTEGER NOT NULL CHECK(cash_paisa>=0 AND cash_paisa<=9007199254740991),wallet_paisa INTEGER NOT NULL CHECK(wallet_paisa>=0 AND wallet_paisa<=9007199254740991),
 currency TEXT NOT NULL CHECK(currency='NPR'),source_snapshot_json TEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN('open','processing','uncertain','completed','blocked')),revision INTEGER NOT NULL DEFAULT 0,
 owner_id TEXT NOT NULL REFERENCES users(id),backup_id TEXT REFERENCES users(id),authorized_at INTEGER NOT NULL,first_finance_due_at INTEGER NOT NULL,first_finance_at INTEGER,
 next_update_at INTEGER NOT NULL,calendar_version TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(source_kind,source_id)
);
--> statement-breakpoint
CREATE TABLE refund_obligation_events(
 id TEXT PRIMARY KEY,obligation_id TEXT NOT NULL REFERENCES refund_obligations(id),actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,
 public_message TEXT NOT NULL,private_details_json TEXT NOT NULL CHECK(json_valid(private_details_json)),request_id TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(obligation_id,request_id)
);
--> statement-breakpoint
CREATE TRIGGER refund_obligation_source_retained BEFORE UPDATE ON refund_obligations WHEN
 NEW.id<>OLD.id OR NEW.source_kind<>OLD.source_kind OR NEW.source_id<>OLD.source_id OR NEW.order_id IS NOT OLD.order_id OR NEW.receipt_id IS NOT OLD.receipt_id OR NEW.receipt_use_id IS NOT OLD.receipt_use_id
 OR NEW.customer_id<>OLD.customer_id OR NEW.cash_paisa<>OLD.cash_paisa OR NEW.wallet_paisa<>OLD.wallet_paisa OR NEW.currency<>OLD.currency OR NEW.source_snapshot_json<>OLD.source_snapshot_json
 OR NEW.authorized_at<>OLD.authorized_at OR NEW.first_finance_due_at<>OLD.first_finance_due_at OR NEW.calendar_version<>OLD.calendar_version OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 BEGIN SELECT RAISE(ABORT,'refund_original_obligation_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_obligation_no_delete BEFORE DELETE ON refund_obligations BEGIN SELECT RAISE(ABORT,'refund_original_obligation_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_obligation_event_no_update BEFORE UPDATE ON refund_obligation_events BEGIN SELECT RAISE(ABORT,'refund_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER refund_obligation_event_no_delete BEFORE DELETE ON refund_obligation_events BEGIN SELECT RAISE(ABORT,'refund_history_retained'); END;
