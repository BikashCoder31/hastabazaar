import assert from 'node:assert/strict';
import test from 'node:test';

void test('restart fallback selects only owned fixed-directory LiteSpeed staging workers', async () => {
  const { selectStagingWorkers } = await import('../scripts/deployment/staging-workers.mjs');
  const stage = { pid: 101, uid: 1001, effectiveUid: 1001, command: 'lsnode:/home2/h',
    cwd: '/home2/hastabaz/hastabazaar-staging-app', startTime: '12345' };
  assert.deepEqual(selectStagingWorkers([
    stage,
    { ...stage, pid: 102, cwd: '/home2/hastabaz/hastabazaar-app' },
    { ...stage, pid: 103, cwd: '/home2/hastabaz/hastabazaar-staging-releases/old' },
    { ...stage, pid: 104, uid: 2000 },
    { ...stage, pid: 105, effectiveUid: 0 },
    { ...stage, pid: 106, command: 'node' },
    { ...stage, pid: 0 },
    { ...stage, pid: 107, startTime: '' },
  ], 1001), [stage]);
});

void test('an exited or reused staging PID is not signaled through a numeric fallback', async () => {
  const { stopCapturedStagingWorkers } = await import('../scripts/deployment/staging-workers.mjs');
  const original = { pid: 101, uid: 1001, effectiveUid: 1001, command: 'lsnode:/home2/h',
    cwd: '/home2/hastabaz/hastabazaar-staging-app', startTime: '12345' };
  let received;
  await stopCapturedStagingWorkers([original], undefined, {
    uid: 1001,
    stop: async (identity) => { received = identity; return 'changed'; },
    inspect: async () => { throw new Error('A changed identity must not be polled or signaled again.'); },
  });
  assert.deepEqual(received, original);
});

void test('unavailable race-safe signaling fails closed without a kill fallback', async () => {
  const { stopCapturedStagingWorkers } = await import('../scripts/deployment/staging-workers.mjs');
  const original = { pid: 101, uid: 1001, effectiveUid: 1001, command: 'lsnode:/home2/h',
    cwd: '/home2/hastabaz/hastabazaar-staging-app', startTime: '12345' };
  await assert.rejects(stopCapturedStagingWorkers([original], undefined, {
    uid: 1001, stop: async () => { throw new Error('pidfd unavailable'); },
    inspect: async () => { throw new Error('No numeric fallback is allowed.'); },
  }), /pidfd unavailable/);
});

void test('Linux race-safe helper supports a harmless own-process signal probe', { skip: process.platform !== 'linux' }, async () => {
  const { probeStagingPidfds } = await import('../scripts/deployment/staging-workers.mjs');
  await probeStagingPidfds();
});
