import {originalUnpaidCapacitySql} from './recovery-partial-source';

export interface PaidOriginalBasis {orderItemId:string;scopeId:string;basisPaisa:number;paidPaisa:number;usedPaisa:number;}
/** Positive original scope payments only. A negative historical deduction is
 * already-collected money, not newly unpaid original capital. Actual bank proof
 * is required before any native paid amount is used in this reconciliation. */
export function provenOriginalPaidSql(model:'registered'|'managed',payout:string,seller:string){
 const column=model==='registered'?'registered_payout_id':'managed_payout_id';
 return `EXISTS(SELECT 1 FROM payout_transfer_packets t JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
  WHERE t.${column}=${payout} AND t.payout_model='${model}' AND t.seller_id=${seller} AND t.state='paid' AND t.amount_paisa=(SELECT original.amount_paisa FROM ${model==='registered'?'payouts':'managed_payouts'} original WHERE original.id=${payout} AND original.status='paid') AND bank.amount_paisa=t.amount_paisa AND bank.identity_hash=t.transaction_identity_hash AND bank.account_version_id=t.account_version_id)`;
}
export function positiveOriginalPaidSql(model:'registered'|'managed',scope:string,seller:string,dialect:'sqlite'|'mariadb'='sqlite'){
 const bank=provenOriginalPaidSql(model,'p.id',seller);
 if(dialect==='mariadb'){
  const amount=model==='registered'
   ?`(SELECT SUM(x.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries x ON x.id=included.ledger_entry_id WHERE included.payout_id=p.id AND included.released_at IS NULL AND x.seller_id=${seller} AND x.order_item_id=${scope})`
   :`(SELECT SUM(x.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries x ON x.id=included.settlement_entry_id WHERE included.payout_id=p.id AND x.entitlement_id=${scope} AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid'))`;
  const paid=`COALESCE((SELECT SUM(${amount}) FROM ${model==='registered'?'payouts':'managed_payouts'} p WHERE p.seller_id=${seller} AND p.status='paid' AND ${bank} AND ${amount}>0),0)`;
  if(model==='registered')return paid;
  return `(COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id WHERE a.entitlement_id=${scope} AND a.amount_paisa>0 AND a.disposition='paid' AND p.seller_id=${seller} AND p.status='paid' AND ${bank}),0)+${paid})`;
 }
 if(model==='registered')return `COALESCE((SELECT SUM(paid.scopeAmount) FROM (SELECT p.id,SUM(x.amount_paisa) scopeAmount FROM payouts p JOIN payout_entries included ON included.payout_id=p.id JOIN seller_ledger_entries x ON x.id=included.ledger_entry_id
  WHERE p.seller_id=${seller} AND p.status='paid' AND included.released_at IS NULL AND x.seller_id=${seller} AND x.order_item_id=${scope} AND ${bank} GROUP BY p.id HAVING SUM(x.amount_paisa)>0) paid),0)`;
 return `(COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
  WHERE a.entitlement_id=${scope} AND a.amount_paisa>0 AND a.disposition='paid' AND p.seller_id=${seller} AND p.status='paid' AND ${bank}),0)
  +COALESCE((SELECT SUM(paid.scopeAmount) FROM (SELECT p.id,SUM(x.amount_paisa) scopeAmount FROM managed_payouts p JOIN managed_payout_entries included ON included.payout_id=p.id JOIN managed_settlement_entries x ON x.id=included.settlement_entry_id
   WHERE p.seller_id=${seller} AND p.status='paid' AND x.entitlement_id=${scope} AND ${bank} AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid') GROUP BY p.id HAVING SUM(x.amount_paisa)>0) paid),0))`;
}
export async function readPaidOriginalBasis(db:D1Database,source:{model:string;sellerId:string;orderItemId:string|null;id:string}){
 if(source.model!=='registered'&&source.model!=='managed'||!source.orderItemId)return null;
 const model=source.model,scope=model==='registered'?source.orderItemId:(await db.prepare('SELECT e.id FROM managed_entitlements e JOIN managed_commercial_snapshots snapshot ON snapshot.id=e.snapshot_id WHERE snapshot.order_item_id=? AND e.seller_id=?').bind(source.orderItemId,source.sellerId).first<{id:string}>())?.id;
 if(!scope)return null;
 const dialect=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'mariadb':'sqlite';
 const used=`COALESCE((SELECT SUM(u.amount_paisa) FROM seller_recovery_unpaid_sources u JOIN seller_recovery_cases c ON c.id=u.case_id WHERE c.payout_model='${model}' AND u.seller_id=requested.seller AND u.scope_id=requested.scope),0)+COALESCE((SELECT SUM(u.amount_paisa) FROM seller_recovery_partial_sources u JOIN seller_recovery_cases c ON c.id=u.case_id WHERE c.payout_model='${model}' AND u.seller_id=requested.seller AND u.scope_id=requested.scope),0)`;
 const row=await db.prepare(`WITH requested AS(SELECT ? scope,? seller) SELECT ${originalUnpaidCapacitySql(model,'requested.scope','requested.seller')} basisPaisa,${positiveOriginalPaidSql(model,'requested.scope','requested.seller',dialect)} paidPaisa,${used} usedPaisa FROM requested`).bind(scope,source.sellerId).first<{basisPaisa:number;paidPaisa:number;usedPaisa:number}>();
 if(!row||Object.values(row).some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('Reconcile exact original earned, paid and already-used amounts.');
 return {...row,scopeId:scope,orderItemId:source.orderItemId} as PaidOriginalBasis;
}
