/** The canonical managed refund reversal stays intact. Original component responsibility
 * supplies a linked compensation/delivery adjustment in the same completion transaction.
 */
export function managedRefundResponsibilityStatements(db:D1Database,input:{entitlementId:string;refundId:string;actorId:string|null;requestId:string;now:number;completedRefundRequestId?:string;earnedRequestId?:string}){
 if(!input.completedRefundRequestId&&!input.earnedRequestId)throw new Error('Use the original refund completion or winning deferred accrual.');
 const completedGate=input.completedRefundRequestId?'AND r.operation_request_id=?':'',completedValues=input.completedRefundRequestId?[input.completedRefundRequestId]:[];
 const earnedGate=input.earnedRequestId?"AND (EXISTS(SELECT 1 FROM managed_settlement_entries earned WHERE earned.entitlement_id=e.id AND earned.type='earned' AND earned.request_id=?) OR e.calculated_paisa=0 AND e.status='earned')":'',earnedValues=input.earnedRequestId?[input.earnedRequestId]:[];
 const native="COALESCE((SELECT -SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=e.id AND x.refund_id=r.id AND x.type='refund_adjustment'),0)";
 const merchandise="EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='merchandise' AND cost.party='seller' AND cost.seller_id=e.seller_id)";
 const delivery="COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id AND cost.component='original_delivery' AND cost.party='seller' AND cost.seller_id=e.seller_id),0)";
 const amount=`CASE WHEN ${merchandise} THEN 0 ELSE ${native} END-${delivery}`;
 return [db.prepare(`INSERT INTO managed_settlement_entries(id,entitlement_id,refund_id,type,amount_paisa,metadata_json,reason_code,request_id,created_by,created_at)
  SELECT ?,e.id,r.id,'dispute_adjustment',${amount},json_object('source','original_refund_component_responsibility','refundId',r.id,'merchandiseCompensationPaisa',CASE WHEN ${merchandise} THEN 0 ELSE ${native} END,'sellerOriginalDeliveryPaisa',${delivery}),
   'refund_responsibility',?,?,? FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id JOIN return_requests c ON c.order_item_id=s.order_item_id JOIN refunds r ON r.return_request_id=c.id
  WHERE e.id=? AND r.id=? AND e.earned_at IS NOT NULL AND r.status='paid' ${completedGate} ${earnedGate}
  AND EXISTS(SELECT 1 FROM refund_cost_allocations cost WHERE cost.refund_id=r.id) AND (${amount})<>0
  AND NOT EXISTS(SELECT 1 FROM managed_settlement_entries prior WHERE prior.entitlement_id=e.id AND prior.refund_id=r.id AND prior.reason_code='refund_responsibility')`)
  .bind(crypto.randomUUID(),input.requestId,input.actorId,input.now,input.entitlementId,input.refundId,...completedValues,...earnedValues)];
}
