import assert from 'node:assert/strict';
import {completeVersionFixture} from './complete-version-fixture';
import {saveFormDraft,publishFormDraft} from '../../lib/db/repositories/form-catalog';
import {getEditableSellerProfile} from '../../lib/db/repositories/seller-profile';

/** Historical approved fixture only: no Seller status/role activation, release or payment command. */
export async function sellerProfileScopeFixture(){
 const f=await completeVersionFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  globalThis.registrationScopeDb=f.db;globalThis.registrationScopeIdentity={userId:'external-profile-owner',email:'registered-owner@local.hastabazaar.test'};
  f.sqlite.prepare("UPDATE users SET auth_subject='external-profile-owner' WHERE id='registered-owner'").run();
  const {requireCustomerApi}=await import('../../lib/auth/customer');assert.equal((await requireCustomerApi()).userId,'registered-owner');
  const draft=await saveFormDraft(f.db,{formId:'seller.profile',actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId:'seller.profile',fields:[]},reason:'Publish supported private workshop contract in this isolated fictional fixture.',requestId:crypto.randomUUID(),now:Date.now()});
  const form=await publishFormDraft(f.db,{formId:'seller.profile',draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Review genuine supported profile fields before native requests.',requestId:crypto.randomUUID(),now:Date.now()});
  const api=await import('../../app/api/seller/profile/route'),profile=await getEditableSellerProfile(f.db,'registered');assert.ok(profile);
  const input=(municipality:string)=>({profile:{...profile,municipality},idempotencyKey:crypto.randomUUID(),formVersion:form.version,customAnswers:[]});
  async function republish(){const draft=await saveFormDraft(f.db,{formId:'seller.profile',actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:form.version,config:{formId:'seller.profile',fields:[{id:'source_context',key:'source_context',type:'short_text',label:'Current workshop context',required:true,order:0,status:'active'}]},reason:'Change the supported fixture contract after an earlier original save.',requestId:crypto.randomUUID(),now:Date.now()});return publishFormDraft(f.db,{formId:'seller.profile',draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:form.version,reason:'Publish a genuinely changed native configuration for receipt recovery.',requestId:crypto.randomUUID(),now:Date.now()});}
  return{...f,api,profile,input,republish};
 }catch(error){f.dispose();throw error;}
}
