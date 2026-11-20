import assert from 'node:assert/strict';
import {sellerRecoveryFixture} from './seller-recovery-fixture';
import {managedRecoveryFixture} from './managed-recovery-fixture';
import {fixedRecoveryFixture} from './fixed-recovery-fixture';
import * as recovery from '../../lib/payments/seller-recovery';
import {recordBankReceipt} from '../../lib/payments/manual-receipts';

export async function carrierRecoveryFixture(model:'registered'|'managed'|'fixed'){
 const f=await(model==='registered'?sellerRecoveryFixture():model==='managed'?managedRecoveryFixture():fixedRecoveryFixture());
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const source='adjustmentId'in f?{kind:'supplier_adjustment' as const,id:f.adjustmentId}:{kind:'refund' as const,id:f.refundId};
  const environment='environment'in f?f.environment:'context'in f?f.context.environment:undefined;
  const env=environment?{environment}:{};
  const accountVersionId='sources'in f?f.sources.accountVersionId:'payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId;
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('carrier-fixture-open'),{...source,reason:'Review the actual original paid source before applying a carrier reimbursement.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  await recovery.approveSellerRecovery(f.db,f.ctx('carrier-fixture-approved','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-CARRIER-ORIGINAL-COST',reason:'Approve the exact original liability independently before the seller makes an actual repayment.'});
  const sellerReceipt=await recordBankReceipt(f.db,f.ctx('carrier-fixture-seller-bank'),{accountVersionId,transactionIdentity:'FICTIONAL-CARRIER-FIXTURE-SELLER-BANK',bankAt:Date.now()-1,amountMinor:10000,currency:'NPR',payerReference:'Fictional original seller',payerUserId:review.source.ownerId,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-CARRIER-SELLER-CREDIT',reason:'Independently verify an actual seller payment before the carrier later reimburses the original cost.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('carrier-fixture-seller-allocated','1'),{caseId:opened.id,receiptId:sellerReceipt.id,receiptRevision:0,amountPaisa:10000,method:'cash',...env,evidenceReference:'FICTIONAL-CARRIER-SELLER-ALLOCATION',reason:'Allocate the actual original seller repayment once under the original approved cap.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  const receipt=await recordBankReceipt(f.db,f.ctx('carrier-fixture-bank'),{accountVersionId,transactionIdentity:'FICTIONAL-CARRIER-FIXTURE-BANK',bankAt:Date.now()-1,amountMinor:review.case.confirmedPaisa+10000,currency:'NPR',payerReference:'Fictional carrier for original cost',payerUserId:null,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-CARRIER-ACTUAL-CREDIT',reason:'Independently verify the actual external carrier credit before reviewing original-cost attribution.'});
  const input={caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:review.case.confirmedPaisa,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,originalCostReimbursementConfirmed:true,evidenceReference:'FICTIONAL-PRIVATE-CARRIER-ALLOCATION',reason:'Confirm the exact original cost and restore the overlapping seller payment within this one carrier credit.',publicMessage:'The carrier covered this original cost. Your earlier repayment is restored to your payable balance.'};
  return {...f,source,environment,accountVersionId,caseId:opened.id,review,input,sellerReceiptId:sellerReceipt.id,carrierReceiptId:receipt.id};
 }catch(error){f.dispose();throw error;}
}
