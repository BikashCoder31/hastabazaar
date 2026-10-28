import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccountingQuery } from '../lib/accounting/filters';
void test('Accounting projection is JSON safe, keeps source positions separate and does not invent profit', async () => {
  const projection = await import('../lib/accounting/projection').catch(
    () => null,
  );
  assert.ok(projection, 'Accounting projection must exist');
  const query = parseAccountingQuery(
    new URLSearchParams(),
    Date.parse('2026-10-18T00:00:00Z'),
  );
  const bundle = {
    observedAt: 1,
    environment: 'local_staging',
    metrics: [],
    rows: [],
    issues: [],
    nextCursor: null,
    coverage: [],
  };
  const result = projection.projectAccounting(bundle, query);
  assert.deepEqual(result.query, query);
  assert.equal(JSON.parse(JSON.stringify(result)).environment, 'local_staging');
  assert.ok(!result.metrics.some((m) => m.key === 'total_revenue'));
  assert.deepEqual(bundle.metrics, []);
});
