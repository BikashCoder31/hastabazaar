-- Generated source parity for 0129. Execution remains held.
CREATE TABLE seller_recovery_unpaid_corrections (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 original_charge_paisa BIGINT NOT NULL CHECK(original_charge_paisa>0 AND original_charge_paisa<=9007199254740991),
 previous_restored_paisa BIGINT NOT NULL CHECK(previous_restored_paisa>=0),amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0),
 registered_credit_id VARCHAR(191) UNIQUE REFERENCES seller_ledger_entries(id),managed_credit_id VARCHAR(191) UNIQUE REFERENCES managed_settlement_entries(id),
 fixed_obligation_id VARCHAR(191) REFERENCES managed_supplier_obligations(id),source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 CHECK(amount_paisa<=original_charge_paisa-previous_restored_paisa),
 CHECK((registered_credit_id IS NOT NULL)+(managed_credit_id IS NOT NULL)+(fixed_obligation_id IS NOT NULL)=1)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_unpaid_correction_case ON seller_recovery_unpaid_corrections(case_id);
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.restored_paisa=0 AND c.liability_reduced_paisa=0
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id)
 AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_current_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_registered BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='registered')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_unpaid_sources unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND NEW.managed_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM seller_ledger_entries credit WHERE credit.id=NEW.registered_credit_id AND credit.seller_id=c.seller_id AND credit.order_item_id=unpaid.order_item_id AND credit.type='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.description=CONCAT('Original recovery correction ',c.id))
 AND unpaid.amount_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=c.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_managed BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='managed')
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_recovery_unpaid_sources unpaid ON unpaid.case_id=c.id
 JOIN refunds r ON r.id=c.refund_id WHERE c.id=NEW.case_id AND r.status='paid' AND unpaid.amount_paisa=NEW.original_charge_paisa
 AND EXISTS(SELECT 1 FROM refund_obligations o JOIN outgoing_payment_packets p ON p.obligation_id=o.id WHERE o.source_kind='return_refund' AND o.source_id=r.id AND o.state='completed' AND p.state='paid')
 AND NEW.registered_credit_id IS NULL AND NEW.fixed_obligation_id IS NULL
 AND EXISTS(SELECT 1 FROM managed_settlement_entries credit JOIN managed_entitlements e ON e.id=credit.entitlement_id WHERE credit.id=NEW.managed_credit_id AND credit.entitlement_id=unpaid.scope_id AND e.seller_id=c.seller_id AND credit.refund_id=r.id AND credit.type='dispute_adjustment' AND credit.reason_code='recovery_correction' AND credit.amount_paisa=NEW.amount_paisa AND credit.created_by=NEW.actor_id AND json_extract(credit.metadata_json,'$.caseId')=c.id)
 AND unpaid.amount_paisa=COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=unpaid.scope_id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_fixed BEFORE INSERT ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN IF (EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed') AND NOT EXISTS(
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
  <=o.original_amount_paisa+NEW.previous_restored_paisa)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_native_credit_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_immutable BEFORE UPDATE ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_unpaid_correction_retained BEFORE DELETE ON seller_recovery_unpaid_corrections FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_unpaid_correction_retained'; END$$
DELIMITER ;
