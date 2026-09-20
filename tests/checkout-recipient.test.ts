import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseCheckoutInput } from '../lib/checkout/validation';

function validInput() {
  return {
    customerEmail: 'buyer@example.test',
    customerPhone: '9811111111',
    deliveryFor: 'self',
    locale: 'en-NP',
    termsAccepted: true,
    idempotencyKey: crypto.randomUUID(),
    address: {
      recipientName: 'Maya Buyer',
      phone: '9811111111',
      province: 'Bagmati',
      district: 'Kathmandu',
      municipality: 'Kathmandu',
      locality: 'Test locality',
    },
  };
}

void test('another-person checkout accepts an optional delivery-only email', () => {
  const parsed = parseCheckoutInput({
    ...validInput(),
    deliveryFor: 'other',
    recipientEmail: ' RECIPIENT@example.test ',
  });
  assert.equal(parsed.value?.deliveryFor, 'other');
  assert.equal(parsed.value?.recipientEmail, 'recipient@example.test');
  assert.equal(
    parseCheckoutInput({
      ...validInput(),
      deliveryFor: 'other',
      recipientEmail: 'not-an-email',
    }).value,
    undefined,
  );
});

void test('self delivery discards a forged recipient email and save intent is explicit', () => {
  const self = parseCheckoutInput({
    ...validInput(),
    recipientEmail: 'attacker@example.test',
  });
  assert.ok(self.value);
  assert.equal(self.value.recipientEmail, undefined);

  const missingLabel = parseCheckoutInput({
    ...validInput(),
    saveAddressForFuture: true,
  });
  assert.equal(missingLabel.value, undefined);
  assert.match(missingLabel.errors.join(' '), /label/i);

  const oneOrderEdit = parseCheckoutInput({
    ...validInput(),
    selectedAddressId: 'saved-address',
    saveAddressForFuture: true,
    saveAddressLabel: 'Duplicate',
  });
  assert.equal(oneOrderEdit.value, undefined);
  assert.match(oneOrderEdit.errors.join(' '), /one-order edit/i);
});

void test('recipient snapshots are additive and destination changes invalidate outstanding OTPs', async () => {
  const [sqliteMigration, mariaMigration] = await Promise.all([
    readFile(new URL('../drizzle/0048_checkout_recipient_snapshots.sql', import.meta.url), 'utf8'),
    readFile(new URL('../deployment/babal/mariadb-checkout-recipient-snapshots.sql', import.meta.url), 'utf8'),
  ]);
  for (const source of [sqliteMigration, mariaMigration]) {
    assert.match(source, /recipient_email/);
    assert.match(source, /source_address_id/);
    assert.match(source, /invalidate_delivery_otp_after_destination_change/);
    assert.match(source, /DELETE FROM [`]?rider_otp_challenges/i);
  }
  assert.doesNotMatch(sqliteMigration, /DROP TABLE/i);
});
