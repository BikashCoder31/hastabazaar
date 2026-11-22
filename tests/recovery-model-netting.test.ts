import assert from 'node:assert/strict';
import test from 'node:test';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import {appendHistoricalManagedSale} from './helpers/company-store-financial-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import * as fixed from '../lib/managed-commerce/fixed-supply';
import {agreeRecovery} from './helpers/recovery-agreement-fixture';



void test('managed accepted netting uses only eligible native earnings and leaves held earnings and the total ledger intact',async()=>{
 const f=await managedRecoveryFixture('seller');try{
 const caseId=await agreeRecovery(f.db,f.ctx,{kind:'refund',id:f.refundId});
 await appendHistoricalManagedSale(f,'eligible-recovery',Date.now()-15*86400000,Date.now());
 await appendHistoricalManagedSale(f,'held-recovery',Date.now()-1000,Date.now());
 const before=f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries').get()!.n;
 const input={caseId,environment:f.context.environment};
 const applied=await recovery.applySellerRecoveryEarnings(f.db,f.ctx('managed-model-netting','3'),input);
 assert.equal(applied.amountPaisa,f.originalPaidPaisa);
 assert.deepEqual(await recovery.applySellerRecoveryEarnings(f.db,f.ctx('managed-model-netting','3'),input),applied);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_settlement_entries').get()!.n,before);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE entitlement_id='historical-entitlement-held-recovery' AND reason_code='recovery_netting_withholding'").get()!.n,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE entitlement_id='historical-entitlement-eligible-recovery' AND reason_code='recovery_netting_withholding'").get()!.n,1);
 assert.equal((await recovery.getSellerRecoveryReview(f.db,'reviewer',caseId)).position.remainingPaisa,0);
 await assert.rejects(recovery.applySellerRecoveryEarnings(f.db,f.ctx('managed-cannot-repeat-cap','4'),input));
 }finally{f.dispose();}
});

void test('fixed accepted netting links original debt to one future supply obligation without fabricating another defect or payment',async()=>{
 const f=await fixedRecoveryFixture();try{
 const caseId=await agreeRecovery(f.db,f.ctx,{kind:'supplier_adjustment',id:f.adjustmentId});
 const future=await fixed.createFixedSupplyRecord(f.db,{sellerId:f.sellerId,productId:'cup',quantity:3,agreedUnitPaisa:10000,createdBy:f.actorId,agreementVersion:'FICTIONAL-FIXED-RECOVERY',agreementLanguage:'en',payoutBeneficiaryReference:f.sources.beneficiaryReference,requestId:'netting-future-supply',now:Date.now(),environment:f.environment});
 await fixed.decideFixedSupplyRecord(f.db,{recordId:future,actorId:'reviewer',action:'accept',quantityAccepted:3,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'FICTIONAL-FUTURE-SUPPLY-ACCEPTANCE',reason:'Independently inspect and accept the new original supplier goods under their fixed terms.',requestId:'netting-future-accepted',now:Date.now(),environment:f.environment});
 const input={caseId,environment:f.environment};
 const applied=await recovery.applySellerRecoveryEarnings(f.db,f.ctx('fixed-model-netting','3'),input);
 assert.equal(applied.amountPaisa,20000);
 assert.deepEqual(await recovery.applySellerRecoveryEarnings(f.db,f.ctx('fixed-model-netting','3'),input),applied);
 assert.equal((await fixed.getFixedSupplyBalance(f.db,f.recordId)).recoverablePaisa,0);
 assert.equal((await fixed.getFixedSupplyBalance(f.db,future)).balancePaisa,10000);
 assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM managed_supplier_recovery_credits').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_supplier_adjustments').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_supplier_payments').get()!.n,1);
 await assert.rejects(recovery.applySellerRecoveryEarnings(f.db,f.ctx('fixed-cannot-repeat-cap','4'),input));
 }finally{f.dispose();}
});
