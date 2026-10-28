import assert from 'node:assert/strict';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { hostedSessionHash } from '../lib/auth/hosted-session';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { inspectHostedSecurityReadiness } from '../lib/security/hosted-policy';
import {
  createHostedSessionForUser,
  getHostedIdentity,
  passwordRecord,
} from '../lib/auth/hosted-session';
const key = Buffer.alloc(32, 42).toString('base64url'),
  now = 1900000000000,
  session = 'a'.repeat(64);
async function fixture() {
  const f = securityDatabase();
  f.sqlite.exec(
    "INSERT INTO users VALUES('owner','owner','owner@example.test','Owner','active',0),('admin','admin','admin@example.test','Admin','active',0); INSERT INTO user_roles VALUES('owner','super_admin'),('admin','admin')",
  );
  const credential = await passwordRecord('fictional-password-only-test');
  for (const id of ['owner', 'admin'])
    f.sqlite
      .prepare('INSERT INTO user_credentials VALUES(?,?,?,1,?,?)')
      .run(id, credential.hash, credential.salt, now, now);
  const store = new SecurityStore(f.db, key);
  await store.initialize(['owner', 'admin'], now);
  const mfa = new MfaService(store),
    setup = await mfa.beginSetup({
      userId: 'owner',
      sessionHash: session,
      now,
    });
  const recovery = await mfa.confirmSetup({
    userId: 'owner',
    sessionHash: session,
    setupId: setup.setupId,
    code: totpAtCounter(setup.secret, Math.floor(now / 30000)),
    now,
  });
  await mfa.activateSetup({
    userId: 'owner',
    sessionHash: session,
    setupId: setup.setupId,
    recoverySaved: true,
    passwordVerifiedAt: now,
    now,
  });
  return { ...f, store, mfa, setup, recovery, credential };
}
void test('an unenrolled optional Admin does not block the enrolled Super Admin readiness', async () => {
  const f = await fixture();
  try {
    const readiness = await inspectHostedSecurityReadiness(
      {
        HASTABAZAAR_SECURITY_KEY: key,
        SECURITY_POLICY: {
          async read() {
            return true;
          },
          async mark() {},
        },
      },
      f.db,
    );
    assert.equal(readiness.ready, true);
    assert.equal(readiness.enrolled, 1);
    assert.equal(readiness.pending, 0);
    f.sqlite.exec(
      "DELETE FROM marketplace_settings WHERE key='auth-private:account:admin'",
    );
    assert.equal(
      (
        await inspectHostedSecurityReadiness(
          {
            HASTABAZAAR_SECURITY_KEY: key,
            SECURITY_POLICY: {
              async read() {
                return true;
              },
              async mark() {},
            },
          },
          f.db,
        )
      ).ready,
      false,
      'Missing registered optional account still fails closed',
    );
  } finally {
    f.dispose();
  }
});
void test('a newly promoted Admin can obtain only a raw password session until controlled security registration', async () => {
  const f = await fixture();
  try {
    f.sqlite.exec(
      "INSERT INTO users VALUES('new','new','new@example.test','New','active',0); INSERT INTO user_roles VALUES('new','admin')",
    );
    f.sqlite
      .prepare('INSERT INTO user_credentials VALUES(?,?,?,1,?,?)')
      .run('new', f.credential.hash, f.credential.salt, now, now);
    const token = await createHostedSessionForUser(f.db, 'new', now, {
      passwordHash: f.credential.hash,
      securityKey: key,
      initialized: true,
    });
    const headers = new Headers({ cookie: 'hastabazaar_session=' + token });
    assert.ok(
      f.sqlite
        .prepare('SELECT 1 FROM user_sessions WHERE token_hash=?')
        .get(hostedSessionHash(headers)),
    );
    await assert.rejects(
      getHostedIdentity(f.db, headers, now, {
        securityKey: key,
        initialized: true,
      }),
    );
    assert.equal(
      (await f.store.readManifest())!.value.userIds.includes('new'),
      false,
    );
  } finally {
    f.dispose();
  }
});
void test('optional Admin enrollment invalidates password-only access and promotion cannot reuse it', async () => {
  const f = await fixture();
  try {
    const token = await createHostedSessionForUser(f.db, 'admin', now, {
      passwordHash: f.credential.hash,
      securityKey: key,
      initialized: true,
    });
    const headers = new Headers({ cookie: 'hastabazaar_session=' + token });
    f.sqlite.exec(
      "UPDATE user_roles SET role='super_admin' WHERE user_id='admin'",
    );
    assert.equal(
      await getHostedIdentity(f.db, headers, now, {
        securityKey: key,
        initialized: true,
      }),
      null,
    );
    f.sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='admin'");
    const adminSession = 'b'.repeat(64);
    const setup = await f.mfa.beginSetup({
      userId: 'admin',
      sessionHash: adminSession,
      now,
    });
    await f.mfa.confirmSetup({
      userId: 'admin',
      sessionHash: adminSession,
      setupId: setup.setupId,
      code: totpAtCounter(setup.secret, Math.floor(now / 30000)),
      now,
    });
    await f.mfa.activateSetup({
      userId: 'admin',
      sessionHash: adminSession,
      setupId: setup.setupId,
      recoverySaved: true,
      passwordVerifiedAt: now,
      now,
    });
    assert.equal(
      await getHostedIdentity(f.db, headers, now, {
        securityKey: key,
        initialized: true,
      }),
      null,
    );
    const next = await createHostedSessionForUser(f.db, 'admin', now, {
      passwordHash: f.credential.hash,
      securityKey: key,
      initialized: true,
    });
    assert.equal(
      await getHostedIdentity(
        f.db,
        new Headers({ cookie: 'hastabazaar_session=' + next }),
        now,
        { securityKey: key, initialized: true },
      ),
      null,
    );
  } finally {
    f.dispose();
  }
});
void test('optional Admin password sign-in works, but a mailbox-only session is not a password proof', async () => {
  const f = await fixture();
  try {
    const token = await createHostedSessionForUser(f.db, 'admin', now, {
      passwordHash: f.credential.hash,
      securityKey: key,
      initialized: true,
    });
    const headers = new Headers({ cookie: 'hastabazaar_session=' + token });
    assert.ok(
      await getHostedIdentity(f.db, headers, now, {
        securityKey: key,
        initialized: true,
      }),
    );
    const unproven = await createHostedSessionForUser(f.db, 'admin', now);
    assert.equal(
      await getHostedIdentity(
        f.db,
        new Headers({ cookie: 'hastabazaar_session=' + unproven }),
        now,
        { securityKey: key, initialized: true },
      ),
      null,
    );
    const owner = await createHostedSessionForUser(f.db, 'owner', now, {
      passwordHash: f.credential.hash,
      securityKey: key,
      initialized: true,
    });
    assert.equal(
      await getHostedIdentity(
        f.db,
        new Headers({ cookie: 'hastabazaar_session=' + owner }),
        now,
        { securityKey: key, initialized: true },
      ),
      null,
    );
  } finally {
    f.dispose();
  }
});
void test('verified disabling preserves an explicit record, invalidates old factors and permits new password-only proof', async () => {
  const f = await fixture();
  try {
    const before = await f.store.readAccount('owner');
    await f.mfa.disable({
      userId: 'owner',
      sessionHash: session,
      passwordVerifiedAt: now + 30000,
      code: totpAtCounter(f.setup.secret, Math.floor(now / 30000) + 1),
      recovery: false,
      now: now + 30000,
    });
    const disabled = (await f.store.readAccount('owner'))!.value;
    assert.equal(disabled.status, 'disabled');
    assert.equal(disabled.generation, before!.value.generation + 1);
    assert.equal(disabled.factor, null);
    assert.equal(disabled.recovery, null);
    assert.equal(disabled.setup, null);
    await assert.rejects(
      f.mfa.verifyRecovery({
        userId: 'owner',
        sessionHash: session,
        passwordVerifiedAt: now + 30000,
        code: f.recovery.codes[0],
        now: now + 30000,
      }),
    );
    assert.equal(
      await f.mfa
        .hasFreshProof({
          userId: 'owner',
          sessionHash: session,
          now: now + 30000,
        })
        .catch(() => false),
      false,
    );
    const token = await createHostedSessionForUser(f.db, 'owner', now + 30000, {
      passwordHash: f.credential.hash,
      securityKey: key,
      initialized: true,
    });
    assert.ok(
      await getHostedIdentity(
        f.db,
        new Headers({ cookie: 'hastabazaar_session=' + token }),
        now + 30000,
        { securityKey: key, initialized: true },
      ),
    );
    assert.equal(
      (
        await inspectHostedSecurityReadiness(
          {
            HASTABAZAAR_SECURITY_KEY: key,
            SECURITY_POLICY: {
              async read() {
                return true;
              },
              async mark() {},
            },
          },
          f.db,
        )
      ).ready,
      true,
    );
  } finally {
    f.dispose();
  }
});
void test('disable requires a fresh factor and rolls back when linked authorization fails', async () => {
  const f = await fixture();
  try {
    const before = JSON.stringify(
      f.sqlite.prepare('SELECT * FROM marketplace_settings ORDER BY key').all(),
    );
    await assert.rejects(
      f.mfa.disable({
        userId: 'owner',
        sessionHash: session,
        passwordVerifiedAt: now,
        code: totpAtCounter(f.setup.secret, Math.floor(now / 30000)),
        recovery: false,
        now,
      }),
    );
    await assert.rejects(
      f.mfa.disable({
        userId: 'owner',
        sessionHash: session,
        passwordVerifiedAt: now - 301000,
        code: f.recovery.codes[0],
        recovery: true,
        now,
      }),
    );
    await assert.rejects(
      f.mfa.disable({
        userId: 'owner',
        sessionHash: session,
        passwordVerifiedAt: now,
        code: f.recovery.codes[0],
        recovery: true,
        now,
        linkedStatements: [
          f.db.prepare(
            "INSERT INTO operation_transaction_guards VALUES('forced',0)",
          ),
        ],
      }),
    );
    assert.equal(
      JSON.stringify(
        f.sqlite
          .prepare('SELECT * FROM marketplace_settings ORDER BY key')
          .all(),
      ),
      before,
    );
    await f.mfa.disable({
      userId: 'owner',
      sessionHash: session,
      passwordVerifiedAt: now,
      code: f.recovery.codes[0],
      recovery: true,
      now,
    });
    assert.equal(
      (await f.store.readAccount('owner'))!.value.status,
      'disabled',
    );
  } finally {
    f.dispose();
  }
});
