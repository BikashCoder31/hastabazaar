import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {publishAccountForms} from './helpers/account-workspace-fixture';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {validateAnswersForDefinition} from '../lib/forms/validation';
import {FORM_REGISTRY} from '../lib/forms/registry';
import {updateCustomerProfile,saveCustomerAddress,deleteCustomerAddress,validateAddressFormSubmission,validateReviewFormSubmission,createProductReview,moderateProductReview} from '../lib/db/repositories/customers';
import {createDataRightsRequest,validatePrivacyRequestForm} from '../lib/db/repositories/operations';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {saveFormDraft,publishFormDraft} from '../lib/db/repositories/form-catalog';
import {readAccountCommandOutcome} from '../lib/account/command-outcomes';

void test('owned native account receipts recover only exact actor/action/source facts without private payload or mutations',async()=>{
 const loadedFixtureModule=await import('../lib/account/command-outcomes').catch(()=>null);assert.equal(typeof loadedFixtureModule?.readAccountCommandOutcome,'function');if(!loadedFixtureModule)return;
 const f=await completeVersionFixture(Date.now());try{await publishAccountForms(f,['account.profile','account.address']);const config=await resolvePublishedForm(f.db,'account.profile'),version=await f.db.prepare("SELECT id FROM form_config_versions WHERE form_id='account.profile' AND version=? AND status='published'").bind(config.version).first<{id:string}>();assert.ok(version);
  await updateCustomerProfile(f.db,{userId:'customer',displayName:'PRIVATE original customer name',phone:'',locale:'en-NP',requestId:'account-owned-profile',now:f.now,formVersion:config.version,versionId:version.id,answers:validateAnswersForDefinition(FORM_REGISTRY['account.profile'],config,[])});
  const reference={action:'profile.update' as const,sourceId:'customer',requestId:'account-owned-profile'},before=Number(f.sqlite.prepare('SELECT COUNT(*)n FROM audit_logs').get()?.n);
  assert.deepEqual(await loadedFixtureModule.readAccountCommandOutcome(f.db,'customer',reference),{requestId:reference.requestId,status:'recorded'});
  assert.deepEqual(await loadedFixtureModule.readAccountCommandOutcome(f.db,'foreign',{...reference,sourceId:'foreign'}),{requestId:reference.requestId,status:'unconfirmed'});
  assert.deepEqual(await loadedFixtureModule.readAccountCommandOutcome(f.db,'customer',{...reference,requestId:'not-recorded-account-request'}),{requestId:'not-recorded-account-request',status:'unconfirmed'});
  const address={label:'PRIVATE address label',recipientName:'PRIVATE recipient',phone:'9812345678',province:'Koshi',district:'Morang',municipality:'Biratnagar',ward:'4',locality:'PRIVATE exact address',isDefault:false},addressConfig=await resolvePublishedForm(f.db,'account.address'),form=await validateAddressFormSubmission(f.db,address,addressConfig.version,[]),id=await saveCustomerAddress(f.db,{userId:'customer',input:address,requestId:'account-owned-address',now:f.now,form});
  assert.deepEqual(await loadedFixtureModule.readAccountCommandOutcome(f.db,'customer',{action:'address.create',sourceId:'new',requestId:'account-owned-address'}),{requestId:'account-owned-address',status:'recorded'});
  assert.deepEqual(await loadedFixtureModule.readAccountCommandOutcome(f.db,'customer',{action:'address.update',sourceId:id,requestId:'account-owned-address'}),{requestId:'account-owned-address',status:'unconfirmed'});
  const changed={...address,locality:'PRIVATE updated original address'},updateForm=await validateAddressFormSubmission(f.db,changed,addressConfig.version,[]);await saveCustomerAddress(f.db,{userId:'customer',addressId:id,input:changed,requestId:'account-owned-update',now:f.now+1,form:updateForm});
  assert.deepEqual(await loadedFixtureModule.readAccountCommandOutcome(f.db,'customer',{action:'address.update',sourceId:id,requestId:'account-owned-update'}),{requestId:'account-owned-update',status:'recorded'});
  await deleteCustomerAddress(f.db,{userId:'customer',addressId:id,requestId:'account-owned-delete',now:f.now+1});
  assert.deepEqual(await loadedFixtureModule.readAccountCommandOutcome(f.db,'customer',{action:'address.delete',sourceId:id,requestId:'account-owned-delete'}),{requestId:'account-owned-delete',status:'recorded'});
  await assert.rejects(loadedFixtureModule.readAccountCommandOutcome(f.db,'customer',{action:'address.delete',sourceId:'another-address',requestId:'account-owned-delete'}),/original.*source|access/i);
  assert.equal(Number(f.sqlite.prepare('SELECT COUNT(*)n FROM audit_logs').get()?.n),before+3);
  f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='customer'").run();await assert.rejects(loadedFixtureModule.readAccountCommandOutcome(f.db,'customer',reference),/current|access|account/i);
 }finally{f.dispose();}
});

void test('privacy outcomes retain exact native owners and original request sources',async()=>{
 const f=await completeVersionFixture(Date.now());try{await publishAccountForms(f,['account.privacy-request','account.review']);
  const privacyConfig=await resolvePublishedForm(f.db,'account.privacy-request'),privacyForm=await validatePrivacyRequestForm(f.db,privacyConfig.version,[]),privacyId=await createDataRightsRequest(f.db,{customerId:'customer',requestType:'access',detail:'PRIVATE original data access details retained only in the native request.',requestId:'account-owned-privacy',now:f.now,form:privacyForm});
  assert.deepEqual(await readAccountCommandOutcome(f.db,'customer',{action:'privacy.request',sourceId:'customer',requestId:'account-owned-privacy'}),{requestId:'account-owned-privacy',status:'recorded'});
  assert.deepEqual(await readAccountCommandOutcome(f.db,'foreign',{action:'privacy.request',sourceId:'foreign',requestId:'account-owned-privacy'}),{requestId:'account-owned-privacy',status:'unconfirmed'});assert.ok(privacyId);
 }finally{f.dispose();}
});

void test('verified-purchase review recovery proves the original actual delivered source, not a current moderation status',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  const draft=await saveFormDraft(f.db,{formId:'account.review',actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId:'account.review',fields:[]},reason:'Publish the genuine review form in the isolated actual delivered-order fixture.',requestId:'review-outcome-form-draft',now:Date.now()});
  await publishFormDraft(f.db,{formId:'account.review',draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Use the native published review contract for exact original purchase evidence.',requestId:'review-outcome-form-publish',now:Date.now()});
  const config=await resolvePublishedForm(f.db,'account.review'),form=await validateReviewFormSubmission(f.db,config.version,[]),body='PRIVATE original buyer review body about its actual fictional delivered purchase.',title='Original review',digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({orderItemId:f.orderItemId,rating:4,title,body,photos:[]}))),requestDigest=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const id=await createProductReview(f.db,{userId:f.buyerId,productId:f.productId,orderItemId:f.orderItemId,rating:4,title,body,requestId:'account-owned-review',now:Date.now(),form,requestDigest});
  const reference={action:'review.submit',sourceId:f.orderItemId,relatedId:f.productId,requestId:'account-owned-review'};
  assert.deepEqual(await readAccountCommandOutcome(f.db,f.buyerId,reference),{requestId:reference.requestId,status:'recorded'});
  await moderateProductReview(f.db,{reviewId:id,actorId:'reviewer',action:'reject',note:'The independent moderator records a genuine current fictional review outcome.',requestId:'account-native-review-rejected',now:Date.now()});
  assert.deepEqual(await readAccountCommandOutcome(f.db,f.buyerId,reference),{requestId:reference.requestId,status:'recorded'},'Original submission is not a fabricated current awaiting-moderation state.');
  await assert.rejects(readAccountCommandOutcome(f.db,'reviewer',reference),/account|access/i);
  await assert.rejects(readAccountCommandOutcome(f.db,f.buyerId,{...reference,relatedId:'another-product'}),/original.*source|access/i);

 }finally{f.dispose();}
});

void test('the final read-only account proof rejects a revoked identity without exposing an already-found receipt',async()=>{
 const f=await completeVersionFixture(Date.now());try{await publishAccountForms(f,['account.privacy-request']);const config=await resolvePublishedForm(f.db,'account.privacy-request'),form=await validatePrivacyRequestForm(f.db,config.version,[]);await createDataRightsRequest(f.db,{customerId:'customer',requestType:'access',detail:'Original fictional privacy request with a genuine native receipt.',requestId:'identity-race-recorded',now:f.now,form});let raced=false;const db=Object.create(f.db)as D1Database;db.prepare=(sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('END confirmed FROM users account_user')){const first=statement.first.bind(statement);statement.first=(async()=>{if(!raced){raced=true;f.sqlite.prepare("UPDATE users SET auth_subject='another-current-identity' WHERE id='customer'").run();}return first();})as D1PreparedStatement['first'];}return statement;};
  await assert.rejects(readAccountCommandOutcome(db,'customer',{action:'privacy.request',sourceId:'customer',requestId:'identity-race-recorded'}),/current.*account|access/i);assert.equal(raced,true);
 }finally{f.dispose();}
});
