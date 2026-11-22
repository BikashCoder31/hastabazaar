import assert from 'node:assert/strict';
import test from 'node:test';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {allocateBankReceipt,recordBankReceipt} from '../lib/payments/manual-receipts';
import {processOrderResponseFollowup} from '../lib/orders/response-followup';
import {currentResponseNotice} from '../lib/orders/response-notifications';
import {transitionSellerFulfillment} from '../lib/db/repositories/fulfillment';
const hour=3600000;
async function response(){const path='../lib/orders/response-clock',loadedFixtureModule=await import(path).catch(()=>null);assert.equal(typeof loadedFixtureModule?.evaluateResponseClock,'function','Order response needs a clock based on actual release and scoped authorized hold history.');return loadedFixtureModule!;}
void test('six and twelve hours are measured from the same actual release; initial payment holds have no seller clock',async()=>{
 const {evaluateResponseClock}=await response();assert.equal(evaluateResponseClock({releasedAt:null,now:48*hour,holds:[]}).released,false);
 assert.equal(evaluateResponseClock({releasedAt:0,now:6*hour-1,holds:[]}).reminderDue,false);assert.equal(evaluateResponseClock({releasedAt:0,now:6*hour,holds:[]}).reminderDue,true);const late=evaluateResponseClock({releasedAt:0,now:12*hour,holds:[]});assert.equal(late.escalationDue,true);assert.equal(late.reminderDue,false);assert.equal(late.elapsedMs,12*hour);
});
void test('authorized scoped holds pause remaining allowance without moving the absolute supervision checkpoint',async()=>{
 const {evaluateResponseClock}=await response(),holds=[{startedAt:5*hour,endedAt:9*hour,reason:'cancellation',preventsPreparation:true}];const resumed=evaluateResponseClock({releasedAt:0,now:10*hour,holds});assert.equal(resumed.elapsedMs,6*hour);assert.equal(resumed.reminderDue,true);
 const held=evaluateResponseClock({releasedAt:0,now:24*hour,holds:[{startedAt:5*hour,endedAt:null,reason:'safety',preventsPreparation:true}]});assert.equal(held.elapsedMs,5*hour);assert.equal(held.reminderDue,false);assert.equal(held.escalationDue,false);assert.equal(held.checkpointDue,true);
 const overlap=evaluateResponseClock({releasedAt:0,now:12*hour,holds:[...holds,{startedAt:7*hour,endedAt:10*hour,reason:'payment_dispute',preventsPreparation:true}]});assert.equal(overlap.elapsedMs,7*hour);
});
void test('future terms, workload and pickup-only carrier trouble cannot pause preparation; actual progress resolves only its scope',async()=>{
 const {evaluateResponseClock}=await response(),holds=['future_terms','workload'].map(reason=>({startedAt:0,endedAt:null,reason,preventsPreparation:true}));holds.push({startedAt:0,endedAt:null,reason:'carrier',preventsPreparation:false});assert.equal(evaluateResponseClock({releasedAt:0,now:12*hour,holds}).escalationDue,true);
 assert.equal(evaluateResponseClock({releasedAt:0,now:12*hour,holds:[],progressAt:hour}).escalationDue,false);assert.equal(evaluateResponseClock({releasedAt:0,now:12*hour,holds:[],exceptionAt:hour}).escalationDue,false);assert.equal(evaluateResponseClock({releasedAt:hour,now:12*hour,holds:[]}).escalationDue,false);
});

void test('actual unpaid/paid release, shared notifications and once-only milestones follow native source progress',async()=>{
 const f=await manualOrderFixture();try{
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_response_items r JOIN order_items i ON i.id=r.order_item_id WHERE i.order_id=?').get(f.orderId)!.n,0);
  const credit=await recordBankReceipt(f.db,{actorId:'reviewer',requestId:'response-actual-credit',expectedRevision:null,now:Date.now()},{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-RESPONSE-CREDIT',bankAt:f.now,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Fictional authenticated customer',payerUserId:'customer',evidenceReference:'FICTIONAL-INDEPENDENT-RESPONSE-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify actual fictional company credit before release for preparation.'});
  await allocateBankReceipt(f.db,{actorId:'reviewer',requestId:'response-allocate-credit',expectedRevision:'0',now:Date.now()},{receiptId:credit.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Original customer, bank credit and exact order independently matched.',exceptionApproval:null});
  const row=f.sqlite.prepare('SELECT r.*,i.seller_id FROM order_response_items r JOIN order_items i ON i.id=r.order_item_id WHERE i.order_id=?').get(f.orderId)!;assert.ok(row.released_at);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE related_id IN(SELECT id FROM order_response_events WHERE portion_id=? AND kind='released') AND template_key='business.order.response' AND audience_role='seller'").get(String(row.portion_id))!.n,2);
  let now=Number(row.released_at)+6*hour;f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));
  assert.equal((await processOrderResponseFollowup(f.db)).reminders,1);assert.equal((await processOrderResponseFollowup(f.db)).reminders,0);
  const reminder=String(f.sqlite.prepare("SELECT id FROM order_response_events WHERE order_id=? AND kind='reminder'").get(f.orderId)!.id);assert.equal(await currentResponseNotice(f.db,reminder),true);
  now=Number(row.released_at)+12*hour;const escalation=await processOrderResponseFollowup(f.db);assert.equal(escalation.escalations,1);assert.equal(escalation.customerUpdates,1);assert.equal((await processOrderResponseFollowup(f.db)).customerUpdates,0);assert.equal(await currentResponseNotice(f.db,reminder),false);
  const owned=f.sqlite.prepare('SELECT * FROM order_response_cases WHERE portion_id=?').get(row.portion_id)!;assert.equal(Number(owned.first_due_at)-Number(owned.created_at),2*hour);assert.equal(owned.next_update_at,null);assert.equal(owned.commitment_missing,1);
  await assert.rejects(transitionSellerFulfillment(f.db,{orderId:f.orderId,sellerId:String(row.seller_id),actorId:'foreign',action:'start_packing',note:'An unrelated actor must not mutate this seller portion.',requestId:'foreign-preparation',now}));
  await transitionSellerFulfillment(f.db,{orderId:f.orderId,sellerId:String(row.seller_id),actorId:'registered-owner',action:'start_packing',note:'Begin actual preparation of this exact fictional order scope.',requestId:'response-real-progress',now});
  assert.ok(f.sqlite.prepare('SELECT progress_at FROM order_response_items WHERE order_item_id=?').get(row.order_item_id)!.progress_at);const event=String(f.sqlite.prepare("SELECT id FROM order_response_events WHERE order_id=? AND kind='escalation'").get(f.orderId)!.id);assert.equal(await currentResponseNotice(f.db,event),false);assert.equal(f.sqlite.prepare('SELECT state FROM order_response_cases WHERE id=?').get(owned.id)!.state,'resolved');
 }finally{f.dispose();}
});

void test('mixed exact offers progress independently; a scoped hold blocks preparation and pauses only its remaining allowance',async()=>{
 const f=await manualOrderFixture({secondOffer:true});try{
  const ctx={actorId:'reviewer',requestId:'mixed-response-credit',expectedRevision:null,now:Date.now()},credit=await recordBankReceipt(f.db,ctx,{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-MIXED-RESPONSE-CREDIT',bankAt:f.now,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Fictional exact order customer',payerUserId:'customer',evidenceReference:'FICTIONAL-MIXED-COMPLETED-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify independently received fictional funds for both original purchased offers.'});
  await allocateBankReceipt(f.db,{...ctx,requestId:'mixed-response-allocate',expectedRevision:'0'},{receiptId:credit.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Independent exact bank, customer and original order match.',exceptionApproval:null});
  const items=f.sqlite.prepare('SELECT r.*,i.seller_id FROM order_response_items r JOIN order_items i ON i.id=r.order_item_id WHERE i.order_id=? ORDER BY i.id').all(f.orderId);assert.equal(items.length,2);const first=String(items[0].order_item_id),second=String(items[1].order_item_id),released=Number(items[0].released_at);let now=released+5*hour;
  f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));
  f.sqlite.prepare("INSERT INTO order_fulfillment_holds(id,order_item_id,reason,source_type,source_id,imposed_by,owner_id,prevents_preparation,prevents_handoff,started_at,review_due_at) VALUES('fictional-scoped-hold',?,'customer_clarification','fixture_staff_decision','fictional-hold-decision','reviewer','reviewer',1,1,?,?)").run(second,now,now+2*hour);
  const command={orderId:f.orderId,sellerId:String(items[0].seller_id),actorId:'registered-owner',action:'start_packing' as const,itemIds:[first],note:'Begin the selected exact purchased offer only.',requestId:'mixed-select-first',now};await transitionSellerFulfillment(f.db,command);await transitionSellerFulfillment(f.db,command);
  await assert.rejects(transitionSellerFulfillment(f.db,{...command,itemIds:[second]}),/different command/);await assert.rejects(transitionSellerFulfillment(f.db,{...command,requestId:'attempt-held-second',itemIds:[second]}),/held/);
  assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items WHERE id=?').get(first)!.fulfillment_status,'packing');assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items WHERE id=?').get(second)!.fulfillment_status,'confirmed');
  now=released+24*hour;const held=await processOrderResponseFollowup(f.db);assert.equal(held.checkpoints,1);assert.equal(held.escalations,0);assert.equal(held.reminders,0);assert.equal(f.sqlite.prepare("SELECT kind FROM order_response_cases WHERE portion_id=?").get(items[0].portion_id)!.kind,'hold');
  f.sqlite.prepare("UPDATE order_fulfillment_holds SET ended_at=?,ended_by='reviewer',release_reason='The specific customer clarification was resolved.' WHERE id='fictional-scoped-hold'").run(now);now+=hour;
  assert.equal((await processOrderResponseFollowup(f.db)).reminders,1);const reminder=f.sqlite.prepare("SELECT scope_json FROM order_response_events WHERE order_id=? AND kind='reminder'").get(f.orderId)!;assert.deepEqual(JSON.parse(String(reminder.scope_json)),[second]);assert.equal(f.sqlite.prepare('SELECT released_at FROM order_response_items WHERE order_item_id=?').get(second)!.released_at,released);
 }finally{f.dispose();}
});
