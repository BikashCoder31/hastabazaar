import assert from 'node:assert/strict';
import test from 'node:test';
import {unpaidCorrectionFixture} from './helpers/unpaid-correction-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {readModelRecoveryEarnings} from '../lib/payments/recovery-earnings-models';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';

import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import {prepareFixedSupplierPayment} from '../lib/managed-commerce/fixed-supply';
import * as transfers from '../lib/payments/payout-transfers';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';

for(const model of ['registered','managed','fixed'] as const)void test(`${model} overturned original unpaid responsibility restores native money once while recovery remains zero`,async()=>{
 const f=await unpaidCorrectionFixture(model);try{
  const amount=f.review.source.nativeDebitPaisa,before=await f.balance();
  const eligible=async()=>model==='registered'?Number(Object.values(f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get(f.review.source.sellerId,Date.now())!)[0]):(await readModelRecoveryEarnings(f.db,f.review.source,Date.now())).amount;
  const originalPool=await eligible();
  const input={caseId:f.caseId,newUnpaidResponsibilityPaisa:Math.floor(amount/2),reviewDigest:f.review.reviewDigest,evidenceReference:'FICTIONAL-PRIVATE-UNPAID-CORRECTION',reason:'New original evidence overturns this portion of the earlier charge against unpaid earnings; restore it without inventing collection.',publicMessage:'Part of the original unpaid charge is removed and restored to your payable balance.',...(f.environment?{environment:f.environment}:{})};
  const ctx=f.ctx('unpaid-original-corrected',String(f.review.case.revision));
  const result=await recovery.correctUnpaidSellerRecoverySource(f.db,ctx,input);
  assert.deepEqual(await recovery.correctUnpaidSellerRecoverySource(f.db,ctx,input),result);
  assert.equal(await f.balance(),before+amount-input.newUnpaidResponsibilityPaisa);
  assert.equal(await eligible(),originalPool,'Restored original money cannot be silently collected for another recovery.');
  let current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(current.case.confirmedPaisa,0);assert.equal(current.case.approvedCapPaisa,0);assert.equal(current.position.recoveredPaisa,0);
  assert.equal(current.source.unpaidResponsibilityRestoredPaisa,amount-input.newUnpaidResponsibilityPaisa);
  await recovery.correctUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-original-final-correction',String(current.case.revision)),{...input,newUnpaidResponsibilityPaisa:0,reviewDigest:current.reviewDigest});
  assert.equal(await f.balance(),before+amount);assert.equal(await eligible(),originalPool);
  current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  await assert.rejects(recovery.correctUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-overcorrection',String(current.case.revision)),{...input,newUnpaidResponsibilityPaisa:0,reviewDigest:current.reviewDigest}),/remaining|responsibility|current/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
  const statement=await getSellerRecoveryStatement(f.db,current.source.ownerId,f.caseId);
  assert.equal(statement.reconciliation,false);assert.equal(statement.unpaidResponsibilityRestoredPaisa,amount);assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-UNPAID'),false);
  const accountVersionId='sources'in f?f.sources.accountVersionId:'payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId;
  const funding=await getRefundFundingAvailability(f.db,accountVersionId);
  await recordRefundFundingStatement(f.db,f.ctx('unpaid-correction-payout-funds',String(funding.revision)),{accountVersionId,statementIdentity:'FICTIONAL-UNPAID-CORRECTION-CAPITAL',asOf:Date.now(),cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-UNPAID-CORRECTION-FUNDS',restrictionsReference:'FICTIONAL-UNPAID-CORRECTION-RESERVES',availableFundsConfirmed:true,reason:'Independently verify fictional company funds before paying the restored original balance.'});
  const payoutId='recordId'in f?await prepareFixedSupplierPayment(f.db,{recordId:f.recordId,actorId:'reviewer',destinationReference:f.sources.beneficiaryReference,requestId:'unpaid-correction-payout',now:Date.now(),environment:f.environment!}):'context'in f?await prepareManagedPayout(f.db,{...f.context,requestId:'unpaid-correction-payout'}):(await prepareSellerPayout(f.db,{sellerId:current.source.sellerId,actorId:'reviewer',actorRole:'super_admin',note:'Prepare the remaining original and restored unpaid earnings.',requestId:'unpaid-correction-payout',now:Date.now()})).id;
  const env=f.environment?{environment:f.environment}:{};
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('unpaid-correction-packet'),{model,payoutId,accountVersionId,...env,reason:'Prepare the original payable entitlement including its independently corrected unpaid charge.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('unpaid-correction-packet-approved','0'),{packetId:packet.id,...env,reason:'Approve the exact current original entitlement and corrected charge with one eligible Super Admin.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('unpaid-correction-packet-start','1'),{packetId:packet.id,...env,reason:'Record the single fictional instruction for the current original entitlement.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('unpaid-correction-packet-paid','2'),{packetId:packet.id,...env,outcome:'paid',amountPaisa:before+amount,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-UNPAID-CORRECTION-PAID',evidenceReference:'FICTIONAL-UNPAID-CORRECTION-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual fictional payout of original earnings and restored charge without inventing recovery.'});
  const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(paid.source.confirmedPaisa,0);assert.equal(paid.source.blocker,null);assert.equal(paid.position.recoveredPaisa,0);assert.equal(await eligible(),0);

 }finally{f.dispose();}
});

void test('unpaid correction and its saved outcome require current independent Super Admin authority',async()=>{
 const f=await unpaidCorrectionFixture('registered');try{
  const body={sourceFormId:'system.recovery-finance',action:'correct_unpaid',requestId:'unpaid-correction-protected',expectedRevision:String(f.review.case.revision),input:{caseId:f.caseId,newUnpaidResponsibilityPaisa:0,reviewDigest:f.review.reviewDigest,evidenceReference:'FICTIONAL-PRIVATE-UNPAID-AUTHORITY',reason:'Independently review original evidence before restoring the charge already taken from unpaid earnings.',publicMessage:'The original unpaid charge is restored to your payable balance.'}};
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.review.source.ownerId);
  await assert.rejects(runRecoveryCommand(f.db,f.review.source.ownerId,body,'staff'),/personal|independent/i);
  const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');
  assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
  f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
  await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_unpaid_corrections').get()!.n,1);
 }finally{f.dispose();}
});
