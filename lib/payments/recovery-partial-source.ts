import {positiveOriginalPaidSql} from './recovery-partial-paid-source';
import {unpaidRecoverySourceSql} from './recovery-unpaid-source';

/** Original earnings only: refunds share this capacity, while retained other costs remain deducted. */
export function originalUnpaidCapacitySql(model:'registered'|'managed',scope:string,seller:string){
 return model==='registered'
  ?`COALESCE((SELECT SUM(original.amount_paisa) FROM seller_ledger_entries original WHERE original.order_item_id=${scope} AND original.seller_id=${seller}
    AND (original.type IN('sale','commission','reserve_release') OR original.amount_paisa<0 AND original.type NOT IN('refund','commission_reversal','payout','recovery_receipt_reversal'))),0)`
  :`COALESCE((SELECT SUM(original.amount_paisa) FROM managed_settlement_entries original JOIN managed_entitlements entitlement ON entitlement.id=original.entitlement_id
    WHERE original.entitlement_id=${scope} AND entitlement.seller_id=${seller} AND (original.type='earned' OR original.amount_paisa<0
    AND COALESCE(original.reason_code,'')<>'recovery_receipt_reversal' AND original.type<>'refund_adjustment' AND NOT(original.type='dispute_adjustment' AND original.reason_code='refund_responsibility'))),0)`;
}

export function partialUnpaidSourceSql(model:'registered'|'managed',refund:string,seller:string,allowPaid=false,dialect:'sqlite'|'mariadb'='sqlite'){
 const base=unpaidRecoverySourceSql(model,refund,seller,true,true,allowPaid);
 const capacity='('+originalUnpaidCapacitySql(model,'native_source.scopeId','native_source.sellerId')+(allowPaid?'-'+positiveOriginalPaidSql(model,'native_source.scopeId','native_source.sellerId',dialect):'')+')';
 const used=`COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_unpaid_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='${model}' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0)
  +COALESCE((SELECT SUM(used.amount_paisa) FROM seller_recovery_partial_sources used JOIN seller_recovery_cases used_case ON used_case.id=used.case_id WHERE used_case.payout_model='${model}' AND used.seller_id=native_source.sellerId AND used.scope_id=native_source.scopeId),0)`;
 const unreserved=model==='registered'?`NOT EXISTS(SELECT 1 FROM seller_ledger_entries reserve WHERE reserve.seller_id=native_source.sellerId AND reserve.order_item_id=native_source.orderItemId AND reserve.type IN('reserve_hold','reserve_release') GROUP BY reserve.order_item_id HAVING SUM(reserve.amount_paisa)<0)`:'1';
 return `SELECT source_pool.*,
  CASE WHEN nativeDebitPaisa<capacityPaisa-usedPaisa THEN nativeDebitPaisa ELSE capacityPaisa-usedPaisa END AS offsetPaisa
  FROM (SELECT native_source.refundId,native_source.sellerId,native_source.orderItemId,native_source.scopeId,native_source.basisPaisa,native_source.remainingPaisa AS nativeRemainingPaisa,native_source.offsetPaisa AS nativeDebitPaisa,
   ${capacity} AS capacityPaisa,${used} AS usedPaisa FROM (${base}) native_source WHERE ${unreserved}) source_pool
  WHERE capacityPaisa>=usedPaisa AND capacityPaisa<=basisPaisa`;
}
export interface PartialUnpaidSource {orderItemId:string;scopeId:string;basisPaisa:number;nativeRemainingPaisa:number;nativeDebitPaisa:number;capacityPaisa:number;usedPaisa:number;offsetPaisa:number;}
export async function readPartialUnpaidSource(db:D1Database,source:{model:string;id:string;sellerId:string}){
 if(source.model!=='registered'&&source.model!=='managed')return null;
 const dialect=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'mariadb':'sqlite';
 const sql=partialUnpaidSourceSql(source.model,'(SELECT refundId FROM requested)','(SELECT sellerId FROM requested)',true,dialect);
 const row=await db.prepare(`WITH requested AS(SELECT ? AS refundId,? AS sellerId) ${sql}`).bind(source.id,source.sellerId).first<PartialUnpaidSource>();
 if(row&&!Number.isSafeInteger(row.nativeRemainingPaisa))throw new Error('Reconcile exact original native remaining earnings.');
 if(row&&[row.basisPaisa,row.nativeDebitPaisa,row.capacityPaisa,row.usedPaisa,row.offsetPaisa].some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('Reconcile the exact shared original earnings and every retained original cost.');
 return row&&row.offsetPaisa<row.nativeDebitPaisa?row:null;
}
