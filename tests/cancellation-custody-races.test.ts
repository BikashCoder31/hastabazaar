import assert from 'node:assert/strict';
import test from 'node:test';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {cancellationPreview,cancelSelectedParcels,rejectCancellationReview,cancellationOutcome} from '../lib/cancellation/repository';
import {transitionSellerFulfillment} from '../lib/db/repositories/fulfillment';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {listReviewTasks} from '../lib/workflows/review-tasks';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';

void test('cancellation notices stay in the affected seller scope and obsolete request notices disappear',async()=>{
 const f=await commerceOrderFixture(true);try{
  f.sqlite.exec("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE seller_id='seller-a'");
  const p=await cancellationPreview(f.database,f.access,['seller-a']);
  await cancelSelectedParcels(f.database,f.access,{sellerIds:['seller-a'],fingerprint:p.fingerprint,requestId:'scoped-notice',note:'Review only this selected seller portion before handoff.',now:Date.now()});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.cancellation.updated' AND recipient_user_id='user-b'").get()!.n,0);
  const notice=f.sqlite.prepare("SELECT template_key template,related_id relatedId,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE template_key='business.cancellation.updated' AND audience_role='customer' AND channel='in_app'").get() as unknown as Parameters<typeof isCurrentOperationalNotice>[1];
  assert.equal(await isCurrentOperationalNotice(f.database,notice),true);
  await rejectCancellationReview(f.database,{id:'scoped-notice',actorId:'owner',note:'Customer withdrew this request after receiving the retained facts.',now:Date.now()});
  assert.equal(await isCurrentOperationalNotice(f.database,notice),false);
 }finally{await f.dispose();}
});

void test('accepted cancellation has one actionable shared task with its original two-hour deadline',async()=>{
 const f=await commerceOrderFixture();try{
  f.sqlite.exec("UPDATE order_items SET fulfillment_status='ready_for_pickup'");
  const p=await cancellationPreview(f.database,f.access,['seller-a']);
  await cancelSelectedParcels(f.database,f.access,{sellerIds:['seller-a'],fingerprint:p.fingerprint,requestId:'shared-cancel',note:'Hold the exact original items pending cancellation review.',now:Date.now()});
  const row=f.sqlite.prepare("SELECT created_at,first_due_at FROM order_cancellation_reviews WHERE id='shared-cancel'").get()!;
  assert.equal(Number(row.first_due_at)-Number(row.created_at),7200000);
  const tasks=await listReviewTasks(f.database,'owner');assert.equal(tasks.filter(t=>t.sourceType==='cancellation_review'&&t.sourceId==='shared-cancel').length,1);
 }finally{await f.dispose();}
});
void test('a personally interested staff seller cannot reject their customer cancellation concern',async()=>{
 const f=await commerceOrderFixture();try{
  f.sqlite.exec("UPDATE order_items SET fulfillment_status='ready_for_pickup'; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('user-a','super_admin',1)");
  const p=await cancellationPreview(f.database,f.access,['seller-a']);
  await cancelSelectedParcels(f.database,f.access,{sellerIds:['seller-a'],fingerprint:p.fingerprint,requestId:'conflicted-cancel',note:'Please review the requested cancellation without personal conflicts.',now:Date.now()});
  await assert.rejects(rejectCancellationReview(f.database,{id:'conflicted-cancel',actorId:'user-a',note:'Attempt to reject my own seller cancellation concern.',now:Date.now()}));
  assert.equal(f.sqlite.prepare("SELECT status FROM order_cancellation_reviews WHERE id='conflicted-cancel'").get()!.status,'pending');
 }finally{await f.dispose();}
});
void test('handoff after preview retains the concern without claiming dispatch was stopped',async()=>{
 const f=await commerceOrderFixture();try{
  await f.operate('assign',{method:'courier',courierName:'Fictional courier',trackingCode:'FICTIONAL-CANCEL'});
  f.sqlite.exec("UPDATE order_items SET fulfillment_status='ready_for_pickup'");
  const p=await cancellationPreview(f.database,f.access,['seller-a']);await f.operate('dispatch');
  const result=await cancelSelectedParcels(f.database,f.access,{sellerIds:['seller-a'],fingerprint:p.fingerprint,requestId:'late-cancel-concern',note:'Customer requested cancellation while actual pickup was occurring.',now:Date.now()});
  assert.equal(result.status,'review_requested');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_fulfillment_holds WHERE ended_at IS NULL').get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items').get()!.fulfillment_status,'dispatched');
 }finally{await f.dispose();}
});
void test('approved full prepaid cancellation preserves verified cash and creates a refund-review obligation',async()=>{
 const f=await actionableOrderFixture();try{
  const access={orderNumber:f.order.orderNumber,customerId:'customer'},sellerIds=[String(f.rows[0].sellerId)],p=await cancellationPreview(f.db,access,sellerIds),before=f.sqlite.prepare('SELECT status,amount_paisa FROM payments WHERE order_id=?').get(f.orderId);
  await cancelSelectedParcels(f.db,access,{sellerIds,fingerprint:p.fingerprint,requestId:'paid-cancel',note:'Cancel this paid order before any physical handoff.',now:Date.now()});
  const staff={orderNumber:f.order.orderNumber,actorId:'reviewer'},fresh=await cancellationPreview(f.db,staff,sellerIds);
  await cancelSelectedParcels(f.db,staff,{sellerIds,fingerprint:fresh.fingerprint,requestId:'paid-cancel-approved',reviewId:'paid-cancel',note:'Original evidence supports cancellation before any physical work.',now:Date.now()});
  assert.deepEqual(f.sqlite.prepare('SELECT status,amount_paisa FROM payments WHERE order_id=?').get(f.orderId),before);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE order_id=? AND kind='cancelled_money' AND state='open'").get(f.orderId)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM refunds WHERE order_id=?').get(f.orderId)!.n,0);
 }finally{f.dispose();}
});

void test('ordinary unpaid cancellation releases original reserved stock once, including replay',async()=>{
 const f=await commerceOrderFixture();try{
  const before=Number(f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='product-a'").get()!.n);
  const preview=await cancellationPreview(f.database,f.access,['seller-a']);assert.equal(preview.reviewRequired,false);
  const input={sellerIds:['seller-a'],fingerprint:preview.fingerprint,requestId:'ordinary-stock-once',note:'Cancel this exact unpaid seller portion.',now:Date.now()};
  await cancelSelectedParcels(f.database,f.access,input);await cancelSelectedParcels(f.database,f.access,input);
  assert.deepEqual({...await cancellationOutcome(f.database,f.access,input.requestId)},{id:input.requestId,status:'cancelled',decision:'approved'});
  await assert.rejects(cancellationOutcome(f.database,{orderNumber:f.access.orderNumber,customerId:'user-a'},input.requestId));
  assert.equal(f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='product-a'").get()!.n,before+1);
 }finally{await f.dispose();}
});
void test('Ready without handoff creates a scoped review hold; rejecting it releases no independent hold',async()=>{
 const f=await commerceOrderFixture(true);try{
  f.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE seller_id='seller-a'").run();
  const preview=await cancellationPreview(f.database,f.access,['seller-a']);assert.equal(preview.reviewRequired,true);
  const request={sellerIds:['seller-a'],fingerprint:preview.fingerprint,requestId:'ready-cancel-review',note:'Please stop the exact seller portion before pickup.',now:Date.now()};
  assert.equal((await cancelSelectedParcels(f.database,f.access,request)).status,'review_requested');
  const selected=f.sqlite.prepare("SELECT id FROM order_items WHERE seller_id='seller-a'").get()!,other=f.sqlite.prepare("SELECT id FROM order_items WHERE seller_id='seller-b'").get()!;
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_fulfillment_holds WHERE order_item_id=? AND ended_at IS NULL').get(selected.id)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_fulfillment_holds WHERE order_item_id=? AND ended_at IS NULL').get(other.id)!.n,0);
  f.sqlite.prepare("INSERT INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at) VALUES('independent-safety',?,'safety','fictional-safety-case','fictional-safety','owner','owner',1,1,?,?)").run(selected.id,Date.now(),Date.now()+86400000);
  await rejectCancellationReview(f.database,{id:request.requestId,actorId:'owner',note:'Customer withdrew this cancellation after clarification.',now:Date.now()});
  const holds=f.sqlite.prepare('SELECT id FROM order_fulfillment_holds WHERE order_item_id=? AND ended_at IS NULL').all(selected.id);assert.deepEqual(holds.map(h=>h.id),['independent-safety']);
 }finally{await f.dispose();}
});
void test('unpaid manual-bank cancellation remains available as review without pretending a cash refund',async()=>{
 const f=await manualOrderFixture();try{
  const access={orderNumber:f.order.orderNumber,customerId:'customer'},sellerId=String(f.sqlite.prepare('SELECT seller_id FROM order_items WHERE order_id=?').get(f.orderId)!.seller_id),preview=await cancellationPreview(f.db,access,[sellerId]);
  assert.equal(preview.reviewRequired,true);
  const result=await cancelSelectedParcels(f.db,access,{sellerIds:[sellerId],fingerprint:preview.fingerprint,requestId:'manual-cancel-request',note:'Request cancellation of the exact bank-payment seller portion.',now:Date.now()});
  assert.equal(result.status,'review_requested');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM refunds WHERE order_id=?').get(f.orderId)!.n,0);
  const item=String(f.sqlite.prepare('SELECT id FROM order_items WHERE order_id=?').get(f.orderId)!.id);
  await assert.rejects(transitionSellerFulfillment(f.db,{orderId:f.orderId,sellerId,actorId:'registered-owner',action:'start_packing',note:'Attempt to begin after accepted cancellation hold.',requestId:'held-work-attempt',now:Date.now(),itemIds:[item]}));
 }finally{f.dispose();}
});

