import assert from 'node:assert/strict';
import {carrierRecoveryFixture} from './carrier-recovery-fixture';
import {readOriginalRecoveryPayoutProofs} from '../../lib/payments/recovery-original-payouts';
import {recordBankReceipt} from '../../lib/payments/manual-receipts';
import {checkoutCommitClock} from '../../lib/checkout/commit-policy-guards';
import {getSellerRecoveryReview} from '../../lib/payments/seller-recovery';

export async function returnedPayoutRecoveryFixture(model:'registered'|'managed'|'fixed'){
 const f=await carrierRecoveryFixture(model);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const original=(await readOriginalRecoveryPayoutProofs(f.db,f.caseId))[0];assert.ok(original);assert.ok(original.scopePaisa>=original.originalPayoutPaisa);
  const bankAt=(await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} now`).first<{now:number}>())!.now;
  const returned=await recordBankReceipt(f.db,{...f.ctx('returned-original-bank-credit'),now:bankAt},{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-RETURNED-ORIGINAL-PAID-PRINCIPAL',bankAt,amountMinor:original.originalPayoutPaisa+500,currency:'NPR',payerReference:'Fictional original seller returning paid principal',payerUserId:f.review.source.ownerId,evidenceReference:'FICTIONAL-RETURNED-ORIGINAL-ACTUAL-BANK',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently verify actual returned original payout money, retaining the extra credit for separate review.'});
  const review=await getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  const input={caseId:f.caseId,payoutId:original.payoutId,receiptId:returned.id,receiptRevision:0,amountPaisa:original.originalPayoutPaisa,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,originalPayoutReturnConfirmed:true,evidenceReference:'FICTIONAL-PRIVATE-RETURNED-PAYOUT-LINK',reason:'Match this actual returned credit to the exact retained original paid transfer and restore its overlap once.',publicMessage:'The original payout money returned. The statement separates recovery from money restored to your balance.'};
  return {...f,original,returnedReceiptId:returned.id,review,input};
 }catch(error){f.dispose();throw error;}
}
