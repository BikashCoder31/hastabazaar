import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBusinessEmail } from '../lib/operations/business-notifications';
import { emailPreviewGroups, renderEmailPreview } from '../lib/email/preview-fixtures';

const origin = 'https://preview.example.test';

void test('the 17 preview templates use one escaped, bilingual-friendly email layout', () => {
  const entries = emailPreviewGroups.flatMap(group => group.entries);
  assert.equal(entries.length, 17);
  assert.equal(new Set(entries.map(entry => entry.id)).size, 17);
  for (const [groupIndex, group] of emailPreviewGroups.entries()) {
    for (const entry of group.entries) {
      const message = renderEmailPreview(entry, origin);
      const separators = Buffer.from(message.subject).toString('hex').match(/20c2b720/g) ?? [];
      assert.equal(separators.length, 2, entry.id);
      assert.ok(message.subject.startsWith('Hastabazaar · '), entry.id);
      assert.doesNotMatch(message.subject, /Â/);
      assert.equal((message.html.match(/<a href=/g) ?? []).length, 1, entry.id);
      assert.match(message.html, /<table role="presentation"/, entry.id);
      assert.match(message.html, /<meta charset="UTF-8"/, entry.id);
      assert.match(message.text, /https:\/\/preview\.example\.test\//, entry.id);
      assert.match(message.text, /support@hastabazaar\.com/, entry.id);
      assert.match(message.text, /Your turn|Seller|Courier|Hastabazaar|Done/, entry.id);
      if (groupIndex === 2) {
        assert.match(message.html, /lang="ne"/, entry.id);
        assert.match(message.text, /[\u0900-\u097f]/, entry.id);
      }
    }
  }
});

void test('bank email uses its saved deadline and describes only a released payment as received', () => {
  const base = {
    template: 'business.payment.order', email: 'buyer@example.test', audience: 'customer',
    subject: 'Bank payment instructions ready', body: 'Your bank details are ready.',
    relatedId: 'stored-order-1', relatedType: 'order_payment', orderNumber: 'HB-STORED',
    amountPaisa: 372950, issuedAt: Date.UTC(2026, 10, 21, 9), deadlineAt: Date.UTC(2026, 10, 22, 3),
  };
  const instructions = buildBusinessEmail(base, origin);
  assert.equal(instructions.subject, 'Hastabazaar · Pay within 18 hours · HB-STORED');
  assert.match(instructions.text, /NPR 3,729\.50/);
  assert.match(instructions.text, /\/account\/payments\/stored-order-1/);
  const held = buildBusinessEmail({ ...base, subject: 'Payment verified', released: false }, origin);
  assert.doesNotMatch(held.subject, /Payment received/);
  assert.match(held.text, /after release/);
  const released = buildBusinessEmail({ ...base, subject: 'Payment received', released: true }, origin);
  assert.equal(released.subject, 'Hastabazaar · Payment received · HB-STORED');
  assert.match(released.text, /\/orders\/HB-STORED/);
});

void test('layout preserves saved Nepali text, escapes record fields and uses one exact case link', () => {
  const message = buildBusinessEmail({
    template: 'business.order.preparation_update', email: 'buyer@example.test', audience: 'customer',
    relatedType: 'order_response_event', relatedId: 'saved-event', orderNumber: 'HB-RECORD',
    subject: 'We are checking your order preparation', body: 'Saved question.',
    question: { id: 'saved-case', sellerName: '<script>bad</script>', itemNames: '<em>example</em>', readyAt: Date.UTC(2026, 10, 25) },
  }, origin);
  assert.doesNotMatch(message.html, /<script>|<em>example<\/em>/);
  assert.match(message.html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(message.text, /\/account\/order-responses\/saved-case/);
  assert.equal((message.html.match(/<a href=/g) ?? []).length, 1);

  const seller = buildBusinessEmail({
    email: 'seller@example.test', audience: 'seller', relatedType: 'order', relatedId: 'saved-order',
    subject: 'Order status changed', subjectNe: 'अर्डर अपडेट', body: 'Review the order.', bodyNe: 'अर्डर हेर्नुहोस्।',
  }, origin);
  assert.match(seller.html, /अर्डर हेर्नुहोस्।/);
  assert.match(seller.text, /अर्डर हेर्नुहोस्।/);
  assert.equal((seller.html.match(/<a href=/g) ?? []).length, 1);
});
