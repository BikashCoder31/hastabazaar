import assert from 'node:assert/strict';
import test from 'node:test';
import {historicalPartialFixedFixture,payHistoricalPartialFixedBalance} from './helpers/historical-partial-fixed-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {readOriginalRecoveryPayoutProofs} from '../lib/payments/recovery-original-payouts';

void test('legacy fixed partial payment separates original unpaid cost from the additional actual deficit',async()=>{
 const f=await historicalPartialFixedFixture();try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('fixed-partial-original-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Reconcile the imported original partial payment, remaining original obligation and later approved defect.'});
  const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  assert.equal(review.source.blocker,null);assert.equal(review.case.confirmedPaisa,20000);
  const proof=await readOriginalRecoveryPayoutProofs(f.db,opened.id);assert.equal(proof.length,1);assert.equal(proof[0].originalPayoutPaisa,40000);
  assert.equal(review.source.originalUnpaidOffsetPaisa,40000);
 }finally{f.dispose();}
});

void test('fixed legacy mixed charge restores only its collected component, then its separate unpaid component, without revived debt after payment',async()=>{
 const {recordBankReceipt}=await import('../lib/payments/manual-receipts');
 const f=await historicalPartialFixedFixture();try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('fixed-mixed-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Review both the original unpaid deduction and additional deficit from the actual historical payment.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  await recovery.approveSellerRecovery(f.db,f.ctx('fixed-mixed-approved','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-FIXED-MIXED-ORIGINAL',reason:'Approve only the actual additional deficit after the separate original unpaid component is used.'});
  const receipt=await recordBankReceipt(f.db,f.ctx('fixed-mixed-bank'),{accountVersionId:f.sources.accountVersionId,transactionIdentity:'FICTIONAL-FIXED-MIXED-CASH',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Fictional original supplier',payerUserId:review.source.ownerId,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-FIXED-MIXED-ACTUAL-CREDIT',reason:'Verify the actual fictional seller repayment for only the additional original deficit.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('fixed-mixed-cash','1'),{caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash',environment:f.environment,evidenceReference:'FICTIONAL-FIXED-MIXED-ALLOCATION',reason:'Settle the existing additional deficit once, leaving the original unpaid charge separately explained.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  await recovery.correctSellerRecoveryLiability(f.db,f.ctx('fixed-mixed-collected-correction','2'),{caseId:opened.id,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,environment:f.environment,evidenceReference:'FICTIONAL-FIXED-MIXED-CORRECTION',reason:'New evidence overturns the collected deficit; restore the actual earlier seller repayment.',publicMessage:'Your repayment is restored. The original unpaid charge remains separately recorded.'});
  await payHistoricalPartialFixedBalance(f,'fixed-mixed-repayment-restored',20000);
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  assert.equal(review.source.confirmedPaisa,0);assert.equal(review.source.exposurePaisa,0);assert.equal(review.source.originalUnpaidOffsetPaisa,40000);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.source.blocker,null);
  await recovery.correctUnpaidSellerRecoverySource(f.db,f.ctx('fixed-mixed-unpaid-correction',String(review.case.revision)),{caseId:opened.id,newUnpaidResponsibilityPaisa:0,reviewDigest:review.reviewDigest,environment:f.environment,evidenceReference:'FICTIONAL-FIXED-MIXED-UNPAID-CORRECTION',reason:'Separately overturn only the original unpaid component, without restoring the collected component twice.',publicMessage:'The remaining original unpaid charge is removed and restored to your payable balance.'});
  await payHistoricalPartialFixedBalance(f,'fixed-mixed-unpaid-restored',40000);
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  assert.equal(review.source.confirmedPaisa,0);assert.equal(review.source.blocker,null);assert.equal(review.case.confirmedPaisa,0);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.source.unpaidResponsibilityRestoredPaisa,40000);
  assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_supplier_payments WHERE id=?').get(f.payoutId)!.amount_paisa,40000);
 }finally{f.dispose();}
});

void test('carrier coverage of the legacy fixed unpaid component leaves the additional deficit separate and payable only once',async()=>{
 const {recordBankReceipt}=await import('../lib/payments/manual-receipts');
 const f=await historicalPartialFixedFixture();try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('fixed-partial-carrier-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Review actual carrier coverage separately for the original unpaid component and the additional deficit.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.carrierUnpaidAvailablePaisa,40000);
  const receipt=await recordBankReceipt(f.db,f.ctx('fixed-partial-carrier-bank'),{accountVersionId:f.sources.accountVersionId,transactionIdentity:'FICTIONAL-FIXED-PARTIAL-CARRIER',bankAt:Date.now()-1,amountMinor:60000,currency:'NPR',payerReference:'Fictional carrier for original supplier cost',payerUserId:null,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-FIXED-PARTIAL-CARRIER-BANK',reason:'Verify the actual fictional carrier credit for the complete original cost, retaining distinct unpaid and deficit components.'});
  const common={caseId:opened.id,receiptId:receipt.id,environment:f.environment,evidenceReference:'FICTIONAL-FIXED-PARTIAL-CARRIER-PROOF',reason:'Match the exact original component against one actual carrier credit without duplicating or reclassifying seller recovery.',publicMessage:'Carrier coverage of your original unpaid charge is recorded separately from the remaining deficit.'};
  await recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(f.db,f.ctx('fixed-partial-carrier-unpaid','0'),{...common,receiptRevision:0,reviewDigest:review.reviewDigest,amountPaisa:40000,originalUnpaidCostConfirmed:true});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.confirmedPaisa,20000);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.source.carrierUnpaidAvailablePaisa,0);assert.equal(review.case.restoredPaisa,40000);
  await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('fixed-partial-carrier-deficit','1'),{...common,receiptRevision:1,reviewDigest:review.reviewDigest,amountPaisa:20000,resolveDisputedPaisa:0,originalCostReimbursementConfirmed:true});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.position.remainingPaisa,0);assert.equal(review.position.recoveredPaisa,20000);
  await payHistoricalPartialFixedBalance(f,'fixed-partial-carrier-restored',40000);
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.confirmedPaisa,20000);assert.equal(review.source.blocker,null);assert.equal(review.position.remainingPaisa,0);assert.equal(review.source.carrierUnpaidCoveredPaisa,40000);
 }finally{f.dispose();}
});

void test('an initially uncertain retained original supplier transfer becomes original paid money when its actual bank outcome is confirmed',async()=>{
 const {fixedRecoveryFixture}=await import('./helpers/fixed-recovery-fixture');const transfers=await import('../lib/payments/payout-transfers');
 const f=await fixedRecoveryFixture('uncertain');try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('fixed-uncertain-basis-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Retain the original uncertain instruction while showing only provisional recovery exposure.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.confirmedPaisa,0);assert.ok(review.source.blocker);assert.equal(review.source.originalUnpaidOffsetPaisa,0);
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('fixed-uncertain-bank-confirmed','3'),{packetId:f.packetId,environment:f.environment,outcome:'paid',amountPaisa:80000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-FIXED-LATE-CONFIRMED-BANK',evidenceReference:'FICTIONAL-FIXED-LATE-ACTUAL-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'The original uncertain instruction actually completed; record its original amount truthfully before recovery review.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.confirmedPaisa,20000);assert.equal(review.source.originalUnpaidOffsetPaisa,0);assert.ok((review.source.carrierUnpaidAvailablePaisa??0)<=0);assert.equal(review.source.blocker,null);
 }finally{f.dispose();}
});
