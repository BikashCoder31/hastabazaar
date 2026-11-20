-- Generated source parity for 0125. Canonical and live execution remain held.
CREATE TABLE seller_recovery_historical_attributions (
 id VARCHAR(191) PRIMARY KEY,case_id VARCHAR(191) NOT NULL REFERENCES seller_recovery_cases(id),case_revision BIGINT NOT NULL,
 seller_id VARCHAR(191) NOT NULL REFERENCES seller_profiles(id),refund_id VARCHAR(191) NOT NULL REFERENCES refunds(id),
 kind VARCHAR(191) NOT NULL CHECK(kind IN('registered_refund_group','managed_allocation','managed_legacy_group')),
 payout_id VARCHAR(191) NOT NULL,scope_id VARCHAR(191) NOT NULL,
 native_deduction_paisa BIGINT NOT NULL CHECK(native_deduction_paisa>0 AND native_deduction_paisa<=9007199254740991),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa>0 AND amount_paisa<=native_deduction_paisa),
 actor_id VARCHAR(191) NOT NULL REFERENCES users(id),request_id VARCHAR(191) NOT NULL UNIQUE,created_at BIGINT NOT NULL,
 evidence_reference TEXT NOT NULL,reason TEXT NOT NULL,public_message TEXT NOT NULL,
 UNIQUE(case_id,case_revision)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX recovery_historical_shared_pool ON seller_recovery_historical_attributions(kind,payout_id,scope_id);

CREATE INDEX recovery_historical_case ON seller_recovery_historical_attributions(case_id);

DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_historical_native_source BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id
 AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id
 AND (c.payout_model='registered' AND NEW.kind='registered_refund_group' AND EXISTS(SELECT 1 FROM (SELECT * FROM (
  SELECT 'registered_refund_group' AS kind,p.id AS payoutId,NEW.refund_id AS scopeId,
   -SUM(x.amount_paisa)-COALESCE((SELECT SUM(credit.amount_paisa)
    FROM payout_entries included JOIN seller_ledger_entries credit ON credit.id=included.ledger_entry_id
    WHERE included.payout_id=p.id AND included.released_at IS NULL AND credit.seller_id=p.seller_id
     AND (credit.type='recovery_source_compensation' AND credit.refund_id=NEW.refund_id OR EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.refund_id=NEW.refund_id AND (
      EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_reductions a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id))))),0) AS capacityPaisa,
   ((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.registered_payout_id=p.id AND t.payout_model='registered' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
    AND (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type<>'payout')=p.amount_paisa
    AND (SELECT COUNT(*) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout')=1
    AND EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout' AND entry.payout_id=p.id AND entry.amount_paisa=-p.amount_paisa)
    AND NOT EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.seller_id<>p.seller_id)) AS nativeProof
  FROM seller_ledger_entries x JOIN payout_entries pe ON pe.ledger_entry_id=x.id JOIN payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=NEW.refund_id AND x.seller_id=NEW.seller_id AND p.seller_id=NEW.seller_id
   AND x.type IN('refund','commission_reversal') AND pe.released_at IS NULL AND p.status='paid'
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0) native_source
 WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id
 AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1)
 OR c.payout_model='managed' AND NEW.kind IN('managed_allocation','managed_legacy_group') AND EXISTS(SELECT 1 FROM (SELECT * FROM (
  SELECT 'managed_allocation' AS kind,p.id AS payoutId,a.entitlement_id AS scopeId,-a.amount_paisa AS capacityPaisa,((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id)) AS nativeProof
  FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
  WHERE a.amount_paisa<0 AND a.disposition='paid' AND p.status='paid' AND p.seller_id=NEW.seller_id
   AND EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=a.entitlement_id AND x.refund_id=NEW.refund_id)
  UNION ALL
  SELECT 'managed_legacy_group' AS kind,p.id AS payoutId,NEW.refund_id AS scopeId,-SUM(x.amount_paisa) AS capacityPaisa,((SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.managed_payout_id=p.id AND t.payout_model='managed' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id)) AS nativeProof
  FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id JOIN managed_payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=NEW.refund_id AND p.seller_id=NEW.seller_id AND p.status='paid'
   AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid')
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0) native_source
 WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id
 AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_actual_native_source_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_shared_cap BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (NEW.amount_paisa>NEW.native_deduction_paisa-COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_historical_attributions h WHERE h.kind=NEW.kind AND h.payout_id=NEW.payout_id AND h.scope_id=NEW.scope_id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_shared_capacity_exceeded'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_immutable BEFORE UPDATE ON seller_recovery_historical_attributions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_attribution_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_historical_retained BEFORE DELETE ON seller_recovery_historical_attributions FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_attribution_retained'; END$$
CREATE OR REPLACE TRIGGER recovery_historical_opening BEFORE INSERT ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.historical_recovered_paisa<>0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_explicit_attribution_required'; END IF; END$$
CREATE OR REPLACE TRIGGER recovery_historical_projection BEFORE UPDATE ON seller_recovery_cases FOR EACH ROW BEGIN IF (NEW.historical_recovered_paisa<>COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_historical_attributions h WHERE h.case_id=NEW.id),0)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_exact_projection_required'; END IF; END$$
DELIMITER ;
