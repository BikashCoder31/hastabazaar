import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { readCommercialOutcome } from '../lib/admin/commercial-outcome';
import { hostedSessionCookieName } from '../lib/auth/hosted-session';
import { getCommonFeeState, getRegisteredFeeOffers, publishCommonFeePolicy } from '../lib/commission/coordinated-policy';
import { ACTOR_INTENT_HEADER } from '../lib/http/actor-intent';
import { totpAtCounter } from '../lib/security/crypto';
import { MfaService } from '../lib/security/mfa';
import { ADMIN_ABSOLUTE_MS, FRESH_PASSWORD_MS } from '../lib/security/model';
import { SecurityStore } from '../lib/security/store';
import { commissionDatabase } from './helpers/commission-database';

declare global {
  var initialFeeEnvironment: Record<string, unknown>;
  var initialFeeStaff: { id: string; role: 'super_admin' | 'admin' };
}

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers')
    return { url: 'data:text/javascript,export const env=new Proxy({},{get:(_,k)=>globalThis.initialFeeEnvironment[k]})', shortCircuit: true };
  if (specifier === '@/lib/auth/staff')
    return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{};export const requireStaffApi=async()=>globalThis.initialFeeStaff;', shortCircuit: true };
  return next(specifier, context);
} });

const origin = 'https://staging.hastabazaar.com';
const reason = 'Publish the first selling fee for the two covered routes.';
const timestamp = () => Date.now();
type Fixture = Awaited<ReturnType<typeof commissionDatabase>>;

async function hostedSession(f: Fixture, actor = 'owner', at = Date.now(), verified = true, site = origin) {
  const key = Buffer.from(randomBytes(32)).toString('base64url');
  globalThis.initialFeeEnvironment = {
    DB: f.database, APP_ORIGIN: site, HASTABAZAAR_RUNTIME_ENV: 'production', HASTABAZAAR_SECURITY_KEY: key,
    SECURITY_POLICY: { async read() { return true; }, async mark() { throw new Error('No security initialization allowed.'); } },
  };
  globalThis.initialFeeStaff = { id: actor, role: actor === 'owner' ? 'super_admin' : 'admin' };
  const store = new SecurityStore(f.database, key);
  await store.initialize([actor], at);
  const token = Buffer.from(randomBytes(32)).toString('base64url');
  const sessionHash = createHash('sha256').update(token).digest('hex');
  f.sqlite.exec(`CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)`);
  f.sqlite.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)')
    .run(sessionHash, actor, at + ADMIN_ABSOLUTE_MS, at, at);
  if (verified) {
    const mfa = new MfaService(store);
    const setup = await mfa.beginSetup({ userId: actor, sessionHash, now: at });
    await mfa.confirmSetup({ userId: actor, sessionHash, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(at / 30_000)), now: at });
    await mfa.activateSetup({ userId: actor, sessionHash, setupId: setup.setupId, recoverySaved: true, passwordVerifiedAt: at, now: at });
  }
  return { token, sessionHash, actor, site };
}

function request(session: Awaited<ReturnType<typeof hostedSession>>, expectedContext: string, overrides: Record<string, unknown> = {}, requestOrigin = session.site) {
  return new Request(session.site + '/api/admin/common-fee-policy', {
    method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json', Cookie: hostedSessionCookieName + '=' + session.token, [ACTOR_INTENT_HEADER]: session.actor },
    body: JSON.stringify({ action: 'initialize', requestId: 'first-hosted-fee', expectedContext, registeredBasisPoints: 1150, managedBasisPoints: 1150, reason, ...overrides }),
  });
}

void test('fresh hosted Super Admin publishes the entered pair once with a recoverable audit and no seller consent', async () => {
  const f = await commissionDatabase();
  try {
    const session = await hostedSession(f);
    const { POST } = await import('../app/api/admin/common-fee-policy/route');
    const preview = await getCommonFeeState(f.database, timestamp());
    assert.equal(preview.initialPublicationAvailable, true);
    const response = await POST(request(session, preview.context));
    assert.equal(response.status, 201, await response.clone().text());
    const created = await response.json() as { id: string };

    const after = await getCommonFeeState(f.database, timestamp());
    assert.equal(after.initialPublicationAvailable, false);
    assert.equal(after.current.registered?.basisPoints, 1150);
    assert.equal(after.current.managed?.basisPoints, 1150);
    assert.equal(after.current.registered?.effectiveAt, after.current.managed?.effectiveAt);
    assert.deepEqual(after.issues, []);
    assert.equal((await getRegisteredFeeOffers(f.database, 'seller-a', timestamp())).current.accepted, false);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_agreement_acceptance_history').get()?.n, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_maker_application_details').get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM business_setting_versions WHERE setting_key='platform_service_fee_policy'").get()?.n, 0);
    const audit = f.sqlite.prepare("SELECT actor_id, reason, created_at FROM audit_logs WHERE action='commission.common.initialized'").get();
    assert.equal(audit?.actor_id, 'owner');
    assert.equal(audit?.reason, reason);
    assert.equal(audit?.created_at, after.current.registered?.effectiveAt);
    assert.equal((await readCommercialOutcome(f.database, { id: 'owner', authSubject: 'owner' }, 'common-fee', 'first-hosted-fee'))?.sourceId, created.id);

    const replay = await POST(request(session, preview.context));
    assert.equal(replay.status, 201);
    assert.deepEqual(await replay.json(), created);
    const second = await POST(request(session, after.context, { requestId: 'new-initial-attempt' }));
    assert.equal(second.status, 409);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='commission.common.initialized'").get()?.n, 1);
    await assert.rejects(publishCommonFeePolicy(f.database,
      { actorId: 'owner', requestId: 'too-soon-follow-up', expectedRevision: null, now: timestamp() },
      { expectedContext: after.context, basisPoints: 1300, effectiveAt: timestamp() + 1000, reason, replacesId: null }), /15 full elapsed days/);
    const laterStart = timestamp() + 16 * 86_400_000;
    await publishCommonFeePolicy(f.database,
      { actorId: 'owner', requestId: 'valid-follow-up', expectedRevision: null, now: timestamp() },
      { expectedContext: after.context, basisPoints: 1300, effectiveAt: laterStart, reason, replacesId: null });
    const scheduled = await getCommonFeeState(f.database, timestamp());
    assert.equal(scheduled.current.registered?.basisPoints, 1150);
    assert.equal(scheduled.upcoming?.effectiveAt, laterStart);
  } finally { await f.dispose(); }
});

for (const [key, status] of [
  ['independent_seller_commission_bps', 'published'],
  ['managed_sale_linked_platform_retention_bps', 'cancelled'],
] as const) {
  void test('first hosted publication is unavailable after any published rate, including ' + status, async () => {
    const f = await commissionDatabase({ seedSellers: false });
    try {
      const session = await hostedSession(f, 'owner', timestamp(), true, 'https://hastabazaar.com');
      const { POST } = await import('../app/api/admin/common-fee-policy/route');
      f.sqlite.prepare(`INSERT INTO business_setting_versions
        (id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,published_at,last_request_id)
        VALUES('existing-rate',?,1,'1150',?,1,'controlled',?,'Retained fictional publication','owner',1,1,'existing-rate')`)
        .run(key, status, timestamp() + 86_400_000);
      const state = await getCommonFeeState(f.database, timestamp());
      assert.equal(state.initialPublicationAvailable, false);
      const response = await POST(request(session, state.context));
      assert.equal(response.status, 409, await response.clone().text());
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM business_setting_versions').get()?.n, 1);
    } finally { await f.dispose(); }
  });
}

void test('hosted initialization rejects stale or missing two-step proof and a different role', async () => {
  const { POST } = await import('../app/api/admin/common-fee-policy/route');
  for (const [actor, age, verified] of [
    ['owner', FRESH_PASSWORD_MS + 1000, true],
    ['owner', 0, false],
    ['staff', 0, true],
  ] as const) {
    const f = await commissionDatabase({ seedSellers: false });
    try {
      const session = await hostedSession(f, actor, timestamp() - age, verified);
      const state = await getCommonFeeState(f.database, timestamp());
      const response = await POST(request(session, state.context));
      assert.equal(response.status, 403, await response.clone().text());
      if (actor === 'owner') assert.equal((await response.json() as { code: string }).code, 'MFA_REQUIRED');
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM business_setting_versions').get()?.n, 0);
    } finally { await f.dispose(); }
  }
});

void test('hosted initial publication requires both equal rates and a reason', async () => {
  const f = await commissionDatabase({ seedSellers: false });
  try {
    const session = await hostedSession(f);
    const { POST } = await import('../app/api/admin/common-fee-policy/route');
    const { context } = await getCommonFeeState(f.database, timestamp());
    for (const overrides of [{ registeredBasisPoints: undefined }, { managedBasisPoints: 1400 }, { reason: ' ' }]) {
      const response = await POST(request(session, context, overrides));
      assert.equal(response.status, 400, await response.clone().text());
    }
    assert.equal((await POST(request(session, context, {}, 'https://example.test'))).status, 403);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM business_setting_versions').get()?.n, 0);
  } finally { await f.dispose(); }
});

void test('hosted publication rechecks the session inside the atomic write', async () => {
  const f = await commissionDatabase({ seedSellers: false });
  try {
    const session = await hostedSession(f);
    const { POST } = await import('../app/api/admin/common-fee-policy/route');
    const { context } = await getCommonFeeState(f.database, timestamp());
    const batch = f.database.batch.bind(f.database);
    f.database.batch = async statements => {
      f.sqlite.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(session.sessionHash);
      return batch(statements);
    };
    const response = await POST(request(session, context));
    assert.equal(response.status, 409, await response.clone().text());
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM business_setting_versions').get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='commission.common.initialized'").get()?.n, 0);
  } finally { await f.dispose(); }
});
