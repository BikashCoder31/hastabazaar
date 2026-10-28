import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { ADMIN_ABSOLUTE_MS } from '../lib/security/model';
import { createHostedSessionForUser, getHostedIdentity, passwordRecord, readHostedSession } from '../lib/auth/hosted-session';

/**
 * Runs only against securityDatabase(':memory:'). Authentication, session,
 * controller and staff guards are real. The three domain repositories below
 * are boundary counters, not financial/form/media integration fixtures.
 */
const context = {
  db: null as D1Database | null,
  key: '', initialized: false, headers: new Headers(),
  domain: { accounting: 0, answers: 0, media: 0 },
};
(globalThis as typeof globalThis & { securityNegativeContext: typeof context }).securityNegativeContext = context;
registerHooks({ resolve(specifier, parent, next) {
  const stubs: Record<string, string> = {
    'cloudflare:workers': `export const env={get DB(){return globalThis.securityNegativeContext.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.securityNegativeContext.key},SECURITY_POLICY:{async read(){return globalThis.securityNegativeContext.initialized},async mark(){globalThis.securityNegativeContext.initialized=true}},HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'http://localhost:3018'};`,
    'next/headers': 'export async function headers(){return globalThis.securityNegativeContext.headers;}',
    'next/navigation': 'export function redirect(url){throw new Error("redirect:"+url);}',
    '@/lib/accounting/workspace': 'export async function getAccountingWorkspace(){globalThis.securityNegativeContext.domain.accounting++;return {fixtureBoundary:true};}',
    '@/lib/db/repositories/form-answers': 'export async function getFormAnswerById(){globalThis.securityNegativeContext.domain.answers++;return null;}',
    '@/lib/db/repositories/seller-applications': 'export async function getSellerProfileMediaForStaff(){globalThis.securityNegativeContext.domain.media++;return null;}',
  };
  return stubs[specifier] ? { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true } : next(specifier, parent);
} });

type Fixture = ReturnType<typeof securityDatabase>;
const origin = 'http://localhost:3018';
const ownerId = 'local-test-super-admin';
const ownerPassword = 'fixture-owner-password-2026';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

async function withFixture(work: (f: Fixture) => Promise<void>) {
  const f = securityDatabase();
  context.db = f.db; context.key = Buffer.from(randomBytes(32)).toString('base64url');
  context.initialized = false; context.headers = new Headers(); context.domain = { accounting: 0, answers: 0, media: 0 };
  try { await work(f); } finally { context.db = null; context.key = ''; context.headers = new Headers(); f.dispose(); }
}
async function seedStaff(f: Fixture, id = ownerId, role: 'admin' | 'super_admin' = 'super_admin', password?: string) {
  const now = Date.now();
  f.sqlite.prepare('INSERT INTO users(id,auth_subject,email,display_name,status,updated_at) VALUES (?,?,?,?,?,?)').run(id, id, `${id}@local.hastabazaar.test`, 'Fictional staff', 'active', now);
  f.sqlite.prepare('INSERT INTO user_roles(user_id,role) VALUES (?,?)').run(id, role);
  if (!password) return null;
  const credential = await passwordRecord(password);
  f.sqlite.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at) VALUES (?,?,?,7,?,?)').run(id, credential.hash, credential.salt, now, now);
  return credential;
}
function setCookie(cookie: string) { context.headers = new Headers({ host: 'localhost:3018', cookie }); }
function acceptCookies(response: Response) {
  let cookies = context.headers.get('cookie') ?? '';
  for (const raw of response.headers.getSetCookie()) {
    const next = raw.split(';')[0], name = next.split('=')[0];
    cookies = cookies.split(';').map(part => part.trim()).filter(part => part && !part.startsWith(name + '=')).concat(next).join('; ');
  }
  setCookie(cookies);
}
function mutation(path: string, body: unknown) {
  return new Request(origin + path, { method: 'POST', headers: { origin, host: 'localhost:3018', 'content-type': 'application/json', cookie: context.headers.get('cookie') ?? '' }, body: JSON.stringify(body) });
}
function accountRows(f: Fixture) {
  return JSON.stringify({ users: f.sqlite.prepare('SELECT * FROM users ORDER BY id').all(), roles: f.sqlite.prepare('SELECT * FROM user_roles ORDER BY user_id,role').all(), credentials: f.sqlite.prepare('SELECT * FROM user_credentials ORDER BY user_id').all(), sessions: f.sqlite.prepare('SELECT * FROM user_sessions ORDER BY token_hash').all() });
}
function beforeNextBatch(f: Fixture, work: () => void) {
  const batch = f.db.batch.bind(f.db); let called = false;
  f.db.batch = ((statements: D1PreparedStatement[]) => {
    if (!called) { called = true; work(); }
    return batch(statements);
  }) as D1Database['batch'];
  return () => called;
}
async function enroll(f: Fixture, userId: string, sessionHash: string, now = Date.now()) {
  const store = new SecurityStore(f.db, context.key);
  await store.initialize([userId], now);
  const service = new MfaService(store);
  const setup = await service.beginSetup({ userId, sessionHash, now });
  const confirmed = await service.confirmSetup({ userId, sessionHash, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(now / 30_000)), now });
  context.initialized = true;
  await service.activateSetup({ userId, sessionHash, setupId: setup.setupId, recoverySaved: true, passwordVerifiedAt: now, now });
  return { store, service, codes: confirmed.codes, secret: setup.secret };
}

void test('existing-password accounts reject both bootstrap actions without replacing credentials, sessions or roles', async () => {
  await withFixture(async f => {
    await seedStaff(f, ownerId, 'super_admin', ownerPassword);
    const token = await createHostedSessionForUser(f.db, ownerId);
    setCookie(`hastabazaar_session=${token}; hastabazaar_local_test_role=super_admin`);
    const before = accountRows(f);
    const { handleSecurityAction } = await import('../lib/security/controller');
    for (const action of ['request', 'complete']) {
      const response = await handleSecurityAction(mutation('/api/security/bootstrap', { action, code: '123456', password: 'replacement-password-2026', confirmation: 'replacement-password-2026' }), 'bootstrap');
      assert.equal(response.status, 409); assert.equal(response.headers.get('set-cookie'), null);
      assert.match((await response.json() as { error: string }).error, /already has a password/i);
      assert.equal(accountRows(f), before);
      assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM marketplace_settings').get()!.n, 0);
    }
  });
});

void test('a credential inserted after bootstrap checks aborts the complete transaction and preserves the unconsumed challenge', async () => {
  await withFixture(async f => {
    await seedStaff(f); setCookie('hastabazaar_local_test_role=super_admin');
    const { handleSecurityAction } = await import('../lib/security/controller');
    const requested = await handleSecurityAction(mutation('/api/security/bootstrap', { action: 'request' }), 'bootstrap');
    assert.equal(requested.status, 200); acceptCookies(requested);
    const captured = await requested.json() as { code: string };
    const store = new SecurityStore(f.db, context.key);
    const bootstrapKey = `auth-private:bootstrap:${ownerId}`;
    const before = f.sqlite.prepare('SELECT value FROM marketplace_settings WHERE `key`=?').get(bootstrapKey)!.value;
    const roles = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all());
    const raced = beforeNextBatch(f, () => f.sqlite.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at) VALUES (?,?,?,11,1,1)').run(ownerId, 'racing-existing-hash', 'racing-existing-salt'));
    const response = await handleSecurityAction(mutation('/api/security/bootstrap', { action: 'complete', code: captured.code, password: ownerPassword, confirmation: ownerPassword }), 'bootstrap');
    assert.notEqual(response.status, 200); assert.equal(raced(), true);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual({ ...f.sqlite.prepare('SELECT password_hash,password_salt,password_version FROM user_credentials WHERE user_id=?').get(ownerId) }, { password_hash: 'racing-existing-hash', password_salt: 'racing-existing-salt', password_version: 11 });
    assert.equal(f.sqlite.prepare('SELECT value FROM marketplace_settings WHERE `key`=?').get(bootstrapKey)!.value, before);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM user_sessions').get()!.n, 0);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all()), roles);
    assert.equal((await store.readAccount(ownerId))!.value.status, 'pending');
  });
});

void test('a credential inserted while a bootstrap request commits prevents even a challenge or cookie being issued', async () => {
  await withFixture(async f => {
    await seedStaff(f); setCookie('hastabazaar_local_test_role=super_admin');
    const store = new SecurityStore(f.db, context.key); await store.initialize([ownerId]);
    const raced = beforeNextBatch(f, () => f.sqlite.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at) VALUES (?,?,?,4,1,1)').run(ownerId, 'racing-existing-hash', 'racing-existing-salt'));
    const { handleSecurityAction } = await import('../lib/security/controller');
    const response = await handleSecurityAction(mutation('/api/security/bootstrap', { action: 'request' }), 'bootstrap');
    assert.notEqual(response.status, 200); assert.equal(raced(), true); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM marketplace_settings WHERE `key` LIKE ?').get('auth-private:bootstrap:%')!.n, 0);
    assert.equal(f.sqlite.prepare('SELECT password_version FROM user_credentials WHERE user_id=?').get(ownerId)!.password_version, 4);
  });
});

void test('changing a saved credential between fresh-password verification and setup commit rolls back setup and rotation', async () => {
  await withFixture(async f => {
    await seedStaff(f, ownerId, 'super_admin', ownerPassword);
    const token = await createHostedSessionForUser(f.db, ownerId);
    setCookie(`hastabazaar_session=${token}`);
    const store = new SecurityStore(f.db, context.key); await store.initialize([ownerId]);
    const account = (await store.readAccount(ownerId))!.raw;
    const sessions = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_sessions').all());
    const roles = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all());
    const raced = beforeNextBatch(f, () => f.sqlite.prepare('UPDATE user_credentials SET password_hash=?,password_salt=?,password_version=12 WHERE user_id=?').run('newer-existing-hash', 'newer-existing-salt', ownerId));
    const { handleSecurityAction } = await import('../lib/security/controller');
    const response = await handleSecurityAction(mutation('/api/security/setup', { password: ownerPassword }), 'setup');
    assert.notEqual(response.status, 200); assert.equal(raced(), true); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await store.readAccount(ownerId))!.raw, account);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_sessions').all()), sessions);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all()), roles);
    assert.deepEqual({ ...f.sqlite.prepare('SELECT password_hash,password_salt,password_version FROM user_credentials WHERE user_id=?').get(ownerId) }, { password_hash: 'newer-existing-hash', password_salt: 'newer-existing-salt', password_version: 12 });
  });
});

void test('a post-rollout Admin can reach setup status and register with their password but gains no pending privileged identity', async () => {
  await withFixture(async f => {
    await seedStaff(f, 'legacy-owner');
    const store = new SecurityStore(f.db, context.key); await store.initialize(['legacy-owner']);
    const newId = 'new-admin-account'; await seedStaff(f, newId, 'admin', ownerPassword);
    const token = await createHostedSessionForUser(f.db, newId); setCookie(`hastabazaar_session=${token}`);
    const { securityStatus, handleSecurityAction } = await import('../lib/security/controller');
    const { getAuthenticatedUser } = await import('../app/auth');
    const roles = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles ORDER BY user_id,role').all());
    const status = await securityStatus(new Request(origin + '/api/security/status', { headers: context.headers }));
    assert.equal(status.status, 200); assert.equal((await status.json() as { registrationRequired: boolean }).registrationRequired, true);
    assert.equal(await getAuthenticatedUser(), null);
    const setup = await handleSecurityAction(mutation('/api/security/setup', { password: ownerPassword }), 'setup');
    assert.equal(setup.status, 200); acceptCookies(setup);
    assert.equal((await store.readAccount(newId))!.value.status, 'pending');
    const manifest = (await store.readManifest())!.value;
    assert.equal(manifest.userIds.includes(newId), true); assert.equal(manifest.legacyUserIds.includes(newId), false);
    assert.equal(await getAuthenticatedUser(), null, 'Pending post-rollout staff must not inherit the legacy setup grace');
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles ORDER BY user_id,role').all()), roles);
  });
});

for (const role of ['super_admin', 'admin'] as const) {
  void test(`${role} plain, mailbox and password sessions are restricted without MFA and capped at eight hours`, async () => {
    await withFixture(async f => {
      const id = role === 'super_admin' ? ownerId : 'local-test-admin';
      const credential = (await seedStaff(f, id, role, ownerPassword))!;
      const now = Date.now(); const original = await createHostedSessionForUser(f.db, id, now);
      const { store } = await enroll(f, id, hash(original), now);
      const credentials = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_credentials').all());
      for (const proof of [{}, { mailbox: true }, { passwordHash: credential.hash }]) {
        const token = await createHostedSessionForUser(f.db, id, now + 1, proof);
        const headers = new Headers({ cookie: `hastabazaar_session=${token}` });
        const row = await readHostedSession(f.db, headers, now + 1);
        assert.ok(row); assert.equal(row.expiresAt - row.createdAt, ADMIN_ABSOLUTE_MS);
        assert.equal(await store.readProof(hash(token), id), null);
        assert.equal(await getHostedIdentity(f.db, headers, now + 1, { securityKey: context.key, initialized: true, activity: false }), null);
      }
      assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_credentials').all()), credentials);
      f.sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('customer-only', 'customer-only', 'customer@local.hastabazaar.test', 'Fictional customer', 'active', now);
      f.sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run('customer-only', 'customer');
      const customerToken = await createHostedSessionForUser(f.db, 'customer-only', now);
      const customerHeaders = new Headers({ cookie: `hastabazaar_session=${customerToken}` });
      assert.equal((await readHostedSession(f.db, customerHeaders, now))!.expiresAt - now, 30 * 24 * 3_600_000);
      assert.equal((await getHostedIdentity(f.db, customerHeaders, now, { securityKey: context.key, initialized: true }))?.userId, 'customer-only');
    });
  });
}

void test('actual email-contact session rotation retains staff credentials but does not carry privileged MFA assurance', async () => {
  await withFixture(async f => {
    await seedStaff(f, ownerId, 'super_admin', ownerPassword);
    // Additional current contact tables exist only in this disposable fixture.
    f.sqlite.exec(`ALTER TABLE users ADD COLUMN phone TEXT;
      CREATE TABLE account_phone_verifications(user_id TEXT PRIMARY KEY,phone TEXT NOT NULL,verified_at INTEGER NOT NULL);
      CREATE TABLE account_contact_challenges(token_hash TEXT PRIMARY KEY,code_hash TEXT NOT NULL,user_id TEXT NOT NULL,auth_subject TEXT NOT NULL,channel TEXT NOT NULL,contact_value TEXT NOT NULL,contact_snapshot TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,delivered_at INTEGER,consumed_at INTEGER,UNIQUE(user_id,channel));
      CREATE TABLE local_contact_captures(token_hash TEXT PRIMARY KEY);`);
    f.sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run(ownerId, 'customer');
    const now = Date.now(); const token = await createHostedSessionForUser(f.db, ownerId, now);
    const { store } = await enroll(f, ownerId, hash(token), now);
    const credential = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_credentials').all());
    const account = (await store.readAccount(ownerId))!.raw;
    const roles = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all());
    const { requestContactVerification, verifyContactVerification } = await import('../lib/auth/contact-verification');
    const actor = { userId: ownerId, authSubject: ownerId, sessionHash: hash(token) };
    let capturedCode = '';
    const requested = await requestContactVerification(f.db, actor, 'email', async message => { capturedCode = message.code; }, now + 1);
    assert.ok(requested.token); assert.match(capturedCode, /^\d{6}$/);
    const rotated = await verifyContactVerification(f.db, actor, 'email', requested.token, capturedCode, now + 2);
    assert.ok(rotated.sessionToken);
    const headers = new Headers({ cookie: `hastabazaar_session=${rotated.sessionToken}` });
    assert.equal(await readHostedSession(f.db, new Headers({ cookie: `hastabazaar_session=${token}` }), now + 2), null);
    assert.equal((await readHostedSession(f.db, headers, now + 2))!.expiresAt - (now + 2), ADMIN_ABSOLUTE_MS);
    assert.equal(await store.readProof(hash(rotated.sessionToken), ownerId), null);
    assert.equal(await getHostedIdentity(f.db, headers, now + 2, { securityKey: context.key, initialized: true, activity: false }), null);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_credentials').all()), credential);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all()), roles);
    assert.equal((await store.readAccount(ownerId))!.raw, account);
  });
});

void test('actual private guards preserve legacy setup access, then reject missing MFA before any isolated domain reads', async () => {
  await withFixture(async f => {
    await seedStaff(f, ownerId, 'super_admin', ownerPassword);
    const now = Date.now(); const token = await createHostedSessionForUser(f.db, ownerId, now);
    await new SecurityStore(f.db, context.key).initialize([ownerId], now);
    setCookie(`hastabazaar_session=${token}`);
    const { GET: accounting } = await import('../app/api/admin/accounting/route');
    const { GET: answers } = await import('../app/api/forms/answers/[id]/route');
    const { GET: media } = await import('../app/api/admin/seller-profile-media/[id]/route');
    const run = async () => [
      await accounting(new Request(origin + '/api/admin/accounting', { headers: context.headers })),
      await answers(new Request(origin + '/api/forms/answers/fictional-answer', { headers: context.headers }), { params: Promise.resolve({ id: 'fictional-answer' }) }),
      await media(new Request(origin + '/api/admin/seller-profile-media/fictional-media', { headers: context.headers }), { params: Promise.resolve({ id: 'fictional-media' }) }),
    ];
    // Existing rollout members retain access while setup is pending. This is
    // deliberately not described as MFA protection before owner activation.
    assert.deepEqual((await run()).map(response => response.status), [200, 404, 404]);
    assert.deepEqual(context.domain, { accounting: 1, answers: 1, media: 1 });
    context.domain = { accounting: 0, answers: 0, media: 0 };
    const { codes } = await enroll(f, ownerId, hash(token), now);
    const restrictedToken = await createHostedSessionForUser(f.db, ownerId, now + 1);
    setCookie(`hastabazaar_session=${restrictedToken}`);
    for (const response of await run()) assert.equal(response.status, 401);
    assert.deepEqual(context.domain, { accounting: 0, answers: 0, media: 0 });
    // A forged development role cookie is also unable to bypass these real guards.
    setCookie(`hastabazaar_session=${restrictedToken}; hastabazaar_local_test_role=super_admin`);
    for (const response of await run()) assert.equal(response.status, 401);
    assert.deepEqual(context.domain, { accounting: 0, answers: 0, media: 0 });
    const { handleSecurityAction } = await import('../lib/security/controller');
    const verified = await handleSecurityAction(mutation('/api/security/verify', { password: ownerPassword, recovery: true, code: codes[0] }), 'verify');
    assert.equal(verified.status, 200); acceptCookies(verified);
    // The domain stubs intentionally return no form/media record. The 404s prove
    // that real MFA/staff guards allowed the isolated repository boundary only.
    assert.deepEqual((await run()).map(response => response.status), [200, 404, 404]);
    assert.deepEqual(context.domain, { accounting: 1, answers: 1, media: 1 });
    f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id=?").run(ownerId);
    for (const response of await run()) assert.equal(response.status, 401);
    assert.deepEqual(context.domain, { accounting: 1, answers: 1, media: 1 });
  });
});
