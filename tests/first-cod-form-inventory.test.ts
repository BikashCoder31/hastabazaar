import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { FormValidationError, validateFormDraft } from '../lib/forms/validation';
import { collectFormSites, scanFormSites } from './helpers/form-policy';

const root = resolve(import.meta.dirname, '..');
const formId = 'staff.first-cod-confirmation';
const sourcePath = 'components/admin/first-cod-confirmation.tsx';

void test('first COD confirmation is discovered and accepted by the strict form inventory', async () => {
  const sites = (await collectFormSites(root)).filter((site) => site.path === sourcePath);
  assert.equal(sites.length, 1);
  assert.deepEqual(sites[0].formIds, [formId]);
  assert.deepEqual((await scanFormSites(root)).filter((site) => site.path === sourcePath), []);
});

void test('first COD confirmation binds its existing staff operation without generic answer recording', () => {
  const definition = FORM_REGISTRY[formId];
  assert.ok(definition, 'Existing COD confirmation must have an explicit form contract');
  assert.equal(definition.audience, 'staff');
  assert.equal(definition.mode, 'operation');
  assert.equal(definition.route, '/api/admin/orders/:id/first-cod-confirmation');
  assert.equal(definition.adapterId, formId);
  assert.deepEqual(IMPLEMENTED_FORM_ADAPTERS[formId], {
    formId, route: '/api/admin/orders/:id/first-cod-confirmation', mode: 'operation',
  });
  assert.equal(definition.capabilities.answerBehavior, 'none');
  assert.deepEqual(definition.capabilities.customFieldTypes, []);
  for (const key of ['orderId', 'reason', 'requestId', 'actorId']) {
    assert.equal(definition.baseFields.find((field) => field.key === key)?.capability, 'protected', key);
  }
  assert.ok(definition.baseFields.every((field) => field.capability === 'protected'));
});

void test('first COD confirmation rejects configurable reason, authority, money and additional context', () => {
  assert.deepEqual(validateFormDraft(formId, { formId, fields: [] }), { formId, fields: [] });
  for (const key of ['reason', 'request_id', 'actor_id', 'order_id', 'total_paisa', 'status', 'extra_context']) {
    for (const type of ['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone']) {
      assert.throws(() => validateFormDraft(formId, { formId, fields: [{
        id: key, key, type, label: 'Override', required: false, status: 'active', order: 0,
        ...(type === 'single_choice' || type === 'multiple_choice'
          ? { choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } : {}),
      }] }), (error: unknown) => error instanceof FormValidationError && error.code === 'invalid_draft', `${key}: ${type}`);
    }
  }
});
