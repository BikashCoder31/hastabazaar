import {splitOriginalPaisa} from '../cancellation/accounting';
import {roundHalfUpRatio} from '../marketplace/policy';
import {paymentGuard} from '../payments/manual-receipts';
import { readUnclaimedDeliveryUnits, usesSellerShipmentDelivery } from './seller-shipment-delivery';
import { originalVoluntaryDeliveryTerms } from './priced-return-policy';

export const ORIGINAL_DELIVERY_ALLOCATION='original_seller_item_largest_remainder_v1';
export function allocateOriginalDelivery(total:number,items:readonly {id:string;sellerId:string;amount:number;quantity:number}[]){
 const sellers=new Map<string,number>();
 for(const item of items)sellers.set(item.sellerId,(sellers.get(item.sellerId)??0)+item.amount);
 const shares=splitOriginalPaisa(total,[...sellers].map(([id,amount])=>({id,amount}))),result=new Map<string,number>();
 for(const [sellerId,share]of shares)for(const [itemId,amount]of splitOriginalPaisa(share,items.filter(i=>i.sellerId===sellerId)))result.set(itemId,amount);
 return result;
}

/** An approved cancellation is an append-only contract adjustment, never an overwrite of checkout. */
export function prepareCancelledDeliveryAllocations(db:D1Database,input:{eventId:string;orderId:string;total:number;now:number},items:readonly {id:string;sellerId:string;amount:number;quantity:number}[]){
 const shares=allocateOriginalDelivery(input.total,items),statements=items.map(item=>db.prepare('INSERT INTO order_delivery_adjustments(event_id,order_item_id,order_id,seller_id,amount_paisa,original_quantity,policy_version,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(input.eventId,item.id,input.orderId,item.sellerId,shares.get(item.id)!,item.quantity,ORIGINAL_DELIVERY_ALLOCATION,input.now));
 return [...statements,...paymentGuard(db,`EXISTS(SELECT 1 FROM order_cancellation_events WHERE id=? AND order_id=? AND json_extract(next_json,'$.delivery')=?) AND COALESCE((SELECT SUM(amount_paisa) FROM order_delivery_adjustments WHERE event_id=?),0)=? AND (SELECT COUNT(*) FROM order_delivery_adjustments WHERE event_id=?)=(SELECT COUNT(*) FROM order_items WHERE order_id=? AND fulfillment_status<>'cancelled')`,[input.eventId,input.orderId,input.total,input.eventId,input.total,input.eventId,input.orderId])];
}
export function effectiveDeliveryAllocationSql(item='original_item',order='o',column:'amount_paisa'|'original_quantity'='amount_paisa'){
 if(!/^[a-z_]+$/.test(item)||!/^[a-z_]+$/.test(order))throw new Error('Use internal original allocation aliases.');
 return `CASE WHEN ${order}.cancellation_version>0 THEN (SELECT a.${column} FROM order_delivery_adjustments a JOIN order_cancellation_events e ON e.id=a.event_id WHERE a.order_item_id=${item}.id AND e.order_id=${order}.id AND e.version=${order}.cancellation_version) ELSE COALESCE((SELECT a.${column} FROM order_delivery_allocations a WHERE a.order_item_id=${item}.id),CASE WHEN ${order}.delivery_charge_paisa=0 THEN ${column==='amount_paisa'?'0':`${item}.quantity`} ELSE NULL END) END`;
}

export async function originalReturnDelivery(db:D1Database,caseId:string){
 const row=await db.prepare(`SELECT rr.order_item_id AS itemId,rr.quantity,o.id AS orderId,o.delivery_rate_snapshot_json AS deliverySnapshot,
 o.return_policy_snapshot_json AS returnPolicy,
 original_item.quantity AS purchasedQuantity,o.delivery_charge_paisa AS originalDelivery,o.cancellation_version AS sourceVersion,
 ${effectiveDeliveryAllocationSql()} AS allocation,${effectiveDeliveryAllocationSql('original_item','o','original_quantity')} AS originalQuantity,
 COALESCE((SELECT SUM(r.delivery_amount_paisa) FROM refunds r JOIN return_requests prior ON prior.id=r.return_request_id
 WHERE prior.order_item_id=rr.order_item_id AND prior.id<>rr.id AND r.status<>'rejected'),0) AS reserved,
 COALESCE((SELECT SUM(prior.quantity) FROM return_requests prior JOIN refunds r ON r.return_request_id=prior.id
 WHERE prior.order_item_id=rr.order_item_id AND prior.id<>rr.id AND r.status<>'rejected'),0) AS priorQuantity
 FROM return_requests rr JOIN order_items original_item ON original_item.id=rr.order_item_id JOIN orders o ON o.id=original_item.order_id
 LEFT JOIN order_delivery_allocations a ON a.order_item_id=rr.order_item_id WHERE rr.id=?`).bind(caseId)
 .first<{itemId:string;quantity:number;orderId:string;deliverySnapshot:string|null;returnPolicy:string;purchasedQuantity:number;originalDelivery:number;sourceVersion:number;allocation:number|null;originalQuantity:number|null;reserved:number;priorQuantity:number}>();
 if(!row)throw new Error('Original return case is unavailable.');
 if (usesSellerShipmentDelivery(row.deliverySnapshot)) {
  const saved = await readUnclaimedDeliveryUnits(db, {
   orderId: row.orderId, orderItemId: row.itemId, originalQuantity: Number(row.purchasedQuantity), quantity: Number(row.quantity), returnRequestId: caseId,
  });
  if (!saved) return { kind: 'needs_reconciliation' as const, amountPaisa: null, originalPaisa: null, sourceVersion: row.sourceVersion };
  return { kind: 'ready' as const, amountPaisa: saved.units.reduce((sum, unit) => sum + unit.amountPaisa, 0),
   originalPaisa: saved.originalPaisa, sourceVersion: row.sourceVersion, units: saved.units };
 }
 if(row.originalDelivery===0&&row.sourceVersion===0)return {kind:'ready' as const,amountPaisa:0,originalPaisa:0,sourceVersion:0};
 // An opted-in voluntary return consumes its original unit share even when
 // the disclosed terms retain it and the refund consequently pays no delivery.
 const retained=originalVoluntaryDeliveryTerms(row.returnPolicy)?await db.prepare(`SELECT COALESCE(SUM(effect.retained_outbound_paisa),0) AS amount
  FROM refund_variant_pricing_effects effect JOIN refunds r ON r.id=effect.refund_id
  WHERE effect.order_item_id=? AND r.return_request_id<>? AND r.status<>'rejected'`).bind(row.itemId,caseId).first<{amount:number}>():null;
 const reserved=Number(row.reserved)+Number(retained?.amount??0);
 if(row.allocation===null||!row.originalQuantity||row.priorQuantity+row.quantity>row.originalQuantity||reserved>row.allocation)
  return {kind:'needs_reconciliation' as const,amountPaisa:null,originalPaisa:row.allocation,sourceVersion:row.sourceVersion};
 return {kind:'ready' as const,amountPaisa:Math.max(0,roundHalfUpRatio(row.allocation,row.priorQuantity+row.quantity,row.originalQuantity)-reserved),originalPaisa:row.allocation,sourceVersion:row.sourceVersion};
}
