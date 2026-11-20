import assert from 'node:assert/strict';
import test from 'node:test';
import {returnedPayoutRecoveryFixture} from './helpers/returned-payout-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {readModelRecoveryEarnings} from '../lib/payments/recovery-earnings-models';
import {getFixedSupplyBalance,prepareFixedSupplierPayment} from '../lib/managed-commerce/fixed-supply';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import * as transfers from '../lib/payments/payout-transfers';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';
import {getReturnHandling,recordReturnHandling} from '../lib/returns/handling';
import {advanceReturnAsAdmin} from '../lib/db/repositories/returns';
for(const model of ['registered','managed','fixed'] as const)void test(`${model} returned principal becomes a protected native entitlement and can be paid without collecting again`,async()=>{
 const f=await returnedPayoutRecoveryFixture(model);try{
  const env=f.environment?{environment:f.environment}:{};
  await recovery.reconcileSellerRecoveryReturnedPayout(f.db,f.ctx('returned-native-reviewed','2'),{...f.input,...env});
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  const pool=model==='registered'?Number(Object.values(f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get(after.source.sellerId,Date.now())!)[0]):(await readModelRecoveryEarnings(f.db,after.source,Date.now())).amount;
  assert.equal(pool,0,'Restored seller money cannot be automatically used for another case.');
  if('context'in f){
   const caseId=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(f.refundId)!.return_request_id),handling=(await getReturnHandling(f.db,caseId))!;
   await recordReturnHandling(f.db,f.ctx('returned-payout-original-physical-review',String(handling.revision)),{caseId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The physical return is waived after the documented original review.',privateNote:'The eligible reviewer checked the fictional no-return basis before closing original physical care.',evidenceReference:'FICTIONAL-RETURNED-PAYOUT-ORIGINAL-PHYSICAL-REVIEW'});
   await advanceReturnAsAdmin(f.db,{returnRequestId:caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'The original actual refund and approved physical disposition are complete.',publicMessageEn:'Your original refund case is complete.',publicMessageNe:'Original refund complete.',requestId:'returned-payout-original-physical-complete',now:Date.now()});
  }
  const funding=await getRefundFundingAvailability(f.db,f.accountVersionId);
  const fundingContext=f.ctx('returned-payout-restored-funds',String(funding.revision));
  await recordRefundFundingStatement(f.db,fundingContext,{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-RETURNED-PAYOUT-RESTORED-CAPITAL',asOf:fundingContext.now,cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-RETURNED-PAYOUT-RESTORED-FUNDS',restrictionsReference:'FICTIONAL-RETURNED-PAYOUT-RESTORED-RESERVES',availableFundsConfirmed:true,reason:'Independently review fictional actual company funds before paying the restored seller money.'});
  const payoutId='recordId'in f?await prepareFixedSupplierPayment(f.db,{recordId:f.recordId,actorId:'reviewer',destinationReference:f.sources.beneficiaryReference,requestId:'returned-payout-restored-payout',now:Date.now(),environment:f.environment!}):'context'in f?await prepareManagedPayout(f.db,{...f.context,requestId:'returned-payout-restored-payout'}):(await prepareSellerPayout(f.db,{sellerId:after.source.sellerId,actorId:'reviewer',actorRole:'super_admin',note:'Prepare the seller money restored by the original payout return.',requestId:'returned-payout-restored-payout',now:Date.now()})).id;
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('returned-payout-restored-packet'),{model,payoutId,accountVersionId:f.accountVersionId,...env,reason:'Prepare only the seller money restored within the reviewed returned payout credit.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('returned-payout-restored-approved','0'),{packetId:packet.id,...env,reason:'Approve the exact restored seller entitlement and its currently verified beneficiary.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('returned-payout-restored-start','1'),{packetId:packet.id,...env,reason:'Record one fictional instruction paying the restored original seller money.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('returned-payout-restored-paid','2'),{packetId:packet.id,...env,outcome:'paid',amountPaisa:10000+f.original.originalPayoutPaisa-f.review.case.confirmedPaisa,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-RETURNED-PAYOUT-RESTORED-PAYMENT',evidenceReference:'FICTIONAL-RETURNED-PAYOUT-RESTORED-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual fictional payment of restored seller money without another collection or returned-principal allocation.'});
  const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(paid.source.blocker,null);assert.equal(paid.position.remainingPaisa,0);assert.equal(paid.position.recoveredPaisa,f.review.case.confirmedPaisa);
  if('recordId'in f)assert.equal((await getFixedSupplyBalance(f.db,f.recordId)).balancePaisa,0);

 }finally{f.dispose();}
});
