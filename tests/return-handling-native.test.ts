import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb,incentiveOrder,incentiveItem,seedIncentiveCustomer,seedIncentiveInventory} from './helpers/incentive-db';
import {createCustomerReturnRequest,reviewReturnAsAdmin} from '../lib/db/repositories/returns';
import {recordReturnHandling,getReturnHandling} from '../lib/returns/handling';
void test('native D1 competing physical receipt commands keep one quantity and immutable original case clock',async()=>{
 // Inspected target: fresh random nonpersistent Miniflare; all real migrations and guards retained.
 const f=await createIncentiveDb();try{
  await seedIncentiveCustomer(f.db);await seedIncentiveCustomer(f.db,'reviewer');await seedIncentiveInventory(f.db);
  await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)").run();
  await incentiveOrder(f.db,'physical-order').run();await incentiveItem(f.db,'physical-item','physical-order').run();
  await f.db.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id='physical-item'").run();
  const request=await createCustomerReturnRequest(f.db,{orderNumber:'FIX-physical-order',customerId:'customer',receiptTokenHash:null,orderItemId:'physical-item',quantity:1,reason:'defective',requestedResolution:'replacement',detail:'The delivered fictional item is defective and needs the same replacement.',locale:'en-NP',idempotencyKey:'native-return-request',evidence:[],now:Date.now()});
  await reviewReturnAsAdmin(f.db,{returnRequestId:request.id,actorId:'reviewer',actorRole:'super_admin',action:'approve',note:'Checked the original defective item facts and customer replacement request.',publicMessageEn:'The supported replacement is approved; physical steps remain separate.',publicMessageNe:'प्रतिस्थापन स्वीकृत भयो। भौतिक प्रक्रिया बाँकी छ।',responsibility:'seller',outcome:'replacement',requestId:'native-return-approve',now:Date.now()});
  const original=(await getReturnHandling(f.db,request.id))!,input={caseId:request.id,action:'receive' as const,quantity:1,occurredAt:original.now,publicMessage:'The actual returned item has been received for inspection.',privateNote:'Checked the original fictional warehouse receipt and exact item quantity.',evidenceReference:'FICTIONAL-NATIVE-RECEIPT'};
  const results=await Promise.allSettled(['receipt-one','receipt-two'].map(requestId=>recordReturnHandling(f.db,{actorId:'reviewer',requestId,expectedRevision:String(original.revision),now:Date.now()},input)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);const current=(await getReturnHandling(f.db,request.id))!;
  assert.equal(current.receivedQuantity,1);assert.equal(current.inspectedQuantity,0);assert.equal(current.firstReceivedAt,original.firstReceivedAt);assert.equal(current.firstDueAt,original.firstDueAt);
  await assert.rejects(f.db.prepare('UPDATE return_handling SET first_received_at=first_received_at+1,revision=revision+1 WHERE case_id=?').bind(request.id).run());
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM return_handling_events WHERE case_id=?').bind(request.id).first<{n:number}>())!.n,1);
 }finally{await f.dispose();}
});
