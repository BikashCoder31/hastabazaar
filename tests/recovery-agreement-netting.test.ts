import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';

void test('explicit seller accepted terms and one Super Admin decision authorize only bounded same-model eligible earnings with no second debt',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/seller-recovery';const m=await import(path);
 const owner=(key:string,revision:string|null=null)=>({...f.ctx(key,revision),actorId:'registered-owner'});
 const terms=await m.getSellerRecoveryPlanTerms(f.db,'registered-owner',f.recoveryId);
 const input={caseId:f.recoveryId,termsDigest:terms.termsDigest,termsAccepted:true,nettingAuthorized:true,installments:[{amountPaisa:f.originalPaidPaisa,dueAt:Date.now()+7*86400000}],contactDetails:'Reach me through my verified seller account inbox.',nextReviewAt:Date.now()+3*86400000};
 await assert.rejects(m.proposeSellerRecoveryPlan(f.db,owner('no-acceptance','1'),{...input,termsAccepted:false}));
 const proposal=await m.proposeSellerRecoveryPlan(f.db,owner('accepted-case-terms','1'),input);
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await m.approveSellerRecoveryPlan(f.db,f.ctx('approve-case-plan','2'),{caseId:f.recoveryId,proposalId:proposal.id,reviewDigest:review.reviewDigest,reason:'Approve the explicitly accepted schedule and bounded earnings authority for the original same-model debt.'});
 f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('later-earned','registered','sale',50000,1,'Fictional later eligible earnings',1),('still-held','registered','sale',40000,?,'Fictional not-yet-eligible earnings',1)").run(Date.now()+86400000);
 const before=Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n);
 const applied=await m.applySellerRecoveryEarnings(f.db,f.ctx('deterministic-netting','3'),{caseId:f.recoveryId});
 assert.equal(applied.amountPaisa,50000);assert.deepEqual(await m.applySellerRecoveryEarnings(f.db,f.ctx('deterministic-netting','3'),{caseId:f.recoveryId}),applied);
 const after=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(after.position.recoveredPaisa,50000);assert.equal(after.position.remainingPaisa,f.originalPaidPaisa-50000);
 assert.equal(Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n),before,'The existing native adjustment is linked, not charged again.');
 await assert.rejects(m.applySellerRecoveryEarnings(f.db,f.ctx('cannot-net-held-or-used','4'),{caseId:f.recoveryId}));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_proposals').get()!.n,1);
 }finally{f.dispose();}
});
