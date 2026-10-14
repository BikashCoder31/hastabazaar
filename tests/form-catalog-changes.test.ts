import assert from 'node:assert/strict';
import test from 'node:test';
import { formChangeSummary } from '../lib/forms/catalog-changes';
import type { ConfiguredField } from '../lib/forms/types';

const question: ConfiguredField = { id: 'contact_time', key: 'contact_time', type: 'short_text', label: 'Contact time', required: false, status: 'active', order: 0 };
void test('publishing review calls out new required questions, changed wording and hidden questions', () => {
  const changed = formChangeSummary([question], [{ ...question, label: 'Best time to contact you', required: true }]);
  assert.equal(changed.length, 2);
  assert.ok(changed.some(line => /required/.test(line)));
  assert.ok(changed.some(line => /wording/.test(line)));
  const added = formChangeSummary([], [{ ...question, required: true }]);
  assert.equal(added.length, 1);
  assert.match(added[0], /required question/);
  const hidden = formChangeSummary([question], [{ ...question, status: 'archived' }]);
  assert.equal(hidden.length, 1);
  assert.match(hidden[0], /Hide/);
  assert.equal(question.required, false);
  assert.equal(question.status, 'active');
});
void test('publishing review distinguishes unchanged questions from removed settings', () => {
  assert.deepEqual(formChangeSummary([question], [{ ...question }]), []);
  assert.equal(formChangeSummary([question], []).length, 1);
  assert.deepEqual(formChangeSummary([], [{ ...question, status: 'archived' }]), []);
});
