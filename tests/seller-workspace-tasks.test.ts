import assert from 'node:assert/strict';
import test from 'node:test';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {ensureReviewTask} from '../lib/workflows/review-tasks';
import {createCustomerComplaint,respondToComplaintAsSeller} from '../lib/db/repositories/complaints';

async function api(){const path='../lib/seller/workspace-tasks';return import(path);}
void test('seller Home and Requests use the actual urgent case, precise link and current waiting party without private facts',async()=>{
 const f=await commerceOrderFixture();try{
  const item=String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id),now=Date.now();
  const complaint=await createCustomerComplaint(f.database,{...f.access,receiptTokenHash:null,orderItemId:item,category:'safety',subject:'Actual item safety clarification',detail:'The original fictional item needs an actual safe-use investigation.',locale:'en-NP',requestId:'seller-task-case',now});
  const read=(await api()).readSellerWorkspaceTasks;
  let view=await read(f.database,'user-a',{now,limit:20});assert.deepEqual(view.unavailableFamilies,[]);
  const task=view.tasks.find((t:{sourceId:string})=>t.sourceId===complaint.id);assert.ok(task);assert.equal(task.family,'complaint');assert.equal(task.sellerActionRequired,true);assert.equal(task.href,'/seller/cases/complaints/'+complaint.id);
  assert.equal(view.tasks[0].sourceId,complaint.id);assert.doesNotMatch(JSON.stringify(view),/buyer@example|privateNote|internal_note|receipt_token|bank_account/);
  await respondToComplaintAsSeller(f.database,{complaintId:complaint.id,sellerId:'seller-a',actorId:'user-a',response:'The actual supplied facts are recorded; please review the independent outcome.',requestId:'seller-task-response',now:now+1});
  view=await read(f.database,'user-a',{now:now+2,limit:20});const updated=view.tasks.find((t:{sourceId:string})=>t.sourceId===complaint.id);assert.ok(updated);assert.equal(updated.sellerActionRequired,false);assert.equal(updated.nextActor,'Hastabazaar');assert.equal(updated.key,task.key);
  assert.equal((await read(f.database,'user-b',{now,limit:20})).tasks.some((t:{sourceId:string})=>t.sourceId===complaint.id),false);
 }finally{await f.dispose();}
});
void test('all-record continuation retains one native identity per row without resetting or losing history',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  for(let i=0;i<3;i++)f.sqlite.prepare("INSERT INTO payout_requests(id,seller_id,status,seller_note,available_amount_snapshot_paisa,created_request_id,created_at,updated_at) VALUES(?,'registered','rejected','Fictional historical request',1000,?,?,?)").run('history-'+i,'history-request-'+i,2+i,2+i);
  const read=(await api()).readSellerWorkspaceTasks,keys:string[]=[];let cursor:string|undefined;
  do{const page=await read(f.db,'registered-owner',{limit:1,view:'all',cursor});assert.deepEqual(page.unavailableFamilies,[]);keys.push(...page.tasks.map((task:{key:string})=>task.key));cursor=page.nextCursor??undefined;}while(cursor);
  assert.deepEqual(keys.filter(key=>key.startsWith('payout:')).sort(),['payout:history-0','payout:history-1','payout:history-2','payout:legacy-payout']);assert.equal(new Set(keys).size,keys.length);
 }finally{f.dispose();}
});
void test('released unanswered own item scope uses the actual original clock without inventing a new deadline',async()=>{
 const f=await actionableOrderFixture();try{
  f.setClock(f.releasedAt+13*3600000);const read=(await api()).readSellerWorkspaceTasks,view=await read(f.db,'registered-owner',{now:f.releasedAt+13*3600000});assert.deepEqual(view.unavailableFamilies,[]);
  const task=view.tasks.find((row:{family:string})=>row.family==='order');assert.ok(task);assert.equal(task.severity,'urgent');assert.equal(task.sellerActionRequired,true);assert.equal(task.startedAt,f.releasedAt);assert.equal(task.dueAt,null);assert.equal(task.href,'/seller/orders/'+f.orderId);
 }finally{f.dispose();}
});
void test('request continuation is current-owner scoped and family failure cannot masquerade as an empty queue',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  const read=(await api()).readSellerWorkspaceTasks;
  const page=await read(f.db,'registered-owner',{limit:1,view:'all'});assert.ok(page.tasks.length);assert.equal(page.tasks[0].family,'payout');assert.equal(page.tasks[0].sellerActionRequired,false);assert.notEqual(page.tasks[0].status,'paid');
  const broken=Object.create(f.db)as D1Database;broken.prepare=(sql:string)=>{if(sql.includes('FROM payout_requests'))throw new Error('Fictional financial projection outage');return f.db.prepare(sql);};
  assert.ok((await read(broken,'registered-owner')).unavailableFamilies.includes('payout'));
  f.sqlite.prepare("UPDATE seller_profiles SET user_id='foreign' WHERE id='registered'").run();assert.equal((await read(f.db,'registered-owner',{view:'all'})).tasks.length,0);
 }finally{f.dispose();}
});
void test('final projection rejects role or source ownership changes while private work is loading',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  const read=(await api()).readSellerWorkspaceTasks,wrapped=Object.create(f.db)as D1Database;let changed=false;
  wrapped.prepare=(sql:string)=>{if(!changed&&sql.includes('identity_source')){changed=true;f.sqlite.prepare("UPDATE seller_profiles SET user_id='foreign' WHERE id='registered'").run();}return f.db.prepare(sql);};
  await assert.rejects(read(wrapped,'registered-owner',{view:'all'}),/changed|access/i);assert.equal(changed,true);
 }finally{f.dispose();}
});
void test('a product correction never turns the original staff triage target into a seller deadline',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('task-category','task-category','Fictional',1,1,1,1);INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES('correction-product','registered','task-category','correction-product','TASK-CORRECTION','Fictional correction','Fictional',10000,1,'Maker','NP','Clay','needs_changes',1,1);INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) VALUES('correction-submitted','registered-owner','product.submitted','product','correction-product','Original fictional submission','correction-submitted',1)");
  await ensureReviewTask(f.db,{sourceType:'product_review',sourceId:'correction-product',now:f.now});
  const task=(await(await api()).readSellerWorkspaceTasks(f.db,'registered-owner',{now:f.now})).tasks.find((row:{reference:string})=>row.reference==='correction-product');assert.ok(task);assert.equal(task.sellerActionRequired,true);assert.equal(task.dueAt,null);assert.equal(task.severity,'normal');
  const wrapped=Object.create(f.db)as D1Database;let changed=false;wrapped.prepare=(sql:string)=>{if(!changed&&sql.includes('identity_source')){changed=true;f.sqlite.prepare("UPDATE products SET status='under_review' WHERE id='correction-product'").run();}return f.db.prepare(sql);};
  await assert.rejects((await api()).readSellerWorkspaceTasks(wrapped,'registered-owner',{now:f.now}),/changed/i);assert.equal(changed,true);
 }finally{f.dispose();}
});
void test('a mixed-order cancellation request never appears in an unaffected sellers request list',async()=>{
 const f=await commerceOrderFixture(true);try{
  f.sqlite.prepare("INSERT INTO order_cancellation_reviews(id,order_id,seller_ids_json,note,requested_by,created_at) VALUES('only-seller-a',?,'[\"seller-a\"]','Fictional exact seller portion','checkout-buyer',?)").run(f.orderId,Date.now());
  const read=(await api()).readSellerWorkspaceTasks;assert.equal((await read(f.database,'user-a')).tasks.some((row:{sourceId:string})=>row.sourceId==='only-seller-a'),true);assert.equal((await read(f.database,'user-b')).tasks.some((row:{sourceId:string})=>row.sourceId==='only-seller-a'),false);
 }finally{await f.dispose();}
});
