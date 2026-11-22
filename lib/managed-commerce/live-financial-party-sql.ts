/** Pure source predicates shared by runtime and authoritative native source generation. */
function alias(value:string){if(!/^[a-z_]+$/.test(value))throw new Error('Invalid exact financial source alias.');return value;}
function expression(value:string){if(!/^(?:\?|(?:[a-z_]+|NEW)\.[a-z_]+)$/.test(value))throw new Error('Invalid financial party expression.');return value;}
/** Four actor placeholders when actor='?'. All references concern this exact immutable original snapshot. */
export function liveSnapshotPartySql(snapshot:string,actor='?'){
 alias(snapshot);expression(actor);
 return `(${snapshot}.record_kind='live' AND EXISTS(SELECT 1 FROM seller_profiles party_owner JOIN order_items party_item ON party_item.id=${snapshot}.order_item_id JOIN orders party_order ON party_order.id=party_item.order_id JOIN managed_live_activation_decisions party_decision ON party_decision.id=${snapshot}.live_activation_decision_id WHERE party_owner.id=${snapshot}.seller_id AND (party_owner.user_id=${actor} OR party_decision.owner_id=${actor} OR ${snapshot}.live_customer_id=${actor} OR party_order.customer_id=${actor})))`;
}
export function liveInvoicePartySql(invoice:string,actor='?',financialScopeExpression?:string){
 alias(invoice);expression(actor);if(financialScopeExpression)expression(financialScopeExpression);
 return `EXISTS(SELECT 1 FROM managed_commercial_snapshots invoice_party JOIN order_items invoice_item ON invoice_item.id=invoice_party.order_item_id WHERE invoice_item.order_id=${invoice}.order_id AND invoice_party.invoice_issuer_reference=${invoice}.issuer_reference AND invoice_party.live_financial_scope_id=${financialScopeExpression??`json_extract(${invoice}.snapshot_json,'$.financialScopeId')`} AND ${liveSnapshotPartySql('invoice_party',actor)})`;
}
export function livePayoutPartySql(payout='?',actor='?'){
 expression(payout);expression(actor);
 return `EXISTS(SELECT 1 FROM managed_payout_allocations party_allocation JOIN managed_entitlements party_earning ON party_earning.id=party_allocation.entitlement_id JOIN managed_commercial_snapshots payout_party ON payout_party.id=party_earning.snapshot_id WHERE party_allocation.payout_id=${payout} AND ${liveSnapshotPartySql('payout_party',actor)})`;
}
