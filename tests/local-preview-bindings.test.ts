import assert from 'node:assert/strict';
import test from 'node:test';
import { localPreviewBindings } from '../lib/staging/local-preview-bindings';
void test('only explicit local serve exposes allowlisted simulation bindings', () => {
 const env = {HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'http://localhost:4173',NODE_ENV:'development',DB_PASSWORD:'never-forward'};
 assert.deepEqual(localPreviewBindings(env,'serve'),{HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'http://localhost:4173'});
 assert.deepEqual(localPreviewBindings(env,'build'),{});
 assert.deepEqual(localPreviewBindings({...env,HASTABAZAAR_RUNTIME_ENV:undefined},'serve'),{});
 assert.deepEqual(localPreviewBindings({...env,HASTABAZAAR_RUNTIME_ENV:'production'},'serve'),{});
 assert.throws(()=>localPreviewBindings({...env,APP_ORIGIN:'https://hastabazaar.com'},'serve'));
 assert.throws(()=>localPreviewBindings({...env,NODE_ENV:'production'},'serve'));
 assert.throws(()=>localPreviewBindings({...env,DEPLOY_TARGET:'babal'},'serve'));
});
void test('explicit email-only preview policy reaches checkout without exposing credentials or hosted bindings', () => {
 const environment = { HASTABAZAAR_RUNTIME_ENV: 'local_staging', APP_ORIGIN: 'http://127.0.0.1:4317',
  CHECKOUT_CONTACT_POLICY: 'email_only', SMS_PASSWORD: 'never-forward' };
 assert.deepEqual(localPreviewBindings(environment, 'serve'), {
  HASTABAZAAR_RUNTIME_ENV: 'local_staging', APP_ORIGIN: 'http://127.0.0.1:4317', CHECKOUT_CONTACT_POLICY: 'email_only',
 });
 assert.deepEqual(localPreviewBindings(environment, 'build'), {});
 assert.equal(localPreviewBindings({ ...environment, CHECKOUT_CONTACT_POLICY: 'disabled' }, 'serve').CHECKOUT_CONTACT_POLICY, undefined);
});
