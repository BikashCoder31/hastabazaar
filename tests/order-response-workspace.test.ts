import assert from 'node:assert/strict';
import test from 'node:test';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {readPreparationWorkspace} from '../lib/orders/response-workspace';
import {handlePreparationCommand} from '../lib/orders/response-http';
import {processOrderResponseFollowup} from '../lib/orders/response-followup';
const hour=3600000;
void test('HTTP preparation reports recover exactly and private detail never enters customer or seller projections',async()=>{
 const f=await actionableOrderFixture();try{
  const body={action:'report',requestId:'workspace-report',expectedRevision:null,input:{portionId:String(f.rows[0].portionId),itemIds:[String(f.rows[0].id)],kind:'delay',detail:'PRIVATE-SUPPLIER-DETAIL: checking the actual material issue.',proposedReadyAt:f.releasedAt+hour}};
  const request=(origin='http://localhost:3018')=>new Request('http://localhost:3018/api/seller/order-responses',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await handlePreparationCommand(request('https://foreign.invalid'),f.db,'registered-owner','seller')).status,403);
  assert.equal((await handlePreparationCommand(request(),f.db,'foreign','seller')).status,403);
  const first=await handlePreparationCommand(request(),f.db,'registered-owner','seller');assert.equal(first.status,200);assert.deepEqual(await (await handlePreparationCommand(request(),f.db,'registered-owner','seller')).json(),await first.json());
  const customer=await readPreparationWorkspace(f.db,'customer',f.orderId,'customer'),seller=await readPreparationWorkspace(f.db,'registered-owner',f.orderId,'seller'),staff=await readPreparationWorkspace(f.db,'reviewer',f.orderId,'staff');
  assert.ok(customer);assert.ok(seller);assert.ok(staff);assert.doesNotMatch(JSON.stringify(customer),/PRIVATE-SUPPLIER-DETAIL/);assert.doesNotMatch(JSON.stringify(seller),/PRIVATE-SUPPLIER-DETAIL/);assert.match(JSON.stringify(staff),/PRIVATE-SUPPLIER-DETAIL/);assert.equal(customer.portions[0].cases[0].proposedReadyAt,null);assert.equal(await readPreparationWorkspace(f.db,'registered-owner',f.orderId,'customer'),null);
 }finally{f.dispose();}
});
void test('a worker interruption after escalation cannot lose the customer update',async()=>{
 const f=await actionableOrderFixture();try{
  f.setClock(f.releasedAt+12*hour);let interrupted=false;
  const db=new Proxy(f.db,{get(target,key){if(key==='prepare')return (sql:string)=>{if(!interrupted&&sql.includes("'customer_update'")){interrupted=true;throw new Error('FICTIONAL interruption before customer publication');}return target.prepare(sql);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await assert.rejects(processOrderResponseFollowup(db),/FICTIONAL interruption/);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_response_events WHERE kind='escalation'").get()!.n,1);
  const recovered=await processOrderResponseFollowup(f.db);assert.equal(recovered.customerUpdates,1);assert.equal((await processOrderResponseFollowup(f.db)).customerUpdates,0);
 }finally{f.dispose();}
});
