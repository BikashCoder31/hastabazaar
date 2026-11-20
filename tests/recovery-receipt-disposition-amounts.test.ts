import assert from 'node:assert/strict';
import test from 'node:test';
import {recoveryReceiptReversalAmounts} from '../lib/payments/recovery-receipt-disposition';
void test('actual incoming reversal separates still-valid original debt from already restored money',()=>{
 assert.deepEqual(recoveryReceiptReversalAmounts({originalAllocatedPaisa:20000,alreadyReversedPaisa:0,currentlyRestoredPaisa:0,reversedPaisa:10000,companyLossApproved:false}),{actualAllocatedPaisa:10000,restoredPaisa:0,restorationReclassifiedPaisa:0,companyLossPaisa:0,nativeSettlementDebitPaisa:10000,nativeCompanyCreditPaisa:0,reopenedOriginalPaisa:10000});
 assert.throws(()=>recoveryReceiptReversalAmounts({originalAllocatedPaisa:20000,alreadyReversedPaisa:0,currentlyRestoredPaisa:20000,reversedPaisa:10000,companyLossApproved:false}),/explicit company-loss/);
 const restored=recoveryReceiptReversalAmounts({originalAllocatedPaisa:20000,alreadyReversedPaisa:0,currentlyRestoredPaisa:15000,reversedPaisa:10000,companyLossApproved:true});
 assert.equal(restored.actualAllocatedPaisa,10000);assert.equal(restored.restoredPaisa,10000);assert.equal(restored.restorationReclassifiedPaisa,5000);assert.equal(restored.companyLossPaisa,5000);assert.equal(restored.reopenedOriginalPaisa,5000);assert.equal(restored.nativeSettlementDebitPaisa-restored.nativeCompanyCreditPaisa,5000);
 for(const n of [-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>recoveryReceiptReversalAmounts({originalAllocatedPaisa:20000,alreadyReversedPaisa:0,currentlyRestoredPaisa:0,reversedPaisa:n,companyLossApproved:false}));
 assert.throws(()=>recoveryReceiptReversalAmounts({originalAllocatedPaisa:20000,alreadyReversedPaisa:19000,currentlyRestoredPaisa:0,reversedPaisa:1001,companyLossApproved:false}),/remaining actual/);
});
