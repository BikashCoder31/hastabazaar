-- Generated source only; canonical and live execution remain held.
CREATE TABLE seller_recovery_payout_return_reviews (
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed','fixed')),payout_id TEXT NOT NULL,scope_id TEXT NOT NULL,
 original_payout_paisa INTEGER NOT NULL CHECK(original_payout_paisa>0 AND original_payout_paisa<=9007199254740991),
 scope_paisa INTEGER NOT NULL CHECK(scope_paisa>0 AND scope_paisa<=9007199254740991),
 receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),receipt_revision INTEGER NOT NULL,allocation_id TEXT NOT NULL UNIQUE,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=original_payout_paisa AND amount_paisa<=scope_paisa),
 restored_paisa INTEGER NOT NULL CHECK(restored_paisa>=0 AND restored_paisa<=amount_paisa),
 principal_excess_paisa INTEGER NOT NULL CHECK(principal_excess_paisa>=0 AND principal_excess_paisa<=restored_paisa),
 resolved_disputed_paisa INTEGER NOT NULL CHECK(resolved_disputed_paisa>=0 AND resolved_disputed_paisa<=amount_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE seller_recovery_payout_return_pools (
 payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed','fixed')),payout_id TEXT NOT NULL,
 scope_id TEXT NOT NULL,principal_paisa INTEGER NOT NULL CHECK(principal_paisa>0 AND principal_paisa<=9007199254740991),
 used_paisa INTEGER NOT NULL CHECK(used_paisa>=0 AND used_paisa<=principal_paisa),
 PRIMARY KEY(payout_model,payout_id,scope_id)
);
--> statement-breakpoint
CREATE TABLE seller_recovery_payout_return_restorations (
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES seller_recovery_payout_return_reviews(id),case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),
 allocation_id TEXT REFERENCES seller_recovery_allocations(id),method TEXT NOT NULL CHECK(method IN('cash','earnings','returned_payout')),
 kind TEXT NOT NULL CHECK(kind IN('seller_collection','returned_principal')),
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991)
);
--> statement-breakpoint
CREATE INDEX recovery_payout_return_case ON seller_recovery_payout_return_reviews(case_id);
--> statement-breakpoint
CREATE INDEX recovery_payout_return_original ON seller_recovery_payout_return_reviews(payout_model,payout_id,scope_id);
--> statement-breakpoint
CREATE INDEX recovery_payout_return_restored ON seller_recovery_payout_return_restorations(allocation_id);
--> statement-breakpoint
CREATE INDEX recovery_payout_return_review ON seller_recovery_payout_return_restorations(review_id);
--> statement-breakpoint
DROP VIEW seller_recovery_all_restorations;
--> statement-breakpoint
CREATE VIEW seller_recovery_all_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,review_id AS payout_return_review_id FROM seller_recovery_payout_return_restorations;
--> statement-breakpoint
DROP TRIGGER recovery_correction_projection;
--> statement-breakpoint
DROP TRIGGER recovery_allocation_cap;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_payout_return_reviews x WHERE x.case_id=NEW.id),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_correction_complete_projection_required'); END;
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
 AND c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa>=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0) AND c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa<=c.confirmed_paisa-c.absorbed_paisa
 AND NEW.principal_excess_paisa=MAX(0,NEW.restored_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa)+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0))
 AND NEW.restored_paisa=MAX(0,c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_registered BEFORE INSERT ON seller_recovery_payout_return_reviews
WHEN NEW.payout_model='registered' AND NOT EXISTS(SELECT 1 FROM (SELECT * FROM (SELECT 'registered' AS model,p.id AS payoutId,t.id AS packetId,p.amount_paisa AS originalPayoutPaisa,t.bank_at AS bankAt,item.id AS scopeId,
  (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.order_item_id=item.id AND entry.seller_id=c.seller_id AND entry.type<>'payout') AS scopePaisa
  FROM seller_recovery_cases c JOIN refunds r ON c.source_kind='refund' AND r.id=c.source_id
  JOIN return_requests original_return ON original_return.id=r.return_request_id
  JOIN order_items item ON item.id=original_return.order_item_id AND item.seller_id=c.seller_id JOIN payouts p ON p.seller_id=c.seller_id JOIN seller_profiles seller ON seller.id=c.seller_id
  JOIN payout_transfer_packets t ON t.registered_payout_id=p.id
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa AND bank.account_version_id=t.account_version_id WHERE c.id=NEW.case_id AND c.payout_model='registered' AND p.status='paid' AND json_type(json_extract(c.original_source_json,'$.originalPayoutIds'))='array' AND EXISTS(SELECT 1 FROM json_each(json_extract(c.original_source_json,'$.originalPayoutIds')) original_ids WHERE original_ids.value=p.id)
  AND json_extract(c.original_source_json,'$.model')='registered'
  AND json_extract(t.source_snapshot_json,'$.ownerId')=seller.user_id
  AND json_extract(t.source_snapshot_json,'$.ownerId')=json_extract(c.original_source_json,'$.ownerId')
  AND json_extract(t.source_snapshot_json,'$.sellerId')=c.seller_id
  AND json_extract(t.source_snapshot_json,'$.model')='registered' AND json_extract(t.source_snapshot_json,'$.id')=p.id
  AND json_extract(t.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
  AND json_extract(t.source_snapshot_json,'$.destination')=p.destination_reference
  AND t.state='paid' AND t.payout_model='registered' AND t.seller_id=c.seller_id AND t.amount_paisa=p.amount_paisa
  AND t.amount_paisa>0 AND t.amount_paisa<=9007199254740991
  AND bank.bank_at=t.bank_at AND bank.transaction_identity=t.transaction_identity
  AND (SELECT COUNT(*) FROM payout_transfer_packets other WHERE other.registered_payout_id=p.id AND other.state='paid')=1
  AND (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type<>'payout')=p.amount_paisa
  AND (SELECT COUNT(*) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout')=1
  AND EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout' AND entry.payout_id=p.id AND entry.amount_paisa=-p.amount_paisa)
  AND NOT EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.seller_id<>c.seller_id)) original_paid_source WHERE scopePaisa>0 AND scopePaisa<=9007199254740991) original
 WHERE original.payoutId=NEW.payout_id AND original.scopeId=NEW.scope_id AND original.originalPayoutPaisa=NEW.original_payout_paisa AND original.scopePaisa=NEW.scope_paisa
 AND original.bankAt<=(SELECT bank_at FROM company_money_receipts WHERE id=NEW.receipt_id))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_original_paid_proof_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_managed BEFORE INSERT ON seller_recovery_payout_return_reviews
WHEN NEW.payout_model='managed' AND NOT EXISTS(SELECT 1 FROM (SELECT * FROM (SELECT 'managed' AS model,p.id AS payoutId,t.id AS packetId,p.amount_paisa AS originalPayoutPaisa,t.bank_at AS bankAt,entitlement.id AS scopeId,
  COALESCE((SELECT allocation.amount_paisa FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.entitlement_id=entitlement.id AND allocation.disposition='paid'),
   (SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND entry.entitlement_id=entitlement.id)) AS scopePaisa
  FROM seller_recovery_cases c JOIN refunds r ON c.source_kind='refund' AND r.id=c.source_id
  JOIN return_requests original_return ON original_return.id=r.return_request_id
  JOIN order_items item ON item.id=original_return.order_item_id AND item.seller_id=c.seller_id JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=item.id
  JOIN managed_entitlements entitlement ON entitlement.snapshot_id=snapshot.id AND entitlement.seller_id=c.seller_id
  JOIN managed_payouts p ON p.seller_id=c.seller_id JOIN seller_profiles seller ON seller.id=c.seller_id
  JOIN payout_transfer_packets t ON t.managed_payout_id=p.id
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa AND bank.account_version_id=t.account_version_id WHERE c.id=NEW.case_id AND c.payout_model='managed' AND p.status='paid' AND json_type(json_extract(c.original_source_json,'$.originalPayoutIds'))='array' AND EXISTS(SELECT 1 FROM json_each(json_extract(c.original_source_json,'$.originalPayoutIds')) original_ids WHERE original_ids.value=p.id)
  AND json_extract(c.original_source_json,'$.model')='managed'
  AND json_extract(t.source_snapshot_json,'$.ownerId')=seller.user_id
  AND json_extract(t.source_snapshot_json,'$.ownerId')=json_extract(c.original_source_json,'$.ownerId')
  AND json_extract(t.source_snapshot_json,'$.sellerId')=c.seller_id
  AND json_extract(t.source_snapshot_json,'$.model')='managed' AND json_extract(t.source_snapshot_json,'$.id')=p.id
  AND json_extract(t.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
  AND json_extract(t.source_snapshot_json,'$.destination')=p.destination_reference
  AND t.state='paid' AND t.payout_model='managed' AND t.seller_id=c.seller_id AND t.amount_paisa=p.amount_paisa
  AND t.amount_paisa>0 AND t.amount_paisa<=9007199254740991
  AND bank.bank_at=t.bank_at AND bank.transaction_identity=t.transaction_identity
  AND (SELECT COUNT(*) FROM payout_transfer_packets other WHERE other.managed_payout_id=p.id AND other.state='paid')=1
  AND COALESCE((SELECT SUM(allocation.amount_paisa) FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.entitlement_id=entry.entitlement_id AND allocation.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations allocation JOIN managed_entitlements e ON e.id=allocation.entitlement_id
   WHERE allocation.payout_id=p.id AND allocation.disposition='paid' AND e.seller_id<>c.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
   JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>c.seller_id)) original_paid_source WHERE scopePaisa>0 AND scopePaisa<=9007199254740991) original
 WHERE original.payoutId=NEW.payout_id AND original.scopeId=NEW.scope_id AND original.originalPayoutPaisa=NEW.original_payout_paisa AND original.scopePaisa=NEW.scope_paisa
 AND original.bankAt<=(SELECT bank_at FROM company_money_receipts WHERE id=NEW.receipt_id))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_original_paid_proof_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_fixed BEFORE INSERT ON seller_recovery_payout_return_reviews
WHEN NEW.payout_model='fixed' AND NOT EXISTS(SELECT 1 FROM (SELECT * FROM (SELECT 'fixed' AS model,p.id AS payoutId,t.id AS packetId,p.amount_paisa AS originalPayoutPaisa,t.bank_at AS bankAt,obligation.id AS scopeId,p.amount_paisa AS scopePaisa FROM seller_recovery_cases c
  JOIN managed_supplier_adjustments adjustment ON c.source_kind='supplier_adjustment' AND adjustment.id=c.source_id
  JOIN managed_supplier_obligations obligation ON obligation.id=adjustment.obligation_id AND obligation.seller_id=c.seller_id
  JOIN managed_supplier_payments p ON p.obligation_id=obligation.id JOIN seller_profiles seller ON seller.id=c.seller_id
  JOIN payout_transfer_packets t ON t.supplier_payment_id=p.id
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa AND bank.account_version_id=t.account_version_id WHERE c.id=NEW.case_id AND c.payout_model='fixed' AND p.status='paid' AND json_type(json_extract(c.original_source_json,'$.originalPayoutIds'))='array' AND EXISTS(SELECT 1 FROM json_each(json_extract(c.original_source_json,'$.originalPayoutIds')) original_ids WHERE original_ids.value=p.id)
  AND json_extract(c.original_source_json,'$.model')='fixed'
  AND json_extract(t.source_snapshot_json,'$.ownerId')=seller.user_id
  AND json_extract(t.source_snapshot_json,'$.ownerId')=json_extract(c.original_source_json,'$.ownerId')
  AND json_extract(t.source_snapshot_json,'$.sellerId')=c.seller_id
  AND json_extract(t.source_snapshot_json,'$.model')='fixed' AND json_extract(t.source_snapshot_json,'$.id')=p.id
  AND json_extract(t.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
  AND json_extract(t.source_snapshot_json,'$.destination')=p.destination_reference
  AND t.state='paid' AND t.payout_model='fixed' AND t.seller_id=c.seller_id AND t.amount_paisa=p.amount_paisa
  AND t.amount_paisa>0 AND t.amount_paisa<=9007199254740991
  AND bank.bank_at=t.bank_at AND bank.transaction_identity=t.transaction_identity
  AND (SELECT COUNT(*) FROM payout_transfer_packets other WHERE other.supplier_payment_id=p.id AND other.state='paid')=1
  AND json_extract(t.source_snapshot_json,'$.obligationId')=obligation.id) original_paid_source WHERE scopePaisa>0 AND scopePaisa<=9007199254740991) original
 WHERE original.payoutId=NEW.payout_id AND original.scopeId=NEW.scope_id AND original.originalPayoutPaisa=NEW.original_payout_paisa AND original.scopePaisa=NEW.scope_paisa
 AND original.bankAt<=(SELECT bank_at FROM company_money_receipts WHERE id=NEW.receipt_id))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_original_paid_proof_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_pool_insert BEFORE INSERT ON seller_recovery_payout_return_pools
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.payout_model=NEW.payout_model AND review.payout_id=NEW.payout_id AND (NEW.scope_id='' AND NEW.principal_paisa=review.original_payout_paisa OR NEW.scope_id=review.scope_id AND NEW.principal_paisa=review.scope_paisa)) OR NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_pools existing WHERE existing.payout_model=NEW.payout_model AND existing.payout_id=NEW.payout_id AND existing.scope_id=NEW.scope_id) AND NEW.used_paisa<>COALESCE((SELECT SUM(review.amount_paisa) FROM seller_recovery_payout_return_reviews review WHERE review.payout_model=NEW.payout_model AND review.payout_id=NEW.payout_id AND (NEW.scope_id='' OR review.scope_id=NEW.scope_id)),0)
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_pool_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_pool_update BEFORE UPDATE ON seller_recovery_payout_return_pools
WHEN NEW.payout_model<>OLD.payout_model OR NEW.payout_id<>OLD.payout_id OR NEW.scope_id<>OLD.scope_id OR NEW.principal_paisa<>OLD.principal_paisa OR NEW.used_paisa<OLD.used_paisa OR NEW.used_paisa<>COALESCE((SELECT SUM(review.amount_paisa) FROM seller_recovery_payout_return_reviews review WHERE review.payout_model=NEW.payout_model AND review.payout_id=NEW.payout_id AND (NEW.scope_id='' OR review.scope_id=NEW.scope_id)),0)
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_pool_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_pool_retained BEFORE DELETE ON seller_recovery_payout_return_pools
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_pool_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_restoration BEFORE INSERT ON seller_recovery_payout_return_restorations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.kind='returned_principal' AND NEW.method='returned_payout' AND NEW.allocation_id=review.allocation_id AND NEW.amount_paisa=review.principal_excess_paisa
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='returned_principal')
  AND EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method='returned_payout' AND a.receipt_id=review.receipt_id AND a.amount_paisa=review.amount_paisa)
 OR NEW.kind='seller_collection'
  AND NEW.amount_paisa<=review.restored_paisa-review.principal_excess_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
  AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
   OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.id<>review.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0)))))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_original_collection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_complete BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.revision>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews returned_review WHERE returned_review.case_id=NEW.id AND (
  NOT EXISTS(SELECT 1 FROM seller_recovery_allocations applied WHERE applied.id=returned_review.allocation_id AND applied.case_id=returned_review.case_id AND applied.method='returned_payout' AND applied.receipt_id=returned_review.receipt_id AND applied.amount_paisa=returned_review.amount_paisa AND applied.request_id=returned_review.request_id)
  OR returned_review.restored_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_payout_return_restorations restored WHERE restored.review_id=returned_review.id),0)
  OR returned_review.principal_excess_paisa<>COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_payout_return_restorations restored WHERE restored.review_id=returned_review.id AND restored.kind='returned_principal'),0)))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_complete_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_payout_return_reviews_update BEFORE UPDATE ON seller_recovery_payout_return_reviews
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_payout_return_reviews_delete BEFORE DELETE ON seller_recovery_payout_return_reviews
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_payout_return_restorations_update BEFORE UPDATE ON seller_recovery_payout_return_restorations
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER seller_recovery_payout_return_restorations_delete BEFORE DELETE ON seller_recovery_payout_return_restorations
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_history_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method IN('cash','earnings') AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='returned_payout' AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa-review.principal_excess_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_remaining_cap_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_payout_return_consume AFTER INSERT ON seller_recovery_payout_return_reviews BEGIN
INSERT INTO seller_recovery_payout_return_pools(payout_model,payout_id,scope_id,principal_paisa,used_paisa) VALUES(NEW.payout_model,NEW.payout_id,'',NEW.original_payout_paisa,NEW.amount_paisa)
 ON CONFLICT(payout_model,payout_id,scope_id) DO UPDATE SET used_paisa=used_paisa+excluded.used_paisa;
INSERT INTO seller_recovery_payout_return_pools(payout_model,payout_id,scope_id,principal_paisa,used_paisa) VALUES(NEW.payout_model,NEW.payout_id,NEW.scope_id,NEW.scope_paisa,NEW.amount_paisa)
 ON CONFLICT(payout_model,payout_id,scope_id) DO UPDATE SET used_paisa=used_paisa+excluded.used_paisa;
END;
