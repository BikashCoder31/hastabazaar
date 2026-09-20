import {
  assertDisposableStagingContext,
  readAndVerifyStagingMarker,
  resolveDisposableStagingPaths,
} from './guards.mjs';
import { applyLocalD1Migrations } from './local-d1.mjs';

assertDisposableStagingContext(process.env);
const paths = resolveDisposableStagingPaths(process.cwd(), process.env);
await readAndVerifyStagingMarker(paths);

const origin = new URL(process.env.APP_ORIGIN);
const health = await fetch(new URL('/health/live', origin), { signal: AbortSignal.timeout(2_000) });
if (!health.ok) throw new Error(`Local staging health check failed (${health.status}).`);

const migrations = await applyLocalD1Migrations(paths, process.cwd());
console.log(`Local D1 schema: ${migrations.applied} migration(s) applied; ${migrations.total} tracked.`);

const cookies = new Map();
for (const role of ['customer', 'seller', 'admin', 'super_admin']) {
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

const managedMaker = new FormData();
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
  applicationAcknowledgement: 'yes',
})) managedMaker.set(name, value);

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
console.log('- seller@local.hastabazaar.test — Registered Seller fixture');
console.log('- admin@local.hastabazaar.test — operational reviewer fixture');
console.log('- superadmin@local.hastabazaar.test — Super Admin reviewer fixture');
console.log('All records are SIMULATED — NOT VALID FOR PRODUCTION.');
