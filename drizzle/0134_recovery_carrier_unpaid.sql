-- Generated source only; canonical and live execution remain held.
CREATE TABLE seller_recovery_carrier_unpaid_reviews (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),receipt_revision INTEGER NOT NULL,allocation_id TEXT NOT NULL UNIQUE,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX recovery_carrier_unpaid_case ON seller_recovery_carrier_unpaid_reviews(case_id);
--> statement-breakpoint
DROP VIEW seller_recovery_all_restorations;
--> statement-breakpoint
CREATE VIEW seller_recovery_all_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,review_id AS payout_return_review_id FROM seller_recovery_payout_return_restorations
 UNION ALL SELECT id,case_id,allocation_id,'carrier' AS method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_unpaid_reviews;
--> statement-breakpoint
DROP TRIGGER recovery_carrier_current_source;
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
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-COALESCE((SELECT SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0)
 AND NEW.restored_paisa=MAX(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))
BEGIN SELECT RAISE(ABORT,'recovery_carrier_current_source_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_correction_carrier_boundary;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_carrier_boundary BEFORE INSERT ON seller_recovery_liability_corrections
WHEN NEW.new_confirmed_paisa-NEW.new_absorbed_paisa<COALESCE((SELECT SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=NEW.case_id AND a.method='carrier'),0)
BEGIN SELECT RAISE(ABORT,'recovery_carrier_excess_needs_own_disposition'); END;
--> statement-breakpoint
DROP TRIGGER recovery_payout_return_current;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_current BEFORE INSERT ON seller_recovery_payout_return_reviews
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa>=0 AND c.payout_model=NEW.payout_model AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND (receipt.payer_user_id IS NULL OR receipt.payer_user_id=seller.user_id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa>=COALESCE((SELECT SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0) AND c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa<=c.confirmed_paisa-c.absorbed_paisa
 AND NEW.principal_excess_paisa=MAX(0,NEW.restored_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa)+COALESCE((SELECT SUM(a.amount_paisa-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0))
 AND NEW.restored_paisa=MAX(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_current_source_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_allocation_cap;
--> statement-breakpoint
CREATE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method IN('cash','earnings') AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='returned_payout' AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa-review.principal_excess_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id)
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_remaining_cap_exceeded'); END;
--> statement-breakpoint
DROP TRIGGER recovery_correction_projection;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_payout_return_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=NEW.id),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_correction_complete_projection_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_unpaid_correction_source;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.disputed_paisa=0 AND (c.restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0) AND c.liability_reduced_paisa=0 OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.allocation_id=a.id AND review.case_id=a.case_id AND review.amount_paisa=a.amount_paisa AND a.method='carrier')) OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (receipt.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id))) AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_correction_current_source_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_unpaid_correction_fixed;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_correction_fixed BEFORE INSERT ON seller_recovery_unpaid_corrections
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed') AND NOT EXISTS(
 SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id
 JOIN managed_supplier_obligations o ON o.id=adjustment.obligation_id WHERE c.id=NEW.case_id AND o.seller_id=c.seller_id
 AND NEW.fixed_obligation_id=o.id AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND NEW.original_charge_paisa=adjustment.amount_paisa
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status<>'paid' AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_supplier_payments retired_native ON retired_native.id=retired.payout_id JOIN managed_supplier_obligations retired_obligation ON retired_obligation.id=retired_native.obligation_id
  WHERE retired.payout_model='fixed' AND retired.payout_id=p.id AND retired.seller_id=o.seller_id AND retired_obligation.seller_id=retired.seller_id
  AND retired_native.status='cancelled' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  ))
 AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN managed_supplier_payments p ON p.id=packet.supplier_payment_id WHERE p.obligation_id=o.id AND packet.state IN('processing','uncertain'))
 AND COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status='paid'),0)
  +COALESCE((SELECT SUM(prior.amount_paisa) FROM managed_supplier_adjustments prior WHERE prior.obligation_id=o.id AND (prior.created_at<adjustment.created_at OR prior.created_at=adjustment.created_at AND prior.id<=adjustment.id)),0)
  <=o.original_amount_paisa+NEW.previous_restored_paisa+COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_correction_native_credit_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_unpaid_source BEFORE INSERT ON seller_recovery_carrier_unpaid_reviews
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 JOIN company_money_receipts receipt ON receipt.id=NEW.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL  AND c.exposure_paisa=c.confirmed_paisa
 AND actor.status='active' AND actor.id<>seller.user_id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND control.revision=NEW.receipt_revision
 AND receipt.payer_user_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (r.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=r.id)))
 AND NEW.amount_paisa<=(CASE WHEN c.payout_model='fixed' AND c.confirmed_paisa=0 AND c.liability_reduced_paisa=0 AND COALESCE(json_extract(c.original_source_json,'$.confirmedPaisa'),-1)=0
 THEN COALESCE((SELECT a.amount_paisa FROM managed_supplier_adjustments a WHERE a.id=c.supplier_adjustment_id),0)
 WHEN c.payout_model IN('registered','managed') THEN COALESCE((SELECT unpaid.amount_paisa FROM seller_recovery_original_unpaid_reviews unpaid WHERE unpaid.case_id=c.id),0) ELSE 0 END)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_carrier_unpaid_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_unpaid_complete BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.revision<>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.case_id=OLD.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=review.allocation_id AND a.case_id=review.case_id AND a.method='carrier' AND a.receipt_id=review.receipt_id AND a.amount_paisa=review.amount_paisa AND a.request_id=review.request_id AND a.actor_id=review.actor_id))
BEGIN SELECT RAISE(ABORT,'recovery_carrier_unpaid_disposition_incomplete'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_carrier_boundary BEFORE INSERT ON seller_recovery_unpaid_corrections
WHEN NEW.original_charge_paisa-NEW.previous_restored_paisa-NEW.amount_paisa<COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=NEW.case_id),0)
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_carrier_excess_requires_disposition'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_unpaid_update BEFORE UPDATE ON seller_recovery_carrier_unpaid_reviews
BEGIN SELECT RAISE(ABORT,'recovery_carrier_unpaid_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_unpaid_delete BEFORE DELETE ON seller_recovery_carrier_unpaid_reviews
BEGIN SELECT RAISE(ABORT,'recovery_carrier_unpaid_history_retained'); END;
