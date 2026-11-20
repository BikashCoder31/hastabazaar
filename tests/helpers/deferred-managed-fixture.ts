import assert from 'node:assert/strict';
import {earnedMaker} from './company-store-financial-fixture';
export async function deferredManagedFixture(parts:readonly {party:'platform'|'seller';base:number}[]=[{party:'platform',base:30000},{party:'seller',base:20000}]){
 const f=await earnedMaker('calculated');try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 // Explicit historical paid facts in a new memory fixture; this does not simulate a successful live refund or bypass its execution path.
 f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?").run(f.now+7,f.orderId);
 f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id=?").run(f.itemId);
 for(const [index,{party,base}] of parts.entries()){
  const id='deferred-'+party;
  f.sqlite.prepare("INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at) VALUES(?,?,'Fictional original refund','Explicit retained historical paid facts','resolved',?)").run(id+'-return',f.itemId,f.now+20+index);
  f.sqlite.prepare("INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,commission_base_refunded_paisa,reason,requested_at,processed_at,operation_request_id,item_amount_paisa,liability) VALUES(?,?,?,'paid',?,?,'Fictional retained original paid refund',?,?,?,?,?)").run(id,f.orderId,id+'-return',base,base,f.now+20+index,f.now+20+index,id+'-paid',base,party);
  f.sqlite.prepare("INSERT INTO refund_cost_allocations(refund_id,component,party,seller_id,amount_paisa,policy_version,created_by,created_at) VALUES(?,'merchandise',?,?,?,'approved_original_refund_costs_v1','reviewer',?)").run(id,party,party==='seller'?f.sellerId:null,base,f.now+20+index);
 }
 return f;
 }catch(error){f.dispose();throw error;}
}
