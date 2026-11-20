import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {createCustomerReturnRequest,reviewReturnAsAdmin} from '../lib/db/repositories/returns';
import {processReminderDispatch} from '../lib/operations/reminder-dispatch';
import {resolveReminderDestination} from '../lib/operations/reminder-destination';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';
void test('reminder links reauthorize exact recipients and stop routing obsolete questions',async()=>{
 const f=await commerceOrderFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  await f.deliver();const itemId=String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id),startedAt=Date.now();
  const request=await createCustomerReturnRequest(f.database,{...f.access,receiptTokenHash:null,orderItemId:itemId,quantity:1,reason:'defective',requestedResolution:'refund',detail:'The fictional original product needs a factual return review.',locale:'en-NP',idempotencyKey:'reminder-link-return',evidence:[],now:startedAt});
  let now=startedAt+24*3600000;
  f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));
  const result=await processReminderDispatch(f.database,{now,limit:50});assert.deepEqual(result.failures,[]);
  const first=String(f.sqlite.prepare("SELECT id FROM operational_reminder_milestones WHERE source_id=? AND milestone='first_review'").get(request.id)!.id);
  assert.equal(await resolveReminderDestination(f.database,'owner',first,'staff',now),'/admin/cases/returns/'+encodeURIComponent(request.id));
  assert.equal(await resolveReminderDestination(f.database,'checkout-buyer',first,'staff',now),null);
  assert.equal(await resolveReminderDestination(f.database,'owner',first,'seller',now),null);
  await reviewReturnAsAdmin(f.database,{returnRequestId:request.id,actorId:'owner',actorRole:'super_admin',action:'request_changes',note:'The original report needs one specific factual clarification.',publicMessageEn:'Please clarify which part of the original item is damaged.',publicMessageNe:'Please clarify the original item damage.',requestId:'reminder-link-question',now});
  assert.equal(await resolveReminderDestination(f.database,'owner',first,'staff',now),null);
  now+=24*3600000;assert.deepEqual((await processReminderDispatch(f.database,{now,limit:50})).failures,[]);
  const question=String(f.sqlite.prepare("SELECT id FROM operational_reminder_milestones WHERE source_id=? AND milestone='clarification_reminder'").get(request.id)!.id);
  assert.equal(await resolveReminderDestination(f.database,'checkout-buyer',question,'customer',now),'/orders/'+encodeURIComponent(f.access.orderNumber)+'#aftercare-title');
  assert.equal(await resolveReminderDestination(f.database,'user-a',question,'customer',now),null);
  f.sqlite.prepare("UPDATE notification_messages SET status='cancelled' WHERE channel='email' AND status IN ('created','queued') AND NOT (template_key='business.workflow.reminder' AND related_id=?)").run(question);
  const captured:string[]=[];
  await deliverBusinessEmails(f.database,{transport:'capture',handoffAware:true,send:async(message,context)=>{await context?.beforeHandoff?.();captured.push(message.to);return {outcome:'captured',transport:'capture',receipt:'fictional-reminder-only'};}},'http://localhost:3018',{now,limit:20});
  assert.ok(captured.includes(String(f.sqlite.prepare("SELECT email FROM users WHERE id='checkout-buyer'").get()!.email)));
 }finally{await f.dispose();}
});
