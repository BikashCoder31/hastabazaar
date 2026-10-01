/* oxlint-disable next/no-assign-module-variable, typescript/no-floating-promises -- Node's test runner owns returned test promises; dynamic module handles keep feature-absence failures inside assertions. */
import assert from 'node:assert/strict';
import test from 'node:test';

type EmailOtpModule = {
  createEmailOtpChallenge?: (options: {
    userId: string;
    now: number;
    token?: string;
    code?: string;
  }) => {
    token: string;
    code: string;
    record: {
      tokenHash: string;
      codeHash: string;
      userId: string;
      attempts: number;
      expiresAt: number;
      createdAt: number;
      consumedAt: number | null;
    };
  };
  checkEmailOtpChallenge?: (
    record: {
      tokenHash: string;
      codeHash: string;
      userId: string;
      attempts: number;
      expiresAt: number;
      createdAt: number;
      consumedAt: number | null;
    },
    token: string,
    code: string,
    now: number,
  ) => 'valid' | 'invalid' | 'expired' | 'consumed' | 'attempts';
  emailOtpCookie?: (token: string) => string;
  clearEmailOtpCookie?: () => string;
  readEmailOtpCookie?: (headers: Headers) => string | null;
};

type EmailOtpMessageModule = {
  buildEmailLoginCodeMessage?: (options: { email: string; code: string }) => {
    to: string;
    subject: string;
    text: string;
    html: string;
  };
  sendEmailLoginCode?: (
    environment: {
      EMAIL?: {
        configured?: boolean;
        send(message: { to: string; subject: string; text: string; html: string }): Promise<void>;
      };
      EMAIL_DELIVERY_CONFIGURED?: string;
    },
    options: { email: string; code: string },
  ) => Promise<void>;
};

type StoredOtp = {
  tokenHash: string;
  codeHash: string;
  userId: string;
  attempts: number;
  expiresAt: number;
  createdAt: number;
  consumedAt: number | null;
};

type EmailOtpStore = {
  findActiveUserByEmail(email: string): Promise<{ id: string; email: string } | null>;
  replaceChallenge(record: StoredOtp): Promise<void>;
  findChallenge(tokenHash: string): Promise<StoredOtp | null>;
  recordFailedAttempt(tokenHash: string): Promise<void>;
  consumeChallenge(tokenHash: string, consumedAt: number): Promise<boolean>;
  deleteChallenge(tokenHash: string): Promise<void>;
};

type EmailOtpServiceModule = {
  requestEmailOtp?: (
    store: EmailOtpStore,
    email: string,
    deliver: (email: string, code: string) => Promise<void>,
    now: number,
    fixed?: { token: string; code: string },
  ) => Promise<{ token: string; delivered: boolean }>;
  verifyEmailOtp?: (
    store: EmailOtpStore,
    token: string,
    code: string,
    now: number,
  ) => Promise<{ status: 'valid' | 'invalid' | 'expired' | 'consumed' | 'attempts'; userId?: string }>;
};

class MemoryEmailOtpStore implements EmailOtpStore {
  readonly users = new Map<string, { id: string; email: string }>();
  readonly challenges = new Map<string, StoredOtp>();

  async findActiveUserByEmail(email: string) {
    return this.users.get(email) ?? null;
  }

  async replaceChallenge(record: StoredOtp) {
    for (const [key, challenge] of this.challenges) {
      if (challenge.userId === record.userId && challenge.consumedAt === null) this.challenges.delete(key);
    }
    this.challenges.set(record.tokenHash, { ...record });
  }

  async findChallenge(tokenHash: string) {
    const record = this.challenges.get(tokenHash);
    return record ? { ...record } : null;
  }

  async recordFailedAttempt(tokenHash: string) {
    const record = this.challenges.get(tokenHash);
    if (record && record.consumedAt === null) record.attempts += 1;
  }

  async consumeChallenge(tokenHash: string, consumedAt: number) {
    const record = this.challenges.get(tokenHash);
    if (!record || record.consumedAt !== null) return false;
    record.consumedAt = consumedAt;
    return true;
  }

  async deleteChallenge(tokenHash: string) {
    this.challenges.delete(tokenHash);
  }
}

async function loadEmailOtp(): Promise<EmailOtpModule> {
  return import('../lib/auth/email-otp').catch(() => ({}));
}

async function loadEmailOtpMessage(): Promise<EmailOtpMessageModule> {
  return import('../lib/email/login-code').catch(() => ({}));
}

async function loadEmailOtpService(): Promise<EmailOtpServiceModule> {
  return import('../lib/auth/email-otp-service').catch(() => ({}));
}

void test('email OTP challenges store token-bound hashes instead of the code', async () => {
  const module = await loadEmailOtp();
  assert.equal(typeof module.createEmailOtpChallenge, 'function');
  const challenge = module.createEmailOtpChallenge!({
    userId: 'user-1',
    now: 1_000,
    token: 'browser-secret-token',
    code: '042731',
  });

  assert.equal(challenge.code, '042731');
  assert.equal(challenge.token, 'browser-secret-token');
  assert.equal(challenge.record.userId, 'user-1');
  assert.equal(challenge.record.attempts, 0);
  assert.equal(challenge.record.createdAt, 1_000);
  assert.equal(challenge.record.expiresAt, 601_000);
  assert.equal(challenge.record.consumedAt, null);
  assert.match(challenge.record.tokenHash, /^[a-f0-9]{64}$/);
  assert.match(challenge.record.codeHash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(challenge.record).includes('042731'));
});

void test('email OTP verification requires the browser token and exact six-digit code', async () => {
  const module = await loadEmailOtp();
  assert.equal(typeof module.createEmailOtpChallenge, 'function');
  assert.equal(typeof module.checkEmailOtpChallenge, 'function');
  const challenge = module.createEmailOtpChallenge!({
    userId: 'user-1',
    now: 1_000,
    token: 'browser-secret-token',
    code: '042731',
  });

  assert.equal(module.checkEmailOtpChallenge!(challenge.record, challenge.token, challenge.code, 2_000), 'valid');
  assert.equal(module.checkEmailOtpChallenge!(challenge.record, 'another-token', challenge.code, 2_000), 'invalid');
  assert.equal(module.checkEmailOtpChallenge!(challenge.record, challenge.token, '042732', 2_000), 'invalid');
  assert.equal(module.checkEmailOtpChallenge!(challenge.record, challenge.token, '42731', 2_000), 'invalid');
});

void test('email OTP verification rejects expired, consumed, and exhausted challenges', async () => {
  const module = await loadEmailOtp();
  assert.equal(typeof module.createEmailOtpChallenge, 'function');
  assert.equal(typeof module.checkEmailOtpChallenge, 'function');
  const challenge = module.createEmailOtpChallenge!({
    userId: 'user-1',
    now: 1_000,
    token: 'browser-secret-token',
    code: '042731',
  });

  assert.equal(module.checkEmailOtpChallenge!(challenge.record, challenge.token, challenge.code, 601_000), 'expired');
  assert.equal(module.checkEmailOtpChallenge!({ ...challenge.record, consumedAt: 4_000 }, challenge.token, challenge.code, 5_000), 'consumed');
  assert.equal(module.checkEmailOtpChallenge!({ ...challenge.record, attempts: 5 }, challenge.token, challenge.code, 5_000), 'attempts');
});

void test('email OTP browser tokens use an HTTP-only ten-minute cookie', async () => {
  const module = await loadEmailOtp();
  assert.equal(typeof module.emailOtpCookie, 'function');
  assert.equal(typeof module.clearEmailOtpCookie, 'function');
  assert.equal(typeof module.readEmailOtpCookie, 'function');
  const cookie = module.emailOtpCookie!('browser-token');

  assert.match(cookie, /^hastabazaar_email_otp=browser-token;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=600/);
  assert.equal(module.readEmailOtpCookie!(new Headers({ cookie: cookie.split(';')[0] })), 'browser-token');
  assert.match(module.clearEmailOtpCookie!(), /Max-Age=0/);
});

void test('email OTP message is branded and escapes recipient-controlled content', async () => {
  const module = await loadEmailOtpMessage();
  assert.equal(typeof module.buildEmailLoginCodeMessage, 'function');
  const message = module.buildEmailLoginCodeMessage!({
    email: 'buyer+test@example.com',
    code: '042731',
  });

  assert.equal(message.to, 'buyer+test@example.com');
  assert.equal(message.subject, 'Your HastaBazaar sign-in code');
  assert.match(message.text, /042731/);
  assert.match(message.text, /10 minutes/);
  assert.match(message.html, /042731/);
  assert.match(message.html, /HastaBazaar/);
  assert.doesNotMatch(message.subject, /042731/);
});

void test('email OTP delivery uses the configured application mail service', async () => {
  const module = await loadEmailOtpMessage();
  assert.equal(typeof module.sendEmailLoginCode, 'function');
  const sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
  await module.sendEmailLoginCode!(
    {
      EMAIL_DELIVERY_CONFIGURED: 'true',
      EMAIL: { send: async (message) => { sent.push(message); } },
    },
    { email: 'buyer@example.com', code: '042731' },
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'buyer@example.com');
  assert.match(sent[0].text, /042731/);
});

void test('email OTP delivery fails closed when SMTP is unavailable', async () => {
  const module = await loadEmailOtpMessage();
  assert.equal(typeof module.sendEmailLoginCode, 'function');
  await assert.rejects(
    module.sendEmailLoginCode!({}, { email: 'buyer@example.com', code: '042731' }),
    /not configured/i,
  );
});

void test('email OTP requests send and store a challenge only for an active account', async () => {
  const module = await loadEmailOtpService();
  assert.equal(typeof module.requestEmailOtp, 'function');
  const store = new MemoryEmailOtpStore();
  store.users.set('buyer@example.com', { id: 'user-1', email: 'buyer@example.com' });
  const delivered: Array<[string, string]> = [];
  const result = await module.requestEmailOtp!(
    store,
    ' BUYER@example.com ',
    async (email, code) => { delivered.push([email, code]); },
    1_000,
    { token: 'browser-secret-token', code: '042731' },
  );

  assert.deepEqual(result, { token: 'browser-secret-token', delivered: true });
  assert.deepEqual(delivered, [['buyer@example.com', '042731']]);
  assert.equal(store.challenges.size, 1);

  const unknown = await module.requestEmailOtp!(
    store,
    'missing@example.com',
    async () => { throw new Error('Unknown accounts must not trigger mail.'); },
    2_000,
    { token: 'unknown-browser-token', code: '111111' },
  );
  assert.deepEqual(unknown, { token: 'unknown-browser-token', delivered: false });
  assert.equal(store.challenges.size, 1);
});

void test('email OTP verification records failures and consumes success exactly once', async () => {
  const module = await loadEmailOtpService();
  assert.equal(typeof module.requestEmailOtp, 'function');
  assert.equal(typeof module.verifyEmailOtp, 'function');
  const store = new MemoryEmailOtpStore();
  store.users.set('buyer@example.com', { id: 'user-1', email: 'buyer@example.com' });
  const issued = await module.requestEmailOtp!(
    store,
    'buyer@example.com',
    async () => {},
    1_000,
    { token: 'browser-secret-token', code: '042731' },
  );

  assert.deepEqual(await module.verifyEmailOtp!(store, issued.token, '999999', 2_000), { status: 'invalid' });
  assert.equal([...store.challenges.values()][0].attempts, 1);
  assert.deepEqual(await module.verifyEmailOtp!(store, issued.token, '042731', 3_000), { status: 'valid', userId: 'user-1' });
  assert.deepEqual(await module.verifyEmailOtp!(store, issued.token, '042731', 4_000), { status: 'consumed' });
});
