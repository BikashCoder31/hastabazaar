import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncentiveDb } from './helpers/incentive-db';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { formHealthNativeScenario } from './helpers/form-health-native-scenarios';

for (const engine of ['memory', 'D1'] as const) {
  for (const scenario of ['catchup', 'rollback', 'repair'] as const) {
    void test(`${engine} final form-health incident evidence: ${scenario}`, async () => {
      const fixture = engine === 'D1' ? await createIncentiveDb() : await incentiveReportDatabase();
      try {
        await formHealthNativeScenario(fixture.db, scenario);
        assert.equal((await fixture.db.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>())!.foreign_keys, 1);
        assert.deepEqual((await fixture.db.prepare('PRAGMA foreign_key_check').all()).results, []);
      } finally { await fixture.dispose(); }
    });
  }
}
