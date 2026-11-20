import assert from 'node:assert/strict';
import test from 'node:test';
import {managedRecoveryFixture,unpaidManagedRefundFixture} from './helpers/managed-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {sellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {readModelRecoveryEarnings} from '../lib/payments/recovery-earnings-models';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import * as transfers from '../lib/payments/payout-transfers';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';
import {readHistoricalRecoveryCandidates} from '../lib/payments/recovery-historical';
import {historicalManagedRecoveryFixture} from './helpers/historical-managed-recovery-fixture';

void test('an explicitly reviewed legacy company-owned debit is compensated once without creating seller debt or rewriting its paid payout',async()=>{
 const f=await managedRecoveryFixture('platform',1,true);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const source=await recovery.readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
 assert.equal(source.confirmedPaisa,0);assert.equal(source.nativeDebitPaisa,f.originalPaidPaisa);assert.equal(source.compensationPaisa,f.originalPaidPaisa);assert.ok(source.blocker);
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('source-company-open'),{kind:'refund',id:f.refundId,reason:'Review the original completed company-owned refund and its uncompensated historical native debit.'});
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 const input={caseId:opened.id,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-ORIGINAL-COMPANY-RESPONSIBILITY',reason:'Independently confirm the original company-owned cost and restore its exact native responsibility offset.',publicMessage:'The original company-owned refund cost has been removed from your earnings. You owe no recovery balance.',environment:f.context.environment};
 const result=await recovery.compensateSellerRecoverySource(f.db,f.ctx('source-company-compensation','0'),input);
 assert.deepEqual(await recovery.compensateSellerRecoverySource(f.db,f.ctx('source-company-compensation','0'),input),result);
 const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(after.source.nativeDebitPaisa,0);assert.equal(after.source.compensationPaisa,0);assert.equal(after.source.blocker,null);
 assert.equal(after.case.state,'closed_no_balance');assert.equal(after.case.confirmedPaisa,0);assert.equal(after.case.approvedCapPaisa,0);assert.equal(after.position.recoveredPaisa,0);
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM managed_settlement_entries WHERE refund_id=? AND reason_code='refund_responsibility'").get(f.refundId)!.n,f.originalPaidPaisa);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(f.payoutId)!.status,'paid');
 }finally{f.dispose();}
});

for(const pendingBank of [true,false])void test(`company source compensation preserves ${pendingBank?'reserved':'already deducted'} original money for an explicit disposition`,async()=>{
 const f=await historicalManagedRecoveryFixture({pendingBank,responsibility:'platform',legacyMissingResponsibility:true});try{
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('company-disposition-open'),{kind:'refund',id:f.refundId,reason:'Review the original company cost without reusing reserved or already deducted money.'});
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id),ledger=f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n;
 assert.equal(current.source.compensationPaisa,f.originalPaidPaisa);
 await assert.rejects(recovery.compensateSellerRecoverySource(f.db,f.ctx('company-disposition-denied','0'),{caseId:opened.id,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-COMPANY-COLLECTION-DISPOSITION',reason:'A current source compensation cannot silently dispose of a reserved or already collected historical amount.',publicMessage:'Finance is reconciling the original actual money before correcting this source.',environment:f.context.environment}),(error:unknown)=>error instanceof recovery.SellerRecoveryError&&error.status===409&&/reserved|already collected/i.test(error.message));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_source_reviews').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,ledger);
 }finally{f.dispose();}
});

void test('a company-cost offset on unpaid earnings preserves the untouched unit without exposing corrected money to automatic netting',async()=>{
 const f=await unpaidManagedRefundFixture();try{
 const original=Number(f.sqlite.prepare('SELECT calculated_paisa FROM managed_entitlements WHERE id=?').get(f.entitlementId)!.calculated_paisa),half=original/2;
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('unpaid-company-source-open'),{kind:'refund',id:f.refundId,reason:'Review the company-owned debit on original earnings that have never been paid out.'});
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(current.source.compensationPaisa,half);assert.deepEqual(current.source.originalPayoutIds,[]);
 const body={sourceFormId:'system.recovery-finance',action:'compensate_source',requestId:'unpaid-company-source-reviewed',expectedRevision:'0',input:{caseId:opened.id,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-PRIVATE-UNPAID-COMPANY-COST',reason:'Correct the original company-owned cost while retaining the untouched original unit and no invented collection.',publicMessage:'The original company-owned cost is removed from your unpaid earnings. No recovery balance is due.'}};
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(current.source.ownerId);
 await assert.rejects(runRecoveryCommand(f.db,current.source.ownerId,body,'staff',f.context.environment),/personal|independent/i);
 const result=await runRecoveryCommand(f.db,'reviewer',body,'staff',f.context.environment);
 const source=await recovery.readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
 const earnings=await readModelRecoveryEarnings(f.db,source,Date.now());
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries').get()!.n,original);
 assert.equal(earnings.amount,half);assert.equal(earnings.maxAllocationPaisa,half);
 const statement=await getSellerRecoveryStatement(f.db,source.ownerId,opened.id);assert.equal(statement.companyCompensatedPaisa,half);assert.equal(statement.recovered.earnings,0);assert.equal(statement.followup.phase,'closed');
 assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-UNPAID-COMPANY-COST'),false);
 assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);
 f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
 await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission/i);
 await assert.rejects(runRecoveryCommand(f.db,'reviewer',body,'staff',f.context.environment),/permission/i);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

void test('registered company compensation preserves the original fee reversal instead of using it to pay company cost',async()=>{
 const f=await sellerRecoveryFixture(true,'platform');try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 // Explicit isolated legacy wrong-charge fact. Current refund completion correctly
 // posts no company-owned seller debit; no current business guard is disabled.
 f.sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,refund_id,type,amount_paisa,available_at,description,created_at)
  SELECT 'legacy-company-wrong-debit','registered',request.order_item_id,r.id,'refund',-r.amount_paisa,1,'Fictional legacy wrong company-cost debit',1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id WHERE r.id=?`).run(f.refundId);
 const gross=Number(f.sqlite.prepare('SELECT amount_paisa FROM refunds WHERE id=?').get(f.refundId)!.amount_paisa);
 const commission=Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE refund_id=? AND type='commission_reversal'").get(f.refundId)!.n);assert.ok(commission>0);
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('registered-company-open'),{kind:'refund',id:f.refundId,reason:'Review the fictional old incorrect company-cost debit while preserving the original fee reversal.'});
 const before=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(before.source.compensationPaisa,gross);assert.equal(before.source.nativeDebitPaisa,gross-commission);
 await recovery.compensateSellerRecoverySource(f.db,f.ctx('registered-company-compensation','0'),{caseId:opened.id,reviewDigest:before.reviewDigest,evidenceReference:'FICTIONAL-COMPANY-COST-ORIGINAL-PROOF',reason:'Cancel the entire incorrect company-cost debit; the original fee credit remains owed to the seller.',publicMessage:'The company-owned charge is removed and your original fee reversal remains credited.'});
 const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(after.source.compensationPaisa,0);assert.equal(after.source.companyCompensatedPaisa,gross);assert.equal(after.source.blocker,null);assert.equal(after.case.state,'closed_no_balance');
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n,commission);
 const payout=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',note:'Prepare only the original retained fee credit after the company-cost correction.',requestId:'registered-company-preserved-fee',now:Date.now()});
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa,commission);
 const funding=await getRefundFundingAvailability(f.db,f.accountVersionId);
 const fundingContext=f.ctx('company-preserved-fee-funding',String(funding.revision));
 await recordRefundFundingStatement(f.db,fundingContext,{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-COMPANY-PRESERVED-FEE-CAPITAL',asOf:fundingContext.now,cashPaisa:200000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-COMPANY-PRESERVED-FEE-FUNDING',restrictionsReference:'FICTIONAL-ORIGINAL-RESTRICTED-FUNDS',availableFundsConfirmed:true,reason:'Independently verify current fictional company funds before paying the retained original fee credit.'});
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('company-preserved-fee-packet'),{model:'registered',payoutId:payout.id,accountVersionId:f.accountVersionId,reason:'Pay only the original fee credit after the entire wrong company-cost debit was cancelled.'});
 await transfers.approvePayoutTransfer(f.db,f.ctx('company-preserved-fee-approved','0'),{packetId:packet.id,reason:'Independently approve the exact native remaining fee credit and current company funding.'});
 await transfers.startPayoutTransfer(f.db,f.ctx('company-preserved-fee-start','1'),{packetId:packet.id,reason:'Record the single fictional manual instruction for the original retained fee credit.'});
 await transfers.recordPayoutTransferOutcome(f.db,f.ctx('company-preserved-fee-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:commission,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-COMPANY-PRESERVED-FEE-PAID',evidenceReference:'FICTIONAL-COMPANY-PRESERVED-FEE-BANK-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Retain the actual fictional fee-credit payment without creating a new historical recovery.'});
 const paidSource=await recovery.readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
 assert.equal(paidSource.historicalNettingPaisa,0);assert.equal(paidSource.blocker,null);assert.deepEqual(await readHistoricalRecoveryCandidates(f.db,paidSource),[]);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});
