import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { commissionDatabase, historicalCommissionDatabase } from './helpers/commission-database';
import { getRegisteredSellerTerms } from '../lib/db/repositories/marketplace-settings';
import { createSellerApplication } from '../lib/db/repositories/seller-applications';
import { parseSellerApplication, sellerDocumentsForApplication } from '../lib/sellers/application';

async function renewalRoute(database: D1Database) {
  const compiled = await build({
    entryPoints: ['app/api/seller/agreements/route.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs',
    plugins: [{ name: 'isolated-consent-boundaries', setup(b) {
      b.onResolve({ filter: /^(cloudflare:workers|@\/lib\/auth\/seller)$/ }, args => ({ path: args.path, namespace: 'consent' }));
      b.onLoad({ filter: /.*/, namespace: 'consent' }, args => ({ loader: 'js', contents:
        args.path === 'cloudflare:workers' ? 'exports.env={DB:__database};' :
          `exports.SellerAuthorizationError=class extends Error{};exports.requireSellerApi=async()=>({sellerId:'seller-a',userId:'user-a',sellerAgreementVersion:'previous-agreement'});`,
      }));
    } }],
  });
  const compiledModule = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  runInNewContext(compiled.outputFiles[0].text, {
    module: compiledModule, exports: compiledModule.exports, require: createRequire(import.meta.url),
    process, crypto: globalThis.crypto, Response, Request, Headers, URL, TextEncoder, Intl, __database: database,
  });
  return compiledModule.exports.POST;
}

function request(body: Record<string, unknown>) {
  return new Request('https://shop.example.test/api/seller/agreements', {
    method: 'POST', headers: { origin: 'https://shop.example.test', 'content-type': 'application/json', 'x-request-id': 'renewal-evidence' },
    body: JSON.stringify(body),
  });
}

void test('English renewal rejects missing or unsupported language without recording acceptance', async () => {
  const f = await historicalCommissionDatabase();
  try {
    const terms = await getRegisteredSellerTerms(f.database);
    const post = await renewalRoute(f.database);
    for (const language of [undefined, null, '', 'ne', 'fr', 12, {}]) {
      const response = await post(request({ accepted: true, termsContext: terms.context, ...(language === undefined ? {} : { language }) }));
      assert.equal(response.status, 400, `Unsupported language ${JSON.stringify(language)}: ${await response.clone().text()}`);
    }
    assert.equal((await f.database.prepare('SELECT COUNT(*) AS n FROM seller_agreement_acceptance_history').first<{ n: number }>())?.n, 0);
  } finally { await f.dispose(); }
});

void test('renewal audit retains the exact document, context, language, rate, version, actor and time', async () => {
  const f = await commissionDatabase();
  try {
    await f.database.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,change_control,
      effective_from,reason,created_by,created_at,approved_by,approved_at,published_by,published_at,last_request_id)
      VALUES('saved-rate','independent_seller_commission_bps',1,'725','published','controlled',1,'Isolated saved rate','owner',1,'owner',1,'owner',1,'saved-rate-publication')`).run();
    const terms = await getRegisteredSellerTerms(f.database);
    await f.database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,created_at)
      VALUES('historical-consent','user-a','seller.agreement.accepted','seller','seller-a','Historical evidence',NULL,'{"languagePresented":"ne","version":"old"}',1)`).run();
    const response = await (await renewalRoute(f.database))(request({ accepted: true, language: 'en', termsContext: terms.context }));
    assert.equal(response.status, 200, await response.clone().text());
    const row = await f.database.prepare("SELECT actor_id AS actorId,next_json AS json,created_at AS createdAt FROM audit_logs WHERE request_id='renewal-evidence'").first<{ actorId: string; json: string; createdAt: number }>();
    assert.ok(row);
    const snapshot = JSON.parse(row.json).registeredTermsSnapshot;
    assert.deepEqual(snapshot, { schema: 1, context: terms.context, agreementVersion: terms.agreementVersion,
      commissionSettingVersionId: 'saved-rate', commissionBps: 725, document: terms.document, language: 'en', acceptedAt: row.createdAt, acceptedBy: 'user-a' });
    assert.equal(row.actorId, 'user-a');
    const acceptance = await f.database.prepare('SELECT accepted_at AS acceptedAt,accepted_by AS acceptedBy,language_presented AS language FROM seller_agreement_acceptance_history').first();
    assert.deepEqual({ ...acceptance }, { acceptedAt: row.createdAt, acceptedBy: 'user-a', language: 'en' });
    assert.equal((await f.database.prepare("SELECT next_json AS json FROM audit_logs WHERE id='historical-consent'").first<{ json: string }>())?.json, '{"languagePresented":"ne","version":"old"}');
  } finally { await f.dispose(); }
});

void test('registered application appends the same complete consent snapshot alongside the form digest', async () => {
  const f = await historicalCommissionDatabase();
  const now = 2_000;
  try {
    await f.database.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('applicant','applicant@example.test','Applicant','active',1,1)").run();
    await f.database.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('applicant','customer',1)").run();
    await f.database.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,created_at) VALUES('start','applicant','seller.registration.started','user','applicant','Explicit onboarding start',1)").run();
    await f.database.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES('application-form','seller.application',1,'published','{"formId":"seller.application","fields":[]}','Isolated consent test','owner',1,'owner',1,'owner',1,'application-form-publication')`).run();
    const form = new FormData();
    for (const [key, value] of Object.entries({ hasBusinessTaxRegistration: 'yes', applicantType: 'individual', taxStatus: 'business_pan_only',
      legalName: 'Test Applicant', tradingName: 'Test Studio', taxRegistrationNumber: '123456789', email: 'applicant@example.test',
      phone: '9800000001', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Test workshop',
      publicCity: 'Kathmandu', businessDescription: 'Handmade products for isolated tests.', productCategories: 'Crafts', acceptedTerms: 'yes' })) form.set(key, value);
    const parsed = parseSellerApplication(form);
    assert.ok(parsed.input, parsed.errors.join('\n'));
    const terms = await getRegisteredSellerTerms(f.database, now);
    const documents = sellerDocumentsForApplication(parsed.input).filter(item => item.required).map(item => ({
      id: `doc-${item.kind}`, kind: item.kind, objectKey: `private/seller-documents/new-seller/${item.kind}`,
      originalName: 'SIMULATED-certificate.pdf', mimeType: 'application/pdf', sizeBytes: 100,
    }));
    await createSellerApplication(f.database, { userId: 'applicant', existingAccount: true, sellerId: 'new-seller',
      applicationReference: 'ISOLATED-CONSENT', input: parsed.input, documents, now, registeredAgreementContext: terms.context,
      form: { requestId: 'application-evidence', versionId: 'application-form', digest: 'existing-form-digest',
        answers: { formId: 'seller.application', version: 1, answers: [] } } });
    const audit = await f.database.prepare("SELECT next_json AS json FROM audit_logs WHERE request_id='application-evidence'").first<{ json: string }>();
    assert.ok(audit);
    const next = JSON.parse(audit.json);
    assert.equal(next.catalogDigest, 'existing-form-digest');
    assert.deepEqual(next.registeredTermsSnapshot, { schema: 1, context: terms.context, agreementVersion: terms.agreementVersion,
      commissionSettingVersionId: terms.versionId, commissionBps: 900, document: terms.document, language: 'en', acceptedAt: now, acceptedBy: 'applicant' });
  } finally { await f.dispose(); }
});

void test('confirmed exact current consent repairs a stale profile without duplicating acceptance', async () => {
  const f = await historicalCommissionDatabase();
  try {
    const terms = await getRegisteredSellerTerms(f.database);
    const post = await renewalRoute(f.database);
    const body = { accepted: true, language: 'en', termsContext: terms.context };
    const original = await post(request(body));
    assert.equal(original.status, 200, await original.clone().text());
    const history = f.sqlite.prepare('SELECT * FROM seller_agreement_acceptance_history').all();
    f.sqlite.prepare("UPDATE seller_profiles SET seller_agreement_version='local-test-v1',seller_agreement_accepted_at=1 WHERE id='seller-a'").run();
    const retry = await post(request(body));
    assert.equal(retry.status, 200, await retry.clone().text());
    assert.equal(f.sqlite.prepare("SELECT seller_agreement_version AS version FROM seller_profiles WHERE id='seller-a'").get()?.version, terms.agreementVersion);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_agreement_acceptance_history').all(), history);
    assert.equal(f.sqlite.prepare("SELECT seller_agreement_accepted_at AS acceptedAt FROM seller_profiles WHERE id='seller-a'").get()?.acceptedAt, history[0].accepted_at);
    f.sqlite.prepare("UPDATE seller_profiles SET seller_agreement_version='local-test-v1' WHERE id='seller-a'").run();
    f.sqlite.prepare("UPDATE audit_logs SET next_json='{}' WHERE request_id='renewal-evidence'").run();
    const unproven = await post(request(body));
    assert.equal(unproven.status, 500, await unproven.clone().text());
    assert.equal(f.sqlite.prepare("SELECT seller_agreement_version AS version FROM seller_profiles WHERE id='seller-a'").get()?.version, 'local-test-v1');
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_agreement_acceptance_history').all(), history);
  } finally { await f.dispose(); }
});