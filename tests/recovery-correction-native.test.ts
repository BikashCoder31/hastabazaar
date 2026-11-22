import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {allocateSellerRecoveryReceipt,correctSellerRecoveryLiability,getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {openSellerRecovery,approveSellerRecovery} from '../lib/payments/seller-recovery';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';

void test('native correction racing actual collection commits one current-source effect and retains the shared receipt cap',async()=>{
 const f=await approvedSellerRecoveryFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const receipt=await recordBankReceipt(f.db,f.ctx('native-correction-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-NATIVE-CORRECTION-CREDIT',bankAt:Date.now()-1000,amountMinor:20000,currency:'NPR',payerReference:'Fictional original registered seller',payerUserId:'registered-owner',conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-NATIVE-CORRECTION-CREDIT-PROOF',reason:'Independently verify the actual original bank credit before competing source decisions.'});
 target=await nativeFinanceClone(f.sqlite);const db=target.db;
 const review=await getSellerRecoveryReview(db,'reviewer',f.recoveryId),before=(await db.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").first<{n:number}>())!.n;
 const correction={caseId:f.recoveryId,newConfirmedPaisa:10000,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-CORRECTION-SOURCE',reason:'Independently approve the corrected original responsibility while the actual receipt is being allocated.',publicMessage:'Your confirmed responsibility is reduced to NPR 100. Finance will review revised terms for any remaining balance.'};
 const cash={caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash' as const,evidenceReference:'FICTIONAL-NATIVE-CASH-ALLOCATION',reason:'Allocate this actual incoming credit against the current approved original liability.'};
 const results=await Promise.allSettled([correctSellerRecoveryLiability(db,f.ctx('native-correction-decision','1'),correction),allocateSellerRecoveryReceipt(db,f.ctx('native-correction-cash','1'),cash)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const corrected=results[0].status==='fulfilled';
 let current=await getSellerRecoveryReview(db,'reviewer',f.recoveryId);
 assert.equal(current.case.revision,2);
 assert.equal((await db.prepare("SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id='registered'").first<{n:number}>())!.n,before+(corrected?f.originalPaidPaisa-10000:20000));
 if(corrected){
  assert.equal(current.case.approvedCapPaisa,0);assert.equal(current.position.recoveredPaisa,0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
  await correctSellerRecoveryLiability(db,f.ctx('native-correction-decision','1'),correction);
 }else{
  await correctSellerRecoveryLiability(db,f.ctx('native-correction-refreshed','2'),{...correction,reviewDigest:current.reviewDigest});
  current=await getSellerRecoveryReview(db,'reviewer',f.recoveryId);
  assert.equal(current.case.restoredPaisa,10000);assert.equal(current.position.remainingPaisa,0);
  assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').bind(receipt.id).first<{n:number}>())!.n,20000);
 }
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_liability_corrections').first<{n:number}>())!.n,1);
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await target?.dispose();f.dispose();}
});

for(const model of ['registered','managed','fixed'] as const)void test(`native ${model} competing corrections restore one original collection with one native credit`,async()=>{
 const make=async()=>{
  if(model==='registered'){const f=await approvedSellerRecoveryFixture();return {db:f.db,sqlite:f.sqlite,ctx:f.ctx,dispose:f.dispose,caseId:f.recoveryId,accountVersionId:f.accountVersionId,environment:undefined};}
  if(model==='managed'){const f=await managedRecoveryFixture();const opened=await openSellerRecovery(f.db,f.ctx('native-managed-correction-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the original managed paid entitlement before correcting responsibility.'});return {db:f.db,sqlite:f.sqlite,ctx:f.ctx,dispose:f.dispose,caseId:opened.id,accountVersionId:f.payoutSources.accountVersionId,environment:f.context.environment};}
  const f=await fixedRecoveryFixture();const opened=await openSellerRecovery(f.db,f.ctx('native-fixed-correction-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Reconcile the original paid supplier obligation before correcting responsibility.'});return {db:f.db,sqlite:f.sqlite,ctx:f.ctx,dispose:f.dispose,caseId:opened.id,accountVersionId:f.sources.accountVersionId,environment:f.environment};
 };
 const f=await make();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 let review=await getSellerRecoveryReview(f.db,'reviewer',f.caseId);
 if(model!=='registered')await approveSellerRecovery(f.db,f.ctx('native-model-correction-approved','0'),{caseId:f.caseId,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-MODEL-ORIGINAL-LIABILITY',reason:'Approve the original exact liability through one eligible independent Super Admin.'});
 const receipt=await recordBankReceipt(f.db,f.ctx('native-model-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-NATIVE-MODEL-CREDIT',bankAt:Date.now()-1000,amountMinor:1000,currency:'NPR',payerReference:'Original fictional seller',payerUserId:review.source.ownerId,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-NATIVE-MODEL-CREDIT-PROOF',reason:'Independently verify the original actual seller credit before later source correction.'});
 await allocateSellerRecoveryReceipt(f.db,f.ctx('native-model-cash','1'),{caseId:f.caseId,receiptId:receipt.id,receiptRevision:0,amountPaisa:1000,method:'cash',...(f.environment?{environment:f.environment}:{}),evidenceReference:'FICTIONAL-NATIVE-MODEL-ALLOCATION',reason:'Apply this actual incoming credit once to its original native model.'});
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 target=await nativeFinanceClone(f.sqlite);const db=target.db;review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
 const input={caseId:f.caseId,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,...(f.environment?{environment:f.environment}:{}),evidenceReference:'FICTIONAL-NATIVE-MODEL-CORRECTION',reason:'Original source evidence overturns responsibility and requires restoration of actual collected money.',publicMessage:'Your responsibility is removed and your NPR 10 repayment is restored to your seller balance.'};
 const results=await Promise.allSettled(['one','two'].map(key=>correctSellerRecoveryLiability(db,f.ctx('native-model-correction-'+key,'2'),input)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await correctSellerRecoveryLiability(db,f.ctx('native-model-correction-'+(results[0].status==='fulfilled'?'one':'two'),'2'),input);
 const current=await getSellerRecoveryReview(db,'reviewer',f.caseId);
 assert.equal(current.case.revision,3);assert.equal(current.case.confirmedPaisa,0);assert.equal(current.case.restoredPaisa,1000);assert.equal(current.position.recoveredPaisa,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_liability_corrections').first<{n:number}>())!.n,1);
 assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_restorations').first<{n:number}>())!.n,1000);
 assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').bind(receipt.id).first<{n:number}>())!.n,1000);
 const nativeSql=model==='registered'?"SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE type='recovery_correction'":model==='managed'?"SELECT SUM(amount_paisa) n FROM managed_settlement_entries WHERE reason_code='recovery_correction'":"SELECT SUM(native_credit_paisa) n FROM seller_recovery_liability_corrections WHERE fixed_obligation_id IS NOT NULL";
 assert.equal((await db.prepare(nativeSql).first<{n:number}>())!.n,review.case.confirmedPaisa);
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await target?.dispose();f.dispose();}
});
