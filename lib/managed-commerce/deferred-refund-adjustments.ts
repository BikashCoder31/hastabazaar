import {calculateManagedSaleLinkedRefundAmounts} from '../managed-makers/settlement';
import {managedRefundResponsibilityStatements} from './refund-responsibility';
import {ManagedSettlementError} from './settlement-errors';

/** Attribute each retained paid refund in original completion order during the winning accrual. */
export async function managedDeferredRefundStatements(db:D1Database,input:{entitlementId:string;earnedRequestId:string;actorId:string|null;now:number}){
 const snapshot=await db.prepare("SELECT s.eligible_base_paisa AS base,s.platform_retained_paisa AS retained FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE e.id=? AND s.commercial_model='managed_sale_linked_percentage_v1'").bind(input.entitlementId).first<{base:number;retained:number}>();
 if(!snapshot)throw new ManagedSettlementError('Managed original refund snapshot not found.');
 const refunds=await db.prepare(`SELECT r.id,r.commission_base_refunded_paisa AS base,r.operation_request_id AS operationRequestId,COALESCE(r.processed_at,r.requested_at) AS completedAt FROM refunds r JOIN return_requests c ON c.id=r.return_request_id JOIN managed_commercial_snapshots s ON s.order_item_id=c.order_item_id JOIN managed_entitlements e ON e.snapshot_id=s.id WHERE e.id=? AND r.status='paid' ORDER BY COALESCE(r.processed_at,r.requested_at),r.id`).bind(input.entitlementId).all<{id:string;base:number;operationRequestId:string|null;completedAt:number}>();
 if(!refunds.results.length)return [];
 const winner=`(EXISTS(SELECT 1 FROM managed_settlement_entries WHERE entitlement_id=? AND type='earned' AND request_id=?) OR EXISTS(SELECT 1 FROM managed_entitlements WHERE id=? AND calculated_paisa=0 AND status='earned' AND earned_at IS NOT NULL))`,claim=[input.entitlementId,input.earnedRequestId,input.entitlementId];
 const statements:D1PreparedStatement[]=[];
 const guard=(predicate:string,values:unknown[])=>{const id=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN NOT ${winner} OR (${predicate}) THEN 1 ELSE 0 END`).bind(id,...claim,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id));};
 const paidSource="FROM refunds r JOIN return_requests c ON c.id=r.return_request_id JOIN managed_commercial_snapshots s ON s.order_item_id=c.order_item_id JOIN managed_entitlements e ON e.snapshot_id=s.id WHERE e.id=? AND r.status='paid'";
 const total=refunds.results.reduce((sum,r)=>{if(!Number.isSafeInteger(r.base)||r.base<0)throw new ManagedSettlementError('Retained refunded base needs reconciliation.');return sum+BigInt(r.base);},BigInt(0));
 if(total>BigInt(snapshot.base))throw new ManagedSettlementError('Refund adjustments cannot exceed the original eligible base.');
 guard(`(SELECT COUNT(*) ${paidSource})=? AND COALESCE((SELECT SUM(r.commission_base_refunded_paisa) ${paidSource}),0)=? AND NOT EXISTS(SELECT 1 FROM managed_settlement_entries WHERE entitlement_id=? AND type='refund_adjustment')`,[input.entitlementId,refunds.results.length,input.entitlementId,Number(total),input.entitlementId]);
 let cumulative=0,priorReversal=0,postedBase=0;
 for(const refund of refunds.results){
  guard('EXISTS(SELECT 1 FROM refunds WHERE id=? AND status=\'paid\' AND commission_base_refunded_paisa=? AND COALESCE(operation_request_id,\'\')=? AND COALESCE(processed_at,requested_at)=?)',[refund.id,refund.base,refund.operationRequestId??'',refund.completedAt]);
  cumulative+=refund.base;
  const current=calculateManagedSaleLinkedRefundAmounts({originalEligibleBasePaisa:snapshot.base,originalPlatformRetainedPaisa:snapshot.retained,refundedEligibleBasePaisa:cumulative}),amount=current.makerEntitlementReversalPaisa-priorReversal;
  if(amount){
   statements.push(db.prepare(`INSERT INTO managed_settlement_entries(id,entitlement_id,refund_id,type,amount_paisa,base_amount_paisa,metadata_json,reason_code,request_id,created_by,created_at) SELECT ?,?,?,'refund_adjustment',?,?,?,'refund_before_earning',?,?,? WHERE ${winner}`)
    .bind(crypto.randomUUID(),input.entitlementId,refund.id,-amount,cumulative-postedBase,JSON.stringify({source:'original_deferred_refund',currentRefundEligibleBasePaisa:refund.base,carriedRefundEligibleBasePaisa:cumulative-postedBase-refund.base,makerEntitlementReversalPaisa:amount,platformRetentionReversalPaisa:cumulative-postedBase-amount,accrualRequestId:input.earnedRequestId}),'deferred-refund:'+crypto.randomUUID(),input.actorId,input.now,...claim));
   postedBase=cumulative;
  }
  statements.push(...managedRefundResponsibilityStatements(db,{entitlementId:input.entitlementId,refundId:refund.id,actorId:input.actorId,requestId:'deferred-responsibility:'+crypto.randomUUID(),now:input.now,earnedRequestId:input.earnedRequestId,...refund.operationRequestId?{completedRefundRequestId:refund.operationRequestId}:{}}));
  priorReversal=current.makerEntitlementReversalPaisa;
 }
 return statements;
}
