import {
  assertDisposableStagingContext,
  readAndVerifyStagingMarker,
  resolveDisposableStagingPaths,
} from './guards.mjs';
import { applyLocalD1Migrations } from './local-d1.mjs';
import { runIdentityFormReadiness } from './identity-form-readiness.mjs';
import { randomUUID } from 'node:crypto';

assertDisposableStagingContext(process.env);
const paths = resolveDisposableStagingPaths(process.cwd(), process.env);
await readAndVerifyStagingMarker(paths);

const origin = new URL(process.env.APP_ORIGIN);
const health = await fetch(new URL('/health/live', origin), { signal: AbortSignal.timeout(2_000) });
if (!health.ok) throw new Error(`Local staging health check failed (${health.status}).`);

// Miniflare creates the disposable D1 object lazily. A first local-only account
// request may fail before the schema exists, but it safely creates the local
// SQLite object that the guarded migration runner can then initialize.
const d1Bootstrap = await fetch(new URL('/api/local-testing/session', origin), {
  method: 'POST',
  redirect: 'manual',
  headers: {
    Origin: origin.origin,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ role: 'customer' }),
});
if (d1Bootstrap.status !== 303 && d1Bootstrap.status !== 500) {
  throw new Error(`Local D1 bootstrap was rejected (${d1Bootstrap.status}).`);
}

const migrations = await applyLocalD1Migrations(paths, process.cwd());
console.log(`Local D1 schema: ${migrations.applied} migration(s) applied; ${migrations.total} tracked.`);

const cookies = new Map();
for (const role of ['customer', 'buyer', 'rider', 'seller', 'admin', 'super_admin']) {
  const response = await fetch(new URL('/api/local-testing/session', origin), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Origin: origin.origin,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ role }),
  });
  if (response.status !== 303) {
    throw new Error(`Could not seed the fictional ${role} account (${response.status}).`);
  }
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error(`The fictional ${role} session cookie was not returned.`);
  cookies.set(role, cookie);
}

const featureForms = await runIdentityFormReadiness(process.cwd(), process.cwd(), process.env, '--apply');
console.log(`Required feature-managed forms: ${featureForms.created.length} initialized; ${featureForms.preserved.length} preserved.`);

const managedMaker = new FormData();
async function catalogRequest(path, body) {
  const response = await fetch(new URL(path, origin), { method: body ? 'POST' : 'GET',
    headers: { Origin: origin.origin, Cookie: cookies.get('super_admin'), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(`Fictional form setup failed (${response.status}): ${value.error ?? path}`);
  return value;
}
// Configure only missing editable forms through their real audited publication
// APIs. Existing publications and drafts are never replaced by fixture setup.
const listing = await catalogRequest('/api/admin/forms');
for (const row of listing.forms) {
  if (row.publishedVersion > 0 || row.editable === false) continue;
  if (row.draftVersion > 0) throw new Error(`Resolve the existing ${row.definition.id} form draft before local seeding.`);
  const formId = row.definition.id;
  const reason = 'SIMULATED empty local form baseline';
  const path = `/api/admin/forms/${encodeURIComponent(formId)}`;
  const draft = await catalogRequest(`${path}/draft`, { requestId: randomUUID(), reason,
    expectedPublishedVersion: 0, config: { formId, fields: [] } });
  await catalogRequest(`${path}/publish`, { requestId: randomUUID(), reason, expectedPublishedVersion: 0,
    draftId: draft.draft.id, expectedDraftRevision: draft.draft.revision });
}
const onboardingStart=await fetch(new URL('/api/seller-applications/start',origin),{
  method:'POST',headers:{Origin:origin.origin,Cookie:cookies.get('customer')},
});
if(!onboardingStart.ok)throw new Error('Fictional seller onboarding could not start.');
const configurationResponse = await fetch(new URL('/api/forms/seller.application', origin), {
  headers: { Cookie: cookies.get('customer') },
});
if (!configurationResponse.ok) throw new Error(`The fictional application configuration is unavailable (${configurationResponse.status}).`);
const { config: configuration } = await configurationResponse.json();
if (!Number.isSafeInteger(configuration.version) || configuration.version < 1)
  throw new Error('The fictional application form version is invalid.');
managedMaker.set('requestId', 'local-staging-managed-maker-fixture');
managedMaker.set('formVersion', String(configuration.version));
for (const [name, value] of Object.entries({
  hasBusinessTaxRegistration: 'no',
  applicantType: 'individual',
  legalName: 'SIMULATED Maya Thapa',
  tradingName: 'Fictional Mithila Clay Studio',
  email: 'customer@local.hastabazaar.test',
  phone: '+9779800000011',
  province: 'Madhesh',
  district: 'Dhanusha',
  municipality: 'Janakpurdham',
  ward: '4',
  locality: 'SIMULATED private workshop address',
  publicCity: 'Janakpurdham',
  businessDescription: 'SIMULATED maker application for staging review only.',
  productCategories: 'Clay work',
  experienceCraft: 'Clay work',
  experienceBand: 'less_than_one_year',
  instagramUrl: 'https://instagram.com/hastabazaar',
  governmentIdType: 'citizenship',
  managedAgreementAccepted: 'yes',
  applicationAcknowledgement: 'yes',
})) managedMaker.set(name, value);

const termsResponse = await fetch(new URL('/api/seller-applications/managed-terms', origin), { headers: { Cookie: cookies.get('customer') } });
if (!termsResponse.ok) throw new Error('SIMULATED maker agreement terms are unavailable.');
const terms = await termsResponse.json();
managedMaker.set('managedAgreementVersion', terms.version);
managedMaker.set('managedAgreementContext', terms.context);
managedMaker.set('representativeIdentity', new File(['%PDF-1.4\nSIMULATED — NOT VALID FOR PRODUCTION'], 'SIMULATED-government-id.pdf', { type: 'application/pdf' }));

const applicationResponse = await fetch(new URL('/api/seller-applications', origin), {
  method: 'POST',
  headers: { Origin: origin.origin, Cookie: cookies.get('customer') },
  body: managedMaker,
});
const applicationBody = await applicationResponse.text();
const isExistingFixture = applicationResponse.status === 409
  && applicationBody.includes('An application already exists');
if (applicationResponse.status !== 201 && !isExistingFixture) {
  const failure = applicationBody;
  throw new Error(`Could not seed the Managed Maker application (${applicationResponse.status}): ${failure.slice(0, 200)}`);
}

console.log('Seeded or verified fictional local staging identities:');
console.log('- customer@local.hastabazaar.test — Managed Maker requester');
console.log('- buyer@local.hastabazaar.test — independent fictional buyer');
console.log('- rider@local.hastabazaar.test — approved fictional rider');
console.log('- seller@local.hastabazaar.test — Registered Seller fixture');
console.log('- admin@local.hastabazaar.test — operational reviewer fixture');
console.log('- superadmin@local.hastabazaar.test — Super Admin reviewer fixture');
console.log('All records are SIMULATED — NOT VALID FOR PRODUCTION.');
