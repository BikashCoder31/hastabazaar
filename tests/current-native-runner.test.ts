import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { currentNativePlan, reviewedSchema, safeEnvironment, sqlStatements } from '../scripts/testing/verify-current-native.mjs';
import * as runner from '../scripts/testing/verify-current-native.mjs';

void test('cleanup refuses replaced containers, remote context and changed ownership contracts', () => {
  const owner = { id: 'c'.repeat(64), name: 'hastabazaar-native-123', token: 'random-run-token', endpoint: 'unix:///var/run/docker.sock' };
  const context = { Endpoints: { docker: { Host: owner.endpoint } } };
  const container: { Id: string; Name: string; Config: { Image: string; Labels: Record<string, string> }; HostConfig: { PortBindings: Record<string, { HostIp: string; HostPort: string }[]> }; Mounts: { Type: string }[] } = { Id: owner.id, Name: '/' + owner.name, Config: { Image: 'mariadb:10.11', Labels: { 'codex.scope': 'staging-native-compatibility', 'codex.native-owner': owner.token } }, HostConfig: { PortBindings: { '3306/tcp': [{ HostIp: '127.0.0.1', HostPort: '13329' }] } }, Mounts: [] };
  runner.attestCleanup(context, container, owner);
  for (const mutate of [
    (c: typeof container) => { c.Id = 'd'.repeat(64); },
    (c: typeof container) => { c.Name = '/unknown'; },
    (c: typeof container) => { c.Config.Labels['codex.native-owner'] = 'foreign'; },
    (c: typeof container) => { c.Config.Image = 'mariadb:latest'; },
    (c: typeof container) => { c.HostConfig.PortBindings['3306/tcp'][0].HostIp = '0.0.0.0'; },
    (c: typeof container) => { c.Mounts = [{ Type: 'bind' }]; },
  ]) { const changed = structuredClone(container); mutate(changed); assert.throws(() => runner.attestCleanup(context, changed, owner)); }
  assert.throws(() => runner.attestCleanup({ Endpoints: { docker: { Host: 'tcp://remote' } } }, container, owner));
});

void test('receipt failure retains original failure after cleanup and cancellation still stops owned container', async () => {
  let stopped = false;
  await assert.rejects(runner.ownedLifecycle({
    start: async () => 'e'.repeat(64), persist: async () => {},
    work: async () => { throw new Error('Native run cancelled: STOP file'); }, close: async () => {},
    attest: async () => {}, stop: async () => { stopped = true; },
    receipt: async () => { throw new Error('disk full'); },
  }), /cancelled:[\s\S]*receipt:[\s\S]*disk full/);
  assert.equal(stopped, true);
});

void test('marker write failure still stops independently attested owned ID and records failure', async () => {
  const events: string[] = []; let receipt: { stopped: boolean; failure: string | null; cleanupErrors: string[] } | undefined;
  await assert.rejects(runner.ownedLifecycle({
    start: async () => 'a'.repeat(64),
    persist: async () => { throw new Error('marker write failed'); },
    work: async () => { events.push('work'); },
    close: async () => { events.push('close'); },
    attest: async (id: string) => { assert.equal(id, 'a'.repeat(64)); events.push('attest'); },
    stop: async (id: string) => { assert.equal(id, 'a'.repeat(64)); events.push('stop'); },
    receipt: async (value: { stopped: boolean; failure: string | null; cleanupErrors: string[] }) => { receipt = value; },
  }), /marker write failed/);
  assert.deepEqual(events, ['close', 'attest', 'stop']);
  assert.ok(receipt); assert.equal(receipt.stopped, true); assert.match(receipt.failure ?? '', /marker write failed/);
});

for (const stage of ['attest', 'stop', 'close']) void test(`cleanup ${stage} failure still writes receipt`, async () => {
  let receipt: { stopped: boolean; failure: string | null; cleanupErrors: string[] } | undefined; let stopped = false;
  await assert.rejects(runner.ownedLifecycle({
    start: async () => 'b'.repeat(64), persist: async () => {}, work: async () => {},
    close: async () => { if (stage === 'close') throw new Error(stage); },
    attest: async () => { if (stage === 'attest') throw new Error(stage); },
    stop: async () => { if (stage === 'stop') throw new Error(stage); stopped = true; },
    receipt: async (value: { stopped: boolean; failure: string | null; cleanupErrors: string[] }) => { receipt = value; },
  }));
  assert.equal(stopped, stage === 'close');
  assert.ok(receipt); assert.ok(receipt.cleanupErrors.some((e: string) => e.includes(stage)));
});

void test('cooperative cancellation prevents subsequent work and disposes signal handlers', async () => {
  const { EventEmitter } = await import('node:events');
  const signals = new EventEmitter(); let requested = false;
  // The injected signal source uses only on/off; the JS default infers the full process type.
  const cooperativeCancellation = runner.cooperativeCancellation as (options: { signals: Pick<typeof signals, 'on' | 'off'>; requested: () => Promise<boolean> }) => ReturnType<typeof runner.cooperativeCancellation>;
  const cancel = cooperativeCancellation({ signals, requested: async () => requested });
  await cancel.checkpoint(); requested = true;
  await assert.rejects(cancel.checkpoint(), /cancelled/);
  cancel.dispose(); assert.equal(signals.listenerCount('SIGINT'), 0);
  const signalCancel = cooperativeCancellation({ signals, requested: async () => false });
  signals.emit('SIGTERM'); await assert.rejects(signalCancel.checkpoint(), /SIGTERM/);
  signalCancel.dispose(); assert.equal(signals.listenerCount('SIGTERM'), 0);
});

void test('current native runner rejects unreviewed source and retains exact bounded targets', async () => {
  // Implicit health-table columns must match the generated schema's explicit
  // unicode_ci governance foreign keys; general_ci fails before tests execute.
  const runnerSource = await readFile('scripts/testing/verify-current-native.mjs', 'utf8');
  assert.match(runnerSource, /CREATE DATABASE[^\n]+CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/);
  const file = 'tests/helpers/form-health-native-scenarios.ts';
  const bytes = await readFile(file);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(await reviewedSchema(file, hash), new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes));
  await assert.rejects(reviewedSchema(file, '0'.repeat(64)), /bytes changed/);
  await assert.rejects(reviewedSchema(file, undefined), /SHA256/);
  await assert.rejects(reviewedSchema('../outside.sql', hash));
  assert.deepEqual(currentNativePlan, [
    { file: 'tests/customer-fee-native.test.ts', expected: 29 },
    ...['catchup', 'rollback', 'repair'].map(scenario => ({ file: 'tests/form-health-maria-native.test.ts', expected: 1, scenario })),
  ]);
  assert.deepEqual(sqlStatements('CREATE TABLE t(id INT);\nDELIMITER $$\nCREATE TRIGGER example BEFORE INSERT ON t FOR EACH ROW BEGIN\nSET NEW.id=1;\nEND$$\nDELIMITER ;\n'), ['CREATE TABLE t(id INT)', 'CREATE TRIGGER example BEFORE INSERT ON t FOR EACH ROW BEGIN\nSET NEW.id=1;\nEND']);
  assert.throws(() => sqlStatements('SELECT 1'), /Incomplete/);
  const env: Record<string, string | undefined> = safeEnvironment({ PATH: 'known', DB_HOST: 'remote', NODE_OPTIONS: '--require unsafe', SMTP_PASSWORD: 'secret', HASTABAZAAR_RUNTIME_ENV: 'production' });
  assert.equal(env.PATH, 'known');
  for (const key of ['DB_HOST', 'NODE_OPTIONS', 'SMTP_PASSWORD']) assert.equal(env[key], undefined);
  assert.equal(env.HASTABAZAAR_RUNTIME_ENV, 'local_staging');
  assert.equal(env.HASTABAZAAR_PAYMENT_MODE, 'simulated');
  assert.equal(env.HASTABAZAAR_MAIL_MODE, 'capture');
});

void test('unserializable thrown values cannot prevent owned cleanup receipts', async () => {
  for (const failure of [{ [Symbol.toPrimitive]() { throw new Error('hostile primitive conversion'); } }, new Proxy({}, { get() { throw new Error('hostile getter'); } })]) {
    let stopped = false; let recorded = false;
    await assert.rejects(runner.ownedLifecycle({
      start: async () => 'f'.repeat(64), persist: async () => {},
      work: async () => { throw failure; }, close: async () => {}, attest: async () => {},
      stop: async () => { stopped = true; }, receipt: async () => { recorded = true; },
    }), /Unserializable failure/);
    assert.equal(stopped, true); assert.equal(recorded, true);
  }
});
