import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import mysql, { type Connection, type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { createEmailOtpChallenge } from '../lib/auth/email-otp';
import { PasswordResetStore } from '../lib/auth/password-reset-store';
import { resetPassword } from '../lib/auth/password-reset';
import { requestContactVerification, verifyContactVerification } from '../lib/auth/contact-verification';

// Dedicated disposable local fixture only. No schema changes, provider calls,
// environment-file loading, or access to rows outside this harness's unique IDs.
const enabled = process.env.HATSKALA_NATIVE_IDENTITY === '1';
const pools: Pool[] = [];
const originalCreatePool = mysql.createPool;
if (enabled) {
  assert.equal(process.env.DB_HOST, '127.0.0.1');
  assert.equal(process.env.DB_PORT, '13327');
  assert.equal(process.env.DB_NAME, 'hastabazaar_audit');
  assert.equal(process.env.DB_USER, 'audit_fixture');
  assert.equal(process.env.HASTABAZAAR_RUNTIME_ENV, 'local_staging');
  mysql.createPool = new Proxy(originalCreatePool, { apply(target, thisArg, args) {
    const pool = Reflect.apply(target, thisArg, args) as Pool; pools.push(pool); return pool;
  } });
}
after(async () => {
  try { await Promise.all(pools.map(pool => pool.end())); }
  finally { mysql.createPool = originalCreatePool; }
});
const db = env.DB;

function latch() {
  let release!: () => void;
  const reached = new Promise<void>(resolve => { release = resolve; });
  return { reached, release };
}
async function observer(): Promise<Connection> {
  return mysql.createConnection({ host: '127.0.0.1', port: 13327, database: 'hastabazaar_audit',
    user: 'audit_fixture', password: process.env.DB_PASSWORD });
}
async function fixture() {
  const id = `native-identity-${randomUUID()}`;
  const now = Date.now();
  const phone = `98${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
  const sessionHash = createHash('sha256').update(`${id}-session`).digest('hex');
  await db.prepare(`INSERT INTO users(id,auth_subject,email,phone,display_name,status,created_at,updated_at)
    VALUES (?,?,?,?,'SIMULATED native identity user','active',?,?)`)
    .bind(id, id, `${id}@example.test`, phone, now, now).run();
  await db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'customer',?)").bind(id, now).run();
  await db.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?)')
    .bind(sessionHash, id, now + 600000, now, now).run();
  const challenge = createEmailOtpChallenge({ userId: id, now });
  await new PasswordResetStore(db).replaceChallenge(challenge.record);
  return { id, now, actor: { userId: id, authSubject: id, sessionHash }, challenge };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(f: Fixture) {
  // Some release identity FKs intentionally do not cascade. Delete only our IDs.
  for (const table of ['local_contact_captures', 'account_contact_challenges', 'account_phone_verifications',
    'account_email_verifications', 'password_reset_challenges', 'email_login_challenges', 'user_sessions', 'user_credentials', 'user_roles']) {
    await db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(f.id).run();
  }
  await db.prepare('DELETE FROM users WHERE id=?').bind(f.id).run();
}

function pauseResetAfterAccountLock(userId: string) {
  const locked = latch(), resume = latch();
  const pool = pools[0]; assert.ok(pool, 'The actual runtime pool was created by fixture writes');
  const originalGetConnection = pool.getConnection.bind(pool);
  const restores: (() => void)[] = [];
  let blockerThread = 0, waiterThread = 0, waiterPending = false, captured = false;
  pool.getConnection = async () => {
    const connection: PoolConnection = await originalGetConnection.call(pool);
    const originalExecute = connection.execute.bind(connection);
    connection.execute = new Proxy(originalExecute, {
      async apply(target, thisArg, args) {
        const accountUpdate = typeof args[0] === 'string' && args[0] === 'UPDATE users SET updated_at=updated_at WHERE id=?' && args[1]?.[0] === userId;
        const waiting = captured && accountUpdate && connection.threadId !== blockerThread;
        if (waiting) { waiterThread = connection.threadId; waiterPending = true; }
        let response;
        try { response = await Reflect.apply(target, thisArg, args); }
        finally { if (waiting) waiterPending = false; }
        if (!captured && accountUpdate) {
          captured = true; blockerThread = connection.threadId; locked.release();
          await resume.reached;
        }
        return response;
      },
    });
    restores.push(() => { connection.execute = originalExecute; });
    return connection;
  };
  return { locked: locked.reached, resume: resume.release, blockerThread: () => blockerThread, waiterThread: () => waiterThread, waiterPending: () => waiterPending,
    restore() { resume.release(); pool.getConnection = originalGetConnection; for (const restore of restores.reverse()) restore(); } };
}
async function observeAccountLockWait(connection: Connection, barrier: ReturnType<typeof pauseResetAfterAccountLock>) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [processes] = await connection.query<RowDataPacket[]>('SHOW FULL PROCESSLIST');
    const waiting = processes.find(row => Number(row.Id) === barrier.waiterThread());
    // MariaDB's InnoDB information_schema view can omit a transaction whose
    // first UPDATE is waiting. Observe the exact server thread and pending real
    // account UPDATE instead; the reset transaction already owns that row lock.
    if (barrier.waiterPending() && waiting?.State === 'Updating' && waiting.Info === 'UPDATE users SET updated_at=updated_at WHERE id=?') {
      assert.notEqual(barrier.waiterThread(), barrier.blockerThread());
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Competing contact transaction never entered an observed account-update wait');
}
async function countForUser(table: string, id: string) {
  return Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).bind(id).first<{ n: number }>())?.n);
}

for (const channel of ['email', 'phone'] as const) void test(`native F01 reset commits while ${channel} verification waits on the account lock`, { skip: !enabled, timeout: 15000 }, async () => {
  const f = await fixture(); const monitoring = await observer();
  let code = '';
  const issued = await requestContactVerification(db, f.actor, channel, async message => {
    code = message.code;
    await db.prepare(`INSERT INTO local_contact_captures(token_hash,user_id,channel,contact_value,code,expires_at,simulation_label)
      VALUES (?,?,?,?,?,?,'SIMULATED — NOT VALID FOR PRODUCTION')`)
      .bind(message.tokenHash, f.id, channel, message.contact, message.code, message.expiresAt).run();
  }, f.now);
  const barrier = pauseResetAfterAccountLock(f.id);
  const reset = resetPassword(db, f.challenge.token, f.challenge.code, 'Fictional-native-reset-password', f.now + 1);
  let verification: Promise<unknown> | undefined;
  try {
    await Promise.race([barrier.locked, reset.then(() => { throw new Error('Reset completed without reaching its account lock'); })]);
    verification = verifyContactVerification(db, f.actor, channel, issued.token!, code, f.now + 2);
    // Attach rejection handling before releasing the competing reset transaction.
    const rejected = assert.rejects(verification, /contact or code changed/); void rejected.catch(() => {});
    await observeAccountLockWait(monitoring, barrier);
    barrier.resume();
    assert.equal(await reset, true);
    await rejected;
    for (const table of ['user_sessions', 'account_contact_challenges', 'local_contact_captures', 'account_phone_verifications'])
      assert.equal(await countForUser(table, f.id), 0, table);
    assert.equal((await db.prepare('SELECT consumed_at AS consumedAt FROM password_reset_challenges WHERE user_id=?').bind(f.id).first<{ consumedAt: number }>())?.consumedAt, f.now + 1);
  } finally {
    barrier.restore(); await Promise.allSettled([reset, ...(verification ? [verification] : [])]);
    await monitoring.end(); await cleanup(f);
  }
});

void test('native F01 preauthenticated contact issuance waits for reset and delivers no code', { skip: !enabled, timeout: 15000 }, async () => {
  const f = await fixture(); const monitoring = await observer();
  const barrier = pauseResetAfterAccountLock(f.id);
  const reset = resetPassword(db, f.challenge.token, f.challenge.code, 'Fictional-native-reset-password', f.now + 1);
  let issuance: Promise<unknown> | undefined, delivered = false;
  try {
    await Promise.race([barrier.locked, reset.then(() => { throw new Error('Reset completed without reaching its account lock'); })]);
    issuance = requestContactVerification(db, f.actor, 'phone', async () => { delivered = true; }, f.now + 2);
    const rejected = assert.rejects(issuance, /contact changed or a code was just requested/); void rejected.catch(() => {});
    await observeAccountLockWait(monitoring, barrier);
    barrier.resume(); assert.equal(await reset, true); await rejected;
    assert.equal(delivered, false);
    assert.equal(await countForUser('account_contact_challenges', f.id), 0);
    assert.equal(await countForUser('user_sessions', f.id), 0);
  } finally {
    barrier.restore(); await Promise.allSettled([reset, ...(issuance ? [issuance] : [])]);
    await monitoring.end(); await cleanup(f);
  }
});

void test('native F01 valid first mailbox proof checks the originating session before rotating it', { skip: !enabled, timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    await db.prepare(`INSERT INTO user_credentials(user_id,password_hash,password_salt,password_version,created_at,updated_at)
      VALUES (?,'fictional-unverified-hash','fictional-unverified-salt',1,?,?)`).bind(f.id, f.now, f.now).run();
    let code = '';
    const issued = await requestContactVerification(db, f.actor, 'email', async message => { code = message.code; }, f.now);
    const verified = await verifyContactVerification(db, f.actor, 'email', issued.token!, code, f.now + 1);
    assert.ok(verified.sessionToken);
    const replacementHash = createHash('sha256').update(verified.sessionToken!).digest('hex');
    assert.equal(await db.prepare('SELECT token_hash FROM user_sessions WHERE token_hash=?').bind(f.actor.sessionHash).first(), null);
    assert.equal((await db.prepare('SELECT user_id AS userId FROM user_sessions WHERE token_hash=?').bind(replacementHash).first<{ userId: string }>())?.userId, f.id);
    assert.equal(await countForUser('user_sessions', f.id), 1);
    assert.equal(await countForUser('user_credentials', f.id), 0);
    assert.equal(await countForUser('account_email_verifications', f.id), 1);
  } finally { await cleanup(f); }
});