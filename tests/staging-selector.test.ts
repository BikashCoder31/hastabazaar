import assert from 'node:assert/strict';
import test from 'node:test';

async function validator() {
  const implementation = await import(new URL('../scripts/deployment/staging-selector.mjs', import.meta.url).href).catch(() => ({}));
  assert.equal(typeof implementation.assertStagingSelectorConfiguration, 'function', 'staging selector validation must be implemented');
  return implementation.assertStagingSelectorConfiguration;
}

const runtime = { APP_ORIGIN: 'https://staging.hastabazaar.com', DB_NAME: 'hastabaz_staging', DB_PASSWORD: 'fictional-staging-password' };
function fixture(version = '22.23.3') {
  return { result: 'success', available_versions: {
    '16.20.2': {}, '18.20.8': {}, '20.20.2': {},
    [version]: { users: { hastabaz: { applications: { 'hastabazaar-staging-app': {
      domain: 'staging.hastabazaar.com', startup_file: 'app.cjs',
      env_vars: Object.fromEntries(Object.entries(runtime).map(([key, value]) => [key, { value }])),
    } } } } },
  } };
}
// Mutable records allow malformed-fixture coverage without weakening production types.
const record = (value: unknown) => value as Record<string, unknown>;
const versions = (state: ReturnType<typeof fixture>) => record(state.available_versions);
const versionInventory = (state: ReturnType<typeof fixture>, version = '22.23.3') => record(versions(state)[version]);
const users = (state: ReturnType<typeof fixture>, version = '22.23.3') => record(versionInventory(state, version).users);
const account = (state: ReturnType<typeof fixture>, version = '22.23.3') => record(users(state, version).hastabaz);
const applications = (state: ReturnType<typeof fixture>, version = '22.23.3') => record(account(state, version).applications);
const app = (state: ReturnType<typeof fixture>, version = '22.23.3') => record(applications(state, version)['hastabazaar-staging-app']);
const environment = (state: ReturnType<typeof fixture>) => record(app(state).env_vars);

void test('staging selector accepts the observed host patch and exact running Node22 patch updates', async () => {
  const validate = await validator();
  for (const version of ['22.23.3', '22.23.2', '22.24.0']) {
    const state = fixture(version);
    assert.equal(validate(state, version, runtime), app(state, version));
    app(state, version).env_vars = { ...runtime };
    assert.equal(validate(state, version, runtime), app(state, version), 'string environment values remain supported');
  }
});

void test('staging selector refuses missing exact versions and any unknown or non-Node22 running version', async () => {
  const validate = await validator();
  assert.throws(() => validate(fixture(), '22.23.2', runtime), /exact running Node version/i);
  for (const version of ['20.20.2', '23.0.0', '22', '22.23', 'v22.23.3', '22.23.3-beta', '22.023.3', '', undefined]) {
    assert.throws(() => validate(fixture(), version, runtime), /Node22 version/i);
  }
});

void test('staging selector requires a successful structured inventory', async () => {
  const validate = await validator();
  for (const state of [null, [], {}, { result: 'error', available_versions: fixture().available_versions },
    { result: 'success' }, { result: 'success', available_versions: null }, { result: 'success', available_versions: [] }]) {
    assert.throws(() => validate(state, '22.23.3', runtime), /selector|inventory/i);
  }
  const malformed = fixture();
  versions(malformed)['22.23.3'] = null;
  assert.throws(() => validate(malformed, '22.23.3', runtime), /selector|inventory/i);
});

void test('staging selector requires the exact staging user and application root', async () => {
  const validate = await validator();
  for (const mutate of [
    (state: ReturnType<typeof fixture>) => { versionInventory(state).users = {}; },
    (state: ReturnType<typeof fixture>) => { versionInventory(state).users = { other: users(state).hastabaz }; },
    (state: ReturnType<typeof fixture>) => { account(state).applications = {}; },
    (state: ReturnType<typeof fixture>) => { account(state).applications = { 'hastabazaar-production-app': app(state) }; },
  ]) {
    const state = fixture(); mutate(state);
    assert.throws(() => validate(state, '22.23.3', runtime), /staging user|staging application/i);
  }
});

void test('staging selector never accepts changed domain, startup or environment bindings', async () => {
  const validate = await validator();
  for (const mutate of [
    (state: ReturnType<typeof fixture>) => { app(state).domain = 'hastabazaar.com'; },
    (state: ReturnType<typeof fixture>) => { app(state).startup_file = 'other.cjs'; },
    (state: ReturnType<typeof fixture>) => { environment(state).DB_NAME = { value: 'hastabaz_live' }; },
    (state: ReturnType<typeof fixture>) => { delete environment(state).DB_PASSWORD; },
    (state: ReturnType<typeof fixture>) => { environment(state).PAYMENT_API_KEY = { value: 'fictional-forbidden-key' }; },
  ]) {
    const state = fixture(); mutate(state);
    assert.throws(() => validate(state, '22.23.3', runtime), /domain|startup|environment/i);
  }
});

void test('staging selector matches the approved sender settings without exposing a mismatched value', async () => {
  const validate = await validator();
  const state = fixture();
  const approved = {
    ...runtime,
    ORDER_EMAIL_JOB_SECRET: 'fictional-staging-email-secret-0123456789',
    EMAIL_AUTOMATION_EXPECTED_SINCE: '1795000000000',
  };
  app(state).env_vars = { ...approved };
  assert.equal(validate(state, '22.23.3', approved), app(state));
  assert.throws(() => validate(state, '22.23.3', runtime), { message: 'Passenger environment differs from approved staging bindings.' });
  environment(state).ORDER_EMAIL_JOB_SECRET = 'fictional-unapproved-secret-0123456789';
  assert.throws(() => validate(state, '22.23.3', approved), { message: 'Passenger environment differs from approved staging bindings.' });
  app(state).env_vars = { ...approved, EMAIL_AUTOMATION_EXPECTED_SINCE: '1795000000001' };
  assert.throws(() => validate(state, '22.23.3', approved), { message: 'Passenger environment differs from approved staging bindings.' });
});

void test('staging selector compares the pricing setting with the exact approved string', async () => {
  const validate = await validator();
  const state = fixture();
  const approved = { ...runtime, HASTABAZAAR_VARIANT_PRICING: 'on' };
  environment(state).HASTABAZAAR_VARIANT_PRICING = { value: 'on' };
  assert.equal(validate(state, '22.23.3', approved), app(state));
  for (const value of ['off', 'ON', 'on ']) {
    environment(state).HASTABAZAAR_VARIANT_PRICING = { value };
    assert.throws(() => validate(state, '22.23.3', approved), /Passenger environment differs/);
  }
  delete environment(state).HASTABAZAAR_VARIANT_PRICING;
  assert.throws(() => validate(state, '22.23.3', approved), /Passenger environment differs/);
});

void test('staging selector rejects ambiguous staging applications across versions instead of selecting a first match', async () => {
  const validate = await validator();
  const state = fixture();
  versions(state)['22.23.2'] = structuredClone(versions(state)['22.23.3']);
  assert.throws(() => validate(state, '22.23.3', runtime), /ambiguous/i);
  versions(state)['20.20.2'] = versions(state)['22.23.2'];
  delete versions(state)['22.23.2'];
  assert.throws(() => validate(state, '22.23.3', runtime), /ambiguous/i);
});

void test('staging selector rejects malformed nested data without exposing environment secrets', async () => {
  const validate = await validator();
  for (const mutate of [
    (state: ReturnType<typeof fixture>) => { versionInventory(state).users = null; },
    (state: ReturnType<typeof fixture>) => { users(state).hastabaz = []; },
    (state: ReturnType<typeof fixture>) => { account(state).applications = null; },
    (state: ReturnType<typeof fixture>) => { applications(state)['hastabazaar-staging-app'] = null; },
    (state: ReturnType<typeof fixture>) => { app(state).env_vars = null; },
    (state: ReturnType<typeof fixture>) => { environment(state).DB_PASSWORD = { value: 123 }; },
    (state: ReturnType<typeof fixture>) => { environment(state).DB_PASSWORD = { value: 'must-not-appear-in-error' }; },
    (state: ReturnType<typeof fixture>) => { versions(state)['20.20.2'] = { users: [] }; },
  ]) {
    const state = fixture(); mutate(state);
    assert.throws(() => validate(state, '22.23.3', runtime), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /selector|inventory|staging|environment/i);
      assert.doesNotMatch(error.message, /must-not-appear-in-error|fictional-staging-password/);
      return true;
    });
  }
});
