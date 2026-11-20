import assert from 'node:assert/strict';
import {state,post,origin} from './cancellation-fulfillment-fixture';
import {earnedMaker} from './company-store-financial-fixture';
import {cancellationPreview,cancelSelectedParcels} from '../../lib/cancellation/repository';

// Explicit historical mixed order in migrated SQLite :memory:, with FK/trigger
// enforcement. No live activation, canonical data, provider or email is used.
export async function mixedOrder() {
 const f=await earnedMaker('calculated');
 try {
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);
  f.sqlite.exec(`UPDATE users SET auth_subject=id WHERE auth_subject IS NULL;
   INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('pending-owner','pending-owner','pending-owner@local.hastabazaar.test','Fictional pending supplier','active',1,1);
   INSERT INTO user_roles(user_id,role,assigned_at) VALUES('pending-owner','seller',1);
   INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,seller_agreement_version,seller_agreement_accepted_at,created_at,updated_at)
   VALUES('pending-seller','pending-owner','Fictional pending supplier','Fictional pending supplier','Fictional','FICTIONAL-PENDING-REG','PAN','FICTIONAL-PENDING-PAN','Fictional supplier','9800000000','pending-owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional locality','FICTIONAL-PENDING-BANK','approved','historical-fixture',1,1,1);
   INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
   VALUES('pending-product','pending-seller','craft','pending-product','FICTIONAL-PENDING','Fictional pending product','Explicit historical pending portion',20000,10,'Fictional pending supplier','NP','Fictional wood','published',1,1);`);
  f.sqlite.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,commission_rule_version,fulfillment_status,created_at)
   VALUES('pending-item',?,'pending-product','pending-seller','Fictional pending supplier','Fictional pending product','FICTIONAL-PENDING',20000,1,0,0,20000,'historical-fixture','ready_for_pickup',?)`).run(f.orderId,f.now);
  f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id=?").run(f.itemId);
  f.sqlite.prepare("UPDATE orders SET status='dispatched',payment_status='paid',item_subtotal_paisa=120000,grand_total_paisa=120000 WHERE id=?").run(f.orderId);
  for(const [id,seller,status,cash] of [['retained-job',f.sellerId,'delivered',100000],['pending-job','pending-seller','pickup_requested',20000]] as const){
   f.sqlite.prepare("INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at) VALUES(?,?,?,'outbound',?,'reviewer',?,?,?)").run(id,f.orderId,seller,status,id,f.now,f.now);
   f.sqlite.prepare('INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,collected_paisa,delivered_at,created_at) VALUES(?,?,?,?,?)').run(id,cash,cash,status==='delivered'?f.now+7:null,f.now);
  }
  state.db=f.db;state.actor='reviewer';
  const sourceId='mixed-cancellation-review',sellerIds=['pending-seller'];
  const customer={orderNumber:'FICTIONAL-HISTORICAL-MANAGED',customerId:'buyer'};
  const preview=await cancellationPreview(f.db,customer,sellerIds);
  assert.equal((await cancelSelectedParcels(f.db,customer,{sellerIds,fingerprint:preview.fingerprint,requestId:sourceId,note:'Stop the pending portion and retain the actually delivered managed goods.',now:Date.now()})).status,'review_requested');
  const fresh=await cancellationPreview(f.db,{orderNumber:customer.orderNumber,actorId:'reviewer'},sellerIds);
  const requestId=crypto.randomUUID(),body={reviewId:sourceId,action:'approve',fingerprint:fresh.fingerprint,note:'Approve stopping only the pending goods with a separate actual cash refund review.',formVersion:1,customAnswers:[],clientAttemptId:requestId};
  const api=await import('../../app/api/admin/cancellations/route');
  const path='/api/admin/cancellations';
  return {...f,sourceId,requestId,body,api,path,
   send:()=>api.POST(post(path,body,'reviewer')),
   read:()=>api.GET(new Request(origin+path+`?sourceId=${sourceId}&action=approve&requestId=${requestId}`,{headers:{'X-Hastabazaar-Actor':'reviewer'}})),
  };
 }catch(error){state.db=null;f.dispose();throw error;}
}

export async function commitWithoutAcknowledgement(f:Awaited<ReturnType<typeof mixedOrder>>) {
 const wrapped=Object.create(f.db) as D1Database;
 wrapped.batch=(async(statements:D1PreparedStatement[])=>{await f.db.batch(statements);throw Error('fictional_lost_cancellation_commit_ack');}) as D1Database['batch'];
 state.db=wrapped;
 const response=await f.send();assert.notEqual(response.status,200);
 state.db=f.db;
 assert.equal(f.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(f.orderId)!.status,'delivered');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,0);
 return response;
}

