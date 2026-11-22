import {getManagedClearanceScope,reviewManagedClearance} from '../../lib/managed-commerce/live-clearance';
import {uploadManagedClearanceEvidence} from '../../lib/managed-commerce/live-clearance-evidence';
import {recordManagedLiveFinancialScope} from '../../lib/managed-commerce/live-billing';
import type {liveMakerFixture} from './live-maker-fixture';
export async function addReviewedLiveClearance(f:Awaited<ReturnType<typeof liveMakerFixture>>,tag='fictional-live-clearance'){
 const scope=await getManagedClearanceScope(f.db,f.sellerId,Date.now()),company=scope.currentOffer.snapshot.company;
 const financial=await recordManagedLiveFinancialScope(f.db,f.ctx(tag+'-financial'),{companyEntityReference:scope.companyEntityReference,companyScopeDigest:scope.companyScopeDigest,issuerModel:'company_commercial_invoice_v1',issuer:{legalName:company.legalName,taxMode:'PAN',taxRegistrationNumber:company.pan,address:company.registeredOffice,phone:'9800000000'},seriesPrefix:'FIC-'+tag.slice(-8).toUpperCase(),seriesVersion:'fictional-opening-v1',openingNumber:100,evidenceReference:'FICTIONAL-EXTERNAL-ISSUER-AND-OPENING-SEQUENCE',reason:'Independently review only this fictional actual company commercial invoice issuer and opening sequence.'});
 const upload=await uploadManagedClearanceEvidence(f.db,f.bucket,f.ctx(tag+'-file'),{sellerId:f.sellerId,materialScopeDigest:scope.materialScopeDigest},f.externalFile());
 const now=Date.now(),input={sellerId:f.sellerId,scopeDigest:scope.materialScopeDigest,evidenceIds:[upload.id],financialScopeId:financial.id,issuerModel:'company_commercial_invoice_v1' as const,issuerScopeDigest:financial.issuerScopeDigest,issuer:'Fictional External Legal and Accounting Authority',externalReference:'FICTIONAL-ISSUED-SUPPLIER-REGISTRATION-TAX-INVOICE-PAYOUT',issuedAt:now-120000,effectiveFrom:now-60000,validUntil:now+86400000,externalAuthenticityConfirmed:true,supplierRegistrationTaxAssessmentConfirmed:true,invoiceIssuerConfirmed:true,payoutBeneficiaryConfirmed:true,reason:'Independently inspect the retained fictional externally issued source, its exact supplier registration and tax assessment, actual issuer model and verified payout legal identity.'};
 const saved=await reviewManagedClearance(f.db,f.ctx(tag+'-review'),input);
 return {scope,financial,upload,input,clearanceId:saved.id};
}
