import {checkoutCommitClock} from '../checkout/commit-policy-guards';

function guard(db:D1Database,predicate:string,values:unknown[]=[]){const id=crypto.randomUUID();return[db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
/** Internal composition only. The owning cancellation/dispatch transaction supplies its authority and order-version guards. */
export async function prepareOrderStockSettlement(db:D1Database,input:{orderId:string;itemIds:readonly string[];action:'release'|'consume';actorId:string|null;requestId:string;reason:string}){
 const statements:D1PreparedStatement[]=[],clock=checkoutCommitClock(db);
 if(new Set(input.itemIds).size!==input.itemIds.length)throw new Error('Duplicate inventory settlement line.');
 for(const itemId of input.itemIds){
  const row=await db.prepare('SELECT i.id,i.product_id AS productId,i.quantity,i.fulfillment_status AS status,s.reservation_id AS reservationId,r.offer_id AS offerId,r.quantity AS reservedQuantity,r.state,r.revision FROM order_items i LEFT JOIN order_item_offer_snapshots s ON s.order_item_id=i.id LEFT JOIN offer_stock_reservations r ON r.id=s.reservation_id WHERE i.id=? AND i.order_id=?').bind(itemId,input.orderId).first<{id:string;productId:string|null;quantity:number;status:string;reservationId:string|null;offerId:string|null;reservedQuantity:number|null;state:string|null;revision:number|null}>();
  if(!row||!['confirmed','packing','ready_for_pickup'].includes(row.status))throw new Error('The original reserved order line needs reconciliation before stock settlement.');
  statements.push(...guard(db,'EXISTS(SELECT 1 FROM order_items WHERE id=? AND order_id=? AND fulfillment_status=? AND quantity=?)',[itemId,input.orderId,row.status,row.quantity]));
  if(row.reservationId){
   if(!row.offerId||row.state!=='reserved'||row.reservedQuantity!==row.quantity)throw new Error('The exact offer reservation needs reconciliation.');
   const returned=input.action==='release'?row.quantity:0;
   statements.push(db.prepare(`UPDATE offer_stock_reservations SET state=?,revision=revision+1,updated_at=${clock} WHERE id=? AND revision=? AND state='reserved'`).bind(input.action==='release'?'released':'consumed',row.reservationId,row.revision),...guard(db,'changes()=1'),db.prepare(`UPDATE offer_stock SET available=available+?,reserved=reserved-?,revision=revision+1,updated_at=${clock} WHERE offer_id=? AND reserved>=? AND available<=?`).bind(returned,row.quantity,row.offerId,row.quantity,1_000_000_000-returned),...guard(db,'changes()=1'),db.prepare(`INSERT INTO offer_stock_events(id,offer_id,kind,available_delta,reserved_delta,reason,actor_id,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.offerId,input.action,returned,-row.quantity,input.reason,input.actorId,input.requestId+':'+itemId));
  }else{
   statements.push(...guard(db,'NOT EXISTS(SELECT 1 FROM order_item_offer_snapshots WHERE order_item_id=?) AND NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=? AND inventory_mapped=1)',[itemId,row.productId]));
   if(input.action==='release'&&row.productId)statements.push(db.prepare(`UPDATE products SET inventory_quantity=inventory_quantity+?,updated_at=${clock} WHERE id=? AND inventory_quantity<=?`).bind(row.quantity,row.productId,1_000_000_000-row.quantity),...guard(db,'changes()=1'));
  }
 }
 return statements;
}
