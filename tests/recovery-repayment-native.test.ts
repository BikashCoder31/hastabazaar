import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {submitRecoveryRepaymentClaim,reviewRecoveryRepaymentClaim,ensureRecoveryRepaymentWork} from '../lib/payments/recovery-repayments';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';

void test('native duplicate claims and competing actual-receipt reviews retain one report, one decision and unchanged money',async()=>{
 const f=await approvedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const receipt=await recordBankReceipt(f.db,f.ctx('native-claim-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-NATIVE-CLAIM-CREDIT',bankAt:Date.now()-1000,amountMinor:1000,currency:'NPR',payerReference:'Original fictional registered seller',payerUserId:'registered-owner',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-NATIVE-CLAIM-PROOF',reason:'Independently verify this original actual fictional seller bank credit.'});
 target=await nativeFinanceClone(f.sqlite);const db=target.db,input={caseId:f.recoveryId,amountPaisa:1000,paymentReference:'FICTIONAL-NATIVE-CLAIM-REFERENCE',claimedAt:Date.now()-1000,accountVersionId:f.accountVersionId,evidenceReference:null,note:'Inspect this reported original transfer against the independently recorded bank credit.'};
 const submissions=await Promise.allSettled(['one','two'].map(key=>submitRecoveryRepaymentClaim(db,{...f.ctx('native-claim-'+key,'1'),actorId:'registered-owner'},input)));
 assert.equal(submissions.filter(r=>r.status==='fulfilled').length,1);
 const saved=submissions.find((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof submitRecoveryRepaymentClaim>>>=>r.status==='fulfilled')!.value;
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_claims').first<{n:number}>())!.n,1);
 const other=await submitRecoveryRepaymentClaim(db,{...f.ctx('native-distinct-duplicate-report','1'),actorId:'registered-owner'},{...input,paymentReference:'FICTIONAL-SECOND-REPORT-ONE-BANK-CREDIT'});
 const review=await getSellerRecoveryReview(db,'reviewer',f.recoveryId),decision={caseId:f.recoveryId,claimId:saved.claimId,decision:'receipt_verified' as const,receiptId:receipt.id,receiptRevision:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-INDEPENDENT-MATCH',reason:'Review the exact current original account, amount, currency, payer and allocations.',publicMessage:'The actual credit is matched; approved allocation remains separate and no claim itself clears the balance.',nextReviewAt:null};
 const ids=[saved.claimId,other.claimId],decisions=await Promise.allSettled(['one','two'].map((key,index)=>reviewRecoveryRepaymentClaim(db,f.ctx('native-claim-reviewed-'+key,'0'),{...decision,claimId:ids[index]})));
 assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);
 const winning=decisions[0].status==='fulfilled'?'one':'two';
 await reviewRecoveryRepaymentClaim(db,f.ctx('native-claim-reviewed-'+winning,'0'),{...decision,claimId:ids[winning==='one'?0:1]});
 const unresolved=ids[winning==='one'?1:0];await ensureRecoveryRepaymentWork(db,unresolved);
 assert.equal((await db.prepare("SELECT owner_id AS owner FROM review_tasks WHERE source_type='recovery_claim' AND source_id=?").bind(unresolved).first<{owner:string}>())!.owner,'reviewer');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_claims').first<{n:number}>())!.n,2);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_claim_events').first<{n:number}>())!.n,3);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
 assert.equal((await db.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').bind(f.recoveryId).first<{revision:number}>())!.revision,1);
 assert.equal((await db.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').bind(receipt.id).first<{revision:number}>())!.revision,0);
 }finally{await target?.dispose();f.dispose();}
});
