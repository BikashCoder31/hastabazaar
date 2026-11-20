import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {observeRecoveryEmailContact,recordRecoveryContact,readRecoveryFollowup} from '../lib/payments/recovery-followup';
import {getSellerRecoveryReview,correctSellerRecoveryLiability,approveSellerRecovery} from '../lib/payments/seller-recovery';
import {submitRecoveryRepaymentClaim,supplyRecoveryRepaymentEvidence} from '../lib/payments/recovery-repayments';

void test('native simultaneous actual contact and provider observation retain one response clock without a financial mutation',async()=>{
 const f=await approvedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const actualAt=Date.now();
 // Documented fictional provider observation. No transport is invoked in this native test.
 f.sqlite.prepare("UPDATE notification_messages SET status='sent',sent_at=?,delivery_transport='provider' WHERE related_type='seller_recovery' AND related_id=? AND channel='email' AND audience_role='seller' AND subject_en='Recovery statement: approved'").run(actualAt,f.recoveryId);
 const originalLedger=f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n;
 target=await nativeFinanceClone(f.sqlite);
 const ctx=f.ctx('native-actual-contact','1'),input={caseId:f.recoveryId,actualAt,evidenceReference:'FICTIONAL-NATIVE-CONTACT-RECORD',reason:'Record the independently confirmed fictional itemized contact without resetting the first response clock.'};
 const results=await Promise.allSettled([observeRecoveryEmailContact(target.db,f.recoveryId),recordRecoveryContact(target.db,ctx,input)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2,JSON.stringify(results));
 const saved=await target.db.prepare('SELECT * FROM seller_recovery_response_windows WHERE case_id=?').bind(f.recoveryId).first();assert.ok(saved);
 assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM seller_recovery_response_windows').first<{n:number}>())!.n,1);
 await observeRecoveryEmailContact(target.db,f.recoveryId,Date.now()+8*86400000);
 await recordRecoveryContact(target.db,ctx,input);
 assert.deepEqual(await target.db.prepare('SELECT * FROM seller_recovery_response_windows WHERE case_id=?').bind(f.recoveryId).first(),saved);
 assert.equal((await target.db.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').bind(f.recoveryId).first<{revision:number}>())!.revision,1);
 assert.equal((await target.db.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').first<{n:number}>())!.n,originalLedger);
 }finally{await target?.dispose();f.dispose();}
});

void test('a native seller response racing fresh approval belongs to its actual committed approval cycle',async()=>{
 const f=await approvedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const claim=await submitRecoveryRepaymentClaim(f.db,{...f.ctx('native-cycle-old-claim','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:1000,paymentReference:'FICTIONAL-NATIVE-OLD-CLAIM',claimedAt:Date.now()-1000,accountVersionId:null,evidenceReference:null,note:'Retain an original reported payment with an unknown receiving account for Finance review.'});
 const before=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await correctSellerRecoveryLiability(f.db,f.ctx('native-response-correction','1'),{caseId:f.recoveryId,newConfirmedPaisa:50000,resolveDisputedPaisa:0,reviewDigest:before.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-RESPONSE-CORRECTION',reason:'Independently reduce this original responsibility before a new reviewed cap.',publicMessage:'Your responsibility is reduced. Finance will review the revised terms and remaining balance.'});
 const balance=f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n;
 target=await nativeFinanceClone(f.sqlite);const db=target.db,current=await getSellerRecoveryReview(db,'reviewer',f.recoveryId);
 const results=await Promise.allSettled([
  approveSellerRecovery(db,f.ctx('native-response-new-approval','2'),{caseId:f.recoveryId,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-RESPONSE-APPROVAL',reason:'Approve this exact corrected original cap with a prospective response notice.'}),
  supplyRecoveryRepaymentEvidence(db,{...f.ctx('native-response-further-evidence','0'),actorId:'registered-owner'},{caseId:f.recoveryId,claimId:claim.claimId,evidenceReference:null,note:'I am providing further current information about the originally reported payment.'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,2,JSON.stringify(results));
 const response=await db.prepare("SELECT case_revision FROM seller_recovery_claim_events WHERE request_id='native-response-further-evidence'").first<{case_revision:number}>();assert.ok(response);assert.ok([2,3].includes(response.case_revision));
 assert.equal((await readRecoveryFollowup(db,f.recoveryId)).needsResponse,response.case_revision<3);
 assert.equal((await db.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').bind(f.recoveryId).first<{revision:number}>())!.revision,3);
 assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').first<{n:number}>())!.n,balance);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
 }finally{await target?.dispose();f.dispose();}
});

void test('native contact races after corrected approval create one new cycle and retain the earlier deadline',async()=>{
 const f=await approvedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 await recordRecoveryContact(f.db,f.ctx('native-cycle-original-contact','1'),{caseId:f.recoveryId,actualAt:Date.now(),evidenceReference:'FICTIONAL-NATIVE-ORIGINAL-CONTACT',reason:'Retain the actual first contact before the corrected responsibility and new approval.'});
 const old=f.sqlite.prepare('SELECT * FROM seller_recovery_response_windows WHERE case_id=?').get(f.recoveryId)!;
 const original=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await correctSellerRecoveryLiability(f.db,f.ctx('native-cycle-correction','1'),{caseId:f.recoveryId,newConfirmedPaisa:50000,resolveDisputedPaisa:0,reviewDigest:original.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-CYCLE-RESPONSIBILITY',reason:'Independently reduce the original responsibility and require fresh reviewed terms.',publicMessage:'Your confirmed responsibility is reduced. A fresh reviewed notice will explain the remaining amount.'});
 const corrected=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await approveSellerRecovery(f.db,f.ctx('native-cycle-fresh-approval','2'),{caseId:f.recoveryId,reviewDigest:corrected.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-CYCLE-APPROVAL',reason:'Approve the exact reduced cap and a new prospective response notice.'});
 const event=f.sqlite.prepare("SELECT id,details_json FROM seller_recovery_events WHERE request_id='native-cycle-fresh-approval'").get()!,actualAt=Date.now();
 f.sqlite.prepare("UPDATE notification_messages SET status='sent',sent_at=?,delivery_transport='provider' WHERE request_id=?").run(actualAt,JSON.parse(String(event.details_json)).responseNotice.email);
 const balance=f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n;
 target=await nativeFinanceClone(f.sqlite);const db=target.db,ctx=f.ctx('native-cycle-current-contact','3'),input={caseId:f.recoveryId,actualAt,evidenceReference:'FICTIONAL-NATIVE-CURRENT-CONTACT',reason:'Actual current itemized contact is retained without resetting either original response clock.'};
 const results=await Promise.allSettled([observeRecoveryEmailContact(db,f.recoveryId),recordRecoveryContact(db,ctx,input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,2,JSON.stringify(results));
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_response_windows').first<{n:number}>())!.n,2);
 const saved=await db.prepare('SELECT * FROM seller_recovery_response_windows WHERE approval_event_id=?').bind(event.id).first();assert.ok(saved);assert.equal(saved.response_due_at,actualAt+7*86400000);
 assert.deepEqual(await db.prepare('SELECT * FROM seller_recovery_response_windows WHERE id=?').bind(old.id).first(),{...old});
 await observeRecoveryEmailContact(db,f.recoveryId);await recordRecoveryContact(db,ctx,input);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_response_windows').first<{n:number}>())!.n,2);
 assert.equal((await db.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').bind(f.recoveryId).first<{revision:number}>())!.revision,3);
 assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').first<{n:number}>())!.n,balance);
 }finally{await target?.dispose();f.dispose();}
});
