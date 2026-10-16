import {calculateManagedSaleLinkedRefundAmounts} from '../managed-makers/settlement';

export interface ManagedRefundFacts {refundEligibleBase:number;refundRetained:number;refundPaidBase:number;refundRecordedBase:number;refundReversed:number}
function factsSql(entitlement:string) {
 if(!/^[a-z_]+$/.test(entitlement))throw new Error('Invalid entitlement alias.');
 return {
  refundEligibleBase:`(SELECT eligible_base_paisa FROM managed_commercial_snapshots WHERE id=${entitlement}.snapshot_id)`,
  refundRetained:`(SELECT platform_retained_paisa FROM managed_commercial_snapshots WHERE id=${entitlement}.snapshot_id)`,
  refundPaidBase:`COALESCE((SELECT SUM(r.commission_base_refunded_paisa) FROM refunds r JOIN return_requests c ON c.id=r.return_request_id
   JOIN managed_commercial_snapshots s ON s.order_item_id=c.order_item_id WHERE s.id=${entitlement}.snapshot_id AND r.status='paid'),0)`,
  refundRecordedBase:`COALESCE((SELECT SUM(base_amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=${entitlement}.id AND x.type='refund_adjustment'),0)`,
  refundReversed:`COALESCE((SELECT -SUM(amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=${entitlement}.id AND x.type='refund_adjustment'),0)`,
 };
}
export function managedRefundFactsColumns(entitlement='e') {return Object.entries(factsSql(entitlement)).map(([key,sql])=>`${sql} AS ${key}`).join(',');}
export function managedRefundReconciled(facts:ManagedRefundFacts) {
 if(([facts.refundEligibleBase,facts.refundRetained,facts.refundPaidBase,facts.refundRecordedBase,facts.refundReversed]).some(value=>!Number.isSafeInteger(value)||value<0))return false;
 try{return facts.refundReversed===calculateManagedSaleLinkedRefundAmounts({originalEligibleBasePaisa:facts.refundEligibleBase,
  originalPlatformRetainedPaisa:facts.refundRetained,refundedEligibleBasePaisa:Math.max(facts.refundPaidBase,facts.refundRecordedBase)}).makerEntitlementReversalPaisa;}
 catch{return false;}
}
/** Bind the exact facts used by the canonical integer calculation in the action transaction. */
export function managedRefundFactsGuard(facts:ManagedRefundFacts,entitlement='e') {
 if(!managedRefundReconciled(facts))throw new Error('Refund totals need reconciliation.');
 return Object.entries(factsSql(entitlement)).map(([key,sql])=>`${sql}=${facts[key as keyof ManagedRefundFacts]}`).join(' AND ');
}
