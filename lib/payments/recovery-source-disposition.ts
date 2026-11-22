/** One original source predicate for review and commit; current reservations and bank truth are never cached. */
export function recoverySourceDispositionSql(model:'registered'|'managed'){
 const proof=(payout:string,column:string)=>`EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa WHERE t.${column}=${payout} AND t.state='paid')`;
 if(model==='registered'){
  const actual=proof('p.id','registered_payout_id');
  return {
   reservedSql:`SELECT 1 FROM seller_ledger_entries x JOIN payout_entries pe ON pe.ledger_entry_id=x.id JOIN payouts p ON p.id=pe.payout_id
    WHERE x.refund_id=? AND x.seller_id=? AND x.type IN('refund','commission_reversal') AND pe.released_at IS NULL
    AND (p.status IN('prepared','scheduled','approved','processing','failed') OR p.status='paid' AND NOT ${actual})`,
   historicalSql:`SELECT
    COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x JOIN payout_entries pe ON pe.ledger_entry_id=x.id JOIN payouts p ON p.id=pe.payout_id
     WHERE x.refund_id=r.id AND x.seller_id=i.seller_id AND x.type IN('refund','commission_reversal') AND pe.released_at IS NULL AND p.status='paid' AND ${actual}),0)
    - COALESCE((SELECT SUM(credit.amount_paisa) FROM seller_ledger_entries credit JOIN payout_entries pe ON pe.ledger_entry_id=credit.id JOIN payouts p ON p.id=pe.payout_id
     WHERE credit.seller_id=i.seller_id AND pe.released_at IS NULL AND p.status='paid' AND ${actual}
     AND (credit.type='recovery_source_compensation' AND credit.refund_id=r.id OR EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.refund_id=r.id AND (
       EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
       OR EXISTS(SELECT 1 FROM seller_recovery_reductions a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
       OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id))))
     AND EXISTS(SELECT 1 FROM payout_entries original_entry JOIN seller_ledger_entries original ON original.id=original_entry.ledger_entry_id
       WHERE original_entry.payout_id=p.id AND original_entry.released_at IS NULL AND original.refund_id=r.id AND original.seller_id=i.seller_id AND original.type IN('refund','commission_reversal'))),0) AS amount
    FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id WHERE r.id=? AND i.seller_id=?`,
  };
 }
 const actual=proof('p.id','managed_payout_id');
 return {
  reservedSql:`SELECT 1 FROM managed_payouts p WHERE p.seller_id=? AND
   (p.status IN('prepared','approved','processing','failed') OR p.status='paid' AND NOT ${actual}) AND (
    EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_settlement_entries x ON x.entitlement_id=a.entitlement_id
     WHERE a.payout_id=p.id AND x.refund_id=? AND a.amount_paisa<0 AND a.disposition<>'released')
    OR EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id
     WHERE pe.payout_id=p.id AND x.refund_id=? AND x.amount_paisa<0))`,
  historicalSql:`SELECT COALESCE(SUM(amount),0) AS amount FROM (
   SELECT -a.amount_paisa AS amount FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
    WHERE a.amount_paisa<0 AND a.disposition='paid' AND p.status='paid' AND p.seller_id=? AND ${actual}
    AND EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=a.entitlement_id AND x.refund_id=? AND x.amount_paisa<0 AND x.created_at<=p.created_at)
   UNION ALL
   SELECT -x.amount_paisa AS amount FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id JOIN managed_payouts p ON p.id=pe.payout_id
    WHERE x.refund_id=? AND p.seller_id=? AND p.status='paid' AND ${actual}
    AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid')
  ) AS native_history`,
 };
}
export function recoveryDispositionBindings(model:'registered'|'managed',refundId:string,sellerId:string){
 return model==='registered'?{reserved:[refundId,sellerId],historical:[refundId,sellerId]}:
  {reserved:[sellerId,refundId,refundId],historical:[sellerId,refundId,refundId,sellerId]};
}
