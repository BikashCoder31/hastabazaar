-- Generated source parity for 0127. Canonical and live execution remain held.
CREATE TABLE seller_recovery_unpaid_sources (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),refund_id VARCHAR(191) NOT NULL UNIQUE REFERENCES refunds(id),
 order_item_id VARCHAR(191) NOT NULL REFERENCES order_items(id),scope_id VARCHAR(191) NOT NULL,
 basis_paisa BIGINT NOT NULL CHECK(basis_paisa>0 AND basis_paisa<=9007199254740991),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>=0 AND amount_paisa<=basis_paisa),
 remaining_paisa BIGINT NOT NULL CHECK(remaining_paisa>=0 AND remaining_paisa<=9007199254740991),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),actor_id VARCHAR(191) NOT NULL REFERENCES users(id),
 request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_unpaid_original_scope ON seller_recovery_unpaid_sources(seller_id,order_item_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_unpaid_native_proof BEFORE INSERT ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id
 AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews x WHERE x.case_id=c.id)
 AND (c.payout_model='registered' AND EXISTS(SELECT 1 FROM (SELECT i.id AS orderItemId,i.id AS scopeId,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0) AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0))>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0))>=0
  AND NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id ) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa) OR c.payout_model='managed' AND EXISTS(SELECT 1 FROM (SELECT i.id AS orderItemId,e.id AS scopeId,e.calculated_paisa AS basisPaisa,COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0) AS remainingPaisa,
   CASE WHEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))>0 THEN (COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id
  WHERE r.id=NEW.refund_id AND i.seller_id=NEW.seller_id AND r.status='paid' AND COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)>0 AND (e.calculated_paisa)>0 AND (COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0))>=0
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id )
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id ) AND COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa
  
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))) native_source
 WHERE native_source.orderItemId=NEW.order_item_id AND native_source.scopeId=NEW.scope_id AND native_source.basisPaisa=NEW.basis_paisa
 AND native_source.remainingPaisa=NEW.remaining_paisa AND native_source.offsetPaisa=NEW.amount_paisa)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_proof_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_not_recovery BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_unpaid_sources unpaid WHERE unpaid.case_id=NEW.case_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_is_not_historical_repayment'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_immutable BEFORE UPDATE ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_retained BEFORE DELETE ON seller_recovery_unpaid_sources FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_original_retained'; END$$
DELIMITER ;
