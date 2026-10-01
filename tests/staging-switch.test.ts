import assert from 'node:assert/strict';
import test from 'node:test';

void test('staging cancellation before switching never activates or rolls back', async () => {
  const { guardedStagingSwitch } = await import('../scripts/deployment/staging-switch.mjs');
  const controller = new AbortController();
  controller.abort(new Error('expired'));
  const calls: string[] = [];
  await assert.rejects(guardedStagingSwitch({ activate: async () => { calls.push('activate'); },
    verify: async () => { calls.push('verify'); }, rollback: async () => { calls.push('rollback'); } }, controller.signal));
  assert.deepEqual(calls, []);
});

void test('staging cancellation after switching restores the previous application', async () => {
  const { guardedStagingSwitch } = await import('../scripts/deployment/staging-switch.mjs');
  const controller = new AbortController();
  const calls: string[] = [];
  await assert.rejects(guardedStagingSwitch({ activate: async () => { calls.push('activate'); controller.abort(new Error('expired')); },
    verify: async () => { calls.push('verify'); }, rollback: async () => { calls.push('rollback'); } }, controller.signal));
  assert.deepEqual(calls, ['activate', 'rollback']);
});

void test('staging verification failure restores code, while successful verification leaves it active', async () => {
  const { guardedStagingSwitch } = await import('../scripts/deployment/staging-switch.mjs');
  const calls: string[] = [];
  const operations = { activate: async () => { calls.push('activate'); },
    verify: async () => { calls.push('verify'); throw new Error('unhealthy'); }, rollback: async () => { calls.push('rollback'); } };
  await assert.rejects(guardedStagingSwitch(operations, new AbortController().signal));
  assert.deepEqual(calls, ['activate', 'verify', 'rollback']);
});
