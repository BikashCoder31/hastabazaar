import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {verifiedPayoutSources} from './helpers/verified-payout-sources';
import {requestSellerPayout,prepareSellerPayout,processPayoutRequest} from '../lib/db/repositories/payouts';
import {sellerPayoutRequestReadiness} from '../lib/payments/payout-request-readiness';
import {addModernPayoutRegistration} from './helpers/modern-payout-registration';

async function fixture(verified=true){const f=await completeVersionFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec("UPDATE payout_requests SET status='rejected' WHERE id='legacy-payout'; INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('original-earned','registered','sale',12000,1,'Explicit fictional retained registered entitlement',1)");
 if(verified){f.sqlite.exec(`UPDATE seller_profiles SET applicant_type='individual',tax_mode='NONE' WHERE id='registered'; INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at) VALUES('request-identity','registered','representative_identity','private/seller-documents/registered/request-identity','identity.png','image/png',20,'verified',1,'reviewer',1)`);await verifiedPayoutSources(f,'registered');}
 return f;
 }catch(error){f.dispose();throw error;}}

void test('a normal verified payout request accepts an empty note, records its standard purpose and original target, and reserves no money',async()=>{
 const f=await fixture();try{
 const input={sellerId:'registered',actorId:'registered-owner',note:'   ',requestId:'normal-payout-request',now:f.now};
 const id=await requestSellerPayout(f.db,input);
 assert.equal(await requestSellerPayout(f.db,input),id);
 const row=f.sqlite.prepare('SELECT seller_note,purpose,first_finance_due_at,calendar_version,created_at FROM payout_requests WHERE id=?').get(id)!;
 assert.equal(row.seller_note,'');assert.equal(row.purpose,'seller_earnings_payout');assert.equal(row.calendar_version,'continuous-v1');assert.equal(Number(row.first_finance_due_at)-Number(row.created_at),86400000);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_entries').get()!.n,0);
 assert.equal(f.sqlite.prepare("SELECT purpose FROM payout_requests WHERE id='legacy-payout'").get()!.purpose,null);
 await assert.rejects(requestSellerPayout(f.db,{...input,note:'Changed request content must not be accepted as the same saved request.'}));
 await assert.rejects(requestSellerPayout(f.db,{...input,requestId:'second-active-request'}));
 }finally{f.dispose();}
});

void test('payout request replay rechecks current ownership and cannot return another seller request to a foreign actor',async()=>{
 const f=await fixture();try{
 const input={sellerId:'registered',actorId:'registered-owner',note:'Optional fictional payout context.',requestId:'owned-payout-request',now:f.now};
 await requestSellerPayout(f.db,input);
 await assert.rejects(requestSellerPayout(f.db,{...input,actorId:'foreign'}));
 f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='registered-owner'").run();
 await assert.rejects(requestSellerPayout(f.db,input));
 }finally{f.dispose();}
});

void test('a normal request cannot bypass an unverified beneficiary or a current payout hold',async()=>{
 const f=await fixture(false);try{
 const input={sellerId:'registered',actorId:'registered-owner',note:'',requestId:'unverified-request',now:Date.now()};
 await assert.rejects(requestSellerPayout(f.db,input),/verified|identity|hold/i);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM payout_requests WHERE created_request_id='unverified-request'").get()!.n,0);
 }finally{f.dispose();}
});

void test('an existing payout hold blocks a new request while exact saved request recovery remains available',async()=>{
 const f=await fixture();try{
 const input={sellerId:'registered',actorId:'registered-owner',note:'',requestId:'before-request-hold',now:Date.now()};const id=await requestSellerPayout(f.db,input);
 f.sqlite.exec("INSERT INTO seller_capability_holds(id,case_id,seller_id,capability,reason,created_at) SELECT 'request-held',case_id,seller_id,'payouts','Explicit fictional retained bank hold',1 FROM seller_beneficiary_versions WHERE seller_id='registered'");
 assert.equal(await requestSellerPayout(f.db,input),id);
 f.sqlite.prepare("UPDATE payout_requests SET status='rejected' WHERE id=?").run(id);
 await assert.rejects(requestSellerPayout(f.db,{...input,requestId:'after-request-hold'}),/hold|verified/i);
 }finally{f.dispose();}
});

void test('native payout preparation replay is bound to the same original seller actor and reviewed content without a configurable form',async()=>{
 const f=await fixture();try{
 const input={sellerId:'registered',actorId:'reviewer',actorRole:'super_admin' as const,note:'Prepare the complete original eligible payout for a single reviewed instruction.',requestId:'exact-native-preparation',now:Date.now()};
 const saved=await prepareSellerPayout(f.db,input);assert.equal((await prepareSellerPayout(f.db,input)).id,saved.id);
 await assert.rejects(prepareSellerPayout(f.db,{...input,note:'Different content must never recover another original preparation.'}),/different|original/i);
 await assert.rejects(prepareSellerPayout(f.db,{...input,sellerId:'maker'}),/different|original/i);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payouts WHERE created_request_id=?').get(input.requestId)!.n,1);
 }finally{f.dispose();}
});

void test('an approved modern seller must finish registration and record settlement terms before money can be requested or prepared',async()=>{
 const f=await fixture();try{
  addModernPayoutRegistration(f.sqlite,'registered','registered');
  f.sqlite.exec("UPDATE seller_profiles SET settlement_terms_reference=NULL WHERE id='registered'");
  const request={sellerId:'registered',actorId:'registered-owner',note:'',requestId:'modern-request',now:f.now};
  const preparation={sellerId:'registered',actorId:'reviewer',actorRole:'super_admin' as const,note:'Prepare the original independently verified earned balance.',requestId:'modern-prepare',now:f.now};
  assert.equal((await sellerPayoutRequestReadiness(f.db,request.sellerId,f.now)).ready,false);
  await assert.rejects(requestSellerPayout(f.db,request),/registration/i);
  await assert.rejects(prepareSellerPayout(f.db,preparation),/registration/i);
  f.sqlite.exec("UPDATE seller_registration_intakes SET review_ready=1 WHERE seller_id='registered'");
  await assert.rejects(requestSellerPayout(f.db,request),/settlement/i);
  await assert.rejects(prepareSellerPayout(f.db,preparation),/settlement/i);
  f.sqlite.exec("UPDATE seller_profiles SET settlement_terms_reference='Reviewed fictional settlement terms' WHERE id='registered'");
  const requestId=await requestSellerPayout(f.db,request);
  const decision={...preparation,id:requestId,action:'prepare' as const,requestId:'modern-request-prepare'};
  f.sqlite.exec("UPDATE seller_registration_intakes SET review_ready=0 WHERE seller_id='registered'");
  await assert.rejects(processPayoutRequest(f.db,decision),/registration/i);
  f.sqlite.exec("UPDATE seller_registration_intakes SET review_ready=1 WHERE seller_id='registered'");
  await processPayoutRequest(f.db,decision);
  assert.equal(f.sqlite.prepare('SELECT status FROM payout_requests WHERE id=?').get(requestId)?.status,'prepared');
 }finally{f.dispose();}
});

void test('a modern VAT seller must have the newest valid independently verified VAT proof',async()=>{
 const f=await fixture(false);try{
  addModernPayoutRegistration(f.sqlite,'registered','registered',1);
  f.sqlite.exec(`UPDATE seller_profiles SET applicant_type='individual',tax_mode='VAT',settlement_terms_reference='Reviewed fictional settlement terms' WHERE id='registered';
   INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at)
   VALUES ('vat-identity','registered','representative_identity','private/seller-documents/registered/vat-identity','identity.png','image/png',20,'verified',1,'reviewer',1),
   ('older-vat','registered','vat_certificate','private/seller-documents/registered/older-vat','vat.png','image/png',20,'verified',1,'reviewer',1),
   ('newer-vat','registered','vat_certificate','private/seller-documents/registered/newer-vat','vat.png','image/png',20,'rejected',2,'reviewer',2)`);
  const request={sellerId:'registered',actorId:'registered-owner',note:'',requestId:'modern-vat-request',now:f.now};
  await assert.rejects(requestSellerPayout(f.db,request),/VAT evidence/i);
  f.sqlite.exec("UPDATE seller_documents SET status='verified' WHERE id='newer-vat'");
  await verifiedPayoutSources(f,'registered');
  assert.ok(await requestSellerPayout(f.db,request));
 }finally{f.dispose();}
});
