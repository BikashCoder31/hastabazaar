import assert from 'node:assert/strict';
import test from 'node:test';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {processOrderResponseFollowup} from '../lib/orders/response-followup';
import {transitionSellerFulfillment} from '../lib/db/repositories/fulfillment';
import {currentResponseNotice} from '../lib/orders/response-notifications';
void test('two genuinely released seller portions share one current customer update while retaining their own cases and progress',async()=>{
 const f=await commerceOrderFixture(true);try{
  const released=Number(f.sqlite.prepare('SELECT MAX(released_at) t FROM order_response_items').get()!.t),now=released+12*3600000;
  f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));
  const result=await processOrderResponseFollowup(f.database);assert.equal(result.escalations,2);assert.equal(result.customerUpdates,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='order_response'").get()!.n,2);
  const event=f.sqlite.prepare("SELECT id,scope_json FROM order_response_events WHERE kind='customer_update' AND case_id IS NULL").get()!;assert.equal(JSON.parse(String(event.scope_json)).length,2);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE related_id=? AND audience_role='customer'").get(event.id)!.n,2);
  const item=String(f.sqlite.prepare("SELECT id FROM order_items WHERE order_id=? AND seller_id='seller-a'").get(f.orderId)!.id);
  const command={orderId:f.orderId,sellerId:'seller-a',actorId:'user-a',action:'start_packing' as const,note:'Start the actual first seller portion.',requestId:'seller-a-progress',now,itemIds:[item]};
  await Promise.all([transitionSellerFulfillment(f.database,command),transitionSellerFulfillment(f.database,command)]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_item_status_events WHERE request_id=?").get(command.requestId)!.n,1);
  assert.equal(f.sqlite.prepare("SELECT fulfillment_status FROM order_items WHERE seller_id='seller-b'").get()!.fulfillment_status,'confirmed');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_response_cases WHERE state='resolved'").get()!.n,1);
  assert.equal(await currentResponseNotice(f.database,String(event.id)),true);
  await processOrderResponseFollowup(f.database);assert.equal(await currentResponseNotice(f.database,String(event.id)),false);
  assert.equal((await processOrderResponseFollowup(f.database)).customerUpdates,0);
 }finally{await f.dispose();}
});
