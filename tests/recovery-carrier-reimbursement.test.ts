import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import * as recovery from '../lib/payments/seller-recovery';
import {pendingRecoveryDisputes} from '../lib/payments/recovery-disputes';
import {carrierRecoveryDisposition} from '../lib/payments/recovery-carrier';
import {carrierRecoveryFixture} from './helpers/carrier-recovery-fixture';
import {readModelRecoveryEarnings} from '../lib/payments/recovery-earnings-models';
import {getFixedSupplyBalance,prepareFixedSupplierPayment} from '../lib/managed-commerce/fixed-supply';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import * as transfers from '../lib/payments/payout-transfers';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';
import {getReturnHandling,recordReturnHandling} from '../lib/returns/handling';
import {advanceReturnAsAdmin} from '../lib/db/repositories/returns';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import {historicalManagedRecoveryFixture} from './helpers/historical-managed-recovery-fixture';
import {readHistoricalRecoveryCandidates} from '../lib/payments/recovery-historical';

void test('carrier overlap preserves absorption, bounds repeated reimbursement and requires explicit dispute resolution',()=>{
 assert.deepEqual(carrierRecoveryDisposition({confirmed:10000,absorbed:2000,disputed:0,recovered:5000,carrierRecovered:0,incoming:6000,resolveDisputed:0}),{nativeCreditPaisa:6000,restoredPaisa:3000,recoveredPaisa:8000,remainingPaisa:0,disputedPaisa:0});
 assert.deepEqual(carrierRecoveryDisposition({confirmed:10000,absorbed:0,disputed:5000,recovered:5000,carrierRecovered:0,incoming:10000,resolveDisputed:5000}),{nativeCreditPaisa:10000,restoredPaisa:5000,recoveredPaisa:10000,remainingPaisa:0,disputedPaisa:0});
 assert.throws(()=>carrierRecoveryDisposition({confirmed:10000,absorbed:2000,disputed:0,recovered:8000,carrierRecovered:6000,incoming:2001,resolveDisputed:0}),/cap/);
 assert.throws(()=>carrierRecoveryDisposition({confirmed:10000,absorbed:0,disputed:5000,recovered:5000,carrierRecovered:0,incoming:10000,resolveDisputed:0}),/disputed/);
});

void test('a carrier reimbursement after seller collection restores overlap once and shares the original cost cap',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const receipt=await recordBankReceipt(f.db,f.ctx('carrier-original-seller-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CARRIER-ORIGINAL-SELLER-CREDIT',bankAt:Date.now()-1,amountMinor:30000,currency:'NPR',payerReference:'Fictional original seller',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-CARRIER-ORIGINAL-SELLER-BANK',reason:'Independently verify actual seller money before a later carrier reimbursement arrives.'});
  await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('carrier-original-seller-allocated','1'),{caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:30000,method:'cash',evidenceReference:'FICTIONAL-CARRIER-ORIGINAL-ALLOCATION',reason:'Apply the actual original seller repayment once against the confirmed original liability.'});
  const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),liability=review.case.confirmedPaisa;
  const carrier=await recordBankReceipt(f.db,f.ctx('carrier-actual-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CARRIER-ACTUAL-CREDIT',bankAt:Date.now()-1,amountMinor:liability+10000,currency:'NPR',payerReference:'Fictional evidenced carrier reimbursement',payerUserId:null,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-CARRIER-ACTUAL-BANK',reason:'Independently verify the actual carrier credit before reviewing its attribution to this original cost.'});
  const before=Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n);
  const input={caseId:f.recoveryId,receiptId:carrier.id,receiptRevision:0,amountPaisa:liability,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,originalCostReimbursementConfirmed:true,evidenceReference:'FICTIONAL-PRIVATE-CARRIER-COST-PROOF',reason:'Verify the carrier reimbursement belongs to this exact original seller cost and restore the overlapping original seller collection.',publicMessage:'The carrier covered this original cost. Your earlier repayment is restored to your payable balance.'};
  const result=await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-cost-reviewed','2'),input);
  assert.deepEqual(await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-cost-reviewed','2'),input),result);
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
  assert.equal(after.position.remainingPaisa,0);assert.equal(after.position.overRecoveredPaisa,0);assert.equal(after.position.recoveredPaisa,liability);
  assert.equal(after.case.restoredPaisa,30000);assert.equal(after.case.confirmedPaisa,liability);
  assert.equal(Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n),before+liability,'One native credit includes both debt relief and restitution.');
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').get(carrier.id)!.n,liability);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').get(receipt.id)!.n,30000,'Restitution never frees the original spent receipt.');
  await assert.rejects(recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-duplicate-cost',String(after.case.revision)),{...input,receiptRevision:1,reviewDigest:after.reviewDigest,amountPaisa:1}),/cap|original|remaining|reimbursement/i);
 }finally{f.dispose();}
});

for(const model of ['registered','managed','fixed'] as const)void test(`${model} carrier overlap becomes a protected native entitlement and can be paid without collecting again`,async()=>{
 const f=await carrierRecoveryFixture(model);try{
  const env=f.environment?{environment:f.environment}:{};
  await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-native-reviewed','2'),{...f.input,...env});
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  const pool=model==='registered'?Number(Object.values(f.sqlite.prepare(recovery.registeredRecoveryEarningsSql()).get(after.source.sellerId,Date.now())!)[0]):(await readModelRecoveryEarnings(f.db,after.source,Date.now())).amount;
  assert.equal(pool,0,'Restored seller money cannot be automatically used for another case.');
  if('context'in f){
   const caseId=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(f.refundId)!.return_request_id),handling=(await getReturnHandling(f.db,caseId))!;
   await recordReturnHandling(f.db,f.ctx('carrier-original-physical-review',String(handling.revision)),{caseId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The physical return is waived after the documented original review.',privateNote:'The eligible reviewer checked the fictional no-return basis before closing original physical care.',evidenceReference:'FICTIONAL-CARRIER-ORIGINAL-PHYSICAL-REVIEW'});
   await advanceReturnAsAdmin(f.db,{returnRequestId:caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'The original actual refund and approved physical disposition are complete.',publicMessageEn:'Your original refund case is complete.',publicMessageNe:'Original refund complete.',requestId:'carrier-original-physical-complete',now:Date.now()});
  }
  const funding=await getRefundFundingAvailability(f.db,f.accountVersionId);
  const fundingContext=f.ctx('carrier-restored-funds',String(funding.revision));
  await recordRefundFundingStatement(f.db,fundingContext,{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-CARRIER-RESTORED-CAPITAL',asOf:fundingContext.now,cashPaisa:250000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-CARRIER-RESTORED-FUNDS',restrictionsReference:'FICTIONAL-CARRIER-RESTORED-RESERVES',availableFundsConfirmed:true,reason:'Independently review fictional actual company funds before paying the restored seller money.'});
  const payoutId='recordId'in f?await prepareFixedSupplierPayment(f.db,{recordId:f.recordId,actorId:'reviewer',destinationReference:f.sources.beneficiaryReference,requestId:'carrier-restored-payout',now:Date.now(),environment:f.environment!}):'context'in f?await prepareManagedPayout(f.db,{...f.context,requestId:'carrier-restored-payout'}):(await prepareSellerPayout(f.db,{sellerId:after.source.sellerId,actorId:'reviewer',actorRole:'super_admin',note:'Prepare the seller repayment restored by the carrier reimbursement.',requestId:'carrier-restored-payout',now:Date.now()})).id;
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('carrier-restored-packet'),{model,payoutId,accountVersionId:f.accountVersionId,...env,reason:'Prepare only the seller money restored within the reviewed carrier credit.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('carrier-restored-approved','0'),{packetId:packet.id,...env,reason:'Approve the exact restored seller entitlement and its currently verified beneficiary.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('carrier-restored-start','1'),{packetId:packet.id,...env,reason:'Record one fictional instruction paying the restored original seller money.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('carrier-restored-paid','2'),{packetId:packet.id,...env,outcome:'paid',amountPaisa:10000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-CARRIER-RESTORED-PAYMENT',evidenceReference:'FICTIONAL-CARRIER-RESTORED-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual fictional payment of restored seller money without another collection or carrier allocation.'});
  const paid=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(paid.source.blocker,null);assert.equal(paid.position.remainingPaisa,0);assert.equal(paid.position.recoveredPaisa,f.review.case.confirmedPaisa);
  if('recordId'in f)assert.equal((await getFixedSupplyBalance(f.db,f.recordId)).balancePaisa,0);
  await assert.rejects(recovery.correctSellerRecoveryLiability(f.db,f.ctx('carrier-no-gift',String(paid.case.revision)),{caseId:f.caseId,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:paid.reviewDigest,...env,evidenceReference:'FICTIONAL-CARRIER-CORRECTION-BOUNDARY',reason:'Carrier reimbursement excess needs its own reviewed disposition rather than a second seller credit.',publicMessage:'Finance must reconcile the carrier reimbursement before changing this original cost.'}),/carrier reimbursement excess/i);
 }finally{f.dispose();}
});

void test('carrier review rejects personal or seller-owned money and saved results require current independent authority',async()=>{
 const f=await carrierRecoveryFixture('registered');try{
  const body={sourceFormId:'system.recovery-finance',action:'carrier',requestId:'carrier-protected-decision',expectedRevision:'2',input:f.input};
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.review.source.ownerId);
  await assert.rejects(runRecoveryCommand(f.db,f.review.source.ownerId,body,'staff'),/personal|independent/i);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...body.input,originalCostReimbursementConfirmed:false}},'staff'),/current protected/i);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...body.input,receiptId:f.sellerReceiptId,receiptRevision:1}},'staff'),/carrier credit|carrier reimbursement/i);
  const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);
  const statement=await getSellerRecoveryStatement(f.db,f.review.source.ownerId,f.caseId);assert.equal(statement.recovered.cash,10000);assert.equal(statement.restoredPaisa,10000);assert.equal(statement.recovered.carrier,f.review.case.confirmedPaisa);assert.equal(statement.reconciliation,false);assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-CARRIER'),false);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
  await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission/i);
 }finally{f.dispose();}
});

void test('carrier reimbursement restores historical seller deductions without granting collection authority or negative future deductions',async()=>{
 const f=await historicalManagedRecoveryFixture();try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('carrier-history-open'),{kind:'refund',id:f.refundId,reason:'Review the actual historical deduction before allocating a later carrier reimbursement.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);const candidate=(await readHistoricalRecoveryCandidates(f.db,review.source))[0];
  await recovery.reviewSellerRecoveryHistory(f.db,f.ctx('carrier-history-reviewed','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,candidate,amountPaisa:f.originalPaidPaisa,evidenceReference:'FICTIONAL-CARRIER-HISTORICAL-SOURCE',reason:'Recognize the exact original actual paid deduction before the carrier later covers this cost.',publicMessage:'The original payout deduction is retained in your statement.',environment:f.context.environment});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  const receipt=await recordBankReceipt(f.db,f.ctx('carrier-history-bank'),{accountVersionId:f.payoutSources.accountVersionId,transactionIdentity:'FICTIONAL-CARRIER-HISTORY-BANK',bankAt:Date.now()-1,amountMinor:1000,currency:'NPR',payerReference:'Fictional original carrier',payerUserId:null,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-CARRIER-HISTORY-CREDIT',reason:'Independently verify a carrier reimbursement for a portion of the original historical cost.'});
  await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-history-allocated','1'),{caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:1000,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,originalCostReimbursementConfirmed:true,evidenceReference:'FICTIONAL-CARRIER-HISTORY-COST',reason:'Restore the original historical deduction covered by the actual carrier without granting new collection authority.',publicMessage:'The carrier covered part of the earlier payout deduction. That portion is restored to your balance.',environment:f.context.environment});
  const statement=await getSellerRecoveryStatement(f.db,review.source.ownerId,opened.id);
  assert.equal(statement.approvedCapPaisa,0);assert.equal(statement.position.remainingPaisa,0);assert.equal(statement.restoredPaisa,1000);assert.equal(statement.historicalRecoveredPaisa,f.originalPaidPaisa);
  assert.equal(statement.recovered.earnings-statement.historicalRecoveredPaisa,0);
 }finally{f.dispose();}
});

void test('a carrier decision consumes the original dispute so a later question keeps its own clock',async()=>{
 const f=await carrierRecoveryFixture('registered');try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const owner=(requestId:string,revision:number)=>({...f.ctx(requestId,String(revision)),actorId:f.review.source.ownerId});
  await recovery.disputeSellerRecovery(f.db,owner('carrier-old-dispute',2),{caseId:f.caseId,amountPaisa:5000,evidenceReference:null,reason:'Please review this disputed portion of the original cost before further collection.'});
  const first=(await pendingRecoveryDisputes(f.db,f.caseId))[0];assert.equal(first.remainingPaisa,5000);
  const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  const input={...f.input,reviewDigest:review.reviewDigest,amountPaisa:3000,resolveDisputedPaisa:3000};
  const saved=await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-dispute-partly-resolved','3'),input);
  assert.deepEqual(await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-dispute-partly-resolved','3'),input),saved);
  assert.deepEqual(await pendingRecoveryDisputes(f.db,f.caseId),[{...first,remainingPaisa:2000}],'Partial resolution retains the original clock.');
  const remaining=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-dispute-resolved','4'),{...input,receiptRevision:1,reviewDigest:remaining.reviewDigest,amountPaisa:2000,resolveDisputedPaisa:2000});
  assert.deepEqual(await pendingRecoveryDisputes(f.db,f.caseId),[],'A completed carrier decision must consume the old review portion.');
  await recovery.disputeSellerRecovery(f.db,owner('carrier-new-dispute',5),{caseId:f.caseId,amountPaisa:3000,evidenceReference:null,reason:'Please review this separate remaining portion using its new submission clock.'});
  const pending=await pendingRecoveryDisputes(f.db,f.caseId);
  assert.equal(pending.length,1);assert.notEqual(pending[0].id,first.id);assert.equal(pending[0].remainingPaisa,3000);assert.equal(pending[0].dueAt,pending[0].createdAt+86400000);
 }finally{f.dispose();}
});

void test('a partial carrier credit after a responsibility correction keeps the remaining cap available for review',async()=>{
 const f=await carrierRecoveryFixture('registered');try{
  await recovery.correctSellerRecoveryLiability(f.db,f.ctx('carrier-before-new-cap','2'),{caseId:f.caseId,newConfirmedPaisa:50000,resolveDisputedPaisa:0,reviewDigest:f.review.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-CARRIER-CORRECTION',reason:'Reduce the original responsibility before reviewing a partial carrier reimbursement.',publicMessage:'The original cost is reduced; its remaining collection cap requires a fresh review.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-before-cap-reviewed','3'),{...f.input,reviewDigest:review.reviewDigest,amountPaisa:1000});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(review.case.approvedCapPaisa,0);assert.equal(review.case.state,'awaiting_approval');assert.equal(review.position.remainingPaisa,39000);
  await recovery.approveSellerRecovery(f.db,f.ctx('carrier-remaining-cap-approved','4'),{caseId:f.caseId,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-CARRIER-REMAINING-CAP',reason:'Review the remaining original liability after its actual partial reimbursement.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(review.position.collectiblePaisa,39000);
 }finally{f.dispose();}
});
