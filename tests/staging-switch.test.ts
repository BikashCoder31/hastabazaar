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

void test('staging phase timings report duration and outcome without logging the result or error', async () => {
  const { createStagingPhaseTimer } = await import('../scripts/deployment/staging-switch.mjs');
  const records: unknown[] = [];
  let now = 100;
  const timePhase = createStagingPhaseTimer(record => records.push(record), () => now);
  const result = { privateValue: 'fixture-result' };
  const failure = new Error('fixture-error');

  assert.equal(await timePhase('upload', async () => { now += 23; return result; }), result);
  await assert.rejects(timePhase('readiness', async () => { now += 18; throw failure; }), error => error === failure);
  assert.deepEqual(records, [
    { event: 'staging_phase', phase: 'upload', elapsedMs: 23, outcome: 'success' },
    { event: 'staging_phase', phase: 'readiness', elapsedMs: 18, outcome: 'failure' },
  ]);
});

void test('a failed timing log cannot mask deployment success or change the error used by rollback', async () => {
  const { createStagingPhaseTimer } = await import('../scripts/deployment/staging-switch.mjs');
  const timePhase = createStagingPhaseTimer(() => { throw new Error('log unavailable'); });
  const failure = new Error('readiness timed out');

  assert.equal(await timePhase('activate', async () => 'done'), 'done');
  await assert.rejects(timePhase('readiness', async () => { throw failure; }), error => error === failure);
});
