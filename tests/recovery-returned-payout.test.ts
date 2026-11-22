import assert from 'node:assert/strict';
import test from 'node:test';
import {returnedPayoutRecoveryFixture} from './helpers/returned-payout-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';

for(const model of ['registered','managed','fixed'] as const)void test(`${model} actual original payout return restores overlap once and retains the original paid record`,async()=>{
 const f=await returnedPayoutRecoveryFixture(model);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const env=f.environment?{environment:f.environment}:{};
  const result=await recovery.reconcileSellerRecoveryReturnedPayout(f.db,f.ctx('returned-original-reviewed','2'),{...f.input,...env});
  assert.deepEqual(await recovery.reconcileSellerRecoveryReturnedPayout(f.db,f.ctx('returned-original-reviewed','2'),{...f.input,...env}),result);
  const current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId),expectedRestored=10000+f.original.originalPayoutPaisa-f.review.case.confirmedPaisa;
  assert.equal(current.case.confirmedPaisa,f.review.case.confirmedPaisa);assert.equal(current.position.remainingPaisa,0);assert.equal(current.position.overRecoveredPaisa,0);
  assert.equal(current.position.recoveredPaisa,f.review.case.confirmedPaisa);assert.equal(current.case.restoredPaisa,expectedRestored);
  assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM payout_transfer_packets WHERE id=? AND state='paid'").get(f.original.packetId)!.amount_paisa,f.original.originalPayoutPaisa);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').get(f.sellerReceiptId)!.n,10000,'Earlier seller receipt capacity remains consumed.');
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').get(f.returnedReceiptId)!.n,f.original.originalPayoutPaisa,'The extra 500 paisa is not silently allocated.');
  const statement=await getSellerRecoveryStatement(f.db,f.review.source.ownerId,f.caseId);assert.equal(statement.position.remainingPaisa,0);assert.equal(JSON.stringify(statement).includes('FICTIONAL-PRIVATE-RETURNED'),false);
  await assert.rejects(recovery.reconcileSellerRecoveryReturnedPayout(f.db,f.ctx('returned-original-over-cap',String(current.case.revision)),{...f.input,...env,amountPaisa:1,receiptRevision:1,reviewDigest:current.reviewDigest}),/original|principal|remaining|capacity/i);
 }finally{f.dispose();}
});

void test('returned-payout decisions require the current source, explicit confirmation and independent current authority',async()=>{
 const f=await returnedPayoutRecoveryFixture('registered');try{
  const body={sourceFormId:'system.recovery-finance',action:'payout_return',requestId:'protected-returned-payout',expectedRevision:'2',input:f.input};
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.review.source.ownerId);
  await assert.rejects(runRecoveryCommand(f.db,f.review.source.ownerId,body,'staff'),/personal|independent/i);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...body.input,originalPayoutReturnConfirmed:false}},'staff'),/current protected/i);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...body.input,payoutId:'unrelated-original-payout'}},'staff'),/original payout/i);
  const earlier=await recordBankReceipt(f.db,f.ctx('before-original-paid-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CREDIT-BEFORE-ORIGINAL-PAYOUT',bankAt:f.original.bankAt-1,amountMinor:1000,currency:'NPR',payerReference:'Fictional original seller',payerUserId:f.review.source.ownerId,evidenceReference:'FICTIONAL-EARLIER-BANK-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify a different earlier actual credit without claiming it returned a later outgoing transfer.'});
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...body.input,receiptId:earlier.id,amountPaisa:1000}},'staff'),/returned after/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_payout_return_reviews').get()!.n,0);
  const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
  await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission/i);
 }finally{f.dispose();}
});

for(const model of ['registered','managed','fixed'] as const)void test(`${model} a late original payout return preserves full company absorption without reopening collection`,async()=>{
 const f=await returnedPayoutRecoveryFixture(model);try{
  const env=f.environment?{environment:f.environment}:{},absorbed=f.review.case.confirmedPaisa-10000;
  await recovery.absorbSellerRecovery(f.db,f.ctx('returned-before-absorption','2'),{caseId:f.caseId,amountPaisa:absorbed,resolveDisputedPaisa:0,reviewDigest:f.review.reviewDigest,...env,evidenceReference:'FICTIONAL-RETURNED-ABSORPTION-PROOF',reason:'The eligible Super Admin absorbs the remaining original cost after documented review.',collectionAttempts:'The original evidence and actual earlier seller payment were reviewed before company absorption.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  await recovery.correctSellerRecoveryLiability(f.db,f.ctx('returned-before-correction','3'),{caseId:f.caseId,newConfirmedPaisa:absorbed,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,...env,evidenceReference:'FICTIONAL-RETURNED-RESPONSIBILITY-CORRECTION',reason:'The original remaining seller responsibility is overturned, restoring the collected portion.',publicMessage:'Your earlier payment is restored. The remaining original cost stays fully absorbed by the company.'});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.case.absorbedPaisa,review.case.confirmedPaisa);
  await recovery.reconcileSellerRecoveryReturnedPayout(f.db,f.ctx('returned-after-absorption','4'),{...f.input,...env,reviewDigest:review.reviewDigest});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(review.case.state,'absorbed');assert.equal(review.case.absorbedPaisa,absorbed);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.position.collectiblePaisa,0);assert.equal(review.position.remainingPaisa,0);
  assert.equal(review.case.restoredPaisa,10000+f.original.originalPayoutPaisa);
 }finally{f.dispose();}
});
