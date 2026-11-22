import assert from 'node:assert/strict';
import test from 'node:test';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {createCustomerReturnRequest,reviewReturnAsAdmin,addCustomerReturnClarification} from '../lib/db/repositories/returns';
import {createCustomerComplaint,updateComplaintAsAdmin,getCustomerComplaintDetail,getSellerComplaintDetail} from '../lib/db/repositories/complaints';
import {aftercareFollowup,aftercareDueFacts,recordAftercareFollowup} from '../lib/returns/followup';
import {listReviewTasks} from '../lib/workflows/review-tasks';
const reviewText={note:'The actual supplied detail needs the exact requested clarification.',publicMessageEn:'Please clarify the precise issue described so we can choose a supported remedy.',publicMessageNe:'उचित समाधानका लागि समस्याको विवरण स्पष्ट पार्नुहोस्।'};
void test('specific return clarification retains original first review and a separate 48-hour response target',async()=>{
 const f=await commerceOrderFixture();try{
  await f.deliver();const item=String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id),now=Date.now();
  const request=await createCustomerReturnRequest(f.database,{...f.access,receiptTokenHash:null,orderItemId:item,quantity:1,reason:'defective',requestedResolution:'refund',detail:'The actual delivered fictional item has a defect that needs review.',locale:'en-NP',idempotencyKey:'clarify-original-return',evidence:[],now});
  await reviewReturnAsAdmin(f.database,{returnRequestId:request.id,actorId:'owner',actorRole:'super_admin',action:'request_changes',...reviewText,requestId:'clarify-return-question',now:Date.now()});
  const row=f.sqlite.prepare('SELECT * FROM return_handling WHERE case_id=?').get(request.id)!;
  assert.equal(row.first_received_at,now);assert.equal(row.first_due_at,now+86400000);assert.equal(row.waiting_for,'customer');assert.equal(Number(row.clarification_due_at)-Number(row.clarification_at),48*3600000);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='return_request' AND source_id=?").get(request.id)!.n,1);
  await addCustomerReturnClarification(f.database,{...f.access,receiptTokenHash:null,returnRequestId:request.id,message:'The defect is in the original handle, which arrived cracked.',locale:'en-NP',requestId:'actual-customer-clarification',now:Date.now()});
  const replied=f.sqlite.prepare('SELECT waiting_for,first_received_at FROM return_handling WHERE case_id=?').get(request.id)!;assert.equal(replied.waiting_for,'none');assert.equal(replied.first_received_at,now);
 }finally{await f.dispose();}
});
void test('complaint first review is retained and private escalation and investigation notes stay staff-only',async()=>{
 const f=await commerceOrderFixture();try{
  const item=String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id),now=Date.now();
  const request=await createCustomerComplaint(f.database,{...f.access,receiptTokenHash:null,orderItemId:item,category:'delivery',subject:'Actual delivery needs investigation',detail:'The fictional delivery has not arrived; do not fabricate a delivered-item return.',locale:'en-NP',requestId:'complaint-original',now});
  await updateComplaintAsAdmin(f.database,{complaintId:request.id,actorId:'owner',actorRole:'super_admin',action:'assign_to_me',...reviewText,requestId:'complaint-assign',now:Date.now()});
  const assigned=f.sqlite.prepare('SELECT first_action_at,first_due_at FROM complaints WHERE id=?').get(request.id)!;assert.equal(assigned.first_action_at,null);assert.equal(assigned.first_due_at,now+86400000);
  await updateComplaintAsAdmin(f.database,{complaintId:request.id,actorId:'owner',actorRole:'super_admin',action:'escalate',...reviewText,requestId:'complaint-escalation',now:Date.now()});
  const customer=await getCustomerComplaintDetail(f.database,request.id,f.access.orderNumber,null,'checkout-buyer'),seller=await getSellerComplaintDetail(f.database,request.id,'seller-a');
  assert.equal(customer!.escalationReason,null);assert.equal(seller!.escalationReason,null);assert.ok(customer!.events.every(e=>e.internalNote===null));assert.ok(seller!.events.every(e=>e.internalNote===null));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='complaint' AND source_id=?").get(request.id)!.n,1);
 }finally{await f.dispose();}
});
void test('a caller cannot make staff complaint decisions by supplying a claimed role without current authority',async()=>{
 const f=await commerceOrderFixture();try{
  const request=await createCustomerComplaint(f.database,{...f.access,receiptTokenHash:null,orderItemId:null,category:'other',subject:'An actual order concern',detail:'The fictional customer requests help with this retained order.',locale:'en-NP',requestId:'complaint-authority',now:Date.now()});
  await assert.rejects(updateComplaintAsAdmin(f.database,{complaintId:request.id,actorId:'checkout-buyer',actorRole:'super_admin',action:'investigate',...reviewText,requestId:'forged-staff-claim',now:Date.now()}));
 }finally{await f.dispose();}
});
void test('carrier waiting keeps an owned promise and never becomes a customer clarification reminder',async()=>{
 const f=await commerceOrderFixture();try{
  const request=await createCustomerComplaint(f.database,{...f.access,receiptTokenHash:null,orderItemId:null,category:'delivery',subject:'Carrier needs to trace this parcel',detail:'The customer already handed over the requested information; the carrier must trace the actual parcel.',locale:'en-NP',requestId:'carrier-original-case',now:Date.now()});
  const before=(await aftercareFollowup(f.database,'complaint',request.id))!,ctx={actorId:'owner',requestId:'carrier-owned-followup',expectedRevision:String(before.revision),now:Date.now()},input={sourceType:'complaint' as const,sourceId:request.id,ownerId:'owner',backupId:null,waitingFor:'carrier' as const,nextUpdateAt:before.now+3600000,nextAction:'Obtain the actual carrier depot trace and confirmed custody.',publicMessage:'We are tracing the parcel with the carrier and will update this case.',privateNote:'The customer information is complete; only the carrier custody trace is missing.',newClarification:false};
  const result=await recordAftercareFollowup(f.database,ctx,input);assert.deepEqual(await recordAftercareFollowup(f.database,ctx,input),result);
  await assert.rejects(recordAftercareFollowup(f.database,ctx,{...input,nextUpdateAt:input.nextUpdateAt+1000}));
  const current=(await aftercareFollowup(f.database,'complaint',request.id))!;assert.equal(current.firstReceivedAt,before.firstReceivedAt);assert.equal(current.clarificationAt,null);assert.equal(current.ownerId,'owner');assert.equal(current.nextUpdateAt,input.nextUpdateAt);
  assert.deepEqual(aftercareDueFacts(current,input.nextUpdateAt),[{kind:'promised_update',dueAt:input.nextUpdateAt,customerPrompt:false}]);
  const task=(await listReviewTasks(f.database,'owner')).find(t=>t.sourceType==='complaint'&&t.sourceId===request.id)!;assert.equal(task.ownerId,'owner');assert.equal(task.nextActor,'Carrier');
 }finally{await f.dispose();}
});
