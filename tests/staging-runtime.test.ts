import assert from 'node:assert/strict';
import test from 'node:test';

async function policy() {
  const implementation = await import(new URL('../scripts/deployment/staging-runtime.mjs', import.meta.url).href).catch(() => ({}));
  assert.equal(typeof implementation.assertStagingRuntime, 'function', 'staging runtime validation must be implemented');
  return implementation.assertStagingRuntime;
}

const base = {
  APP_ORIGIN: 'https://staging.hastabazaar.com', AUTH_PROVIDER: 'email',
  CHECKOUT_CONTACT_POLICY: 'email_only', DB_HOST: 'localhost', DB_NAME: 'hastabaz_staging',
  DB_PASSWORD: 'fictional-database-password', DB_POOL_SIZE: '1', DB_PORT: '3306', DB_USER: 'hastabaz_stageapp',
  MEDIA_ROOT: '/home2/hastabaz/hastabazaar-staging-private-media', EMAIL_DELIVERY_CONFIGURED: 'false',
  HASTABAZAAR_RUNTIME_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=192',
  HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 66).toString('base64url'),
  HASTABAZAAR_SECURITY_POLICY_ROOT: '/home2/hastabaz/hastabazaar-staging-security',
};
const recipients = ['qa-staging', 'qa-staging+buyer', 'qa-staging+seller', 'qa-staging+maker',
  'qa-staging+rider', 'qa-staging+admin', 'qa-staging+superadmin'].map((name) => `${name}@hastabazaar.com`);
const email = {
  ...base, EMAIL_DELIVERY_CONFIGURED: 'true', SMTP_HOST: 'mail.hastabazaar.com', SMTP_PORT: '465',
  SMTP_USER: 'qa-staging@hastabazaar.com', SMTP_PASSWORD: 'fictional-qa-mailbox-password',
  EMAIL_FROM: 'Hastabazaar Staging <qa-staging@hastabazaar.com>', SMTP_RECIPIENT_ALLOWLIST: JSON.stringify(recipients),
  HASTABAZAAR_STAGING_ADMIN_EMAIL: 'qa-staging+admin@hastabazaar.com',
  HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL: 'qa-staging+superadmin@hastabazaar.com',
};

void test('staging deployment accepts disabled email or the complete fixed QA mail configuration', async () => {
  const validate = await policy();
  assert.doesNotThrow(() => validate(base));
  assert.doesNotThrow(() => validate(email));
});

void test('staging accepts the owner’s optional pricing setting alongside either approved email mode', async () => {
  const validate = await policy();
  for (const runtime of [base, email]) {
    for (const value of ['on', 'off', '', 'ON', 'on ']) {
      assert.doesNotThrow(() => validate({ ...runtime, HASTABAZAAR_VARIANT_PRICING: value }));
    }
    assert.throws(() => validate({ ...runtime, HASTABAZAAR_VARIANT_PRICING: true }),
      /Invalid staging HASTABAZAAR_VARIANT_PRICING/);
  }
});

const sender = {
  ORDER_EMAIL_JOB_SECRET: Buffer.alloc(32, 37).toString('base64url'),
  EMAIL_AUTOMATION_EXPECTED_SINCE: '1700000000000',
};

void test('staging deployment accepts the sender settings with the exact QA mail configuration', async () => {
  const validate = await policy();
  assert.doesNotThrow(() => validate({ ...email, ...sender }));
  assert.throws(() => validate({ ...base, ...sender }), /Unapproved staging runtime binding/);
  assert.throws(() => validate({ ...email, ...sender, EMAIL_WATCHDOG_SECRET: 'fictional-watchdog-secret' }),
    /Unapproved staging runtime binding/);
});

void test('staging deployment requires both sender settings and safe formats without printing their values', async () => {
  const validate = await policy();
  assert.throws(() => validate({ ...email, ORDER_EMAIL_JOB_SECRET: sender.ORDER_EMAIL_JOB_SECRET }),
    /Both staging email sender settings are required/);
  assert.throws(() => validate({ ...email, EMAIL_AUTOMATION_EXPECTED_SINCE: sender.EMAIL_AUTOMATION_EXPECTED_SINCE }),
    /Both staging email sender settings are required/);
  for (const value of ['', 5, 'x'.repeat(31), 'x'.repeat(513), `${sender.ORDER_EMAIL_JOB_SECRET}\n`, 'fictional invalid secret with spaces']) {
    assert.throws(() => validate({ ...email, ...sender, ORDER_EMAIL_JOB_SECRET: value }), error => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'Invalid staging email sender secret.');
      return true;
    });
  }
  for (const value of ['', '0', '-1', '1e3', '2026-11-24', 1700000000000, '9007199254740992', String(Date.now() + 60_000)]) {
    assert.throws(() => validate({ ...email, ...sender, EMAIL_AUTOMATION_EXPECTED_SINCE: value }),
      { message: 'Invalid staging email sender enablement time.' });
  }
});

void test('staging deployment rejects changed database, origin, media and local-testing bindings', async () => {
  const validate = await policy();
  for (const [key, value] of Object.entries({ DB_NAME: 'hastabaz_live', DB_USER: 'hastabaz_liveapp',
    APP_ORIGIN: 'https://hastabazaar.com', MEDIA_ROOT: '/home2/hastabaz/private-media',
    HASTABAZAAR_RUNTIME_ENV: 'local_staging', DB_POOL_SIZE: '10' })) {
    assert.throws(() => validate({ ...email, [key]: value }), Error, key);
  }
});

void test('hosted security requires a canonical key and dedicated external policy root', async () => {
  const validate = await policy();
  for (const changes of [{ HASTABAZAAR_SECURITY_KEY: '' }, { HASTABAZAAR_SECURITY_KEY: 'invalid' },
    { HASTABAZAAR_SECURITY_KEY: Buffer.alloc(16).toString('base64url') },
    { HASTABAZAAR_SECURITY_POLICY_ROOT: '' }, { HASTABAZAAR_SECURITY_POLICY_ROOT: base.MEDIA_ROOT },
    { HASTABAZAAR_SECURITY_POLICY_ROOT: '/home2/hastabaz/release/security' }]) {
    assert.throws(() => validate({ ...base, ...changes }));
  }
});

void test('staging deployment cannot widen QA recipients or reuse production providers and staff identities', async () => {
  const validate = await policy();
  for (const [key, value] of Object.entries({
    SMTP_RECIPIENT_ALLOWLIST: JSON.stringify([...recipients, 'customer@example.test']),
    SMTP_USER: 'no-reply@hastabazaar.com', SMTP_HOST: 'external.example.test', SMTP_PORT: '25',
    EMAIL_FROM: 'no-reply@hastabazaar.com', HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL: 'owner@example.test',
    GOOGLE_CLIENT_SECRET: 'forbidden', PAYMENT_API_KEY: 'forbidden', SMTP_TLS_VERIFY: 'false',
    HASTABAZAAR_SUPER_ADMIN_EMAIL: 'owner@example.test',
  })) assert.throws(() => validate({ ...email, [key]: value }), Error, key);
  for (const key of ['SMTP_PASSWORD', 'SMTP_RECIPIENT_ALLOWLIST', 'HASTABAZAAR_STAGING_ADMIN_EMAIL']) {
    const incomplete = { ...email } as Record<string, string>;
    delete incomplete[key];
    assert.throws(() => validate(incomplete), Error, key);
  }
  assert.throws(() => validate({ ...email, EMAIL_DELIVERY_CONFIGURED: 'false' }));
});
