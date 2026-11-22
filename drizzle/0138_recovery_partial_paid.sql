-- Source only; canonical and live execution remain held.
CREATE VIEW seller_recovery_original_source_pools AS SELECT 'registered' payout_model,pool.* FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.refundId,native_source.sellerId,native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.remainingPaisa AS nativeRemainingPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   (COALESCE((SELECT SUM(original.amount_paisa) FROM seller_ledger_entries original WHERE original.order_item_id=native_source.scopeId AND original.seller_id=native_source.sellerId
    AND (original.type IN('sale','commission','reserve_release') OR original.amount_paisa<0 AND original.type NOT IN('refund','commission_reversal','payout'))),0)-COALESCE((SELECT SUM(paid.scopeAmount) FROM (SELECT p.id,SUM(x.amount_paisa) scopeAmount FROM payouts p JOIN payout_entries included ON included.payout_id=p.id JOIN seller_ledger_entries x ON x.id=included.ledger_entry_id
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
    AND original.type<>'refund_adjustment' AND NOT(original.type='dispute_adjustment' AND original.reason_code='refund_responsibility'))),0)-(COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
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
CREATE TABLE seller_recovery_original_unpaid_pools(payout_model TEXT NOT NULL CHECK(payout_model IN('registered','managed')),seller_id TEXT NOT NULL REFERENCES seller_profiles(id),scope_id TEXT NOT NULL,used_paisa INTEGER NOT NULL CHECK(used_paisa>=0 AND used_paisa<=9007199254740991),PRIMARY KEY(payout_model,seller_id,scope_id));
--> statement-breakpoint
INSERT INTO seller_recovery_original_unpaid_pools(payout_model,seller_id,scope_id,used_paisa) SELECT payout_model,seller_id,scope_id,SUM(amount_paisa) FROM (SELECT c.payout_model,u.seller_id,u.scope_id,u.amount_paisa FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id) u GROUP BY payout_model,seller_id,scope_id;
--> statement-breakpoint
DROP TRIGGER recovery_partial_registered;
--> statement-breakpoint
CREATE TRIGGER recovery_partial_registered BEFORE INSERT ON seller_recovery_partial_sources
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='registered' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.native_charge_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.partialUnpaidSource.nativeRemainingPaisa') AND original.capacityPaisa=NEW.capacity_paisa AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)
BEGIN SELECT RAISE(ABORT,'recovery_partial_shared_original_capacity_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_partial_managed;
--> statement-breakpoint
CREATE TRIGGER recovery_partial_managed BEFORE INSERT ON seller_recovery_partial_sources
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='managed' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.native_charge_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.partialUnpaidSource.nativeRemainingPaisa') AND original.capacityPaisa=NEW.capacity_paisa AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)
BEGIN SELECT RAISE(ABORT,'recovery_partial_shared_original_capacity_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_unpaid_registered_native_proof;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_registered_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered') AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='registered' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.amount_paisa AND original.offsetPaisa=NEW.amount_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.unpaidSource.nativeRemainingPaisa') AND original.capacityPaisa-original.usedPaisa-original.offsetPaisa=NEW.remaining_paisa)
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_original_proof_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_unpaid_managed_native_proof;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_managed_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed') AND NOT EXISTS(SELECT 1 FROM seller_recovery_original_source_pools original WHERE original.payout_model='managed' AND original.sellerId=NEW.seller_id AND original.refundId=NEW.refund_id
 AND original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa AND original.nativeDebitPaisa=NEW.amount_paisa AND original.offsetPaisa=NEW.amount_paisa
 AND original.nativeRemainingPaisa=json_extract(NEW.source_json,'$.unpaidSource.nativeRemainingPaisa') AND original.capacityPaisa-original.usedPaisa-original.offsetPaisa=NEW.remaining_paisa)
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_original_proof_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_original_pool_insert BEFORE INSERT ON seller_recovery_original_unpaid_pools
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_original_unpaid_pools p WHERE p.payout_model=NEW.payout_model AND p.seller_id=NEW.seller_id AND p.scope_id=NEW.scope_id) AND NEW.used_paisa<>COALESCE((SELECT SUM(u.amount_paisa) FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id WHERE c.payout_model=NEW.payout_model AND u.seller_id=NEW.seller_id AND u.scope_id=NEW.scope_id),0)
BEGIN SELECT RAISE(ABORT,'recovery_original_pool_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_original_pool_update BEFORE UPDATE ON seller_recovery_original_unpaid_pools
WHEN NEW.payout_model<>OLD.payout_model OR NEW.seller_id<>OLD.seller_id OR NEW.scope_id<>OLD.scope_id OR NEW.used_paisa<>COALESCE((SELECT SUM(u.amount_paisa) FROM seller_recovery_original_unpaid_reviews u JOIN seller_recovery_cases c ON c.id=u.case_id WHERE c.payout_model=NEW.payout_model AND u.seller_id=NEW.seller_id AND u.scope_id=NEW.scope_id),0)
BEGIN SELECT RAISE(ABORT,'recovery_original_pool_projection_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_original_pool_delete BEFORE DELETE ON seller_recovery_original_unpaid_pools
WHEN 1
BEGIN SELECT RAISE(ABORT,'recovery_original_pool_retained'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_original_pool_consume_0 AFTER INSERT ON seller_recovery_unpaid_sources BEGIN
INSERT INTO seller_recovery_original_unpaid_pools(payout_model,seller_id,scope_id,used_paisa) VALUES((SELECT payout_model FROM seller_recovery_cases WHERE id=NEW.case_id),NEW.seller_id,NEW.scope_id,NEW.amount_paisa) ON CONFLICT(payout_model,seller_id,scope_id) DO UPDATE SET used_paisa=CASE WHEN used_paisa=COALESCE(json_extract(NEW.source_json,'$.partialUnpaidSource.usedPaisa'),json_extract(NEW.source_json,'$.unpaidSource.usedPaisa'),-1) THEN used_paisa+NEW.amount_paisa ELSE -1 END;
END;
--> statement-breakpoint
CREATE TRIGGER recovery_original_pool_consume_1 AFTER INSERT ON seller_recovery_partial_sources BEGIN
INSERT INTO seller_recovery_original_unpaid_pools(payout_model,seller_id,scope_id,used_paisa) VALUES((SELECT payout_model FROM seller_recovery_cases WHERE id=NEW.case_id),NEW.seller_id,NEW.scope_id,NEW.amount_paisa) ON CONFLICT(payout_model,seller_id,scope_id) DO UPDATE SET used_paisa=CASE WHEN used_paisa=COALESCE(json_extract(NEW.source_json,'$.partialUnpaidSource.usedPaisa'),json_extract(NEW.source_json,'$.unpaidSource.usedPaisa'),-1) THEN used_paisa+NEW.amount_paisa ELSE -1 END;
END;
