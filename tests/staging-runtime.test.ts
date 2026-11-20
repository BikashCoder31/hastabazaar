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
