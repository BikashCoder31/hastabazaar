import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {createCustomerComplaint} from '../lib/db/repositories/complaints';
import {assignReviewTask} from '../lib/workflows/review-tasks';
import {processReminderDispatch} from '../lib/operations/reminder-dispatch';
import {isCurrentReminderNotice} from '../lib/operations/reminder-notice-sources';
import {aftercareFollowup,recordAftercareFollowup} from '../lib/returns/followup';

function clock(f:{sqlite:import('node:sqlite').DatabaseSync},now:number){f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));}
async function complaint(f:Awaited<ReturnType<typeof commerceOrderFixture>>,tag:string){return createCustomerComplaint(f.database,{...f.access,receiptTokenHash:null,orderItemId:null,category:'delivery',subject:'The original delivery needs a factual update',detail:'FICTIONAL-PRIVATE-CASE-DETAIL only for the actual authorized original case.',locale:'en-NP',requestId:tag,now:Date.now()});}
const noticeColumns='template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId';

void test('current aftercare assignment and grants reroute one original milestone without resetting the first-review clock',async()=>{
 const f=await commerceOrderFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 for(const id of ['support-a','support-b']){f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES(?,?,?,'Fictional support','en-NP','active',1,1)").run(id,id,id+'@local.hastabazaar.test');f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'admin',1)").run(id);}
 const request=await complaint(f,'t29-owned-original-complaint'),task=f.sqlite.prepare("SELECT id,revision FROM review_tasks WHERE source_type='complaint' AND source_id=?").get(request.id)!;
 await assignReviewTask(f.database,{actorId:'owner',requestId:'t29-support-a-assigned',expectedRevision:String(task.revision),now:Date.now()},{taskId:String(task.id),ownerId:'support-a',reason:'Assign an actually eligible responsible operator for this original case.'});
 const original=(await aftercareFollowup(f.database,'complaint',request.id))!,now=original.firstDueAt;clock(f,now);
 const first=await processReminderDispatch(f.database,{now,limit:50});assert.deepEqual(first.failures,[]);
 const milestone=f.sqlite.prepare("SELECT * FROM operational_reminder_milestones WHERE family='complaint' AND source_id=? AND milestone='first_review'").get(request.id)!;assert.ok(milestone);
 const old=f.sqlite.prepare('SELECT '+noticeColumns+" FROM notification_messages WHERE template_key='business.workflow.reminder' AND related_id=? AND recipient_user_id='support-a' AND channel='email'").get(milestone.id)!;assert.ok(await isCurrentReminderNotice(f.database,old as never,now));
 const latest=f.sqlite.prepare('SELECT revision FROM review_tasks WHERE id=?').get(task.id)!;
 await assignReviewTask(f.database,{actorId:'owner',requestId:'t29-support-b-handoff',expectedRevision:String(latest.revision),now},{taskId:String(task.id),ownerId:'support-b',reason:'Hand over this same overdue source without granting a fresh review window.'});
 assert.equal(await isCurrentReminderNotice(f.database,old as never,now),false);
 await processReminderDispatch(f.database,{now,limit:50});
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM operational_reminder_milestones WHERE family='complaint' AND source_id=? AND milestone='first_review'").get(request.id)!.n,1);
 const fresh=f.sqlite.prepare('SELECT '+noticeColumns+" FROM notification_messages WHERE template_key='business.workflow.reminder' AND related_id=? AND recipient_user_id='support-b' AND channel='email'").get(milestone.id)!;assert.ok(fresh);assert.ok(await isCurrentReminderNotice(f.database,fresh as never,now));
 f.sqlite.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,updated_by,updated_at) VALUES('support-b','[]','owner',?)").run(now);
 assert.equal(await isCurrentReminderNotice(f.database,fresh as never,now),false);
 assert.equal((await aftercareFollowup(f.database,'complaint',request.id))!.firstDueAt,original.firstDueAt);
 assert.doesNotMatch(JSON.stringify(f.sqlite.prepare("SELECT body_en FROM notification_messages WHERE template_key='business.workflow.reminder'").all()),/FICTIONAL-PRIVATE-CASE-DETAIL/);
 }finally{await f.dispose();}
});

void test('late clarification discovery emits current48h review without stale24h customer catch-up',async()=>{
 const f=await commerceOrderFixture();try{
 const request=await complaint(f,'t29-original-question'),before=(await aftercareFollowup(f.database,'complaint',request.id))!,now=Date.now();
 await recordAftercareFollowup(f.database,{actorId:'owner',requestId:'t29-specific-question',expectedRevision:String(before.revision),now},{sourceType:'complaint',sourceId:request.id,ownerId:'owner',backupId:null,waitingFor:'customer',nextUpdateAt:now+2*86400000,nextAction:'Review the requested original clarification when the customer responds.',publicMessage:'Please clarify the exact missing delivery detail in your original case.',privateNote:'The original restricted evidence remains on the case and must never enter a reminder.',newClarification:true});
 const question=(await aftercareFollowup(f.database,'complaint',request.id))!,late=question.clarificationDueAt!;clock(f,late);
 const result=await processReminderDispatch(f.database,{now:late,limit:50});assert.deepEqual(result.failures,[]);
 const milestones=f.sqlite.prepare("SELECT milestone FROM operational_reminder_milestones WHERE family='complaint' AND source_id=?").all(request.id);assert.deepEqual(milestones.map(row=>row.milestone),['clarification_due']);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.workflow.reminder' AND recipient_user_id='checkout-buyer'").get()!.n,0);
 }finally{await f.dispose();}
});
