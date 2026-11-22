import assert from 'node:assert/strict';
import test from 'node:test';
import {reservedManagedRefundFixture} from './helpers/reserved-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {prepareManagedPayout} from '../lib/db/repositories/managed-settlements';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import {sellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';
import {prepareFixedSupplierPayment} from '../lib/managed-commerce/fixed-supply';
import {retiredRecoveryPayoutSql} from '../lib/payments/recovery-payout-retirement';

for(const outcome of ['prepared','no_debit','debit_returned'] as const)void test(`a reviewed ${outcome} original instruction releases only its reservation and prepares fresh net earnings`,async()=>{
 const f=await reservedManagedRefundFixture(outcome);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('reserved-source-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the original retained payout reservation against the actual completed partial customer refund.'});
 const before=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(before.source.unpaidSource,null);
 const ledger=f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,receipts=f.sqlite.prepare('SELECT COUNT(*) n FROM company_money_receipts').get()!.n;
 const input={caseId:opened.id,payoutId:f.payoutId,reviewDigest:before.reviewDigest,noFundsRemainSentConfirmed:true,evidenceReference:'FICTIONAL-PRIVATE-ORIGINAL-RESERVATION-DISPOSITION',reason:'Review the original instruction evidence and retire only the unsent or fully reconciled returned reservation.',publicMessage:'The old unpaid payout reservation is retired. Finance will review the remaining original earnings before a fresh payout.',environment:f.context.environment};
 const result=await recovery.retireSellerRecoveryPayoutSource(f.db,f.ctx('reserved-source-retired','0'),input);
 assert.deepEqual(await recovery.retireSellerRecoveryPayoutSource(f.db,f.ctx('reserved-source-retired','0'),input),result);
 assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(f.payoutId)!.status,'rejected');
 assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(f.packetId)!.state,outcome==='prepared'?'void':'failed');
 assert.equal(f.sqlite.prepare('SELECT disposition FROM managed_payout_allocations WHERE payout_id=?').get(f.payoutId)!.disposition,'released');
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.ok(current.source.unpaidSource);
 await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('reserved-unpaid-reviewed','1'),{caseId:opened.id,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-REFRESHED-ORIGINAL-UNPAID-PROOF',reason:'Review the now released original earnings against the original native refund adjustment, without claiming cash recovery.',publicMessage:'The original refund is covered by original unpaid earnings. The remaining unit stays payable.',environment:f.context.environment});
 const fresh=await prepareManagedPayout(f.db,{...f.context,requestId:'reserved-source-fresh-payout'});assert.notEqual(fresh,f.payoutId);
 assert.equal(f.sqlite.prepare(`SELECT ${retiredRecoveryPayoutSql('managed','p.id','p.seller_id')} AS retired FROM managed_payouts p WHERE p.id=?`).get(fresh)!.retired,0,'Another retirement must not classify this fresh payout as retired.');
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(fresh)!.amount_paisa,f.originalAmountPaisa/2);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n,ledger);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_money_receipts').get()!.n,receipts);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{f.dispose();}
});

for(const outcome of ['prepared','no_debit','debit_returned'] as const)void test(`registered ${outcome} source keeps instruction history and releases original funds for fresh partial-refund preparation`,async()=>{
 const f=await sellerRecoveryFixture(true,'seller',true,40000,outcome);try{
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('registered-retirement-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the actual original registered instruction before using its original unpaid earnings.'});
 const before=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await recovery.retireSellerRecoveryPayoutSource(f.db,f.ctx('registered-retirement-reviewed','0'),{caseId:opened.id,payoutId:f.payoutId,reviewDigest:before.reviewDigest,noFundsRemainSentConfirmed:true,evidenceReference:'FICTIONAL-REGISTERED-RETIREMENT-PROOF',reason:'Confirm the complete original outcome and explicitly release the retained old reservation without treating it as money received.',publicMessage:'The old original reservation is retired for a fresh review of the remaining earnings.'});
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.ok(current.source.unpaidSource);
 await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('registered-released-unpaid','1'),{caseId:opened.id,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-REGISTERED-RELEASED-EARNINGS',reason:'Recognize the completed original partial refund against wholly unpaid original earnings after audited release.',publicMessage:'Your original refund used unpaid earnings. The remaining original earnings are payable.'});
 assert.equal((await getSellerRecoveryStatement(f.db,'registered-owner',opened.id)).reconciliation,false);
 const fresh=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',note:'Prepare the remaining original net earnings in a fresh payout.',requestId:'registered-retirement-fresh',now:Date.now()});
 assert.equal((await getSellerRecoveryStatement(f.db,'registered-owner',opened.id)).reconciliation,false,'Preparing remaining original earnings must not reopen a settled original deduction.');
 assert.notEqual(fresh.id,f.payoutId);assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(fresh.id)!.amount_paisa,36400);
 assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(f.originalPacketId)!.state,outcome==='prepared'?'void':'failed');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal((await getSellerRecoveryStatement(f.db,'registered-owner',opened.id)).original.payouts.find(p=>p.id===f.payoutId)?.status,'rejected');
 }finally{f.dispose();}
});

for(const outcome of ['prepared','no_debit','debit_returned'] as const)void test(`fixed supplier ${outcome} source retains accepted-goods accounting and prepares its adjusted obligation afresh`,async()=>{
 const f=await fixedRecoveryFixture(outcome);try{
 const initial=await recovery.readSellerRecoverySource(f.db,{kind:'supplier_adjustment',id:f.adjustmentId});assert.ok(initial.blocker,'An original instruction needs explicit retained disposition even when its native label is failed.');
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('fixed-retirement-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Reconcile the actual original accepted-goods instruction independently of customer resale or refund.'});
 const before=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await recovery.retireSellerRecoveryPayoutSource(f.db,f.ctx('fixed-retirement-reviewed','0'),{caseId:opened.id,payoutId:f.payoutId,reviewDigest:before.reviewDigest,noFundsRemainSentConfirmed:true,evidenceReference:'FICTIONAL-FIXED-RETIREMENT-PROOF',reason:'Retire only the independently reconciled original instruction and reserve accepted goods for a fresh net payment.',publicMessage:'The old supplier instruction is retired. Your remaining accepted-goods entitlement is ready for fresh preparation.',environment:f.environment});
 const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(current.source.blocker,null);assert.equal(current.source.confirmedPaisa,0);
 if(current.case.blocker||current.case.exposurePaisa)await recovery.refreshSellerRecoveryZeroSource(f.db,f.ctx('fixed-retirement-zero-reviewed','1'),{caseId:opened.id,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-FIXED-REFRESHED-ZERO-BALANCE',reason:'Confirm the current accepted-goods obligation has no recovery liability after the old instruction was explicitly retired.',publicMessage:'No supplier recovery is owed. The adjusted accepted-goods entitlement remains payable.',environment:f.environment});
 const fresh=await prepareFixedSupplierPayment(f.db,{recordId:f.recordId,actorId:'reviewer',destinationReference:f.sources.beneficiaryReference,requestId:'fixed-retirement-fresh',now:Date.now(),environment:f.environment});
 assert.notEqual(fresh,f.payoutId);assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_supplier_payments WHERE id=?').get(fresh)!.amount_paisa,60000);
 assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(f.packetId)!.state,outcome==='prepared'?'void':'failed');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 assert.equal((await getSellerRecoveryStatement(f.db,current.source.ownerId,opened.id)).original.payouts.find(p=>p.id===f.payoutId)?.status,'cancelled');
 }finally{f.dispose();}
});

for(const outcome of ['paid','uncertain'] as const)void test(`a ${outcome} original payout cannot be retired by a claimed no-funds confirmation`,async()=>{
 const f=await(outcome==='paid'?managedRecoveryFixture():reservedManagedRefundFixture('uncertain'));try{
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('unsafe-retirement-open'),{kind:'refund',id:f.refundId,reason:'Review the retained original payout outcome without misclassifying actual or uncertain money.'});
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.deepEqual(review.source.retirementSources,[]);
 await assert.rejects(recovery.retireSellerRecoveryPayoutSource(f.db,f.ctx('unsafe-retirement-denied','0'),{caseId:opened.id,payoutId:f.payoutId,reviewDigest:review.reviewDigest,noFundsRemainSentConfirmed:true,evidenceReference:'FICTIONAL-UNSUPPORTED-RETIREMENT-CLAIM',reason:'An operator claim cannot erase actual or uncertain original payout history.',publicMessage:'Finance is reconciling the original actual bank outcome.',environment:f.context.environment}),/Paid, processing|exact original/i);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_payout_retirements').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(f.payoutId)!.status,outcome==='paid'?'paid':'processing');
 }finally{f.dispose();}
});

void test('protected retirement requires current independent authority and keeps original source evidence private on saved-outcome recovery',async()=>{
 const f=await reservedManagedRefundFixture();try{
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('private-retirement-open'),{kind:'refund',id:f.refundId,reason:'Review the original unsent reservation through the protected Finance command.'});
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 const body={sourceFormId:'system.recovery-finance',action:'retire_payout',requestId:'private-retirement-command',expectedRevision:'0',input:{caseId:opened.id,payoutId:f.payoutId,reviewDigest:review.reviewDigest,noFundsRemainSentConfirmed:true,evidenceReference:'FICTIONAL-PRIVATE-RETIREMENT-EVIDENCE',reason:'FICTIONAL-PRIVATE-RETIREMENT-REASON: verify no payout was sent before releasing the original reservation.',publicMessage:'The old reservation is retired for a fresh review of the remaining original earnings.'}};
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(review.source.ownerId);
 await assert.rejects(runRecoveryCommand(f.db,review.source.ownerId,body,'staff',f.context.environment),/personal|independent/i);
 const result=await runRecoveryCommand(f.db,'reviewer',body,'staff',f.context.environment);assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);
 const statement=await getSellerRecoveryStatement(f.db,review.source.ownerId,opened.id);assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-RETIREMENT'),false);assert.equal(statement.events.at(-1)?.message,body.input.publicMessage);
 assert.equal(statement.original.payouts.find(p=>p.id===f.payoutId)?.status,'rejected');
 f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
 await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission/i);
 }finally{f.dispose();}
});
