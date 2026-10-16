import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LoyaltyTerms } from '../lib/incentives/types';

const terms: LoyaltyTerms = {
  enabled: true,
  dailyPoints: 10,
  pointsPerBlock: 100,
  creditPaisaPerBlock: 1000,
  startsAt: Date.parse('2026-10-14T04:15:01.234Z'),
  endsAt: Date.parse('2026-11-14T04:15:23.456Z'),
  dailyBudgetPoints: 500,
  lifetimeBudgetPoints: 5000,
};

async function editor() {
  const loaded = await import('../components/admin/loyalty-terms-editor').catch(
    () => null,
  );
  assert.ok(
    loaded,
    'The loyalty editor must support readable amounts and a future earning estimate',
  );
  return loaded;
}

function formData(
  values: Record<string, string | boolean | readonly string[]>,
) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) for (const item of value) data.append(key, item);
    else if (value === true) data.set(key, 'on');
    else if (typeof value === 'string') data.set(key, value);
  }
  return data;
}

void test('loyalty draft submission converts NPR exactly while preserving unchanged original timestamps', async () => {
  const h = await editor();
  const values = h.loyaltyEditorValues(terms);
  assert.equal(values.creditPaisaPerBlock, '10.00');
  assert.equal(values.startsAt, '2026-10-14T10:00');
  assert.deepEqual(h.readTerms(formData({ ...values }), terms), terms);
  const changed = h.readTerms(
    formData({
      ...values,
      creditPaisaPerBlock: '12.29',
      startsAt: '2026-10-15T10:00',
    }),
    terms,
  );
  assert.equal(changed.creditPaisaPerBlock, 1229);
  assert.equal(changed.startsAt, Date.parse('2026-10-15T04:15:00Z'));
});

void test('weekly editor preserves seven awards, grace and exact immutable dates at submission', async () => {
  const h = await editor();
  const weekly = {
    ...terms,
    dailyPoints: 5,
    weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
    graceEnabled: true,
  };
  const values = h.loyaltyEditorValues(weekly);
  assert.equal(values.rewardMode, 'weekly');
  assert.deepEqual(values.weeklyPoints, [
    '5',
    '7',
    '9',
    '10',
    '11',
    '13',
    '15',
  ]);
  assert.equal(values.graceEnabled, true);
  assert.deepEqual(h.readTerms(formData({ ...values }), weekly), weekly);
  assert.deepEqual(
    h.readTerms(formData({ ...values, graceEnabled: false }), weekly),
    { ...weekly, graceEnabled: false },
  );
  const legacy = h.loyaltyEditorValues(terms);
  assert.equal(legacy.rewardMode, 'fixed');
  assert.deepEqual(legacy.weeklyPoints, [
    '5',
    '7',
    '9',
    '10',
    '11',
    '13',
    '15',
  ]);
  assert.equal(legacy.graceEnabled, false);
  assert.deepEqual(h.readTerms(formData({ ...legacy }), terms), terms);
});

void test('weekly submission rejects missing, duplicate, nonincreasing and unsafe awards', async () => {
  const h = await editor();
  const weekly = {
    ...terms,
    dailyPoints: 5,
    weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
    graceEnabled: false,
  };
  const values = h.loyaltyEditorValues(weekly);
  for (const weeklyPoints of [
    [],
    ['5', '7', '9', '10', '11', '13'],
    ['5', '7', '9', '10', '11', '13', '13'],
    ['5', '7', '9', '10', '11', '13', '15', '20'],
    ['5', '7', '9', '10', '11', '13', '1.5'],
    ['5', '7', '9', '10', '11', '13', String(Number.MAX_SAFE_INTEGER)],
  ])
    assert.throws(() =>
      h.readTerms(formData({ ...values, weeklyPoints }), weekly),
    );
  assert.throws(() =>
    h.readTerms(formData({ ...values, dailyBudgetPoints: '14' }), weekly),
  );
});

void test('weekly estimate reports one-cycle nominal value and compares the highest scheduled daily award to budget', async () => {
  const h = await editor();
  const weekly = {
    ...terms,
    dailyPoints: 5,
    weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
    graceEnabled: false,
  };
  const values = h.loyaltyEditorValues(weekly);
  const preview = h.loyaltyDraftPreview(
    values,
    { pointsPerBlock: 100, creditPaisaPerBlock: 1000 },
    '100',
    '30',
    1000,
  );
  assert.deepEqual(preview.forecast, {
    projectedPoints: 29200,
    estimatedValuePaisa: 292000,
    daysToRedemption: 11,
  });
  assert.equal(preview.cyclePoints, 70);
  assert.equal(preview.cycleValuePaisa, 700);
  assert.equal(preview.dailyForecastPoints, 1500);
  assert.equal(preview.dailyBudgetExceeded, true);
  assert.equal(preview.remainingLifetimePoints, 4000);
  assert.equal(preview.lifetimeBudgetExceeded, true);
});

void test('rendered weekly editor exposes seven labeled fields and an off-by-default grace control', async () => {
  const h = await editor();
  const html = renderToStaticMarkup(
    createElement(h.LoyaltyTermsEditor, {
      terms: {
        ...terms,
        dailyPoints: 5,
        weeklyPoints: [5, 7, 9, 10, 11, 13, 15],
        graceEnabled: false,
      },
      locked: { pointsPerBlock: 100, creditPaisaPerBlock: 1000 },
      rateLocked: true,
      issuedPoints: 0,
      disabled: false,
    }),
  );
  for (let day = 1; day <= 7; day++)
    assert.match(html, new RegExp(`Day ${day} points`));
  assert.match(html, /name="weeklyPoints"/);
  assert.match(html, /Grace period/);
  assert.match(
    html,
    /name="graceEnabled"[^>]*type="checkbox"|type="checkbox"[^>]*name="graceEnabled"/,
  );
  assert.doesNotMatch(html, /name="graceEnabled"[^>]*checked/);
  assert.match(html, /70/);
  assert.match(html, /7\.00/);
});

void test('loyalty NPR and Nepal-time controls retain strict financial validation', async () => {
  const h = await editor();
  const values = h.loyaltyEditorValues(terms);
  for (const changes of [
    { creditPaisaPerBlock: '1.001' },
    { creditPaisaPerBlock: '0' },
    { dailyPoints: '1.5' },
    { dailyBudgetPoints: '' },
    { lifetimeBudgetPoints: '9' },
    { startsAt: '2026-02-30T10:00' },
    { endsAt: '2026-10-13T10:00' },
    { creditPaisaPerBlock: '90071992547409.91', lifetimeBudgetPoints: '200' },
  ])
    assert.throws(() =>
      h.readTerms(formData({ ...values, ...changes }), terms),
    );
});

void test('unsaved loyalty values drive cost forecasts and remaining point budget comparisons', async () => {
  const h = await editor();
  const values = {
    ...h.loyaltyEditorValues(terms),
    dailyPoints: '20',
    creditPaisaPerBlock: '15.50',
  };
  const preview = h.loyaltyDraftPreview(values, null, '100', '30', 1000);
  assert.deepEqual(preview.forecast, {
    projectedPoints: 60000,
    estimatedValuePaisa: 930000,
    daysToRedemption: 5,
  });
  assert.equal(preview.dailyForecastPoints, 2000);
  assert.equal(preview.remainingLifetimePoints, 4000);
  assert.equal(preview.dailyBudgetExceeded, true);
  assert.equal(preview.lifetimeBudgetExceeded, true);
  assert.deepEqual(terms, {
    ...terms,
    dailyPoints: 10,
    creditPaisaPerBlock: 1000,
  });
});

void test('future loyalty estimates use the locked denomination during a retained older attempt', async () => {
  const h = await editor();
  const older = { ...terms, pointsPerBlock: 200, creditPaisaPerBlock: 3000 };
  const values = h.loyaltyEditorValues(older);
  const preview = h.loyaltyDraftPreview(
    values,
    { pointsPerBlock: 100, creditPaisaPerBlock: 1000 },
    '100',
    '30',
    0,
  );
  assert.deepEqual(preview.forecast, {
    projectedPoints: 30000,
    estimatedValuePaisa: 300000,
    daysToRedemption: 10,
  });
  assert.deepEqual(
    h.readTerms(formData({ ...values }), older),
    older,
    'Recovering the original attempt must preserve its original denomination',
  );
  assert.equal(values.creditPaisaPerBlock, '30.00');
});

void test('loyalty estimate rejects unsafe forecasts and does not invent finite budgets', async () => {
  const h = await editor();
  const values = {
    ...h.loyaltyEditorValues(terms),
    dailyBudgetPoints: '',
    lifetimeBudgetPoints: '',
  };
  const preview = h.loyaltyDraftPreview(values, null, '100', '30', 0);
  assert.equal(preview.remainingLifetimePoints, null);
  assert.equal(preview.dailyBudgetExceeded, false);
  assert.equal(preview.lifetimeBudgetExceeded, false);
  for (const [participants, days] of [
    ['0', '30'],
    ['100', '1.5'],
    [String(Number.MAX_SAFE_INTEGER), '30'],
  ]) {
    assert.throws(() =>
      h.loyaltyDraftPreview(values, null, participants, days, 0),
    );
  }
});

void test('rendered loyalty controls show NPR, Nepal minutes, locked fields and a separate estimate', async () => {
  const h = await editor();
  const html = renderToStaticMarkup(
    createElement(h.LoyaltyTermsEditor, {
      terms,
      locked: { pointsPerBlock: 100, creditPaisaPerBlock: 1000 },
      rateLocked: true,
      issuedPoints: 1000,
      disabled: false,
    }),
  );
  assert.match(html, /Credit per block \(NPR\)/);
  assert.match(
    html,
    /id="loyalty-creditPaisaPerBlock"[^>]*readOnly=""[^>]*value="10\.00"/,
  );
  assert.match(
    html,
    /id="loyalty-startsAt"[^>]*type="datetime-local"[^>]*step="60"[^>]*value="2026-10-14T10:00"/,
  );
  assert.match(html, /Expected daily participants/);
  assert.match(html, /Forecast days/);
  assert.match(html, /30,000/);
  assert.match(html, /3,000\.00/);
  assert.match(html, /10 days/);
});
