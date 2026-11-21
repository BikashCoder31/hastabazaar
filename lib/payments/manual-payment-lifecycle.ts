import {prepareOrderResponseRelease} from '../orders/response-workflow';
import {preparePaymentException} from './payment-exceptions';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {prepareOrderStockSettlement} from '../products/order-stock-settlement';
import { cancellationCauseSchemaAvailable } from '../cancellation/attribution';
import {allocateCancellationItems,calculateCancellation} from '../cancellation/accounting';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {readOriginalBuyerLinePricing} from '../db/repositories/order-item-pricing-snapshots';
import {
  prepareCancellationDeliveryUnitClaims,
  readSavedSellerShipmentCharges,
  SELLER_SHIPMENT_DELIVERY_POLICY,
  usesSellerShipmentDelivery,
} from '../returns/seller-shipment-delivery';

function guard(db:D1Database,predicate:string,values:unknown[]=[]){const id=crypto.randomUUID();return[db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}

export const guidedReleaseKey = (orderId: string) => 'guided-release:' + orderId;

/** Existing obligations use their original reservations and existing-work restrictions. */
export function paidManualReleaseChecks(db: D1Database) {
 const clock=checkoutCommitClock(db);
 return {
  order: `EXISTS(SELECT 1 FROM orders o JOIN users u ON u.id=o.customer_id WHERE o.id=w.order_id AND o.payment_status='paid' AND o.status='placed' AND u.status='active')`,
  funds: `EXISTS(SELECT 1 FROM manual_payment_balances b WHERE b.order_id=w.order_id AND b.received_paisa>=b.payable_paisa)`,
  items: `EXISTS(SELECT 1 FROM order_items WHERE order_id=w.order_id AND fulfillment_status='confirmed')
 AND NOT EXISTS(SELECT 1 FROM order_items i JOIN seller_profiles s ON s.id=i.seller_id JOIN users u ON u.id=s.user_id WHERE i.order_id=w.order_id AND i.fulfillment_status<>'cancelled' AND (u.status<>'active' OR EXISTS(SELECT 1 FROM seller_restrictions r WHERE r.seller_id=s.id AND r.obligation_mode<>'allow_existing' AND (r.mode='disabled' OR r.mode='suspended' AND r.suspended_until>${clock}))))
 AND NOT EXISTS(SELECT 1 FROM order_items i LEFT JOIN order_item_offer_snapshots snap ON snap.order_item_id=i.id LEFT JOIN offer_stock_reservations r ON r.id=snap.reservation_id LEFT JOIN offer_stock s ON s.offer_id=r.offer_id WHERE i.order_id=w.order_id AND i.fulfillment_status<>'cancelled' AND ((snap.order_item_id IS NOT NULL AND (r.id IS NULL OR r.state<>'reserved' OR r.quantity<>i.quantity OR s.offer_id IS NULL OR s.reserved<r.quantity)) OR (snap.order_item_id IS NULL AND EXISTS(SELECT 1 FROM product_offer_heads h WHERE h.product_id=i.product_id AND h.inventory_mapped=1))))`,
  noHold: `NOT EXISTS(SELECT 1 FROM order_cancellation_reviews c WHERE c.order_id=w.order_id AND c.status='pending')
 AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=w.order_id AND e.kind IN('fulfillment_hold','receipt_reversal') AND e.state<>'resolved')`,
 };
}

export function preparePaidManualRelease(db:D1Database,orderId:string,reviewed=false){
 const clock=checkoutCommitClock(db),checks=paidManualReleaseChecks(db);
 const plannedRelease=reviewed?'':' AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=w.order_id AND e.source_key=?)';
 return [db.prepare(`UPDATE manual_payment_windows AS w SET released_at=${clock},revision=revision+1 WHERE order_id=? AND paid_at IS NOT NULL AND closed_at IS NULL AND released_at IS NULL
 AND (${checks.order}) AND (${checks.funds}) AND (${checks.items}) AND (${checks.noHold})${plannedRelease}`).bind(orderId,...reviewed?[]:[guidedReleaseKey(orderId)]),
 db.prepare(`UPDATE orders SET status='confirmed',updated_at=${clock} WHERE id=? AND status='placed' AND EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=orders.id AND w.released_at IS NOT NULL)`).bind(orderId),...prepareOrderResponseRelease(db,orderId)];
}

/** Prepares the original closure for the scheduled producer or an authorized finance command. */
export async function prepareManualPaymentExpiry(db:D1Database,orderId:string,staff?:{actorId:string;reason:string}){
 const clock=checkoutCommitClock(db),eventKey=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'CONCAT(?,id)':'?||id',window=await db.prepare(`SELECT w.revision,w.closed_at AS closedAt,w.paid_at AS paidAt,w.cutoff_at AS cutoffAt,${clock} AS now FROM manual_payment_cutoffs w WHERE order_id=?`).bind(orderId).first<{revision:number;closedAt:number|null;paidAt:number|null;cutoffAt:number;now:number}>();
 if(!window)throw new Error('No original manual payment window.');if(window.closedAt!==null)return {orderId,state:'expired' as const};if(window.paidAt!==null)return {orderId,state:'paid' as const};if(window.now<window.cutoffAt)return {orderId,state:'open' as const};
 const order=await db.prepare('SELECT customer_id AS customerId,status,cancellation_version AS version,item_subtotal_paisa AS subtotal,delivery_charge_paisa AS delivery,delivery_rate_snapshot_json AS deliverySnapshot,buyer_platform_fee_paisa AS serviceFee,wallet_credit_paisa AS wallet,referral_discount_paisa+promo_discount_paisa AS discount,promo_discount_paisa AS promo FROM orders WHERE id=?').bind(orderId).first<{customerId:string;status:string;version:number;subtotal:number;delivery:number;deliverySnapshot:string|null;serviceFee:number;wallet:number;discount:number;promo:number}>();
 if(!order||!['placed','confirmed'].includes(order.status))throw new Error('The overdue order needs reconciliation before automatic cancellation.');
 const items=(await db.prepare('SELECT id,seller_id AS sellerId,line_total_paisa AS amount,promo_discount_paisa AS promo,fulfillment_status AS status FROM order_items WHERE order_id=? ORDER BY id').bind(orderId).all<{id:string;sellerId:string;amount:number;promo:number;status:string}>()).results;
 if(!items.length||items.some(item=>!['confirmed','cancelled'].includes(item.status)))throw new Error('This unpaid order has a conflicting fulfillment state.');
 const buyerPricing = await readOriginalBuyerLinePricing(db, orderId);
 const allocationItems = buyerPricing ? items.map(item => ({
   ...item,
   amount: buyerPricing.get(item.id)?.customerSubtotalPaisa ?? item.amount,
   // Use exact promo allocations only when there was a promo at checkout.
   promo: order.promo > 0 ? item.promo : undefined,
 })) : items;
 if (buyerPricing && allocationItems.reduce((sum, item) => sum + BigInt(item.amount), BigInt(0)) !== BigInt(order.subtotal)) {
   throw new Error('Reconcile original buyer prices before automatic cancellation.');
 }
 const allocations = allocateCancellationItems(allocationItems, order.wallet, order.discount);
 const cancelled = new Set(items.filter(item => item.status === 'cancelled').map(item => item.sellerId));
 const allSellers = new Set(items.map(item => item.sellerId));
 const selectedSellers = [...allSellers].filter(seller => !cancelled.has(seller));
 const usesSavedShipments = usesSellerShipmentDelivery(order.deliverySnapshot);
 const deliveryRule = usesSavedShipments ? {
   pricingPolicy: SELLER_SHIPMENT_DELIVERY_POLICY,
   sellerCharges: await readSavedSellerShipmentCharges(db, orderId, order.delivery, [...allSellers]),
 } as const : order.delivery;
 const previous = calculateCancellation(allocations, cancelled, deliveryRule, order.serviceFee);
 const next = calculateCancellation(allocations, allSellers, deliveryRule, order.serviceFee);
 const eventId = 'manual-expiry:' + orderId;
 const causeAvailable = await cancellationCauseSchemaAvailable(db);
 const reason = staff?.reason ?? 'The original manual payment window expired without fully verified funds.';
 const actorId = staff?.actorId ?? null;
 const unitClaims = usesSavedShipments && selectedSellers.length > 0
   ? prepareCancellationDeliveryUnitClaims(db, {
     eventId, orderId, sellerIds: selectedSellers, removedDeliveryPaisa: previous.delivery - next.delivery, now: window.now,
   })
   : [];
 const statements=[db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=? AND cancellation_version=?').bind(orderId,order.version),...guard(db,'changes()=1'),...guard(db,`EXISTS(SELECT 1 FROM manual_payment_cutoffs WHERE order_id=? AND revision=? AND paid_at IS NULL AND closed_at IS NULL AND cutoff_at<=${clock})`,[orderId,window.revision]),...await prepareOrderStockSettlement(db,{orderId,itemIds:items.filter(item=>item.status==='confirmed').map(item=>item.id),action:'release',actorId:null,requestId:eventId,reason}),
 db.prepare(`UPDATE manual_payment_windows SET closed_at=${clock},closure_reason='expired',revision=revision+1,last_event_id=? WHERE order_id=? AND revision=? AND paid_at IS NULL AND closed_at IS NULL`).bind(eventId,orderId,window.revision),...guard(db,'changes()=1'),
 db.prepare(`INSERT INTO order_cancellation_events(id,order_id,actor_id,version,seller_ids_json,original_allocations_json,previous_json,next_json,note,wallet_restored_paisa,discount_removed_paisa,item_removed_paisa,created_at${causeAvailable ? ',cause' : ''}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,${clock}${causeAvailable ? ",'payment'" : ''})`).bind(eventId,orderId,actorId,order.version+1,JSON.stringify(selectedSellers),JSON.stringify(allocations),JSON.stringify(previous),JSON.stringify(next),reason,previous.wallet,previous.discount,previous.subtotal),
 ...unitClaims,
 db.prepare(`INSERT INTO order_item_status_events(id,order_item_id,from_status,to_status,note,actor_id,request_id,created_at) SELECT ${eventKey},id,fulfillment_status,'cancelled',?,?,${eventKey},${clock} FROM order_items WHERE order_id=? AND fulfillment_status='confirmed'`).bind(eventId+':',reason,actorId,eventId+':',orderId),
 db.prepare("UPDATE order_items SET fulfillment_status='cancelled',current_promo_discount_paisa=0,fulfillment_request_id=? WHERE order_id=? AND fulfillment_status='confirmed'").bind(eventId,orderId),
 db.prepare(`UPDATE orders SET status='cancelled',payment_status='cancelled',cancellation_version=cancellation_version+1,current_total_paisa=0,current_subtotal_paisa=0,current_delivery_paisa=0,current_wallet_paisa=0,current_discount_paisa=0,current_promo_discount_paisa=0,cancelled_at=${clock},updated_at=${clock} WHERE id=? AND cancellation_version=?`).bind(orderId,order.version),...guard(db,'changes()=1'),
 db.prepare(`UPDATE payments SET status='cancelled',updated_at=${clock} WHERE order_id=? AND provider='manual_bank' AND status='pending'`).bind(orderId),
 db.prepare(`UPDATE shipments SET status='cancelled',updated_at=${clock} WHERE order_id=?`).bind(orderId),
 db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at${causeAvailable ? ',next_json' : ''}) VALUES(?,?,'manual.payment.expired','order',?,?,?,${clock}${causeAvailable ? ',?' : ''})`).bind(eventId,actorId,orderId,reason,eventId,...(causeAvailable ? ['{"cause":"payment"}'] : []))];
 // The existing native cancellation ledger restores consumed wallet credit once. Cash allocations remain linked to this closed order.
 statements.push(...await preparePaymentException(db,{sourceKey:eventId,orderId,receiptId:null,kind:'expired_money',reason:'Actual money remains allocated to an expired order. Finance must review its return or an explicitly approved new-order allocation.',ownerId:null,now:window.now,predicate:'EXISTS(SELECT 1 FROM manual_payment_allocations WHERE order_id=?)',values:[orderId]}),...await operationalBusinessNotificationStatements(db,{kind:'payment.order',sourceId:orderId,eventId,actorId:actorId??'system',now:window.now,status:'expired'}));
 return {orderId,state:'ready' as const,statements};
}

/** Internal scheduled producer. The saved cutoff and native ledger stay authoritative. */
export async function expireManualPaymentOrder(db:D1Database,orderId:string){
 const prepared=await prepareManualPaymentExpiry(db,orderId);
 if(prepared.state!=='ready')return prepared;
 try{await db.batch(prepared.statements);}catch(error){const latest=await db.prepare('SELECT closed_at AS closedAt,paid_at AS paidAt FROM manual_payment_windows WHERE order_id=?').bind(orderId).first<{closedAt:number|null;paidAt:number|null}>();if(latest?.closedAt!==null&&latest?.closedAt!==undefined)return {orderId,state:'expired' as const};if(latest?.paidAt!==null&&latest?.paidAt!==undefined)return {orderId,state:'paid' as const};throw error;}
 return {orderId,state:'expired' as const};
}

/** Compose after the owning cancellation's order update; never rewrite captured bank payment or actual allocations. */
export async function prepareCancelledManualPayment(db:D1Database,input:{orderId:string;requestId:string;actorId:string|null;now:number}){
 if(!await db.prepare('SELECT 1 FROM manual_payment_windows WHERE order_id=?').bind(input.orderId).first())return [];
 const clock=checkoutCommitClock(db),eventId='manual-cancellation:'+input.requestId;
 return [db.prepare(`UPDATE manual_payment_windows SET closed_at=${clock},closure_reason='order_cancelled',revision=revision+1,last_event_id=? WHERE order_id=? AND paid_at IS NULL AND closed_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='cancelled')`).bind(eventId,input.orderId,input.orderId),
 db.prepare("UPDATE manual_payment_windows SET revision=revision+1,last_event_id=? WHERE order_id=? AND paid_at IS NOT NULL AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='cancelled')").bind(eventId,input.orderId,input.orderId),
 db.prepare(`UPDATE payments SET status='cancelled',updated_at=${clock} WHERE order_id=? AND provider='manual_bank' AND status='pending' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='cancelled')`).bind(input.orderId,input.orderId),
 ...await preparePaymentException(db,{sourceKey:'cancelled-money:'+input.orderId,orderId:input.orderId,receiptId:null,kind:'cancelled_money',reason:'Actual money remains allocated to this cancelled order. Review its supported refund obligation and original cash source without erasing the payment.',ownerId:input.actorId,now:input.now,predicate:"EXISTS(SELECT 1 FROM orders o JOIN manual_payment_allocations a ON a.order_id=o.id WHERE o.id=? AND o.status='cancelled' AND NOT EXISTS(SELECT 1 FROM cancellation_refund_sources c WHERE c.id=?))",values:[input.orderId,input.requestId]})];
}
