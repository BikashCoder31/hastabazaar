import assert from 'node:assert/strict';
import test from 'node:test';

import { assertDisposableStagingContext } from '../scripts/staging/guards.mjs';
import { runManagedMakerDemo } from '../scripts/staging/managed-maker-demo-fixture.mjs';

void test('deterministic staging journey reconciles 9% platform retention and 91% maker entitlement', async () => {
  const result = await runManagedMakerDemo();
  assert.equal(result.eligibleBasePaisa, 100_000);
  assert.equal(result.platformRetentionBps, 900);
  assert.equal(result.platformRetainedPaisa, 9_000);
  assert.equal(result.makerEntitlementPaisa, 91_000);
  assert.equal(result.platformRetainedPaisa + result.makerEntitlementPaisa, result.eligibleBasePaisa);
  assert.equal(result.earned, 1);
  assert.equal(result.duplicateEarned, 0);
  assert.equal(result.invoiceCount, 1);
  assert.equal(result.financeBeforePayout.eligiblePaisa, 91_000);
  assert.equal(result.financeAfterPayout.paidPaisa, 91_000);
  assert.equal(result.financeAfterPayout.balancePaisa, 0);
  assert.equal(result.payout.status, 'paid');
  assert.match(result.payout.simulationLabel, /NOT VALID FOR PRODUCTION/);
  assert.match(result.invoice.simulationLabel, /NOT VALID FOR PRODUCTION/);
  assert.deepEqual(result.journeyEvents, [
    'application_submitted', 'application_reviewed', 'product_approved', 'order_formed',
    'rider_assigned', 'whole_parcel_inspected', 'parcel_otp_verified',
    'customer_payment_recorded', 'parcel_delivered', 'rider_remittance_submitted',
    'rider_remittance_reconciled',
  ]);
});

void test('the staging demonstration refuses production and remote-capable bindings', () => {
  assert.throws(() => assertDisposableStagingContext({
    HASTABAZAAR_RUNTIME_ENV: 'production',
    APP_ORIGIN: 'https://hastabazaar.com',
  }), /simulat|local_staging/i);
  assert.throws(() => assertDisposableStagingContext({
    HASTABAZAAR_RUNTIME_ENV: 'local_staging',
    NODE_ENV: 'development',
    APP_ORIGIN: 'http://localhost:3000',
    HASTABAZAAR_MAIL_MODE: 'capture',
    HASTABAZAAR_PAYMENT_MODE: 'simulated',
    HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test',
    DB_HOST: 'remote.example.invalid',
  }), /DB_HOST must be absent/);
});
