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
