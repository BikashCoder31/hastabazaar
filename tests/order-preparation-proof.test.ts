import assert from 'node:assert/strict';
import test from 'node:test';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {handlePreparationCommand} from '../lib/orders/response-http';
import {reportPreparationIssue} from '../lib/orders/response-cases';
import {readPreparationWorkspace} from '../lib/orders/response-workspace';
import {incentiveReportDatabase} from './helpers/incentive-report-database';

void test('preparation save and original reader bind exact actor, action, source and request metadata',async()=>{
 const f=await actionableOrderFixture();try{
  const row=f.rows[0],sourceId=String(row.portionId),requestId=crypto.randomUUID(),actor='registered-owner',action='report';
  const body={action,requestId,expectedRevision:null,input:{portionId:sourceId,itemIds:[String(row.id)],kind:'delay',detail:'Exact fictional preparation problem needs an independent staff follow-up.',proposedReadyAt:null}};
  const url='http://localhost:3018/api/seller/order-responses';
  const response=await handlePreparationCommand(new Request(url,{method:'POST',headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)}),f.db,actor,'seller');
  assert.equal(response.status,200,await response.clone().text());const saved=await response.json() as Record<string,unknown>;
  assert.equal(saved.recorded,true);for(const[k,v]of Object.entries({actorId:actor,action,sourceId,requestId}))assert.equal(saved[k],v);
  const query=new URL(url);for(const[k,v]of Object.entries({orderId:f.orderId,action,sourceId,attempt:requestId}))query.searchParams.set(k,v);
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const recovered=await handlePreparationCommand(new Request(query,{headers:{'X-Hastabazaar-Actor':actor}}),f.db,actor,'seller'),original=await recovered.json() as Record<string,unknown>;
  assert.equal(recovered.status,200);assert.equal(original.recorded,true);for(const[k,v]of Object.entries({actorId:actor,action,sourceId,requestId}))assert.equal(original[k],v);
  assert.deepEqual(original.outcome,saved.result);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 }finally{f.dispose();}
});

void test('preparation private workspace conceals revoked staff authority during history projection',async()=>{
 const f=await actionableOrderFixture();try{
  const row=f.rows[0];await reportPreparationIssue(f.db,{actorId:'registered-owner',requestId:crypto.randomUUID(),expectedRevision:null,now:f.releasedAt},{portionId:String(row.portionId),itemIds:[String(row.id)],kind:'delay',detail:'PRIVATE source detail belongs only to currently authorized staff.',proposedReadyAt:null});
  const wrapped=Object.create(f.db) as D1Database;let revoked=false;
  wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('SELECT e.id,e.kind,e.note')){const all=statement.all.bind(statement);statement.all=(async()=>{const rows=await all();if(!revoked){revoked=true;f.sqlite.exec("UPDATE users SET status='suspended' WHERE id='reviewer'");}return rows;}) as D1PreparedStatement['all'];}return statement;}) as D1Database['prepare'];
  let workspace;try{workspace=await readPreparationWorkspace(wrapped,'reviewer',f.orderId,'staff');}catch(error){assert.equal((error as {status?:number}).status,403);}
  assert.equal(revoked,true);assert.equal(workspace==null,true,'A private projection must not survive current staff revocation.');
 }finally{f.dispose();}
});

for(const failure of ['validation','target'] as const)void test(`first preparation ${failure} rejection proves no batch without revoking the caller`,async()=>{
 const f=await actionableOrderFixture();try{
  const row=f.rows[0],reported=await reportPreparationIssue(f.db,{actorId:'registered-owner',requestId:crypto.randomUUID(),expectedRevision:null,now:f.releasedAt},{portionId:String(row.portionId),itemIds:[String(row.id)],kind:'delay',detail:'A fictional supplier issue needs a current eligible accountable owner.',proposedReadyAt:null});
  const requestId=crypto.randomUUID(),body={action:'followup',requestId,expectedRevision:'0',input:{caseId:reported.id,ownerId:'reviewer',backupId:null,state:'waiting',nextUpdateAt:null as number|null,privateNote:'Retain this private note while correcting a first definite rejection.',customerMessage:'The actual preparation team is reviewing this supplier issue.'}};
  const request=(value:unknown)=>new Request('http://localhost:3018/api/admin/order-responses',{method:'POST',headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify(value)});
  let invoked=false;f.setBeforeBatch(()=>{invoked=true;});
  const invalid=await handlePreparationCommand(request(failure==='validation'?body:{...body,input:{...body.input,ownerId:'customer',nextUpdateAt:f.releasedAt+3600000}}),f.db,'reviewer','staff'),result=await invalid.json() as Record<string,unknown>;
  assert.equal(invalid.status,failure==='validation'?400:409,'An invalid target is a source correction, not revocation of the authorized viewer.');assert.equal(result.phase,'before_write');assert.equal(invoked,false);
  for(const[k,v]of Object.entries({actorId:'reviewer',action:'followup',sourceId:reported.id,requestId}))assert.equal(result[k],v);
  assert.ok(await readPreparationWorkspace(f.db,'reviewer',f.orderId,'staff'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND request_id=?').get(requestId)!.n,0);
 }finally{f.dispose();}
});

void test('guest preparation eligibility keeps an actual eligible reviewer while excluding a known personal customer',async()=>{
 const f=await incentiveReportDatabase();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('reviewer','reviewer','reviewer@local.hastabazaar.test','Fictional reviewer','active',1,1);
   INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1);
   INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
   VALUES('guest-preparation','FIX-GUEST',NULL,'guest@local.hastabazaar.test','9800000000','placed','en-NP','retained-fixture','{}',1500,0,1500,'cod','unpaid',1,1),
   ('personal-preparation','FIX-PERSONAL','reviewer','reviewer@local.hastabazaar.test','9800000000','placed','en-NP','retained-fixture','{}',1500,0,1500,'cod','unpaid',1,1);`);
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const guest=await readPreparationWorkspace(f.db,'reviewer','guest-preparation','staff');assert.ok(guest);assert.deepEqual(guest.reviewers.map(r=>r.id),['reviewer']);
  const personal=await readPreparationWorkspace(f.db,'reviewer','personal-preparation','staff');assert.ok(personal);assert.equal(personal.reviewers.some(r=>r.id==='reviewer'),false);
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);assert.equal(guest.portions.length,0,'Unpaid guest data does not release or invent preparation work.');
 }finally{f.sqlite.close();}
});

for(const audience of ['seller','customer'] as const)void test(`preparation ${audience} projection conceals a last-role revocation during its source read`,async()=>{
 const f=await actionableOrderFixture();try{
  const row=f.rows[0];await reportPreparationIssue(f.db,{actorId:'registered-owner',requestId:crypto.randomUUID(),expectedRevision:null,now:f.releasedAt},{portionId:String(row.portionId),itemIds:[String(row.id)],kind:'delay',detail:'A fictional source case tests the actual current owner portal boundary.',proposedReadyAt:null});
  const actor=audience==='seller'?'registered-owner':'customer',wrapped=Object.create(f.db) as D1Database;let revoked=false;
  wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('scope_json AS scopeJson,public_message AS publicMessage')){const all=statement.all.bind(statement);statement.all=(async()=>{const rows=await all();if(!revoked){revoked=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id=? AND role IN('customer','seller')").run(actor);}return rows;}) as D1PreparedStatement['all'];}return statement;}) as D1Database['prepare'];
  const result=await readPreparationWorkspace(wrapped,actor,f.orderId,audience);assert.equal(revoked,true);assert.equal(result,null,'Owned-source identity does not recreate a revoked portal role.');
 }finally{f.dispose();}
});

void test('preparation action affordance follows the same independent actor and company scope as its native command',async()=>{
 const f=await actionableOrderFixture();try{
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
  const own=await readPreparationWorkspace(f.db,'registered-owner',f.orderId,'staff'),independent=await readPreparationWorkspace(f.db,'reviewer',f.orderId,'staff');assert.ok(own);assert.ok(independent);
  const ownPortion=own.portions[0],independentPortion=independent.portions[0];
  assert.equal('canAct'in ownPortion?ownPortion.canAct:undefined,false,'Staff oversight is not permission to act on a personally owned supplier portion.');
  assert.equal('canAct'in independentPortion?independentPortion.canAct:undefined,true);
 }finally{f.dispose();}
});
