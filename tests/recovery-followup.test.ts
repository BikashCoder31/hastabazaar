import { fakeProviderMail } from './helpers/fake-provider-mail';
import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {deliverBusinessEmails as actualDeliverBusinessEmails} from '../lib/operations/business-notifications';

void test('the common sender delivers the current itemized recovery notice and suppresses the superseded opening notice',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const sent:{to:string;subject:string}[]=[];
 for(let batch=0;batch<10;batch++){
  const delivery=await deliverBusinessEmails(f.db,{send:async message=>{assert.match(message.to,/@local\.hastabazaar\.test$/);sent.push({to:message.to,subject:message.subject});}},'https://local.hastabazaar.test',{limit:20,deliveryTransport:'provider'});
  if(delivery.accepted+delivery.failed+delivery.cancelled===0)break;
 }
 const owner=String(f.sqlite.prepare("SELECT email FROM users WHERE id='registered-owner'").get()!.email);
 assert.equal(sent.filter(message=>message.to===owner&&message.subject.endsWith('Recovery statement: approved')).length,1);
 assert.equal(sent.filter(message=>message.subject.endsWith('Recovery statement: opened')).length,0);
 const {observeRecoveryEmailContact}=await import('../lib/payments/recovery-followup');
 const window=await observeRecoveryEmailContact(f.db,f.recoveryId);assert.ok(window);
 assert.equal(window.responseDueAt-window.startedAt,7*86400000);
 assert.deepEqual(await observeRecoveryEmailContact(f.db,f.recoveryId,Date.now()+8*86400000),window);
 }finally{f.dispose();}
});

void test('an original customer with a staff role cannot receive the private seller recovery statement as Finance',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('customer','super_admin',1)").run();
 const event=f.sqlite.prepare("SELECT request_id AS requestId FROM seller_recovery_events WHERE case_id=? AND action='approved'").get(f.recoveryId)!;
 const {recoveryNoticeStatements}=await import('../lib/payments/recovery-notices');
 await f.db.batch(await recoveryNoticeStatements(f.db,f.ctx(String(event.requestId)),f.recoveryId,'approved','Private original seller statement with the exact approved source and current remaining balance.'));
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE related_type='seller_recovery' AND related_id=? AND recipient_user_id='customer'").get(f.recoveryId)!.n,0);
 const {isCurrentOperationalNotice,operationalNotificationRequestId}=await import('../lib/operations/event-catalog');
 assert.equal(await isCurrentOperationalNotice(f.db,{template:'business.seller.recovery',relatedId:f.recoveryId,userId:'customer',audience:'staff',channel:'email',requestId:await operationalNotificationRequestId('business.seller.recovery',String(event.requestId),'customer','email')}),false);
 }finally{f.dispose();}
});

void test('captured or unread email does not start a response deadline; actual contact starts one retained seven-day window',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/recovery-followup';const m=await import(path);
 const approved=Number(f.sqlite.prepare('SELECT approved_at FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.approved_at);
 f.sqlite.prepare("UPDATE notification_messages SET status='sent',sent_at=?,delivery_transport='capture' WHERE related_type='seller_recovery' AND related_id=? AND channel='email'").run(approved+1,f.recoveryId);
 assert.equal(await m.observeRecoveryEmailContact(f.db,f.recoveryId,Date.now()),null);
 const awaiting=await m.readRecoveryFollowup(f.db,f.recoveryId,approved+6*60000);
 assert.equal(awaiting.responseDueAt,null);assert.equal(awaiting.phase,'contact_needed');assert.equal(awaiting.ownerId,'reviewer');
 const taskId=await m.ensureRecoveryContactWork(f.db,f.recoveryId,approved+6*60000);assert.ok(taskId);
 assert.equal(await m.ensureRecoveryContactWork(f.db,f.recoveryId,approved+7*60000),taskId);
 const task=f.sqlite.prepare('SELECT owner_id,due_at FROM review_tasks WHERE id=?').get(taskId)!;
 assert.equal(task.owner_id,'reviewer');assert.equal(task.due_at,awaiting.contactWork.dueAt);
 const actualAt=Date.now()-1,ctx=f.ctx('actual-itemized-contact','1');
 await m.recordRecoveryContact(f.db,ctx,{caseId:f.recoveryId,actualAt,evidenceReference:'FICTIONAL-ACTUAL-CONTACT-NOTE',reason:'Record the actual fictional itemized conversation, response request and original case reference.'});
 const first=await m.readRecoveryFollowup(f.db,f.recoveryId,actualAt);
 assert.equal(first.responseDueAt,actualAt+7*86400000);assert.equal(first.reminderAt,actualAt+3*86400000);
 const {listReviewTasks}=await import('../lib/workflows/review-tasks');
 assert.equal((await listReviewTasks(f.db,'reviewer')).find(task=>task.id===taskId)?.status,'no_longer_needed');
 const responseTask=await m.ensureRecoveryContactWork(f.db,f.recoveryId,actualAt+7*86400000);assert.ok(responseTask);
 assert.equal(await m.ensureRecoveryContactWork(f.db,f.recoveryId,actualAt+8*86400000),responseTask);
 assert.equal(f.sqlite.prepare('SELECT due_at FROM review_tasks WHERE id=?').get(responseTask)!.due_at,first.responseDueAt+86400000);
 await m.recordRecoveryContact(f.db,ctx,{caseId:f.recoveryId,actualAt,evidenceReference:'FICTIONAL-ACTUAL-CONTACT-NOTE',reason:'Record the actual fictional itemized conversation, response request and original case reference.'});
 assert.equal((await m.readRecoveryFollowup(f.db,f.recoveryId,actualAt+8*86400000)).responseDueAt,first.responseDueAt);
 const {disputeSellerRecovery}=await import('../lib/payments/seller-recovery');
 await disputeSellerRecovery(f.db,{...f.ctx('respond-by-review','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:1000,evidenceReference:null,reason:'Review the original responsibility calculation and evidence for this disputed part.'});
 assert.equal((await m.readRecoveryFollowup(f.db,f.recoveryId,actualAt+8*86400000)).needsResponse,false);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_response_windows').get()!.n,1);
 }finally{f.dispose();}
});

// This test suite models an explicitly accepting fake provider.
const deliverBusinessEmails: typeof actualDeliverBusinessEmails = (db,mail,origin,options) => actualDeliverBusinessEmails(db,fakeProviderMail(mail),origin,options);
