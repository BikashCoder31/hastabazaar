import assert from 'node:assert/strict';
import test from 'node:test';
import { feeWaiverFixture, feeWaiverContext } from './helpers/fee-waiver-fixture';
import { mutateCustomerFeeWaiver } from '../lib/db/repositories/customer-fee-waivers';
import { nepalDateTimeInput, parseNepalDateTime } from '../lib/commission/rates';
import { commissionDate } from '../lib/commission/reporting';

// Last millisecond whose Nepal editor value has a four-digit year (9999).
const upper = 253402280099999;
for (const invalid of [-1, upper + 1, 8640000000000000, Number.MAX_SAFE_INTEGER])
  void test(`customer create/revise refuses unrenderable Nepal campaign instant ${invalid} before writes`, async () => {
    const f = await feeWaiverFixture();
    try {
      const context = feeWaiverContext('bounds-valid', 0);
      const valid = { name: 'Displayable interval', description: '', startsAt: 0, endsAt: upper };
      const campaign = await mutateCustomerFeeWaiver(f.database, context, { type: 'create', terms: valid });
      const snapshot = () => JSON.stringify(['customer_fee_waiver_control', 'customer_fee_waiver_campaigns', 'customer_fee_waiver_revisions',
        'customer_fee_waiver_requests', 'audit_logs', 'staff_permission_guards'].map(table => f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()));
      const before = snapshot();
      for (const field of ['startsAt', 'endsAt'] as const) for (const type of ['create', 'revise'] as const) {
        await assert.rejects(mutateCustomerFeeWaiver(f.database, { ...context, expectedRevision: 1, requestId: `bounds-${type}-${field}` },
          type === 'create' ? { type, terms: { ...valid, [field]: invalid } } : { type, campaignId: campaign.id, terms: { ...valid, [field]: invalid } }),
        { code: 'invalid' });
        assert.equal(snapshot(), before, 'No control/revision/receipt/audit write on invalid input');
      }
    } finally { await f.dispose(); }
  });

void test('lower, upper and minute boundary campaign instants remain displayable and editable without changing saved milliseconds', async () => {
  const f = await feeWaiverFixture();
  try {
    let revision = 0;
    for (const [startsAt, endsAt] of [[0, 1], [0, 60000], [upper - 60000, upper], [0, upper]]) {
      const saved = await mutateCustomerFeeWaiver(f.database, feeWaiverContext('valid-' + revision, revision), {
        type: 'create', terms: { name: 'Valid bounds', description: '', startsAt, endsAt } });
      revision++;
      for (const at of [saved.startsAt, saved.endsAt]) {
        assert.match(nepalDateTimeInput(at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
        assert.doesNotThrow(() => commissionDate(at));
        assert.equal(nepalDateTimeInput(parseNepalDateTime(nepalDateTimeInput(at))), nepalDateTimeInput(at));
      }
      assert.equal(saved.startsAt, startsAt); assert.equal(saved.endsAt, endsAt);
    }
  } finally { await f.dispose(); }
});
