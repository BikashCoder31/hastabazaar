import assert from 'node:assert/strict';
import test from 'node:test';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {prepareOrderResponseRelease} from '../lib/orders/response-workflow';
import {prepareInitialResponseNotices,currentResponseNotice} from '../lib/orders/response-notifications';
import {processOrderResponseFollowup} from '../lib/orders/response-followup';
void test('a later first release of held items has its own notice and never resets older released items',async()=>{
 let heldItem='';
 const f=await actionableOrderFixture({secondOffer:true,beforeRelease(base){
  const rows=base.sqlite.prepare('SELECT id FROM order_items WHERE order_id=? ORDER BY id').all(base.orderId);heldItem=String(rows[1].id);
  base.sqlite.prepare("INSERT INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at) VALUES('pre-release-hold',?,'identity','fictional-evidence-review','fictional-review','reviewer','reviewer',1,1,?,?)").run(heldItem,Date.now(),Date.now()+86400000);
 }});try{
  assert.equal(f.rows.length,1);const firstEvent=f.sqlite.prepare("SELECT id,scope_json FROM order_response_events WHERE kind='released'").get()!;assert.deepEqual(JSON.parse(String(firstEvent.scope_json)),[String(f.rows[0].id)]);
  f.setClock(f.releasedAt+5*3600000);
  await f.db.batch([f.db.prepare("UPDATE order_fulfillment_holds SET ended_at=?,ended_by='reviewer',release_reason='The exact fictional identity check is complete.' WHERE id='pre-release-hold'").bind(f.releasedAt+5*3600000),...prepareOrderResponseRelease(f.db,f.orderId),...await prepareInitialResponseNotices(f.db,f.orderId)]);
  assert.equal(f.sqlite.prepare('SELECT released_at FROM order_response_items WHERE order_item_id=?').get(f.rows[0].id)!.released_at,f.releasedAt);
  assert.equal(f.sqlite.prepare('SELECT released_at FROM order_response_items WHERE order_item_id=?').get(heldItem)!.released_at,f.releasedAt+5*3600000);
  await f.db.batch(await prepareInitialResponseNotices(f.db,f.orderId));assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_response_events WHERE kind='released'").get()!.n,2);
  f.setClock(f.releasedAt+6*3600000);assert.equal((await processOrderResponseFollowup(f.db)).reminders,1);
  assert.deepEqual(JSON.parse(String(f.sqlite.prepare("SELECT scope_json FROM order_response_events WHERE kind='reminder'").get()!.scope_json)),[String(f.rows[0].id)]);
  assert.equal(await currentResponseNotice(f.db,String(firstEvent.id)),false);
 }finally{f.dispose();}
});
