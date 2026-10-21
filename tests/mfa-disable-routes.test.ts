import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { passwordRecord, getHostedIdentity } from '../lib/auth/hosted-session';
const key = Buffer.alloc(32, 54).toString('base64url'),
  origin = 'https://mfa-fixture.example.test';
const context = { db: null as D1Database | null };
(
  globalThis as typeof globalThis & { mfaDisableFixture: typeof context }
).mfaDisableFixture = context;
registerHooks({
  resolve(s, p, next) {
    if (s === 'cloudflare:workers')
      return {
        url:
          'data:text/javascript,' +
          encodeURIComponent(
            `export const env={get DB(){return globalThis.mfaDisableFixture.db},HASTABAZAAR_SECURITY_KEY:'${key}',HASTABAZAAR_RUNTIME_ENV:'production',APP_ORIGIN:'${origin}',SECURITY_POLICY:{async read(){return true},async mark(){}}}`,
          ),
        shortCircuit: true,
      };
    return next(s, p);
  },
});
async function fixture() {
  const f = securityDatabase();
  context.db = f.db;
  f.sqlite.exec(
    "INSERT INTO users VALUES('owner','owner','owner@example.test','Owner','active',0),('admin','admin','admin@example.test','Admin','active',0); INSERT INTO user_roles VALUES('owner','super_admin'),('admin','admin'); CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER)",
  );
  const password = 'fictional-disable-password',
    credential = await passwordRecord(password),
    now = Date.now() - 60000;
  for (const id of ['owner', 'admin']) {
    f.sqlite
      .prepare('INSERT INTO user_credentials VALUES(?,?,?,1,?,?)')
      .run(id, credential.hash, credential.salt, now, now);
    f.sqlite.prepare('INSERT INTO user_sessions VALUES(?,?,?,?,?)').run(
      createHash('sha256')
        .update(id + '-token')
        .digest('hex'),
      id,
      now + 3600000,
      now,
      now,
    );
  }
  const store = new SecurityStore(f.db, key);
  await store.initialize(['owner', 'admin'], now);
  const mfa = new MfaService(store),
    hash = createHash('sha256').update('owner-token').digest('hex'),
    setup = await mfa.beginSetup({ userId: 'owner', sessionHash: hash, now });
  const recovery = await mfa.confirmSetup({
    userId: 'owner',
    sessionHash: hash,
    setupId: setup.setupId,
    code: totpAtCounter(setup.secret, Math.floor(now / 30000)),
    now,
  });
  await mfa.activateSetup({
    userId: 'owner',
    sessionHash: hash,
    setupId: setup.setupId,
    recoverySaved: true,
    passwordVerifiedAt: now,
    now,
  });
  const request = (data: unknown, actor = 'owner', requestOrigin = origin) =>
    new Request(origin + '/api/security/disable', {
      method: 'POST',
      headers: {
        origin: requestOrigin,
        'content-type': 'application/json',
        cookie: 'hastabazaar_session=' + actor + '-token',
      },
      body: JSON.stringify(data),
    });
  return { ...f, store, mfa, password, setup, recovery, request };
}
void test('disable route requires ownership password, a fresh factor and explicit confirmation; it revokes sessions and audits atomically', async () => {
  const f = await fixture();
  try {
    const { handleSecurityAction } = await import('../lib/security/controller');
    const call = (data: unknown, actor = 'owner', requestOrigin = origin) =>
      handleSecurityAction(f.request(data, actor, requestOrigin), 'disable');
    const data = {
      password: f.password,
      code: f.recovery.codes[0],
      recovery: true,
      acknowledge: true,
    };
    assert.equal((await call({ ...data, password: 'wrong' })).status, 422);
    assert.equal((await call({ ...data, code: '' })).status, 409);
    assert.equal((await call({ ...data, acknowledge: false })).status, 422);
    assert.equal(
      (await call(data, 'owner', 'https://other.example.test')).status,
      403,
    );
    assert.equal(
      (await call({ ...data, userId: 'owner' }, 'admin')).status,
      403,
    );
    assert.equal((await f.store.readAccount('owner'))!.value.status, 'active');
    const response = await call({ ...data, userId: 'admin' });
    assert.equal(response.status, 200);
    assert.equal(
      (await f.store.readAccount('owner'))!.value.status,
      'disabled',
    );
    assert.equal((await f.store.readAccount('admin'))!.value.status, 'pending');
    assert.equal(
      f.sqlite
        .prepare("SELECT COUNT(*) n FROM user_sessions WHERE user_id='owner'")
        .get()!.n,
      0,
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT COUNT(*) n FROM user_sessions WHERE user_id='admin'")
        .get()!.n,
      1,
    );
    const audit = f.sqlite.prepare('SELECT * FROM audit_logs').all();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, 'security.mfa.disabled');
    assert.equal(audit[0].actor_id, 'owner');
    assert.ok(!JSON.stringify(audit).includes(f.password));
    assert.ok(!JSON.stringify(audit).includes(f.recovery.codes[0]));
    assert.equal((await call(data)).status, 401);
    assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/i);
  } finally {
    context.db = null;
    f.dispose();
  }
});
void test('a failed audit leaves MFA and existing sessions intact', async () => {
  const f = await fixture();
  try {
    const { handleSecurityAction } = await import('../lib/security/controller');
    const before = JSON.stringify(
      f.sqlite.prepare('SELECT * FROM marketplace_settings ORDER BY key').all(),
    );
    f.sqlite.exec('DROP TABLE audit_logs');
    const result = await handleSecurityAction(
      f.request({
        password: f.password,
        code: f.recovery.codes[0],
        recovery: true,
        acknowledge: true,
      }),
      'disable',
    );
    assert.equal(result.status, 503);
    assert.equal(
      JSON.stringify(
        f.sqlite
          .prepare('SELECT * FROM marketplace_settings ORDER BY key')
          .all(),
      ),
      before,
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT COUNT(*) n FROM user_sessions WHERE user_id='owner'")
        .get()!.n,
      1,
    );
  } finally {
    context.db = null;
    f.dispose();
  }
});
for (const actor of ['admin', 'owner'])
  void test(`optional ${actor} can verify a password-only session and defer MFA setup`, async () => {
    const f = await fixture();
    try {
      const { handleSecurityAction, securityStatus } =
        await import('../lib/security/controller');
      if (actor === 'owner')
        await f.mfa.disable({
          userId: 'owner',
          sessionHash: createHash('sha256').update('owner-token').digest('hex'),
          passwordVerifiedAt: Date.now(),
          code: f.recovery.codes[0],
          recovery: true,
        });
      const response = await handleSecurityAction(
        f.request({ password: f.password }, actor),
        'verify',
      );
      assert.equal(response.status, 200);
      const cookie = response.headers.getSetCookie()[0].split(';')[0];
      assert.ok(
        await getHostedIdentity(f.db, new Headers({ cookie }), Date.now(), {
          securityKey: key,
          initialized: true,
        }),
      );
      const status = await securityStatus(
        new Request(origin + '/api/security/status', { headers: { cookie } }),
      );
      const state = (await status.json()) as {
        mfaRequired: boolean;
        status: string;
      };
      assert.equal(state.mfaRequired, false);
      assert.equal(state.status, actor === 'admin' ? 'optional' : 'disabled');
      const setup = await handleSecurityAction(
        new Request(origin + '/api/security/setup', {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json', cookie },
          body: JSON.stringify({ password: f.password }),
        }),
        'setup',
      );
      assert.equal(setup.status, 200);
      const continuedCookie =
        setup.headers.getSetCookie()[0]?.split(';')[0] ?? cookie;
      assert.ok(
        await getHostedIdentity(
          f.db,
          new Headers({ cookie: continuedCookie }),
          Date.now(),
          { securityKey: key, initialized: true },
        ),
        'Starting optional setup must preserve password-proven access',
      );
      assert.ok(
        await getHostedIdentity(
          f.db,
          new Headers({ cookie: continuedCookie }),
          Date.now() + 11 * 60_000,
          { securityKey: key, initialized: true },
        ),
        'An expired setup must not expire the password session',
      );
      const pending = await securityStatus(
        new Request(origin + '/api/security/status', {
          headers: { cookie: continuedCookie },
        }),
      );
      assert.equal(
        ((await pending.json()) as { mfaRequired: boolean }).mfaRequired,
        false,
      );
    } finally {
      context.db = null;
      f.dispose();
    }
  });
