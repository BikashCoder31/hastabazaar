import assert from 'node:assert/strict';
import test from 'node:test';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {publishAccountForms} from './helpers/account-workspace-fixture';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {validateAnswersForDefinition} from '../lib/forms/validation';
import {FORM_REGISTRY} from '../lib/forms/registry';
import {updateCustomerProfile,saveCustomerAddress,deleteCustomerAddress,createProductReview,validateAddressFormSubmission,validateReviewFormSubmission} from '../lib/db/repositories/customers';
import {createDataRightsRequest,validatePrivacyRequestForm} from '../lib/db/repositories/operations';

void test('disposable native D1 preserves account authority at commit and exact original receipts',{timeout:180000},async()=>{
 const f=await deliveredLiveFinancialFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|null=null;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  await publishAccountForms(f,['account.profile','account.address','account.privacy-request','account.review']);
  native=await nativeFinanceClone(f.sqlite);const db=native.db,actor=f.buyerId,now=Date.now();
  const profile=await resolvePublishedForm(db,'account.profile'),address=await resolvePublishedForm(db,'account.address'),privacy=await resolvePublishedForm(db,'account.privacy-request'),review=await resolvePublishedForm(db,'account.review');
  const profileVersion=await db.prepare("SELECT id FROM form_config_versions WHERE form_id='account.profile' AND version=? AND status='published'").bind(profile.version).first<{id:string}>();assert.ok(profileVersion);
  const input={label:'Native fictional address',recipientName:'Fictional Native Buyer',phone:'9811111111',province:'Koshi',district:'Morang',municipality:'Biratnagar',ward:'4',locality:'Fictional native locality',isDefault:false};
  const addressForm=await validateAddressFormSubmission(db,input,address.version,[]),privacyForm=await validatePrivacyRequestForm(db,privacy.version,[]),reviewForm=await validateReviewFormSubmission(db,review.version,[]);
  const reviewBody='The original delivered fictional purchase is reviewed by its current authorized buyer.';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({orderItemId:f.orderItemId,rating:4,title:'Native original purchase',body:reviewBody,photos:[]})));
  const requestDigest=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const operations={
   profile:(target:D1Database,requestId:string)=>updateCustomerProfile(target,{userId:actor,displayName:'Native Current Buyer',phone:'9811111111',locale:'en-NP',requestId,now,formVersion:profile.version,versionId:profileVersion.id,answers:validateAnswersForDefinition(FORM_REGISTRY['account.profile'],profile,[])}),
   address:(target:D1Database,requestId:string)=>saveCustomerAddress(target,{userId:actor,input,requestId,now,form:addressForm}),
   privacy:(target:D1Database,requestId:string)=>createDataRightsRequest(target,{customerId:actor,requestType:'access',detail:'The fictional original buyer requests its own retained account information.',requestId,now,form:privacyForm}),
   review:(target:D1Database,requestId:string)=>createProductReview(target,{userId:actor,productId:f.productId,orderItemId:f.orderItemId,rating:4,title:'Native original purchase',body:reviewBody,requestId,requestDigest,now,form:reviewForm}),
  };
  let addressId='';
  for(const [action,operation]of Object.entries(operations)){
   const requestId='d1-current-customer-'+action;let raced=false;
   const before=await db.prepare('SELECT display_name name FROM users WHERE id=?').bind(actor).first<{name:string}>();
   const racing={prepare:db.prepare.bind(db),async batch(statements:D1PreparedStatement[]){if(!raced){raced=true;await db.prepare("DELETE FROM user_roles WHERE user_id=? AND role='customer'").bind(actor).run();}return db.batch(statements);}}as D1Database;
   await assert.rejects(operation(racing,requestId),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===403,action+' must reject its real revoked role');assert.equal(raced,true);
   assert.equal((await db.prepare('SELECT COUNT(*)n FROM audit_logs WHERE request_id=? OR request_id=?').bind(requestId,requestId+':audit').first<{n:number}>())?.n,0);
   assert.deepEqual(await db.prepare('SELECT display_name name FROM users WHERE id=?').bind(actor).first(),before);
   await db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'customer',?)").bind(actor,now).run();
   const result=await operation(db,requestId);assert.deepEqual(await operation(db,requestId),result,'Exact original '+action+' retry must recover its original result.');
   if(action==='address')addressId=String(result);
  }
  assert.ok(addressId);let disabled=false;const deletion={userId:actor,addressId,requestId:'d1-current-customer-delete',now};
  const racing={prepare:db.prepare.bind(db),async batch(statements:D1PreparedStatement[]){if(!disabled){disabled=true;await db.prepare("UPDATE users SET status='disabled' WHERE id=?").bind(actor).run();}return db.batch(statements);}}as D1Database;
  await assert.rejects(deleteCustomerAddress(racing,deletion),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===403);
  assert.ok(await db.prepare('SELECT id FROM addresses WHERE id=?').bind(addressId).first());
  assert.equal((await db.prepare('SELECT COUNT(*)n FROM address_answer_owner_tombstones WHERE deletion_request_id=?').bind(deletion.requestId).first<{n:number}>())?.n,0);
  await db.prepare("UPDATE users SET status='active' WHERE id=?").bind(actor).run();await deleteCustomerAddress(db,deletion);await deleteCustomerAddress(db,deletion);
  assert.equal((await db.prepare('SELECT COUNT(*)n FROM address_answer_owner_tombstones WHERE deletion_request_id=?').bind(deletion.requestId).first<{n:number}>())?.n,1);
  assert.equal((await db.prepare('SELECT COUNT(*)n FROM product_reviews WHERE order_item_id=?').bind(f.orderItemId).first<{n:number}>())?.n,1);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }catch(error){
  const detail=error as {message?:unknown;cause?:{message?:unknown;code?:unknown}};
  const tables=f.sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()as {name:string}[];
  const rowCount=tables.reduce((sum,row)=>sum+Number(f.sqlite.prepare('SELECT COUNT(*)n FROM "'+row.name.replaceAll('"','""')+'"').get()!.n),0);
  console.error(JSON.stringify({phase:native?'native-authority-checks':'native-fixture-clone',fixtureTables:tables.length,fixtureRows:rowCount,message:String(detail.message),causeMessage:typeof detail.cause?.message==='string'?detail.cause.message:JSON.stringify(detail.cause?.message??''),causeCode:typeof detail.cause?.code==='string'?detail.cause.code:JSON.stringify(detail.cause?.code??'')}));throw error;
 }finally{await native?.dispose();f.dispose();}
});
