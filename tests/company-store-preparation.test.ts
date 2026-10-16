import assert from 'node:assert/strict';
import test from 'node:test';
import * as fulfillment from '../lib/db/repositories/fulfillment';
import { earnedMaker } from './helpers/company-store-financial-fixture';
import type { FormAnswerSnapshot } from '../lib/forms/types';

void test('Super Admin prepares only company-snapshot items with atomic authority, history and exact replay', async () => {
 const prepare = (fulfillment as unknown as {transitionCompanyPreparation?: (db:D1Database,input: {
  orderId:string;sellerId:string;actorId:string;action:'start_packing'|'ready_for_pickup';note:string;requestId:string;now:number;
  form:{requestId:string;versionId:string;answers:FormAnswerSnapshot}
 })=>Promise<void>}).transitionCompanyPreparation;
 assert.equal(typeof prepare,'function','Company-store orders need a supported preparation operation');
 if(!prepare) return;
 const f=await earnedMaker('calculated');
 try {
  f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
   VALUES('prepare-v1','staff.order-fulfillment',1,'published',?,'SIMULATED','reviewer',1,'reviewer',1,'reviewer',1,'qa-publish')`)
   .run(JSON.stringify({formId:'staff.order-fulfillment',fields:[]}));
  const input={orderId:f.orderId,sellerId:f.sellerId,actorId:'reviewer',action:'start_packing' as const,
   note:'SIMULATED company-store packing',requestId:'qa-company-pack',now:f.now+8,
   form:{requestId:'qa-company-pack',versionId:'prepare-v1',answers:{formId:'staff.order-fulfillment' as const,version:1,answers:[]}}};
  const state=()=>JSON.stringify({orders:f.sqlite.prepare('SELECT * FROM orders').all(),orderEvents:f.sqlite.prepare('SELECT * FROM order_status_events').all(),
   notifications:(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%notification%' ORDER BY name").all() as {name:string}[])
    .map(({name})=>[name,f.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]),items:f.sqlite.prepare('SELECT * FROM order_items').all(),
   events:f.sqlite.prepare('SELECT * FROM order_item_status_events').all(),answers:f.sqlite.prepare('SELECT * FROM form_answer_sets').all(),
   audits:f.sqlite.prepare('SELECT * FROM audit_logs').all()});
  for(const change of [
   "UPDATE user_roles SET role='admin' WHERE user_id='reviewer'",
   "UPDATE users SET status='disabled' WHERE id='reviewer'",
  ]) {
   f.sqlite.exec('SAVEPOINT denied');f.sqlite.exec(change);const before=state();
   await assert.rejects(prepare(f.db,input),/staff|permission|Super Admin/i);assert.equal(state(),before);
   f.sqlite.exec('ROLLBACK TO denied; RELEASE denied');
  }
  await assert.rejects(prepare(f.db,{...input,sellerId:'unrelated'}),/company|items/i);
  // A registered/unsnapshotted line in the same seller group must never be prepared by the company action.
  const columns=(f.sqlite.prepare('PRAGMA table_info(order_items)').all() as {name:string}[]).map(row=>row.name);
  f.sqlite.exec(`INSERT INTO order_items(${columns.map(name=>`"${name}"`).join(',')}) SELECT ${columns.map(name=>name==='id'?"'unsnapshotted-line'":`"${name}"`).join(',')} FROM order_items LIMIT 1`);
  const mixed=state();await assert.rejects(prepare(f.db,input),/company|items/i);assert.equal(state(),mixed);
  f.sqlite.exec("DELETE FROM order_items WHERE id='unsnapshotted-line'"); // isolated fixture only
  const before=state();
  f.setBeforeBatch(()=>{f.sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='reviewer'");});
  await assert.rejects(prepare(f.db,input));assert.equal(state(),before,'Revoked authority must roll back statuses, answers and audit');
  f.sqlite.exec("UPDATE user_roles SET role='super_admin' WHERE user_id='reviewer'");
  for(const sql of [
   "INSERT INTO seller_restrictions(seller_id,mode,obligation_mode,reason_code,private_reason,applied_by,applied_at,updated_at) VALUES('maker','disabled','admin_review','qa','SIMULATED','reviewer',1,1)",
  ]) {
   f.setBeforeBatch(()=>{f.sqlite.exec(sql);});await assert.rejects(prepare(f.db,input));assert.equal(state(),before);
   // These are disposable race fixtures, never active saved records.
   f.sqlite.exec("DELETE FROM seller_restrictions");
  }
  f.setBeforeBatch(()=>{f.sqlite.exec(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    SELECT 'prepare-v2',form_id,2,'published',config_json,reason,created_by,2,updated_by,2,published_by,2,'qa-publish-v2'
    FROM form_config_versions WHERE id='prepare-v1'`);});
  await assert.rejects(prepare(f.db,input));assert.equal(state(),before,'Changed form publication must roll back preparation');
  input.form.versionId='prepare-v2';input.form.answers.version=2;
  // Earlier company orders retain their company preparation route after a later PAN transition.
  f.sqlite.exec("UPDATE seller_participation_profiles SET participation_route='registered_seller' WHERE seller_id='maker'");
  const clone=(table:string,overrides:Record<string,string>)=>{
   const names=(f.sqlite.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).map(r=>r.name);
   f.sqlite.prepare(`INSERT INTO ${table}(${names.map(n=>`"${n}"`).join(',')}) SELECT ${names.map(n=>n in overrides?'?':`"${n}"`).join(',')} FROM ${table} LIMIT 1`)
    .run(...names.filter(n=>n in overrides).map(n=>overrides[n]));
  };
  clone('users',{id:'registered-owner',email:'registered@local.hastabazaar.test',auth_subject:'registered-subject',phone:'9800000099'});
  f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','seller',1)");
  clone('seller_profiles',{id:'registered-seller',user_id:'registered-owner',application_reference:'QA-REGISTERED',tax_registration_number:'990000099',status:'approved'});
  clone('products',{id:'registered-product',seller_id:'registered-seller',slug:'registered-cup',sku:'QA-REGISTERED-CUP'});
  clone('order_items',{id:'registered-item',seller_id:'registered-seller',product_id:'registered-product',sku_snapshot:'QA-REGISTERED-CUP'});
  await assert.rejects(prepare(f.db,{...input,sellerId:'registered-seller'}),/company|items/i);
  await prepare(f.db,input);assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items').get()?.fulfillment_status,'packing');
  const packed=state();await prepare(f.db,input);assert.equal(state(),packed,'Exact retries cannot duplicate history');
  await assert.rejects(prepare(f.db,{...input,note:'Changed request contents'}),/reference|content/i);
  await prepare(f.db,{...input,action:'ready_for_pickup',requestId:'qa-company-ready',form:{...input.form,requestId:'qa-company-ready'}});
  assert.equal(f.sqlite.prepare("SELECT fulfillment_status FROM order_items WHERE seller_id='maker'").get()?.fulfillment_status,'ready_for_pickup');
  assert.equal(f.sqlite.prepare("SELECT fulfillment_status FROM order_items WHERE id='registered-item'").get()?.fulfillment_status,'confirmed');
  assert.equal(f.sqlite.prepare('SELECT status FROM orders').get()?.status,'packing','Other sellers must not be marked ready');
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM form_answer_sets WHERE form_id='staff.order-fulfillment'").get()?.n,2);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM audit_logs WHERE action LIKE 'order.company.%'").get()?.n,2);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM user_roles WHERE user_id='maker-user' AND role='seller'").get()?.n,0);
 } finally {f.dispose();}
});

void test('a valid first-COD hold introduced at commit rolls back company preparation',async()=>{
 const f=await earnedMaker('calculated');
 try{
  f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
   VALUES('cod-prepare-v1','staff.order-fulfillment',1,'published',?,'SIMULATED','reviewer',1,'reviewer',1,'reviewer',1,'cod-publish')`)
   .run(JSON.stringify({formId:'staff.order-fulfillment',fields:[]}));
  const tables=['orders','order_items','order_status_events','order_item_status_events','form_answer_sets','audit_logs',
   ...(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%notification%' ORDER BY name").all() as {name:string}[]).map(r=>r.name)];
  const state=()=>JSON.stringify(tables.map(name=>[name,f.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
  const before=state();let inserted=false;
  f.setBeforeBatch(()=>{f.sqlite.prepare("INSERT INTO first_cod_reviews(order_id,customer_id,total_paisa,status,created_at) VALUES(?,'buyer',500000,'pending',1)").run(f.orderId);inserted=true;});
  await assert.rejects(fulfillment.transitionCompanyPreparation(f.db,{orderId:f.orderId,sellerId:f.sellerId,actorId:'reviewer',action:'start_packing',
   note:'SIMULATED COD commit guard',requestId:'cod-race-packing',now:f.now+8,form:{requestId:'cod-race-packing',versionId:'cod-prepare-v1',
    answers:{formId:'staff.order-fulfillment',version:1,answers:[]}}}),/Company items, form or staff authority changed/);
  assert.equal(inserted,true,'The valid race fixture must reach the operation batch');assert.equal(state(),before);
 }finally{f.dispose();}
});
