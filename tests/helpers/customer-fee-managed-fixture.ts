import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {getBusinessSettingDefinition} from '../../lib/configuration/definitions';
import {saveBusinessSettingChange} from '../../lib/db/repositories/business-settings';
import {getManagedMakerApplicationTerms} from '../../lib/db/repositories/managed-maker-details';
import {MANAGED_SUPPLIER_AGREEMENT_VERSION} from '../../lib/sellers/managed-identity';
import {parseCurrentSellerApplication} from '../../lib/sellers/onboarding';
import {sellerDocumentsForApplication} from '../../lib/sellers/application';
import {createCurrentSellerApplication,reviewSellerApplication} from '../../lib/db/repositories/seller-applications';
import {verifySellerDocument} from '../../lib/sellers/document-review';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../../lib/sellers/bank-details';
import {getManagedClearanceScope,reviewManagedClearance} from '../../lib/managed-commerce/live-clearance';
import {uploadManagedClearanceEvidence} from '../../lib/managed-commerce/live-clearance-evidence';
import {recordManagedLiveFinancialScope} from '../../lib/managed-commerce/live-billing';
import {getManagedLiveActivationReview,activateManagedMakerLive,readManagedLiveEligibility} from '../../lib/managed-commerce/live-activation';
import {managedTermsFormId} from '../../lib/managed-commerce/accepted-terms';
import {passivePdfFixture} from './passive-pdf';

export const feeManagedSeller='managed-fee-seller',feeManagedOwner='managed-fee-owner';
/** Current fictional sources and native decisions in the caller's fresh memory database only. */
export async function addCustomerFeeLiveMaker(f:{database:D1Database;sqlite:DatabaseSync},now:number,identityValidUntil?:number){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const db=f.database,ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId:'owner',requestId,expectedRevision,now});
 for(const [key,value] of [
  ['managed_maker_company_account',{...getBusinessSettingDefinition('managed_maker_company_account').defaultValue,storeName:'Fictional Fee Company Store'}],
  ['managed_maker_program_mode','activation_enabled'],['managed_maker_active_model','managed_sale_linked_percentage_v1'],
 ] as const)await saveBusinessSettingChange(db,{key,value,actorId:'owner',reason:'Publish fictional native managed fee checkout prerequisites.',requestId:'fee-live-'+key,now:now-1,effectiveFrom:null,expectedVersion:0,simulationAllowed:true});
 f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,phone,status,created_at,updated_at) VALUES(?,?,?,'Fictional Fee Maker','9800000002','active',1,1)").run(feeManagedOwner,feeManagedOwner,'fee-maker@local.hastabazaar.test');
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'customer',1)").run(feeManagedOwner);
 f.sqlite.prepare('INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES(?,?,1)').run(feeManagedOwner,'fee-maker@local.hastabazaar.test');
 const terms=await getManagedMakerApplicationTerms(db,now,MANAGED_SUPPLIER_AGREEMENT_VERSION),form=new FormData();
 for(const [key,value] of Object.entries({governmentIdType:'citizenship',managedAgreementAccepted:'yes',hasBusinessTaxRegistration:'no',applicantType:'individual',legalName:'Fictional Fee Maker',tradingName:'Fictional Fee Studio',email:'fee-maker@local.hastabazaar.test',phone:'9800000002',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional workshop',applicationAcknowledgement:'yes',acceptedTerms:'yes',personalPan:'123456789',managedAgreementVersion:MANAGED_SUPPLIER_AGREEMENT_VERSION,managedAgreementContext:terms.context,pickupAddress:'Fictional workshop Kathmandu',returnAddress:'Fictional returns Kathmandu'}))form.set(key,value);
 const parsed=parseCurrentSellerApplication(form);assert.ok(parsed.input,parsed.errors.join('; '));
 const documents=sellerDocumentsForApplication(parsed.input).map((definition,index)=>({id:definition.kind==='representative_identity'?'managed-id':'fee-managed-document-'+index,kind:definition.kind,objectKey:'private/seller-documents/'+feeManagedSeller+'/source-'+index,originalName:'fictional-source.pdf',mimeType:'application/pdf',sizeBytes:100}));
 await createCurrentSellerApplication(db,{sellerId:feeManagedSeller,userId:feeManagedOwner,existingAccount:true,applicationReference:'FICTIONAL-FEE-MANAGED-APPLICATION',input:parsed.input,documents,now});
 for(const document of documents)await verifySellerDocument(db,{sellerId:feeManagedSeller,documentId:document.id,actorId:'owner',reason:'Independently review the exact fictional current legal identity and personal PAN.',commandId:'fee-verify-'+document.id,now});
 for(const action of ['start_review','approve_for_activation'] as const)await reviewSellerApplication(db,{sellerId:feeManagedSeller,actorId:'owner',action,reason:'Independently review the fictional current application before separate activation.',requestId:'fee-live-'+action,now});
 if(identityValidUntil!==undefined)f.sqlite.prepare("UPDATE seller_documents SET valid_until=? WHERE id='managed-id'").run(identityValidUntil);
 const bank=await sellerBankState(db,feeManagedSeller);
 await submitSellerBankDetails(db,{sellerId:feeManagedSeller,actorId:feeManagedOwner,revision:bank.revision,now,details:{payoutBeneficiary:'Fictional Fee Maker',bankName:'Fictional Bank',bankBranch:'Fictional Branch',bankAccountNumber:'TEST-FEE-MAKER'},document:{id:'fee-managed-bank',kind:'bank_verification',objectKey:'private/seller-documents/'+feeManagedSeller+'/fee-managed-bank',originalName:'fictional-bank.pdf',mimeType:'application/pdf',sizeBytes:100}});
 await reviewSellerBankDetails(db,{sellerId:feeManagedSeller,actorId:'owner',revision:(await sellerBankState(db,feeManagedSeller)).revision,reference:'FICTIONAL-FEE-MAKER-BENEFICIARY',reason:'Independently verify original fictional beneficiary identity and bank routing.',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'fee-managed-bank-review',now});
 // Retained published item facts are explicit setup; this test is about fee placement, not product intake.
 f.sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
 VALUES('managed-product',?,'cat','managed-craft','MANAGED-SKU','Managed craft','Fictional managed craft',100000,10,'Maker','NP','Wood','published',1,1)`).run(feeManagedSeller);
 f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
 VALUES('managed-terms-form',?,1,'published',?,'Fictional terms fixture','owner',1,'owner',1,'owner',1,'fee-terms-form')`).run(managedTermsFormId,JSON.stringify({formId:managedTermsFormId,fields:[]}));
 const scope=await getManagedClearanceScope(db,feeManagedSeller,now),company=scope.currentOffer.snapshot.company;
 const financial=await recordManagedLiveFinancialScope(db,ctx('fee-managed-financial'),{companyEntityReference:scope.companyEntityReference,companyScopeDigest:scope.companyScopeDigest,issuerModel:'company_commercial_invoice_v1',issuer:{legalName:company.legalName,taxMode:'PAN',taxRegistrationNumber:company.pan,address:company.registeredOffice,phone:'9800000000'},seriesPrefix:'FIC-FEE',seriesVersion:'fictional-fee-opening',openingNumber:100,evidenceReference:'FICTIONAL-ISSUER-OPENING-SEQUENCE',reason:'Independently verify fictional issuer and retained opening sequence.'});
 const objects=new Map<string,ArrayBuffer>(),bucket={async put(key:string,value:ArrayBuffer){objects.set(key,value);},async get(key:string){const bytes=objects.get(key);return bytes?{body:bytes,arrayBuffer:async()=>bytes}:null;}} as unknown as R2Bucket;
 const upload=await uploadManagedClearanceEvidence(db,bucket,ctx('fee-managed-clearance-file'),{sellerId:feeManagedSeller,materialScopeDigest:scope.materialScopeDigest},new File([passivePdfFixture('FICTIONAL ISSUED LEGAL ACCOUNTING CLEARANCE')],'fictional-clearance.pdf',{type:'application/pdf'}));
 const clearance=await reviewManagedClearance(db,ctx('fee-managed-clearance-review'),{sellerId:feeManagedSeller,scopeDigest:scope.materialScopeDigest,evidenceIds:[upload.id],financialScopeId:financial.id,issuerModel:'company_commercial_invoice_v1',issuerScopeDigest:financial.issuerScopeDigest,issuer:'Fictional External Legal Accounting Authority',externalReference:'FICTIONAL-ISSUED-FEE-MAKER-CLEARANCE',issuedAt:now-120000,effectiveFrom:now-60000,validUntil:now+86400000,externalAuthenticityConfirmed:true,supplierRegistrationTaxAssessmentConfirmed:true,invoiceIssuerConfirmed:true,payoutBeneficiaryConfirmed:true,reason:'Independently review the exact fictional externally issued supplier registration, tax, issuer and payout clearance.'});
 const review=await getManagedLiveActivationReview(db,'owner',feeManagedSeller,now);
 assert.equal(review.readyForActivation,true,JSON.stringify(review.blockers));
 await activateManagedMakerLive(db,ctx('fee-managed-live-activation',String(review.participationVersion)),{sellerId:feeManagedSeller,readinessDigest:review.readinessDigest,clearanceId:clearance.id,reason:'Enable only this independently verified fictional native live scope.'});
 const enabled=await readManagedLiveEligibility(db,feeManagedSeller,now);assert.equal(enabled.enabled,true,JSON.stringify(enabled.blockers));assert.ok(enabled.proof);
 assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
}
