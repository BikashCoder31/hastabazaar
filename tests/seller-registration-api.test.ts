import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';

declare global {
  var registrationTestDb: D1Database;
  var registrationTestActor: { userId: string; authSubject: string; email: string };
}
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {url:'data:text/javascript,export const env={get DB(){return globalThis.registrationTestDb}}',shortCircuit:true};
  if (specifier === '@/lib/auth/customer') return {url:'data:text/javascript,export class CustomerAuthorizationError extends Error{}; export async function requireExistingCustomerApi(){return globalThis.registrationTestActor}',shortCircuit:true};
  if (specifier === '@/lib/auth/seller-commercial-access') return {url:'data:text/javascript,export class SellerTermsAuthorizationError extends Error{}; export async function requireSellerTermsApi(){return globalThis.registrationTestActor}',shortCircuit:true};
  return next(specifier,context);
}});

void test('actual optional registration API accepts blanks, keeps email verification separate and supports owned dashboard edits',async()=>{
  const f=await companyStoreMakerFixture();
  try {
    globalThis.registrationTestDb=f.db; globalThis.registrationTestActor={userId:'api-user',authSubject:'api-user',email:'api@local.hastabazaar.test'};
    f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES ('api-user','api-user','api@local.hastabazaar.test','Fictional API applicant','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('api-user','customer',1);
      INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('api-v1','seller.application',1,1,'published','{"formId":"seller.application","fields":[{"id":"extra_note","key":"extra_note","label":"Additional note","type":"short_text","required":true,"order":0,"status":"active"}]}','Fixture','reviewer',1,'reviewer',1,'reviewer',1,'publish-api');`);
    const api=await import('../app/api/seller-registrations/route');
    const data=new FormData();data.set('requestId','api-first');data.set('formVersion','1');data.set('email',globalThis.registrationTestActor.email);data.set('phone','');data.set('hasBusinessTaxRegistration','no');
    const request=(method='POST',origin='http://localhost:3018')=>new Request('http://localhost:3018/api/seller-registrations',{method:method === 'PUT' ? 'PUT' : 'POST',headers:{origin},body:data});
    const unverified=await api.POST(request());assert.equal(unverified.status,409);assert.equal((await unverified.json() as {code:string}).code,'email_verification_required');
    f.sqlite.exec("INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES ('api-user','api@local.hastabazaar.test',1)");
    assert.equal((await api.POST(request('POST','https://foreign.test'))).status,403);
    const created=await api.POST(request());const first=await created.json() as {applicationReference:string;missing:string[];error?:string};assert.equal(created.status,201,first.error);assert.ok(first.missing.length);
    const retry=await api.POST(request());assert.equal(retry.status,200);assert.equal((await retry.json() as {applicationReference:string}).applicationReference,first.applicationReference);
    const saved=await (await api.GET()).json() as {registration:{version:number}};
    data.set('requestId','api-update');data.set('revision',String(saved.registration.version));data.set('phone','123');
    assert.equal((await api.PUT(request('PUT'))).status,400);
    data.set('phone','1234567890');data.set('phoneCountry','NP');
    const updated=await api.PUT(request('PUT'));assert.equal(updated.status,200,await updated.text());
    assert.equal(f.sqlite.prepare("SELECT support_phone FROM seller_profiles WHERE user_id='api-user'").get()?.support_phone,'+9771234567890');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account_phone_verifications WHERE user_id='api-user'").get()?.n,0);
    globalThis.registrationTestActor={userId:'foreign-user',authSubject:'foreign-user',email:'foreign@local.hastabazaar.test'};
    assert.equal((await (await api.GET()).json() as {registration:unknown}).registration,null);
  } finally {f.sqlite.close();}
});
