import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiveSaleLinkedCommercialSnapshot} from '../lib/managed-commerce/live-snapshots';
import {buildManagedCommercialSnapshot,type ManagedCommercialTerms} from '../lib/managed-commerce/snapshots';

const terms:ManagedCommercialTerms={sellerId:'maker',commercialModel:'managed_sale_linked_percentage_v1',legalSellerReference:'company',invoiceIssuerReference:'company',payoutBeneficiaryReference:'BENEFICIARY:bank',agreementVersion:'accepted-v1',agreementLanguage:'en',termsSettingVersionId:'terms-v1',deliveryHoldDays:7,holdSettingVersionId:'hold-v1',productValuePaisa:10001,makerFundedDiscountPaisa:1,platformFundedDiscountPaisa:500,platformRetentionBps:900,acceptedManagedDetailId:'detail-v1'};
const proof={sellerId:'maker',activationDecisionId:'activation-v1',clearanceId:'clearance-v1',financialScopeId:'financial-v1',issuerModel:'company_commercial_invoice_v1' as const,issuerScopeDigest:'a'.repeat(64),companyScopeDigest:'b'.repeat(64),acceptedManagedDetailId:'detail-v1'};
void test('live economics preserve original accepted terms without reclassifying simulation snapshots',()=>{
 const simulated=buildManagedCommercialSnapshot(terms),live=buildLiveSaleLinkedCommercialSnapshot(terms,proof);
 assert.equal(live.recordKind,'live');assert.equal(live.simulationLabel,null);
 assert.equal(live.makerEntitlementPaisa,simulated.makerEntitlementPaisa);
 assert.equal(live.platformRetainedPaisa,simulated.platformRetainedPaisa);
 assert.equal(live.agreementVersion,'accepted-v1');assert.ok(simulated.simulationLabel.startsWith('SIMULATED'));
 assert.equal(live.liveProof.activationDecisionId,'activation-v1');
});
void test('live snapshots reject fixed model, substituted owner, accepted terms or missing positive provenance',()=>{
 for(const changed of [{...proof,sellerId:'other'},{...proof,acceptedManagedDetailId:'other'},{...proof,activationDecisionId:''}])assert.throws(()=>buildLiveSaleLinkedCommercialSnapshot(terms,changed));
 assert.throws(()=>buildLiveSaleLinkedCommercialSnapshot({...terms,commercialModel:'managed_fixed_supplier_price_v1'},proof));
});
