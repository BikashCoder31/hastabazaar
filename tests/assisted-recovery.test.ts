import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { passwordRecord, verifyPassword } from '../lib/auth/hosted-session';
import { AssistedRecoveryService } from '../lib/security/assisted-recovery';

const now = 1_800_000_000_000,
  sessionHash = 'a'.repeat(64),
  password = 'fixture-current-password';
const documentation = {
  supportReference: 'SUP-123',
  reason: 'lost_password',
  verificationMethod: 'seller_onboarding',
  verificationReference: 'SELLER-123',
  ownershipVerified: true,
  confirmedEmail: 'target@local.hastabazaar.test',
} as const;
async function fixture(
  work: (
    f: ReturnType<typeof securityDatabase> & {
      store: SecurityStore;
      service: AssistedRecoveryService;
      mail: { token: string; email: string; kind: string }[];
    },
  ) => Promise<void>,
) {
  const f = securityDatabase();
  f.sqlite
    .exec(`CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER);
    CREATE TABLE password_reset_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT); CREATE TABLE email_login_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT); CREATE TABLE account_contact_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT); CREATE TABLE local_contact_captures(id TEXT PRIMARY KEY,user_id TEXT);
    INSERT INTO users VALUES('owner','owner','owner@local.hastabazaar.test','Owner','active',0),('target','target','target@local.hastabazaar.test','Target','active',0);
    INSERT INTO user_roles VALUES('owner','super_admin'),('target','seller');`);
  for (const table of [
    'password_reset_challenges',
    'email_login_challenges',
    'account_contact_challenges',
    'local_contact_captures',
  ])
    f.sqlite
      .prepare(`INSERT INTO ${table} VALUES (?,?)`)
      .run('target-existing-challenge', 'target');
  const credential = await passwordRecord(password);
  for (const id of ['owner', 'target'])
    f.sqlite
      .prepare('INSERT INTO user_credentials VALUES (?,?,?,1,?,?)')
      .run(id, credential.hash, credential.salt, now, now);
  f.sqlite
    .prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)')
    .run(sessionHash, 'owner', now + 28_800_000, now, now);
  f.sqlite
    .prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)')
    .run('b'.repeat(64), 'target', now + 28_800_000, now, now);
  const store = new SecurityStore(
    f.db,
    Buffer.from(randomBytes(32)).toString('base64url'),
  );
  await store.initialize(['owner', 'target'], now);
  for (const [userId, hash] of [
    ['owner', sessionHash],
    ['target', 'b'.repeat(64)],
  ]) {
    const mfa = new MfaService(store),
      setup = await mfa.beginSetup({ userId, sessionHash: hash, now });
    await mfa.confirmSetup({
      userId,
      sessionHash: hash,
      setupId: setup.setupId,
      code: totpAtCounter(setup.secret, Math.floor(now / 30000)),
      now,
    });
    await mfa.activateSetup({
      userId,
      sessionHash: hash,
      setupId: setup.setupId,
      recoverySaved: true,
      passwordVerifiedAt: now,
      now,
    });
  }
  const mail: { token: string; email: string; kind: string }[] = [];
  const service = new AssistedRecoveryService(store, {
    invite: async (message) => {
      mail.push(message);
    },
    notice: async () => {},
  });
  try {
    await work({ ...f, store, service, mail });
  } finally {
    f.dispose();
  }
}
const issue = (
  service: AssistedRecoveryService,
  kind: 'password' | 'mfa' = 'password',
) =>
  service.issue({
    actorId: 'owner',
    sessionHash,
    targetId: 'target',
    kind,
    ...documentation,
    reason: kind === 'mfa' ? 'lost_authenticator' : 'lost_password',
    now,
  });

void test('recipient chooses private password once; MFA persists and sessions/challenges are revoked', async () =>
  fixture(async (f) => {
    const before = (await f.store.readAccount('target'))!.value;
    await issue(f.service);
    assert.equal(f.mail.length, 1);
    assert.equal(f.mail[0].email, 'target@local.hastabazaar.test');
    assert.equal(
      f.sqlite
        .prepare('SELECT count(*) n FROM user_sessions WHERE user_id=?')
        .get('target')!.n,
      1,
    );
    await f.service.complete({
      token: f.mail[0].token,
      password: 'new-private-password',
      confirmation: 'new-private-password',
      now: now + 1,
    });
    const row = f.sqlite
      .prepare(
        'SELECT password_hash hash,password_salt salt FROM user_credentials WHERE user_id=?',
      )
      .get('target')!;
    assert.equal(
      await verifyPassword(
        'new-private-password',
        String(row.hash),
        String(row.salt),
      ),
      true,
    );
    const after = (await f.store.readAccount('target'))!.value;
    assert.equal(after.status, 'active');
    assert.deepEqual(after.factor, before.factor);
    assert.deepEqual(after.recovery, before.recovery);
    assert.equal(after.generation, before.generation + 1);
    for (const table of [
      'password_reset_challenges',
      'email_login_challenges',
      'account_contact_challenges',
      'local_contact_captures',
    ])
      assert.equal(
        f.sqlite
          .prepare(`SELECT count(*) n FROM ${table} WHERE user_id='target'`)
          .get()!.n,
        0,
      );
    assert.equal(await f.store.readProof('b'.repeat(64), 'target'), null);
    assert.equal(
      f.sqlite
        .prepare('SELECT count(*) n FROM user_sessions WHERE user_id=?')
        .get('target')!.n,
      0,
    );
    await assert.rejects(
      f.service.complete({
        token: f.mail[0].token,
        password: 'new-private-password',
        confirmation: 'new-private-password',
        now: now + 2,
      }),
    );
    const audit = JSON.stringify(
      f.sqlite.prepare('SELECT * FROM audit_logs').all(),
    );
    assert.ok(!audit.includes(f.mail[0].token));
    assert.ok(!audit.includes('new-private-password'));
  }));
void test('lost MFA requires current password then enters mandatory replacement state', async () =>
  fixture(async (f) => {
    await issue(f.service, 'mfa');
    await assert.rejects(
      f.service.complete({
        token: f.mail[0].token,
        password: 'wrong',
        now: now + 1,
      }),
    );
    assert.equal((await f.store.readAccount('target'))!.value.status, 'active');
    await f.service.complete({
      token: f.mail[0].token,
      password,
      now: now + 2,
    });
    const after = (await f.store.readAccount('target'))!.value;
    assert.equal(after.status, 'recovery');
    assert.equal(after.factor, null);
    assert.equal(after.recovery, null);
    assert.equal(after.setup, null);
  }));
for (const mutation of [
  "UPDATE users SET email='changed@example.test' WHERE id='target'",
  "UPDATE users SET status='suspended' WHERE id='target'",
  "INSERT INTO user_roles VALUES('target','super_admin')",
  "DELETE FROM user_roles WHERE user_id='target'",
  "UPDATE user_credentials SET password_version=2 WHERE user_id='target'",
  "DELETE FROM user_sessions WHERE user_id='owner'",
  "DELETE FROM user_roles WHERE user_id='owner'",
]) {
  void test(`changed ownership/approval rejects completion: ${mutation}`, async () =>
    fixture(async (f) => {
      await issue(f.service);
      f.sqlite.exec(mutation);
      const before = (await f.store.readAccount('target'))!.raw;
      await assert.rejects(
        f.service.complete({
          token: f.mail[0].token,
          password: 'new-private-password',
          confirmation: 'new-private-password',
          now: now + 1,
        }),
      );
      assert.equal((await f.store.readAccount('target'))!.raw, before);
    }));
}
void test('ordinary Admin, self and dual-role Super Admin targets cannot receive approval', async () =>
  fixture(async (f) => {
    await assert.rejects(
      f.service.issue({
        actorId: 'target',
        sessionHash: 'b'.repeat(64),
        targetId: 'owner',
        kind: 'password',
        ...documentation,
        now,
      }),
    );
    await assert.rejects(
      f.service.issue({
        actorId: 'owner',
        sessionHash,
        targetId: 'owner',
        kind: 'password',
        ...documentation,
        now,
      }),
    );
    f.sqlite.exec("INSERT INTO user_roles VALUES('target','super_admin')");
    await assert.rejects(issue(f.service));
    assert.equal(f.mail.length, 0);
  }));
void test('expired invitations and stale issuance MFA are denied', async () =>
  fixture(async (f) => {
    await issue(f.service);
    await assert.rejects(
      f.service.complete({
        token: f.mail[0].token,
        password: 'new-private-password',
        confirmation: 'new-private-password',
        now: now + 901000,
      }),
    );
    await assert.rejects(
      f.service.issue({
        actorId: 'owner',
        sessionHash,
        targetId: 'target',
        kind: 'password',
        ...documentation,
        now: now + 301000,
      }),
    );
  }));
void test('delivery failure leaves no usable grant or changed target account', async () =>
  fixture(async (f) => {
    const before = (await f.store.readAccount('target'))!.raw;
    const service = new AssistedRecoveryService(f.store, {
      invite: async (message) => {
        f.mail.push(message);
        throw new Error('delivery unavailable');
      },
      notice: async () => {},
    });
    await assert.rejects(issue(service));
    await assert.rejects(
      service.complete({
        token: f.mail[0].token,
        password: 'new-private-password',
        confirmation: 'new-private-password',
        now: now + 1,
      }),
    );
    assert.equal((await f.store.readAccount('target'))!.raw, before);
  }));
void test('concurrent consumption has one winner and completion notice failure reports committed outcome', async () =>
  fixture(async (f) => {
    const service = new AssistedRecoveryService(f.store, {
      invite: async (message) => {
        f.mail.push(message);
      },
      notice: async () => {
        throw new Error('mail down');
      },
    });
    await issue(service);
    const outcomes = await Promise.allSettled(
      [1, 2].map(() =>
        service.complete({
          token: f.mail[0].token,
          password: 'new-private-password',
          confirmation: 'new-private-password',
          now: now + 1,
        }),
      ),
    );
    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
    const success = outcomes.find((o) => o.status === 'fulfilled');
    assert.equal(
      success?.status === 'fulfilled' && success.value.notificationDelivered,
      false,
    );
  }));
for (const noPassword of [false, true])
  void test(`password assistance supports unenrolled seller without changing MFA preference (no password: ${noPassword})`, async () =>
    fixture(async (f) => {
      const manifest = (await f.store.readManifest())!,
        account = (await f.store.readAccount('target'))!;
      await f.store.checkedBatch([
        ...f.store.deleteRecord(account),
        ...f.store.replaceRecord(
          manifest,
          { ...manifest.value, userIds: ['owner'], legacyUserIds: ['owner'] },
          now,
        ),
      ]);
      if (noPassword)
        f.sqlite.exec("DELETE FROM user_credentials WHERE user_id='target'");
      await issue(f.service);
      await f.service.complete({
        token: f.mail[0].token,
        password: 'new-private-password',
        confirmation: 'new-private-password',
        now: now + 1,
      });
      assert.equal(
        (await f.store.readManifest())!.value.userIds.includes('target'),
        false,
      );
      const row = f.sqlite
        .prepare(
          "SELECT password_hash hash,password_salt salt FROM user_credentials WHERE user_id='target'",
        )
        .get()!;
      assert.equal(
        await verifyPassword(
          'new-private-password',
          String(row.hash),
          String(row.salt),
        ),
        true,
      );
    }));
for (const sql of [
  "INSERT INTO user_roles VALUES('target','super_admin')",
  "UPDATE user_credentials SET password_version=9 WHERE user_id='target'",
  "DELETE FROM user_sessions WHERE user_id='owner'",
])
  void test(`completion race rolls back all effects: ${sql}`, async () =>
    fixture(async (f) => {
      await issue(f.service);
      const account = (await f.store.readAccount('target'))!.raw;
      const batch = f.db.batch.bind(f.db);
      let raced = false;
      f.db.batch = ((statements: D1PreparedStatement[]) => {
        if (!raced) {
          raced = true;
          f.sqlite.exec(sql);
        }
        return batch(statements);
      }) as D1Database['batch'];
      await assert.rejects(
        f.service.complete({
          token: f.mail[0].token,
          password: 'new-private-password',
          confirmation: 'new-private-password',
          now: now + 1,
        }),
      );
      assert.equal(raced, true);
      assert.equal((await f.store.readAccount('target'))!.raw, account);
      assert.equal(
        f.sqlite
          .prepare(
            "SELECT count(*) n FROM audit_logs WHERE action LIKE '%completed'",
          )
          .get()!.n,
        0,
      );
    }));
void test('password assistance supports registered-email account before first auth subject exists', async () =>
  fixture(async (f) => {
    f.sqlite.exec("UPDATE users SET auth_subject=NULL WHERE id='target'");
    await issue(f.service);
    await f.service.complete({
      token: f.mail[0].token,
      password: 'new-private-password',
      confirmation: 'new-private-password',
      now: now + 1,
    });
    assert.equal(
      f.sqlite
        .prepare("SELECT auth_subject FROM users WHERE id='target'")
        .get()!.auth_subject,
      null,
    );
  }));
void test('dual Admin and seller target requires staff record ownership review', async () =>
  fixture(async (f) => {
    f.sqlite.exec("INSERT INTO user_roles VALUES('target','admin')");
    await assert.rejects(issue(f.service));
    await f.service.issue({
      actorId: 'owner',
      sessionHash,
      targetId: 'target',
      kind: 'password',
      ...documentation,
      verificationMethod: 'staff_records',
      now,
    });
    assert.equal(f.mail.length, 1);
  }));

void test('new invitation supersedes earlier email and changed target security generation invalidates approval', async () =>
  fixture(async (f) => {
    await issue(f.service);
    await issue(f.service);
    await assert.rejects(
      f.service.complete({
        token: f.mail[0].token,
        password: 'new-private-password',
        confirmation: 'new-private-password',
        now: now + 1,
      }),
    );
    const account = (await f.store.readAccount('target'))!;
    await f.store.checkedBatch(
      f.store.accountCas(
        account,
        { ...account.value, generation: account.value.generation + 1 },
        now,
      ),
    );
    await assert.rejects(
      f.service.complete({
        token: f.mail[1].token,
        password: 'new-private-password',
        confirmation: 'new-private-password',
        now: now + 1,
      }),
    );
  }));
