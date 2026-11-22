import {provenOriginalPaidSql} from './recovery-partial-paid-source';
import {partialUnpaidSourceSql} from './recovery-partial-source';
import {retiredRecoveryPayoutSql} from './recovery-payout-retirement';
/** Read-only proof for original earnings with no outstanding or completed payout.
 * Existing native adjustments consume those earnings; recognition posts no money.
 * Released instructions require a retained explicit retirement; partial deficits remain owned reconciliation.
 */
export function unpaidRecoverySourceSql(model:'registered'|'managed',refund:string,seller:string,allowRetired=false,allowDeficit=false,allowPaid=false){
 const sellerCosts=`COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.party='seller' AND cost.seller_id=i.seller_id),0)`;
 const native=model==='registered'
  ?`COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type IN('refund','commission_reversal')),0)`
  :`COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND (x.type='refund_adjustment' OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility')),0)`;
 const basis=model==='registered'
  ?`COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND x.type IN('sale','commission')),0)`
  :`e.calculated_paisa`;
 const available=model==='registered'
  ?`COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id AND (x.amount_paisa<0 OR x.type IN('sale','commission','refund','commission_reversal','reserve_release'))),0)`
  :`COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND (x.amount_paisa<0 OR x.type IN('earned','refund_adjustment') OR x.type='dispute_adjustment' AND x.reason_code='refund_responsibility') AND NOT EXISTS(SELECT 1 FROM seller_recovery_source_reviews review WHERE review.managed_credit_id=x.id)),0)`;
 const noInstruction=model==='registered'
  ?`NOT EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries x ON x.id=pe.ledger_entry_id WHERE x.seller_id=i.seller_id AND x.order_item_id=i.id ${allowRetired?'AND NOT '+'('+retiredRecoveryPayoutSql(model,'pe.payout_id','i.seller_id')+(allowPaid?' OR '+provenOriginalPaidSql(model,'pe.payout_id','i.seller_id'):'')+')':''})`
  :`NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.entitlement_id=e.id ${allowRetired?'AND NOT '+'('+retiredRecoveryPayoutSql(model,'a.payout_id','i.seller_id')+(allowPaid?' OR '+provenOriginalPaidSql(model,'a.payout_id','i.seller_id'):'')+')':''})
    AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE x.entitlement_id=e.id ${allowRetired?'AND NOT '+'('+retiredRecoveryPayoutSql(model,'pe.payout_id','i.seller_id')+(allowPaid?' OR '+provenOriginalPaidSql(model,'pe.payout_id','i.seller_id'):'')+')':''})`;
 const nativeCorrect=model==='registered'
  ?`COALESCE((SELECT -SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='refund'),0)=${sellerCosts}
    AND COALESCE((SELECT SUM(x.amount_paisa) FROM seller_ledger_entries x WHERE x.seller_id=i.seller_id AND x.refund_id=r.id AND x.type='commission_reversal'),0)=r.commission_reversal_paisa`
  :`${native}=(CASE WHEN EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=i.seller_id AND cost.amount_paisa>0)
    THEN COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0) ELSE 0 END)
    +COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=i.seller_id),0)
    AND e.earned_at IS NOT NULL AND COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.type='earned'),0)=e.calculated_paisa`;
 return `SELECT r.id AS refundId,i.seller_id AS sellerId,i.id AS orderItemId,${model==='managed'?'e.id':'i.id'} AS scopeId,${basis} AS basisPaisa,${available} AS remainingPaisa,
   CASE WHEN (${native})>0 THEN (${native}) ELSE 0 END AS offsetPaisa
  FROM refunds r JOIN return_requests request ON request.id=r.return_request_id JOIN order_items i ON i.id=request.order_item_id
  ${model==='managed'?"JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=i.id AND snapshot.commercial_model='managed_sale_linked_percentage_v1' JOIN managed_entitlements e ON e.snapshot_id=snapshot.id AND e.seller_id=i.seller_id":''}
  WHERE r.id=${refund} AND i.seller_id=${seller} AND r.status='paid' AND ${sellerCosts}>0 AND (${basis})>0 ${allowDeficit?'':`AND (${available})>=0`}
  AND ${noInstruction} AND ${nativeCorrect}
  ${model==='registered'?'AND NOT EXISTS(SELECT 1 FROM managed_commercial_snapshots snapshot WHERE snapshot.order_item_id=i.id)':''}
  AND EXISTS(SELECT 1 FROM refund_obligations obligation JOIN outgoing_payment_packets packet ON packet.obligation_id=obligation.id
   WHERE obligation.source_kind='return_refund' AND obligation.source_id=r.id AND obligation.state='completed' AND packet.state='paid'
   AND (packet.amount_paisa=0 OR EXISTS(SELECT 1 FROM company_outgoing_bank_identities bank WHERE bank.packet_kind='refund' AND bank.packet_id=packet.id AND bank.amount_paisa=packet.amount_paisa)))`;
}
export interface UnpaidRecoverySource {orderItemId:string;scopeId:string;basisPaisa:number;remainingPaisa:number;offsetPaisa:number;usedPaisa?:number;capacityPaisa?:number;nativeRemainingPaisa?:number;}
export async function readUnpaidRecoverySource(db:D1Database,source:{model:string;id:string;sellerId:string}){
 if(source.model!=='registered'&&source.model!=='managed')return null;
 const dialect=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'mariadb':'sqlite';
 const pool=partialUnpaidSourceSql(source.model,'(SELECT id FROM requested)','(SELECT sellerId FROM requested)',true,dialect);
 const row=await db.prepare(`WITH requested AS(SELECT ? id,? sellerId) SELECT orderItemId,scopeId,basisPaisa,nativeRemainingPaisa,capacityPaisa,usedPaisa,capacityPaisa-usedPaisa-offsetPaisa remainingPaisa,offsetPaisa FROM (${pool}) pool WHERE offsetPaisa=nativeDebitPaisa AND nativeDebitPaisa>0`).bind(source.id,source.sellerId).first<UnpaidRecoverySource>();
 if(row&&!Number.isSafeInteger(row.nativeRemainingPaisa))throw new Error('Reconcile exact original native remaining earnings.');
 if(row&&[row.basisPaisa,row.remainingPaisa,row.offsetPaisa].some(v=>!Number.isSafeInteger(v)||v<0))throw new Error('Reconcile exact original unpaid earnings before recognition.');
 return row;
}
