-- Generated source parity for 0131; execution remains held.
CREATE TABLE seller_recovery_partial_sources(
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),refund_id VARCHAR(191) NOT NULL UNIQUE REFERENCES refunds(id),
 order_item_id VARCHAR(191) NOT NULL REFERENCES order_items(id),scope_id VARCHAR(191) NOT NULL,
 basis_paisa BIGINT NOT NULL CHECK(basis_paisa>0 AND basis_paisa<=9007199254740991),
 native_charge_paisa BIGINT NOT NULL CHECK(native_charge_paisa>0 AND native_charge_paisa<=9007199254740991),
 capacity_paisa BIGINT NOT NULL CHECK(capacity_paisa>=0 AND capacity_paisa<=basis_paisa),
 used_paisa BIGINT NOT NULL CHECK(used_paisa>=0 AND used_paisa<=capacity_paisa),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<native_charge_paisa AND amount_paisa<=capacity_paisa-used_paisa),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,
 created_at BIGINT NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_partial_original_scope ON seller_recovery_partial_sources(seller_id,scope_id);

CREATE VIEW seller_recovery_original_unpaid_reviews AS
 SELECT id,case_id,seller_id,refund_id,order_item_id,scope_id,amount_paisa,amount_paisa AS native_charge_paisa FROM seller_recovery_unpaid_sources
 UNION ALL SELECT id,case_id,seller_id,refund_id,order_item_id,scope_id,amount_paisa,native_charge_paisa FROM seller_recovery_partial_sources;

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_partial_current BEFORE INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id AND c.payout_model IN('registered','managed')
 AND actor.status='active' AND seller.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_unpaid_sources x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews x WHERE x.case_id=c.id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_registered BEFORE INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   COALESCE((SELECT SUM(original.amount_paisa) FROM seller_ledger_entries original WHERE original.order_item_id=native_source.scopeId AND original.seller_id=NEW.seller_id
    AND (original.type IN('sale','commission','reserve_release') OR original.amount_paisa<0 AND original.type NOT IN('refund','commission_reversal','payout'))),0) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=NEW.seller_id AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='registered' AND used.seller_id=NEW.seller_id AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0 
  AND NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN payouts retired_native ON retired_native.id=retired.payout_id 
  WHERE retired.payout_model='registered' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM payout_entries retired_entry WHERE retired_entry.payout_id=retired_native.id AND retired_entry.released_at IS NULL))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE NOT EXISTS(SELECT 1 FROM seller_ledger_entries reserve WHERE reserve.seller_id=NEW.seller_id AND reserve.order_item_id=native_source.orderItemId AND reserve.type IN('reserve_hold','reserve_release') GROUP BY reserve.order_item_id HAVING SUM(reserve.amount_paisa)<0)) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) original
 WHERE original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa
 AND original.nativeDebitPaisa=NEW.native_charge_paisa AND original.capacityPaisa=NEW.capacity_paisa
 AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_shared_original_capacity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_managed BEFORE INSERT ON seller_recovery_partial_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM (SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   COALESCE((SELECT SUM(original.amount_paisa) FROM managed_settlement_entries original JOIN managed_entitlements entitlement ON entitlement.id=original.entitlement_id
    WHERE original.entitlement_id=native_source.scopeId AND entitlement.seller_id=NEW.seller_id AND (original.type='earned' OR original.amount_paisa<0
    AND original.type<>'refund_adjustment' AND NOT(original.type='dispute_adjustment' AND original.reason_code='refund_responsibility'))),0) AS capacityPaisa,COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=NEW.seller_id AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='managed' AND used.seller_id=NEW.seller_id AND used.scope_id=native_source.scopeId),0) AS usedPaisa FROM (SELECT i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0 
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id 
  WHERE retired.payout_model='managed' AND retired.payout_id=a.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released')))
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_payouts retired_native ON retired_native.id=retired.payout_id 
  WHERE retired.payout_model='managed' AND retired.payout_id=pe.payout_id AND retired.seller_id=i.seller_id AND retired_native.seller_id=retired.seller_id
  AND retired_native.status='rejected' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations retired_allocation WHERE retired_allocation.payout_id=retired_native.id AND retired_allocation.disposition<>'released'))) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa
  
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source WHERE 1) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa) original
 WHERE original.orderItemId=NEW.order_item_id AND original.scopeId=NEW.scope_id AND original.basisPaisa=NEW.basis_paisa
 AND original.nativeDebitPaisa=NEW.native_charge_paisa AND original.capacityPaisa=NEW.capacity_paisa
 AND original.usedPaisa=NEW.used_paisa AND original.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_shared_original_capacity_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_no_duplicate_unpaid BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_partial_sources x WHERE x.case_id=NEW.case_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_original_already_recognized'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.revision<>OLD.revision AND EXISTS(SELECT 1 FROM seller_recovery_partial_sources x WHERE x.case_id=NEW.id
 AND (NEW.confirmed_paisa<>x.native_charge_paisa-x.amount_paisa-COALESCE((SELECT SUM(c.old_confirmed_paisa-c.new_confirmed_paisa) FROM seller_recovery_liability_corrections c WHERE c.case_id=NEW.id),0)
 OR NEW.exposure_paisa<>NEW.confirmed_paisa))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_original_projection_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_partial_immutable BEFORE UPDATE ON seller_recovery_partial_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_original_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_partial_retained BEFORE DELETE ON seller_recovery_partial_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_partial_original_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.disputed_paisa=0 AND (c.restored_paisa=0 AND c.liability_reduced_paisa=0 OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id) OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (receipt.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id))) AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_registered BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_original_unpaid_reviews unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM seller_ledger_entries credit WHERE credit.id=NEW.registered_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=unpaid.order_item_id AND credit.type='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.description=CONCAT('Original recovery correction ',c.id))
 AND unpaid.native_charge_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=c.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_managed BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_original_unpaid_reviews unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_entitlements e ON e.id=credit.entitlement_id WHERE credit.id=NEW.managed_credit_id AND credit.entitlement_id=unpaid.scope_id AND e.seller_id=c.seller_id AND credit.refund_id=r.id AND credit.type='dispute_adjustment' AND credit.reason_code='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.created_by=NEW.actor_id AND json_extract(credit.metadata_json,'$.caseId')=c.id)
 AND unpaid.native_charge_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=unpaid.scope_id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
DELIMITER ;
