import {getManualPaymentWorkspace} from '../lib/payments/manual-payment-workspace';
import {openRefundObligation,getRefundObligation} from '../lib/payments/refund-obligations';
import {getSellerRecoveryStatement,getRecoveryFinanceWorkspace} from '../lib/payments/recovery-workspace';
import {runRecoveryCommand,recoverRecoveryCommand,parseRecoveryCommand} from '../lib/payments/recovery-commands';
import {recoveryReceiptReversalFixture} from './helpers/recovery-receipt-reversal-fixture';
import * as disposition from '../lib/payments/recovery-receipt-disposition';
import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {recordReceiptReversal} from '../lib/payments/receipt-corrections';
import * as recovery from '../lib/payments/seller-recovery';

void test('actual partial repayment reversal can be attributed once and restores only the still-valid original outstanding debt',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const receipt=await recordBankReceipt(f.db,f.ctx('disposition-original-receipt'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-REVERSAL-DISPOSITION-ORIGINAL',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Fictional registered seller',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-REVERSAL-DISPOSITION-RECEIPT',reason:'Verify the actual fictional original repayment before assigning it to the retained original recovery.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('disposition-original-allocate','1'),{caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash',evidenceReference:'FICTIONAL-REVERSAL-DISPOSITION-RECEIPT',reason:'Allocate the actual original repayment once against the existing approved original deficit.'});
  const allocationId=String(f.sqlite.prepare('SELECT id FROM seller_recovery_allocations WHERE receipt_id=?').get(receipt.id)!.id);
  const reversed=await recordReceiptReversal(f.db,f.ctx('disposition-actual-reversal','1'),{receiptId:receipt.id,amountMinor:10000,transactionIdentity:'FICTIONAL-REVERSAL-DISPOSITION-RETURN',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-REVERSAL-DISPOSITION-BANK',reason:'The bank actually reversed half the original incoming payment; retain this fact before assigning its consequences.'});
  const held=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);assert.equal(held.position.collectiblePaisa,0);assert.equal(held.unreconciledReceiptPaisa,20000);
  const path='../lib/payments/recovery-receipt-disposition';const disposition=await import(path);
  const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',reversed.id);
  const input={reversalId:reversed.id,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId,amountPaisa:10000}],evidenceReference:'FICTIONAL-REVERSAL-DISPOSITION-ATTRIBUTION',reason:'Attribute exactly the actual reversed credit to this original allocation; the original seller responsibility remains valid.',publicMessage:'The bank reversed NPR 100 of your original repayment. NPR 100 remains received; only the still-valid original unpaid balance is reopened.'};
  const before=Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n),ctx=f.ctx('disposition-reversal-approved',String(review.receiptRevision));
  const saved=await disposition.reconcileRecoveryReceiptReversal(f.db,ctx,input);assert.deepEqual(await disposition.reconcileRecoveryReceiptReversal(f.db,ctx,input),saved);
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
  assert.equal(after.unreconciledReceiptPaisa,0);assert.equal(after.position.recoveredPaisa,10000);assert.equal(after.position.remainingPaisa,f.originalPaidPaisa-10000);assert.equal(after.position.collectiblePaisa,f.originalPaidPaisa-10000);
  assert.equal(Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n),before-10000);
  assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM seller_recovery_allocations WHERE id=?').get(allocationId)!.amount_paisa,20000,'Retain the original allocation fact.');
  assert.equal(f.sqlite.prepare('SELECT amount_minor FROM company_receipt_reversals WHERE id=?').get(reversed.id)!.amount_minor,10000);
  const replacement=await recordBankReceipt(f.db,f.ctx('disposition-replacement-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-REVERSAL-REPLACEMENT-CREDIT',bankAt:Date.now()-1,amountMinor:after.position.remainingPaisa,currency:'NPR',payerReference:'Fictional registered seller',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-REVERSAL-REPLACEMENT-PROOF',reason:'Verify a new actual incoming repayment of precisely the still-valid remaining original liability.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('disposition-replacement-allocated',String(after.case.revision)),{caseId:f.recoveryId,receiptId:replacement.id,receiptRevision:0,amountPaisa:after.position.remainingPaisa,method:'cash',evidenceReference:'FICTIONAL-REVERSAL-REPLACEMENT-PROOF',reason:'Complete only the actual outstanding original liability with this separate verified bank credit.'});
  const settled=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);assert.equal(settled.position.recoveredPaisa,f.originalPaidPaisa);assert.equal(settled.position.remainingPaisa,0);assert.equal(settled.position.collectiblePaisa,0);

 }finally{f.dispose();}
});

for(const model of ['registered','managed','fixed'] as const)void test(`${model} already restored repayment needs explicit company loss and cannot become a new seller debt`,async()=>{
 const f=await recoveryReceiptReversalFixture(model,true);try{
  const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId),env=f.environment?{environment:f.environment}:{};
  const input={reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocationId,amountPaisa:10000}],...env,evidenceReference:'FICTIONAL-RESTORED-RECEIPT-REVERSAL-LOSS',reason:'Review the actual bank reversal after original responsibility was removed and the repayment already restored.',publicMessage:'The company covers this reversed portion of the already restored repayment. Your original liability remains zero.'};
  await assert.rejects(disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx('restored-reversal-no-loss',String(review.receiptRevision)),input),/explicit company-loss/);
  const approved={...input,allocations:[{...input.allocations[0],companyLossApproved:true}]};
  await disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx('restored-reversal-loss-approved',String(review.receiptRevision)),approved);
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(after.unreconciledReceiptPaisa,0);assert.equal(after.source.confirmedPaisa,0);assert.equal(after.position.recoveredPaisa,0);assert.equal(after.position.remainingPaisa,0);assert.equal(after.position.collectiblePaisa,0);
  const statement=await getSellerRecoveryStatement(f.db,after.source.ownerId,f.caseId);assert.equal(statement.restoredPaisa,20000);assert.equal(statement.receiptCompanyLossPaisa,10000);assert.equal(statement.receiptReversedPaisa,10000);assert.ok(statement.events.some(event=>event.action==='receipt_reversal_reconciled'));
  assert.equal(f.sqlite.prepare('SELECT SUM(company_loss_paisa) n FROM seller_recovery_receipt_reversal_parts').get()!.n,10000);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_all_restorations WHERE case_id=?').get(f.caseId)!.n,10000);
 }finally{f.dispose();}
});

void test('protected reversal command retains its exact outcome and rejects seller access or malformed nested allocations',async()=>{
 const f=await recoveryReceiptReversalFixture('registered');try{
  const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId),input={reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocationId,amountPaisa:10000,companyLossApproved:false}],evidenceReference:'FICTIONAL-PROTECTED-REVERSAL',reason:'Attribute the actual bank return once through the protected current finance form.',publicMessage:'The bank reversed part of the repayment. Your remaining original responsibility is shown with the corrected actual receipt.'},body={sourceFormId:'system.recovery-finance',action:'receipt_reversal',requestId:'protected-reversal-actual',expectedRevision:String(review.receiptRevision),input};
  assert.throws(()=>parseRecoveryCommand({...body,sourceFormId:'system.recovery-seller'},'seller'));
  assert.throws(()=>parseRecoveryCommand({...body,input:{...input,allocations:[{...input.allocations[0],caseId:f.caseId}]}},'staff'));
  await assert.rejects(disposition.getRecoveryReceiptReversalReview(f.db,review.cases[0].source.ownerId,f.reversalId));
  const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);assert.deepEqual(await runRecoveryCommand(f.db,'reviewer',body,'staff'),result);
  await assert.rejects(f.db.prepare("INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,available_at,description,created_at) SELECT 'forged-bank-loss',seller_id,order_item_id,'recovery_bank_loss',10000,1,'Invented bank loss',1 FROM seller_ledger_entries WHERE type='sale' LIMIT 1").run(),/native_plan_required/);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer'").run();await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'));await assert.rejects(runRecoveryCommand(f.db,'reviewer',body,'staff'));

  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE receipt_id=? AND kind='receipt_reversal' AND state<>'resolved'").get(f.receiptId)!.n,0);
 }finally{f.dispose();}
});

void test('each actual bank reversal must be attributed before the original receipt hold clears; full reversal preserves original liability',async()=>{
 const f=await recoveryReceiptReversalFixture('registered');try{
  const second=await recordReceiptReversal(f.db,f.ctx('second-actual-reversal','2'),{receiptId:f.receiptId,amountMinor:10000,transactionIdentity:'FICTIONAL-SECOND-RECEIPT-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-SECOND-REVERSAL-PROOF',reason:'The remaining original credit was also actually reversed by the fictional bank.'});
  for(const [index,id] of [f.reversalId,second.id].entries()){
   const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',id);
   await disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx('multiple-reversal-'+index,String(review.receiptRevision)),{reversalId:id,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocationId,amountPaisa:10000}],evidenceReference:'FICTIONAL-MULTIPLE-REVERSAL-ATTRIBUTION',reason:'Independently reconcile this actual reversal against the still-unattributed part of the original allocation.',publicMessage:'An actual bank reversal is attributed to the original repayment without changing your original responsibility.'});
   const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(current.unreconciledReceiptPaisa,index===0?20000:0);assert.equal(current.position.collectiblePaisa,index===0?0:f.originalConfirmedPaisa);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE receipt_id=? AND kind='receipt_reversal' AND state<>'resolved'").get(f.receiptId)!.n,index===0?1:0);
  }
 }finally{f.dispose();}
});
void test('bank attribution preserves an independent hold on the original recovery',async()=>{
 const f=await recoveryReceiptReversalFixture('registered');try{
  f.sqlite.prepare("UPDATE seller_recovery_cases SET blocker='A separate original evidence review remains open.',revision=revision+1 WHERE id=?").run(f.caseId);
  const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId);
  await disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx('reversal-with-independent-hold',String(review.receiptRevision)),{reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocationId,amountPaisa:10000}],evidenceReference:'FICTIONAL-INDEPENDENT-HOLD-PROOF',reason:'Correct the actual reversed receipt while preserving the independent original evidence review.',publicMessage:'The bank reversal is reconciled. The separate original evidence review remains open.'});
  const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(current.case.blocker,'A separate original evidence review remains open.');assert.equal(current.case.state,'reconciliation');assert.equal(current.position.collectiblePaisa,0);
 }finally{f.dispose();}
});

void test('an actual reversal of originally unallocated credit preserves every collected original allocation',async()=>{
 const f=await recoveryReceiptReversalFixture('registered',false,30000);try{
  const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId),input={reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:10000,allocations:[],evidenceReference:'FICTIONAL-UNALLOCATED-REVERSAL',reason:'The bank reversal concerns only the original unallocated excess; the retained original repayment remains received.',publicMessage:'The original unallocated excess was returned by the bank. Your allocated repayment is unchanged.'};
  await assert.rejects(disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx('unallocated-excess-rejected',String(review.receiptRevision)),{...input,unallocatedPaisa:10001}));
  await disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx('unallocated-return-approved',String(review.receiptRevision)),input);
  const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(current.position.recoveredPaisa,20000);assert.equal(current.position.remainingPaisa,f.originalConfirmedPaisa-20000);assert.equal(current.unreconciledReceiptPaisa,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_parts').get()!.n,0);
 }finally{f.dispose();}
});

void test('allocated money reversed by the bank does not consume the original unused credit a second time',async()=>{
 const f=await recoveryReceiptReversalFixture('registered',false,30000);try{
  const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId);
  await disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx('allocated-return-keeps-unused',String(review.receiptRevision)),{reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocationId,amountPaisa:10000}],evidenceReference:'FICTIONAL-ALLOCATED-REVERSAL-ONLY',reason:'Attribute the actual bank reversal only to the original allocated amount and preserve the unrelated unused credit.',publicMessage:'Part of the allocated repayment was reversed. The original unused credit remains available for its own authorized disposition.'});
  const finance=await getRecoveryFinanceWorkspace(f.db,'reviewer',f.caseId);assert.equal(finance.cases[0].receipts.find(r=>r.id===f.receiptId)!.remainingPaisa,10000);
  const workspace=await getManualPaymentWorkspace(f.db,'reviewer');assert.equal(workspace.receipts.find(r=>r.id===f.receiptId)!.unallocatedMinor,10000);
  const returned=await openRefundObligation(f.db,f.ctx('original-unused-return'),{kind:'receipt_return',sourceId:f.receiptId,reason:'Return only the original unused actual credit to its independently verified original payer.'});
  assert.equal((await getRefundObligation(f.db,returned.id))!.cashPaisa,10000);
 }finally{f.dispose();}
});

void test('later liability correction restores only the still-received allocation after another receipt fully reverses',async()=>{
 const f=await recoveryReceiptReversalFixture('registered');try{
  async function attribute(id:string,allocationId:string,amountPaisa:number,key:string){const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',id);await disposition.reconcileRecoveryReceiptReversal(f.db,f.ctx(key,String(review.receiptRevision)),{reversalId:id,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId,amountPaisa}],evidenceReference:'FICTIONAL-MULTIPLE-RECEIPT-DISPOSITION',reason:'Attribute the exact actual return against this original allocation and no other money.',publicMessage:'The actual bank return is reconciled against the original repayment.'});}
  await attribute(f.reversalId,f.allocationId,10000,'first-actual-attribution');
  const second=await recordBankReceipt(f.db,f.ctx('second-original-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-SECOND-ORIGINAL-CREDIT',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Fictional registered seller',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-SECOND-ORIGINAL-CREDIT-PROOF',reason:'Verify another actual original repayment independently before applying it to the same outstanding debt.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('second-original-allocation','4'),{caseId:f.caseId,receiptId:second.id,receiptRevision:0,amountPaisa:20000,method:'cash',evidenceReference:'FICTIONAL-SECOND-ORIGINAL-CREDIT-PROOF',reason:'Apply the second actual payment to the remaining original responsibility.'});
  const allocationId=String(f.sqlite.prepare('SELECT id FROM seller_recovery_allocations WHERE receipt_id=?').get(second.id)!.id),reversed=await recordReceiptReversal(f.db,f.ctx('second-complete-return','1'),{receiptId:second.id,amountMinor:20000,transactionIdentity:'FICTIONAL-SECOND-CREDIT-COMPLETE-RETURN',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-SECOND-COMPLETE-RETURN',reason:'The second original credit was actually returned in full by the fictional bank.'});
  await attribute(reversed.id,allocationId,20000,'second-actual-attribution');
  const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  await recovery.correctSellerRecoveryLiability(f.db,f.ctx('later-original-liability-correction',String(current.case.revision)),{caseId:f.caseId,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-LATER-LIABILITY-CORRECTION',reason:'The original responsibility is overturned; restore only the repayment that remains actually received.',publicMessage:'The original responsibility was removed and the remaining actual repayment is restored.'});
  assert.equal(f.sqlite.prepare('SELECT COALESCE(SUM(amount_paisa),0) n FROM seller_recovery_all_restorations WHERE allocation_id=?').get(allocationId)!.n,0);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_all_restorations WHERE allocation_id=?').get(f.allocationId)!.n,10000);
 }finally{f.dispose();}
});
