import assert from 'node:assert/strict';
import test from 'node:test';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { validateFormDraft } from '../lib/forms/validation';
void test('Native workspace forms reject additional financial or authorization questions', () => {
  for (const id of [
    'staff.referral-report-filter',
    'staff.promo-report-filter',
    'staff.loyalty-report-filter',
    'staff.commission-report-filter',
    'staff.commission-schedule',
    'staff.commission-cancel',
  ]) {
    assert.ok(FORM_REGISTRY[id], `${id} must declare its real native controls`);
    assert.deepEqual(validateFormDraft(id, { formId: id, fields: [] }), {
      formId: id,
      fields: [],
    });
    assert.throws(() =>
      validateFormDraft(id, {
        formId: id,
        fields: [
          {
            id: 'amount_override',
            key: 'amount_override',
            type: 'number',
            label: 'Amount override',
            required: true,
            status: 'active',
            order: 0,
          },
        ],
      }),
    );
  }
});

void test('Weekly reward amounts, grace and cycle decisions cannot become custom financial questions', () => {
  for (const key of [
    'weekly_points',
    'grace_enabled',
    'reward_mode',
    'cycle_day',
    'cycle_number',
    'grace_used',
    'grace_applied',
    'cycle_reset_reason',
    'last_claim_date',
  ]) {
    assert.throws(
      () =>
        validateFormDraft('staff.loyalty-settings', {
          formId: 'staff.loyalty-settings',
          fields: [
            {
              id: key,
              key,
              type: 'number',
              label: 'Override',
              required: false,
              status: 'active',
              order: 0,
            },
          ],
        }),
      key + ' must remain server enforced',
    );
  }
});
