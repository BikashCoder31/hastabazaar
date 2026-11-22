import assert from 'node:assert/strict';
import test from 'node:test';
import {carrierUnpaidFixture} from './helpers/carrier-unpaid-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {readModelRecoveryEarnings} from '../lib/payments/recovery-earnings-models';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';

import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import {prepareFixedSupplierPayment} from '../lib/managed-commerce/fixed-supply';
import * as transfers from '../lib/payments/payout-transfers';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';

for(const model of ['registered','managed','fixed'] as const)void test(`${model} actual payout of carrier-restored unpaid earnings does not recreate seller liability`,async()=>{
 const f=await carrierUnpaidFixture(model);try{
  const amount=f.amount,before=await f.balance();
  const eligible=async()=>model==='registered'?Number(Object.values(f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get(f.review.source.sellerId,Date.now())!)[0]):(await readModelRecoveryEarnings(f.db,f.review.source,Date.now())).amount;
  const originalPool=await eligible();
  await recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(f.db,f.ctx('carrier-unpaid-actual-restoration',String(f.review.case.revision)),f.input);
  const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(await eligible(),originalPool,'The restored component cannot be silently used by another recovery case.');
  const statement=await getSellerRecoveryStatement(f.db,current.source.ownerId,f.caseId);
  assert.equal(statement.carrierUnpaidCoveredPaisa,amount);assert.equal(statement.reconciliation,false);assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-CARRIER'),false);
  const accountVersionId='sources'in f?f.sources.accountVersionId:'payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId;
  const funding=await getRefundFundingAvailability(f.db,accountVersionId);
  const fundingCtx=f.ctx('carrier-unpaid-payout-funds',String(funding.revision));
  await recordRefundFundingStatement(f.db,fundingCtx,{accountVersionId,statementIdentity:'FICTIONAL-CARRIER-UNPAID-CAPITAL',asOf:fundingCtx.now,cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-CARRIER-UNPAID-FUNDS',restrictionsReference:'FICTIONAL-CARRIER-UNPAID-RESERVES',availableFundsConfirmed:true,reason:'Independently verify fictional company funds before paying the restored original balance.'});
  const payoutId='recordId'in f?await prepareFixedSupplierPayment(f.db,{recordId:f.recordId,actorId:'reviewer',destinationReference:f.sources.beneficiaryReference,requestId:'carrier-unpaid-payout',now:Date.now(),environment:f.environment!}):'context'in f?await prepareManagedPayout(f.db,{...f.context,requestId:'carrier-unpaid-payout'}):(await prepareSellerPayout(f.db,{sellerId:current.source.sellerId,actorId:'reviewer',actorRole:'super_admin',note:'Prepare the remaining original and restored unpaid earnings.',requestId:'carrier-unpaid-payout',now:Date.now()})).id;
  const env=f.environment?{environment:f.environment}:{};
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('carrier-unpaid-packet'),{model,payoutId,accountVersionId,...env,reason:'Prepare the original payable entitlement including its independently carrier-covered unpaid charge.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('carrier-unpaid-packet-approved','0'),{packetId:packet.id,...env,reason:'Approve the exact current original entitlement and carrier-covered charge with one eligible Super Admin.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('carrier-unpaid-packet-start','1'),{packetId:packet.id,...env,reason:'Record the single fictional instruction for the current original entitlement.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('carrier-unpaid-packet-paid','2'),{packetId:packet.id,...env,outcome:'paid',amountPaisa:before+amount,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-CARRIER-UNPAID-PAID',evidenceReference:'FICTIONAL-CARRIER-UNPAID-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual fictional payout of original earnings and restored charge without inventing recovery.'});
  const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(paid.source.confirmedPaisa,0);assert.equal(paid.source.blocker,null);assert.equal(paid.position.recoveredPaisa,0);assert.equal(await eligible(),0);

 }finally{f.dispose();}
});

void test('fixed uncovered original cost can be corrected after the carrier-restored portion was actually paid',async()=>{
 const f=await carrierUnpaidFixture('fixed');const model=f.review.source.model;try{
  const amount=Math.floor(f.amount/2),before=await f.balance();
  const eligible=async()=>model==='registered'?Number(Object.values(f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get(f.review.source.sellerId,Date.now())!)[0]):(await readModelRecoveryEarnings(f.db,f.review.source,Date.now())).amount;
  const originalPool=await eligible();
  await recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(f.db,f.ctx('carrier-unpaid-actual-restoration',String(f.review.case.revision)),{...f.input,amountPaisa:amount});
  const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(await eligible(),originalPool,'The restored component cannot be silently used by another recovery case.');
  const statement=await getSellerRecoveryStatement(f.db,current.source.ownerId,f.caseId);
  assert.equal(statement.carrierUnpaidCoveredPaisa,amount);assert.equal(statement.reconciliation,false);assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-CARRIER'),false);
  const accountVersionId='sources'in f?f.sources.accountVersionId:'payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId;
  const funding=await getRefundFundingAvailability(f.db,accountVersionId);
  const fundingCtx=f.ctx('carrier-unpaid-payout-funds',String(funding.revision));
  await recordRefundFundingStatement(f.db,fundingCtx,{accountVersionId,statementIdentity:'FICTIONAL-CARRIER-UNPAID-CAPITAL',asOf:fundingCtx.now,cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-CARRIER-UNPAID-FUNDS',restrictionsReference:'FICTIONAL-CARRIER-UNPAID-RESERVES',availableFundsConfirmed:true,reason:'Independently verify fictional company funds before paying the restored original balance.'});
  const payoutId='recordId'in f?await prepareFixedSupplierPayment(f.db,{recordId:f.recordId,actorId:'reviewer',destinationReference:f.sources.beneficiaryReference,requestId:'carrier-unpaid-payout',now:Date.now(),environment:f.environment!}):'context'in f?await prepareManagedPayout(f.db,{...f.context,requestId:'carrier-unpaid-payout'}):(await prepareSellerPayout(f.db,{sellerId:current.source.sellerId,actorId:'reviewer',actorRole:'super_admin',note:'Prepare the remaining original and restored unpaid earnings.',requestId:'carrier-unpaid-payout',now:Date.now()})).id;
  const env=f.environment?{environment:f.environment}:{};
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('carrier-unpaid-packet'),{model,payoutId,accountVersionId,...env,reason:'Prepare the original payable entitlement including its independently carrier-covered unpaid charge.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('carrier-unpaid-packet-approved','0'),{packetId:packet.id,...env,reason:'Approve the exact current original entitlement and carrier-covered charge with one eligible Super Admin.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('carrier-unpaid-packet-start','1'),{packetId:packet.id,...env,reason:'Record the single fictional instruction for the current original entitlement.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('carrier-unpaid-packet-paid','2'),{packetId:packet.id,...env,outcome:'paid',amountPaisa:before+amount,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-CARRIER-UNPAID-PAID',evidenceReference:'FICTIONAL-CARRIER-UNPAID-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual fictional payout of original earnings and restored charge without inventing recovery.'});
  const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(paid.source.confirmedPaisa,0);assert.equal(paid.source.blocker,null);assert.equal(paid.position.recoveredPaisa,0);assert.equal(await eligible(),0);

  await recovery.correctUnpaidSellerRecoverySource(f.db,f.ctx('carrier-unpaid-after-paid-correction',String(paid.case.revision)),{caseId:f.caseId,newUnpaidResponsibilityPaisa:amount,reviewDigest:paid.reviewDigest,...(f.environment?{environment:f.environment}:{}),evidenceReference:'FICTIONAL-CARRIER-UNPAID-AFTER-PAID-CORRECTION',reason:'Restore only the remaining uncovered original charge after the carrier-covered portion was actually paid.',publicMessage:'The remaining uncovered original charge is restored, with the already-paid carrier coverage kept separate.'});
  const corrected=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(corrected.source.blocker,null);assert.equal(corrected.source.confirmedPaisa,0);assert.equal(corrected.position.recoveredPaisa,0);assert.equal(await f.balance(),f.amount-amount);assert.equal(await eligible(),0);

 }finally{f.dispose();}
});
