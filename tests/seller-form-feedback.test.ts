import assert from 'node:assert/strict';
import test from 'node:test';
import { submissionFeedback } from '../components/forms/form-config-client';

void test('contact and other domain conflicts do not claim the form publication changed', () => {
  for (const code of [undefined, 'contact_verification_required', 'phone_mismatch', 'request_id_conflict', 'terms_changed']) {
    assert.equal(submissionFeedback(409, code).stale, false, String(code));
  }
});

void test('only an explicit stale publication conflict asks for a form refresh', () => {
  assert.equal(submissionFeedback(409, 'stale_version').stale, true);
  assert.equal(submissionFeedback(503, 'stale_version').stale, false);
});
