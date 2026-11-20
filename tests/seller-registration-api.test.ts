import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { getManagedMakerApplicationTerms } from '../lib/db/repositories/managed-maker-details';
import { getRegisteredSellerTerms } from '../lib/db/repositories/marketplace-settings';
import { startSellerRegistration } from '../lib/db/repositories/seller-commercial-access';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '../lib/sellers/managed-identity';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';

declare global {
  var registrationTestDb: D1Database;
  var registrationTestActor: { userId: string; authSubject: string; email: string };
}
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {url:'data:text/javascript,export const env={get DB(){return globalThis.registrationTestDb}}',shortCircuit:true};
  if (specifier === '@/lib/auth/customer') return {url:'data:text/javascript,export class CustomerAuthorizationError extends Error{}; export async function requireExistingCustomerApi(){return globalThis.registrationTestActor}',shortCircuit:true};
  if (specifier === '@/lib/auth/seller-center') return {url:'data:text/javascript,export class SellerCenterAuthorizationError extends Error{}; export async function requireSellerCenterApi(){return globalThis.registrationTestActor}',shortCircuit:true};
  return next(specifier,context);
}});

async function acceptManagedTerms(db: D1Database, data: FormData) {
  const terms = await getManagedMakerApplicationTerms(db, Date.now(), MANAGED_SUPPLIER_AGREEMENT_VERSION);
  data.set('managedAgreementAccepted', 'yes');
  data.set('managedAgreementContext', terms.context);
  data.set('managedAgreementVersion', terms.version);
  data.set('applicationAcknowledgement', 'yes');
}

void test('optional registration without editorial publication preserves core identity guards and receipts', async () => {
  const f = await companyStoreMakerFixture();
  try {
    globalThis.registrationTestDb = f.db;
    globalThis.registrationTestActor = { userId: 'core-applicant', authSubject: 'core-applicant', email: 'core-applicant@local.hastabazaar.test' };
    f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('core-applicant','core-applicant','core-applicant@local.hastabazaar.test','Fictional core applicant','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES('core-applicant','customer',1);`);
    const api = await import('../app/api/seller-registrations/route');
    const data = new FormData();
    data.set('requestId', 'core-registration'); data.set('formVersion', '1');
    data.set('email', globalThis.registrationTestActor.email); data.set('hasBusinessTaxRegistration', 'no');
    const request = () => new Request('http://localhost:3018/api/seller-registrations', { method: 'POST', headers: { origin: 'http://localhost:3018' }, body: data });
    assert.equal((await api.POST(request())).status, 409, 'verified account email remains required');
    f.sqlite.exec("INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES('core-applicant','core-applicant@local.hastabazaar.test',1)");
    await acceptManagedTerms(f.db, data);
    const created = await api.POST(request());
    assert.equal(created.status, 201, await created.text());
    assert.equal((await api.POST(request())).status, 200, 'lost-response retry reuses the same application');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_profiles WHERE user_id='core-applicant'").get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='seller.application'").get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE actor_id='core-applicant' AND action='form.core_answers'").get()?.n, 1);
  } finally { f.dispose(); }
});

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
    await acceptManagedTerms(f.db, data);
    const created=await api.POST(request());const first=await created.json() as {applicationReference:string;missing:string[];error?:string};assert.equal(created.status,201,first.error);assert.ok(first.missing.length);
    const retry=await api.POST(request());assert.equal(retry.status,200);assert.equal((await retry.json() as {applicationReference:string}).applicationReference,first.applicationReference);
    data.delete('applicationAcknowledgement');
    const saved=await (await api.GET()).json() as {registration:{version:number}};
    data.set('requestId','api-update');data.set('revision',String(saved.registration.version));data.set('phone','123');
    assert.equal((await api.PUT(request('PUT'))).status,400);
    data.set('phone','1234567890');data.set('phoneCountry','NP');
    const updated=await api.PUT(request('PUT'));assert.equal(updated.status,200,await updated.text());
    assert.equal(f.sqlite.prepare("SELECT support_phone FROM seller_profiles WHERE user_id='api-user'").get()?.support_phone,'+9771234567890');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account_phone_verifications WHERE user_id='api-user'").get()?.n,0);
    const sellerId = f.sqlite.prepare("SELECT id FROM seller_profiles WHERE user_id='api-user'").get()!.id;
    f.sqlite.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES('verified-intake-id',?,'representative_identity','private/fixture-id','fictional.png','image/png',20,'verified',1)").run(sellerId);
    data.set('requestId','api-unrelated-phone'); data.set('revision','2'); data.set('phone','9800000001');
    const contact = await api.PUT(request('PUT')); assert.equal(contact.status,200,await contact.text());
    data.set('requestId','api-protected-name'); data.set('revision','3'); data.set('legalName','Different legal identity');
    assert.equal((await api.PUT(request('PUT'))).status,409, 'Verified identity facts require their own reviewed request.');
    assert.notEqual(f.sqlite.prepare('SELECT legal_name FROM seller_profiles WHERE id=?').get(sellerId)?.legal_name,'Different legal identity');
    globalThis.registrationTestActor={userId:'foreign-user',authSubject:'foreign-user',email:'foreign@local.hastabazaar.test'};
    assert.equal((await (await api.GET()).json() as {registration:unknown}).registration,null);
  } finally {f.sqlite.close();}
});

for (const route of ['registered', 'managed'] as const) {
  void test(`new ${route} submission requires two explicit acknowledgements and current terms`, async () => {
    const f = await companyStoreMakerFixture();
    try {
      globalThis.registrationTestDb = f.db;
      globalThis.registrationTestActor = { userId: 'applicant', authSubject: 'applicant', email: 'applicant@local.hastabazaar.test' };
      f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('applicant','applicant','applicant@local.hastabazaar.test','Fictional applicant','active',1,1);
        INSERT INTO user_roles(user_id,role,assigned_at) VALUES('applicant','customer',1);
        INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES('applicant','applicant@local.hastabazaar.test',1);`);
      await startSellerRegistration(f.db, { userId: 'applicant', requestId: 'start-new-consent', now: Date.now() });
      const api = await import('../app/api/seller-registrations/route');
      const data = new FormData();
      const registered = route === 'registered';
      data.set('email', globalThis.registrationTestActor.email);
      data.set('requestId', 'new-registration-consent');
      data.set('formVersion', '1');
      data.set('hasBusinessTaxRegistration', registered ? 'yes' : 'no');
      const submit = () => api.POST(new Request('http://localhost:3018/api/seller-registrations', {
        method: 'POST', headers: { origin: 'http://localhost:3018' }, body: data,
      }));
      const acceptance = registered ? 'acceptedTerms' : 'managedAgreementAccepted';
      const context = registered ? 'sellerAgreementContext' : 'managedAgreementContext';
      const terms = registered ? await getRegisteredSellerTerms(f.db)
        : await getManagedMakerApplicationTerms(f.db, Date.now(), MANAGED_SUPPLIER_AGREEMENT_VERSION);
      data.set(context, terms.context);
      if (!registered) data.set('managedAgreementVersion', MANAGED_SUPPLIER_AGREEMENT_VERSION);
      assert.equal((await submit()).status, 400, 'neither checkbox');
      data.set(acceptance, 'yes');
      assert.equal((await submit()).status, 400, 'agreement only');
      data.delete(acceptance);
      data.set('applicationAcknowledgement', 'yes');
      assert.equal((await submit()).status, 400, 'acknowledgement only');
      data.set(acceptance, 'yes');
      data.delete(context);
      assert.equal((await submit()).status, 409, 'agreement context missing');
      data.set(context, 'superseded-context');
      assert.equal((await submit()).status, 409, 'agreement context mismatches');
      data.set(context, terms.context);
      if (!registered) {
        data.set('managedAgreementVersion', 'superseded-version');
        assert.equal((await submit()).status, 409, 'agreement version mismatches');
        data.set('managedAgreementVersion', MANAGED_SUPPLIER_AGREEMENT_VERSION);
      }
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_profiles WHERE user_id='applicant'").get()?.n, 0);
      const created = await submit();
      assert.equal(created.status, 201, await created.text());
    } finally { f.dispose(); }
  });
}
