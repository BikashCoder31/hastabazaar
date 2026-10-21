import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stagingNativeUpgrade } from '../scripts/staging-native-upgrade.mjs';

void test('reviewed native delta can select only the missing fee companion without replaying historical maintenance', async () => {
  const project = fileURLToPath(new URL('../', import.meta.url));
  const selected = await stagingNativeUpgrade(project, ['mariadb-marketplace-fee-waivers.sql']);
  assert.deepEqual(selected.steps.map(step => step.name), ['mariadb-marketplace-fee-waivers.sql']);
  assert.equal(selected.steps[0].sql, (await readFile(new URL('../deployment/babal/mariadb-marketplace-fee-waivers.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n').trim() + '\n');
  await assert.rejects(stagingNativeUpgrade(project, ['mariadb-schema.sql']));
  await assert.rejects(stagingNativeUpgrade(project, ['mariadb-marketplace-fee-waivers.sql', 'mariadb-marketplace-fee-waivers.sql']));
});
