-- Generated source parity for 0128. Canonical and live execution remain held.
CREATE TABLE seller_recovery_payout_retirements (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),payout_model VARCHAR(191) NOT NULL CHECK(payout_model IN('registered','managed','fixed')),
 payout_id VARCHAR(191) NOT NULL,original_status VARCHAR(191) NOT NULL,original_amount_paisa BIGINT NOT NULL CHECK(original_amount_paisa>0 AND original_amount_paisa<=9007199254740991),
 original_destination VARCHAR(191) NOT NULL,original_updated_at BIGINT NOT NULL,source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 UNIQUE(payout_model,payout_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_retirement_case ON seller_recovery_payout_retirements(case_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_retirement_original_proof BEFORE INSERT ON seller_recovery_payout_retirements FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles seller ON seller.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.payout_model=NEW.payout_model AND actor.status='active' AND seller.user_id<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND (NEW.payout_model='registered' AND EXISTS(SELECT 1 FROM (SELECT p.id,p.status,p.amount_paisa AS amountPaisa,p.destination_reference AS destination,p.updated_at AS updatedAt
  FROM payouts p  JOIN seller_recovery_cases c ON c.seller_id=p.seller_id AND c.payout_model='registered'
  WHERE c.id=NEW.case_id AND EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id
  JOIN return_requests request ON request.order_item_id=e.order_item_id JOIN refunds refund ON refund.return_request_id=request.id
  WHERE pe.payout_id=p.id AND e.seller_id=c.seller_id AND refund.id=c.refund_id) AND p.status IN('prepared','scheduled','approved','failed','rejected')
  AND p.paid_at IS NULL AND p.provider_reference IS NULL
  AND (p.processed_at IS NULL OR p.status='failed')
  AND (p.status<>'failed' OR EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id AND t.state='failed'))
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id AND (
  EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)
  OR NOT (t.state IN('prepared','approved','void') AND t.started_at IS NULL OR t.state='failed' AND
   EXISTS(SELECT 1 FROM audit_logs event WHERE event.action='payout.transfer.event' AND event.subject_type='payout_transfer' AND event.subject_id=t.id
    AND event.reason='outcome' AND json_extract(event.next_json,'$.input.outcome')='failed'
    AND json_extract(event.next_json,'$.input.failureBasis')=t.failure_basis
    AND (t.failure_basis IN('not_sent','no_debit') AND json_extract(event.next_json,'$.input.noDebitConfirmed')=1
     OR t.failure_basis='debit_returned' AND json_extract(event.next_json,'$.input.returnedDebitConfirmed')=1 AND json_extract(event.next_json,'$.input.returnedAmountPaisa')=t.amount_paisa)))))
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired WHERE retired.payout_model='registered' AND retired.payout_id=p.id)) original
 WHERE original.id=NEW.payout_id AND original.status=NEW.original_status AND original.amountPaisa=NEW.original_amount_paisa AND original.destination=NEW.original_destination AND original.updatedAt=NEW.original_updated_at) OR NEW.payout_model='managed' AND EXISTS(SELECT 1 FROM (SELECT p.id,p.status,p.amount_paisa AS amountPaisa,p.destination_reference AS destination,p.updated_at AS updatedAt
  FROM managed_payouts p  JOIN seller_recovery_cases c ON c.seller_id=p.seller_id AND c.payout_model='managed'
  WHERE c.id=NEW.case_id AND EXISTS(SELECT 1 FROM managed_entitlements e JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id
  JOIN return_requests request ON request.order_item_id=snapshot.order_item_id JOIN refunds refund ON refund.return_request_id=request.id
  WHERE e.seller_id=c.seller_id AND refund.id=c.refund_id AND (EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=e.id)
   OR EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE pe.payout_id=p.id AND x.entitlement_id=e.id))) AND p.status IN('prepared','scheduled','approved','failed','rejected')
  AND p.paid_at IS NULL AND p.provider_reference IS NULL
  
  AND (p.status<>'failed' OR EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id AND t.state='failed'))
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.managed_payout_id=p.id AND (
  EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)
  OR NOT (t.state IN('prepared','approved','void') AND t.started_at IS NULL OR t.state='failed' AND
   EXISTS(SELECT 1 FROM audit_logs event WHERE event.action='payout.transfer.event' AND event.subject_type='payout_transfer' AND event.subject_id=t.id
    AND event.reason='outcome' AND json_extract(event.next_json,'$.input.outcome')='failed'
    AND json_extract(event.next_json,'$.input.failureBasis')=t.failure_basis
    AND (t.failure_basis IN('not_sent','no_debit') AND json_extract(event.next_json,'$.input.noDebitConfirmed')=1
     OR t.failure_basis='debit_returned' AND json_extract(event.next_json,'$.input.returnedDebitConfirmed')=1 AND json_extract(event.next_json,'$.input.returnedAmountPaisa')=t.amount_paisa)))))
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired WHERE retired.payout_model='managed' AND retired.payout_id=p.id)) original
 WHERE original.id=NEW.payout_id AND original.status=NEW.original_status AND original.amountPaisa=NEW.original_amount_paisa AND original.destination=NEW.original_destination AND original.updatedAt=NEW.original_updated_at) OR NEW.payout_model='fixed' AND EXISTS(SELECT 1 FROM (SELECT p.id,p.status,p.amount_paisa AS amountPaisa,p.destination_reference AS destination,p.updated_at AS updatedAt
  FROM managed_supplier_payments p JOIN managed_supplier_obligations obligation ON obligation.id=p.obligation_id JOIN seller_recovery_cases c ON c.seller_id=obligation.seller_id AND c.payout_model='fixed'
  WHERE c.id=NEW.case_id AND EXISTS(SELECT 1 FROM managed_supplier_adjustments a WHERE a.id=c.supplier_adjustment_id AND a.obligation_id=p.obligation_id) AND p.status IN('prepared','scheduled','approved','failed','cancelled')
  AND p.paid_at IS NULL 
  
  AND (p.status<>'failed' OR EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=p.id AND t.state='failed'))
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=p.id AND (
  EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)
  OR NOT (t.state IN('prepared','approved','void') AND t.started_at IS NULL OR t.state='failed' AND
   EXISTS(SELECT 1 FROM audit_logs event WHERE event.action='payout.transfer.event' AND event.subject_type='payout_transfer' AND event.subject_id=t.id
    AND event.reason='outcome' AND json_extract(event.next_json,'$.input.outcome')='failed'
    AND json_extract(event.next_json,'$.input.failureBasis')=t.failure_basis
    AND (t.failure_basis IN('not_sent','no_debit') AND json_extract(event.next_json,'$.input.noDebitConfirmed')=1
     OR t.failure_basis='debit_returned' AND json_extract(event.next_json,'$.input.returnedDebitConfirmed')=1 AND json_extract(event.next_json,'$.input.returnedAmountPaisa')=t.amount_paisa)))))
  AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired WHERE retired.payout_model='fixed' AND retired.payout_id=p.id)) original
 WHERE original.id=NEW.payout_id AND original.status=NEW.original_status AND original.amountPaisa=NEW.original_amount_paisa AND original.destination=NEW.original_destination AND original.updatedAt=NEW.original_updated_at)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retirement_original_unsent_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_retirement_immutable BEFORE UPDATE ON seller_recovery_payout_retirements FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retirement_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_retirement_retained BEFORE DELETE ON seller_recovery_payout_retirements FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retirement_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_retired_registered BEFORE UPDATE ON payouts FOR EACH ROW BEGIN IF (NEW.status<>'rejected' AND EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model='registered' AND r.payout_id=NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retired_payout_requires_fresh_source'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_retired_managed BEFORE UPDATE ON managed_payouts FOR EACH ROW BEGIN IF (NEW.status<>'rejected' AND EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model='managed' AND r.payout_id=NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retired_payout_requires_fresh_source'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_retired_fixed BEFORE UPDATE ON managed_supplier_payments FOR EACH ROW BEGIN IF (NEW.status<>'cancelled' AND EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model='fixed' AND r.payout_id=NEW.id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retired_payout_requires_fresh_source'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_retired_no_new_instruction BEFORE INSERT ON payout_transfer_packets FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_payout_retirements r WHERE r.payout_model=NEW.payout_model AND r.payout_id=COALESCE(NEW.registered_payout_id,NEW.managed_payout_id,NEW.supplier_payment_id))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_retired_payout_requires_fresh_source'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id
 AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews x WHERE x.case_id=c.id)
 AND c.payout_model IN('registered','managed'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_registered_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM (SELECT i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0))>=0
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
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_managed_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM (SELECT i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0))>=0
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
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
DELIMITER ;
