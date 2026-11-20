-- Source under implementation; canonical/live execution remains held.
CREATE TABLE seller_recovery_receipt_reversal_reviews(
 id TEXT PRIMARY KEY,reversal_id TEXT NOT NULL UNIQUE REFERENCES company_receipt_reversals(id),receipt_id TEXT NOT NULL REFERENCES company_money_receipts(id),
 receipt_revision INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN('planned','completed')),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 unallocated_paisa INTEGER NOT NULL CHECK(unallocated_paisa>=0 AND unallocated_paisa<=amount_paisa),source_json TEXT NOT NULL CHECK(json_valid(source_json)),plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
 actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,completed_at INTEGER,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE seller_recovery_receipt_reversal_parts(
 id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES seller_recovery_receipt_reversal_reviews(id),case_id TEXT NOT NULL REFERENCES seller_recovery_cases(id),case_revision INTEGER NOT NULL,
 allocation_id TEXT NOT NULL REFERENCES seller_recovery_allocations(id),amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 company_loss_paisa INTEGER NOT NULL CHECK(company_loss_paisa>=0 AND company_loss_paisa<=amount_paisa),
 registered_debit_id TEXT UNIQUE REFERENCES seller_ledger_entries(id),managed_debit_id TEXT UNIQUE REFERENCES managed_settlement_entries(id),fixed_obligation_id TEXT REFERENCES managed_supplier_obligations(id),
 registered_company_credit_id TEXT UNIQUE REFERENCES seller_ledger_entries(id),managed_company_credit_id TEXT UNIQUE REFERENCES managed_settlement_entries(id),
 UNIQUE(review_id,allocation_id)
);
--> statement-breakpoint
CREATE TABLE seller_recovery_restoration_reclassifications(
 id TEXT PRIMARY KEY,part_id TEXT NOT NULL REFERENCES seller_recovery_receipt_reversal_parts(id),restoration_id TEXT NOT NULL,amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),UNIQUE(part_id,restoration_id)
);
--> statement-breakpoint
CREATE INDEX recovery_receipt_reversal_case ON seller_recovery_receipt_reversal_parts(case_id,allocation_id);
--> statement-breakpoint
CREATE INDEX recovery_receipt_reversal_receipt ON seller_recovery_receipt_reversal_reviews(receipt_id,state);
--> statement-breakpoint
CREATE VIEW seller_recovery_reversed_allocations AS SELECT part.allocation_id,part.case_id,SUM(part.amount_paisa) amount_paisa,SUM(part.company_loss_paisa) company_loss_paisa FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id WHERE review.state='completed' GROUP BY part.allocation_id,part.case_id;
--> statement-breakpoint
CREATE VIEW seller_recovery_raw_restorations AS
 SELECT id,case_id,allocation_id,method,amount_paisa,correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,review_id AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_restorations
 UNION ALL SELECT id,case_id,allocation_id,method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,review_id AS payout_return_review_id FROM seller_recovery_payout_return_restorations
 UNION ALL SELECT id,case_id,allocation_id,'carrier' AS method,amount_paisa,NULL AS correction_id,NULL AS carrier_review_id,NULL AS payout_return_review_id FROM seller_recovery_carrier_unpaid_reviews;
--> statement-breakpoint
DROP VIEW seller_recovery_all_restorations;
--> statement-breakpoint
CREATE VIEW seller_recovery_all_restorations AS SELECT original.id,original.case_id,original.allocation_id,original.method,
 original.amount_paisa-COALESCE((SELECT SUM(reclass.amount_paisa) FROM seller_recovery_restoration_reclassifications reclass JOIN seller_recovery_receipt_reversal_parts part ON part.id=reclass.part_id JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id WHERE reclass.restoration_id=original.id AND part.case_id=original.case_id AND part.allocation_id=original.allocation_id AND review.state='completed'),0) amount_paisa,
 original.correction_id,original.carrier_review_id,original.payout_return_review_id FROM seller_recovery_raw_restorations original;
--> statement-breakpoint
DROP VIEW seller_recovery_original_source_pools;
--> statement-breakpoint
CREATE VIEW seller_recovery_original_source_pools AS SELECT 'registered' payout_model,pool.* FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.refundId,native_source.sellerId,native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.remainingPaisa AS nativeRemainingPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   (COALESCE((SELECT SUM(original.amount_paisa) FROM seller_ledger_entries original WHERE original.order_item_id=native_source.scopeId AND original.seller_id=native_source.sellerId
    AND (original.type IN('sale','commission','reserve_release') OR original.amount_paisa<0 AND original.type NOT IN('refund','commission_reversal','payout','recovery_receipt_reversal'))),0)-COALESCE((SELECT SUM(paid.scopeAmount) FROM (SELECT p.id,SUM(x.amount_paisa) scopeAmount FROM payouts p JOIN payout_entries included ON included.payout_id=p.id JOIN seller_ledger_entries x ON x.id=included.ledger_entry_id
  WHERE p.seller_id=native_source.sellerId AND p.status='paid' AND included.released_at IS NULL AND x.seller_id=native_source.sellerId AND x.order_item_id=native_source.scopeId AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.registered_payout_id=p.id AND t.payout_model='registered' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id) GROUP BY p.id HAVING SUM(x.amount_paisa)>0) paid),0)) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT r.id AS refundId,i.seller_id AS sellerId,i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  
  WHERE r.id=r.id AND i.seller_id=i.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0 
  AND NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN payouts retired_native ON retired_native.id=retired.payout_id 
  WHERE retired.payout_model='registered' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM payout_entries retired_entry WHERE retired_entry.payout_id=retired_native.id AND retired_entry.released_at IS NULL)) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.registered_payout_id=pe.payout_id AND t.payout_model='registered' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM payouts original WHERE original.id=pe.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE NOT EXISTS(SELECT 1 FROM seller_ledger_entries reserve WHERE reserve.seller_id=native_source.sellerId AND reserve.order_item_id=native_source.orderItemId AND reserve.type IN('reserve_hold','reserve_release') GROUP BY reserve.order_item_id HAVING SUM(reserve.amount_paisa)<0)) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) pool
UNION ALL
SELECT 'managed' payout_model,pool.* FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.refundId,native_source.sellerId,native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.remainingPaisa AS nativeRemainingPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   (COALESCE((SELECT SUM(original.amount_paisa) FROM managed_settlement_entries original JOIN managed_entitlements entitlement ON entitlement.id=original.entitlement_id
    WHERE original.entitlement_id=native_source.scopeId AND entitlement.seller_id=native_source.sellerId AND (original.type='earned' OR original.amount_paisa<0
    AND COALESCE(original.reason_code,'')<>'recovery_receipt_reversal' AND original.type<>'refund_adjustment' AND NOT(original.type='dispute_adjustment' AND original.reason_code='refund_responsibility'))),0)-(COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
  WHERE a.entitlement_id=native_source.scopeId AND a.amount_paisa>0 AND a.disposition='paid' AND p.seller_id=native_source.sellerId AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id)),0)
  +COALESCE((SELECT SUM(paid.scopeAmount) FROM (SELECT p.id,SUM(x.amount_paisa) scopeAmount FROM managed_payouts p JOIN managed_payout_entries included ON included.payout_id=p.id JOIN managed_settlement_entries x ON x.id=included.settlement_entry_id
   WHERE p.seller_id=native_source.sellerId AND p.status='paid' AND x.entitlement_id=native_source.scopeId AND EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=native_source.sellerId AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=p.id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id) AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid') GROUP BY p.id HAVING SUM(x.amount_paisa)>0) paid),0))) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT r.id AS refundId,i.seller_id AS sellerId,i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=r.id AND i.seller_id=i.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0 
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id 
  WHERE retired.payout_model='managed' AND retired.payout_id=a.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=a.payout_id AND t.payout_model='managed' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=a.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id)))
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id AND NOT (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id 
  WHERE retired.payout_model='managed' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')) OR EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.managed_payout_id=pe.payout_id AND t.payout_model='managed' AND t.seller_id=i.seller_id AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM managed_payouts original WHERE original.id=pe.payout_id AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa
  
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE 1) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) pool;
--> statement-breakpoint
DROP TRIGGER recovery_allocation_cap;
--> statement-breakpoint
DROP TRIGGER recovery_receipt_cap;
--> statement-breakpoint
DROP TRIGGER manual_receipt_recovery_cap;
--> statement-breakpoint
DROP TRIGGER recovery_reduction_cap;
--> statement-breakpoint
DROP TRIGGER recovery_correction_current_source;
--> statement-breakpoint
DROP TRIGGER recovery_restoration_source;
--> statement-breakpoint
DROP TRIGGER recovery_correction_projection;
--> statement-breakpoint
DROP TRIGGER recovery_unpaid_correction_source;
--> statement-breakpoint
DROP TRIGGER recovery_carrier_current_source;
--> statement-breakpoint
DROP TRIGGER recovery_carrier_restoration_source;
--> statement-breakpoint
DROP TRIGGER recovery_correction_carrier_boundary;
--> statement-breakpoint
DROP TRIGGER recovery_payout_return_current;
--> statement-breakpoint
DROP TRIGGER recovery_payout_return_restoration;
--> statement-breakpoint
DROP TRIGGER recovery_carrier_unpaid_source;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_review_source BEFORE INSERT ON seller_recovery_receipt_reversal_reviews
WHEN NEW.state<>'planned' OR NEW.completed_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversal JOIN company_money_receipts receipt ON receipt.id=reversal.receipt_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE reversal.id=NEW.reversal_id AND reversal.receipt_id=NEW.receipt_id AND reversal.amount_minor=NEW.amount_paisa AND control.revision=NEW.receipt_revision AND receipt.kind='bank_credit' AND receipt.currency='NPR' AND actor.status='active' AND COALESCE(receipt.payer_user_id,'')<>actor.id
 AND NEW.unallocated_paisa<=receipt.amount_minor-COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.receipt_id=receipt.id),0)-COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=receipt.id AND u.state<>'released'),0)-COALESCE((SELECT SUM(prior.unallocated_paisa) FROM seller_recovery_receipt_reversal_reviews prior WHERE prior.receipt_id=receipt.id),0)
 AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=receipt.id AND conflict.user_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN seller_recovery_cases c ON c.id=a.case_id JOIN seller_profiles seller ON seller.id=c.seller_id WHERE a.receipt_id=receipt.id AND (seller.user_id=actor.id OR json_extract(c.original_source_json,'$.ownerId')=actor.id OR json_extract(c.original_source_json,'$.customerId')=actor.id)))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_immutable_0_update BEFORE UPDATE ON seller_recovery_receipt_reversal_parts
WHEN 1
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_immutable_0_delete BEFORE DELETE ON seller_recovery_receipt_reversal_parts
WHEN 1
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_immutable_1_update BEFORE UPDATE ON seller_recovery_restoration_reclassifications
WHEN 1
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_immutable_1_delete BEFORE DELETE ON seller_recovery_restoration_reclassifications
WHEN 1
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_review_completion BEFORE UPDATE ON seller_recovery_receipt_reversal_reviews
WHEN OLD.state<>'planned' OR NEW.state<>'completed' OR NEW.completed_at IS NULL OR NEW.id<>OLD.id OR NEW.reversal_id<>OLD.reversal_id OR NEW.receipt_id<>OLD.receipt_id OR NEW.receipt_revision<>OLD.receipt_revision OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.unallocated_paisa<>OLD.unallocated_paisa OR NEW.source_json<>OLD.source_json OR NEW.plan_json<>OLD.plan_json OR NEW.actor_id<>OLD.actor_id OR NEW.request_id<>OLD.request_id OR NEW.created_at<>OLD.created_at OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.reason<>OLD.reason OR NEW.public_message<>OLD.public_message
 OR NOT EXISTS(SELECT 1 FROM company_receipt_controls control JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin' WHERE control.receipt_id=NEW.receipt_id AND control.revision=NEW.receipt_revision+1 AND actor.status='active')
 OR NEW.amount_paisa<>NEW.unallocated_paisa+COALESCE((SELECT SUM(part.amount_paisa) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id),0)
 OR (SELECT COUNT(*) FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id)<>json_array_length(NEW.plan_json,'$.parts')
 OR EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_parts part WHERE part.review_id=NEW.id AND part.company_loss_paisa<>COALESCE((SELECT SUM(reclass.amount_paisa) FROM seller_recovery_restoration_reclassifications reclass WHERE reclass.part_id=part.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_complete_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_part_source BEFORE INSERT ON seller_recovery_receipt_reversal_parts
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN company_receipt_controls control ON control.receipt_id=review.receipt_id JOIN seller_recovery_allocations a ON a.id=NEW.allocation_id JOIN seller_recovery_cases c ON c.id=a.case_id
 WHERE review.id=NEW.review_id AND review.state='planned' AND control.revision=review.receipt_revision+1 AND a.receipt_id=review.receipt_id AND c.id=NEW.case_id AND c.revision=NEW.case_revision
 AND EXISTS(SELECT 1 FROM json_each(review.plan_json,'$.parts') planned WHERE json_extract(planned.value,'$.id') IS NEW.id AND json_extract(planned.value,'$.allocationId') IS NEW.allocation_id AND json_extract(planned.value,'$.caseId') IS NEW.case_id AND json_extract(planned.value,'$.caseRevision') IS NEW.case_revision AND json_extract(planned.value,'$.amountPaisa') IS NEW.amount_paisa AND json_extract(planned.value,'$.companyLossPaisa') IS NEW.company_loss_paisa AND json_extract(planned.value,'$.registeredDebitId') IS NEW.registered_debit_id AND json_extract(planned.value,'$.managedDebitId') IS NEW.managed_debit_id AND json_extract(planned.value,'$.fixedObligationId') IS NEW.fixed_obligation_id AND json_extract(planned.value,'$.registeredCompanyCreditId') IS NEW.registered_company_credit_id AND json_extract(planned.value,'$.managedCompanyCreditId') IS NEW.managed_company_credit_id)
 AND NEW.amount_paisa<=a.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_receipt_reversal_parts prior WHERE prior.allocation_id=a.id),0)
 AND (c.payout_model='registered' AND NEW.managed_debit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND NEW.managed_company_credit_id IS NULL
  AND EXISTS(SELECT 1 FROM seller_ledger_entries debit JOIN seller_ledger_entries original ON original.id=a.registered_credit_id WHERE debit.id=NEW.registered_debit_id AND debit.seller_id=c.seller_id AND debit.order_item_id=original.order_item_id AND debit.type='recovery_receipt_reversal' AND debit.amount_paisa=-NEW.amount_paisa)
  AND (NEW.company_loss_paisa=0 AND NEW.registered_company_credit_id IS NULL OR EXISTS(SELECT 1 FROM seller_ledger_entries credit JOIN seller_ledger_entries debit ON debit.id=NEW.registered_debit_id WHERE credit.id=NEW.registered_company_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=debit.order_item_id AND credit.type='recovery_bank_loss' AND credit.amount_paisa=NEW.company_loss_paisa AND NEW.company_loss_paisa>0))
 OR c.payout_model='managed' AND NEW.registered_debit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND NEW.registered_company_credit_id IS NULL
  AND EXISTS(SELECT 1 FROM managed_settlement_entries debit JOIN managed_settlement_entries original ON original.id=a.managed_credit_id WHERE debit.id=NEW.managed_debit_id AND debit.entitlement_id=original.entitlement_id AND debit.refund_id=c.refund_id AND debit.reason_code='recovery_receipt_reversal' AND debit.amount_paisa=-NEW.amount_paisa AND json_extract(debit.metadata_json,'$.partId')=NEW.id AND json_extract(debit.metadata_json,'$.reviewId')=review.id)
  AND (NEW.company_loss_paisa=0 AND NEW.managed_company_credit_id IS NULL OR EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_settlement_entries debit ON debit.id=NEW.managed_debit_id WHERE credit.id=NEW.managed_company_credit_id AND credit.entitlement_id=debit.entitlement_id AND credit.refund_id=c.refund_id AND credit.reason_code='recovery_bank_loss' AND credit.amount_paisa=NEW.company_loss_paisa AND NEW.company_loss_paisa>0))
 OR c.payout_model='fixed' AND NEW.registered_debit_id IS NULL AND NEW.managed_debit_id IS NULL AND NEW.registered_company_credit_id IS NULL AND NEW.managed_company_credit_id IS NULL
  AND EXISTS(SELECT 1 FROM managed_supplier_recovery_credits original JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id WHERE original.id=a.fixed_credit_id AND original.case_id=c.id AND original.obligation_id=NEW.fixed_obligation_id AND adjustment.obligation_id=NEW.fixed_obligation_id)))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_exact_attribution_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_part_loss BEFORE INSERT ON seller_recovery_receipt_reversal_parts
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN seller_recovery_receipt_reversal_reviews review ON review.id=NEW.review_id WHERE a.id=NEW.allocation_id
 AND NEW.company_loss_paisa=(CASE WHEN (COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=NEW.allocation_id),0)-(a.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_receipt_reversal_parts prior WHERE prior.allocation_id=a.id),0)-NEW.amount_paisa))>0 THEN (COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=NEW.allocation_id),0)-(a.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_receipt_reversal_parts prior WHERE prior.allocation_id=a.id),0)-NEW.amount_paisa)) ELSE 0 END)
 AND (NEW.company_loss_paisa=0 OR EXISTS(SELECT 1 FROM json_each(review.plan_json,'$.parts') planned WHERE json_extract(planned.value,'$.id') IS NEW.id AND json_extract(planned.value,'$.companyLossApproved') IS 1)))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_exact_company_loss_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_registered_entry_source BEFORE INSERT ON seller_ledger_entries
WHEN NEW.type IN('recovery_receipt_reversal','recovery_bank_loss') AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN seller_recovery_cases c ON c.seller_id=NEW.seller_id WHERE review.state='planned' AND c.payout_model='registered' AND abs(NEW.amount_paisa)<=review.amount_paisa AND (NEW.type='recovery_receipt_reversal' AND NEW.amount_paisa<0 AND EXISTS(SELECT 1 FROM json_each(review.plan_json,'$.parts') planned WHERE json_extract(planned.value,'$.caseId') IS c.id AND json_extract(planned.value,'$.caseRevision') IS c.revision AND json_extract(planned.value,'$.registeredDebitId') IS NEW.id AND json_extract(planned.value,'$.amountPaisa') IS -NEW.amount_paisa) OR NEW.type='recovery_bank_loss' AND NEW.amount_paisa>0 AND EXISTS(SELECT 1 FROM json_each(review.plan_json,'$.parts') planned WHERE json_extract(planned.value,'$.caseId') IS c.id AND json_extract(planned.value,'$.caseRevision') IS c.revision AND json_extract(planned.value,'$.registeredCompanyCreditId') IS NEW.id AND json_extract(planned.value,'$.companyLossPaisa') IS NEW.amount_paisa)))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_native_plan_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_managed_entry_source BEFORE INSERT ON managed_settlement_entries
WHEN NEW.reason_code IN('recovery_receipt_reversal','recovery_bank_loss') AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews review JOIN managed_entitlements entitlement ON entitlement.id=NEW.entitlement_id JOIN seller_recovery_cases c ON c.seller_id=entitlement.seller_id AND c.refund_id=NEW.refund_id WHERE review.id=json_extract(NEW.metadata_json,'$.reviewId') AND review.state='planned' AND c.payout_model='managed' AND NEW.created_by=review.actor_id AND abs(NEW.amount_paisa)<=review.amount_paisa AND (NEW.reason_code='recovery_receipt_reversal' AND NEW.amount_paisa<0 AND EXISTS(SELECT 1 FROM json_each(review.plan_json,'$.parts') planned WHERE json_extract(planned.value,'$.id') IS json_extract(NEW.metadata_json,'$.partId') AND json_extract(planned.value,'$.caseId') IS c.id AND json_extract(planned.value,'$.caseRevision') IS c.revision AND json_extract(planned.value,'$.managedDebitId') IS NEW.id AND json_extract(planned.value,'$.amountPaisa') IS -NEW.amount_paisa) OR NEW.reason_code='recovery_bank_loss' AND NEW.amount_paisa>0 AND EXISTS(SELECT 1 FROM json_each(review.plan_json,'$.parts') planned WHERE json_extract(planned.value,'$.id') IS json_extract(NEW.metadata_json,'$.partId') AND json_extract(planned.value,'$.caseId') IS c.id AND json_extract(planned.value,'$.caseRevision') IS c.revision AND json_extract(planned.value,'$.managedCompanyCreditId') IS NEW.id AND json_extract(planned.value,'$.companyLossPaisa') IS NEW.amount_paisa)))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_native_plan_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_registered_entry_update BEFORE UPDATE ON seller_ledger_entries
WHEN OLD.type IN('recovery_receipt_reversal','recovery_bank_loss') OR NEW.type IN('recovery_receipt_reversal','recovery_bank_loss')
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_native_entry_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_registered_entry_delete BEFORE DELETE ON seller_ledger_entries
WHEN OLD.type IN('recovery_receipt_reversal','recovery_bank_loss')
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_native_entry_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_managed_entry_update BEFORE UPDATE ON managed_settlement_entries
WHEN OLD.reason_code IN('recovery_receipt_reversal','recovery_bank_loss') OR NEW.reason_code IN('recovery_receipt_reversal','recovery_bank_loss')
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_native_entry_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_managed_entry_delete BEFORE DELETE ON managed_settlement_entries
WHEN OLD.reason_code IN('recovery_receipt_reversal','recovery_bank_loss')
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_native_entry_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_restoration_source BEFORE INSERT ON seller_recovery_restoration_reclassifications
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id JOIN seller_recovery_raw_restorations original ON original.id=NEW.restoration_id AND original.case_id=part.case_id AND original.allocation_id=part.allocation_id
 WHERE part.id=NEW.part_id AND review.state='planned' AND NEW.amount_paisa<=part.company_loss_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_restoration_reclassifications prior WHERE prior.part_id=part.id),0)
 AND NEW.amount_paisa<=original.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM seller_recovery_restoration_reclassifications prior WHERE prior.restoration_id=original.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_original_restoration_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_review_retained BEFORE DELETE ON seller_recovery_receipt_reversal_reviews
WHEN 1
BEGIN SELECT RAISE(ABORT,'recovery_receipt_reversal_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_allocation_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL AND (
 NEW.method IN('cash','earnings') AND c.state IN('open','part_recovered','repayment_plan','disputed') AND c.approved_by IS NOT NULL AND c.approved_cap_paisa<=c.confirmed_paisa
 AND NEW.amount_paisa<=c.approved_cap_paisa-c.absorbed_paisa-c.disputed_paisa-c.historical_recovered_paisa+c.restored_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)
 OR NEW.method='returned_payout' AND EXISTS(SELECT 1 FROM seller_recovery_payout_return_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa-review.principal_excess_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_payout_return_restorations r WHERE r.review_id=review.id AND r.kind='seller_collection'),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id)
 OR NEW.method='carrier' AND EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review WHERE review.case_id=c.id AND review.case_revision=c.revision AND review.allocation_id=NEW.id AND review.receipt_id=NEW.receipt_id AND review.amount_paisa=NEW.amount_paisa AND review.request_id=NEW.request_id AND review.actor_id=NEW.actor_id
 AND review.restored_paisa=COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.disputed_paisa+review.resolved_disputed_paisa-c.historical_recovered_paisa+c.restored_paisa+review.restored_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_remaining_cap_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_receipt_cap BEFORE INSERT ON seller_recovery_allocations
WHEN NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND r.status='verified' AND r.currency='NPR'
 AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.receipt_id=r.id AND e.kind='receipt_reversal' AND e.state<>'resolved')
 AND NEW.amount_paisa<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_receipt_balance_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER manual_receipt_recovery_cap BEFORE INSERT ON manual_receipt_uses
WHEN NOT EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=NEW.receipt_id
 AND NEW.amount_minor<=r.amount_minor-COALESCE((SELECT SUM(v.amount_minor) FROM company_receipt_reversals v WHERE v.receipt_id=r.id),0)
 -COALESCE((SELECT SUM(u.amount_minor) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.receipt_id=r.id),0))
BEGIN SELECT RAISE(ABORT,'manual_receipt_recovery_balance_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_reduction_cap BEFORE INSERT ON seller_recovery_reductions
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.blocker IS NULL
 AND c.approved_by IS NOT NULL AND c.state IN('open','part_recovered','disputed','repayment_plan')
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-c.historical_recovered_paisa+c.restored_paisa
 -COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_reduction_remaining_cap_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_current_source BEFORE INSERT ON seller_recovery_liability_corrections
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision
 AND c.confirmed_paisa=NEW.old_confirmed_paisa AND c.absorbed_paisa=NEW.old_absorbed_paisa AND c.blocker IS NULL
 AND NEW.restored_paisa=MAX(0,c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa-NEW.new_confirmed_paisa+NEW.new_absorbed_paisa)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (NOT (r.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed')))))
 AND (
  c.payout_model='registered' AND NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND
   (NEW.native_credit_paisa=0 AND NEW.registered_credit_id IS NULL OR EXISTS(SELECT 1 FROM seller_ledger_entries e WHERE e.id=NEW.registered_credit_id AND e.seller_id=c.seller_id AND e.type='recovery_correction' AND e.refund_id IS NULL AND e.amount_paisa=NEW.native_credit_paisa))
  OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL AND
   (NEW.native_credit_paisa=0 AND NEW.managed_credit_id IS NULL OR EXISTS(SELECT 1 FROM managed_settlement_entries e JOIN managed_entitlements entitlement ON entitlement.id=e.entitlement_id WHERE e.id=NEW.managed_credit_id AND entitlement.seller_id=c.seller_id AND e.refund_id=c.refund_id AND e.reason_code='recovery_correction' AND e.type='dispute_adjustment' AND e.amount_paisa=NEW.native_credit_paisa))
  OR c.payout_model='fixed' AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL AND EXISTS(SELECT 1 FROM managed_supplier_adjustments a JOIN managed_supplier_obligations o ON o.id=a.obligation_id WHERE a.id=c.supplier_adjustment_id AND o.id=NEW.fixed_obligation_id AND o.seller_id=c.seller_id)
 ))
BEGIN SELECT RAISE(ABORT,'recovery_correction_current_original_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_restoration_source BEFORE INSERT ON seller_recovery_restorations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections correction JOIN seller_recovery_cases c ON c.id=correction.case_id
 WHERE correction.id=NEW.correction_id AND c.id=NEW.case_id AND c.revision=correction.case_revision
 AND NEW.amount_paisa<=correction.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.correction_id=correction.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND NEW.amount_paisa<=(a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_restoration_original_collection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_projection BEFORE UPDATE ON seller_recovery_cases
WHEN NEW.liability_reduced_paisa<>COALESCE((SELECT SUM(x.old_confirmed_paisa-x.new_confirmed_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)
 OR NEW.restored_paisa<>COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_carrier_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.restored_paisa) FROM seller_recovery_payout_return_reviews x WHERE x.case_id=NEW.id),0)+COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=NEW.id),0)-COALESCE((SELECT SUM(part.company_loss_paisa) FROM seller_recovery_receipt_reversal_parts part JOIN seller_recovery_receipt_reversal_reviews review ON review.id=part.review_id WHERE part.case_id=NEW.id AND review.state='completed'),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=NEW.id AND x.restored_paisa<>COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_restorations r WHERE r.correction_id=x.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_correction_complete_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.disputed_paisa=0 AND (c.restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0) AND c.liability_reduced_paisa=0 OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.allocation_id=a.id AND review.case_id=a.case_id AND review.amount_paisa=a.amount_paisa AND a.method='carrier')) OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (NOT (receipt.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))))) AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_correction_current_source_required'); END;
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
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (NOT (r.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed')))))
 AND NEW.amount_paisa<=c.confirmed_paisa-c.absorbed_paisa-COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0)
 AND NEW.restored_paisa=MAX(0,c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))
BEGIN SELECT RAISE(ABORT,'recovery_carrier_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_restoration_source BEFORE INSERT ON seller_recovery_carrier_restorations
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_reviews review JOIN seller_recovery_cases c ON c.id=review.case_id WHERE review.id=NEW.review_id AND c.id=NEW.case_id AND c.revision=review.case_revision
 AND NEW.amount_paisa<=review.restored_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_carrier_restorations r WHERE r.review_id=review.id),0)
 AND (NEW.allocation_id IS NULL AND NEW.method='earnings' AND NEW.amount_paisa<=c.historical_recovered_paisa-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.case_id=c.id AND r.allocation_id IS NULL),0)
 OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=(a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0))))
BEGIN SELECT RAISE(ABORT,'recovery_carrier_original_collection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_correction_carrier_boundary BEFORE INSERT ON seller_recovery_liability_corrections
WHEN NEW.new_confirmed_paisa-NEW.new_absorbed_paisa<COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=NEW.case_id AND a.method='carrier'),0)
BEGIN SELECT RAISE(ABORT,'recovery_carrier_excess_needs_own_disposition'); END;
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
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (NOT (r.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed')))))
 AND c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa>=COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0) AND c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa<=c.confirmed_paisa-c.absorbed_paisa
 AND NEW.principal_excess_paisa=MAX(0,NEW.restored_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa)+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(restored.amount_paisa) FROM seller_recovery_all_restorations restored WHERE restored.allocation_id=a.id),0)) FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.method='carrier'),0))
 AND NEW.restored_paisa=MAX(0,c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-c.confirmed_paisa+c.absorbed_paisa)
 AND NEW.resolved_disputed_paisa<=c.disputed_paisa
 AND c.disputed_paisa-NEW.resolved_disputed_paisa<=c.confirmed_paisa-c.absorbed_paisa-(c.historical_recovered_paisa+COALESCE((SELECT SUM((a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)-c.restored_paisa+NEW.amount_paisa-NEW.restored_paisa))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_current_source_required'); END;
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
   OR EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.id=NEW.allocation_id AND a.id<>review.allocation_id AND a.case_id=c.id AND a.method=NEW.method AND a.method<>'carrier' AND NEW.amount_paisa<=(a.amount_paisa-COALESCE((SELECT reversed.amount_paisa FROM seller_recovery_reversed_allocations reversed WHERE reversed.allocation_id=a.id),0))-COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_all_restorations r WHERE r.allocation_id=a.id),0)))))
BEGIN SELECT RAISE(ABORT,'recovery_payout_return_original_collection_required'); END;
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
 AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=receipt.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed'))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.case_id=c.id AND (NOT (r.status IN('verified','reversed') AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals bank_reversal WHERE bank_reversal.receipt_id=r.id
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_receipt_reversal_reviews disposition WHERE disposition.reversal_id=bank_reversal.id AND disposition.receipt_id=bank_reversal.receipt_id AND disposition.amount_paisa=bank_reversal.amount_minor AND disposition.state='completed')))))
 )
BEGIN SELECT RAISE(ABORT,'recovery_carrier_unpaid_current_source_required'); END;
