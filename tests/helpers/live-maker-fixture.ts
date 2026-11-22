import assert from 'node:assert/strict';
import {companyStoreMakerFixture} from './company-store-maker-fixture';
import {managedIdentityFields} from './managed-identity-fixture';
import {parseCurrentSellerApplication} from '../../lib/sellers/onboarding';
import {sellerDocumentsForApplication} from '../../lib/sellers/application';
import {MANAGED_SUPPLIER_AGREEMENT_VERSION} from '../../lib/sellers/managed-identity';
import {getManagedMakerApplicationTerms} from '../../lib/db/repositories/managed-maker-details';
import {createCurrentSellerApplication,reviewSellerApplication} from '../../lib/db/repositories/seller-applications';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../../lib/db/repositories/business-settings';
import {getBusinessSettingDefinition} from '../../lib/configuration/definitions';
import {verifiedPayoutSources} from './verified-payout-sources';
import {passivePdfFixture} from './passive-pdf';

/** Actual current v2 intake, fictional people/documents, memory-only; never relabels a v1 agreement. */
export async function liveMakerFixture(){
 const f=await companyStoreMakerFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const sellerId='live-maker',ownerId='live-owner',now=Date.now()-1000;
  f.sqlite.exec("INSERT INTO users(id,auth_subject,email,display_name,phone,status,created_at,updated_at) VALUES('live-owner','live-owner','live-owner@local.hastabazaar.test','Fictional Live Maker','9800000002','active',1,1); INSERT INTO user_roles(user_id,role,assigned_at) VALUES('live-owner','customer',1)");
  f.sqlite.exec("INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES('live-owner','live-owner@local.hastabazaar.test',1)");
  for(const [key,value] of [['managed_maker_company_account',{...getBusinessSettingDefinition('managed_maker_company_account').defaultValue,storeName:'Fictional Live Company Store'}],['managed_sale_linked_platform_retention_bps',1375],['managed_maker_program_mode','activation_enabled'],['managed_maker_active_model','managed_sale_linked_percentage_v1']] as const){
   const draft=await createBusinessSettingDraft(f.db,{key,value,actorId:'reviewer',reason:'Configure only this isolated actual-contract live workflow fixture.',requestId:'live-fixture-draft-'+key,now});
   await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:now,reason:'Publish only the inspected fictional live workflow prerequisites.',requestId:'live-fixture-publish-'+key,now,simulationAllowed:true});
  }
  const terms=await getManagedMakerApplicationTerms(f.db,now,MANAGED_SUPPLIER_AGREEMENT_VERSION),form=new FormData();
  for(const [key,value] of Object.entries({...managedIdentityFields(),hasBusinessTaxRegistration:'no',applicantType:'individual',legalName:'Fictional Live Maker',tradingName:'Fictional Live Studio',email:'live-owner@local.hastabazaar.test',phone:'9800000002',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional workshop',applicationAcknowledgement:'yes',acceptedTerms:'yes',personalPan:'123456789',managedAgreementVersion:MANAGED_SUPPLIER_AGREEMENT_VERSION,managedAgreementContext:terms.context,pickupAddress:'Fictional workshop Kathmandu',returnAddress:'Fictional returns Kathmandu'}))form.set(key,value);
  const parsed=parseCurrentSellerApplication(form);assert.ok(parsed.input,parsed.errors.join('; '));
  const documents=sellerDocumentsForApplication(parsed.input).map((definition,index)=>({id:'live-source-document-'+index,kind:definition.kind,objectKey:'private/seller-documents/'+sellerId+'/live-source-document-'+index,originalName:'fictional-source.pdf',mimeType:'application/pdf',sizeBytes:100}));
  await createCurrentSellerApplication(f.db,{sellerId,userId:ownerId,existingAccount:true,applicationReference:'FICTIONAL-LIVE-APPLICATION',input:parsed.input,documents,now});
  const {verifySellerDocument}=await import('../../lib/sellers/document-review');
  for(const document of documents)await verifySellerDocument(f.db,{sellerId,documentId:document.id,actorId:'reviewer',reason:'Independently verify the exact current fictional identity and personal PAN evidence.',commandId:'verify-'+document.id,now:Date.now()});
  for(const action of ['start_review','approve_for_activation'] as const)await reviewSellerApplication(f.db,{sellerId,actorId:'reviewer',action,reason:'Review the actual v2 application independently while commercial clearance remains separate.',requestId:'live-fixture-review-'+action,now:Date.now()});
  const sources=await verifiedPayoutSources(f,sellerId);
  const objects=new Map<string,{bytes:ArrayBuffer;httpMetadata:Record<string,string>}>();
  const bucket={async put(key:string,value:ArrayBuffer,options:{httpMetadata:Record<string,string>}){objects.set(key,{bytes:value,httpMetadata:options.httpMetadata});},async get(key:string){const object=objects.get(key);return object?{body:object.bytes,arrayBuffer:async()=>object.bytes}:null;}} as unknown as R2Bucket;
  const ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()});
  const externalFile=()=>new File([passivePdfFixture('FICTIONAL EXTERNAL LEGAL ACCOUNTING CLEARANCE')],'fictional-issued-clearance.pdf',{type:'application/pdf'});
  return {...f,sellerId,ownerId,sources,bucket,objects,ctx,externalFile};
 }catch(error){f.dispose();throw error;}
}
