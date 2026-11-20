-- Source parity for 0126. Canonical and live execution remain held.
CREATE TABLE seller_recovery_source_reviews (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL UNIQUE REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 kind VARCHAR(191) NOT NULL CHECK(kind='company_compensation'),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=9007199254740991),
 registered_credit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id),managed_credit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 CHECK(registered_credit_id IS NOT NULL AND managed_credit_id IS NULL OR registered_credit_id IS NULL AND managed_credit_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_source_compensation_proof BEFORE INSERT ON seller_recovery_source_reviews FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN refunds r ON r.id=c.refund_id
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.confirmed_paisa=0 AND c.approved_cap_paisa=0
 AND c.historical_recovered_paisa=0 AND c.absorbed_paisa=0 AND c.restored_paisa=0 AND r.status='paid'
 AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
  WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
  AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))
 AND EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=c.seller_id AND cost.amount_paisa>0)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND (
  c.payout_model='registered' AND NEW.managed_credit_id IS NULL
   AND NEW.amount_paisa=(SELECT -SUM(e.amount_paisa) FROM seller_ledger_entries e WHERE e.refund_id=c.refund_id AND e.seller_id=c.seller_id AND e.type='refund')
   AND EXISTS(SELECT 1 FROM seller_ledger_entries credit JOIN return_requests request ON request.id=r.return_request_id
    WHERE credit.id=NEW.registered_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=request.order_item_id
    AND credit.type='recovery_source_compensation' AND credit.amount_paisa=NEW.amount_paisa AND credit.refund_id=c.refund_id)
  OR c.payout_model='managed' AND NEW.registered_credit_id IS NULL
   AND EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_entitlements e ON e.id=credit.entitlement_id
    WHERE credit.id=NEW.managed_credit_id AND e.seller_id=c.seller_id AND credit.refund_id=c.refund_id
    AND credit.type='dispute_adjustment' AND credit.reason_code='refund_responsibility' AND credit.amount_paisa=NEW.amount_paisa
    AND credit.request_id=NEW.request_id AND credit.created_by=NEW.actor_id
    AND NEW.amount_paisa=(SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=c.refund_id AND x.type='refund_adjustment')
    AND NOT EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=c.refund_id AND x.reason_code='refund_responsibility' AND x.id<>credit.id))
 ))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_original_company_compensation_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_source_review_immutable BEFORE UPDATE ON seller_recovery_source_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_source_review_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_source_review_retained BEFORE DELETE ON seller_recovery_source_reviews FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_source_review_retained'; END$$
DELIMITER ;
