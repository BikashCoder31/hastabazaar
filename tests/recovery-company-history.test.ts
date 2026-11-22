import assert from 'node:assert/strict';
import test from 'node:test';
import {historicalManagedRecoveryFixture} from './helpers/historical-managed-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';

for(const twoRefunds of [false,true])void test(`company-owned historical deduction is identified and compensated without seller recovery${twoRefunds?' while sharing its native pool with another refund':''}`,async()=>{
 const f=await historicalManagedRecoveryFixture({twoRefunds,responsibility:'platform',legacyMissingResponsibility:true});try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('company-history-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the actual historical deduction of a company-owned original cost.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);const amount=review.source.historicalCandidatePaisa!;
  const ledger=Number(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n),candidate=review.source.historicalReview!.candidates[0];
  const input={caseId:opened.id,reviewDigest:review.reviewDigest,candidate:{kind:candidate.kind,payoutId:candidate.payoutId,scopeId:candidate.scopeId,capacityPaisa:candidate.capacityPaisa,nativeProof:candidate.nativeProof},amountPaisa:amount,environment:f.context.environment,evidenceReference:'FICTIONAL-PRIVATE-COMPANY-HISTORICAL-DEDUCTION',reason:'Independently identify the exact original company-owned deduction in an actual completed payout.',publicMessage:'Finance identified the original company-cost deduction. Its correction remains a separate recorded decision.'};
  const result=await recovery.reviewSellerRecoveryCompanyHistory(f.db,f.ctx('company-history-reviewed','0'),input);
  assert.deepEqual(await recovery.reviewSellerRecoveryCompanyHistory(f.db,f.ctx('company-history-reviewed','0'),input),result);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,ledger);
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.case.historicalRecoveredPaisa,0);assert.equal(review.source.historicalNettingPaisa,0);assert.equal(review.source.companyDeductedPaisa,amount);
  await recovery.compensateSellerRecoverySource(f.db,f.ctx('company-history-compensated','1'),{caseId:opened.id,reviewDigest:review.reviewDigest,environment:f.context.environment,evidenceReference:'FICTIONAL-PRIVATE-COMPANY-HISTORICAL-CORRECTION',reason:'Correct the original company-owned cost after its actual historical deduction has been separately identified.',publicMessage:'The company-owned original charge is corrected. You owe no recovery for that cost.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.blocker,null);assert.equal(review.case.confirmedPaisa,0);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.case.state,'closed_no_balance');assert.equal(review.source.companyCompensatedPaisa,amount);
  const statement=await getSellerRecoveryStatement(f.db,review.source.ownerId,opened.id);assert.equal(statement.recovered.earnings,0);assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-COMPANY'),false);
  if(f.secondRefundId){
   const second=await recovery.openSellerRecovery(f.db,f.ctx('company-history-other-open'),{kind:'refund',id:f.secondRefundId,reason:'Review the separate seller-owned refund against only its remaining original historical capacity.'});
   const other=await recovery.getSellerRecoveryReview(f.db,'reviewer',second.id),remaining=other.source.historicalReview!.candidates[0];assert.equal(remaining.attributedPaisa,amount);assert.equal(remaining.capacityPaisa-remaining.attributedPaisa,other.case.confirmedPaisa);
   await recovery.reviewSellerRecoveryHistory(f.db,f.ctx('company-history-other-attributed','0'),{...input,caseId:second.id,reviewDigest:other.reviewDigest,amountPaisa:other.case.confirmedPaisa,candidate:{kind:remaining.kind,payoutId:remaining.payoutId,scopeId:remaining.scopeId,capacityPaisa:remaining.capacityPaisa,nativeProof:remaining.nativeProof}});
   const final=await recovery.getSellerRecoveryReview(f.db,'reviewer',second.id);assert.equal(final.position.remainingPaisa,0);assert.equal(final.source.blocker,null);assert.equal(final.position.recoveredPaisa,amount);
  }
  const {prepareManagedPayout}=await import('../lib/db/repositories/managed-settlements');
  const transfers=await import('../lib/payments/payout-transfers');
  const {getRefundFundingAvailability,recordRefundFundingStatement}=await import('../lib/payments/refund-funding');
  const accountVersionId=f.payoutSources.accountVersionId,environment=f.context.environment,funding=await getRefundFundingAvailability(f.db,accountVersionId),fundingCtx=f.ctx('managed-company-history-funding',String(funding.revision));
  await recordRefundFundingStatement(f.db,fundingCtx,{accountVersionId,statementIdentity:'FICTIONAL-MANAGED-COMPANY-HISTORY-CAPITAL',asOf:fundingCtx.now,cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-MANAGED-COMPANY-HISTORY-FUNDS',restrictionsReference:'FICTIONAL-MANAGED-COMPANY-HISTORY-RESERVES',availableFundsConfirmed:true,reason:'Verify actual fictional company funds before paying the corrected original company charge.'});
  const payoutId=await prepareManagedPayout(f.db,{...f.context,requestId:'managed-company-history-restored-payout',now:Date.now(),scheduledFor:Date.now()});
  assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(payoutId)!.amount_paisa,amount);
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('managed-company-history-restored-packet'),{model:'managed',payoutId,accountVersionId,environment,reason:'Bind the exact restored original company charge to the independently verified beneficiary.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('managed-company-history-restored-approved','0'),{packetId:packet.id,environment,reason:'Approve the exact restored original entitlement and available fictional company funds.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('managed-company-history-restored-start','1'),{packetId:packet.id,environment,reason:'Record one fictional manual instruction for the restored original company charge.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('managed-company-history-restored-paid','2'),{packetId:packet.id,environment,outcome:'paid',amountPaisa:amount,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-MANAGED-COMPANY-HISTORY-PAID',evidenceReference:'FICTIONAL-MANAGED-COMPANY-HISTORY-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm actual restored money paid without reusing any old shared historical deduction.'});
  const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(paid.source.blocker,null);assert.equal(paid.source.historicalNettingPaisa,0);assert.equal(paid.case.confirmedPaisa,0);assert.equal(paid.position.recoveredPaisa,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(f.historicalPayoutId)!.status,'paid');
 }finally{f.dispose();}
});

void test('registered historical company correction preserves its fee and enforces current independent authority and exact protected replay',async()=>{
 const {historicalRegisteredRecoveryFixture}=await import('./helpers/historical-registered-recovery-fixture');
 const {runRecoveryCommand,recoverRecoveryCommand}=await import('../lib/payments/recovery-commands');
 const f=await historicalRegisteredRecoveryFixture('platform');try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('registered-company-history-open'),{kind:'refund',id:f.refundId,reason:'Review the actual original wrong company charge and its completed historical deduction.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  const gross=Number(f.sqlite.prepare('SELECT amount_paisa FROM refunds WHERE id=?').get(f.refundId)!.amount_paisa),fee=gross-f.originalPaidPaisa;
  const c=review.source.historicalReview!.candidates[0],candidate={kind:c.kind,payoutId:c.payoutId,scopeId:c.scopeId,capacityPaisa:c.capacityPaisa,nativeProof:c.nativeProof};
  const body={sourceFormId:'system.recovery-finance',action:'company_history',requestId:'registered-company-history-reviewed',expectedRevision:'0',input:{caseId:opened.id,reviewDigest:review.reviewDigest,candidate,amountPaisa:f.originalPaidPaisa,evidenceReference:'FICTIONAL-PRIVATE-COMPANY-HISTORY-PROOF',reason:'Identify only the actual original net deduction, retaining the separately owed original commission reversal.',publicMessage:'The company-owned deduction is identified. Correcting its original gross charge preserves your fee credit.'}};
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
  await assert.rejects(runRecoveryCommand(f.db,'registered-owner',body,'staff'),/personal|independent/i);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...body.input,candidate:null}},'staff'),/protected recovery form/i);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...body.input,amountPaisa:gross}},'staff'),/remaining|deduction/i);
  const before=f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n;
  const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);assert.deepEqual(await runRecoveryCommand(f.db,'reviewer',body,'staff'),result);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n,before);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,requestId:'registered-company-history-stale'},'staff'),/exact|review/i);
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.compensationPaisa,gross);assert.equal(review.source.historicalNettingPaisa,0);
  await recovery.compensateSellerRecoverySource(f.db,f.ctx('registered-company-history-correction','1'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-COMPANY-GROSS-CORRECTION',reason:'Restore the gross wrong company charge while preserving the original commission credit.',publicMessage:'The original company charge is corrected and your fee reversal remains credited.'});
  const statement=await getSellerRecoveryStatement(f.db,'registered-owner',opened.id);assert.equal(statement.companyDeductedPaisa,f.originalPaidPaisa);assert.equal(statement.companyCompensatedPaisa,gross);assert.equal(statement.historicalRecoveredPaisa,0);assert.equal(statement.position.remainingPaisa,0);assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE'),false);
  assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE refund_id=? AND type='commission_reversal'").get(f.refundId)!.n,fee);
  const {prepareSellerPayout}=await import('../lib/db/repositories/payouts');
  const transfers=await import('../lib/payments/payout-transfers');
  const {getRefundFundingAvailability,recordRefundFundingStatement}=await import('../lib/payments/refund-funding');
  const funding=await getRefundFundingAvailability(f.db,f.accountVersionId),fundingCtx=f.ctx('company-history-restored-funding',String(funding.revision));
  await recordRefundFundingStatement(f.db,fundingCtx,{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-COMPANY-HISTORY-RESTORED-CAPITAL',asOf:fundingCtx.now,cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-COMPANY-HISTORY-RESTORED-FUNDS',restrictionsReference:'FICTIONAL-COMPANY-HISTORY-RESERVES',availableFundsConfirmed:true,reason:'Verify actual fictional company funds before paying the corrected original charge.'});
  const payout=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',note:'Pay the original wrong company charge after its retained correction.',requestId:'company-history-restored-payout',now:Date.now()});
  assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa,gross);
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('company-history-restored-packet'),{model:'registered',payoutId:payout.id,accountVersionId:f.accountVersionId,reason:'Bind the exact restored original company-owned charge to the current verified beneficiary.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('company-history-restored-approved','0'),{packetId:packet.id,reason:'Approve the exact restored native entitlement and independently verified fictional funding.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('company-history-restored-start','1'),{packetId:packet.id,reason:'Record the single fictional bank instruction for this corrected original charge.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('company-history-restored-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:gross,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-COMPANY-HISTORY-RESTORED-PAID',evidenceReference:'FICTIONAL-COMPANY-HISTORY-RESTORED-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual restored payout without recording seller recovery or rewriting the old historical payout.'});
  const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(paid.source.blocker,null);assert.equal(paid.source.historicalNettingPaisa,0);assert.equal(paid.case.confirmedPaisa,0);assert.equal(paid.position.recoveredPaisa,0);
  assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.historicalPayoutId)!.status,'paid');
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
  await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission/i);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',body,'staff'),/permission/i);
 }finally{f.dispose();}
});
