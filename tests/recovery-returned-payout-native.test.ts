import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {returnedPayoutRecoveryFixture} from './helpers/returned-payout-recovery-fixture';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {managedRecoveryFixture,completeManagedRecoveryRefund} from './helpers/managed-recovery-fixture';
import {getReturnHandling,recordReturnHandling} from '../lib/returns/handling';
import {advanceReturnAsAdmin} from '../lib/db/repositories/returns';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../lib/payments/refund-funding';
import {checkoutCommitClock} from '../lib/checkout/commit-policy-guards';
import {getSellerRecoveryReview,openSellerRecovery,approveSellerRecovery,absorbSellerRecovery,correctSellerRecoveryLiability} from '../lib/payments/seller-recovery';

for(const model of ['registered','managed','fixed'] as const)void test(`native ${model} returned-principal races consume one original transfer and restore overlap once`,async()=>{
 const f=await returnedPayoutRecoveryFixture(model);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  const bodies=['returned-payout-race-a','returned-payout-race-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'payout_return',requestId,expectedRevision:'2',input:{...f.input,reviewDigest:review.reviewDigest}}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.environment)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled'),result=(results[winner] as PromiseFulfilledResult<unknown>).value;
  assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),result);
  assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',f.environment),result);
  const current=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  assert.equal(current.position.remainingPaisa,0);assert.equal(current.position.overRecoveredPaisa,0);
  assert.equal(current.case.restoredPaisa,10000+f.original.originalPayoutPaisa-f.review.case.confirmedPaisa);
  const pools=(await db.prepare('SELECT used_paisa AS used FROM seller_recovery_payout_return_pools').all<{used:number}>()).results;
  assert.equal(pools.length,2);assert.ok(pools.every(p=>p.used===f.original.originalPayoutPaisa));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_payout_return_reviews').first<{n:number}>())!.n,1);
  await assert.rejects(db.prepare('UPDATE seller_recovery_payout_return_pools SET used_paisa=0').run(),/projection/i);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_payout_return_reviews').run(),/retained/i);
  await assert.rejects(db.prepare('UPDATE seller_recovery_payout_return_restorations SET amount_paisa=1').run(),/retained/i);
 }finally{await native?.dispose();f.dispose();}
});

void test('native separate original refunds cannot return the same paid principal twice',async()=>{
 const f=await managedRecoveryFixture('seller',2);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const originalReturnCase=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(f.refundId)!.return_request_id),handling=(await getReturnHandling(f.db,originalReturnCase))!;
  await recordReturnHandling(f.db,f.ctx('shared-return-physical-review',String(handling.revision)),{caseId:originalReturnCase,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The first physical return is waived after the documented review.',privateNote:'The eligible reviewer checked the fictional first no-return basis before accepting another unit claim.',evidenceReference:'FICTIONAL-SHARED-RETURN-PHYSICAL-REVIEW'});
  await advanceReturnAsAdmin(f.db,{returnRequestId:originalReturnCase,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'The original actual refund and approved physical disposition are complete.',publicMessageEn:'Your first original refund case is complete.',publicMessageNe:'First original refund complete.',requestId:'shared-return-physical-complete',now:Date.now()});
  const account=f.payoutSources.accountVersionId,funding=await getRefundFundingAvailability(f.db,account),now=(await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} now`).first<{now:number}>())!.now;
  await recordRefundFundingStatement(f.db,{...f.ctx('shared-return-original-funds',String(funding.revision)),now},{accountVersionId:account,statementIdentity:'FICTIONAL-SHARED-ORIGINAL-REFUND-FUNDS',asOf:now,cashPaisa:500000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-SHARED-REFUND-CAPITAL',restrictionsReference:'FICTIONAL-SHARED-REFUND-RESERVES',availableFundsConfirmed:true,reason:'Independently verify fictional actual funds for the second customer refund without waiting for seller recovery.'});
  const second=await completeManagedRecoveryRefund({...f,payoutSources:{...f.payoutSources,fundingId:String(f.sqlite.prepare('SELECT statement_id FROM company_funding_accounts WHERE account_id=(SELECT account_id FROM company_payment_account_versions WHERE id=?)').get(account)!.statement_id)}},'seller','returned-second-original',50000);
  const cases:{caseId:string;receiptId:string}[]=[];
  for(const [index,refundId] of [f.refundId,second.refundId].entries()){
   const opened=await openSellerRecovery(f.db,f.ctx('shared-return-open-'+index),{kind:'refund',id:refundId,reason:'Review an original actual refund sharing the same completed native seller payout.'});
   let review=await getSellerRecoveryReview(f.db,'reviewer',opened.id);
   await approveSellerRecovery(f.db,f.ctx('shared-return-approve-'+index,'0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-SHARED-ORIGINAL-RESPONSIBILITY',reason:'Approve only this original refund responsibility, preserving the other original case separately.'});
   review=await getSellerRecoveryReview(f.db,'reviewer',opened.id);
   const bankAt=(await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} now`).first<{now:number}>())!.now;
   const receipt=await recordBankReceipt(f.db,{...f.ctx('shared-return-receipt-'+index),now:bankAt},{accountVersionId:account,transactionIdentity:'FICTIONAL-SHARED-RETURN-RECEIPT-'+index,bankAt,amountMinor:60000,currency:'NPR',payerReference:'Fictional original maker',payerUserId:review.source.ownerId,evidenceReference:'FICTIONAL-SHARED-ACTUAL-RETURNED-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify a separate actual bank credit; any amount beyond original paid principal remains unallocated.'});
   cases.push({caseId:opened.id,receiptId:receipt.id});
  }
  native=await nativeFinanceClone(f.sqlite);const db=native.db;
  const reviews=await Promise.all(cases.map(c=>getSellerRecoveryReview(db,'reviewer',c.caseId)));
  const bodies=reviews.map((review,index)=>({sourceFormId:'system.recovery-finance',action:'payout_return',requestId:'shared-return-race-'+index,expectedRevision:'1',input:{caseId:review.case.id,payoutId:f.payoutId,receiptId:cases[index].receiptId,receiptRevision:0,amountPaisa:60000,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,originalPayoutReturnConfirmed:true,evidenceReference:'FICTIONAL-SHARED-ORIGINAL-PAYOUT-LINK',reason:'Match this actual returned credit to the same original paid source without exceeding its shared principal.',publicMessage:'This actual return is recorded against the original payout and this case.'}}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.context.environment)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const loser=results.findIndex(r=>r.status==='rejected'),fresh=await getSellerRecoveryReview(db,'reviewer',cases[loser].caseId),remaining=f.originalPaidPaisa-60000;
  assert.equal(fresh.source.originalPaidPayouts![0].availablePaisa,remaining);
  await runRecoveryCommand(db,'reviewer',{...bodies[loser],requestId:'shared-return-refreshed',input:{...bodies[loser].input,amountPaisa:remaining,reviewDigest:fresh.reviewDigest}},'staff',f.context.environment);
  assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_payout_return_reviews').first<{n:number}>())!.n,f.originalPaidPaisa);
  assert.equal((await db.prepare("SELECT used_paisa n FROM seller_recovery_payout_return_pools WHERE scope_id=''").first<{n:number}>())!.n,f.originalPaidPaisa);
  assert.equal((await db.prepare('SELECT amount_paisa n FROM managed_payouts WHERE id=?').bind(f.payoutId).first<{n:number}>())!.n,f.originalPaidPaisa);
 }finally{await native?.dispose();f.dispose();}
});

void test('native returned principal after full absorption never reopens seller collection',async()=>{
 const f=await returnedPayoutRecoveryFixture('fixed');let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  const env={environment:f.environment},absorbed=f.review.case.confirmedPaisa-10000;
  await absorbSellerRecovery(f.db,f.ctx('native-returned-absorb','2'),{caseId:f.caseId,amountPaisa:absorbed,resolveDisputedPaisa:0,reviewDigest:f.review.reviewDigest,...env,evidenceReference:'FICTIONAL-NATIVE-RETURN-ABSORB',reason:'The eligible independent reviewer absorbs the remaining cost after checking all actual sources.',collectionAttempts:'The actual previous bank repayment and original seller circumstances were reviewed.'});
  let review=await getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  await correctSellerRecoveryLiability(f.db,f.ctx('native-returned-correct','3'),{caseId:f.caseId,newConfirmedPaisa:absorbed,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,...env,evidenceReference:'FICTIONAL-NATIVE-RETURN-CORRECTION',reason:'The collected part of the original responsibility is overturned after independent evidence review.',publicMessage:'The earlier collection is restored. The remaining cost stays absorbed by the company.'});
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);review=await getSellerRecoveryReview(native.db,'reviewer',f.caseId);
  await runRecoveryCommand(native.db,'reviewer',{sourceFormId:'system.recovery-finance',action:'payout_return',requestId:'native-returned-after-absorption',expectedRevision:'4',input:{...f.input,reviewDigest:review.reviewDigest}},'staff',f.environment);
  review=await getSellerRecoveryReview(native.db,'reviewer',f.caseId);
  assert.equal(review.case.state,'absorbed');assert.equal(review.case.absorbedPaisa,absorbed);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.position.collectiblePaisa,0);assert.equal(review.position.remainingPaisa,0);assert.equal(review.case.restoredPaisa,10000+f.original.originalPayoutPaisa);
 }finally{await native?.dispose();f.dispose();}
});
