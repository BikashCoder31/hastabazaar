import assert from 'node:assert/strict';
import {unpaidCorrectionFixture} from './unpaid-correction-fixture';
import {recordBankReceipt} from '../../lib/payments/manual-receipts';
import {checkoutCommitClock} from '../../lib/checkout/commit-policy-guards';
export async function carrierUnpaidFixture(model:'registered'|'managed'|'fixed'){
 const f=await unpaidCorrectionFixture(model);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const amount=f.review.source.nativeDebitPaisa,bankAt=(await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} now`).first<{now:number}>())!.now;
  const bank=await recordBankReceipt(f.db,{...f.ctx('carrier-unpaid-bank'),now:bankAt},{accountVersionId:'sources'in f?f.sources.accountVersionId:'payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CARRIER-UNPAID-CREDIT',bankAt,amountMinor:amount+500,currency:'NPR',payerReference:'Fictional independent carrier',payerUserId:null,completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-CARRIER-UNPAID-ACTUAL-BANK',reason:'Independently verify actual carrier money for the separately identified original unpaid cost.'});
  const input={caseId:f.caseId,receiptId:bank.id,receiptRevision:0,amountPaisa:amount,reviewDigest:f.review.reviewDigest,originalUnpaidCostConfirmed:true,evidenceReference:'FICTIONAL-PRIVATE-CARRIER-UNPAID-LINK',reason:'Match this carrier credit only to the original cost already deducted from unpaid earnings.',publicMessage:'The carrier reimbursed this original unpaid deduction. That amount is restored to your balance.',...(f.environment?{environment:f.environment}:{})};
  return {...f,amount,input,receiptId:bank.id};
 }catch(error){f.dispose();throw error;}
}
