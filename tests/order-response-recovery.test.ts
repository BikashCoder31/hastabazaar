import assert from 'node:assert/strict';
import test from 'node:test';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {reportPreparationIssue,recordPreparationFollowup} from '../lib/orders/response-cases';
import {handlePreparationCommand} from '../lib/orders/response-http';

void test('opaque preparation recovery reads only the current actor original receipt and source, without resubmitting private content',async()=>{
 const f=await actionableOrderFixture();try{
  const row=f.rows[0],requestId=crypto.randomUUID(),sourceId=String(row.portionId),actor='registered-owner';
  const result=await reportPreparationIssue(f.db,{actorId:actor,requestId,expectedRevision:null,now:f.releasedAt},{portionId:sourceId,itemIds:[String(row.id)],kind:'delay',detail:'PRIVATE preparation report retained only in its original protected case.',proposedReadyAt:null});
  const url=new URL('https://preparation-browser.test/api/seller/order-responses');for(const[k,v]of Object.entries({orderId:f.orderId,action:'report',sourceId,attempt:requestId}))url.searchParams.set(k,v);
  const read=(who=actor,intent=who)=>handlePreparationCommand(new Request(url,{headers:{'X-Hastabazaar-Actor':intent}}),f.db,who,'seller');
  const recovered=await read();assert.equal(recovered.status,200,await recovered.clone().text());const body=await recovered.text();assert.deepEqual(JSON.parse(body),{recorded:true,actorId:actor,action:'report',sourceId,requestId,outcome:{id:result.id}});assert.doesNotMatch(body,/PRIVATE|detail|command_digest|input/);
  assert.equal((await read('foreign',actor)).status,403);assert.equal((await read('foreign')).status,403);
  url.searchParams.set('orderId','another-order');assert.equal((await read()).status,404);url.searchParams.set('orderId',f.orderId);
  const missingAttempt=crypto.randomUUID();url.searchParams.set('attempt',missingAttempt);assert.deepEqual(await(await read()).json(),{recorded:false,actorId:actor,action:'report',sourceId,requestId:missingAttempt,outcome:null});
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_response_cases').get()!.n,1);
  f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(actor);assert.equal((await read()).status,403);
 }finally{f.dispose();}
});

void test('follow-up recovery preserves original committed revision and rechecks a revoked grant after reading its receipt',async()=>{
 const f=await actionableOrderFixture();try{
  const row=f.rows[0],reported=await reportPreparationIssue(f.db,{actorId:'registered-owner',requestId:crypto.randomUUID(),expectedRevision:null,now:f.releasedAt},{portionId:String(row.portionId),itemIds:[String(row.id)],kind:'delay',detail:'PRIVATE actual supplier material delay must remain protected.',proposedReadyAt:null}),attempt=crypto.randomUUID();
  const result=await recordPreparationFollowup(f.db,{actorId:'reviewer',requestId:attempt,expectedRevision:'0',now:f.releasedAt},{caseId:reported.id,ownerId:'reviewer',backupId:null,state:'waiting',nextUpdateAt:f.releasedAt+3600000,privateNote:'PRIVATE independent operator follow-up remains only in native history.',customerMessage:'The supplier material delay is being reviewed before the next factual update.'});
  const url=new URL('https://preparation-browser.test/api/admin/order-responses');for(const[k,v]of Object.entries({orderId:f.orderId,action:'followup',sourceId:reported.id,attempt}))url.searchParams.set(k,v);
  const request=()=>new Request(url,{headers:{'X-Hastabazaar-Actor':'reviewer'}});
  const saved=await handlePreparationCommand(request(),f.db,'reviewer','staff');assert.equal(saved.status,200,await saved.clone().text());assert.deepEqual(await saved.json(),{recorded:true,actorId:'reviewer',action:'followup',sourceId:reported.id,requestId:attempt,outcome:result});
  const original=f.db.prepare.bind(f.db);let revoked=false;
  f.db.prepare=((sql:string)=>{const statement=original(sql);if(sql.includes('command_result_json AS result')){const first:typeof statement.first=statement.first.bind(statement);statement.first=(async(column?:string)=>{const receipt=column===undefined?await first():await first(column);if(!revoked){revoked=true;f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='reviewer'").run();}return receipt;})as typeof statement.first;}return statement;})as typeof f.db.prepare;
  assert.equal((await handlePreparationCommand(request(),f.db,'reviewer','staff')).status,403);
  assert.equal(f.sqlite.prepare('SELECT revision FROM order_response_cases WHERE id=?').get(reported.id)!.revision,1);
 }finally{f.dispose();}
});
