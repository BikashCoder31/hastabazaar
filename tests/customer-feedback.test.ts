import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCustomerFeedbackEmail,
  validateCustomerFeedback,
} from '../lib/feedback/customer-feedback';

function validForm(): FormData {
  const form = new FormData();
  form.set('name', 'Asha Rai');
  form.set('email', 'ASHA@example.com');
  form.set('topic', 'Product information');
  form.set('orderReference', 'HB-1234');
  form.set('message', 'Is this product available in another colour?');
  form.set('pagePath', '/products/example');
  form.set('privacyAcknowledgement', 'accepted');
  return form;
}

void test('customer feedback accepts and normalizes a complete query', () => {
  const result = validateCustomerFeedback(validForm());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.feedback.email, 'asha@example.com');
  assert.equal(result.feedback.pagePath, '/products/example');
});

void test('customer feedback requires consent and bounded message content', () => {
  const missingConsent = validForm();
  missingConsent.delete('privacyAcknowledgement');
  assert.deepEqual(validateCustomerFeedback(missingConsent), {
    ok: false,
    error: 'Confirm that we may use these details to respond to your query.',
  });

  const longMessage = validForm();
  longMessage.set('message', 'x'.repeat(2_001));
  assert.equal(validateCustomerFeedback(longMessage).ok, false);
});

void test('customer feedback rejects unknown topics and unsafe page paths', () => {
  const unknownTopic = validForm();
  unknownTopic.set('topic', 'Urgent admin request');
  assert.equal(validateCustomerFeedback(unknownTopic).ok, false);

  const unsafePath = validForm();
  unsafePath.set('pagePath', 'https://example.com/?token=secret');
  const result = validateCustomerFeedback(unsafePath);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.feedback.pagePath, '/');
});

void test('feedback email escapes customer-controlled HTML', () => {
  const result = validateCustomerFeedback(validForm());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  result.feedback.message = '<script>alert("x")</script>';
  const message = createCustomerFeedbackEmail(
    result.feedback,
    new Date('2026-09-17T00:00:00Z'),
  );
  assert.match(message.subject, /^\[Hastabazaar query\]/);
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.text, /<script>alert\("x"\)<\/script>/);
});
