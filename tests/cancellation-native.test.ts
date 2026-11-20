import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb,incentiveOrder,incentiveItem,seedIncentiveCustomer,seedIncentiveInventory} from './helpers/incentive-db';
void test('native D1 cancellation acceptance and handoff cannot both claim custody',async()=>{
 // Random, nonpersistent native D1. No canonical or external database target.
 const f=await createIncentiveDb();try{
  await seedIncentiveCustomer(f.db);await seedIncentiveInventory(f.db);
  await incentiveOrder(f.db,'cancel-race').run();await incentiveItem(f.db,'cancel-item','cancel-race').run();
  await f.db.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE id='cancel-item'").run();
  const accepted=f.db.batch([f.db.prepare("UPDATE orders SET updated_at=updated_at WHERE id='cancel-race'"),f.db.prepare("INSERT INTO order_cancellation_reviews(id,order_id,seller_ids_json,note,requested_by,created_at) VALUES('native-cancel','cancel-race','[\"seller\"]','Stop the original portion before pickup.','customer',?)").bind(Date.now())]);
  const dispatched=f.db.batch([f.db.prepare("UPDATE orders SET updated_at=updated_at WHERE id='cancel-race'"),f.db.prepare("UPDATE order_items SET fulfillment_status='dispatched' WHERE id='cancel-item'")]);
  const results=await Promise.allSettled([accepted,dispatched]);assert.equal(results[0].status,'fulfilled');
  const row=await f.db.prepare("SELECT fulfillment_status AS state,(SELECT COUNT(*) FROM order_fulfillment_holds WHERE order_item_id='cancel-item' AND ended_at IS NULL) AS holds FROM order_items WHERE id='cancel-item'").first<{state:string;holds:number}>();
  assert.ok(row);assert.ok(row.state==='dispatched'&&row.holds===0||row.state==='ready_for_pickup'&&row.holds===1);
  if(row.holds)await assert.rejects(f.db.prepare("UPDATE order_items SET fulfillment_status='packing' WHERE id='cancel-item'").run());
  assert.equal((await f.db.prepare("SELECT first_due_at-created_at AS elapsed FROM order_cancellation_reviews WHERE id='native-cancel'").first<{elapsed:number}>())!.elapsed,7200000);
 }finally{await f.dispose();}
});
