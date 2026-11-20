import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {searchSystemRecords} from '../lib/operations/system-records';
import {requestDocumentChange} from '../lib/sellers/document-review';
import {ensureReviewTask} from '../lib/workflows/review-tasks';

void test('exact delivery references search before the bounded source window',async()=>{
 const f=await completeVersionFixture();try{
  const insertOrderSource=f.sqlite.prepare("INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at) SELECT ?,?,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at FROM orders WHERE id='legacy-order'");
  const insertOrder=f.sqlite.prepare("INSERT INTO order_email_jobs(id,order_id,order_status,status,created_at) VALUES(?,?,'placed','queued',?)");
  const insertBusiness=f.sqlite.prepare("INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,business_event_key,subject_en,subject_ne,body_en,body_ne,status,request_id,created_at) VALUES(?,'reviewer','super_admin','email','business.seller.document.change','business.seller.document.change','Fictional subject','Fictional subject','PRIVATE-FIXTURE-BODY','PRIVATE-FIXTURE-BODY','queued',?,?)");
  for(let i=0;i<102;i++){const createdAt=i===0?f.now:f.now+86400000+i;insertOrderSource.run('history-order-source-'+i,'FIX-HISTORY-'+i);insertOrder.run('history-order-'+i,'history-order-source-'+i,createdAt);insertBusiness.run('history-business-'+i,'history-request-'+i,createdAt);}
  const matches:string[][]=[];
  for(const reference of ['history-order-0','history-business-0']){
   const found=await searchSystemRecords(f.db,'reviewer',{environment:'test',type:'delivery',reference});
   matches.push(found.records.map(row=>row.reference));
   assert.doesNotMatch(JSON.stringify(found),/PRIVATE-FIXTURE-BODY|customer@|subject_en/);
  }
  assert.deepEqual(matches,[['history-order-0'],['history-business-0']]);
  const day=new Date(f.now+345*60000).toISOString().slice(0,10);
  const dated=await searchSystemRecords(f.db,'reviewer',{environment:'test',type:'delivery',from:day,to:day});
  for(const reference of ['history-business-0','history-order-0'])assert.ok(dated.records.some(row=>row.reference===reference));
  assert.ok(dated.records.every(row=>row.createdAt>=Date.parse(day+'T00:00:00+05:45')&&row.createdAt<Date.parse(day+'T00:00:00+05:45')+86400000));
  await assert.rejects(searchSystemRecords(f.db,'customer',{environment:'test',type:'delivery',reference:'history-order-0'}));
 }finally{f.dispose();}
});

void test('exact review reference remains searchable beyond 1000 older source tasks with current authority',async()=>{
 const f=await completeVersionFixture();try{
  const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker'").get()!.id);
  f.sqlite.prepare("UPDATE seller_documents SET status='verified' WHERE id=?").run(documentId);
  const sourceId=await requestDocumentChange(f.db,{sellerId:'maker',documentId,actorId:'maker-user',reason:'Fictional historical reference lookup requirement',now:f.now});
  const id=await ensureReviewTask(f.db,{sourceType:'document_change',sourceId,now:f.now});
  const insert=f.sqlite.prepare("INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at) VALUES(?,'document_change',?,?,1,2,'historical-fixture',1)");
  for(let i=0;i<1001;i++)insert.run('older-review-'+i,sourceId,'historical-revision-'+i);
  const found=await searchSystemRecords(f.db,'reviewer',{environment:'test',type:'review',reference:id});
  assert.deepEqual(found.records.map(row=>row.reference),[id]);
  const day=new Date(f.now+345*60000).toISOString().slice(0,10);
  const dated=await searchSystemRecords(f.db,'reviewer',{environment:'test',type:'review',from:day,to:day});
  assert.ok(dated.records.some(row=>row.reference===id));
  assert.ok(dated.records.every(row=>row.createdAt>=Date.parse(day+'T00:00:00+05:45')&&row.createdAt<Date.parse(day+'T00:00:00+05:45')+86400000));
  f.sqlite.prepare('UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?').run('["system.health.view"]','delegate');
  assert.equal((await searchSystemRecords(f.db,'delegate',{environment:'test',type:'review',reference:id})).records.length,0);
  f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='maker'").run();});
  await assert.rejects(searchSystemRecords(f.db,'reviewer',{environment:'test',type:'review',reference:id}),/guard|CHECK|constraint/i);
 }finally{f.dispose();}
});
