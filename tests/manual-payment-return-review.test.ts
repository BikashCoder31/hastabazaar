import assert from 'node:assert/strict';
import test from 'node:test';
import {completedReceiptReturnFixture} from './helpers/completed-receipt-return-fixture';
import {getManualPaymentWorkspace} from '../lib/payments/manual-payment-workspace';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {getCustomerRefundWorkspace,getRefundFinanceWorkspace,resolveReceiptReturnFinanceNotice} from '../lib/payments/refund-workspace';

void test('Finance exposes actual incoming reversal review even when the original-payer return has no seller recovery case',async()=>{
 const f=await completedReceiptReturnFixture();try{
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_cases').get()!.n,0);
  const workspace=await getManualPaymentWorkspace(f.db,f.ctx('read-return-review').actorId);
  const receipt=workspace.receipts.find(row=>row.id===f.receiptId)!;
  assert.ok(receipt,'The original actual credit remains in Finance history.');
  assert.deepEqual((receipt as typeof receipt&{reversals:unknown[]}).reversals,[{id:f.reversalId,amountPaisa:4000,completed:false}]);
  const review=await getRecoveryReceiptReversalReview(f.db,f.ctx('read-paid-return-loss').actorId,f.reversalId);
  await reconcileRecoveryReceiptReversal(f.db,f.ctx('approve-paid-return-loss',String(review.receiptRevision)),{reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],completedReturns:[{receiptUseId:f.receiptUseId,packetId:f.returnPacketId,amountPaisa:4000}],companyLossApproved:true,evidenceReference:'FICTIONAL-EXACT-COMPLETED-RETURN-LOSS',reason:'Approve the actual bank loss behind this independently completed original payer return.',publicMessage:'The completed original return remains paid and the company records the later bank cost.'});
  const after=(await getManualPaymentWorkspace(f.db,f.ctx('read-reconciled-return').actorId)).receipts.find(row=>row.id===f.receiptId)!;
  assert.equal(after.unallocatedMinor,0,'Company funding must not create spendable original receipt money.');
  assert.equal(after.unresolvedExposureMinor,0,'A completed explicit company loss must not retain a false bank-backing deficit.');
  assert.equal(after.reversalHold,0);
  const lossId=String(f.sqlite.prepare('SELECT id FROM receipt_return_bank_losses').get()!.id);
  assert.equal(await resolveReceiptReturnFinanceNotice(f.db,f.ctx('read-notice').actorId,'loss',lossId),f.returnObligationId);
  assert.equal(await resolveReceiptReturnFinanceNotice(f.db,f.ctx('read-missing-notice').actorId,'loss','missing-fictional-loss'),null);
  await assert.rejects(resolveReceiptReturnFinanceNotice(f.db,'customer','loss',lossId));
  assert.deepEqual(after.reversals,[{id:f.reversalId,amountPaisa:4000,completed:true}]);
 }finally{f.dispose();}
});

void test('a partially bank-satisfied original return has an exact Finance destination and truthful remaining customer cash',async()=>{
 const f=await completedReceiptReturnFixture('prepared');try{
  const actorId=f.ctx('read-blocked-return').actorId;
  const before=await getRecoveryReceiptReversalReview(f.db,actorId,f.reversalId);
  assert.ok(before.reservedReturnCandidates.find(row=>row.receiptUseId===f.receiptUseId)?.blockedReason);
  const destination=await getRefundFinanceWorkspace(f.db,actorId,undefined,f.returnObligationId);
  assert.deepEqual(destination.obligations.map(row=>row.id),[f.returnObligationId]);
  await f.m.voidUnsentRefundPacket(f.db,f.ctx('retire-unexecuted-return','0'),{packetId:f.returnPacketId,notSentConfirmed:true,evidenceReference:'FICTIONAL-UNEXECUTED-RETURN-CONFIRMATION',reason:'The original return instruction was never sent and its funding reservation can be released.'});
  const review=await getRecoveryReceiptReversalReview(f.db,actorId,f.reversalId);
  await reconcileRecoveryReceiptReversal(f.db,f.ctx('recognize-direct-bank-return',String(review.receiptRevision)),{reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],reservedReturns:[{receiptUseId:f.receiptUseId,amountPaisa:4000,originalPayerReturnedConfirmed:true}],evidenceReference:'FICTIONAL-EXACT-ORIGINAL-PAYER-BANK-RETURN',reason:'The bank independently returned exactly this amount directly to the original payer with no outgoing payment.',publicMessage:'The bank returned NPR 40 directly and NPR 60 remains for the original return.'});
  const customer=(await getCustomerRefundWorkspace(f.db,'customer')).find(row=>row.id===f.returnObligationId)!;
  const finance=(await getRefundFinanceWorkspace(f.db,actorId,undefined,f.returnObligationId)).obligations[0];
  for(const row of [customer,finance]){
   assert.equal(row.originalCashPaisa,10000);assert.equal(row.bankSatisfiedPaisa,4000);assert.equal(row.cashPaisa,6000);assert.equal(row.state,'open');
  }
  assert.equal((await getManualPaymentWorkspace(f.db,actorId)).receipts.find(row=>row.id===f.receiptId)!.unresolvedExposureMinor,0);
  const satisfactionId=String(f.sqlite.prepare('SELECT id FROM receipt_return_bank_satisfactions').get()!.id);
  assert.equal(await resolveReceiptReturnFinanceNotice(f.db,actorId,'satisfaction',satisfactionId),f.returnObligationId);
 }finally{f.dispose();}
});
