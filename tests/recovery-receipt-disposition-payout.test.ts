import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryReceiptReversalFixture} from './helpers/recovery-receipt-reversal-fixture';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {payHistoricalPartialFixedBalance} from './helpers/historical-partial-fixed-fixture';
import {getReturnHandling,recordReturnHandling} from '../lib/returns/handling';
import {advanceReturnAsAdmin} from '../lib/db/repositories/returns';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';
import * as transfers from '../lib/payments/payout-transfers';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';

for(const model of ['registered','managed','fixed'] as const)void test(`${model} restored entitlement remains payable with explicit company funding after its receipt reverses`,async()=>{
 const f=await recoveryReceiptReversalFixture(model,true);try{
  const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId),env=f.environment?{environment:f.environment}:{};
  await reconcileRecoveryReceiptReversal(f.db,f.ctx('reversal-payout-disposition',String(review.receiptRevision)),{reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocationId,amountPaisa:10000,companyLossApproved:true}],...env,evidenceReference:'FICTIONAL-RESTORED-BANK-LOSS',reason:'Approve company funding of the previously restored entitlement after its actual original receipt reversed.',publicMessage:'The company covers the reversed portion of your restored entitlement; your original liability remains zero.'});
  if('sources'in f){assert.ok(f.environment);await payHistoricalPartialFixedBalance({...f,environment:f.environment},'reversal-fixed-restored',20000);}
  else{
   const physicalId=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(f.refundId)!.return_request_id),handling=(await getReturnHandling(f.db,physicalId))!;
   await recordReturnHandling(f.db,f.ctx('reversal-physical-reviewed',String(handling.revision)),{caseId:physicalId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The physical return is waived after review.',privateNote:'The fictional physical-return evidence was reviewed.',evidenceReference:'FICTIONAL-REVERSAL-NO-RETURN'});
   await advanceReturnAsAdmin(f.db,{returnRequestId:physicalId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'Original actual refund and physical care complete.',publicMessageEn:'Your original refund case is complete.',publicMessageNe:'Original refund case complete.',requestId:'reversal-physical-complete',now:Date.now()});
   await assert.rejects(getRefundFundingAvailability(f.db,f.accountVersionId),/Reverify the current bank balance/);
   const funds=(await f.db.prepare('SELECT h.revision FROM company_funding_accounts h JOIN company_payment_account_versions v ON v.account_id=h.account_id WHERE v.id=?').bind(f.accountVersionId).first<{revision:number}>())!,ctx=f.ctx('reversal-restored-funds',String(funds.revision));
   await recordRefundFundingStatement(f.db,ctx,{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-REVERSAL-RESTORED-CAPITAL',asOf:ctx.now,cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-REVERSAL-RESTORED-FUNDS',restrictionsReference:'FICTIONAL-REVERSAL-RESERVES',availableFundsConfirmed:true,reason:'Verify current fictional company funds for the full restored entitlement including the explicitly approved bank loss.'});
   const payoutId='context'in f?await prepareManagedPayout(f.db,{...f.context,requestId:'reversal-restored-payout'}):(await prepareSellerPayout(f.db,{sellerId:review.cases[0].source.sellerId,actorId:'reviewer',actorRole:'super_admin',note:'Pay the actual restored entitlement including the explicitly approved company funding.',requestId:'reversal-restored-payout',now:Date.now()})).id;
   const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('reversal-restored-packet'),{model,payoutId,accountVersionId:f.accountVersionId,...env,reason:'Bind every original and reversal movement to this whole restored payout and its original beneficiary.'});
   await transfers.approvePayoutTransfer(f.db,f.ctx('reversal-restored-approved','0'),{packetId:packet.id,...env,reason:'Approve the complete retained restored entitlement and current company funds.'});
   await transfers.startPayoutTransfer(f.db,f.ctx('reversal-restored-start','1'),{packetId:packet.id,...env,reason:'Start one fictional instruction paying the exact restored entitlement.'});
   await transfers.recordPayoutTransferOutcome(f.db,f.ctx('reversal-restored-paid','2'),{packetId:packet.id,...env,outcome:'paid',amountPaisa:20000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-REVERSAL-RESTORED-PAID',evidenceReference:'FICTIONAL-REVERSAL-RESTORED-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual fictional payout of the full restoration without inventing another seller liability.'});
  }
  const after=await getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(after.source.blocker,null);assert.equal(after.source.confirmedPaisa,0);assert.equal(after.position.remainingPaisa,0);assert.equal(after.source.receiptCompanyLossPaisa,10000);
 }finally{f.dispose();}
});
