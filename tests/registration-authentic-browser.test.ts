import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOriginalRows, registrationTables, retainRegistrationMedia } from '../scripts/testing/registration-browser-fixture.mjs';

void test('registration preservation permits appends but refuses removal, replacement and duplicate loss', () => {
  assertOriginalRows(['old', 'old'], ['new', 'old', 'old']);
  for (const after of [[], ['old'], ['old', 'replacement']]) assert.throws(() => assertOriginalRows(['old', 'old'], after));
  assert.equal(new Set(registrationTables).size, registrationTables.length);
  assert.ok(!registrationTables.includes('orders' as typeof registrationTables[number]));
});

void test('registration media transfer refuses canonical and arbitrary environment destinations before copying', async () => {
  const priorMode = process.env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE, priorMedia = process.env.MEDIA_ROOT;
  try {
    process.env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE = '1'; process.env.MEDIA_ROOT = process.cwd();
    await assert.rejects(retainRegistrationMedia(process.cwd(), process.cwd(), ['private/fictional'], 'a'.repeat(64)), /did not match/);
    process.env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE = '0';
    await assert.rejects(retainRegistrationMedia(process.cwd(), process.cwd(), ['private/fictional'], 'a'.repeat(64)));
  } finally {
    if (priorMode === undefined) delete process.env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE; else process.env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE = priorMode;
    if (priorMedia === undefined) delete process.env.MEDIA_ROOT; else process.env.MEDIA_ROOT = priorMedia;
  }
});
