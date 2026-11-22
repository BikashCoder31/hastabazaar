import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {disputeSellerRecovery,getSellerRecoveryReview,upholdSellerRecoveryDispute} from '../lib/payments/seller-recovery';
void test('native competing dispute decisions consume one current reviewed portion with no money movement',async()=>{
 const f=await approvedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 await disputeSellerRecovery(f.db,{...f.ctx('native-dispute','1'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:1000,reason:'Review this original identified portion before any further collection.',evidenceReference:null});
 const before=f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').get()!.n;
 target=await nativeFinanceClone(f.sqlite);const review=await getSellerRecoveryReview(target.db,'reviewer',f.recoveryId);
 const input={caseId:f.recoveryId,amountPaisa:1000,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-DISPUTE-REVIEW',reason:'Independently establish the original responsibility and actual completed refund.',publicMessage:'The independently reviewed original records uphold this disputed portion. This decision does not record a repayment.'};
 const results=await Promise.allSettled([upholdSellerRecoveryDispute(target.db,f.ctx('native-uphold-a','2'),input),upholdSellerRecoveryDispute(target.db,f.ctx('native-uphold-b','2'),input)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1,JSON.stringify(results));
 assert.equal((await target.db.prepare("SELECT COUNT(*) n FROM seller_recovery_events WHERE action='dispute_upheld'").first<{n:number}>())!.n,1);
 assert.equal((await target.db.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries').first<{n:number}>())!.n,before);
 const after=await getSellerRecoveryReview(target.db,'reviewer',f.recoveryId);assert.equal(after.case.disputedPaisa,0);assert.equal(after.position.recoveredPaisa,0);assert.equal(after.case.revision,3);
 }finally{await target?.dispose();f.dispose();}
});
