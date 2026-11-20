import test from 'node:test';
import assert from 'node:assert/strict';
import {unpaidManagedRefundFixture,completeManagedRecoveryRefund} from './helpers/managed-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {combinedPartialUnpaidFixture} from './helpers/partial-unpaid-fixture';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import {readModelRecoveryEarnings} from '../lib/payments/recovery-earnings-models';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import * as transfers from '../lib/payments/payout-transfers';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';

void test('partial original unpaid earnings consume one shared pool and expose only the additional native deficit',async()=>{
 const f=await unpaidManagedRefundFixture('seller',false);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.prepare("INSERT INTO managed_settlement_entries(id,entitlement_id,type,amount_paisa,reason_code,created_by,request_id,created_at) VALUES('partial-original-cost',?,'dispute_adjustment',-60000,'legacy_original_charge','reviewer','partial-original-cost',1)").run(f.entitlementId);
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('partial-original-open'),{kind:'refund',id:f.refundId,reason:'Review the completed original refund with its earned but partly consumed original entitlement.'});
  const before=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id),entries=f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n;
  assert.equal(before.source.unpaidSource,null);
  const input={caseId:opened.id,reviewDigest:before.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-ORIGINAL-SOURCE',reason:'Recognize only the remaining original earned capacity after retaining the earlier documented expense.',publicMessage:'NPR 310 of original unpaid earnings covers this refund. The additional NPR 145 is separately reviewed.',environment:f.context.environment};
  const result=await recovery.reviewPartialUnpaidSellerRecoverySource(f.db,f.ctx('partial-original-reviewed','0'),input);
  assert.deepEqual(await recovery.reviewPartialUnpaidSellerRecoverySource(f.db,f.ctx('partial-original-reviewed','0'),input),result);
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  assert.equal(after.source.originalUnpaidOffsetPaisa,31000);assert.equal(after.case.confirmedPaisa,14500);assert.equal(after.case.approvedCapPaisa,0);assert.equal(after.position.collectiblePaisa,0);assert.equal(after.source.blocker,null);assert.equal(after.position.recoveredPaisa,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,entries);
  const second=await completeManagedRecoveryRefund(f,'seller','partial-second-original-refund',50000);
  const secondOpened=await recovery.openSellerRecovery(f.db,f.ctx('partial-second-open'),{kind:'refund',id:second.refundId,reason:'Review the second actual refund against the same already consumed original earned pool.'});
  const secondReview=await recovery.getSellerRecoveryReview(f.db,'reviewer',secondOpened.id);
  await recovery.reviewPartialUnpaidSellerRecoverySource(f.db,f.ctx('partial-second-reviewed','0'),{...input,caseId:secondOpened.id,reviewDigest:secondReview.reviewDigest,publicMessage:'The original unpaid earnings were already used once. This second refund has no unused original earnings to apply.'});
  const final=await recovery.getSellerRecoveryReview(f.db,'reviewer',secondOpened.id);
  assert.equal(final.source.originalUnpaidOffsetPaisa,0);assert.equal(final.case.confirmedPaisa,45500);assert.equal(final.case.approvedCapPaisa,0);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) amount FROM seller_recovery_partial_sources').get()!.amount,31000);
 }finally{f.dispose();}
});

for(const model of ['registered','managed'] as const)void test(`${model} overturned original responsibility restores unpaid and collected portions once`,async()=>{
 const f=await combinedPartialUnpaidFixture(model);try{
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
