import test from 'node:test';
import { historicalCommissionDatabase } from './helpers/commission-database';
import { assertBillingProductWorkflow } from './helpers/billing-workflow-scenario';

void test('real product submissions preserve dual SKUs through revision, checkout and delivery snapshots', async () => {
  const fixture=await historicalCommissionDatabase(true);
  try { await assertBillingProductWorkflow(fixture.database); }
  finally { await fixture.dispose(); }
});
