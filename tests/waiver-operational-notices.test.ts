import assert from 'node:assert/strict';
import test from 'node:test';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {mutateCustomerFeeWaiver} from '../lib/db/repositories/customer-fee-waivers';
import {isCurrentProgrammeNotice,processProgrammeDue} from '../lib/operations/programme-notice-sources';
import {readFinancialNoticeDestination} from '../lib/operations/financial-notice-destination';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';
import type {DeliveryContext} from '../lib/email/delivery-attempts';
import {processReminderDispatch} from '../lib/operations/reminder-dispatch';

void test('actual waiver publication/pause has one mandatory current-SA copy per channel, replay none and revoked/stale copies never hand off',async()=>{
 const f=await payoutTransferFixture();try{
  f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('waiver-sa-b','waiver-sa-b','waiver-sa-b@local.hastabazaar.test','Fictional policy B','active',?,?)").run(f.now,f.now);f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('waiver-sa-b','super_admin',?)").run(f.now);
  const ctx=(requestId:string,expectedRevision:number)=>({actorId:'reviewer',authSubject:'reviewer',requestId,expectedRevision,now:f.now}),draft=await mutateCustomerFeeWaiver(f.db,ctx('original-waiver-draft',0),{type:'create',terms:{name:'PRIVATE campaign name',description:'PRIVATE unrelated evidence must stay private.',startsAt:f.now-1000,endsAt:f.now+120000}});
  const input={type:'publish' as const,campaignId:draft.id};await mutateCustomerFeeWaiver(f.db,ctx('original-waiver-publish',1),input);
  const rows=()=>f.sqlite.prepare("SELECT recipient_user_id userId,channel,body_en body FROM notification_messages WHERE related_type='customer_fee_waiver_notice' AND related_id=?").all(draft.id);
  assert.deepEqual(rows().map(r=>r.userId+':'+r.channel).sort(),['reviewer:email','reviewer:in_app','waiver-sa-b:email','waiver-sa-b:in_app']);assert.doesNotMatch(JSON.stringify(rows()),/PRIVATE|unrelated evidence/);
  await mutateCustomerFeeWaiver(f.db,ctx('original-waiver-publish',1),input);assert.equal(rows().length,4);
  const notice=f.sqlite.prepare("SELECT template_key template,related_type relatedType,related_id relatedId,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE related_type='customer_fee_waiver_notice' AND related_id=? AND recipient_user_id='reviewer' AND channel='email'").get(draft.id)!;
  assert.equal(await isCurrentProgrammeNotice(f.db,notice as never,f.now),true);assert.ok(await readFinancialNoticeDestination(f.db,{actorId:'reviewer',audience:'staff',type:'customer_fee_waiver_notice',id:draft.id},f.now));
  await mutateCustomerFeeWaiver(f.db,ctx('original-waiver-pause',2),{type:'pause',campaignId:draft.id});assert.equal(await isCurrentProgrammeNotice(f.db,notice as never,f.now),false);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='waiver-sa-b' AND role='super_admin'").run();assert.equal(await readFinancialNoticeDestination(f.db,{actorId:'waiver-sa-b',audience:'staff',type:'customer_fee_waiver_notice',id:draft.id},f.now).catch(()=>null),null);
  const captured:string[]=[],mail={transport:'capture' as const,handoffAware:true,async send(message:{to:string;subject:string;text:string;html:string},context?:DeliveryContext){assert.ok(context);await context.beforeHandoff();captured.push(message.to);return{outcome:'captured' as const,transport:'capture' as const,receipt:'fictional-waiver-'+context.attemptId};}};
  for(let pass=0;pass<5;pass++){const result=await deliverBusinessEmails(f.db,mail,'http://localhost:3018',{limit:20,now:Date.now()});if(result.accepted+result.failed+result.cancelled===0)break;}assert.ok(!captured.includes('waiver-sa-b@local.hastabazaar.test'));
  const status=f.sqlite.prepare("SELECT recipient_user_id userId,status,failure_reason reason FROM notification_messages WHERE related_type='customer_fee_waiver_notice' AND related_id=? AND channel='email'").all(draft.id);assert.ok(status.some(r=>r.userId==='reviewer'&&r.status==='sent'),JSON.stringify(status));assert.ok(status.filter(r=>r.userId==='waiver-sa-b').every(r=>r.status==='cancelled'));
 }finally{f.dispose();}
});

void test('published waiver expiry is one original-clock milestone and leaves money/campaign facts untouched',async()=>{
 const f=await payoutTransferFixture();try{
  const ctx=(requestId:string,expectedRevision:number)=>({actorId:'reviewer',authSubject:'reviewer',requestId,expectedRevision,now:f.now}),end=f.now+1000,draft=await mutateCustomerFeeWaiver(f.db,ctx('expiry-waiver-draft',0),{type:'create',terms:{name:'Fictional ending policy',description:'Fictional policy only.',startsAt:f.now-1000,endsAt:end}});await mutateCustomerFeeWaiver(f.db,ctx('expiry-waiver-publish',1),{type:'publish',campaignId:draft.id});await mutateCustomerFeeWaiver(f.db,ctx('expiry-waiver-pause',2),{type:'pause',campaignId:draft.id});
  f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(end/1000)):(end%60000/1000).toFixed(3).padStart(6,'0'));
  f.sqlite.prepare("INSERT OR REPLACE INTO operational_reminder_cursors(family,`cursor`) VALUES('dispatch','fee_waiver_campaign')").run();
  const before=JSON.stringify(f.sqlite.prepare('SELECT * FROM customer_fee_waiver_revisions ORDER BY revision').all()),dispatch=await processReminderDispatch(f.db,{now:end,limit:1,deadlineMs:Date.now()+10000});assert.equal(dispatch.scanned,1);assert.equal(dispatch.created,1);assert.deepEqual(dispatch.failures,[]);assert.equal(dispatch.cursor.fee_waiver_campaign,draft.id);assert.equal(await processProgrammeDue(f.db,'waiver',draft.id,end+1),0);assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM customer_fee_waiver_revisions ORDER BY revision').all()),before);
 }finally{f.dispose();}
});
