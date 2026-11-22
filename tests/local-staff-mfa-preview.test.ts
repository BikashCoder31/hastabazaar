import assert from 'node:assert/strict';
import test from 'node:test';
import { skipsLocalTestStaffMfa } from '../lib/security/local-simulation';
import { localPreviewBindings } from '../lib/staging/local-preview-bindings';

const bindings = {
  HASTABAZAAR_RUNTIME_ENV: 'local_staging',
  HASTABAZAAR_LOCAL_SKIP_STAFF_MFA: '1',
};
const account = {
  authSubject: 'local-test-super-admin',
  email: 'superadmin@local.hastabazaar.test',
  role: 'super_admin',
};

void test('the flag accepts only the existing Super Admin fixture on a loopback host', () => {
  for (const host of ['localhost:3018', '127.0.0.1:3018', '[::1]:3018', '::1']) {
    assert.equal(skipsLocalTestStaffMfa(bindings, host, account), true);
  }
  assert.equal(skipsLocalTestStaffMfa({ ...bindings, HASTABAZAAR_LOCAL_SKIP_STAFF_MFA: '0' }, 'localhost', account), false);
  assert.equal(skipsLocalTestStaffMfa({ ...bindings, HASTABAZAAR_RUNTIME_ENV: 'production' }, 'localhost', account), false);
  assert.equal(skipsLocalTestStaffMfa(bindings, 'localhost.example.test', account), false);
  assert.equal(skipsLocalTestStaffMfa(bindings, '127.0.0.1@example.test', account), false);
  assert.equal(skipsLocalTestStaffMfa(bindings, 'localhost', { ...account, email: 'owner@hastabazaar.com' }), false);
  assert.equal(skipsLocalTestStaffMfa(bindings, 'localhost', { ...account, authSubject: 'another-staff-account' }), false);
  assert.equal(skipsLocalTestStaffMfa(bindings, 'localhost', { ...account, role: 'admin' }), false);
});

void test('NODE_ENV production disables the fixture even when local variables are inherited', () => {
  const environment: Record<string, string | undefined> = process.env;
  const before = environment.NODE_ENV;
  environment.NODE_ENV = 'production';
  try {
    assert.equal(skipsLocalTestStaffMfa(bindings, 'localhost', account), false);
  } finally {
    if (before === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = before;
  }
});

void test('the Worker flag is forwarded as an opt-in only during checked local development', () => {
  const environment = { ...bindings, NODE_ENV: 'development', APP_ORIGIN: 'http://localhost:3018' };
  assert.equal(localPreviewBindings(environment, 'serve').HASTABAZAAR_LOCAL_SKIP_STAFF_MFA, '1');
  assert.equal(localPreviewBindings(environment, 'build').HASTABAZAAR_LOCAL_SKIP_STAFF_MFA, undefined);
  assert.equal(localPreviewBindings({ ...environment, HASTABAZAAR_RUNTIME_ENV: 'production' }, 'serve').HASTABAZAAR_LOCAL_SKIP_STAFF_MFA, undefined);
});
