import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {disputeSellerRecovery,getSellerRecoveryReview} from '../lib/payments/seller-recovery';
void test('one eligible Super Admin can uphold an evidenced disputed portion without moving money or resetting the oldest unresolved review',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/seller-recovery',m=await import(path),followup=await import('../lib/payments/recovery-followup');
 const balance=f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n;
 await disputeSellerRecovery(f.db,{...f.ctx('first-dispute','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:1000,reason:'Review this identified original part of the approved liability.',evidenceReference:null});
 const firstTask=await followup.ensureRecoveryReviewWork(f.db,f.recoveryId);assert.ok(firstTask);
 const first=f.sqlite.prepare('SELECT source_revision,due_at FROM review_tasks WHERE id=?').get(firstTask)!;
 await disputeSellerRecovery(f.db,{...f.ctx('second-dispute','2'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:2000,reason:'Review another separately identified part of the original responsibility.',evidenceReference:null});
 assert.equal(await followup.ensureRecoveryReviewWork(f.db,f.recoveryId),firstTask);
 assert.deepEqual(f.sqlite.prepare('SELECT source_revision,due_at FROM review_tasks WHERE id=?').get(firstTask),first);
 const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),input={caseId:f.recoveryId,amountPaisa:1000,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-REVIEWED-ORIGINAL-RESPONSIBILITY',reason:'Original responsibility and actual refund independently support this disputed portion.',publicMessage:'We reviewed the original recorded responsibility and upheld this identified ten-rupee portion. The other disputed portion remains paused.'};
 await assert.rejects(m.upholdSellerRecoveryDispute(f.db,{...f.ctx('owner-cannot-decide','3'),actorId:'registered-owner'},input));
 const ctx=f.ctx('uphold-first-dispute','3'),saved=await m.upholdSellerRecoveryDispute(f.db,ctx,input);assert.deepEqual(await m.upholdSellerRecoveryDispute(f.db,ctx,input),saved);
 const current=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);assert.equal(current.case.disputedPaisa,2000);assert.equal(current.position.recoveredPaisa,0);assert.equal(current.position.collectiblePaisa,f.originalPaidPaisa-2000);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n,balance);
 const secondTask=await followup.ensureRecoveryReviewWork(f.db,f.recoveryId);assert.ok(secondTask);assert.notEqual(secondTask,firstTask);
 const secondEvent=f.sqlite.prepare("SELECT id,created_at FROM seller_recovery_events WHERE case_id=? AND request_id='second-dispute'").get(f.recoveryId)!;
 assert.equal(f.sqlite.prepare('SELECT due_at FROM review_tasks WHERE id=?').get(secondTask)!.due_at,Number(secondEvent.created_at)+86400000);
 const {listReviewTasks}=await import('../lib/workflows/review-tasks');assert.equal((await listReviewTasks(f.db,'reviewer')).find(task=>task.id===firstTask)?.status,'no_longer_needed');
 }finally{f.dispose();}
});
