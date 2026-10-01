import assert from 'node:assert/strict';

const fixed = {
  APP_ORIGIN: 'https://staging.hastabazaar.com', AUTH_PROVIDER: 'email',
  CHECKOUT_CONTACT_POLICY: 'email_only', DB_HOST: 'localhost', DB_NAME: 'hastabaz_staging',
  DB_POOL_SIZE: '1', DB_PORT: '3306', DB_USER: 'hastabaz_stageapp',
  MEDIA_ROOT: '/home2/hastabaz/hastabazaar-staging-private-media',
  HASTABAZAAR_RUNTIME_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=192',
};
const qa = {
  SMTP_HOST: 'mail.hastabazaar.com', SMTP_PORT: '465',
  SMTP_USER: 'qa-staging@hastabazaar.com',
  EMAIL_FROM: 'Hastabazaar Staging <qa-staging@hastabazaar.com>',
  HASTABAZAAR_STAGING_ADMIN_EMAIL: 'qa-staging+admin@hastabazaar.com',
  HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL: 'qa-staging+superadmin@hastabazaar.com',
};
const recipients = ['qa-staging', 'qa-staging+buyer', 'qa-staging+seller', 'qa-staging+maker',
  'qa-staging+rider', 'qa-staging+admin', 'qa-staging+superadmin'].map((name) => `${name}@hastabazaar.com`);

export function assertStagingRuntime(runtime) {
  for (const [key, value] of Object.entries(fixed)) assert.equal(runtime[key], value, `Invalid staging ${key}.`);
  assert.ok(typeof runtime.DB_PASSWORD === 'string' && runtime.DB_PASSWORD.length > 0, 'Staging database password is missing.');
  assert.ok(['false', 'true'].includes(runtime.EMAIL_DELIVERY_CONFIGURED), 'Invalid staging email mode.');
  const enabled = runtime.EMAIL_DELIVERY_CONFIGURED === 'true';
  const allowed = new Set([...Object.keys(fixed), 'DB_PASSWORD', 'EMAIL_DELIVERY_CONFIGURED',
    ...(enabled ? [...Object.keys(qa), 'SMTP_PASSWORD', 'SMTP_RECIPIENT_ALLOWLIST'] : [])]);
  assert.ok(Object.keys(runtime).every((key) => allowed.has(key)), 'Unapproved staging runtime binding.');
  if (!enabled) return;
  for (const [key, value] of Object.entries(qa)) assert.equal(runtime[key], value, `Invalid QA ${key}.`);
  assert.ok(typeof runtime.SMTP_PASSWORD === 'string' && runtime.SMTP_PASSWORD.length >= 16, 'QA mailbox password is missing.');
  assert.deepEqual(JSON.parse(runtime.SMTP_RECIPIENT_ALLOWLIST), recipients, 'Staging email recipients must be exactly the approved QA addresses.');
}
