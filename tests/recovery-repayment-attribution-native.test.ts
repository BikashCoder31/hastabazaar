import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {approveRecoveryRepaymentAttribution} from '../lib/payments/recovery-repayment-attribution';
import {allocateSellerRecoveryReceipt,getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {openRefundObligation} from '../lib/payments/refund-obligations';
void test('native competing one-person attribution decisions bind actual credit once; allocation and excess original-payer return stay separate',async()=>{
 const f=await approvedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const credit=await recordBankReceipt(f.db,f.ctx('native-attribution-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-NATIVE-ATTRIBUTION-CREDIT',bankAt:Date.now()-1000,amountMinor:f.originalPaidPaisa+1000,currency:'NPR',payerReference:'Fictional third-party original payer',payerUserId:'customer',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-NATIVE-ATTRIBUTION-ACTUAL-PROOF',reason:'Verify this actual fictional third-party bank credit without relabelling its original payer.'});
 target=await nativeFinanceClone(f.sqlite);const db=target.db,review=await getSellerRecoveryReview(db,'reviewer',f.recoveryId),input={caseId:f.recoveryId,receiptId:credit.id,receiptRevision:0,amountPaisa:f.originalPaidPaisa,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-CASE-SPECIFIC-ATTRIBUTION',reason:'Review the actual original payer and exact case-specific debt cap with one eligible Super Admin.',publicMessage:'The actual credit is attributed to this case; allocation remains a separate decision.'};
 const results=await Promise.allSettled(['one','two'].map(key=>approveRecoveryRepaymentAttribution(db,f.ctx('native-attribution-'+key,'1'),input)));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 const winning=results[0].status==='fulfilled'?'one':'two';await approveRecoveryRepaymentAttribution(db,f.ctx('native-attribution-'+winning,'1'),input);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_attributions').first<{n:number}>())!.n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
 await allocateSellerRecoveryReceipt(db,f.ctx('native-attributed-allocation','2'),{caseId:f.recoveryId,receiptId:credit.id,receiptRevision:1,amountPaisa:f.originalPaidPaisa,method:'cash',evidenceReference:'FICTIONAL-NATIVE-ATTRIBUTED-ALLOCATION',reason:'Allocate only the actual approved amount against its existing original native debt once.'});
 const returned=await openRefundObligation(db,f.ctx('native-original-payer-excess-return'),{kind:'receipt_return',sourceId:credit.id,reason:'Review and return the remaining unused actual credit to its factual original payer only.'});
 assert.deepEqual(await db.prepare('SELECT customer_id,cash_paisa,state FROM refund_obligations WHERE id=?').bind(returned.id).first(),{customer_id:'customer',cash_paisa:1000,state:'open'});
 assert.equal((await db.prepare('SELECT payer_user_id payer FROM company_money_receipts WHERE id=?').bind(credit.id).first<{payer:string}>())!.payer,'customer');
 }finally{await target?.dispose();f.dispose();}
});
