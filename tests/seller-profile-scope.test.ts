import './helpers/seller-registration-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {sellerProfileScopeFixture} from './helpers/seller-profile-scope-fixture';
import {registrationScopeOrigin as origin} from './helpers/seller-registration-scope-fixture';

const request=(body:unknown,actor:string)=>new Request(origin+'/api/seller/profile',{method:'PATCH',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});
void test('approved private workshop receiver rejects another internal actor without changing source or publication',async()=>{
 const f=await sellerProfileScopeFixture();try{
  const before=f.sqlite.prepare("SELECT municipality FROM seller_profiles WHERE id='registered'").get()!.municipality,publication=f.sqlite.prepare("SELECT current_json,last_normal_publication_at FROM seller_public_profile_states WHERE seller_id='registered'").get();
  const response=await f.api.PATCH(request(f.input('PRIVATE WRONG INTENT WORKSHOP'),'applicant'));assert.equal(response.status,403,await response.text());assert.equal(f.sqlite.prepare("SELECT municipality FROM seller_profiles WHERE id='registered'").get()!.municipality,before);assert.deepEqual(f.sqlite.prepare("SELECT current_json,last_normal_publication_at FROM seller_public_profile_states WHERE seller_id='registered'").get(),publication);
  const external=await f.api.PATCH(request(f.input('PRIVATE OWN WORKSHOP'),'external-profile-owner'));assert.equal(external.status,403,'external auth subject is not rendered internal actor');
  const body=f.input('PRIVATE OWN WORKSHOP');const own=await f.api.PATCH(request(body,'registered-owner'));assert.equal(own.status,200,await own.text());const replay=await f.api.PATCH(request(body,'registered-owner'));assert.equal(replay.status,200,await replay.text());assert.equal(f.sqlite.prepare("SELECT municipality FROM seller_profiles WHERE id='registered'").get()!.municipality,'PRIVATE OWN WORKSHOP');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='seller.profile.updated' AND subject_id='registered'").get()!.n,1);assert.deepEqual(f.sqlite.prepare("SELECT current_json,last_normal_publication_at FROM seller_public_profile_states WHERE seller_id='registered'").get(),publication);

 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});

void test('the private workshop receiver rejects invalid ward numbers before saving', async () => {
 const f = await sellerProfileScopeFixture();
 try {
  const original = f.sqlite.prepare("SELECT ward FROM seller_profiles WHERE id='registered'").get();
  const body = f.input('Fictional workshop municipality');
  const invalid = await f.api.PATCH(request({ ...body, profile: { ...body.profile, ward: 'abc' } }, 'registered-owner'));
  assert.equal(invalid.status, 409, await invalid.text());
  assert.deepEqual(f.sqlite.prepare("SELECT ward FROM seller_profiles WHERE id='registered'").get(), original);
  const valid = await f.api.PATCH(request({ ...body, profile: { ...body.profile, ward: '15' } }, 'registered-owner'));
  assert.equal(valid.status, 200, await valid.text());
  assert.equal(f.sqlite.prepare("SELECT ward FROM seller_profiles WHERE id='registered'").get()?.ward, '15');
 } finally { globalThis.registrationScopeIdentity = null; f.dispose(); }
});

void test('private workshop role loss at native commit cannot write after approved-source preflight',async()=>{
 const f=await sellerProfileScopeFixture();try{
  const before=f.sqlite.prepare("SELECT municipality FROM seller_profiles WHERE id='registered'").get()!.municipality;
  f.setBeforeBatch(()=>{f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='registered-owner' AND role='seller'").run();});
  const response=await f.api.PATCH(request(f.input('PRIVATE ROLE RACE WORKSHOP'),'registered-owner'));assert.equal(response.status,403,'known current seller role loss must deny, not report an uncertain server failure');assert.equal(f.sqlite.prepare("SELECT municipality FROM seller_profiles WHERE id='registered'").get()!.municipality,before);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='seller.profile.updated' AND subject_id='registered'").get()!.n,0);const {requireExistingCustomerApi}=await import('../lib/auth/customer');assert.equal((await requireExistingCustomerApi()).userId,'registered-owner','seller role loss does not revoke the separate current customer role');
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});


void test('private workshop original outcome is native owner-bound evidence independent of later form configuration',async()=>{
 const f=await sellerProfileScopeFixture();try{
  assert.equal(typeof f.api.GET,'function','reload recovery needs a native original-receipt reader');
  const body=f.input('PRIVATE ORIGINAL SAVED WORKSHOP'),saved=await f.api.PATCH(request(body,'registered-owner'));assert.equal(saved.status,200);
  await f.republish();const stale=await f.api.PATCH(request(body,'registered-owner'));assert.equal(stale.status,200,'existing versioned native replay survives a later configuration and must remain supported');
  const url=origin+'/api/seller/profile?sellerId=registered&requestId='+body.idempotencyKey;
  const check=(actor='registered-owner')=>f.api.GET(new Request(url,{headers:{'X-Hastabazaar-Actor':actor}}));
  const before=f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='seller.profile.updated'").get()!.n;
  const own=await check();assert.equal(own.status,200);assert.deepEqual(await own.json(),{status:'recorded',requestId:body.idempotencyKey});assert.equal((await check('applicant')).status,403);
  const unknown=await f.api.GET(new Request(origin+'/api/seller/profile?sellerId=registered&requestId='+crypto.randomUUID(),{headers:{'X-Hastabazaar-Actor':'registered-owner'}}));assert.equal(unknown.status,200);assert.equal((await unknown.json()as{status:string}).status,'unconfirmed');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='seller.profile.updated'").get()!.n,before,'checking an outcome never resends');
  const prepare=f.db.prepare.bind(f.db);let revoked=false;f.db.prepare=(sql:string)=>{const statement=prepare(sql);if(sql.startsWith('SELECT id FROM audit_logs WHERE request_id=')){const first=statement.first.bind(statement);statement.first=async<T>(column?:string)=>{const result=column===undefined?await first<T>():await first<T>(column);if(!revoked){revoked=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='registered-owner' AND role='seller'").run();}return result;};}return statement;};const denied=await check();assert.ok(revoked);assert.equal(denied.status,403,'original outcome also rechecks authority after asynchronous receipt lookup');

 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});
