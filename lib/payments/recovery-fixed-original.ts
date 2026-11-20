import {retiredRecoveryPayoutSql} from './recovery-payout-retirement';

/** Original unpaid component of one fixed adjustment. Later restitution payouts
 * cannot become another original payment. Expressions are internal SQL aliases. */
export function fixedOriginalBalanceQuery(dialect:'sqlite'|'mariadb'='sqlite'){
 const ids="json_extract(basis_case.original_source_json,'$.originalPayoutIds')";
 const retained=dialect==='mariadb'?`JSON_CONTAINS(${ids},JSON_QUOTE(p.id))=1`:`EXISTS(SELECT 1 FROM json_each(${ids}) retained WHERE retained.value=p.id)`;
 const paid=`p.status='paid' AND EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=packet.id
  WHERE packet.supplier_payment_id=p.id AND packet.payout_model='fixed' AND packet.seller_id=basis_case.seller_id AND packet.state='paid'
   AND packet.amount_paisa=p.amount_paisa AND bank.amount_paisa=packet.amount_paisa AND bank.identity_hash=packet.transaction_identity_hash AND bank.account_version_id=packet.account_version_id
   AND json_extract(packet.source_snapshot_json,'$.id')=p.id AND json_extract(packet.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
   AND json_extract(packet.source_snapshot_json,'$.obligationId')=adjustment.obligation_id)`;
 const positive=(s:string)=>`CASE WHEN ${s}>0 THEN ${s} ELSE 0 END`;
 return `SELECT basis.caseId AS case_id,CASE WHEN basis.uncertain>0 THEN -1 ELSE basis.charge-(${positive('basis.paid+basis.prior+basis.charge-basis.original')})+(${positive('basis.paid+basis.prior-basis.original')}) END AS unpaid_paisa FROM (
  SELECT basis_case.id caseId,adjustment.amount_paisa charge,obligation.original_amount_paisa original,
   COALESCE((SELECT SUM(p.amount_paisa) FROM managed_supplier_payments p WHERE p.obligation_id=obligation.id AND ${retained} AND ${paid}),0) paid,
   COALESCE((SELECT SUM(earlier.amount_paisa) FROM managed_supplier_adjustments earlier WHERE earlier.obligation_id=obligation.id AND (earlier.created_at<adjustment.created_at OR earlier.created_at=adjustment.created_at AND earlier.id<adjustment.id)),0) prior,
   (SELECT COUNT(*) FROM managed_supplier_payments p WHERE p.obligation_id=obligation.id AND ${retained} AND NOT (${paid}) AND NOT ${retiredRecoveryPayoutSql('fixed','p.id','basis_case.seller_id')}) uncertain
  FROM seller_recovery_cases basis_case JOIN managed_supplier_adjustments adjustment ON adjustment.id=basis_case.supplier_adjustment_id JOIN managed_supplier_obligations obligation ON obligation.id=adjustment.obligation_id
  WHERE basis_case.payout_model='fixed' AND obligation.seller_id=basis_case.seller_id
 ) basis`;
}

export function fixedOriginalUnpaidSql(caseId:string,_dialect:'sqlite'|'mariadb'='sqlite'){
 return `COALESCE((SELECT unpaid_paisa FROM seller_recovery_fixed_original_balances WHERE case_id=${caseId}),-1)`;
}
