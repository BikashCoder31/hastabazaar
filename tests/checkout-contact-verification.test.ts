import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){return globalThis.contactRouteDb},get CHECKOUT_CONTACT_POLICY(){return globalThis.contactRoutePolicy},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://127.0.0.1:4173"}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/customer')
      return {
        url: 'data:text/javascript,export class CustomerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireExistingCustomerApi(){if(!globalThis.contactRouteActor)throw new CustomerAuthorizationError("Sign in.",401);return globalThis.contactRouteActor;}',
        shortCircuit: true,
      };
    if (specifier === 'next/link')
      return {
        url: 'data:text/javascript,export default function Link(props){return props.children}',
        shortCircuit: true,
      };
    if (specifier === 'next/navigation')
      return {
        url: 'data:text/javascript,export function useRouter(){return {refresh(){}}}',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
declare global {
  var contactRouteDb: D1Database;
  var contactRouteActor: { userId: string; authSubject: string } | null;
  var contactRoutePolicy: string | undefined;
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  sqlite.exec(
    'CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT,password_salt TEXT,password_version INTEGER DEFAULT 1,created_at INTEGER,updated_at INTEGER); CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,created_at INTEGER,last_seen_at INTEGER); CREATE TABLE email_login_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT)',
  );
  let beforeBatch: (() => void | Promise<void>) | undefined;
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      return {
        sql,
        bind(...next: SQLInputValue[]) {
          values = next;
          return this;
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...values) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...values) as T[] };
        },
        async run() {
          return {
            meta: {
              changes: Number(sqlite.prepare(sql).run(...values).changes),
            },
          };
        },
      };
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      const action = beforeBatch;
      beforeBatch = undefined;
      await action?.();
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  sqlite.exec(
    "INSERT INTO users(id,auth_subject,email,phone,display_name,status,created_at,updated_at) VALUES ('buyer','buyer-subject','buyer@local.hastabazaar.test','9811111111','Fictional Buyer','active',1,1),('other','other-subject','other@local.hastabazaar.test','9822222222','Other Buyer','active',1,1); INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('buyer','customer',1),('other','customer',1)",
  );
  const sessionHash = createHash('sha256').update('fixture-session').digest('hex');
  sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)').run(sessionHash, 'buyer', Date.now() + 99999999, 1, 1);
  return {
    db,
    sqlite,
    actor: { userId: 'buyer', authSubject: 'buyer-subject', sessionHash },
    race(action: () => void | Promise<void>) {
      beforeBatch = action;
    },
  };
}

async function feature() {
  const feature = await import('../lib/auth/contact-verification').catch(
    () => null,
  );
  assert.ok(feature, 'The contact verification service must exist');
  return feature;
}

async function completeReset(f: ReturnType<typeof fixture>, now: number) {
  const { createEmailOtpChallenge } = await import('../lib/auth/email-otp');
  const { PasswordResetStore } = await import('../lib/auth/password-reset-store');
  const { resetPassword } = await import('../lib/auth/password-reset');
  const challenge = createEmailOtpChallenge({ userId: 'buyer', now });
  await new PasswordResetStore(f.db).replaceChallenge(challenge.record);
  assert.equal(await resetPassword(f.db, challenge.token, challenge.code, 'Fictional-reset-password', now + 1), true);
}

void test('reset revokes issued email and phone codes and fictional captures atomically', async () => {
  const m = await feature(); const f = fixture();
  try {
    const issued: { channel: 'email' | 'phone'; token: string; code: string }[] = [];
    for (const channel of ['email', 'phone'] as const) {
      let code = '';
      const request = await m.requestContactVerification(f.db, f.actor, channel, async message => {
        code = message.code;
        f.sqlite.prepare('INSERT INTO local_contact_captures VALUES (?,?,?,?,?,?,?)').run(message.tokenHash, 'buyer', channel, message.contact, code, message.expiresAt, 'SIMULATED — NOT VALID FOR PRODUCTION');
      }, 1000);
      issued.push({ channel, token: request.token!, code });
    }
    await completeReset(f, 1002);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM account_contact_challenges').get()?.n, 0);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM local_contact_captures').get()?.n, 0);
    for (const code of issued) await assert.rejects(m.verifyContactVerification(f.db, f.actor, code.channel, code.token, code.code, 1004));
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_sessions').get()?.n, 0);
  } finally { f.sqlite.close(); }
});

for (const channel of ['email', 'phone'] as const) void test(`reset after ${channel} verification read cannot commit proof or a replacement session`, async () => {
  const m = await feature(); const f = fixture(); let code = '';
  try {
    const request = await m.requestContactVerification(f.db, f.actor, channel, async message => { code = message.code; }, 1000);
    f.race(() => completeReset(f, 1002));
    await assert.rejects(m.verifyContactVerification(f.db, f.actor, channel, request.token!, code, 1004));
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_sessions').get()?.n, 0);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM account_phone_verifications').get()?.n, 0);
  } finally { f.sqlite.close(); }
});

void test('request authenticated before reset cannot issue a code after reset commits', async () => {
  const m = await feature(); const f = fixture(); let delivered = false;
  try {
    f.race(() => completeReset(f, 1000));
    await assert.rejects(m.requestContactVerification(f.db, f.actor, 'phone', async () => { delivered = true; }, 1002));
    assert.equal(delivered, false);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM account_contact_challenges').get()?.n, 0);
  } finally { f.sqlite.close(); }
});

void test('contact mutations fail closed without hosted proof, including forged local fixture proof in production', async () => {
  const m = await feature(); const f = fixture(); const previous = process.env.NODE_ENV;
  try {
    Object.assign(process.env, { NODE_ENV: 'production' });
    const actor = { userId: 'buyer', authSubject: 'buyer-subject' };
    await assert.rejects(m.requestContactVerification(f.db, actor, 'phone', async () => {}, 1000));
    await assert.rejects(m.requestContactVerification(f.db, { ...actor, localFixture: true }, 'phone', async () => {}, 1000));
  } finally { f.sqlite.close(); if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: previous }); }
});

void test('a rolled-back reset preserves pending contact proof and originating session', async () => {
  const m = await feature(); const f = fixture();
  try {
    let code = '';
    const request = await m.requestContactVerification(f.db, f.actor, 'phone', async message => { code = message.code; }, 1000);
    const { createEmailOtpChallenge } = await import('../lib/auth/email-otp');
    const { PasswordResetStore } = await import('../lib/auth/password-reset-store');
    const { resetPassword } = await import('../lib/auth/password-reset');
    const challenge = createEmailOtpChallenge({ userId: 'buyer', now: 1001 });
    await new PasswordResetStore(f.db).replaceChallenge(challenge.record);
    await assert.rejects(resetPassword(f.db, challenge.token, challenge.code, 'Fictional-reset-password', 1002,
      () => f.db.prepare("INSERT INTO operation_transaction_guards(id,valid) VALUES ('forced-reset-rollback',0)")));
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_sessions').get()?.n, 1);
    assert.equal(f.sqlite.prepare('SELECT consumed_at FROM password_reset_challenges').get()?.consumed_at, null);
    await m.verifyContactVerification(f.db, f.actor, 'phone', request.token!, code, 1003);
    assert.equal((await m.getContactVerificationStatus(f.db, f.actor)).phoneVerified, true);
  } finally { f.sqlite.close(); }
});

void test('explicit loopback local role fixtures can verify contact while nonloopback requests require hosted proof', async () => {
  const f = fixture(); const previous = process.env.NODE_ENV;
  try {
    Object.assign(process.env, { NODE_ENV: 'development' });
    f.sqlite.exec("UPDATE users SET auth_subject='local-test-buyer' WHERE id='buyer'; DELETE FROM user_sessions");
    globalThis.contactRouteDb = f.db;
    globalThis.contactRouteActor = { userId: 'buyer', authSubject: 'local-test-buyer' };
    const { POST } = await import('../app/api/account/contact-verification/route');
    const request = (host: string) => new Request('http://127.0.0.1:4173/api/account/contact-verification', { method: 'POST',
      headers: { host, origin: 'http://127.0.0.1:4173', cookie: 'hastabazaar_local_test_role=buyer', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'request', channel: 'phone' }) });
    assert.equal((await POST(request('remote.test'))).status, 401);
    assert.equal((await POST(request('127.0.0.1:4173'))).status, 200);
  } finally { globalThis.contactRouteActor = null; f.sqlite.close(); if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: previous }); }
});

void test('contact codes prove only the exact authenticated owner and contact; successful proof is remembered', async () => {
  const m = await feature();
  const f = fixture();
  const delivered: string[] = [];
  try {
    const request = await m.requestContactVerification(
      f.db,
      f.actor,
      'phone',
      async (message) => {
        delivered.push(message.code);
      },
      1000,
    );
    assert.match(delivered[0], /^\d{6}$/);
    assert.ok(request.token);
    assert.equal(Object.hasOwn(request, 'code'), false);
    await assert.rejects(
      m.verifyContactVerification(
        f.db,
        { userId: 'other', authSubject: 'other-subject' },
        'phone',
        request.token!,
        delivered[0],
        1001,
      ),
      /code|owner|contact/i,
    );
    await m.verifyContactVerification(
      f.db,
      f.actor,
      'phone',
      request.token!,
      delivered[0],
      1002,
    );
    assert.equal(
      (await m.getContactVerificationStatus(f.db, f.actor)).phoneVerified,
      true,
    );
    await assert.rejects(
      m.verifyContactVerification(
        f.db,
        f.actor,
        'phone',
        request.token!,
        delivered[0],
        1003,
      ),
      /code|used/i,
    );
    const repeated = await m.requestContactVerification(
      f.db,
      f.actor,
      'phone',
      async () => {
        throw Error('must not resend');
      },
      1004,
    );
    assert.equal(repeated.verified, true);
  } finally {
    f.sqlite.close();
  }
});

void test('verification UI explains first email security, requires both proofs, and clearly labels fictional capture', async () => {
  const feature =
    await import('../components/account/contact-verification').catch(
      () => null,
    );
  assert.ok(feature, 'A reusable contact verification panel must exist');
  const html = renderToStaticMarkup(
    createElement(feature.ContactVerificationPanel, {
      initialStatus: {
        email: 'buyer@local.hastabazaar.test',
        phone: '+9779811111111',
        emailVerified: false,
        phoneVerified: false,
      },
      captureAvailable: true,
    }),
  );
  assert.match(html, /other.*sessions|sessions.*sign/i);
  assert.match(html, /password/i);
  assert.match(html, /SIMULATED/);
  assert.match(html, /Verify email/i);
  assert.match(html, /Verify phone/i);
  const verified = renderToStaticMarkup(
    createElement(feature.ContactVerificationPanel, {
      initialStatus: {
        email: 'buyer@local.hastabazaar.test',
        phone: '+9779811111111',
        emailVerified: true,
        phoneVerified: true,
      },
    }),
  );
  assert.doesNotMatch(verified, /Send email code|Send phone code/);
  assert.match(verified, /Verified/);
});

void test('MariaDB translates atomic consumed-code claim checks to connection row counts', async () => {
  const { translateSqliteSql } = await import('../lib/runtime/node-bindings');
  assert.equal(
    translateSqliteSql(
      "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('invalid','$') END",
    ),
    "SELECT CASE WHEN ROW_COUNT()=1 THEN 1 ELSE json_extract('invalid','$') END",
  );
});

void test('actual contact receiver rejects spoofed owner/origin, hides codes, and enforces aggregate budgets', async () => {
  const route =
    await import('../app/api/account/contact-verification/route').catch(
      () => null,
    );
  const capture =
    await import('../app/api/account/contact-verification/capture/route').catch(
      () => null,
    );
  assert.ok(route && capture, 'Authenticated contact receivers must exist');
  const f = fixture();
  globalThis.contactRouteDb = f.db;
  globalThis.contactRouteActor = f.actor;
  const req = (body: unknown, origin = 'http://127.0.0.1:4173') =>
    new Request('http://127.0.0.1:4173/api/account/contact-verification', {
      method: 'POST',
      headers: { origin, cookie: 'hastabazaar_session=fixture-session', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (
        await route.POST(
          req({ action: 'request', channel: 'phone' }, 'https://attacker.test'),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await route.POST(
          req({ action: 'request', channel: 'phone', userId: 'other' }),
        )
      ).status,
      400,
    );
    globalThis.contactRouteActor = null;
    assert.equal(
      (await route.POST(req({ action: 'request', channel: 'phone' }))).status,
      401,
    );
    globalThis.contactRouteActor = f.actor;
    const response = await route.POST(
      req({ action: 'request', channel: 'phone' }),
    );
    assert.equal(response.status, 200);
    const request = (await response.json()) as { token: string };
    assert.ok(request.token);
    assert.equal(Object.hasOwn(request, 'code'), false);
    const captured = await capture.GET(
      new Request(
        'http://127.0.0.1:4173/api/account/contact-verification/capture',
      ),
    );
    const messages = (await captured.json()) as {
      captures: { code: string }[];
    };
    assert.equal(messages.captures.length, 1);
    const verified = await route.POST(
      req({
        action: 'verify',
        channel: 'phone',
        token: request.token,
        code: messages.captures[0].code,
      }),
    );
    assert.equal(verified.status, 200);
    assert.equal(Object.hasOwn(await verified.json(), 'code'), false);
    for (let i = 0; i < 3; i++)
      await route.POST(req({ action: 'request', channel: 'email' }));
    assert.equal(
      (await route.POST(req({ action: 'request', channel: 'phone' }))).status,
      429,
    );
    assert.equal(
      (
        await capture.GET(
          new Request(
            'https://attacker.test/api/account/contact-verification/capture',
          ),
        )
      ).status,
      403,
    );
  } finally {
    globalThis.contactRouteActor = null;
    f.sqlite.close();
  }
});

void test('email-only mode rejects dormant phone OTP requests and verification without challenges or budget usage', async () => {
  const { POST } = await import('../app/api/account/contact-verification/route');
  const f = fixture();
  const previousPolicy = globalThis.contactRoutePolicy;
  globalThis.contactRouteDb = f.db;
  globalThis.contactRouteActor = f.actor;
  globalThis.contactRoutePolicy = 'email_only';
  const request = (body: unknown) => new Request('http://127.0.0.1:4173/api/account/contact-verification', {
    method: 'POST', headers: { origin: 'http://127.0.0.1:4173', cookie: 'hastabazaar_session=fixture-session',
      'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    for (const body of [{ action: 'request', channel: 'phone' },
      { action: 'verify', channel: 'phone', token: 'A'.repeat(43), code: '123456' }]) {
      const response = await POST(request(body));
      assert.equal(response.status, 503);
      assert.match((await response.json() as { error: string }).error, /SMS.*temporarily unavailable/i);
    }
    for (const table of ['account_contact_challenges', 'local_contact_captures', 'account_phone_verifications', 'request_rate_limits'])
      assert.equal(f.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n, 0, table);
    const email = await POST(request({ action: 'request', channel: 'email' }));
    assert.equal(email.status, 200);
    assert.equal(f.sqlite.prepare('SELECT channel FROM account_contact_challenges').get()?.channel, 'email');
    assert.equal(f.sqlite.prepare('SELECT channel FROM local_contact_captures').get()?.channel, 'email');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM account_phone_verifications').get()?.n, 0);
  } finally {
    globalThis.contactRoutePolicy = previousPolicy;
    globalThis.contactRouteActor = null;
    f.sqlite.close();
  }
});

void test('actual new order repository rejects guest and unverified callers before any order write', async () => {
  const { createCodOrder } = await import('../lib/db/repositories/orders');
  const f = fixture();
  const input = {
    customerEmail: 'buyer@local.hastabazaar.test',
    customerPhone: '9811111111',
    locale: 'en-NP' as const,
    termsAccepted: true,
    idempotencyKey: crypto.randomUUID(),
    address: {
      recipientName: 'Fictional buyer',
      phone: '9822222222',
      province: 'Bagmati',
      district: 'Kathmandu',
      municipality: 'Kathmandu',
      locality: 'Test locality',
    },
  };
  try {
    await assert.rejects(
      createCodOrder(f.db, 'cart', 'receipt', input, 1000),
      /sign in/i,
    );
    await assert.rejects(
      createCodOrder(
        f.db,
        'cart',
        'receipt',
        { ...input, customerAuthSubject: 'buyer-subject' },
        1000,
        'buyer',
      ),
      /verify/i,
    );
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM orders').get()?.n,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('local captures require guarded loopback runtime and fictional account, expire and isolate owners', async () => {
  const feature = await import('../lib/auth/contact-delivery').catch(
    () => null,
  );
  assert.ok(feature, 'The guarded contact delivery adapter must exist');
  const f = fixture();
  const message = {
    userId: 'buyer',
    channel: 'phone' as const,
    contact: '+9779811111111',
    email: 'buyer@local.hastabazaar.test',
    tokenHash: 'token',
    code: '123456',
    expiresAt: 2000,
  };
  try {
    f.sqlite.exec(
      "INSERT INTO account_contact_challenges(token_hash,code_hash,user_id,auth_subject,channel,contact_value,contact_snapshot,expires_at,created_at,delivered_at) VALUES ('token','hash','buyer','buyer-subject','phone','+9779811111111','9811111111',2000,1000,1000)",
    );
    const local = {
      HASTABAZAAR_RUNTIME_ENV: 'local_staging',
      APP_ORIGIN: 'http://127.0.0.1:4173',
    };
    await feature.deliverContactCode(f.db, local, message);
    assert.equal(
      (await feature.readLocalContactCaptures(f.db, local, f.actor, 1001))[0]
        ?.code,
      '123456',
    );
    assert.equal(
      (
        await feature.readLocalContactCaptures(
          f.db,
          local,
          { userId: 'other', authSubject: 'other-subject' },
          1001,
        )
      ).length,
      0,
    );
    assert.equal(
      (await feature.readLocalContactCaptures(f.db, local, f.actor, 2000))
        .length,
      0,
    );
    await assert.rejects(
      feature.deliverContactCode(
        f.db,
        { ...local, APP_ORIGIN: 'https://hastabazaar.com' },
        message,
      ),
      /unavailable|local|loopback/i,
    );
    await assert.rejects(
      feature.deliverContactCode(
        f.db,
        {
          HASTABAZAAR_RUNTIME_ENV: 'production',
          APP_ORIGIN: 'https://hastabazaar.com',
        },
        message,
      ),
      /unavailable|configured/i,
    );
    await assert.rejects(
      feature.deliverContactCode(f.db, local, {
        ...message,
        email: 'real@example.com',
      }),
      /fictional|recipient/i,
    );
    await assert.rejects(
      feature.readLocalContactCaptures(
        f.db,
        { HASTABAZAAR_RUNTIME_ENV: 'production' },
        f.actor,
        1001,
      ),
      /unavailable|local/i,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('wrong codes exhaust attempts and expired or replaced challenges cannot verify', async () => {
  const m = await feature();
  const f = fixture();
  let code = '';
  try {
    const a = await m.requestContactVerification(
      f.db,
      f.actor,
      'phone',
      async (message) => {
        code = message.code;
      },
      1000,
    );
    const oldCode = code;
    await assert.rejects(
      m.requestContactVerification(
        f.db,
        f.actor,
        'phone',
        async () => {},
        1001,
      ),
      /wait/i,
    );
    const b = await m.requestContactVerification(
      f.db,
      f.actor,
      'phone',
      async (message) => {
        code = message.code;
      },
      61001,
    );
    await assert.rejects(
      m.verifyContactVerification(
        f.db,
        f.actor,
        'phone',
        a.token!,
        oldCode,
        61002,
      ),
      /code/i,
    );
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        m.verifyContactVerification(
          f.db,
          f.actor,
          'phone',
          b.token!,
          wrong,
          61003 + i,
        ),
        /code|attempt/i,
      );
    await assert.rejects(
      m.verifyContactVerification(
        f.db,
        f.actor,
        'phone',
        b.token!,
        code,
        61010,
      ),
      /code|attempt/i,
    );
    const c = await m.requestContactVerification(
      f.db,
      f.actor,
      'phone',
      async (message) => {
        code = message.code;
      },
      121002,
    );
    await assert.rejects(
      m.verifyContactVerification(
        f.db,
        f.actor,
        'phone',
        c.token!,
        code,
        721002,
      ),
      /expired|code/i,
    );
    assert.equal(
      (await m.getContactVerificationStatus(f.db, f.actor)).phoneVerified,
      false,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('contact changes revoke old proof and pending codes, including when changed back', async () => {
  const m = await feature();
  const f = fixture();
  let code = '';
  try {
    const p = await m.requestContactVerification(
      f.db,
      f.actor,
      'phone',
      async (message) => {
        code = message.code;
      },
      1000,
    );
    await m.verifyContactVerification(
      f.db,
      f.actor,
      'phone',
      p.token!,
      code,
      1001,
    );
    f.sqlite.exec(
      "UPDATE users SET phone='9833333333' WHERE id='buyer'; UPDATE users SET phone='9811111111' WHERE id='buyer'",
    );
    assert.equal(
      (await m.getContactVerificationStatus(f.db, f.actor)).phoneVerified,
      false,
    );
    const q = await m.requestContactVerification(
      f.db,
      f.actor,
      'phone',
      async (message) => {
        code = message.code;
      },
      61002,
    );
    f.sqlite.exec("UPDATE users SET phone='9844444444' WHERE id='buyer'");
    await assert.rejects(
      m.verifyContactVerification(
        f.db,
        f.actor,
        'phone',
        q.token!,
        code,
        61003,
      ),
      /code|contact/i,
    );
    f.sqlite.exec(
      "INSERT INTO account_email_verifications VALUES ('buyer','buyer@local.hastabazaar.test',1); UPDATE users SET email='new@local.hastabazaar.test' WHERE id='buyer'; UPDATE users SET email='buyer@local.hastabazaar.test' WHERE id='buyer'",
    );
    assert.equal(
      (await m.getContactVerificationStatus(f.db, f.actor)).emailVerified,
      false,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('provider failure removes usable code; concurrent contact change cannot acquire proof', async () => {
  const m = await feature();
  const f = fixture();
  let code = '';
  try {
    await assert.rejects(
      m.requestContactVerification(
        f.db,
        f.actor,
        'phone',
        async () => {
          throw Error('offline');
        },
        1000,
      ),
      /offline|delivery/i,
    );
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT count(*) AS n FROM account_contact_challenges WHERE delivered_at IS NOT NULL AND consumed_at IS NULL',
        )
        .get()?.n,
      0,
    );
    const p = await m.requestContactVerification(
      f.db,
      f.actor,
      'phone',
      async (message) => {
        code = message.code;
      },
      61001,
    );
    f.race(() =>
      f.sqlite.exec("UPDATE users SET phone='9833333333' WHERE id='buyer'"),
    );
    await assert.rejects(
      m.verifyContactVerification(
        f.db,
        f.actor,
        'phone',
        p.token!,
        code,
        61002,
      ),
      /contact|code/i,
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT count(*) AS n FROM account_phone_verifications')
        .get()?.n,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('first email proof rotates a session and retains mailbox anti-preclaim protection', async () => {
  const m = await feature();
  const f = fixture();
  let code = '';
  try {
    f.sqlite.exec(
      "INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES ('buyer','unverified-hash','salt',1,1); INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES ('prior','buyer',9999999,1,1)",
    );
    const p = await m.requestContactVerification(
      f.db,
      f.actor,
      'email',
      async (message) => {
        code = message.code;
      },
      1000,
    );
    const result = await m.verifyContactVerification(
      f.db,
      f.actor,
      'email',
      p.token!,
      code,
      1001,
    );
    assert.ok(result.sessionToken);
    assert.equal(
      (await m.getContactVerificationStatus(f.db, f.actor)).emailVerified,
      true,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT count(*) AS n FROM user_sessions WHERE token_hash='prior'",
        )
        .get()?.n,
      0,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT count(*) AS n FROM user_credentials WHERE user_id='buyer'",
        )
        .get()?.n,
      0,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT count(*) AS n FROM user_sessions WHERE user_id='buyer'",
        )
        .get()?.n,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('checkout proof guard rejects bypass and rolls back changed contacts at insertion', async () => {
  const m = await feature();
  const f = fixture();
  try {
    await assert.rejects(
      m.requireCheckoutContactProof(
        f.db,
        null,
        'buyer@local.hastabazaar.test',
        '9811111111',
      ),
      /sign in/i,
    );
    await assert.rejects(
      m.requireCheckoutContactProof(
        f.db,
        f.actor,
        'buyer@local.hastabazaar.test',
        '9811111111',
      ),
      /verify/i,
    );
    f.sqlite.exec(
      "INSERT INTO account_email_verifications VALUES ('buyer','buyer@local.hastabazaar.test',1); INSERT INTO account_phone_verifications VALUES ('buyer','+9779811111111',1)",
    );
    const proof = await m.requireCheckoutContactProof(
      f.db,
      f.actor,
      'buyer@local.hastabazaar.test',
      '+977 981-111-1111',
    );
    await assert.rejects(
      m.requireCheckoutContactProof(
        f.db,
        f.actor,
        'forged@local.hastabazaar.test',
        '9811111111',
      ),
      /contact|email/i,
    );
    await assert.rejects(
      m.requireCheckoutContactProof(
        f.db,
        f.actor,
        'buyer@local.hastabazaar.test',
        '9822222222',
      ),
      /contact|phone/i,
    );
    f.race(() =>
      f.sqlite.exec(
        "DELETE FROM account_phone_verifications WHERE user_id='buyer'",
      ),
    );
    await assert.rejects(
      f.db.batch([
        ...m.checkoutContactGuards(f.db, proof),
        f.db.prepare(
          "INSERT INTO audit_logs(id,action,subject_type,subject_id,reason,request_id,created_at) VALUES ('forged','order.placed','order','test','test','test',1)",
        ),
      ]),
      /valid|guard|CHECK/i,
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT count(*) AS n FROM audit_logs WHERE id='forged'")
        .get()?.n,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('temporary email-only checkout still requires current mailbox proof and exact phone ownership at commit', async () => {
  const m = await feature();
  const f = fixture();
  try {
    assert.equal(m.resolveCheckoutContactPolicy(undefined), 'email_and_phone');
    assert.equal(m.resolveCheckoutContactPolicy('email_only'), 'email_only');
    assert.equal(m.resolveCheckoutContactPolicy('disabled'), 'email_and_phone');
    assert.equal(m.resolveCheckoutContactPolicy(''), 'email_and_phone');
    await assert.rejects(
      m.requireCheckoutContactProof(f.db, f.actor, 'buyer@local.hastabazaar.test', '9811111111', 'email_only'),
      /verify.*email/i,
    );
    f.sqlite.exec("INSERT INTO account_email_verifications VALUES ('buyer','buyer@local.hastabazaar.test',1)");
    await assert.rejects(
      m.requireCheckoutContactProof(f.db, f.actor, 'buyer@local.hastabazaar.test', '9822222222', 'email_only'),
      /contact|phone/i,
    );
    await assert.rejects(
      m.requireCheckoutContactProof(f.db, f.actor, 'buyer@local.hastabazaar.test', '9811111111'),
      /verify.*phone/i,
    );
    const proof = await m.requireCheckoutContactProof(
      f.db, f.actor, 'buyer@local.hastabazaar.test', '9811111111', 'email_only',
    );
    const attemptedInsert = () => f.db.batch([
      ...m.checkoutContactGuards(f.db, proof),
      f.db.prepare("INSERT INTO audit_logs(id,action,subject_type,subject_id,reason,request_id,created_at) VALUES ('email-only-order','order.placed','order','test','test','test',1)"),
    ]);
    f.race(() => f.sqlite.exec("UPDATE users SET phone='9833333333' WHERE id='buyer'"));
    await assert.rejects(attemptedInsert(), /valid|guard|CHECK/i);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM audit_logs WHERE id='email-only-order'").get()?.n, 0);
    f.sqlite.exec("UPDATE users SET phone='9811111111' WHERE id='buyer'");
    const nextProof = await m.requireCheckoutContactProof(
      f.db, f.actor, 'buyer@local.hastabazaar.test', '9811111111', 'email_only',
    );
    f.race(() => f.sqlite.exec("DELETE FROM account_email_verifications WHERE user_id='buyer'"));
    await assert.rejects(f.db.batch([
      ...m.checkoutContactGuards(f.db, nextProof),
      f.db.prepare("INSERT INTO audit_logs(id,action,subject_type,subject_id,reason,request_id,created_at) VALUES ('email-only-order','order.placed','order','test','test','test',1)"),
    ]), /valid|guard|CHECK/i);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM audit_logs WHERE id='email-only-order'").get()?.n, 0);
    f.sqlite.exec("INSERT INTO account_email_verifications VALUES ('buyer','buyer@local.hastabazaar.test',2)");
    await attemptedInsert();
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM audit_logs WHERE id='email-only-order'").get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM account_phone_verifications WHERE user_id='buyer'").get()?.n, 0);
  } finally {
    f.sqlite.close();
  }
});

void test('email-only contact panel asks for email proof without offering unavailable SMS', async () => {
  const { ContactVerificationPanel } = await import('../components/account/contact-verification');
  const props = {
    ownerKey: 'buyer',
    initialStatus: {
      email: 'buyer@local.hastabazaar.test',
      phone: '+9779811111111',
      emailVerified: false,
      phoneVerified: false,
    },
  };
  const emailOnly = renderToStaticMarkup(createElement(ContactVerificationPanel, {
    ...props, contactPolicy: 'email_only',
  }));
  assert.match(emailOnly, /Verify your email before checkout/);
  assert.match(emailOnly, /SMS verification is temporarily unavailable/);
  assert.match(emailOnly, /Send email code/);
  assert.doesNotMatch(emailOnly, /Send phone code|Verify phone/);
  const strict = renderToStaticMarkup(createElement(ContactVerificationPanel, props));
  assert.match(strict, /Send phone code/);
});

void test('profile format-only edits preserve phone proof; meaningful replacement revokes it', async () => {
  const { updateCustomerProfile } =
    await import('../lib/db/repositories/customers');
  const f = fixture();
  try {
    f.sqlite.exec(
      "INSERT INTO account_phone_verifications VALUES ('buyer','+9779811111111',1)",
    );
    f.sqlite
      .exec(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('profile-v1','account.profile',1,1,'published','{"formId":"account.profile","fields":[]}','Fixture','buyer',1,'buyer',1,'buyer',1,'seed-profile')`);
    const version = f.sqlite
      .prepare(
        "SELECT id,version FROM form_config_versions WHERE form_id='account.profile' AND status='published' ORDER BY version DESC LIMIT 1",
      )
      .get()!;
    const input = {
      userId: 'buyer',
      displayName: 'Fictional Buyer',
      phone: '+977 (981) 111-1111',
      locale: 'en-NP' as const,
      requestId: crypto.randomUUID(),
      now: 1000,
      formVersion: Number(version.version),
      versionId: String(version.id),
      answers: {
        formId: 'account.profile',
        version: Number(version.version),
        answers: [],
      },
    };
    await updateCustomerProfile(f.db, input);
    assert.equal(
      (await (await feature()).getContactVerificationStatus(f.db, f.actor))
        .phoneVerified,
      true,
    );
    await updateCustomerProfile(f.db, {
      ...input,
      phone: '9822222223',
      requestId: crypto.randomUUID(),
      now: 1001,
    });
    assert.equal(
      (await (await feature()).getContactVerificationStatus(f.db, f.actor))
        .phoneVerified,
      false,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('global send budget prevents transport costs across different users and fails closed on invalid configuration', async () => {
  const { deliverContactCode } = await import('../lib/auth/contact-delivery');
  const f = fixture();
  const sends: string[] = [];
  const environment = {
    HASTABAZAAR_RUNTIME_ENV: 'test',
    CONTACT_DAILY_SEND_LIMIT: '2',
    SMS: {
      configured: true,
      async send(message: { to: string; text: string }) {
        sends.push(message.to);
      },
    },
  };
  const message = {
    userId: 'buyer',
    channel: 'phone' as const,
    contact: '+9779811111111',
    email: 'buyer@local.hastabazaar.test',
    tokenHash: 'token',
    code: '123456',
    expiresAt: Date.now() + 600000,
  };
  try {
    await deliverContactCode(f.db, environment, message);
    await deliverContactCode(f.db, environment, {
      ...message,
      userId: 'other',
      contact: '+9779822222222',
    });
    await assert.rejects(
      deliverContactCode(f.db, environment, { ...message, userId: 'third' }),
      /limit|budget|unavailable/i,
    );
    assert.deepEqual(sends, ['+9779811111111', '+9779822222222']);
    await assert.rejects(
      deliverContactCode(
        f.db,
        { ...environment, CONTACT_DAILY_SEND_LIMIT: 'NaN' },
        message,
      ),
      /configuration|limit|unavailable/i,
    );
    assert.equal(sends.length, 2);
  } finally {
    f.sqlite.close();
  }
});

void test('legacy guest and signed-in receipt replays survive new contact requirements without changing records', async () => {
  const { createCodOrder } = await import('../lib/db/repositories/orders');
  const { parseCheckoutInput } = await import('../lib/checkout/validation');
  for (const {customerId, parserShape} of [null, 'buyer'].flatMap(customerId =>
    [false, true].map(parserShape => ({customerId, parserShape})))) {
    const f = fixture();
    const originalInput = {
      customerEmail: 'buyer@local.hastabazaar.test',
      customerPhone: '9811111111',
      locale: 'en-NP' as const,
      termsAccepted: true,
      idempotencyKey: crypto.randomUUID(),
      address: {
        recipientName: 'Legacy buyer',
        phone: '9822222222',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu',
        locality: 'Legacy locality',
      },
    };
    // Frozen historical parser shape: changing today's defaults must not change
    // the stored old digest and its expected replay together.
    const historicalInput = parserShape ? {
      customerEmail: originalInput.customerEmail,
      customerPhone: originalInput.customerPhone,
      deliveryFor: 'self' as const,
      recipientEmail: undefined,
      selectedAddressId: undefined,
      saveAddressForFuture: false,
      saveAddressLabel: undefined,
      locale: originalInput.locale,
      termsAccepted: true,
      idempotencyKey: originalInput.idempotencyKey,
      deliveryRateVersion: undefined,
      useWallet: false,
      referralCode: '',
      formVersion: undefined,
      customAnswers: undefined,
      address: { ...originalInput.address, ward: undefined, landmark: undefined, postalCode: undefined, location: undefined },
    } : originalInput;
    const input = parserShape ? parseCheckoutInput(originalInput).value! : originalInput;
    const digest = createHash('sha256')
      .update(JSON.stringify({ customerId, ...historicalInput }))
      .digest('hex');
    try {
      f.sqlite
        .prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
        VALUES ('legacy','LEGACY',?,'buyer@local.hastabazaar.test','9811111111','confirmed','en-NP','old-policy','{}',10000,15000,25000,'cod','pending',1,1)`)
        .run(customerId);
      f.sqlite
        .prepare(
          "INSERT INTO payments(id,order_id,provider,provider_reference,method,status,amount_paisa,idempotency_key,created_at,updated_at) VALUES ('legacy-payment','legacy','manual_cod',?,'cod','pending',25000,?,1,1)",
        )
        .run(`cart:${input.idempotencyKey}`, input.idempotencyKey);
      f.sqlite.exec(
        "INSERT INTO shipments(id,order_id,provider,status,payment_mode,delivery_charge_paisa,estimated_min_days,estimated_max_days,created_at,updated_at) VALUES ('legacy-shipment','legacy','manual','pending','cod',15000,1,3,1,1)",
      );
      f.sqlite
        .prepare(
          "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES ('legacy-audit',?,'order.placed','order','legacy','Legacy order',?,?,1)",
        )
        .run(
          customerId,
          JSON.stringify({ checkoutIntentDigest: digest }),
          input.idempotencyKey,
        );
      const before = f.sqlite
        .prepare("SELECT * FROM orders WHERE id='legacy'")
        .get();
      const result = await createCodOrder(
        f.db,
        'cart',
        'receipt',
        {
          ...input,
          ...(customerId ? { customerAuthSubject: 'buyer-subject' } : {}),
        },
        1000,
        customerId,
      );
      assert.deepEqual(result, {
        orderNumber: 'LEGACY',
        grandTotalPaisa: 25000,
        estimatedMinDays: 1,
        estimatedMaxDays: 3,
      });
      assert.deepEqual(
        f.sqlite.prepare("SELECT * FROM orders WHERE id='legacy'").get(),
        before,
      );
      assert.equal(
        f.sqlite.prepare('SELECT count(*) AS n FROM orders').get()?.n,
        1,
      );
    } finally {
      f.sqlite.close();
    }
  }
});

async function realCart(f: ReturnType<typeof fixture>) {
  f.sqlite
    .exec(`INSERT INTO account_email_verifications VALUES ('buyer','buyer@local.hastabazaar.test',1); INSERT INTO account_phone_verifications VALUES ('buyer','+9779811111111',1);
    INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at)
    VALUES ('seller','buyer','Fictional Maker','Fixture Shop','Local','FIX-REG','PAN','FIX-PAN','Maker','9800000000','seller@local.hastabazaar.test','Madhesh','Dhanusha','Janakpur','Ward 1','FIX-BANK','approved',1,1);
    INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('category','fixture-category','Fixture',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
    VALUES ('product','seller','category','fixture-product','FIX-SKU','Fixture product','Fictional',10000,100,'Maker','NP','Fibre',1,'published',1,1);
    INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES ('cart','cart','NPR',253402300799999,1,1);
    INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('item','cart','product',1,1,1);
    INSERT INTO wallet_accounts(user_id,referral_code,created_at) VALUES ('buyer','REF-FIXTURE',1);`);
  f.sqlite
    .prepare(
      "UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=1 WHERE id='seller'",
    )
    .run(SELLER_AGREEMENT_VERSION);
  const { historicalCommissionFixture } = await import('./helpers/historical-commission-fixture');
  historicalCommissionFixture(f.sqlite,'buyer',true);
  const { getDeliveryRates } =
    await import('../lib/db/repositories/delivery-rates');
  const rates = await getDeliveryRates(f.db);
  return {
    customerEmail: 'buyer@local.hastabazaar.test',
    customerPhone: '9811111111',
    customerAuthSubject: 'buyer-subject',
    deliveryFor: 'other' as const,
    recipientEmail: 'recipient@local.hastabazaar.test',
    locale: 'en-NP' as const,
    termsAccepted: true,
    idempotencyKey: crypto.randomUUID(),
    deliveryRateVersion: rates.version,
    address: {
      recipientName: 'Gift recipient',
      phone: '9822222222',
      province: 'Bagmati',
      district: 'Kathmandu',
      municipality: 'Kathmandu',
      locality: 'Gift locality',
    },
  };
}
void test('email-only release policy places a real COD order without SMS proof while default policy remains strict', async () => {
  const { createCodOrder } = await import('../lib/db/repositories/orders');
  const f = fixture();
  try {
    const input = await realCart(f);
    f.sqlite.exec("DELETE FROM account_phone_verifications WHERE user_id='buyer'");
    await assert.rejects(
      createCodOrder(f.db, 'cart', 'receipt', input, 1000, 'buyer'),
      /verify.*phone/i,
    );
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM orders').get()?.n, 0);
    const placed = await createCodOrder(
      f.db, 'cart', 'receipt', input, 1000, 'buyer', undefined, 'email_only',
    );
    assert.equal(placed.grandTotalPaisa, 25000);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM orders').get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM account_phone_verifications WHERE user_id='buyer'").get()?.n, 0);
  } finally {
    f.sqlite.close();
  }
});
void test('verified gift checkout creates one order; identical retry remains available after contact changes', async () => {
  const { createCodOrder } = await import('../lib/db/repositories/orders');
  const f = fixture();
  try {
    const input = await realCart(f);
    const placed = await createCodOrder(
      f.db,
      'cart',
      'receipt',
      input,
      1000,
      'buyer',
    );
    assert.equal(placed.grandTotalPaisa, 25000);
    const notifications = f.sqlite
      .prepare(
        "SELECT template_key,subject_en,body_en FROM notification_messages WHERE recipient_user_id='buyer' AND audience_role='customer'",
      )
      .all();
    assert.equal(notifications.length, 3);
    for (const notification of notifications) {
      assert.equal(notification.template_key, 'order.received');
      assert.equal(notification.subject_en, 'Order received');
      assert.match(
        String(notification.body_en),
        /received.*confirmation and delivery progress/,
      );
    }
    f.sqlite.exec("UPDATE users SET phone='9833333333' WHERE id='buyer'");
    assert.deepEqual(
      await createCodOrder(f.db, 'cart', 'receipt', input, 1001, 'buyer'),
      placed,
    );
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM orders').get()?.n,
      1,
    );
    const row = f.sqlite
      .prepare('SELECT customer_phone,shipping_address_json FROM orders')
      .get()!;
    assert.equal(row.customer_phone, '9811111111');
    assert.equal(
      JSON.parse(String(row.shipping_address_json)).phone,
      '9822222222',
    );
  } finally {
    f.sqlite.close();
  }
});
void test('actual order insertion rolls back if proof disappears between reading and committing', async () => {
  const { createCodOrder } = await import('../lib/db/repositories/orders');
  const f = fixture();
  try {
    const input = await realCart(f);
    f.race(() =>
      f.sqlite.exec(
        "DELETE FROM account_phone_verifications WHERE user_id='buyer'",
      ),
    );
    await assert.rejects(
      createCodOrder(f.db, 'cart', 'receipt', input, 1000, 'buyer'),
      /changed|verify|contact|Availability/i,
    );
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM orders').get()?.n,
      0,
    );
    assert.equal(
      f.sqlite.prepare('SELECT inventory_quantity FROM products').get()
        ?.inventory_quantity,
      100,
    );
    assert.equal(
      f.sqlite.prepare('SELECT count(*) AS n FROM cart_items').get()?.n,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});
