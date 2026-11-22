-- Additive source only. Apply only to isolated fixtures until an explicit cutover is authorized.
CREATE TABLE manual_payment_windows(
 order_id TEXT PRIMARY KEY REFERENCES orders(id),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 issued_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,buffer_end_at INTEGER NOT NULL,calendar_version TEXT NOT NULL,
 last_event_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),paid_at INTEGER,closed_at INTEGER,released_at INTEGER,closure_reason TEXT,
 CHECK(deadline_at=issued_at+86400000),CHECK(buffer_end_at>deadline_at),CHECK(paid_at IS NULL OR closed_at IS NULL),CHECK(released_at IS NULL OR paid_at IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE manual_payment_claims(
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES manual_payment_windows(order_id),customer_id TEXT NOT NULL REFERENCES users(id),
 claimed_amount_paisa INTEGER NOT NULL CHECK(claimed_amount_paisa>0 AND claimed_amount_paisa<=9007199254740991),payment_date TEXT NOT NULL,bank_reference TEXT,note TEXT NOT NULL,
 evidence_ids_json TEXT NOT NULL CHECK(json_valid(evidence_ids_json)),first_submitted_at INTEGER NOT NULL,current_state TEXT NOT NULL CHECK(current_state IN('submitted','clarified','needs_information','rejected','withdrawn','matched')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE manual_payment_claim_events(
 id TEXT PRIMARY KEY,claim_id TEXT NOT NULL REFERENCES manual_payment_claims(id),order_id TEXT NOT NULL REFERENCES manual_payment_windows(order_id),revision INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN('submitted','clarified','needs_information','rejected','withdrawn','matched')),snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 actor_id TEXT NOT NULL REFERENCES users(id),occurred_at INTEGER NOT NULL,request_id TEXT NOT NULL,UNIQUE(claim_id,revision)
);
--> statement-breakpoint
CREATE INDEX manual_claim_event_cutoff ON manual_payment_claim_events(order_id,occurred_at,revision);
--> statement-breakpoint
CREATE TABLE manual_payment_claim_files(
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES manual_payment_windows(order_id),uploaded_by TEXT NOT NULL REFERENCES users(id),object_key TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL CHECK(size_bytes>0),created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE company_money_receipts(
 id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('bank_credit','cash_handover')),account_version_id TEXT REFERENCES company_payment_account_versions(id),
 source_identity_hash TEXT NOT NULL UNIQUE CHECK(length(source_identity_hash)=64),transaction_identity TEXT NOT NULL,bank_at INTEGER NOT NULL,confirmed_at INTEGER NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),currency TEXT NOT NULL CHECK(length(currency)=3),
 payer_reference TEXT NOT NULL,payer_user_id TEXT REFERENCES users(id),collector_user_id TEXT REFERENCES users(id),evidence_reference TEXT NOT NULL,
 verification_reason TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('verified','unmatched','reversed')),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),created_by TEXT NOT NULL REFERENCES users(id),
 CHECK(kind<>'bank_credit' OR account_version_id IS NOT NULL),CHECK(kind<>'cash_handover' OR account_version_id IS NULL)
);
--> statement-breakpoint
CREATE TABLE company_receipt_conflicts(receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),user_id TEXT NOT NULL REFERENCES users(id),recorded_by TEXT NOT NULL REFERENCES users(id),recorded_at INTEGER NOT NULL,PRIMARY KEY(receipt_id,user_id));
--> statement-breakpoint
CREATE TABLE manual_receipt_uses(
 id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),kind TEXT NOT NULL CHECK(kind IN('order','cod','return')),
 target_id TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),state TEXT NOT NULL CHECK(state IN('allocated','reserved','returned','released')),
 created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
--> statement-breakpoint
CREATE INDEX manual_receipt_use_balance ON manual_receipt_uses(receipt_id,state);
--> statement-breakpoint
CREATE TABLE manual_payment_allocations(
 id TEXT PRIMARY KEY,receipt_use_id TEXT NOT NULL UNIQUE REFERENCES manual_receipt_uses(id),receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),
 order_id TEXT NOT NULL REFERENCES manual_payment_windows(order_id),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),allocated_at INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),matching_basis TEXT NOT NULL,exception_json TEXT CHECK(exception_json IS NULL OR json_valid(exception_json))
);
--> statement-breakpoint
CREATE INDEX manual_order_allocations ON manual_payment_allocations(order_id,allocated_at);
--> statement-breakpoint
CREATE TABLE company_receipt_reversals(id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),source_identity_hash TEXT NOT NULL UNIQUE CHECK(length(source_identity_hash)=64),transaction_identity TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),actor_id TEXT NOT NULL REFERENCES users(id),evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,bank_at INTEGER NOT NULL,recorded_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE manual_payment_exceptions(
 id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,order_id TEXT REFERENCES orders(id),receipt_id TEXT REFERENCES company_money_receipts(id),kind TEXT NOT NULL,
 last_event_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('open','waiting','resolved')),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),reason TEXT NOT NULL,
 owner_id TEXT REFERENCES users(id),backup_id TEXT REFERENCES users(id),created_at INTEGER NOT NULL,triaged_at INTEGER,next_update_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE VIEW manual_payment_cutoffs AS SELECT w.*,
 CASE WHEN EXISTS(SELECT 1 FROM manual_payment_claim_events e WHERE e.order_id=w.order_id AND e.occurred_at<w.deadline_at
  AND e.state IN('submitted','clarified','needs_information') AND NOT EXISTS(SELECT 1 FROM manual_payment_claim_events later WHERE later.order_id=e.order_id AND later.occurred_at<w.deadline_at AND (later.occurred_at>e.occurred_at OR later.occurred_at=e.occurred_at AND later.revision>e.revision)))
  OR COALESCE((SELECT SUM(a.amount_paisa) FROM manual_payment_allocations a WHERE a.order_id=w.order_id AND a.allocated_at<w.deadline_at AND COALESCE((SELECT SUM(r.amount_minor) FROM company_receipt_reversals r WHERE r.receipt_id=a.receipt_id AND r.recorded_at<w.deadline_at),0)<(SELECT amount_minor FROM company_money_receipts WHERE id=a.receipt_id)),0)>0
 THEN w.buffer_end_at ELSE w.deadline_at END AS cutoff_at FROM manual_payment_windows w;
--> statement-breakpoint
CREATE TRIGGER manual_window_source BEFORE INSERT ON manual_payment_windows BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM company_payment_instructions i JOIN orders o ON o.id=i.order_id WHERE i.order_id=NEW.order_id AND i.amount_paisa=NEW.amount_paisa AND i.issued_at=NEW.issued_at AND i.deadline_at=NEW.deadline_at AND i.calendar_version=NEW.calendar_version AND o.payment_mode='prepaid' AND o.payment_status='unpaid') THEN RAISE(ABORT,'manual_window_original_instructions_required') END;
END;
--> statement-breakpoint
CREATE TRIGGER manual_window_identity BEFORE UPDATE ON manual_payment_windows WHEN NEW.order_id<>OLD.order_id OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.issued_at<>OLD.issued_at OR NEW.deadline_at<>OLD.deadline_at OR NEW.buffer_end_at<>OLD.buffer_end_at OR NEW.calendar_version<>OLD.calendar_version OR NEW.revision<>OLD.revision+1 OR OLD.paid_at IS NOT NULL AND NEW.paid_at IS NOT OLD.paid_at OR OLD.closed_at IS NOT NULL AND NEW.closed_at IS NOT OLD.closed_at OR OLD.released_at IS NOT NULL AND NEW.released_at IS NOT OLD.released_at BEGIN SELECT RAISE(ABORT,'manual_window_original_terms_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER manual_receipt_use_cap BEFORE INSERT ON manual_receipt_uses BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id AND r.status='verified' AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved') AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)-COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)) THEN RAISE(ABORT,'manual_receipt_balance_exceeded') END;
END;
--> statement-breakpoint
CREATE TRIGGER manual_receipt_use_transition BEFORE UPDATE ON manual_receipt_uses WHEN NEW.id<>OLD.id OR NEW.receipt_id<>OLD.receipt_id OR NEW.kind<>OLD.kind OR NEW.target_id<>OLD.target_id OR NEW.amount_minor<>OLD.amount_minor OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR OLD.state<>'reserved' OR NEW.state NOT IN('returned','released') BEGIN SELECT RAISE(ABORT,'manual_receipt_use_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER manual_payment_allocation_source BEFORE INSERT ON manual_payment_allocations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id WHERE u.id=NEW.receipt_use_id AND u.receipt_id=NEW.receipt_id AND u.kind='order' AND u.target_id=NEW.order_id AND u.amount_minor=NEW.amount_paisa AND u.state='allocated' AND r.status='verified' AND r.currency='NPR' AND r.kind='bank_credit') THEN RAISE(ABORT,'manual_allocation_verified_credit_required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w JOIN orders o ON o.id=w.order_id WHERE w.order_id=NEW.order_id AND w.closed_at IS NULL AND w.paid_at IS NULL AND o.status NOT IN('cancelled','delivered','dispatched') AND NEW.allocated_at<w.cutoff_at) THEN RAISE(ABORT,'manual_allocation_window_closed') END;
END;
--> statement-breakpoint
CREATE TRIGGER manual_preparation_held BEFORE UPDATE OF fulfillment_status ON order_items WHEN NEW.fulfillment_status NOT IN('confirmed','cancelled') AND EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=NEW.order_id AND (w.paid_at IS NULL OR w.released_at IS NULL OR w.closed_at IS NOT NULL)) BEGIN SELECT RAISE(ABORT,'manual_payment_fulfillment_held'); END;
--> statement-breakpoint
CREATE TRIGGER manual_parcel_held BEFORE INSERT ON shipping_jobs WHEN EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=NEW.order_id AND (w.paid_at IS NULL OR w.released_at IS NULL OR w.closed_at IS NOT NULL)) BEGIN SELECT RAISE(ABORT,'manual_payment_fulfillment_held'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_windows_retained BEFORE DELETE ON manual_payment_windows BEGIN SELECT RAISE(ABORT,'manual_payment_windows_retained'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_claims_retained BEFORE DELETE ON manual_payment_claims BEGIN SELECT RAISE(ABORT,'manual_payment_claims_retained'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_claim_events_retained BEFORE DELETE ON manual_payment_claim_events BEGIN SELECT RAISE(ABORT,'manual_payment_claim_events_retained'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_claim_files_retained BEFORE DELETE ON manual_payment_claim_files BEGIN SELECT RAISE(ABORT,'manual_payment_claim_files_retained'); END;

--> statement-breakpoint
CREATE TRIGGER company_money_receipts_retained BEFORE DELETE ON company_money_receipts BEGIN SELECT RAISE(ABORT,'company_money_receipts_retained'); END;

--> statement-breakpoint
CREATE TRIGGER company_receipt_conflicts_retained BEFORE DELETE ON company_receipt_conflicts BEGIN SELECT RAISE(ABORT,'company_receipt_conflicts_retained'); END;

--> statement-breakpoint
CREATE TRIGGER manual_receipt_uses_retained BEFORE DELETE ON manual_receipt_uses BEGIN SELECT RAISE(ABORT,'manual_receipt_uses_retained'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_allocations_retained BEFORE DELETE ON manual_payment_allocations BEGIN SELECT RAISE(ABORT,'manual_payment_allocations_retained'); END;

--> statement-breakpoint
CREATE TRIGGER company_receipt_reversals_retained BEFORE DELETE ON company_receipt_reversals BEGIN SELECT RAISE(ABORT,'company_receipt_reversals_retained'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_exceptions_retained BEFORE DELETE ON manual_payment_exceptions BEGIN SELECT RAISE(ABORT,'manual_payment_exceptions_retained'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_claim_events_immutable BEFORE UPDATE ON manual_payment_claim_events BEGIN SELECT RAISE(ABORT,'manual_payment_claim_events_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_claim_files_immutable BEFORE UPDATE ON manual_payment_claim_files BEGIN SELECT RAISE(ABORT,'manual_payment_claim_files_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER company_receipt_conflicts_immutable BEFORE UPDATE ON company_receipt_conflicts BEGIN SELECT RAISE(ABORT,'company_receipt_conflicts_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER manual_payment_allocations_immutable BEFORE UPDATE ON manual_payment_allocations BEGIN SELECT RAISE(ABORT,'manual_payment_allocations_immutable'); END;

--> statement-breakpoint
CREATE TRIGGER company_receipt_reversals_immutable BEFORE UPDATE ON company_receipt_reversals BEGIN SELECT RAISE(ABORT,'company_receipt_reversals_immutable'); END;

--> statement-breakpoint
CREATE VIEW manual_payment_balances AS SELECT o.id AS order_id,
 CASE WHEN o.current_total_paisa IS NULL THEN o.grand_total_paisa ELSE o.current_total_paisa+COALESCE((SELECT json_extract(e.next_json,'$.platformServiceFeePaisa') FROM order_cancellation_events e WHERE e.order_id=o.id ORDER BY e.version DESC LIMIT 1),o.buyer_platform_fee_paisa) END AS payable_paisa,
 COALESCE((SELECT SUM(a.amount_paisa) FROM manual_payment_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.order_id=o.id AND r.status='verified'),0) AS received_paisa FROM orders o JOIN manual_payment_windows w ON w.order_id=o.id;
--> statement-breakpoint
CREATE TRIGGER manual_allocation_amount_and_time BEFORE INSERT ON manual_payment_allocations BEGIN
 SELECT CASE WHEN NEW.allocated_at<>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) OR NOT EXISTS(SELECT 1 FROM manual_payment_balances b WHERE b.order_id=NEW.order_id AND NEW.amount_paisa<=b.payable_paisa-b.received_paisa) THEN RAISE(ABORT,'manual_allocation_amount_or_time_changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER manual_claim_original_age BEFORE UPDATE ON manual_payment_claims WHEN NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.customer_id<>OLD.customer_id OR NEW.first_submitted_at<>OLD.first_submitted_at OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'manual_claim_original_age_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER manual_claim_owner BEFORE INSERT ON manual_payment_claims BEGIN
 SELECT CASE WHEN NEW.first_submitted_at<>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) OR NOT EXISTS(SELECT 1 FROM orders o JOIN users u ON u.id=o.customer_id WHERE o.id=NEW.order_id AND o.customer_id=NEW.customer_id AND u.status='active') THEN RAISE(ABORT,'manual_claim_owner_required') END;
END;
--> statement-breakpoint
CREATE TRIGGER manual_claim_event_source BEFORE INSERT ON manual_payment_claim_events BEGIN
 SELECT CASE WHEN NEW.occurred_at<>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) OR NOT EXISTS(SELECT 1 FROM manual_payment_claims c WHERE c.id=NEW.claim_id AND c.order_id=NEW.order_id AND c.revision=NEW.revision AND c.current_state=NEW.state) THEN RAISE(ABORT,'manual_claim_current_event_required') END;
END;
--> statement-breakpoint
CREATE TRIGGER manual_window_paid_and_expired BEFORE UPDATE ON manual_payment_windows BEGIN
 SELECT CASE WHEN OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL AND (NEW.paid_at<>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) OR NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w JOIN manual_payment_balances b ON b.order_id=w.order_id WHERE w.order_id=NEW.order_id AND w.closed_at IS NULL AND NEW.paid_at<w.cutoff_at AND b.received_paisa>=b.payable_paisa)) THEN RAISE(ABORT,'manual_payment_not_confirmed') END;
 SELECT CASE WHEN OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND (NEW.closed_at<>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) OR NOT EXISTS(SELECT 1 FROM manual_payment_cutoffs w WHERE w.order_id=NEW.order_id AND w.paid_at IS NULL AND (NEW.closed_at>=w.cutoff_at OR NEW.closure_reason='order_cancelled' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=w.order_id AND o.status='cancelled')))) THEN RAISE(ABORT,'manual_payment_not_expired') END;
END;
--> statement-breakpoint
CREATE TRIGGER manual_order_payment_source BEFORE UPDATE OF payment_status ON orders WHEN NEW.payment_mode='prepaid' AND NEW.payment_status='paid' AND EXISTS(SELECT 1 FROM manual_payment_windows WHERE order_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM manual_payment_windows WHERE order_id=NEW.id AND paid_at IS NOT NULL AND closed_at IS NULL) BEGIN SELECT RAISE(ABORT,'manual_payment_not_confirmed'); END;
--> statement-breakpoint
CREATE TRIGGER company_receipt_original_fact BEFORE UPDATE ON company_money_receipts WHEN NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW.account_version_id IS NOT OLD.account_version_id OR NEW.source_identity_hash<>OLD.source_identity_hash OR NEW.transaction_identity<>OLD.transaction_identity OR NEW.bank_at<>OLD.bank_at OR NEW.confirmed_at<>OLD.confirmed_at OR NEW.amount_minor<>OLD.amount_minor OR NEW.currency<>OLD.currency OR NEW.payer_reference<>OLD.payer_reference OR NEW.payer_user_id IS NOT OLD.payer_user_id OR NEW.collector_user_id IS NOT OLD.collector_user_id OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.verification_reason<>OLD.verification_reason OR NEW.created_by<>OLD.created_by OR NEW.revision<>OLD.revision+1 OR NEW.status<>'reversed' OR OLD.status='reversed' OR COALESCE((SELECT SUM(amount_minor) FROM company_receipt_reversals WHERE receipt_id=OLD.id),0)<>OLD.amount_minor BEGIN SELECT RAISE(ABORT,'company_receipt_original_fact_immutable'); END;

--> statement-breakpoint
CREATE TABLE company_receipt_controls(receipt_id TEXT PRIMARY KEY REFERENCES company_money_receipts(id),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
--> statement-breakpoint
CREATE TRIGGER company_receipt_controls_retained BEFORE DELETE ON company_receipt_controls BEGIN SELECT RAISE(ABORT,'company_receipt_control_retained'); END;
--> statement-breakpoint
CREATE TRIGGER company_receipt_controls_revision BEFORE UPDATE ON company_receipt_controls WHEN NEW.receipt_id<>OLD.receipt_id OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'company_receipt_control_revision'); END;

--> statement-breakpoint
-- Automated expiry is a system action. Preserve all history without attributing it to a customer or staff member.
CREATE TABLE __manual_offer_stock_events(id TEXT PRIMARY KEY,offer_id TEXT NOT NULL REFERENCES product_offer_identities(id),kind TEXT NOT NULL,available_delta INTEGER NOT NULL,reserved_delta INTEGER NOT NULL,related_offer_id TEXT REFERENCES product_offer_identities(id),reason TEXT NOT NULL,actor_id TEXT REFERENCES users(id),request_id TEXT NOT NULL,created_at INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO __manual_offer_stock_events SELECT * FROM offer_stock_events;
--> statement-breakpoint
DROP TABLE offer_stock_events;
--> statement-breakpoint
ALTER TABLE __manual_offer_stock_events RENAME TO offer_stock_events;
--> statement-breakpoint
CREATE TRIGGER offer_stock_event_immutable BEFORE UPDATE ON offer_stock_events BEGIN SELECT RAISE(ABORT,'offer_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER offer_stock_event_retained BEFORE DELETE ON offer_stock_events BEGIN SELECT RAISE(ABORT,'offer_event_retained'); END;

--> statement-breakpoint
CREATE INDEX offer_stock_events_history ON offer_stock_events(offer_id,created_at);

--> statement-breakpoint
CREATE TABLE manual_payment_reminders(order_id TEXT PRIMARY KEY REFERENCES manual_payment_windows(order_id),event_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TRIGGER manual_payment_reminder_immutable BEFORE UPDATE ON manual_payment_reminders BEGIN SELECT RAISE(ABORT,'manual_payment_reminder_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER manual_payment_reminder_retained BEFORE DELETE ON manual_payment_reminders BEGIN SELECT RAISE(ABORT,'manual_payment_reminder_retained'); END;

--> statement-breakpoint
CREATE TRIGGER company_reversal_cap BEFORE INSERT ON company_receipt_reversals BEGIN
 SELECT CASE WHEN NEW.recorded_at<>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) OR NEW.bank_at>NEW.recorded_at OR NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id AND r.kind='bank_credit' AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)) THEN RAISE(ABORT,'company_reversal_balance_or_time_changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER manual_reversal_preparation_held BEFORE UPDATE OF fulfillment_status ON order_items WHEN NEW.fulfillment_status<>OLD.fulfillment_status AND NEW.fulfillment_status IN('packing','ready_for_pickup','dispatched') AND EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=NEW.order_id AND e.kind='receipt_reversal' AND e.state<>'resolved') BEGIN SELECT RAISE(ABORT,'manual_reversal_fulfillment_held'); END;
--> statement-breakpoint
CREATE TRIGGER manual_reversal_parcel_held BEFORE INSERT ON shipping_jobs WHEN EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=NEW.order_id AND e.kind='receipt_reversal' AND e.state<>'resolved') BEGIN SELECT RAISE(ABORT,'manual_reversal_fulfillment_held'); END;

--> statement-breakpoint
-- The allocation is inserted before a newly posted cash record in the same guarded transaction.
CREATE TABLE cod_company_receipt_allocations(id TEXT PRIMARY KEY,receipt_use_id TEXT NOT NULL UNIQUE REFERENCES manual_receipt_uses(id),receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),shipping_job_id TEXT NOT NULL REFERENCES shipping_jobs(id),cash_record_id TEXT NOT NULL,amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),approved_by TEXT NOT NULL REFERENCES users(id),evidence_reference TEXT NOT NULL,created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX cod_receipt_job ON cod_company_receipt_allocations(shipping_job_id);
--> statement-breakpoint
CREATE INDEX cod_receipt_cash_record ON cod_company_receipt_allocations(cash_record_id);
--> statement-breakpoint
CREATE TABLE cod_approved_deductions(id TEXT PRIMARY KEY,shipping_job_id TEXT NOT NULL REFERENCES shipping_jobs(id),courier_cost_id TEXT NOT NULL REFERENCES parcel_courier_costs(id),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),approved_by TEXT NOT NULL REFERENCES users(id),terms_evidence TEXT NOT NULL,party_allocation_json TEXT NOT NULL CHECK(json_valid(party_allocation_json)),created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TRIGGER cod_receipt_allocation_cap BEFORE INSERT ON cod_company_receipt_allocations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM manual_receipt_uses u JOIN company_money_receipts r ON r.id=u.receipt_id WHERE u.id=NEW.receipt_use_id AND u.kind='cod' AND u.target_id=NEW.shipping_job_id AND u.receipt_id=NEW.receipt_id AND u.amount_minor=NEW.amount_paisa AND u.state='allocated' AND r.status='verified' AND r.currency='NPR') OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin') THEN RAISE(ABORT,'cod_actual_receipt_required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM shipping_parcels p WHERE p.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.shipping_job_id=p.shipping_job_id),0)+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0)<=p.collected_paisa) THEN RAISE(ABORT,'cod_collection_allocation_exceeded') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM parcel_cash_records c WHERE c.id=NEW.cash_record_id AND (c.shipping_job_id<>NEW.shipping_job_id OR c.kind<>'remittance' OR c.status NOT IN('pending','posted') OR NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=c.id),0)>c.amount_paisa)) THEN RAISE(ABORT,'cod_claim_allocation_changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER cod_deduction_cap BEFORE INSERT ON cod_approved_deductions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM parcel_courier_costs c WHERE c.id=NEW.courier_cost_id AND c.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.courier_cost_id=c.id),0)<=c.amount_paisa) OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=NEW.approved_by AND u.status='active' AND r.role='super_admin') OR COALESCE(json_extract(NEW.party_allocation_json,'$.party'),'')<>'company' THEN RAISE(ABORT,'cod_authorized_company_cost_required') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM shipping_parcels p WHERE p.shipping_job_id=NEW.shipping_job_id AND NEW.amount_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.shipping_job_id=p.shipping_job_id),0)+COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0)<=p.collected_paisa) THEN RAISE(ABORT,'cod_collection_allocation_exceeded') END;
END;
--> statement-breakpoint
CREATE TRIGGER cod_posted_receipt_insert BEFORE INSERT ON parcel_cash_records WHEN NEW.kind='remittance' AND NEW.status='posted' AND NEW.amount_paisa<>COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=NEW.id AND a.shipping_job_id=NEW.shipping_job_id AND a.approved_by=NEW.approved_by),0) BEGIN SELECT RAISE(ABORT,'cod_actual_receipt_allocation_required'); END;
--> statement-breakpoint
CREATE TRIGGER cod_posted_receipt_update BEFORE UPDATE ON parcel_cash_records WHEN OLD.status<>'posted' AND NEW.kind='remittance' AND NEW.status='posted' AND NEW.amount_paisa<>COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a WHERE a.cash_record_id=NEW.id AND a.shipping_job_id=NEW.shipping_job_id AND a.approved_by=NEW.approved_by),0) BEGIN SELECT RAISE(ABORT,'cod_actual_receipt_allocation_required'); END;
--> statement-breakpoint
CREATE TRIGGER cod_receipt_allocations_immutable BEFORE UPDATE ON cod_company_receipt_allocations BEGIN SELECT RAISE(ABORT,'cod_receipt_allocations_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER cod_receipt_allocations_retained BEFORE DELETE ON cod_company_receipt_allocations BEGIN SELECT RAISE(ABORT,'cod_receipt_allocations_retained'); END;
--> statement-breakpoint
CREATE TRIGGER cod_deductions_immutable BEFORE UPDATE ON cod_approved_deductions BEGIN SELECT RAISE(ABORT,'cod_deductions_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER cod_deductions_retained BEFORE DELETE ON cod_approved_deductions BEGIN SELECT RAISE(ABORT,'cod_deductions_retained'); END;
--> statement-breakpoint
CREATE VIEW cod_reconciliation_balances AS SELECT p.shipping_job_id,p.cod_due_paisa,p.collected_paisa,p.remitted_paisa AS reported_remittance_paisa,
 COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a JOIN parcel_cash_records c ON c.id=a.cash_record_id WHERE a.shipping_job_id=p.shipping_job_id AND c.status='posted'),0) AS actual_cash_paisa,
 COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0) AS approved_deductions_paisa,
 p.collected_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM cod_company_receipt_allocations a JOIN parcel_cash_records c ON c.id=a.cash_record_id WHERE a.shipping_job_id=p.shipping_job_id AND c.status='posted'),0)-COALESCE((SELECT SUM(d.amount_paisa) FROM cod_approved_deductions d WHERE d.shipping_job_id=p.shipping_job_id),0) AS remaining_paisa,
 EXISTS(SELECT 1 FROM manual_payment_exceptions e JOIN shipping_jobs j ON j.order_id=e.order_id WHERE j.id=p.shipping_job_id AND e.kind='receipt_reversal' AND e.state<>'resolved') AS correction_held
 FROM shipping_parcels p;

--> statement-breakpoint
CREATE TABLE manual_payment_exception_events(id TEXT PRIMARY KEY,exception_id TEXT NOT NULL REFERENCES manual_payment_exceptions(id),revision INTEGER NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),owner_id TEXT REFERENCES users(id),backup_id TEXT REFERENCES users(id),state TEXT NOT NULL,note TEXT NOT NULL,next_update_at INTEGER NOT NULL,created_at INTEGER NOT NULL,UNIQUE(exception_id,revision));
--> statement-breakpoint
CREATE TRIGGER manual_exception_events_immutable BEFORE UPDATE ON manual_payment_exception_events BEGIN SELECT RAISE(ABORT,'manual_exception_events_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER manual_exception_events_retained BEFORE DELETE ON manual_payment_exception_events BEGIN SELECT RAISE(ABORT,'manual_exception_events_retained'); END;
