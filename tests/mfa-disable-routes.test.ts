import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { isPortableTransientSetting } from '../lib/portability/transfer';
import {
  passwordRecord,
  getHostedIdentity,
  createHostedSessionForUser,
} from '../lib/auth/hosted-session';
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
for (const recoveryMode of [false, true])
  void test(`password login completes MFA without repeating password (${recoveryMode ? 'recovery' : 'authenticator'})`, async () => {
    const f = await fixture();
    try {
      const { handleSecurityAction, securityStatus } =
        await import('../lib/security/controller');
      const credential = f.sqlite
        .prepare(
          "SELECT password_hash FROM user_credentials WHERE user_id='owner'",
        )
        .get()!;
      const token = await createHostedSessionForUser(
        f.db,
        'owner',
        Date.now(),
        {
          passwordHash: String(credential.password_hash),
          securityKey: key,
          initialized: true,
        },
      );
      const cookie = 'hastabazaar_session=' + token;
      const pending = f.sqlite
        .prepare(
          "SELECT key FROM marketplace_settings WHERE key LIKE '%challenge%'",
        )
        .all();
      assert.equal(pending.length, 1);
      assert.ok(
        isPortableTransientSetting(String(pending[0].key)),
        'pending login must be excluded from backup and restore',
      );
      const request = (data: unknown) =>
        new Request(origin + '/api/security/verify', {
          method: 'POST',
          headers: { origin, cookie, 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
      assert.equal(
        await getHostedIdentity(f.db, new Headers({ cookie }), Date.now(), {
          securityKey: key,
          initialized: true,
        }),
        null,
        'password alone cannot grant access',
      );
      const status = await securityStatus(
        new Request(origin + '/api/security/status', { headers: { cookie } }),
      );
      assert.equal(
        ((await status.json()) as { passwordVerified: boolean })
          .passwordVerified,
        true,
      );
      assert.equal(
        (await handleSecurityAction(request({ code: 'wrong' }), 'verify'))
          .status,
        409,
      );
      assert.equal(
        (
          await handleSecurityAction(
            request({
              code: f.recovery.codes[0],
              recovery: true,
              acknowledge: true,
            }),
            'disable',
          )
        ).status,
        422,
        'login proof cannot disable MFA',
      );
      const response = await handleSecurityAction(
        request({
          code: recoveryMode
            ? f.recovery.codes[0]
            : totpAtCounter(f.setup.secret, Math.floor(Date.now() / 30000)),
          recovery: recoveryMode,
          returnTo: '/admin',
        }),
        'verify',
      );
      assert.equal(response.status, 200, await response.text());
      const nextCookie = response.headers.getSetCookie()[0].split(';')[0];
      assert.ok(
        await getHostedIdentity(
          f.db,
          new Headers({ cookie: nextCookie }),
          Date.now(),
          { securityKey: key, initialized: true },
        ),
      );
      assert.equal(
        (
          await handleSecurityAction(
            request({ code: f.recovery.codes[1], recovery: true }),
            'verify',
          )
        ).status,
        401,
        'old challenge session cannot be reused',
      );
    } finally {
      context.db = null;
      f.dispose();
    }
  });

for (const scenario of [
  'expired',
  'mailbox-only',
  'password-changed',
  'generation-changed',
  'revoked',
] as const)
  void test(`MFA does not reuse password proof when ${scenario}`, async () => {
    const f = await fixture();
    try {
      const { handleSecurityAction, securityStatus } =
        await import('../lib/security/controller');
      const credential = f.sqlite
        .prepare(
          "SELECT password_hash FROM user_credentials WHERE user_id='owner'",
        )
        .get()!;
      const token = await createHostedSessionForUser(
        f.db,
        'owner',
        Date.now() - (scenario === 'expired' ? 301000 : 0),
        scenario === 'mailbox-only'
          ? {}
          : {
              passwordHash: String(credential.password_hash),
              securityKey: key,
              initialized: true,
            },
      );
      const cookie = 'hastabazaar_session=' + token;
      if (scenario === 'password-changed')
        f.sqlite.exec(
          "UPDATE user_credentials SET password_hash='changed' WHERE user_id='owner'",
        );
      if (scenario === 'generation-changed') {
        const account = (await f.store.readAccount('owner'))!;
        await f.store.checkedBatch(
          f.store.accountCas(
            account,
            { ...account.value, generation: account.value.generation + 1 },
            Date.now(),
          ),
        );
      }
      if (scenario === 'revoked')
        f.sqlite
          .prepare('DELETE FROM user_sessions WHERE token_hash=?')
          .run(createHash('sha256').update(token).digest('hex'));
      const status = await securityStatus(
        new Request(origin + '/api/security/status', { headers: { cookie } }),
      );
      if (scenario !== 'revoked')
        assert.equal(
          ((await status.json()) as { passwordVerified: boolean })
            .passwordVerified,
          false,
        );
      const response = await handleSecurityAction(
        new Request(origin + '/api/security/verify', {
          method: 'POST',
          headers: { origin, cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ code: f.recovery.codes[0], recovery: true }),
        }),
        'verify',
      );
      assert.ok([401, 422].includes(response.status));
      assert.equal(
        (await f.store.readAccount('owner'))!.value.recovery!.hashes.length,
        10,
      );
    } finally {
      context.db = null;
      f.dispose();
    }
  });
void test('a concurrent MFA disable cannot turn a pending login into password-only access', async () => {
  const f = await fixture();
  try {
    const { handleSecurityAction } = await import('../lib/security/controller');
    const credential = f.sqlite
      .prepare(
        "SELECT password_hash FROM user_credentials WHERE user_id='owner'",
      )
      .get()!;
    const token = await createHostedSessionForUser(f.db, 'owner', Date.now(), {
      passwordHash: String(credential.password_hash),
      securityKey: key,
      initialized: true,
    });
    const originalPrepare = f.db.prepare.bind(f.db);
    f.db.prepare = ((sql: string) => {
      const statement = originalPrepare(sql);
      if (sql.startsWith('SELECT c.password_hash AS hash')) {
        const first = statement.first.bind(statement);
        statement.first = (async () => {
          const result = await first();
          f.db.prepare = originalPrepare;
          await f.mfa.disable({
            userId: 'owner',
            sessionHash: createHash('sha256')
              .update('owner-token')
              .digest('hex'),
            passwordVerifiedAt: Date.now(),
            code: f.recovery.codes[0],
            recovery: true,
            linkedStatements: [
              originalPrepare(
                "DELETE FROM user_sessions WHERE user_id='owner'",
              ),
            ],
          });
          return result;
        }) as typeof statement.first;
      }
      return statement;
    }) as typeof f.db.prepare;
    const response = await handleSecurityAction(
      new Request(origin + '/api/security/verify', {
        method: 'POST',
        headers: {
          origin,
          cookie: 'hastabazaar_session=' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: f.recovery.codes[1], recovery: true }),
      }),
      'verify',
    );
    assert.equal(response.status, 401);
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM user_sessions WHERE user_id='owner'",
        )
        .get()!.n,
      0,
    );
  } finally {
    context.db = null;
    f.dispose();
  }
});

void test('security status does not offer code-free management after the original password proof expires', async () => {
  const f = await fixture();
  try {
    const { securityStatus } = await import('../lib/security/controller');
    const proof = (await f.store.readProof(
      createHash('sha256').update('owner-token').digest('hex'),
      'owner',
    ))!;
    const verifiedAt = Date.now() - 61000;
    await f.store.checkedBatch(
      f.store.proofUpsert(
        proof,
        {
          ...proof.value,
          passwordVerifiedAt: Date.now() - 301000,
          verifiedAt,
          absoluteExpiresAt: verifiedAt + 8 * 60 * 60000,
          lastActivityAt: Date.now(),
        },
        Date.now(),
      ),
    );
    const response = await securityStatus(
      new Request(origin + '/api/security/status', {
        headers: { cookie: 'hastabazaar_session=owner-token' },
      }),
    );
    const status = (await response.json()) as {
      status: string;
      sessionVerified: boolean;
    };
    assert.equal(status.sessionVerified, false);
    assert.equal(status.status, 'verify');
  } finally {
    context.db = null;
    f.dispose();
  }
});

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
