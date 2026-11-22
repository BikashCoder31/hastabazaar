import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb,incentiveOrder,incentiveItem,seedIncentiveInventory} from './helpers/incentive-db';
import {processOrderResponseFollowup} from '../lib/orders/response-followup';
import {transitionSellerFulfillment} from '../lib/db/repositories/fulfillment';
import {readPreparationWorkspace} from '../lib/orders/response-workspace';
import {handlePreparationCommand} from '../lib/orders/response-http';
void test('native D1 workers retain one escalation and customer publication; concurrent exact progress recovers once',async()=>{
 // Fresh random nonpersistent D1 only. The real native clock is never replaced.
 const f=await createIncentiveDb();try{
  await f.db.batch([f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('customer','owner@local.hastabazaar.test','Fictional owner','active',1,1),('reviewer','reviewer@local.hastabazaar.test','Fictional reviewer','active',1,1)"),f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('customer','seller',1),('reviewer','super_admin',1)")]);
  await seedIncentiveInventory(f.db);await incentiveOrder(f.db,'native-response').run();await incentiveItem(f.db,'native-item','native-response').run();
  const released=Date.now()-12*3600000-1000;
  await f.db.batch([f.db.prepare("UPDATE orders SET status='confirmed' WHERE id='native-response'"),f.db.prepare("INSERT INTO order_response_portions(id,order_id,seller_id,operator_mode,created_at) VALUES('native-portion','native-response','seller','seller',?)").bind(released),f.db.prepare("INSERT INTO order_response_items(order_item_id,portion_id,released_at) VALUES('native-item','native-portion',?)").bind(released)]);
  await assert.rejects(f.db.prepare("UPDATE order_response_items SET released_at=released_at+1000 WHERE order_item_id='native-item'").run(),/immutable/);
  const results=await Promise.all([processOrderResponseFollowup(f.db),processOrderResponseFollowup(f.db)]);
  assert.equal(results.reduce((sum,r)=>sum+r.escalations,0),1);assert.equal(results.reduce((sum,r)=>sum+r.customerUpdates,0),1);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM order_response_cases').first<{n:number}>())!.n,1);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM notification_messages WHERE audience_role='customer'").first<{n:number}>())!.n,2);
  const workspace=await readPreparationWorkspace(f.db,'reviewer','native-response','staff',{actorAuthSubject:null});assert.ok(workspace);assert.equal(workspace.portions.length,1);assert.equal(workspace.portions[0].cases.length,1);
  const caseId=workspace.portions[0].cases[0].id,attempt=crypto.randomUUID(),body={action:'followup',requestId:attempt,expectedRevision:'0',input:{caseId,ownerId:'reviewer',backupId:null,state:'waiting',nextUpdateAt:Date.now()+3600000,privateNote:'Native current subject and actual case revision are independently guarded.',customerMessage:'The preparation team is reviewing this actual retained source.'}};
  const request=()=>new Request('http://localhost:3018/api/admin/order-responses',{method:'POST',headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify(body)});
  const raced=Object.create(f.db) as D1Database;raced.prepare=f.db.prepare.bind(f.db);let changed=false;
  raced.batch=(async(statements:D1PreparedStatement[])=>{if(!changed){changed=true;await f.db.prepare("UPDATE users SET auth_subject='native-rebound' WHERE id='reviewer'").run();}return f.db.batch(statements);}) as D1Database['batch'];
  await assert.rejects(handlePreparationCommand(request(),raced,'reviewer','staff',{actorAuthSubject:null}),/CHECK|constraint|valid|guard/i);assert.equal(changed,true);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND request_id=?').bind(attempt).first<{n:number}>())!.n,0);
  assert.equal((await f.db.prepare('SELECT revision FROM order_response_cases WHERE id=?').bind(caseId).first<{revision:number}>())!.revision,0);
  await f.db.prepare("UPDATE users SET auth_subject=NULL WHERE id='reviewer'").run();
  const saved=await handlePreparationCommand(request(),f.db,'reviewer','staff',{actorAuthSubject:null});assert.equal(saved.status,200,await saved.clone().text());
  const proof=await saved.json() as {recorded:boolean;actorId:string;sourceId:string;requestId:string;result:{id:string;revision:number}};assert.equal(proof.recorded,true);assert.equal(proof.actorId,'reviewer');assert.equal(proof.sourceId,caseId);assert.equal(proof.requestId,attempt);assert.deepEqual(proof.result,{id:caseId,revision:1});
  const query=new URL('http://localhost:3018/api/admin/order-responses');for(const[k,v]of Object.entries({orderId:'native-response',action:'followup',sourceId:caseId,attempt}))query.searchParams.set(k,v);
  const original=await handlePreparationCommand(new Request(query,{headers:{'X-Hastabazaar-Actor':'reviewer'}}),f.db,'reviewer','staff',{actorAuthSubject:null});assert.equal(original.status,200);assert.deepEqual((await original.json() as {outcome:unknown}).outcome,proof.result);
  const ownerAttempt=crypto.randomUUID(),ownerRace=Object.create(f.db) as D1Database;ownerRace.prepare=f.db.prepare.bind(f.db);let ownerRevoked=false;
  ownerRace.batch=(async(statements:D1PreparedStatement[])=>{if(!ownerRevoked){ownerRevoked=true;await f.db.prepare("DELETE FROM user_roles WHERE user_id='customer' AND role='seller'").run();}return f.db.batch(statements);}) as D1Database['batch'];
  await assert.rejects(handlePreparationCommand(new Request('http://localhost:3018/api/seller/order-responses',{method:'POST',headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':'customer'},body:JSON.stringify({action:'report',requestId:ownerAttempt,expectedRevision:null,input:{portionId:'native-portion',itemIds:['native-item'],kind:'delay',detail:'A last-role revocation must fence the original actual owner report.',proposedReadyAt:null}})}),ownerRace,'customer','seller',{actorAuthSubject:null}),/CHECK|constraint|valid|guard/i);
  assert.equal(ownerRevoked,true);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND request_id=?').bind(ownerAttempt).first<{n:number}>())!.n,0);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM order_response_cases').first<{n:number}>())!.n,1);assert.equal(await readPreparationWorkspace(f.db,'customer','native-response','seller',{actorAuthSubject:null}),null);
  await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('customer','seller',1)").run();
  const command={orderId:'native-response',sellerId:'seller',actorId:'customer',action:'start_packing' as const,note:'Start the actual retained item.',requestId:'native-exact-start',now:Date.now(),itemIds:['native-item']};
  await Promise.all([transitionSellerFulfillment(f.db,command),transitionSellerFulfillment(f.db,command)]);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM order_item_status_events WHERE request_id='native-exact-start'").first<{n:number}>())!.n,1);
  assert.equal((await f.db.prepare("SELECT state FROM order_response_cases").first<{state:string}>())!.state,'resolved');
 }finally{await f.dispose();}
});
