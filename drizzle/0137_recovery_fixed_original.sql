-- Source only; canonical and live execution remain held.
CREATE VIEW seller_recovery_fixed_original_balances AS SELECT basis.caseId AS case_id,CASE WHEN basis.uncertain>0 THEN -1 ELSE basis.charge-(CASE WHEN basis.paid+basis.prior+basis.charge-basis.original>0 THEN basis.paid+basis.prior+basis.charge-basis.original ELSE 0 END)+(CASE WHEN basis.paid+basis.prior-basis.original>0 THEN basis.paid+basis.prior-basis.original ELSE 0 END) END AS unpaid_paisa FROM (
  SELECT basis_case.id caseId,adjustment.amount_paisa charge,obligation.original_amount_paisa original,
   COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=obligation.id AND EXISTS(SELECT 1 FROM json_each(json_extract(basis_case.original_source_json,'$.originalPayoutIds')) retained WHERE retained.value=p.id) AND p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=packet.id
  WHERE packet.supplier_payment_id=p.id AND packet.payout_model='fixed' AND packet.seller_id=basis_case.seller_id AND packet.state='paid'
   AND packet.amount_paisa=p.amount_paisa AND bank.amount_paisa=packet.amount_paisa AND bank.identity_hash=packet.transaction_identity_hash AND bank.account_version_id=packet.account_version_id
   AND json_extract(packet.source_snapshot_json,'$.id')=p.id AND json_extract(packet.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
   AND json_extract(packet.source_snapshot_json,'$.obligationId')=adjustment.obligation_id)),0) paid,
   COALESCE((SELECT SUM(earlier.amount_paisa) FROM managed_supplier_adjustments earlier WHERE earlier.obligation_id=obligation.id AND (earlier.created_at<adjustment.created_at OR earlier.created_at=adjustment.created_at AND earlier.id<adjustment.id)),0) prior,
   (SELECT COUNT(*) FROM managed_supplier_payments p WHERE p.obligation_id=obligation.id AND EXISTS(SELECT 1 FROM json_each(json_extract(basis_case.original_source_json,'$.originalPayoutIds')) retained WHERE retained.value=p.id) AND NOT (p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=packet.id
  WHERE packet.supplier_payment_id=p.id AND packet.payout_model='fixed' AND packet.seller_id=basis_case.seller_id AND packet.state='paid'
   AND packet.amount_paisa=p.amount_paisa AND bank.amount_paisa=packet.amount_paisa AND bank.identity_hash=packet.transaction_identity_hash AND bank.account_version_id=packet.account_version_id
   AND json_extract(packet.source_snapshot_json,'$.id')=p.id AND json_extract(packet.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
   AND json_extract(packet.source_snapshot_json,'$.obligationId')=adjustment.obligation_id)) AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_supplier_payments retired_native ON retired_native.id=retired.payout_id JOIN managed_supplier_obligations retired_obligation ON retired_obligation.id=retired_native.obligation_id
  WHERE retired.payout_model='fixed' AND retired.payout_id=p.id AND retired.seller_id=basis_case.seller_id AND retired_obligation.seller_id=retired.seller_id
  AND retired_native.status='cancelled' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  )) uncertain
  FROM seller_recovery_cases basis_case JOIN managed_supplier_adjustments adjustment ON adjustment.id=basis_case.supplier_adjustment_id JOIN managed_supplier_obligations obligation ON obligation.id=adjustment.obligation_id
  WHERE basis_case.payout_model='fixed' AND obligation.seller_id=basis_case.seller_id
 ) basis;
--> statement-breakpoint
DROP TRIGGER recovery_unpaid_correction_source;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_correction_source BEFORE INSERT ON seller_recovery_unpaid_corrections
WHEN NOT EXISTS(SELECT 1 FROM seller_recovery_cases c JOIN seller_profiles s ON s.id=c.seller_id
 JOIN users actor ON actor.id=NEW.actor_id JOIN user_roles role ON role.user_id=actor.id AND role.role='super_admin'
 WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.blocker IS NULL AND c.confirmed_paisa=0 AND c.exposure_paisa=0
 AND c.approved_cap_paisa=0 AND c.absorbed_paisa=0 AND c.historical_recovered_paisa=0 AND c.disputed_paisa=0 AND (c.restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0) AND c.liability_reduced_paisa=0 OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND actor.status='active' AND s.user_id<>actor.id AND COALESCE(json_extract(c.original_source_json,'$.ownerId'),'')<>actor.id
 AND COALESCE(json_extract(c.original_source_json,'$.customerId'),'')<>actor.id
 AND NOT EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=c.refund_id AND o.customer_id=actor.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM seller_recovery_carrier_unpaid_reviews review WHERE review.allocation_id=a.id AND review.case_id=a.case_id AND review.amount_paisa=a.amount_paisa AND a.method='carrier')) OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id)
 AND (NOT EXISTS(SELECT 1 FROM seller_recovery_liability_corrections x WHERE x.case_id=c.id) OR (EXISTS(SELECT 1 FROM seller_recovery_partial_sources partial WHERE partial.case_id=c.id AND c.liability_reduced_paisa=partial.native_charge_paisa-partial.amount_paisa
   AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0)) OR (c.payout_model='fixed'
  AND c.liability_reduced_paisa=(SELECT amount_paisa FROM managed_supplier_adjustments WHERE id=c.supplier_adjustment_id)-NEW.original_charge_paisa
  AND c.restored_paisa=COALESCE((SELECT SUM(a.amount_paisa) FROM seller_recovery_allocations a WHERE a.case_id=c.id),0))))
 AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN company_money_receipts receipt ON receipt.id=a.receipt_id WHERE a.case_id=c.id
    AND (receipt.status<>'verified' OR EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id))) AND NEW.previous_restored_paisa=COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0))
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_correction_current_source_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_unpaid_correction_fixed;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_correction_fixed BEFORE INSERT ON seller_recovery_unpaid_corrections
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.payout_model='fixed') AND NOT EXISTS(
 SELECT 1 FROM seller_recovery_cases c JOIN managed_supplier_adjustments adjustment ON adjustment.id=c.supplier_adjustment_id JOIN managed_supplier_obligations o ON o.id=adjustment.obligation_id
 WHERE c.id=NEW.case_id AND o.seller_id=c.seller_id AND NEW.fixed_obligation_id=o.id AND NEW.registered_credit_id IS NULL AND NEW.managed_credit_id IS NULL
 AND c.liability_reduced_paisa=adjustment.amount_paisa-NEW.original_charge_paisa
 AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status<>'paid' AND NOT EXISTS(SELECT 1 FROM seller_recovery_payout_retirements retired JOIN managed_supplier_payments retired_native ON retired_native.id=retired.payout_id JOIN managed_supplier_obligations retired_obligation ON retired_obligation.id=retired_native.obligation_id
  WHERE retired.payout_model='fixed' AND retired.payout_id=p.id AND retired.seller_id=o.seller_id AND retired_obligation.seller_id=retired.seller_id
  AND retired_native.status='cancelled' AND retired_native.amount_paisa=retired.original_amount_paisa AND retired_native.destination_reference=retired.original_destination AND retired_native.paid_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.supplier_payment_id=retired_native.id AND (t.state NOT IN('failed','void')
   OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='payout' AND bank.packet_id=t.id)))
  ))
 AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN managed_supplier_payments p ON p.id=packet.supplier_payment_id WHERE p.obligation_id=o.id AND packet.state IN('processing','uncertain')))
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_correction_native_credit_required'); END;
--> statement-breakpoint
DROP TRIGGER recovery_carrier_unpaid_source;
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
 )
BEGIN SELECT RAISE(ABORT,'recovery_carrier_unpaid_current_source_required'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_carrier_unpaid_original_cap BEFORE INSERT ON seller_recovery_carrier_unpaid_reviews
WHEN NEW.amount_paisa>COALESCE((SELECT (CASE WHEN c.payout_model='fixed' THEN COALESCE((SELECT unpaid_paisa FROM seller_recovery_fixed_original_balances WHERE case_id=c.id),-1)
 WHEN c.payout_model IN('registered','managed') THEN COALESCE((SELECT unpaid.amount_paisa FROM seller_recovery_original_unpaid_reviews unpaid WHERE unpaid.case_id=c.id),0) ELSE 0 END)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_unpaid_corrections x WHERE x.case_id=c.id),0)-COALESCE((SELECT SUM(x.amount_paisa) FROM seller_recovery_carrier_unpaid_reviews x WHERE x.case_id=c.id),0) FROM seller_recovery_cases c WHERE c.id=NEW.case_id),-1)
BEGIN SELECT RAISE(ABORT,'recovery_carrier_unpaid_original_cap_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER recovery_unpaid_fixed_original_cap BEFORE INSERT ON seller_recovery_unpaid_corrections
WHEN EXISTS(SELECT 1 FROM seller_recovery_cases WHERE id=NEW.case_id AND payout_model='fixed') AND NEW.original_charge_paisa<>COALESCE((SELECT unpaid_paisa FROM seller_recovery_fixed_original_balances WHERE case_id=NEW.case_id),-1)
BEGIN SELECT RAISE(ABORT,'recovery_unpaid_fixed_original_cap_required'); END;
