import test from 'node:test';
import assert from 'node:assert/strict';

import * as recovery from '../lib/payments/seller-recovery';
import {combinedPartialUnpaidFixture} from './helpers/partial-unpaid-fixture';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import {readModelRecoveryEarnings} from '../lib/payments/recovery-earnings-models';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import * as transfers from '../lib/payments/payout-transfers';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';

for(const model of ['registered','managed'] as const)void test(`${model} later payout of restored partial-original components cannot revive the retained liability`,async()=>{
 const f=await combinedPartialUnpaidFixture(model,true);try{
  const {unpaid,deficit,correctionInput:input}=f;
  const result=await recovery.correctUnpaidSellerRecoverySource(f.db,f.ctx('partial-combined-correct-unpaid','4'),input);
  assert.deepEqual(await recovery.correctUnpaidSellerRecoverySource(f.db,f.ctx('partial-combined-correct-unpaid','4'),input),result);
  const statement=await getSellerRecoveryStatement(f.db,f.review.source.ownerId,f.caseId);
  assert.equal(statement.confirmedPaisa,0);assert.equal(statement.originalUnpaidOffsetPaisa,unpaid);assert.equal(statement.unpaidResponsibilityRestoredPaisa,unpaid);assert.equal(statement.restoredPaisa,deficit);assert.equal(statement.position.remainingPaisa,0);assert.equal(statement.reconciliation,false);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) amount FROM seller_recovery_unpaid_corrections WHERE case_id=?').get(f.caseId)!.amount,unpaid);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) amount FROM seller_recovery_allocations WHERE case_id=?').get(f.caseId)!.amount,deficit);
  const source=(await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId)).source;
  assert.equal(model==='registered'?Number(Object.values(f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get(source.sellerId,Date.now())!)[0]):(await readModelRecoveryEarnings(f.db,source,Date.now())).amount,0);
  const accountVersionId='payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId,env=f.environment?{environment:f.environment}:{},funding=await getRefundFundingAvailability(f.db,accountVersionId);
  await recordRefundFundingStatement(f.db,f.ctx('partial-restoration-funds',String(funding.revision)),{accountVersionId,statementIdentity:'FICTIONAL-PARTIAL-RESTORED-CAPITAL',asOf:Date.now(),cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-PARTIAL-RESTORED-FUNDS',restrictionsReference:'FICTIONAL-PARTIAL-RESTORED-RESERVES',availableFundsConfirmed:true,reason:'Independently verify fictional company funds before paying both restored original portions.'});
  const payoutId='context'in f?await prepareManagedPayout(f.db,{...f.context,requestId:'partial-restoration-payout'}):(await prepareSellerPayout(f.db,{sellerId:source.sellerId,actorId:'reviewer',actorRole:'super_admin',note:'Prepare the single native entitlement restored by the original unpaid and collected corrections.',requestId:'partial-restoration-payout',now:Date.now()})).id;
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('partial-restoration-packet'),{model,payoutId,accountVersionId,...env,reason:'Prepare the current restored original entitlement without creating another recovery or reusing its receipt.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('partial-restoration-approved','0'),{packetId:packet.id,...env,reason:'Approve the exact original restored entitlement and its currently verified beneficiary.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('partial-restoration-start','1'),{packetId:packet.id,...env,reason:'Record one fictional manual instruction paying the combined original restoration.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('partial-restoration-paid','2'),{packetId:packet.id,...env,outcome:'paid',amountPaisa:unpaid+deficit,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-PARTIAL-COMBINED-RESTORED-PAYMENT',evidenceReference:'FICTIONAL-PARTIAL-COMBINED-RESTORED-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual fictional payout of both restored portions while retaining the original expense and repayment history.'});
  const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(paid.source.blocker,null);assert.equal(paid.source.confirmedPaisa,0);assert.equal(paid.source.historicalNettingPaisa,0);assert.equal(paid.position.remainingPaisa,0);
 }finally{f.dispose();}
});
