import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryLiabilityCorrection} from '../lib/payments/recovery-liability-correction';
import {approvedSellerRecoveryFixture,agreedSellerRecoveryFixture,sellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {getFixedSupplyBalance,prepareFixedSupplierPayment} from '../lib/managed-commerce/fixed-supply';
import * as transfers from '../lib/payments/payout-transfers';
import {readSellerRecoverySource} from '../lib/payments/seller-recovery';
import {readFixedPayoutSource} from '../lib/payments/payout-transfer-fixed';
import {recoveryPayoutReadySql} from '../lib/payments/recovery-payout-policy';
import {prepareSellerPayout} from '../lib/db/repositories/payouts';

void test('a responsibility correction restores collected money with one native credit',()=>{
 assert.deepEqual(recoveryLiabilityCorrection({confirmed:10000,absorbed:2000,recovered:6000,disputed:3000,newConfirmed:4000,resolveDisputed:3000}),{
  confirmedPaisa:4000,absorbedPaisa:2000,disputedPaisa:0,releasedAbsorptionPaisa:0,
  nativeCreditPaisa:6000,restoredPaisa:4000,recoveredPaisa:2000,remainingPaisa:0,debtEliminatedPaisa:2000,
 });
 assert.deepEqual(recoveryLiabilityCorrection({confirmed:10000,absorbed:8000,recovered:1000,disputed:0,newConfirmed:2000,resolveDisputed:0}),{
  confirmedPaisa:2000,absorbedPaisa:2000,disputedPaisa:0,releasedAbsorptionPaisa:6000,
  nativeCreditPaisa:2000,restoredPaisa:1000,recoveredPaisa:0,remainingPaisa:0,debtEliminatedPaisa:1000,
 });
});

for(const model of ['managed','fixed'] as const)void test(`${model} correction releases superseded absorption and restores money in its own native model`,async()=>{
 const make=async()=>{if(model==='fixed'){const f=await fixedRecoveryFixture();return {...f,source:{kind:'supplier_adjustment' as const,id:f.adjustmentId},accountVersionId:f.sources.accountVersionId,nativeBalance:async()=>{const balance=await getFixedSupplyBalance(f.db,f.recordId);return balance.balancePaisa-balance.recoverablePaisa;},verifyRestoredPayout:async()=>{
  const destination=String(f.sqlite.prepare('SELECT destination_reference FROM managed_supplier_payments WHERE id=?').get(f.payoutId)!.destination_reference);
  const payoutId=await prepareFixedSupplierPayment(f.db,{recordId:f.recordId,actorId:'reviewer',destinationReference:destination,requestId:'restored-supplier-entitlement',now:Date.now(),environment:f.environment});
  const source=await readFixedPayoutSource(f.db,payoutId,'reviewer',Date.now());assert.equal(source.amountPaisa,10000);
  assert.ok(JSON.parse(source.snapshot).recoveryCredits.some((credit:{kind:string})=>credit.kind==='correction'));
  await f.db.batch(source.guards);
  const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('restored-supplier-packet'),{model:'fixed',payoutId,accountVersionId:f.sources.accountVersionId,environment:f.environment,reason:'Prepare the independently restored supplier entitlement without rewriting its original paid instruction.'});
  await transfers.approvePayoutTransfer(f.db,f.ctx('restored-supplier-approved','0'),{packetId:packet.id,environment:f.environment,reason:'Approve the exact current restored supplier entitlement and original verified beneficiary.'});
  await transfers.startPayoutTransfer(f.db,f.ctx('restored-supplier-start','1'),{packetId:packet.id,environment:f.environment,reason:'Record one fictional instruction paying the restored supplier entitlement.'});
  await transfers.recordPayoutTransferOutcome(f.db,f.ctx('restored-supplier-paid','2'),{packetId:packet.id,environment:f.environment,outcome:'paid',amountPaisa:10000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-RESTORED-SUPPLIER-PAYMENT',evidenceReference:'FICTIONAL-RESTORED-SUPPLIER-BANK',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual fictional payment of restored collected money without recreating the corrected liability.'});
  const original=await readSellerRecoverySource(f.db,{kind:'supplier_adjustment',id:f.adjustmentId});assert.equal(original.confirmedPaisa,0);assert.equal(original.blocker,null);

 }};}
  const f=await managedRecoveryFixture();return {...f,source:{kind:'refund' as const,id:f.refundId},accountVersionId:f.payoutSources.accountVersionId,environment:f.context.environment,nativeBalance:async()=>Number(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries WHERE entitlement_id=?').get(f.entitlementId)!.n)-f.originalPaidPaisa};};
 const f=await make();try{
 const path='../lib/payments/seller-recovery',m=await import(path);
 const opened=await m.openSellerRecovery(f.db,f.ctx('model-correction-open'),{...f.source,reason:'Reconcile the original actual paid source before a responsibility correction.'});
 let review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await m.approveSellerRecovery(f.db,f.ctx('model-correction-approved','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-MODEL-ORIGINAL-REVIEW',reason:'Approve the original actual liability with one independent eligible Super Admin.'});
 const receipt=await recordBankReceipt(f.db,f.ctx('model-correction-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-MODEL-CORRECTION-CREDIT',bankAt:Date.now()-1,amountMinor:10000,currency:'NPR',payerReference:'Fictional original seller',payerUserId:review.source.ownerId,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-MODEL-ORIGINAL-CREDIT',reason:'Independently verify the actual original seller credit before its later correction.'});
 await m.allocateSellerRecoveryReceipt(f.db,f.ctx('model-correction-cash','1'),{caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:10000,method:'cash',environment:f.environment,evidenceReference:'FICTIONAL-MODEL-CASH-ALLOCATION',reason:'Apply this actual credit once to the existing original native liability.'});
 review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await m.absorbSellerRecovery(f.db,f.ctx('model-correction-absorption','2'),{caseId:opened.id,amountPaisa:5000,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,environment:f.environment,evidenceReference:'FICTIONAL-ORIGINAL-COMPANY-ABSORPTION',collectionAttempts:'The original documented collection attempt supports this approved commercial absorption.',reason:'Approve this company-borne portion before later original evidence changes responsibility.'});
 review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);const before=await f.nativeBalance();
 await m.correctSellerRecoveryLiability(f.db,f.ctx('model-correction-approved-final','3'),{caseId:opened.id,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,environment:f.environment,evidenceReference:'FICTIONAL-MODEL-RESPONSIBILITY-OVERTURNED',reason:'New original source evidence overturns this responsibility and supersedes the earlier company absorption.',publicMessage:'This liability is removed. Your NPR 100 repayment is restored to your seller balance.'});
 const after=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(after.case.confirmedPaisa,0);assert.equal(after.case.absorbedPaisa,0);assert.equal(after.case.restoredPaisa,10000);assert.equal(after.position.recoveredPaisa,0);
 assert.equal(await f.nativeBalance(),before+review.case.confirmedPaisa-5000);assert.equal(await f.nativeBalance(),10000);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_reductions').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations').get()!.n,10000);
 assert.equal((await (await import('../lib/payments/recovery-earnings-models')).readModelRecoveryEarnings(f.db,after.source,Date.now())).amount,0,'Restored money requires its own disposition; it is not new earnings for another case.');
 if('verifyRestoredPayout' in f)await f.verifyRestoredPayout();
 }finally{f.dispose();}
});

void test('an original responsibility correction restores overcollection without freeing the spent receipt or rewriting paid history',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/seller-recovery',m=await import(path);
 const receipt=await recordBankReceipt(f.db,f.ctx('correction-actual-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CORRECTION-REPAYMENT',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Fictional registered seller',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-ORIGINAL-CREDIT-EVIDENCE',reason:'Independently verify the actual original seller repayment before its later responsibility correction.'});
 await m.allocateSellerRecoveryReceipt(f.db,f.ctx('correction-apply-original-credit','1'),{caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash',evidenceReference:'FICTIONAL-ORIGINAL-CREDIT-ALLOCATION',reason:'Allocate the actual original repayment once against its current approved cap.'});
 await m.disputeSellerRecovery(f.db,{...f.ctx('correction-original-dispute','2'),actorId:'registered-owner'},{caseId:f.recoveryId,amountPaisa:20000,reason:'Please review this collected portion of the original responsibility.',evidenceReference:null});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),before=Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n);
 const input={caseId:f.recoveryId,newConfirmedPaisa:10000,resolveDisputedPaisa:10000,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-APPROVED-RESPONSIBILITY-CORRECTION',reason:'The reviewed original defect responsibility was partly overturned by documented original evidence.',publicMessage:'Your responsibility is reduced to NPR 100. The extra NPR 100 you paid is restored to your seller balance. The remaining collected portion is still under review.'};
 const ctx=f.ctx('correction-approve','3'),saved=await m.correctSellerRecoveryLiability(f.db,ctx,input);
 assert.deepEqual(await m.correctSellerRecoveryLiability(f.db,ctx,input),saved);
 const after=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(after.position.recoveredPaisa,10000);assert.equal(after.position.remainingPaisa,0);
 assert.equal(after.case.restoredPaisa,10000);assert.equal(after.case.confirmedPaisa,10000);
 assert.equal(Number(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n),before+f.originalPaidPaisa-10000);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations').get()!.n,20000);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_liability_corrections').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)!.status,'paid');
 assert.throws(()=>f.sqlite.prepare("INSERT INTO manual_receipt_uses(id,receipt_id,kind,target_id,amount_minor,state,created_by,created_at) VALUES('restored-credit-reuse',?,'return','another-use',1,'reserved','reviewer',1)").run(receipt.id),/balance/);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM seller_recovery_liability_corrections').run(),/retained/);
 assert.equal(after.case.disputedPaisa,10000);
 assert.equal((await f.db.prepare('SELECT ('+m.registeredRecoveryEarningsSql()+') AS amount').bind('registered',Date.now()).first<{amount:number}>())!.amount,0);
 assert.equal((await (await import('../lib/payments/recovery-disputes')).pendingRecoveryDisputes(f.db,f.recoveryId))[0].remainingPaisa,10000);
 assert.ok(await f.db.prepare('SELECT 1 WHERE '+recoveryPayoutReadySql("s.id",'registered').replaceAll('s.id',"'registered'")).first(),'A dispute about already-collected money cannot withhold an independently approved restoration.');
 const payout=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',requestId:'approved-restoration-payout',note:'Prepare only the native restored entitlement while the other already-collected portion stays under review.',now:Date.now()});
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa,10000);
 }finally{f.dispose();}
});

void test('correction conserves debt elimination and restoration across partial collection and absorption',()=>{
 for(let confirmed=10;confirmed<=100;confirmed+=10)for(let absorbed=0;absorbed<=confirmed;absorbed+=10)
  for(let recovered=0;recovered<=confirmed-absorbed;recovered+=10)for(let newConfirmed=0;newConfirmed<confirmed;newConfirmed+=5){
   const result=recoveryLiabilityCorrection({confirmed,absorbed,recovered,disputed:0,newConfirmed,resolveDisputed:0});
   assert.equal(result.nativeCreditPaisa,result.debtEliminatedPaisa+result.restoredPaisa);
   assert.equal(recovered-(confirmed-absorbed)+result.nativeCreditPaisa,result.restoredPaisa-result.remainingPaisa);
   assert.equal(result.recoveredPaisa+result.restoredPaisa,recovered);
   assert.equal(result.confirmedPaisa-result.absorbedPaisa,result.recoveredPaisa+result.remainingPaisa);
  }
});

void test('corrections require exact bounded source amounts and explicit treatment of affected disputes',()=>{
 const valid={confirmed:10000,absorbed:0,recovered:9000,disputed:5000,newConfirmed:7000,resolveDisputed:3000};
 assert.equal(recoveryLiabilityCorrection(valid).disputedPaisa,2000);
 for(const update of [{newConfirmed:10001},{newConfirmed:10000},{newConfirmed:-1},{recovered:10001},{newConfirmed:0,resolveDisputed:0},{resolveDisputed:4000},{absorbed:10001},{confirmed:Number.MAX_SAFE_INTEGER+1},{recovered:0.5}]){
  assert.throws(()=>recoveryLiabilityCorrection({...valid,...update}));
 }
 const result=recoveryLiabilityCorrection({confirmed:Number.MAX_SAFE_INTEGER,absorbed:0,recovered:Number.MAX_SAFE_INTEGER,disputed:0,newConfirmed:0,resolveDisputed:0});
 assert.equal(result.restoredPaisa,Number.MAX_SAFE_INTEGER);
 assert.equal(result.nativeCreditPaisa,Number.MAX_SAFE_INTEGER);
});

void test('a corrected remaining liability supersedes old demands and creates prospective owned review',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const m=await import('../lib/payments/seller-recovery'),commands=await import('../lib/payments/recovery-commands'),followup=await import('../lib/payments/recovery-followup');
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),started=Date.now();
 await commands.runRecoveryCommand(f.db,'reviewer',{sourceFormId:'system.recovery-finance',requestId:'corrected-remaining-command',expectedRevision:'1',action:'correct',input:{caseId:f.recoveryId,newConfirmedPaisa:review.case.confirmedPaisa-10000,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PRIVATE-CORRECTION-SOURCE',reason:'Approve a documented reduction in original responsibility while retaining the remaining obligation.',publicMessage:'Your responsibility is reduced by NPR 100. Finance will review revised terms before any further collection.'}},'staff');
 const current=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(current.case.approvedCapPaisa,0);assert.equal(current.case.planJson,null);assert.equal(current.position.collectiblePaisa,0);
 const source=await followup.recoveryReviewSource(f.db,f.recoveryId);
 assert.equal(source.status,'corrected_arrangement_review');assert.ok(source.startedAt>=started-5000);assert.equal(source.dueAt-source.startedAt,86400000);
 assert.equal(f.sqlite.prepare("SELECT owner_id FROM review_tasks WHERE source_type='recovery_review' AND source_id=?").get(f.recoveryId)!.owner_id,'reviewer');
 const notifications=await import('../lib/operations/event-catalog');
 assert.equal(await notifications.isCurrentOperationalNotice(f.db,{template:'business.seller.recovery',relatedId:f.recoveryId,userId:'registered-owner',audience:'seller',channel:'email',requestId:await notifications.operationalNotificationRequestId('business.seller.recovery','approved-fixture-decision','owner','email')}),false);
 const view=await (await import('../lib/payments/recovery-workspace')).getSellerRecoveryStatement(f.db,'registered-owner',f.recoveryId);
 assert.equal(view.liabilityReducedPaisa,10000);assert.equal(JSON.stringify(view).includes('FICTIONAL-PRIVATE-CORRECTION-SOURCE'),false);
 assert.equal((await commands.recoverRecoveryCommand(f.db,'reviewer','corrected-remaining-command','staff'))!.id,f.recoveryId);
 f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
 await assert.rejects(commands.recoverRecoveryCommand(f.db,'reviewer','corrected-remaining-command','staff'));
 }finally{f.dispose();}
});

for(const change of ['authority','receipt_reversal'] as const)void test(`correction commits nothing when ${change} changes at the write boundary`,async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const m=await import('../lib/payments/seller-recovery');
 const receipt=await recordBankReceipt(f.db,f.ctx('boundary-correction-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-BOUNDARY-CORRECTION-CREDIT',bankAt:Date.now()-1000,amountMinor:1000,currency:'NPR',payerReference:'Fictional original seller',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-CORRECTION-BOUNDARY-PROOF',reason:'Independently verify the original actual seller repayment before the source boundary changes.'});
 await m.allocateSellerRecoveryReceipt(f.db,f.ctx('boundary-correction-allocation','1'),{caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:1000,method:'cash',evidenceReference:'FICTIONAL-CORRECTION-BOUNDARY-ALLOCATION',reason:'Apply the verified original credit once to its existing original liability.'});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);let batches=0;
 const raced=Object.create(f.db) as D1Database;raced.batch=async statements=>{batches++;if(change==='authority')f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='reviewer'").run();else await (await import('../lib/payments/receipt-corrections')).recordReceiptReversal(f.db,f.ctx('boundary-actual-reversal','1'),{receiptId:receipt.id,amountMinor:1000,transactionIdentity:'FICTIONAL-CORRECTION-BOUNDARY-REVERSAL',bankAt:Date.now()-1000,evidenceReference:'FICTIONAL-INDEPENDENT-REVERSAL-PROOF',reason:'Independently verify the actual bank reversal before committing any restitution.'});return f.db.batch(statements);};
 await assert.rejects(m.correctSellerRecoveryLiability(raced,f.ctx('boundary-correction-decision','2'),{caseId:f.recoveryId,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-BOUNDARY-RESPONSIBILITY-REVIEW',reason:'Overturn responsibility only while actual collections and independent authority remain current.',publicMessage:'Your responsibility decision requires the actual original payment facts to remain current.'}));
 assert.equal(batches,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_liability_corrections').get()!.n,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='recovery_correction'").get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.revision,change==='receipt_reversal'?3:2);
 }finally{f.dispose();}
});

void test('correcting already netted earnings restores the native payout once without recycling it into another recovery',async()=>{
 const f=await agreedSellerRecoveryFixture();try{
 const m=await import('../lib/payments/seller-recovery');
 f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('correction-earned-source','registered','sale',50000,1,'Fictional eligible original later earnings',1)").run();
 await m.applySellerRecoveryEarnings(f.db,f.ctx('correction-original-netting','3'),{caseId:f.recoveryId});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await m.correctSellerRecoveryLiability(f.db,f.ctx('correction-restored-earnings','4'),{caseId:f.recoveryId,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-ORIGINAL-NETTING-CORRECTION',reason:'The original responsibility is overturned after actual eligible earnings were allocated.',publicMessage:'Your liability is removed and the NPR 500 previously applied from earnings is restored to your balance.'});
 const after=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(after.case.restoredPaisa,50000);assert.equal(after.position.recoveredPaisa,0);
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n,50000);
 assert.equal((await f.db.prepare('SELECT ('+m.registeredRecoveryEarningsSql()+') amount').bind('registered',Date.now()+1000).first<{amount:number}>())!.amount,0);
 const payout=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',requestId:'restored-earned-payout',note:'Prepare the single restored native entitlement after responsibility was overturned.',now:Date.now()});
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa,50000);
 }finally{f.dispose();}
});

void test('overturning an already absorbed liability changes its basis without issuing another native credit',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const m=await import('../lib/payments/seller-recovery');let review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 await m.absorbSellerRecovery(f.db,f.ctx('fully-absorbed-original-liability','1'),{caseId:f.recoveryId,amountPaisa:review.case.confirmedPaisa,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-FULL-COMPANY-ABSORPTION',collectionAttempts:'The retained original collection attempts support this approved company cost.',reason:'One eligible Super Admin approves the full original company absorption.'});
 review=await m.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);const before=f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n;
 await m.correctSellerRecoveryLiability(f.db,f.ctx('overturn-absorbed-responsibility','2'),{caseId:f.recoveryId,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-OVERTURNED-ABSORBED-SOURCE',reason:'Original evidence overturns responsibility and supersedes the historical absorption without more money.',publicMessage:'You owe nothing. The earlier company absorption is reclassified by this responsibility correction.'});
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").get()!.n,before);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='recovery_correction'").get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT native_credit_paisa FROM seller_recovery_liability_corrections').get()!.native_credit_paisa,0);
 }finally{f.dispose();}
});

void test('a completed initial responsibility correction does not leave a stale first-review task',async()=>{
 const f=await sellerRecoveryFixture();try{
 const m=await import('../lib/payments/seller-recovery'),followup=await import('../lib/payments/recovery-followup');
 const opened=await m.openSellerRecovery(f.db,f.ctx('correct-at-original-review'),{kind:'refund',id:f.refundId,reason:'Review the original responsibility before approving any collection.'});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await m.correctSellerRecoveryLiability(f.db,f.ctx('original-review-correction','0'),{caseId:opened.id,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-INITIAL-RESPONSIBILITY-OVERTURNED',reason:'The first independent source review overturns this responsibility before any collection is authorized.',publicMessage:'The original review found that you owe nothing. No recovery will be collected.'});
 assert.equal((await followup.recoveryReviewSource(f.db,opened.id)).needsAction,false);
 }finally{f.dispose();}
});
