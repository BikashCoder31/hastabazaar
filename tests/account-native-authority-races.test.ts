import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {publishAccountForms} from './helpers/account-workspace-fixture';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {saveCustomerAddress,validateAddressFormSubmission,deleteCustomerAddress,updateCustomerProfile,validateReviewFormSubmission,createProductReview} from '../lib/db/repositories/customers';
import {validateAnswersForDefinition} from '../lib/forms/validation';
import {FORM_REGISTRY} from '../lib/forms/registry';
import {createDataRightsRequest,validatePrivacyRequestForm} from '../lib/db/repositories/operations';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {saveFormDraft,publishFormDraft} from '../lib/db/repositories/form-catalog';

void test('an actual address deletion cannot commit after the customer is disabled between preflight and native batch',async()=>{
 const f=await completeVersionFixture(Date.now());try{await publishAccountForms(f,['account.address']);const config=await resolvePublishedForm(f.db,'account.address'),input={label:'Fictional original address',recipientName:'Fictional original customer',phone:'9812345678',province:'Koshi',district:'Morang',municipality:'Biratnagar',ward:'4',locality:'Fictional original place',isDefault:false},form=await validateAddressFormSubmission(f.db,input,config.version,[]),id=await saveCustomerAddress(f.db,{userId:'customer',input,requestId:'native-authority-original-address',now:f.now,form});let raced=false;
  const db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(!raced){raced=true;f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='customer'").run();}return f.db.batch(statements);}}as D1Database;
  const outcome=await Promise.allSettled([deleteCustomerAddress(db,{userId:'customer',addressId:id,requestId:'native-disabled-address-delete',now:f.now+1})]);
  assert.equal(raced,true);assert.ok(f.sqlite.prepare('SELECT id FROM addresses WHERE id=?').get(id),'The disabled account still deleted its original address in the native commit window.');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*)n FROM audit_logs WHERE request_id='native-disabled-address-delete'").get()?.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*)n FROM address_answer_owner_tombstones WHERE deletion_request_id='native-disabled-address-delete'").get()?.n,0);assert.equal(outcome[0].status,'rejected');
 }finally{f.dispose();}
});

for(const action of ['profile','address','privacy']as const)void test('form-backed '+action+' cannot commit after its active customer role is removed at the actual batch',async()=>{
 const f=await completeVersionFixture(Date.now());try{const formId=action==='profile'?'account.profile':action==='address'?'account.address':'account.privacy-request';await publishAccountForms(f,[formId]);const config=await resolvePublishedForm(f.db,formId),requestId='native-customer-role-'+action,originalName=f.sqlite.prepare("SELECT display_name name FROM users WHERE id='customer'").get()?.name;let raced=false;
  const db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(!raced){raced=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='customer' AND role='customer'").run();}return f.db.batch(statements);}}as D1Database;let operation:Promise<unknown>;
  if(action==='profile'){const version=await f.db.prepare("SELECT id FROM form_config_versions WHERE form_id='account.profile' AND version=? AND status='published'").bind(config.version).first<{id:string}>();assert.ok(version);operation=updateCustomerProfile(db,{userId:'customer',displayName:'Changed after role revocation',phone:'',locale:'en-NP',requestId,now:f.now,formVersion:config.version,versionId:version.id,answers:validateAnswersForDefinition(FORM_REGISTRY['account.profile'],config,[])});}
  else if(action==='address'){const input={label:'Fictional role-scoped address',recipientName:'Fictional original customer',phone:'9812345678',province:'Koshi',district:'Morang',municipality:'Biratnagar',ward:'4',locality:'Fictional original place',isDefault:false},form=await validateAddressFormSubmission(f.db,input,config.version,[]);operation=saveCustomerAddress(db,{userId:'customer',input,requestId,now:f.now,form});}
  else{const form=await validatePrivacyRequestForm(f.db,config.version,[]);operation=createDataRightsRequest(db,{customerId:'customer',requestType:'access',detail:'The original active customer requests its own private account information.',requestId,now:f.now,form});}
  const outcome=await Promise.allSettled([operation]);assert.equal(raced,true);assert.equal(f.sqlite.prepare("SELECT status FROM users WHERE id='customer'").get()?.status,'active');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*)n FROM audit_logs WHERE request_id=? OR request_id=?").get(requestId,requestId+':audit')?.n,0,'Removing current customer authority must prevent the native receipt and mutation.');
  assert.equal(f.sqlite.prepare("SELECT display_name name FROM users WHERE id='customer'").get()?.name,originalName);assert.equal(f.sqlite.prepare("SELECT COUNT(*)n FROM addresses WHERE user_id='customer'").get()?.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*)n FROM data_rights_requests WHERE customer_id='customer'").get()?.n,0);assert.equal(outcome[0].status,'rejected');
 }finally{f.dispose();}
});

void test('a genuine delivered-purchase review cannot commit after current customer authority is removed at its native batch',async()=>{
 const f=await deliveredLiveFinancialFixture();try{const draft=await saveFormDraft(f.db,{formId:'account.review',actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId:'account.review',fields:[]},reason:'Use the actual supported form for native delivered-purchase authority.',requestId:'review-role-form-draft',now:Date.now()});await publishFormDraft(f.db,{formId:'account.review',draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Publish only inside this inspected actual in-memory lifecycle.',requestId:'review-role-form-published',now:Date.now()});
  const config=await resolvePublishedForm(f.db,'account.review'),form=await validateReviewFormSubmission(f.db,config.version,[]),requestId='native-review-customer-role',body='The original verified buyer describes this genuine fictional delivered purchase.',digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({orderItemId:f.orderItemId,rating:4,title:'Original buyer',body,photos:[]}))),requestDigest=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');let raced=false;
  const db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(!raced){raced=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id=? AND role='customer'").run(f.buyerId);}return f.db.batch(statements);}}as D1Database;
  const outcome=await Promise.allSettled([createProductReview(db,{userId:f.buyerId,productId:f.productId,orderItemId:f.orderItemId,rating:4,title:'Original buyer',body,requestId,now:Date.now(),form,requestDigest})]);assert.equal(raced,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*)n FROM product_reviews WHERE order_item_id=?').get(f.orderItemId)?.n,0,'The old authenticated buyer may not submit after its current role is revoked at commit.');assert.equal(f.sqlite.prepare('SELECT COUNT(*)n FROM audit_logs WHERE request_id=?').get(requestId)?.n,0);assert.equal(outcome[0].status,'rejected');
 }finally{f.dispose();}
});
