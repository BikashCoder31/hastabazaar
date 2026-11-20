import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { createHostedSessionForUser, getHostedIdentity, passwordRecord } from '../lib/auth/hosted-session';

const origin = 'http://localhost:3018', userId = 'fictional-recovery-owner', password = 'fictional-recovery-password-2026';
const context = { db: null as D1Database | null, key: '', initialized: false, cookie: '', now: 0 };
(globalThis as typeof globalThis & { recoveryContinuationContext: typeof context }).recoveryContinuationContext = context;
registerHooks({ resolve(specifier, parent, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,' + encodeURIComponent(`export const env={get DB(){return globalThis.recoveryContinuationContext.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.recoveryContinuationContext.key},SECURITY_POLICY:{async read(){return globalThis.recoveryContinuationContext.initialized},async mark(){globalThis.recoveryContinuationContext.initialized=true}},HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'http://localhost:3018'};`), shortCircuit: true };
  return next(specifier, parent);
} });
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const originalNow = Date.now;

async function fixture(work: (value: { f: ReturnType<typeof securityDatabase>; store: SecurityStore; service: MfaService; lastCode: string; originalSecret: string; token: string; originalHash: string }) => Promise<void>) {
  const f = securityDatabase(); context.db = f.db; context.key = Buffer.from(randomBytes(32)).toString('base64url'); context.initialized = false;
  context.now = originalNow(); Date.now = () => context.now;
  try {
    f.sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(userId, userId, `${userId}@local.hastabazaar.test`, 'Fictional owner', 'active', context.now);
    f.sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run(userId, 'super_admin');
    const credential = await passwordRecord(password);
    f.sqlite.prepare('INSERT INTO user_credentials VALUES (?,?,?,3,?,?)').run(userId, credential.hash, credential.salt, context.now, context.now);
    const token = await createHostedSessionForUser(f.db, userId, context.now), originalHash = hash(token);
    context.cookie = `hastabazaar_session=${token}`;
    const store = new SecurityStore(f.db, context.key); await store.initialize([userId], context.now);
    const service = new MfaService(store), setup = await service.beginSetup({ userId, sessionHash: originalHash, now: context.now });
    const codes = await service.confirmSetup({ userId, sessionHash: originalHash, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(context.now / 30_000)), now: context.now });
    context.initialized = true;
    await service.activateSetup({ userId, sessionHash: originalHash, setupId: setup.setupId, recoverySaved: true, passwordVerifiedAt: context.now, now: context.now });
    for (const code of codes.codes.slice(0, 9)) await service.verifyRecovery({ userId, sessionHash: originalHash, passwordVerifiedAt: context.now, code, now: context.now });
    await work({ f, store, service, lastCode: codes.codes[9], originalSecret: setup.secret, token, originalHash });
  } finally { Date.now = originalNow; context.db = null; context.cookie = ''; f.dispose(); }
}
async function action(name: 'setup' | 'confirm' | 'verify' | 'recovery', body: Record<string, unknown>) {
  const { handleSecurityAction } = await import('../lib/security/controller');
  const response = await handleSecurityAction(new Request(`${origin}/api/security/${name}`, { method: 'POST', headers: { host: 'localhost:3018', origin, 'content-type': 'application/json', cookie: context.cookie }, body: JSON.stringify({ password, ...body }) }), name);
  for (const raw of response.headers.getSetCookie()) {
    const cookie = raw.split(';')[0], name = cookie.split('=')[0];
    context.cookie = context.cookie.split(';').map(value => value.trim()).filter(value => !value.startsWith(name + '=')).concat(cookie).join('; ');
  }
  return response;
}
async function verifyLast(f: ReturnType<typeof securityDatabase>, code: string) {
  const raw = await createHostedSessionForUser(f.db, userId, context.now);
  context.cookie = `hastabazaar_session=${raw}`;
  assert.equal((await action('verify', { recovery: true, code })).status, 200);
}

void test('after verifying the last recovery code, fresh password plus that MFA session can generate a new recovery set', async () => {
  await fixture(async ({ f, store, lastCode }) => {
    const credentials = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_credentials').all());
    const roles = JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all());
    await verifyLast(f, lastCode);
    assert.equal((await store.readAccount(userId))!.value.recovery!.hashes.length, 0);
    const {securityStatus}=await import('../lib/security/controller');
    const status=await securityStatus(new Request(`${origin}/api/security/status`,{headers:{cookie:context.cookie}}));
    assert.equal((await status.json() as {sessionVerified:boolean}).sessionVerified,true,'The real status response must enable password-only recovery in the UI');
    const renewed = await action('recovery', {});
    assert.equal(renewed.status, 200);
    const result = await renewed.json() as { recoveryCodes: string[] };
    assert.equal(result.recoveryCodes.length, 10);
    assert.equal((await store.readAccount(userId))!.value.recovery!.hashes.length, 10);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_credentials').all()), credentials);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM user_roles').all()), roles);
  });
});

void test('last-code sign-in can start authenticator replacement without a second code and finish after six minutes', async () => {
  await fixture(async ({ f, store, lastCode, originalSecret }) => {
    await verifyLast(f, lastCode);
    const started = await action('setup', {});
    assert.equal(started.status, 200);
    const setup = await started.json() as { setupId: string; manualKey: string };
    context.now += 6 * 60_000;
    const confirmed = await action('confirm', { setupId: setup.setupId, code: totpAtCounter(setup.manualKey, Math.floor(context.now / 30_000)) });
    assert.equal(confirmed.status, 200); assert.equal((await confirmed.json() as { recoveryCodes: string[] }).recoveryCodes.length, 10);
    const active = await action('confirm', { setupId: setup.setupId, acknowledge: true });
    assert.equal(active.status, 200);
    const account = (await store.readAccount(userId))!.value;
    assert.notEqual(account.factor!.secret, originalSecret); assert.equal(account.recovery!.hashes.length, 10); assert.equal(account.setup, null);
    assert.equal((await getHostedIdentity(f.db, new Headers({ cookie: context.cookie }), context.now, { securityKey: context.key, initialized: true, activity: false }))?.userId, userId);
  });
});

void test('a replacement that consumes the final code remains completable within its ten-minute ceremony', async () => {
  await fixture(async ({ f, store, lastCode, originalSecret }) => {
    const raw = await createHostedSessionForUser(f.db, userId, context.now); context.cookie = `hastabazaar_session=${raw}`;
    const started = await action('setup', { recovery: true, code: lastCode });
    assert.equal(started.status, 200);
    assert.equal((await store.readAccount(userId))!.value.recovery!.hashes.length, 0);
    const setup = await started.json() as { setupId: string; manualKey: string };
    context.now += 6 * 60_000;
    assert.equal((await action('confirm', { setupId: setup.setupId, code: totpAtCounter(setup.manualKey, Math.floor(context.now / 30_000)) })).status, 200);
    assert.equal((await action('confirm', { setupId: setup.setupId, acknowledge: true })).status, 200);
    const account = (await store.readAccount(userId))!.value;
    assert.notEqual(account.factor!.secret, originalSecret); assert.equal(account.recovery!.hashes.length, 10);
  });
});

void test('an authorized replacement still expires at ten minutes and preserves the previous active factor', async () => {
  await fixture(async ({ f, store, lastCode, originalSecret }) => {
    const raw = await createHostedSessionForUser(f.db, userId, context.now); context.cookie = `hastabazaar_session=${raw}`;
    const started = await action('setup', { recovery: true, code: lastCode }); assert.equal(started.status, 200);
    const setup = await started.json() as { setupId: string; manualKey: string };
    const snapshot = (await store.readAccount(userId))!.raw;
    context.now += 10 * 60_000;
    assert.notEqual((await action('confirm', { setupId: setup.setupId, code: totpAtCounter(setup.manualKey, Math.floor(context.now / 30_000)) })).status, 200);
    assert.notEqual((await action('confirm', { setupId: setup.setupId, acknowledge: true })).status, 200);
    assert.equal((await store.readAccount(userId))!.raw, snapshot);
    assert.equal((await store.readAccount(userId))!.value.factor!.secret, originalSecret);
  });
});

void test('replacement continuation requires its original session and security generation', async () => {
  await fixture(async ({ store, service, originalHash }) => {
    const started = await service.beginSetup({ userId, sessionHash: originalHash, now: context.now });
    context.now += 6 * 60_000;
    await service.confirmSetup({ userId, sessionHash: originalHash, setupId: started.setupId, code: totpAtCounter(started.secret, Math.floor(context.now / 30_000)), now: context.now });
    await assert.rejects(service.activateSetup({ userId, sessionHash: 'b'.repeat(64), setupId: started.setupId, recoverySaved: true, passwordVerifiedAt: context.now, now: context.now }));
    const current = (await store.readAccount(userId))!;
    await store.checkedBatch(store.accountCas(current, { ...current.value, generation: current.value.generation + 1, updatedAt: context.now }, context.now));
    await assert.rejects(service.activateSetup({ userId, sessionHash: originalHash, setupId: started.setupId, recoverySaved: true, passwordVerifiedAt: context.now, now: context.now }));
  });
});

void test('the final-code repair allowance ends with the five-minute fresh-proof window', async () => {
  await fixture(async ({ f, store, lastCode }) => {
    await verifyLast(f, lastCode);
    const account = (await store.readAccount(userId))!.raw;
    context.now += 5 * 60_000 + 1;
    assert.notEqual((await action('recovery', {})).status, 200);
    assert.notEqual((await action('setup', {})).status, 200);
    assert.equal((await store.readAccount(userId))!.raw, account);
    assert.equal((await store.readAccount(userId))!.value.recovery!.hashes.length, 0);
  });
});

void test('revoking continuation assurance before activation commits rolls back factor replacement', async () => {
  await fixture(async ({ f, store, service, originalHash }) => {
    const setup = await service.beginSetup({ userId, sessionHash: originalHash, now: context.now });
    context.now += 6 * 60_000;
    await service.confirmSetup({ userId, sessionHash: originalHash, setupId: setup.setupId, code: totpAtCounter(setup.secret, Math.floor(context.now / 30_000)), now: context.now });
    const account = (await store.readAccount(userId))!.raw;
    const batch = f.db.batch.bind(f.db); let raced = false;
    f.db.batch = ((statements: D1PreparedStatement[]) => {
      if (!raced) { raced = true; f.sqlite.prepare('DELETE FROM marketplace_settings WHERE `key`=?').run(`auth-private:session:${originalHash}`); }
      return batch(statements);
    }) as D1Database['batch'];
    const target = 'c'.repeat(64);
    await assert.rejects(service.activateSetup({ userId, sessionHash: originalHash, targetSessionHash: target, setupId: setup.setupId, recoverySaved: true, passwordVerifiedAt: context.now, now: context.now }));
    assert.equal(raced, true);
    assert.equal((await store.readAccount(userId))!.raw, account);
    assert.equal(await store.readProof(target, userId), null);
  });
});
