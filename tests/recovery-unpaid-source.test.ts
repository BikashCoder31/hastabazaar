import assert from 'node:assert/strict';
import test from 'node:test';
import {unpaidManagedRefundFixture,completeManagedRecoveryRefund} from './helpers/managed-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {readModelRecoveryEarnings} from '../lib/payments/recovery-earnings-models';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import {sellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import * as transfers from '../lib/payments/payout-transfers';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';

void test('reviewed original unpaid earnings absorb their existing refund once, without inventing repayment or reducing the untouched unit twice',async()=>{
 const f=await unpaidManagedRefundFixture('seller',false);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const original=Number(f.sqlite.prepare('SELECT calculated_paisa FROM managed_entitlements WHERE id=?').get(f.entitlementId)!.calculated_paisa),half=original/2;
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('unpaid-source-open'),{kind:'refund',id:f.refundId,reason:'Review the completed original refund against earned money that has never been sent to the seller.'});
 const before=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(before.source.nativeDebitPaisa,half);assert.ok(before.source.blocker);
 const ledger=f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n;
 const input={caseId:opened.id,reviewDigest:before.reviewDigest,evidenceReference:'FICTIONAL-UNPAID-ORIGINAL-EARNINGS',reason:'Confirm the original native deduction is wholly covered by the original unpaid earned entitlement.',publicMessage:'The original refund used your unpaid original earnings. No repayment is due and the untouched unit remains payable.',environment:f.context.environment};
 const result=await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-source-review','0'),input);
 assert.deepEqual(await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-source-review','0'),input),result);
 const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(after.case.state,'closed_no_balance');assert.equal(after.case.exposurePaisa,0);assert.equal(after.case.confirmedPaisa,0);assert.equal(after.position.recoveredPaisa,0);
 assert.equal(after.source.originalUnpaidOffsetPaisa,half);assert.equal(after.source.blocker,null);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,ledger);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 const earnings=await readModelRecoveryEarnings(f.db,after.source,Date.now());assert.equal(earnings.amount,half);
 const payout=await prepareManagedPayout(f.db,{...f.context,requestId:'unpaid-source-remaining-payout'});
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(payout)!.amount_paisa,half);
 const environment=f.context.environment,packet=await transfers.preparePayoutTransfer(f.db,f.ctx('unpaid-remaining-packet'),{model:'managed',payoutId:payout,accountVersionId:f.payoutSources.accountVersionId,environment,reason:'Pay only the remaining untouched original unit after reviewed original unpaid refund deduction.'});
 await transfers.approvePayoutTransfer(f.db,f.ctx('unpaid-remaining-approved','0'),{packetId:packet.id,environment,reason:'Approve the exact remaining earned amount without turning the original unpaid deduction into recovery.'});
 await transfers.startPayoutTransfer(f.db,f.ctx('unpaid-remaining-start','1'),{packetId:packet.id,environment,reason:'Record the single fictional manual instruction for the untouched unit earnings.'});
 await transfers.recordPayoutTransferOutcome(f.db,f.ctx('unpaid-remaining-paid','2'),{packetId:packet.id,environment,outcome:'paid',amountPaisa:half,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-UNPAID-REMAINING-UNIT-PAID',evidenceReference:'FICTIONAL-UNPAID-REMAINING-UNIT-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual fictional untouched-unit payment while retaining the reviewed unpaid refund deduction.'});
 const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(paid.source.blocker,null);assert.equal(paid.source.confirmedPaisa,0);assert.equal(paid.source.historicalNettingPaisa,0);assert.equal((await getSellerRecoveryStatement(f.db,paid.source.ownerId,opened.id)).reconciliation,false);
 assert.equal((await readModelRecoveryEarnings(f.db,paid.source,Date.now())).amount,0);
 }finally{f.dispose();}
});

void test('two completed original refunds require a fresh unpaid snapshot and consume the original earned amount only once together',async()=>{
 const f=await unpaidManagedRefundFixture('seller',false);try{
 const first=await recovery.openSellerRecovery(f.db,f.ctx('unpaid-two-first-open'),{kind:'refund',id:f.refundId,reason:'Review the first of two actual refunds against the original unpaid two-unit entitlement.'});
 const stale=await recovery.getSellerRecoveryReview(f.db,'reviewer',first.id);
 const secondRefund=await completeManagedRecoveryRefund(f,'seller','unpaid-second-unit',50000);
 const input={caseId:first.id,reviewDigest:stale.reviewDigest,evidenceReference:'FICTIONAL-TWO-UNIT-UNPAID-PROOF',reason:'Recognize the original deductions against two original unpaid units without collecting cash.',publicMessage:'The refunds used the original unpaid earnings. No cash repayment is due.',environment:f.context.environment};
 await assert.rejects(recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-stale-first','0'),input),/exact original/i);
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',first.id);
 await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-current-first','0'),{...input,reviewDigest:current.reviewDigest});
 const second=await recovery.openSellerRecovery(f.db,f.ctx('unpaid-two-second-open'),{kind:'refund',id:secondRefund.refundId,reason:'Reconcile the second original unit using its own existing native refund adjustment.'});
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',second.id);
 await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-current-second','0'),{...input,caseId:second.id,reviewDigest:review.reviewDigest});
 const original=Number(f.sqlite.prepare('SELECT calculated_paisa FROM managed_entitlements WHERE id=?').get(f.entitlementId)!.calculated_paisa);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_unpaid_sources').get()!.n,original);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

void test('registered partial unpaid refund remains an original deduction after the first actual net payout, not historical recovery',async()=>{
 const f=await sellerRecoveryFixture(true,'seller',false,40000);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('unpaid-partial-open'),{kind:'refund',id:f.refundId,reason:'Review the partial original refund against wholly unpaid original earnings before the first payout.'});
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.nativeDebitPaisa,36400);
 await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-partial-review','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-UNPAID-PROOF',reason:'Recognize the existing partial refund against the original wholly unpaid earnings without a new debit.',publicMessage:'The partial refund used your unpaid original earnings. The remaining original earnings are payable.'});
 assert.equal(Object.values(f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get('registered',Date.now())!)[0],36400);
 const payout=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',note:'Pay the net original earnings after the reviewed partial unpaid deduction.',requestId:'unpaid-partial-payout',now:Date.now()});
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa,36400);
 const funding=await getRefundFundingAvailability(f.db,f.accountVersionId);
 await recordRefundFundingStatement(f.db,f.ctx('unpaid-partial-funding',String(funding.revision)),{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-UNPAID-PARTIAL-CAPITAL',asOf:Date.now(),cashPaisa:200000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-UNPAID-PARTIAL-FUNDS',restrictionsReference:'FICTIONAL-ORIGINAL-HELD-FUNDS',availableFundsConfirmed:true,reason:'Independently verify actual fictional company capital before the first net original payout.'});
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('unpaid-partial-packet'),{model:'registered',payoutId:payout.id,accountVersionId:f.accountVersionId,reason:'Bind the actual original net earnings and verified original company beneficiary.'});
 await transfers.approvePayoutTransfer(f.db,f.ctx('unpaid-partial-approved','0'),{packetId:packet.id,reason:'Approve the original net earnings after the completed customer refund and explicit unpaid disposition.'});
 await transfers.startPayoutTransfer(f.db,f.ctx('unpaid-partial-start','1'),{packetId:packet.id,reason:'Record one fictional manual instruction for the first net original earnings payment.'});
 await transfers.recordPayoutTransferOutcome(f.db,f.ctx('unpaid-partial-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:36400,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-UNPAID-PARTIAL-NET-PAYMENT',evidenceReference:'FICTIONAL-UNPAID-PARTIAL-BANK-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the first actual net payout without relabelling the earlier unpaid deduction as collection.'});
 const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(after.source.blocker,null);assert.equal(after.source.historicalNettingPaisa,0);assert.equal(after.position.recoveredPaisa,0);assert.equal(after.source.confirmedPaisa,0);
 assert.equal(Object.values(f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get('registered',Date.now())!)[0],0);
 assert.equal((await getSellerRecoveryStatement(f.db,'registered-owner',opened.id)).reconciliation,false);
 }finally{f.dispose();}
});

void test('registered original unpaid deduction consumes original fees once and cannot become eligible recovery earnings or a cash demand',async()=>{
 const f=await sellerRecoveryFixture(true,'seller',false);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('registered-unpaid-open'),{kind:'refund',id:f.refundId,reason:'Review the actual refund against the wholly unpaid original registered earnings and original fee reversal.'});
 const before=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(before.source.nativeDebitPaisa,72800);
 const body={sourceFormId:'system.recovery-finance',action:'unpaid_source',requestId:'registered-unpaid-decision',expectedRevision:'0',input:{caseId:opened.id,reviewDigest:before.reviewDigest,evidenceReference:'FICTIONAL-PRIVATE-REGISTERED-UNPAID-PROOF',reason:'Recognize the existing original refund adjustment against original unpaid earnings, preserving the saved nine percent terms.',publicMessage:'Your original refund is covered by your unpaid original earnings. You owe no cash repayment.'}};
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
 await assert.rejects(runRecoveryCommand(f.db,'registered-owner',body,'staff'),/personal|independent/i);
 const ledger=f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n;
 const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);
 const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(after.case.state,'closed_no_balance');assert.equal(after.source.originalUnpaidOffsetPaisa,72800);assert.equal(after.source.blocker,null);
 const pool=f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get('registered',Date.now());assert.equal(Object.values(pool!)[0],0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n,ledger);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 const statement=await getSellerRecoveryStatement(f.db,'registered-owner',opened.id);assert.equal(statement.originalUnpaidOffsetPaisa,72800);assert.equal(statement.recovered.earnings,0);assert.equal(statement.followup.phase,'closed');assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-REGISTERED'),false);
 f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
 await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission/i);
 }finally{f.dispose();}
});

void test('another retained native expense cannot be ignored to manufacture enough original unpaid earnings',async()=>{
 const f=await unpaidManagedRefundFixture('seller',false);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 // An explicit fictional older original charge; no current guard is disabled.
 f.sqlite.prepare("INSERT INTO managed_settlement_entries(id,entitlement_id,type,amount_paisa,reason_code,created_by,request_id,created_at) VALUES('legacy-unpaid-cost',?,'dispute_adjustment',-60000,'legacy_original_charge','reviewer','legacy-unpaid-cost',1)").run(f.entitlementId);
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('unpaid-other-cost-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the actual original negative balance including the retained other original expense.'});
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(review.source.unpaidSource,null);
 await assert.rejects(recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-other-cost-denied','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-OTHER-ORIGINAL-COST',reason:'The original expense must remain included when establishing whether unpaid money can cover this refund.',publicMessage:'Finance is reconciling the original native costs before a final balance.',environment:f.context.environment}),/exact original/i);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_unpaid_sources').get()!.n,0);
 }finally{f.dispose();}
});
