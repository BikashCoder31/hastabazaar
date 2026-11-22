import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import {agreeRecovery} from './helpers/recovery-agreement-fixture';
import {appendHistoricalManagedSale} from './helpers/company-store-financial-fixture';
import {createFixedSupplyRecord,decideFixedSupplyRecord} from '../lib/managed-commerce/fixed-supply';
import {applySellerRecoveryEarnings,allocateSellerRecoveryReceipt,getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {recordBankReceipt} from '../lib/payments/manual-receipts';

for(const scenario of [
 {model:'managed',sumSql:'SELECT COALESCE(SUM(amount_paisa),0) n FROM managed_settlement_entries',fixture:async()=>{const f=await managedRecoveryFixture('seller');try{await appendHistoricalManagedSale(f,'native-recovery-future',Date.now()-15*86400000,Date.now());return {...f,environment:f.context.environment,accountVersionId:f.payoutSources.accountVersionId,recoverySource:{kind:'refund' as const,id:f.refundId}};}catch(error){f.dispose();throw error;}}},
 {model:'fixed',sumSql:'SELECT COALESCE(SUM(amount_paisa),0) n FROM managed_supplier_recovery_credits',fixture:async()=>{const f=await fixedRecoveryFixture();try{const future=await createFixedSupplyRecord(f.db,{sellerId:f.sellerId,productId:'cup',quantity:3,agreedUnitPaisa:10000,createdBy:f.actorId,agreementVersion:'FICTIONAL-FIXED-RECOVERY',agreementLanguage:'en',payoutBeneficiaryReference:f.sources.beneficiaryReference,requestId:'native-netting-future',now:Date.now(),environment:f.environment});await decideFixedSupplyRecord(f.db,{recordId:future,actorId:'reviewer',action:'accept',quantityAccepted:3,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'FICTIONAL-NATIVE-FUTURE-SUPPLY',reason:'Inspect and accept these fictional future supplier goods under the original fixed terms.',requestId:'native-netting-accepted',now:Date.now(),environment:f.environment});return {...f,accountVersionId:f.sources.accountVersionId,recoverySource:{kind:'supplier_adjustment' as const,id:f.adjustmentId}};}catch(error){f.dispose();throw error;}}},
])void test(`native ${scenario.model} cash repayment and accepted earnings compete for the same original cap`,async()=>{
 const f=await scenario.fixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const caseId=await agreeRecovery(f.db,f.ctx,f.recoverySource),review=await getSellerRecoveryReview(f.db,'reviewer',caseId),amount=review.position.remainingPaisa;
 const receipt=await recordBankReceipt(f.db,f.ctx('native-netting-actual-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-NATIVE-CASH-NETTING-CREDIT',bankAt:Date.now()-1000,amountMinor:amount,currency:'NPR',payerReference:'Fictional original same-model seller',payerUserId:review.source.ownerId,completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-NATIVE-INDEPENDENT-INCOMING',reason:'Independently verify this actual fictional seller credit before the isolated race.'});
 const before=f.sqlite.prepare(scenario.sumSql).get()!.n;
 target=await nativeFinanceClone(f.sqlite);
 const results=await Promise.allSettled([
  applySellerRecoveryEarnings(target.db,f.ctx('native-approved-netting','3'),{caseId,environment:f.environment}),
  allocateSellerRecoveryReceipt(target.db,f.ctx('native-competing-cash','3'),{caseId,receiptId:receipt.id,receiptRevision:0,amountPaisa:amount,method:'cash',environment:f.environment,evidenceReference:'FICTIONAL-NATIVE-CASH-ALLOCATION',reason:'Allocate only the actual original seller repayment within the shared current liability.'}),
 ]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1,JSON.stringify(results));
 const allocations=await target.db.prepare('SELECT method,amount_paisa AS amount FROM seller_recovery_allocations WHERE case_id=?').bind(caseId).all<{method:string;amount:number}>();assert.equal(allocations.results.length,1);assert.equal(allocations.results[0].amount,amount);
 const cashWon=allocations.results[0].method==='cash';
 assert.equal((await target.db.prepare(scenario.sumSql).first<{n:number}>())!.n,Number(before)+(cashWon?amount:0));
 assert.equal((await target.db.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').bind(receipt.id).first<{revision:number}>())!.revision,cashWon?1:0);
 const current=await getSellerRecoveryReview(target.db,'reviewer',caseId);assert.equal(current.position.remainingPaisa,0);assert.equal(current.position.overRecoveredPaisa,0);assert.equal(current.case.revision,4);
 }finally{await target?.dispose();f.dispose();}
});
