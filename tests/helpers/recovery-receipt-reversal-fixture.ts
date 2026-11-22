import assert from 'node:assert/strict';
import {sellerRecoveryFixture} from './seller-recovery-fixture';
import {managedRecoveryFixture} from './managed-recovery-fixture';
import {fixedRecoveryFixture} from './fixed-recovery-fixture';
import {recordBankReceipt} from '../../lib/payments/manual-receipts';
import {recordReceiptReversal} from '../../lib/payments/receipt-corrections';
import * as recovery from '../../lib/payments/seller-recovery';
export async function recoveryReceiptReversalFixture(model:'registered'|'managed'|'fixed',restoreBeforeReversal=false,receiptPaisa=20000){
 const f=model==='registered'?await sellerRecoveryFixture():model==='managed'?await managedRecoveryFixture():await fixedRecoveryFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const environment='context'in f?f.context.environment:'environment'in f?f.environment:undefined,env=environment?{environment}:{},accountVersionId='payoutSources'in f?f.payoutSources.accountVersionId:'sources'in f?f.sources.accountVersionId:f.accountVersionId;
  const source='adjustmentId'in f?{kind:'supplier_adjustment' as const,id:f.adjustmentId}:{kind:'refund' as const,id:f.refundId};
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('receipt-reversal-fixture-open'),{...source,reason:'Review the original confirmed native responsibility before accepting any repayment in this isolated fixture.'});
  const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  await recovery.approveSellerRecovery(f.db,f.ctx('receipt-reversal-fixture-approved','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-RECEIPT-REVERSAL-ORIGINAL',reason:'Approve only the original confirmed responsibility and exact native deficit with one eligible reviewer.'});
  const receipt=await recordBankReceipt(f.db,f.ctx('receipt-reversal-fixture-bank'),{accountVersionId,transactionIdentity:'FICTIONAL-RECEIPT-REVERSAL-CREDIT',bankAt:Date.now()-1,amountMinor:receiptPaisa,currency:'NPR',payerReference:'Fictional original seller',payerUserId:review.source.ownerId,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-RECEIPT-REVERSAL-CREDIT-PROOF',reason:'Independently verify the actual fictional original bank credit before allocating it once.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('receipt-reversal-fixture-allocated','1'),{caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash',...env,evidenceReference:'FICTIONAL-RECEIPT-REVERSAL-CREDIT-PROOF',reason:'Allocate only the actual original repayment against the already existing approved native deficit.'});
  const allocationId=String(f.sqlite.prepare('SELECT id FROM seller_recovery_allocations WHERE receipt_id=?').get(receipt.id)!.id);
  if(restoreBeforeReversal){const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);await recovery.correctSellerRecoveryLiability(f.db,f.ctx('receipt-reversal-fixture-restored','2'),{caseId:opened.id,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:current.reviewDigest,...env,evidenceReference:'FICTIONAL-RECEIPT-REVERSAL-RESPONSIBILITY-CORRECTION',reason:'The original responsibility was overturned and the actual repayment was restored before the later bank reversal.',publicMessage:'The original liability was removed and the actual repayment restored to your seller balance.'});}
  const reversal=await recordReceiptReversal(f.db,f.ctx('receipt-reversal-fixture-returned','1'),{receiptId:receipt.id,amountMinor:10000,transactionIdentity:'FICTIONAL-RECEIPT-REVERSAL-BANK-RETURN',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-RECEIPT-REVERSAL-BANK-PROOF',reason:'The bank actually reversed part of the incoming payment; preserve that fact before deciding allocation consequences.'});
  return {...f,environment,accountVersionId,caseId:opened.id,receiptId:receipt.id,allocationId,reversalId:reversal.id,originalConfirmedPaisa:review.source.confirmedPaisa};
 }catch(error){f.dispose();throw error;}
}
