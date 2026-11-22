import test from 'node:test';
import {checkoutCommitClock} from '../lib/checkout/commit-policy-guards';
const contactNow=async(db:D1Database)=>(await db.prepare(`SELECT ${checkoutCommitClock(db)} AS now`).first<{now:number}>())!.now;
import assert from 'node:assert/strict';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {getSellerRecoveryReview,correctSellerRecoveryLiability,approveSellerRecovery} from '../lib/payments/seller-recovery';
import {recordRecoveryContact,readRecoveryFollowup,observeRecoveryEmailContact} from '../lib/payments/recovery-followup';
import {submitRecoveryRepaymentClaim,supplyRecoveryRepaymentEvidence} from '../lib/payments/recovery-repayments';

void test('a corrected and freshly approved liability receives a new actual-contact clock without old reports or handoffs suppressing it',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const contact={caseId:f.recoveryId,actualAt:await contactNow(f.db),evidenceReference:'FICTIONAL-ORIGINAL-ACTUAL-CONTACT',reason:'Record actual original itemized contact before the later responsibility correction.'};
 await recordRecoveryContact(f.db,{...f.ctx('renewal-first-contact','1'),now:contact.actualAt},contact);
 const first=await readRecoveryFollowup(f.db,f.recoveryId);
 const claim=await submitRecoveryRepaymentClaim(f.db,{...f.ctx('renewal-old-payment-report','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:1000,paymentReference:'FICTIONAL-PRIOR-REPORTED-PAYMENT',claimedAt:Date.now()-1000,accountVersionId:f.accountVersionId,evidenceReference:null,note:'This old report remains a separate Finance review and is not an actual allocation.'});
 f.sqlite.prepare("UPDATE notification_messages SET status='sent',sent_at=?,delivery_transport='provider' WHERE related_type='seller_recovery' AND related_id=? AND channel='email' AND audience_role='seller'").run(Date.now(),f.recoveryId);
 const original=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await correctSellerRecoveryLiability(f.db,f.ctx('renewal-responsibility-correction','1'),{caseId:f.recoveryId,newConfirmedPaisa:50000,resolveDisputedPaisa:0,reviewDigest:original.reviewDigest,evidenceReference:'FICTIONAL-RENEWAL-ORIGINAL-RESPONSIBILITY',reason:'Reduce the original responsibility using the independently reviewed original evidence.',publicMessage:'The confirmed responsibility is reduced. Revised terms and contact will follow a fresh approval.'});
 const corrected=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await approveSellerRecovery(f.db,f.ctx('renewal-reviewed-cap','2'),{caseId:f.recoveryId,reviewDigest:corrected.reviewDigest,evidenceReference:'FICTIONAL-RENEWAL-REVIEWED-CAP',reason:'One eligible Super Admin approves the revised original cap and prospective itemized notice.'});
 const pending=await readRecoveryFollowup(f.db,f.recoveryId);assert.equal(pending.needsResponse,true);assert.equal(pending.responseDueAt,null);
 assert.equal(await observeRecoveryEmailContact(f.db,f.recoveryId),null,'The old successful email handoff is not delivery of the new notice.');
 const oldInbox=f.sqlite.prepare("SELECT inbox_message_id FROM seller_recovery_contacts WHERE request_id='renewal-first-contact'").get()!.inbox_message_id,wrongAt=await contactNow(f.db);
 assert.throws(()=>f.sqlite.prepare("INSERT INTO seller_recovery_contacts(id,case_id,notice_request_id,inbox_message_id,method,actor_id,actual_at,evidence_reference,reason,request_id,recorded_at) VALUES('wrong-renewal-contact',?,'renewal-reviewed-cap',?,'staff_contact','reviewer',?,'FICTIONAL-WRONG-NOTICE','An old inbox message cannot prove delivery of a different approval.','wrong-renewal-contact',?)").run(f.recoveryId,oldInbox,wrongAt,wrongAt),/itemized_contact|notice/i);
 const actualAt=await contactNow(f.db);await recordRecoveryContact(f.db,{...f.ctx('renewal-current-contact','3'),now:actualAt},{...contact,actualAt});
 const renewed=await readRecoveryFollowup(f.db,f.recoveryId);assert.equal(renewed.responseDueAt,actualAt+7*86400000);assert.ok(renewed.responseDueAt!>first.responseDueAt!);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_response_windows WHERE case_id=?').get(f.recoveryId)!.n,2);
 await recordRecoveryContact(f.db,f.ctx('renewal-current-contact','3'),{...contact,actualAt});assert.equal((await readRecoveryFollowup(f.db,f.recoveryId)).responseDueAt,renewed.responseDueAt);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 const statement=await (await import('../lib/payments/recovery-workspace')).getSellerRecoveryStatement(f.db,'registered-owner',f.recoveryId);
 assert.equal(statement.contacts.length,2);assert.equal(statement.contacts[1].responseDueAt,renewed.responseDueAt);
 assert.equal(JSON.stringify(statement).includes('FICTIONAL-ORIGINAL-ACTUAL-CONTACT'),false);
 await supplyRecoveryRepaymentEvidence(f.db,{...f.ctx('renewal-current-claim-response','0'),actorId:'registered-owner'},{caseId:f.recoveryId,claimId:claim.claimId,evidenceReference:null,note:'I am responding to the revised notice with further details about the earlier reported payment.'});
 assert.equal((await readRecoveryFollowup(f.db,f.recoveryId,actualAt+8*86400000)).needsResponse,false);
 }finally{f.dispose();}
});

void test('a retained legacy contact window is read in its original approval cycle and cannot be reset',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const e=f.sqlite.prepare("SELECT id,request_id FROM seller_recovery_events WHERE case_id=? AND action='approved'").get(f.recoveryId)!;
 const inbox=f.sqlite.prepare("SELECT id,created_at FROM notification_messages WHERE related_id=? AND recipient_user_id='registered-owner' AND channel='in_app' AND subject_en='Recovery statement: approved'").get(f.recoveryId)!,actualAt=await contactNow(f.db);
 f.sqlite.prepare("INSERT INTO seller_recovery_contacts(id,case_id,notice_request_id,inbox_message_id,method,actor_id,actual_at,evidence_reference,reason,request_id,recorded_at) VALUES('fictional-legacy-contact',?,?,?,'staff_contact','reviewer',?,'FICTIONAL-LEGACY-PROOF','Retained independently recorded itemized contact before response-cycle support.','fictional-legacy-contact',?)").run(f.recoveryId,e.request_id,inbox.id,actualAt,actualAt);
 const start=Math.max(actualAt,Number(inbox.created_at)),due=start+7*86400000;
 f.sqlite.prepare("INSERT INTO seller_recovery_contact_windows(case_id,contact_id,started_at,reminder_at,response_due_at,review_due_at,calendar_version) VALUES(?,'fictional-legacy-contact',?,?,?,?, 'continuous-v1')").run(f.recoveryId,start,start+3*86400000,due,due+86400000);
 const before=f.sqlite.prepare('SELECT * FROM seller_recovery_contact_windows WHERE case_id=?').get(f.recoveryId);
 assert.equal((await readRecoveryFollowup(f.db,f.recoveryId)).responseDueAt,due);
 const laterAt=await contactNow(f.db);
 await recordRecoveryContact(f.db,{...f.ctx('legacy-later-actual-contact','1'),now:laterAt},{caseId:f.recoveryId,actualAt:laterAt,evidenceReference:'FICTIONAL-LEGACY-LATER-CONTACT',reason:'Retain later contact without extending the original known response deadline.'});
 assert.equal((await readRecoveryFollowup(f.db,f.recoveryId)).responseDueAt,due);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_response_windows').get()!.n,0);
 assert.throws(()=>f.sqlite.prepare("INSERT INTO seller_recovery_response_windows(id,case_id,approval_event_id,contact_id,started_at,reminder_at,response_due_at,review_due_at,calendar_version) VALUES('duplicate-legacy-cycle',?,?,'fictional-legacy-contact',?,?,?,?,'continuous-v1')").run(f.recoveryId,e.id,start,start+3*86400000,due,due+86400000),/current_response_notice/);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_recovery_contact_windows WHERE case_id=?').get(f.recoveryId),before);
 }finally{f.dispose();}
});
