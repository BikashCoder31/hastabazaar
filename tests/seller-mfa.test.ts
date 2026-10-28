import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import {
  createHostedSessionForUser,
  getHostedIdentity,
  passwordRecord,
  hostedSessionHash,
} from '../lib/auth/hosted-session';
import { totpAtCounter } from '../lib/security/crypto';
import { MfaService } from '../lib/security/mfa';

const key = Buffer.alloc(32, 74).toString('base64url'),
  origin = 'https://seller-security.example.test';
const context = { db: null as D1Database | null, headers: new Headers() };
(
  globalThis as typeof globalThis & { sellerSecurityFixture: typeof context }
).sellerSecurityFixture = context;
registerHooks({
  resolve(specifier, parent, next) {
    const sources: Record<string, string> = {
      'cloudflare:workers': `export const env={get DB(){return globalThis.sellerSecurityFixture.db},HASTABAZAAR_SECURITY_KEY:'${key}',APP_ORIGIN:'${origin}',SECURITY_POLICY:{async read(){return true},async mark(){}},HASTABAZAAR_RUNTIME_ENV:'production'};`,
      'next/headers':
        'export async function headers(){return globalThis.sellerSecurityFixture.headers}',
      'next/navigation':
        'export function redirect(url){throw Error("redirect:"+url)}',
    };
    return sources[specifier]
      ? {
          url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]),
          shortCircuit: true,
        }
      : next(specifier, parent);
  },
});

async function fixture() {
  const f = securityDatabase();
  context.db = f.db;
  f.sqlite.exec(
    "INSERT INTO users VALUES('owner','owner','owner@example.test','Owner','active',0),('seller','seller','seller@example.test','Seller','active',0); INSERT INTO user_roles VALUES('owner','super_admin'),('seller','seller'); CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER)",
  );
  const password = 'Fictional seller secret password',
    credential = await passwordRecord(password);
  f.sqlite
    .prepare('INSERT INTO user_credentials VALUES(?,?,?,1,?,?)')
    .run('seller', credential.hash, credential.salt, Date.now(), Date.now());
  const store = new SecurityStore(f.db, key);
  await store.initialize(['owner']);
  const token = await createHostedSessionForUser(f.db, 'seller');
  let cookie = 'hastabazaar_session=' + token;
  const request = (data?: unknown) =>
    new Request(origin + '/api/security/status', {
      method: data ? 'POST' : 'GET',
      headers: { cookie, origin, 'content-type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  const accept = (response: Response) => {
    const next = response.headers.getSetCookie()[0];
    if (next) cookie = next.split(';')[0];
    context.headers = new Headers({ cookie });
  };
  const identity = () =>
    getHostedIdentity(f.db, new Headers({ cookie }), Date.now(), {
      securityKey: key,
      initialized: true,
    });
  return {
    ...f,
    store,
    password,
    credential,
    request,
    accept,
    identity,
    cookie: () => cookie,
  };
}

void test('seller can opt into MFA; email and password sessions require its factor, and verified self-disable restores optional access', async () => {
  const f = await fixture();
  try {
    const { securityStatus, handleSecurityAction } =
      await import('../lib/security/controller');
    assert.ok(await f.identity(), 'unenrolled seller retains email sign-in');
    const status = await securityStatus(f.request());
    assert.equal(status.status, 200);
    assert.equal(
      ((await status.json()) as { status: string }).status,
      'optional',
    );
    const setupResponse = await handleSecurityAction(
      f.request({ password: f.password }),
      'setup',
    );
    assert.equal(setupResponse.status, 200, await setupResponse.clone().text());
    f.accept(setupResponse);
    const setup = (await setupResponse.json()) as {
      setupId: string;
      manualKey: string;
    };
    assert.ok(
      await f.identity(),
      'unfinished optional enrollment does not lock seller out',
    );
    const confirmation = await handleSecurityAction(
      f.request({
        password: f.password,
        setupId: setup.setupId,
        code: totpAtCounter(setup.manualKey, Math.floor(Date.now() / 30000)),
      }),
      'confirm',
    );
    assert.equal(confirmation.status, 200);
    const codes = ((await confirmation.json()) as { recoveryCodes: string[] })
      .recoveryCodes;
    const activation = await handleSecurityAction(
      f.request({
        password: f.password,
        setupId: setup.setupId,
        acknowledge: true,
      }),
      'confirm',
    );
    assert.equal(activation.status, 200);
    f.accept(activation);
    assert.ok(await f.identity());
    for (const proof of [
      {},
      { passwordHash: f.credential.hash, securityKey: key, initialized: true },
    ]) {
      const token = await createHostedSessionForUser(
        f.db,
        'seller',
        Date.now(),
        proof,
      );
      f.accept(
        new Response(null, {
          headers: { 'Set-Cookie': 'hastabazaar_session=' + token },
        }),
      );
      assert.equal(
        await f.identity(),
        null,
        'new email/password session must complete MFA',
      );
      const auth = await import('../app/auth');
      assert.equal(await auth.getAuthenticatedUser(), null);
      await assert.rejects(
        () => auth.requireAuthenticatedUser('/seller'),
        /redirect:\/security/,
      );
    }
    const verify = await handleSecurityAction(
      f.request({ code: codes[0], recovery: true, returnTo: '/seller' }),
      'verify',
    );
    assert.equal(verify.status, 200, await verify.clone().text());
    f.accept(verify);
    assert.ok(await f.identity());
    const disable = await handleSecurityAction(
      f.request({
        password: f.password,
        code: codes[1],
        recovery: true,
        acknowledge: true,
      }),
      'disable',
    );
    assert.equal(disable.status, 200, await disable.clone().text());
    assert.equal(
      (await f.store.readAccount('seller'))!.value.status,
      'pending',
    );
    const token = await createHostedSessionForUser(f.db, 'seller');
    f.accept(
      new Response(null, {
        headers: { 'Set-Cookie': 'hastabazaar_session=' + token },
      }),
    );
    assert.ok(await f.identity());
    f.sqlite.exec("INSERT INTO user_roles VALUES('seller','super_admin')");
    assert.equal(
      await f.identity(),
      null,
      'a seller opt-out cannot disable Super Admin enrollment after promotion',
    );
  } finally {
    context.db = null;
    f.dispose();
  }
});

void test('seller MFA cannot be bypassed with a local role identity or a missing enrolled record', async () => {
  const f = await fixture();
  try {
    await f.store.registerStaff('seller');
    const account = (await f.store.readAccount('seller'))!;
    await f.store.checkedBatch(
      f.store.accountCas(
        account,
        { ...account.value, status: 'recovery' },
        Date.now(),
      ),
    );
    f.sqlite.exec(
      "UPDATE users SET auth_subject='local-test-seller' WHERE id='seller'",
    );
    context.headers = new Headers({
      host: 'localhost:3018',
      cookie: 'hastabazaar_local_test_role=seller',
    });
    const auth = await import('../app/auth');
    assert.equal(await auth.getAuthenticatedUser(), null);
    f.sqlite.exec(
      "DELETE FROM marketplace_settings WHERE key='auth-private:account:seller'",
    );
    await assert.rejects(() => f.identity(), /security state is unavailable/i);
    assert.equal(await auth.getAuthenticatedUser(), null);
  } finally {
    context.db = null;
    f.dispose();
  }
});

void test('seller recovery-required state blocks normal access and cannot be downgraded with password verification', async () => {
  const f = await fixture();
  try {
    await f.store.registerStaff('seller');
    const account = (await f.store.readAccount('seller'))!;
    await f.store.checkedBatch(
      f.store.accountCas(
        account,
        {
          ...account.value,
          status: 'recovery',
          generation: account.value.generation + 1,
        },
        Date.now(),
      ),
    );
    assert.equal(await f.identity(), null);
    const { securityStatus, handleSecurityAction } =
      await import('../lib/security/controller');
    const response = await securityStatus(f.request());
    const status = (await response.json()) as {
      mfaRequired: boolean;
      status: string;
    };
    assert.equal(status.mfaRequired, true);
    assert.equal(status.status, 'recovery');
    assert.notEqual(
      (
        await handleSecurityAction(
          f.request({ password: f.password }),
          'verify',
        )
      ).status,
      200,
    );
    assert.equal(await f.identity(), null);
    const setup = await handleSecurityAction(
      f.request({ password: f.password }),
      'setup',
    );
    assert.equal(setup.status, 200);
    f.accept(setup);
    assert.equal(
      await f.identity(),
      null,
      'starting replacement still blocks access',
    );
    const { setupId, manualKey } = (await setup.json()) as {
      setupId: string;
      manualKey: string;
    };
    assert.equal(
      (
        await handleSecurityAction(
          f.request({
            password: f.password,
            setupId,
            code: totpAtCounter(manualKey, Math.floor(Date.now() / 30000)),
          }),
          'confirm',
        )
      ).status,
      200,
    );
    const activate = await handleSecurityAction(
      f.request({ password: f.password, setupId, acknowledge: true }),
      'confirm',
    );
    assert.equal(activate.status, 200);
    f.accept(activate);
    assert.ok(await f.identity());
    const proof = await f.store.readProof(
      hostedSessionHash(new Headers({ cookie: f.cookie() }))!,
      'seller',
    );
    assert.ok(proof);
  } finally {
    context.db = null;
    f.dispose();
  }
});

void test('foreground seller activity refreshes enrolled MFA idle time while unattended requests do not', async () => {
  const f = await fixture();
  try {
    const { securityActivity } = await import('../lib/security/controller');
    assert.equal(
      (await securityActivity(f.request({}))).status,
      200,
      'optional unenrolled seller activity remains valid',
    );
    const now = Date.now() - 25 * 60000,
      hash = hostedSessionHash(new Headers({ cookie: f.cookie() }))!;
    await f.store.registerStaff('seller', now);
    const mfa = new MfaService(f.store),
      setup = await mfa.beginSetup({
        userId: 'seller',
        sessionHash: hash,
        now,
      });
    await mfa.confirmSetup({
      userId: 'seller',
      sessionHash: hash,
      setupId: setup.setupId,
      code: totpAtCounter(setup.secret, Math.floor(now / 30000)),
      now,
    });
    await mfa.activateSetup({
      userId: 'seller',
      sessionHash: hash,
      setupId: setup.setupId,
      recoverySaved: true,
      passwordVerifiedAt: now,
      now,
    });
    f.sqlite
      .prepare(
        'UPDATE user_sessions SET created_at=?,last_seen_at=? WHERE token_hash=?',
      )
      .run(now, now, hash);
    assert.equal((await securityActivity(f.request({}))).status, 200);
    const proof = (await f.store.readProof(hash, 'seller'))!;
    assert.ok(proof.value.lastActivityAt > now + 20 * 60000);
    const headers = new Headers({ cookie: f.cookie() });
    assert.ok(
      await getHostedIdentity(
        f.db,
        headers,
        proof.value.lastActivityAt + 20 * 60000,
        { securityKey: key, initialized: true, activity: false },
      ),
    );
    assert.equal(
      await getHostedIdentity(
        f.db,
        headers,
        proof.value.lastActivityAt + 30 * 60000,
        { securityKey: key, initialized: true, activity: false },
      ),
      null,
    );
  } finally {
    context.db = null;
    f.dispose();
  }
});
