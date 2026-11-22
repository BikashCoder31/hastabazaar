import assert from 'node:assert/strict';
import {allocateOriginalDelivery,ORIGINAL_DELIVERY_ALLOCATION} from '../../lib/returns/delivery-allocation';
import {prepareSellerParcels,listParcels,operateParcel} from '../../lib/operations/parcels';
import {executeFixtureRefund} from './execute-fixture-refund';
import {seedVerifiedCheckoutContact} from './checkout-contact';
import {cancellationPreview,cancelSelectedParcels} from '../../lib/cancellation/repository';

/** Finish constructing an old synthetic order before intake: real original allocation and native COD collection.
 * No retained allocation, payment packet or actual order history is overwritten.
 */
export async function prepareLegacyReturnSources(db:D1Database,orderId='order-1',options:{collect?:boolean;occurredAt?:number}={}){
 assert.ok((await db.prepare('PRAGMA database_list').all<{file:string}>()).results.every(row=>row.file===''));
 const order=(await db.prepare('SELECT customer_id customerId,delivery_charge_paisa delivery,delivered_at delivered,placed_at placed FROM orders WHERE id=?').bind(orderId).first<{customerId:string|null;delivery:number;delivered:number|null;placed:number}>())!;
 if(!order.customerId){
  await db.prepare("INSERT OR IGNORE INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('legacy-refund-customer','legacy-refund-customer','customer@example.test','Fictional original aftercare customer','active',1,1)").run();
  await db.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('legacy-refund-customer','customer',1)").run();
  await db.prepare("UPDATE orders SET customer_id='legacy-refund-customer' WHERE id=? AND customer_id IS NULL").bind(orderId).run();
 }
 const existing=(await db.prepare('SELECT COUNT(*) n FROM order_delivery_allocations WHERE order_id=?').bind(orderId).first<{n:number}>())!.n;
 if(!existing){
  const items=(await db.prepare('SELECT id,seller_id sellerId,line_total_paisa amount,quantity FROM order_items WHERE order_id=? ORDER BY id').bind(orderId).all<{id:string;sellerId:string;amount:number;quantity:number}>()).results;
  const shares=allocateOriginalDelivery(order.delivery,items);
  await db.batch(items.map(item=>db.prepare('INSERT INTO order_delivery_allocations(order_item_id,order_id,seller_id,amount_paisa,original_quantity,policy_version,created_at) VALUES(?,?,?,?,?,?,?)').bind(item.id,orderId,item.sellerId,shares.get(item.id)!,item.quantity,ORIGINAL_DELIVERY_ALLOCATION,order.placed)));
 }
 if(options.collect===false|| (await listParcels(db,orderId)).length)return;
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM return_requests r JOIN order_items i ON i.id=r.order_item_id WHERE i.order_id=?').bind(orderId).first<{n:number}>())!.n,0,'Construct the synthetic original physical source before case intake.');
 const at=options.occurredAt??order.delivered??Date.now(),prefix='legacy-original-'+orderId;
 // This old fixture originally starts with bare delivered labels and no custody events.
 // Its initial preparation point is explicit; dispatch, collection and delivery below are real domain commands.
 await db.prepare("UPDATE orders SET status='ready_for_pickup',payment_status='pending',delivered_at=NULL WHERE id=?").bind(orderId).run();
 await db.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=? AND fulfillment_status<>'cancelled'").bind(orderId).run();
 await prepareSellerParcels(db,{orderId,actorId:'super-1',requestId:prefix+'-setup',now:at-4});
 for(const initial of await listParcels(db,orderId)){
  for(const[action,index]of [['assign',0],['dispatch',1],['collect',2],['deliver',3]] as const){const p=(await listParcels(db,orderId)).find(p=>p.id===initial.id)!;
   await operateParcel(db,{jobId:p.id,actorId:'super-1',action,version:p.version,note:'Record actual fictional original custody and customer cash before refund intake.',requestId:prefix+'-'+p.sellerId+'-'+action,now:at-3+index,...(action==='assign'?{method:'courier',courierName:'Fictional historical carrier',trackingCode:prefix}:{}),...(action==='collect'?{amountPaisa:p.codDuePaisa,reference:'FICTIONAL-ORIGINAL-CUSTOMER-CASH-'+orderId}:{})});
  }
 }
}

export async function startLegacyReturnPacket(db:D1Database,input:{caseId:string;actorId:string}){
 const source=(await db.prepare('SELECT r.id refundId,o.customer_id customerId FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.return_request_id=?').bind(input.caseId).first<{refundId:string;customerId:string}>())!;assert.ok(source);
 await seedVerifiedCheckoutContact(db,source.customerId,'9811111111',Date.now());
 return executeFixtureRefund(db,{actorId:input.actorId,kind:'return_refund',sourceId:source.refundId,customerId:source.customerId,deferCompletion:true});
}

/** Commit real custody/cash, then inject the documented post-commit worker outage before managed accrual. */
export async function collectLegacyManagedBeforeAccrual(db:D1Database,occurredAt:number){
 await prepareLegacyReturnSources(db,'order-1',{collect:false});
 await db.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id='order-1' AND fulfillment_status<>'cancelled'").run();
 for(const first of await listParcels(db,'order-1'))for(const[action,index]of [['assign',0],['dispatch',1],['deliver',2]] as const){const p=(await listParcels(db,'order-1')).find(p=>p.id===first.id)!;await operateParcel(db,{jobId:p.id,actorId:'super-1',action,version:p.version,note:'Record actual fictional custody before original customer cash and later worker recovery.',requestId:'legacy-managed-'+p.sellerId+'-'+action,now:occurredAt-2+index,...(action==='assign'?{method:'courier',courierName:'Fictional original managed carrier',trackingCode:'FICTIONAL-ORIGINAL-MANAGED-CUSTODY'}:{})});}
 let interrupted=false;
 for(const first of await listParcels(db,'order-1')){
  let batches=0;const target={prepare:db.prepare.bind(db),batch:async(statements:D1PreparedStatement[])=>{if(++batches===2){interrupted=true;throw new Error('FICTIONAL_POST_CASH_MANAGED_WORKER_OUTAGE');}return db.batch(statements);}} as D1Database;
  try{await operateParcel(target,{jobId:first.id,actorId:'super-1',action:'collect',version:first.version,amountPaisa:first.codDuePaisa,reference:'FICTIONAL-ORIGINAL-MANAGED-CASH-'+first.sellerId,note:'Record actual original customer cash before the separately recoverable worker.',requestId:'legacy-managed-'+first.sellerId+'-cash',now:occurredAt});}catch(error){if(!(error instanceof Error)||error.message!=='FICTIONAL_POST_CASH_MANAGED_WORKER_OUTAGE')throw error;}
 }
 assert.equal(interrupted,true,'The fixture must reach an actual post-cash accrual batch, not invent paid labels.');
 assert.ok((await listParcels(db,'order-1')).every(p=>p.collectedPaisa===p.codDuePaisa));
}

/** New explicit original fixture contract: two stores,60k checkout carriage, actual cancellation leaves40k. */
export async function prepareLegacyCancelledDeliveryOrder(db:D1Database,options:{quantityTwo?:boolean}={}){
 assert.ok((await db.prepare('PRAGMA database_list').all<{file:string}>()).results.every(row=>row.file===''));
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM order_delivery_allocations').first<{n:number}>())!.n,0);
 const original=(await db.prepare("SELECT delivered_at at FROM orders WHERE id='order-1'").first<{at:number}>())!;
 await db.prepare("UPDATE order_items SET order_id='order-1',fulfillment_status='confirmed',made_to_order_snapshot=0").run();
 if(options.quantityTwo)await db.prepare("UPDATE order_items SET quantity=2,unit_price_paisa=50000 WHERE id='item-1'").run();
 const delivery={currency:'NPR',zone:'valley',pricingPolicy:'base_plus_half_per_additional_store_v1',baseChargePaisa:40000,storeCount:2,chargePaisa:60000};
 await db.prepare("UPDATE orders SET status='confirmed',payment_status='pending',delivered_at=NULL,item_subtotal_paisa=2300000,delivery_charge_paisa=60000,grand_total_paisa=2360000,delivery_rate_snapshot_json=? WHERE id='order-1'").bind(JSON.stringify(delivery)).run();
 await db.prepare("UPDATE payments SET status='pending',amount_paisa=2360000 WHERE order_id='order-1'").run();
 await prepareLegacyReturnSources(db,'order-1',{collect:false});
 const access={orderNumber:'HK-TEST-1',receiptTokenHash:'receipt-hash-1'},preview=await cancellationPreview(db,access,['seller-2']);
 assert.equal(preview.reviewRequired,false);assert.equal(preview.next.delivery,40000);
 await cancelSelectedParcels(db,access,{sellerIds:['seller-2'],fingerprint:preview.fingerprint,requestId:'legacy-original-delivery-cancellation',note:'Cancel this ordinary unpaid whole seller portion before physical handoff.',now:original.at-10});
 await prepareLegacyReturnSources(db,'order-1',{occurredAt:original.at});
 assert.equal((await db.prepare("SELECT cancellation_version n FROM orders WHERE id='order-1'").first<{n:number}>())!.n,1);
 const rows=(await db.prepare('SELECT order_item_id id,amount_paisa amount FROM order_delivery_adjustments WHERE order_id=? ORDER BY order_item_id').bind('order-1').all<{id:string;amount:number}>()).results;
 assert.equal(rows.reduce((n,r)=>n+r.amount,0),40000);return new Map(rows.map(row=>[row.id,row.amount]));
}
