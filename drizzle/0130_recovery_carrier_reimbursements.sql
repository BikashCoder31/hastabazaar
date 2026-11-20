-- Generated source only. Canonical and live execution remain held.
CREATE TABLE seller_recovery_carrier_reviews (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),receipt_revision INTEGER NOT NULL,allocation_id TEXT NOT NULL UNIQUE,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),restored_paisa INTEGER NOT NULL CHECK(restored_paisa>=0 AND restored_paisa<=amount_paisa),
 resolved_disputed_paisa INTEGER NOT NULL CHECK(resolved_disputed_paisa>=0 AND resolved_disputed_paisa<=amount_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE seller_recovery_carrier_restorations (
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES seller_recovery_carrier_reviews(id),case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),
 allocation_id TEXT REFERENCES seller_recovery_allocations(id),method TEXT NOT NULL CHECK(method IN('cash','earnings','returned_payout')),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991)
);
--> statement-breakpoint
CREATE VIEW seller_recovery_all_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id FROM seller_recovery_carrier_restorations;
--> statement-breakpoint
CREATE INDEX recovery_carrier_case ON seller_recovery_carrier_reviews(case_id);
--> statement-breakpoint
CREATE INDEX recovery_carrier_restored_allocation ON seller_recovery_carrier_restorations(allocation_id);
--> statement-breakpoint
CREATE UNIQUE INDEX recovery_carrier_historical_once ON seller_recovery_carrier_restorations(review_id) WHERE allocation_id IS NULL;
--> statement-breakpoint
DROP TRIGGER recovery_restoration_source;
--> statement-breakpoint
DROP TRIGGER recovery_correction_projection;
--> statement-breakpoint
DROP TRIGGER recovery_allocation_cap;
--> statement-breakpoint
CREATE TRIGGER recovery_restoration_source BEFORE INSERT ON seller_recovery_restorations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections correction JOIN seller_recovery_cases c ON c.id=correction.case_id
 WHERE correction.id=NEW.correction_id AND c.id=NEW.case_id AND c.revision=correction.case_revision
 AND NEW.amount_paisa<=correction.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.correction_id=correction.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_restoration_original_collection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_correction_complete_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_current_source BEFORE INSERT ON seller_recovery_carrier_reviews
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>0 AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0)
 AND NEW.restored_paisa=MAX(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))
BEGIN SELECT RAISE(ABORT,'recovery_carrier_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_restoration_source BEFORE INSERT ON seller_recovery_carrier_restorations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_carrier_original_collection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_complete_projection BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.revision>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews carrier_review WHERE carrier_review.case_id=NEW.id AND (
  NOT EXISTS(SELECT 1 FROM seller_recovery_allocations applied WHERE applied.id=carrier_review.allocation_id AND applied.case_id=carrier_review.case_id AND applied.method='carrier' AND applied.receipt_id=carrier_review.receipt_id AND applied.amount_paisa=carrier_review.amount_paisa AND applied.request_id=carrier_review.request_id)
  OR carrier_review.restored_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_carrier_restorations restored WHERE restored.review_id=carrier_review.id),0)))
BEGIN SELECT RAISE(ABORT,'recovery_carrier_complete_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_carrier_boundary BEFORE INSERT ON seller_recovery_liability_corrections
WHEN NEW.new_confirmed_paisa-NEW.new_absorbed_paisa<COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=NEW.case_id AND a.method='carrier'),0)
BEGIN SELECT RAISE(ABORT,'recovery_carrier_excess_needs_own_disposition'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_no_seller_gift BEFORE INSERT ON seller_recovery_restorations
WHEN EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.method='carrier')
BEGIN SELECT RAISE(ABORT,'recovery_carrier_excess_needs_own_disposition'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_carrier_reviews_update BEFORE UPDATE ON seller_recovery_carrier_reviews
BEGIN SELECT RAISE(ABORT,'recovery_carrier_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_carrier_reviews_delete BEFORE DELETE ON seller_recovery_carrier_reviews
BEGIN SELECT RAISE(ABORT,'recovery_carrier_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_carrier_restorations_update BEFORE UPDATE ON seller_recovery_carrier_restorations
BEGIN SELECT RAISE(ABORT,'recovery_carrier_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_carrier_restorations_delete BEFORE DELETE ON seller_recovery_carrier_restorations
BEGIN SELECT RAISE(ABORT,'recovery_carrier_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method<>'carrier' AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_remaining_cap_exceeded'); END;
