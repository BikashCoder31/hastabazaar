import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBusinessSettingDefinition,
  validateBusinessSettingValue,
} from '../lib/configuration/definitions';

void test('rider holiday settings reject impossible calendar dates', () => {
  const policy = getBusinessSettingDefinition(
    'rider_finance_policy',
  ).defaultValue;
  for (const date of ['2026-02-30', '2025-02-29', '2026-04-31']) {
    assert.throws(
      () =>
        validateBusinessSettingValue('rider_finance_policy', {
          ...policy,
          holidayDates: [date],
        }),
      /valid YYYY-MM-DD dates/,
      date,
    );
  }
});

void test('rider holiday settings preserve valid leap days and reject duplicate dates', () => {
  const policy = getBusinessSettingDefinition(
    'rider_finance_policy',
  ).defaultValue;
  const dates = ['2024-02-29', '2026-10-19'];
  const result = validateBusinessSettingValue('rider_finance_policy', {
    ...policy,
    holidayDates: dates,
  });
  assert.deepEqual(result.holidayDates, dates);
  assert.throws(
    () =>
      validateBusinessSettingValue('rider_finance_policy', {
        ...policy,
        holidayDates: ['2026-10-19', '2026-10-19'],
      }),
    /duplicate/,
  );
});
