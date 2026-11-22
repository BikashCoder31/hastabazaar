import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {getSellerRecoveryPlanTerms,proposeSellerRecoveryPlan,getSellerRecoveryReview,approveSellerRecoveryPlan,reviewSellerRecoveryProposal} from '../lib/payments/seller-recovery';

void test('native competing approval and change request retain exactly one decision and no money movement',async()=>{
 const f=await approvedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const terms=await getSellerRecoveryPlanTerms(f.db,'registered-owner',f.recoveryId),now=Date.now();
 const proposal=await proposeSellerRecoveryPlan(f.db,{...f.ctx('native-arrangement-proposal','1'),actorId:'registered-owner'},{caseId:f.recoveryId,termsDigest:terms.termsDigest,termsAccepted:true,nettingAuthorized:true,installments:[{amountPaisa:terms.terms.remainingPaisa,dueAt:now+7*86400000}],nextReviewAt:now+3*86400000,contactDetails:'Use my fictional verified seller account contact.'});
 const before=f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n;
 target=await nativeFinanceClone(f.sqlite);const db=target.db,view=await getSellerRecoveryReview(db,'reviewer',f.recoveryId);
 const common={caseId:f.recoveryId,proposalId:proposal.id,reviewDigest:view.reviewDigest,reason:'Independently review the exact currently proposed fictional arrangement.'};
 const changes={...common,decision:'changes_requested' as const,nextReviewAt:now+2*86400000,publicMessage:'Please submit revised dates. Finance will review your response by the stated next review date.'};
 const results=await Promise.allSettled([approveSellerRecoveryPlan(db,f.ctx('native-arrangement-approve','2'),common),reviewSellerRecoveryProposal(db,f.ctx('native-arrangement-changes','2'),changes)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM seller_recovery_events WHERE action IN('plan_reviewed','plan_approved')").first<{n:number}>())!.n,1);
 assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').first<{n:number}>())!.n,before);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
 const after=await getSellerRecoveryReview(db,'reviewer',f.recoveryId);assert.equal(after.case.revision,3);
 assert.equal(JSON.parse(after.case.planJson!).nettingAuthorized,results[0].status==='fulfilled');
 if(results[0].status==='fulfilled')assert.deepEqual(await approveSellerRecoveryPlan(db,f.ctx('native-arrangement-approve','2'),common),results[0].value);
 else if(results[1].status==='fulfilled')assert.deepEqual(await reviewSellerRecoveryProposal(db,f.ctx('native-arrangement-changes','2'),changes),results[1].value);
 }finally{await target?.dispose();f.dispose();}
});
