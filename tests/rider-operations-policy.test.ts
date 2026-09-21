import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addKathmanduBusinessDays,
  calculateRiderCashExposure,
  evaluateOpenBoxEligibility,
  riderCompensationForOutcome,
  type RiderFinancePolicy,
} from '../lib/riders/operations-policy';

const financePolicy: RiderFinancePolicy = {
  cashExposureLimitPaisa: 250_000,
  operatingWeekdays: [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
  ],
  holidayDates: [],
  remittanceCutoffLocalTime: '17:00',
  completedTripPaisa: 10_000,
  failedTripPaisa: 5_000,
  returnTripPaisa: 7_500,
  receivingAccountLabel: 'SIMULATED CASH DESK — NO REAL FUNDS',
};

void test('cash exposure combines held cash, active COD assignments, and the proposed parcel', () => {
  assert.deepEqual(
    calculateRiderCashExposure({
      heldPaisa: 40_000,
      assignedUncollectedPaisa: 60_000,
      proposedCodPaisa: 100_000,
      limitPaisa: 250_000,
    }),
    {
      heldPaisa: 40_000,
      assignedUncollectedPaisa: 60_000,
      proposedCodPaisa: 100_000,
      totalPaisa: 200_000,
      limitPaisa: 250_000,
      permitted: true,
    },
  );
  assert.equal(
    calculateRiderCashExposure({
      heldPaisa: 90_000,
      assignedUncollectedPaisa: 80_000,
      proposedCodPaisa: 100_000,
      limitPaisa: 250_000,
    }).permitted,
    false,
  );
});

void test('open-box requires an eligible product, configured area, and trained rider', () => {
  assert.deepEqual(
    evaluateOpenBoxEligibility({
      productCodes: ['pottery', 'clay'],
      serviceAreaCode: 'kathmandu',
      configuredProductCodes: ['clay'],
      configuredServiceAreaCodes: ['kathmandu'],
      riderEligible: true,
    }),
    {
      productEligible: true,
      serviceAreaEligible: true,
      riderEligible: true,
      required: true,
      assignmentBlocked: false,
      reason: 'eligible',
    },
  );
  assert.equal(
    evaluateOpenBoxEligibility({
      productCodes: ['clay'],
      serviceAreaCode: 'kathmandu',
      configuredProductCodes: ['clay'],
      configuredServiceAreaCodes: ['kathmandu'],
      riderEligible: false,
    }).assignmentBlocked,
    true,
  );
  assert.equal(
    evaluateOpenBoxEligibility({
      productCodes: ['cotton'],
      serviceAreaCode: 'kathmandu',
      configuredProductCodes: ['clay'],
      configuredServiceAreaCodes: ['kathmandu'],
      riderEligible: false,
    }).required,
    false,
  );
});

void test('next-business-day remittance uses the configured Kathmandu operating calendar and cutoff', () => {
  // Friday 18 September 2026 16:00 in Kathmandu. Saturday is excluded.
  const friday = Date.parse('2026-09-18T10:15:00.000Z');
  assert.equal(
    new Date(addKathmanduBusinessDays(friday, 1, financePolicy)).toISOString(),
    '2026-09-20T11:15:00.000Z',
  );
  const withHoliday = {
    ...financePolicy,
    holidayDates: ['2026-09-20'],
  };
  assert.equal(
    new Date(addKathmanduBusinessDays(friday, 1, withHoliday)).toISOString(),
    '2026-09-21T11:15:00.000Z',
  );
});

void test('rider compensation is a separate fixed simulated trip ledger', () => {
  assert.equal(riderCompensationForOutcome(financePolicy, 'completed'), 10_000);
  assert.equal(riderCompensationForOutcome(financePolicy, 'failed'), 5_000);
  assert.equal(riderCompensationForOutcome(financePolicy, 'return'), 7_500);
});
