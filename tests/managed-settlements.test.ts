import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { nextPayoutProcessingAt } from '../lib/db/repositories/managed-settlements';

function kathmanduTime(isoWithoutOffset: string): number {
  return Date.parse(`${isoWithoutOffset}+05:45`);
}

void test('Wednesday processing includes eligibility through Tuesday 17:00 Kathmandu', () => {
  const beforeCutoff = nextPayoutProcessingAt({
    eligibleAt: kathmanduTime('2026-09-22T16:59:59'),
    processingWeekday: 'wednesday', cutoffWeekday: 'tuesday', cutoffLocalTime: '17:00',
  });
  const afterCutoff = nextPayoutProcessingAt({
    eligibleAt: kathmanduTime('2026-09-22T17:00:01'),
    processingWeekday: 'wednesday', cutoffWeekday: 'tuesday', cutoffLocalTime: '17:00',
  });
  assert.equal(beforeCutoff, kathmanduTime('2026-09-23T00:00:00'));
  assert.equal(afterCutoff, kathmanduTime('2026-09-30T00:00:00'));
});

void test('managed settlement implementation earns on delivered-and-paid without rider-remittance dependency', async () => {
  const source = await readFile('lib/db/repositories/managed-settlements.ts', 'utf8');
  const accrual = source.slice(source.indexOf('export async function accrueManagedEntitlements'), source.indexOf('export async function releaseManagedEligibility'));
  assert.match(accrual, /o\.status='delivered'/);
  assert.match(accrual, /o\.payment_status='paid'/);
  assert.doesNotMatch(accrual, /remitted_paisa/);
  assert.match(accrual, /riderRemittanceRequiredForEntitlement:false/);
});

void test('refunds append linked negative adjustments and payouts retain maker-checker separation', async () => {
  const source = await readFile('lib/db/repositories/managed-settlements.ts', 'utf8');
  assert.match(source, /refund_adjustment/);
  assert.match(source, /Refund adjustments cannot exceed the original eligible base/);
  assert.match(source, /preparedBy===options\.actorId/);
  assert.match(source, /different authorized reviewer/i);
  assert.doesNotMatch(source, /UPDATE managed_settlement_entries SET amount_paisa/);
});
